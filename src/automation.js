import crypto from "node:crypto";
import { list, insert, findAutomation } from "./db.js";

export function runOverdueScan(triggeredBy="api"){
  const runKey=new Date().toISOString().slice(0,10);
  const existing=findAutomation("daily_overdue_scan",runKey);
  if(existing) return {runKey,alreadyRan:true,itemsScanned:existing.items_scanned,itemsFlagged:existing.items_flagged};
  const tasks=list("tasks");
  const overdue=tasks.filter(t=>t.status!=="done"&&t.due_date&&t.due_date<runKey);
  const finished_at=new Date().toISOString();
  insert("automation_runs",{
    id:crypto.randomUUID(),job_name:"daily_overdue_scan",run_key:runKey,status:"success",
    items_scanned:tasks.length,items_flagged:overdue.length,detail:{triggered_by:triggeredBy},finished_at
  });
  insert("activity_events",{
    id:crypto.randomUUID(),entity_type:"automation_run",entity_id:"daily_overdue_scan",
    event_type:"automation",actor_id:null,
    detail:{run_key:runKey,items_scanned:tasks.length,items_flagged:overdue.length,triggered_by:triggeredBy},
    created_at:finished_at
  });
  return {runKey,alreadyRan:false,itemsScanned:tasks.length,itemsFlagged:overdue.length,overdueTaskIds:overdue.map(x=>x.id)};
}
