import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DB_PATH=process.env.DB_PATH || path.resolve("data/webcontainer-cert.json");
fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
const CREATED="2026-09-29T00:00:00.000Z";
export const IDS={
  ADMIN_ID:"00000000-0000-4000-8000-000000000001",
  MEMBER_ID:"00000000-0000-4000-8000-000000000002"
};
function blank(){return {users:[],profiles:[],user_roles:[],projects:[],tasks:[],activity_events:[],automation_runs:[]};}
function load(){try{return JSON.parse(fs.readFileSync(DB_PATH,"utf8"));}catch{return blank();}}
let state=load();
function save(){fs.writeFileSync(DB_PATH,JSON.stringify(state,null,2));}
function hashPassword(password,saltHex){return crypto.scryptSync(password,Buffer.from(saltHex,"hex"),64).toString("hex");}
function addUser(id,email,password,displayName,role){
  if(state.users.some(x=>x.id===id)) return;
  const salt=crypto.createHash("sha256").update("webcontainer-cert:"+id).digest("hex").slice(0,32);
  state.users.push({id,email,password_salt:salt,password_hash:hashPassword(password,salt),created_at:CREATED});
  state.profiles.push({id:"40000000-0000-4000-8000-"+id.slice(-12),user_id:id,display_name:displayName,created_at:CREATED});
  state.user_roles.push({id:"50000000-0000-4000-8000-"+id.slice(-12),user_id:id,role,created_at:CREATED});
}
export function seed(){
  addUser(IDS.ADMIN_ID,"cert-admin@example.test",process.env.CERT_ADMIN_PASSWORD||"WebContainer-Cert-Admin-2026!","Certification Admin","admin");
  addUser(IDS.MEMBER_ID,"cert-member@example.test",process.env.CERT_MEMBER_PASSWORD||"WebContainer-Cert-Member-2026!","Certification Member","member");
  for(let i=1;i<=5;i++){
    const id=`10000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
    if(!state.projects.some(x=>x.id===id)) state.projects.push({
      id,name:`Certification Project ${i}`,description:`Deterministic WebContainer fixture project ${i}`,
      status:i===5?"done":"active",owner_id:i%2?IDS.ADMIN_ID:IDS.MEMBER_ID,created_at:CREATED,updated_at:CREATED
    });
  }
  for(let i=1;i<=15;i++){
    const id=`20000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
    if(!state.tasks.some(x=>x.id===id)) state.tasks.push({
      id,project_id:`10000000-0000-4000-8000-${String(((i-1)%5)+1).padStart(12,"0")}`,
      title:`Certification Task ${i}`,status:i%5===0?"done":i%3===0?"in_progress":"todo",
      priority:i%4===0?"high":i%2===0?"medium":"low",
      assignee_id:i%2?IDS.MEMBER_ID:IDS.ADMIN_ID,due_date:i<=9?"2026-09-20":i<=12?"2026-10-15":null,
      created_at:CREATED,updated_at:CREATED
    });
  }
  const events=[
    ["30000000-0000-4000-8000-000000000001","project","10000000-0000-4000-8000-000000000001","created",IDS.ADMIN_ID],
    ["30000000-0000-4000-8000-000000000002","task","20000000-0000-4000-8000-000000000001","created",IDS.MEMBER_ID],
    ["30000000-0000-4000-8000-000000000003","task","20000000-0000-4000-8000-000000000003","status_changed",IDS.ADMIN_ID]
  ];
  for(const [id,entity_type,entity_id,event_type,actor_id] of events){
    if(!state.activity_events.some(x=>x.id===id)) state.activity_events.push({id,entity_type,entity_id,event_type,actor_id,detail:{seed:true},created_at:CREATED});
  }
  save();
}
export function counts(){return Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v.length]));}
export function getUser(id){
  const u=state.users.find(x=>x.id===id); if(!u)return null;
  const p=state.profiles.find(x=>x.user_id===id); const r=state.user_roles.find(x=>x.user_id===id);
  return {id:u.id,email:u.email,display_name:p?.display_name,role:r?.role};
}
export function verifyPassword(email,password){
  const row=state.users.find(x=>x.email===email); if(!row)return null;
  const actual=hashPassword(password,row.password_salt);
  return crypto.timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(row.password_hash,"hex"))?row:null;
}
export function list(name){return structuredClone(state[name]||[]);}
export function insert(name,row){state[name].push(row);save();return structuredClone(row);}
export function update(name,id,patch){
  const i=state[name].findIndex(x=>x.id===id); if(i<0)return null;
  state[name][i]={...state[name][i],...patch}; save(); return structuredClone(state[name][i]);
}
export function remove(name,id){
  const i=state[name].findIndex(x=>x.id===id); if(i<0)return false;
  if(name==="projects" && state.tasks.some(t=>t.project_id===id)) return false;
  state[name].splice(i,1); save(); return true;
}
export function findAutomation(job,runKey){return state.automation_runs.find(x=>x.job_name===job&&x.run_key===runKey)||null;}
