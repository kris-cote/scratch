import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="FlowOps Gateway", version="0.1.0")

SERVICE_TOKEN = os.getenv("FLOWOPS_SERVICE_TOKEN", "")
N8N_BASE_URL = os.getenv("N8N_BASE_URL", "").rstrip("/")
N8N_API_KEY = os.getenv("N8N_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_auth(authorization: Optional[str]) -> None:
    if not SERVICE_TOKEN:
        return
    if authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


class Step(BaseModel):
    id: Optional[str] = None
    type: str
    name: str
    agent_id: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    requires_approval: bool = False


class ProcessDefinition(BaseModel):
    steps: List[Step] = Field(default_factory=list)


class StartRunRequest(BaseModel):
    process_run_id: str
    process_id: str
    organization_id: str
    workspace_id: Optional[str] = None
    definition: ProcessDefinition
    input: Dict[str, Any] = Field(default_factory=dict)
    callback_url: Optional[str] = None


class StartRunResponse(BaseModel):
    execution_id: str
    status: str


async def emit(callback_url: Optional[str], event: str, run: StartRunRequest, execution_id: str, payload: Dict[str, Any]):
    if not callback_url:
        return
    body = {
        "event_id": str(uuid.uuid4()),
        "event": event,
        "timestamp": now_iso(),
        "organization_id": run.organization_id,
        "workspace_id": run.workspace_id,
        "process_run_id": run.process_run_id,
        "execution_id": execution_id,
        "payload": payload,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            await client.post(callback_url, json=body)
        except Exception:
            pass


async def run_n8n(step: Step, run: StartRunRequest) -> Dict[str, Any]:
    webhook_path = step.config.get("webhook_path")
    if not N8N_BASE_URL or not webhook_path:
        return {"status": "skipped", "reason": "n8n not configured"}
    headers = {"content-type": "application/json"}
    if N8N_API_KEY:
        headers["x-n8n-api-key"] = N8N_API_KEY
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{N8N_BASE_URL}/{webhook_path.lstrip('/')}", headers=headers, json={
            "organization_id": run.organization_id,
            "workspace_id": run.workspace_id,
            "process_run_id": run.process_run_id,
            "input": run.input,
            "step": step.model_dump(),
        })
        r.raise_for_status()
        try:
            return r.json()
        except Exception:
            return {"text": r.text}


async def run_agent(step: Step, run: StartRunRequest) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        return {"status": "skipped", "reason": "OpenAI not configured"}
    prompt = step.config.get("prompt") or f"Execute the FlowOps process step: {step.name}"
    payload = {
        "model": step.config.get("model", "gpt-5-mini"),
        "input": [
            {"role": "system", "content": "You are an AI worker executing a business process step. Be concise, accurate, and do not claim to have taken external actions unless a tool actually did so."},
            {"role": "user", "content": f"{prompt}\n\nProcess input:\n{run.input}"},
        ],
    }
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.post("https://api.openai.com/v1/responses", headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }, json=payload)
        r.raise_for_status()
        data = r.json()
        return {"response_id": data.get("id"), "output_text": data.get("output_text", "")}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "flowops-gateway", "version": "0.1.0"}


@app.post("/v1/process-runs", response_model=StartRunResponse, status_code=202)
async def start_process_run(
    run: StartRunRequest,
    authorization: Optional[str] = Header(default=None),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    x_flowops_organization: Optional[str] = Header(default=None, alias="X-FlowOps-Organization"),
):
    require_auth(authorization)
    if x_flowops_organization and x_flowops_organization != run.organization_id:
        raise HTTPException(status_code=400, detail="Organization header/body mismatch")

    execution_id = idempotency_key or str(uuid.uuid4())
    await emit(run.callback_url, "run.started", run, execution_id, {"status": "running"})

    for index, step in enumerate(run.definition.steps):
        await emit(run.callback_url, "step.started", run, execution_id, {"index": index, "step": step.model_dump()})

        if step.requires_approval or step.type == "approval":
            await emit(run.callback_url, "approval.requested", run, execution_id, {"index": index, "step": step.model_dump()})
            return StartRunResponse(execution_id=execution_id, status="waiting_approval")

        try:
            if step.type == "n8n":
                result = await run_n8n(step, run)
            elif step.type == "ai_agent":
                result = await run_agent(step, run)
            elif step.type in {"human_task", "wait", "condition", "notification", "api"}:
                result = {"status": "placeholder", "type": step.type}
            else:
                raise ValueError(f"Unsupported step type: {step.type}")

            await emit(run.callback_url, "step.completed", run, execution_id, {"index": index, "step": step.model_dump(), "result": result})
        except Exception as exc:
            await emit(run.callback_url, "step.failed", run, execution_id, {"index": index, "step": step.model_dump(), "error": str(exc)})
            await emit(run.callback_url, "run.failed", run, execution_id, {"error": str(exc)})
            raise HTTPException(status_code=502, detail=f"Step failed: {step.name}")

    await emit(run.callback_url, "run.completed", run, execution_id, {"status": "completed"})
    return StartRunResponse(execution_id=execution_id, status="completed")