import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { db,seed,verifyPassword } from "./db.js";
import { auth,adminOnly,issueToken } from "./auth.js";
import { runOverdueScan } from "./automation.js";

seed();
const app=express();
app.use(express.json({limit:"1mb"}));
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname,"../public")));

const counts=()=>({
  users:db.prepare("SELECT count(*) n FROM users").get().n,
  profiles:db.prepare("SELECT count(*) n FROM profiles").get().n,
  user_roles:db.prepare("SELECT count(*) n FROM user_roles").get().n,
  projects:db.prepare("SELECT count(*) n FROM projects").get().n,
  tasks:db.prepare("SELECT count(*) n FROM tasks").get().n,
  activity_events:db.prepare("SELECT count(*) n FROM activity_events").get().n,
  automation_runs:db.prepare("SELECT count(*) n FROM automation_runs").get().n
});

app.get("/healthz",(req,res)=>res.json({status:"ok",source_builder:"replit",fixture:"deep-cert-v1"}));
app.post("/api/login",(req,res)=>{
  const {email,password}=req.body||{};
  const user=verifyPassword(String(email||""),String(password||""));
  if(!user) return res.status(401).json({error:"invalid_credentials"});
  res.json({access_token:issueToken(user.id),token_type:"bearer"});
});
app.get("/api/me",auth,(req,res)=>res.json(req.user));
app.get("/api/roles",auth,(req,res)=>{
  const rows=req.user.role==="admin"
    ?db.prepare("SELECT user_id,role FROM user_roles ORDER BY user_id").all()
    :db.prepare("SELECT user_id,role FROM user_roles WHERE user_id=?").all(req.user.id);
  res.json(rows);
});
app.get("/api/projects",auth,(req,res)=>res.json(db.prepare("SELECT * FROM projects ORDER BY id").all()));
app.post("/api/projects",auth,(req,res)=>{
  const id=crypto.randomUUID(), now=new Date().toISOString();
  db.prepare(`INSERT INTO projects(id,name,description,status,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id,String(req.body?.name||"Untitled"),String(req.body?.description||""),"planning",req.user.id,now,now);
  db.prepare(`INSERT INTO activity_events(id,entity_type,entity_id,event_type,actor_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(),"project",id,"created",req.user.id,"{}",now);
  res.status(201).json(db.prepare("SELECT * FROM projects WHERE id=?").get(id));
});
app.patch("/api/projects/:id",auth,(req,res)=>{
  const now=new Date().toISOString();
  const result=db.prepare("UPDATE projects SET name=COALESCE(?,name),description=COALESCE(?,description),status=COALESCE(?,status),updated_at=? WHERE id=?")
    .run(req.body?.name??null,req.body?.description??null,req.body?.status??null,now,req.params.id);
  if(!result.changes) return res.status(404).json({error:"not_found"});
  res.json(db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id));
});
app.delete("/api/projects/:id",auth,adminOnly,(req,res)=>{
  const result=db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  res.status(result.changes?204:404).end();
});

app.get("/api/tasks",auth,(req,res)=>res.json(db.prepare("SELECT * FROM tasks ORDER BY id").all()));
app.post("/api/tasks",auth,(req,res)=>{
  const id=crypto.randomUUID(), now=new Date().toISOString();
  db.prepare(`INSERT INTO tasks(id,project_id,title,status,priority,assignee_id,due_date,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id,req.body.project_id,String(req.body?.title||"Untitled"),"todo",req.body?.priority||"medium",req.user.id,req.body?.due_date||null,now,now);
  db.prepare(`INSERT INTO activity_events(id,entity_type,entity_id,event_type,actor_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(),"task",id,"created",req.user.id,"{}",now);
  res.status(201).json(db.prepare("SELECT * FROM tasks WHERE id=?").get(id));
});
app.patch("/api/tasks/:id",auth,(req,res)=>{
  const now=new Date().toISOString();
  const result=db.prepare("UPDATE tasks SET title=COALESCE(?,title),status=COALESCE(?,status),priority=COALESCE(?,priority),due_date=COALESCE(?,due_date),updated_at=? WHERE id=?")
    .run(req.body?.title??null,req.body?.status??null,req.body?.priority??null,req.body?.due_date??null,now,req.params.id);
  if(!result.changes) return res.status(404).json({error:"not_found"});
  res.json(db.prepare("SELECT * FROM tasks WHERE id=?").get(req.params.id));
});
app.delete("/api/tasks/:id",auth,adminOnly,(req,res)=>{
  const result=db.prepare("DELETE FROM tasks WHERE id=?").run(req.params.id);
  res.status(result.changes?204:404).end();
});
app.get("/api/activity",auth,(req,res)=>res.json(db.prepare("SELECT * FROM activity_events ORDER BY created_at,id").all()));
app.post("/api/automation/overdue-scan",auth,adminOnly,(req,res)=>res.json(runOverdueScan("admin_api")));
app.get("/api/migration-readiness",auth,(req,res)=>res.json({
  ready:true,
  source_builder:"replit",
  counts:counts(),
  identity:{current_user_id:req.user.id,current_role:req.user.role},
  authorization:{member_delete:false,admin_delete:true,role_visibility:"member_self_admin_all"},
  scheduled_jobs:["daily_overdue_scan"]
}));

cron.schedule("17 3 * * *",()=>runOverdueScan("node_cron"),{timezone:"UTC"});

const port=Number(process.env.PORT||3000);
app.listen(port,"0.0.0.0",()=>console.log(`replit-deep-cert listening on ${port}`));
