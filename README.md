# FlowOps Gateway

Temporary deployment repository for the FlowOps AI execution gateway.

This service is designed for Railway and provides the execution-plane API used by the FlowOps Base44 control plane.

Core responsibilities:
- accept tenant-scoped process runs
- enforce approval pauses
- dispatch deterministic integration work to n8n
- dispatch AI reasoning steps to OpenAI
- emit signed lifecycle callbacks back to FlowOps

Railway should deploy from the repository root using the included Dockerfile and railway.toml.
