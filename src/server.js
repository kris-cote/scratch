import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { seed,verifyPassword,counts,list,insert,update,remove } from "./db.js";
import { auth,adminOnly,issueToken } from "./auth.js";
import { runOverdueScan } from "./automation.js";

seed();
const app=express();
app.use(express.json({limit:"1mb"}));
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname,"../public")));

app.get("/healthz",(req,res)=>res.json({status:"ok",source_builder:"webcontainer",fixture:"deep-cert-v1"}));
app.post("/api/login",(req,res)=>{
  const {email,password}=req.body||{};
  const user=verifyPassword(String(email||""),String(password||""));
  if(!user)return res.status(401).json({error:"invalid_credentials"});
  res.json({access_token:issueToken(user.id),token_type:"bearer"});
});
app.get("/api/me",auth,(req,res)=>res.json(req.user));
app.get("/api/roles",auth,(req,res)=>{
  const all=list("user_roles").sort((a,b)=>a.user_id.localeCompare(b.user_id));
  res.json(req.user.role==="admin"?all:all.filter(x=>x.user_id===req.user.id));
});
app.get("/api/projects",auth,(req,res)=>res.json(list("projects").sort((a,b)=>a.id.localeCompare(b.id))));
app.post("/api/projects",auth,(req,res)=>{
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const row=insert("projects",{id,name:String(req.body?.name||"Untitled"),description:String(req.body?.description||""),status:"planning",owner_id:req.user.id,created_at:now,updated_at:now});
  insert("activity_events",{id:crypto.randomUUID(),entity_type:"project",entity_id:id,event_type:"created",actor_id:req.user.id,detail:{},created_at:now});
  res.status(201).json(row);
});
app.patch("/api/projects/:id",auth,(req,res)=>{
  const row=update("projects",req.params.id,{...(req.body?.name!==undefined?{name:String(req.body.name)}:{}),...(req.body?.description!==undefined?{description:String(req.body.description)}:{}),...(req.body?.status!==undefined?{status:String(req.body.status)}:{}),updated_at:new Date().toISOString()});
  if(!row)return res.status(404).json({error:"not_found"});res.json(row);
});
app.delete("/api/projects/:id",auth,adminOnly,(req,res)=>{
  const ok=remove("projects",req.params.id);if(!ok)return res.status(409).json({error:"not_found_or_has_tasks"});res.status(204).end();
});
app.get("/api/tasks",auth,(req,res)=>res.json(list("tasks").sort((a,b)=>a.id.localeCompare(b.id))));
app.post("/api/tasks",auth,(req,res)=>{
  const projectId=String(req.body?.project_id||"");if(!list("projects").some(x=>x.id===projectId))return res.status(400).json({error:"invalid_project"});
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const row=insert("tasks",{id,project_id:projectId,title:String(req.body?.title||"Untitled"),status:"todo",priority:req.body?.priority||"medium",assignee_id:req.user.id,due_date:req.body?.due_date||null,created_at:now,updated_at:now});
  insert("activity_events",{id:crypto.randomUUID(),entity_type:"task",entity_id:id,event_type:"created",actor_id:req.user.id,detail:{},created_at:now});
  res.status(201).json(row);
});
app.patch("/api/tasks/:id",auth,(req,res)=>{
  const patch={updated_at:new Date().toISOString()};
  for(const k of ["title","status","priority","due_date"])if(req.body?.[k]!==undefined)patch[k]=req.body[k];
  const row=update("tasks",req.params.id,patch);if(!row)return res.status(404).json({error:"not_found"});res.json(row);
});
app.delete("/api/tasks/:id",auth,adminOnly,(req,res)=>{
  const ok=remove("tasks",req.params.id);res.status(ok?204:404).end();
});
app.get("/api/activity",auth,(req,res)=>res.json(list("activity_events").sort((a,b)=>(a.created_at+a.id).localeCompare(b.created_at+b.id))));
app.post("/api/automation/overdue-scan",auth,adminOnly,(req,res)=>res.json(runOverdueScan("admin_api")));
app.get("/api/migration-readiness",auth,(req,res)=>res.json({
  ready:true,source_builder:"webcontainer",counts:counts(),
  identity:{current_user_id:req.user.id,current_role:req.user.role},
  authorization:{member_delete:false,admin_delete:true,role_visibility:"member_self_admin_all"},
  scheduled_jobs:[{name:"daily_overdue_scan",schedule:"17 3 * * *",timezone:"UTC"}],
  state_storage:"portable_json_file",
  production_cutover_authorized:false
}));
cron.schedule("17 3 * * *",()=>runOverdueScan("node_cron"),{timezone:"UTC"});
const port=Number(process.env.PORT||3000);
app.listen(port,"0.0.0.0",()=>console.log(`webcontainer-deep-cert listening on ${port}`));
