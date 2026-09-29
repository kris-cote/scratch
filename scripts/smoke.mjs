import fs from "node:fs";
import { spawn } from "node:child_process";

const db="/tmp/replit-cert-smoke.db";
try{fs.unlinkSync(db)}catch{}
const env={...process.env,PORT:"3107",DB_PATH:db,SESSION_SECRET:"smoke-only"};
const child=spawn(process.execPath,["src/server.js"],{env,stdio:["ignore","pipe","pipe"]});
let output=""; child.stdout.on("data",d=>output+=d); child.stderr.on("data",d=>output+=d);

const wait=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<30;i++){
  try{const r=await fetch("http://127.0.0.1:3107/healthz"); if(r.ok) break;}catch{}
  await wait(250);
}
async function login(email,password){
 const r=await fetch("http://127.0.0.1:3107/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
 if(!r.ok) throw new Error("login failed "+email);
 return (await r.json()).access_token;
}
async function api(path,token,opts={}){
 const r=await fetch("http://127.0.0.1:3107"+path,{...opts,headers:{...(opts.headers||{}),authorization:"Bearer "+token,"content-type":"application/json"}});
 const text=await r.text(); return {status:r.status,body:text?JSON.parse(text):null};
}
try{
 const admin=await login("cert-admin@example.test","Replit-Cert-Admin-2026!");
 const member=await login("cert-member@example.test","Replit-Cert-Member-2026!");
 const ready=await api("/api/migration-readiness",admin);
 if(ready.body.counts.users!==2||ready.body.counts.projects!==5||ready.body.counts.tasks!==15||ready.body.counts.activity_events!==3||ready.body.counts.automation_runs!==0) throw new Error("baseline counts mismatch");
 const ar=await api("/api/roles",admin), mr=await api("/api/roles",member);
 if(ar.body.length!==2||mr.body.length!==1) throw new Error("role visibility mismatch");
 const deny=await api("/api/projects/10000000-0000-4000-8000-000000000001",member,{method:"DELETE"});
 if(deny.status!==403) throw new Error("member delete was not denied");
 const scan1=await api("/api/automation/overdue-scan",admin,{method:"POST"});
 const scan2=await api("/api/automation/overdue-scan",admin,{method:"POST"});
 if(scan1.body.alreadyRan!==false||scan2.body.alreadyRan!==true||scan1.body.itemsScanned!==15) throw new Error("overdue idempotency failed");
 console.log(JSON.stringify({ok:true,baseline:ready.body.counts,admin_roles:ar.body.length,member_roles:mr.body.length,member_delete:deny.status,scan1:scan1.body,scan2:scan2.body},null,2));
 process.exitCode=0;
}catch(e){
 console.error(output);
 console.error(e);
 process.exitCode=1;
}finally{
 child.kill("SIGTERM");
}
