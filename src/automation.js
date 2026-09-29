import crypto from "node:crypto";
import { db } from "./db.js";

export function runOverdueScan(triggeredBy="api"){
  const runKey=new Date().toISOString().slice(0,10);
  const existing=db.prepare("SELECT * FROM automation_runs WHERE job_name=? AND run_key=?").get("daily_overdue_scan",runKey);
  if(existing) return {runKey,alreadyRan:true,itemsScanned:existing.items_scanned,itemsFlagged:existing.items_flagged};

  const tasks=db.prepare("SELECT id,status,due_date FROM tasks").all();
  const overdue=tasks.filter(t=>t.status!=="done" && t.due_date && t.due_date<runKey);
  const tx=db.transaction(()=>{
    db.prepare(`INSERT INTO automation_runs(id,job_name,run_key,status,items_scanned,items_flagged,detail,finished_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
        crypto.randomUUID(),"daily_overdue_scan",runKey,"success",tasks.length,overdue.length,
        JSON.stringify({triggered_by:triggeredBy}),new Date().toISOString()
      );
    db.prepare(`INSERT INTO activity_events(id,entity_type,entity_id,event_type,actor_id,detail,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(
        crypto.randomUUID(),"automation_run","daily_overdue_scan","automation",null,
        JSON.stringify({run_key:runKey,items_scanned:tasks.length,items_flagged:overdue.length,triggered_by:triggeredBy}),
        new Date().toISOString()
      );
  });
  tx();
  return {runKey,alreadyRan:false,itemsScanned:tasks.length,itemsFlagged:overdue.length,overdueTaskIds:overdue.map(x=>x.id)};
}
