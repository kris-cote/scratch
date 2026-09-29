import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || path.resolve("data/replit-cert.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const MEMBER_ID = "00000000-0000-4000-8000-000000000002";
const CREATED = "2026-09-29T00:00:00.000Z";

function hashPassword(password, saltHex) {
  return crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}
function insertUser(id,email,password,displayName,role) {
  const salt = crypto.createHash("sha256").update("replit-cert:"+id).digest("hex").slice(0,32);
  db.prepare(`INSERT OR IGNORE INTO users(id,email,password_salt,password_hash,created_at) VALUES (?,?,?,?,?)`)
    .run(id,email,salt,hashPassword(password,salt),CREATED);
  const suffix=id.slice(-12);
  const profileId=`40000000-0000-4000-8000-${suffix}`;
  const roleId=`50000000-0000-4000-8000-${suffix}`;
  db.prepare(`INSERT OR IGNORE INTO profiles(id,user_id,display_name,created_at) VALUES (?,?,?,?)`)
    .run(profileId,id,displayName,CREATED);
  db.prepare(`INSERT OR IGNORE INTO user_roles(id,user_id,role,created_at) VALUES (?,?,?,?)`)
    .run(roleId,id,role,CREATED);
}

export function seed() {
  insertUser(ADMIN_ID,"cert-admin@example.test",process.env.CERT_ADMIN_PASSWORD || "Replit-Cert-Admin-2026!","Certification Admin","admin");
  insertUser(MEMBER_ID,"cert-member@example.test",process.env.CERT_MEMBER_PASSWORD || "Replit-Cert-Member-2026!","Certification Member","member");

  const p = db.prepare(`INSERT OR IGNORE INTO projects(id,name,description,status,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`);
  for (let i=1;i<=5;i++) {
    const id=`10000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
    p.run(id,`Certification Project ${i}`,`Deterministic Replit migration fixture project ${i}`,i===5?"done":"active",i%2?ADMIN_ID:MEMBER_ID,CREATED,CREATED);
  }

  const t = db.prepare(`INSERT OR IGNORE INTO tasks(id,project_id,title,status,priority,assignee_id,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  for (let i=1;i<=15;i++) {
    const id=`20000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
    const projectId=`10000000-0000-4000-8000-${String(((i-1)%5)+1).padStart(12,"0")}`;
    const status=i%5===0?"done":i%3===0?"in_progress":"todo";
    const priority=i%4===0?"high":i%2===0?"medium":"low";
    const assignee=i%2?MEMBER_ID:ADMIN_ID;
    const due=i<=9?"2026-09-20":i<=12?"2026-10-15":null;
    t.run(id,projectId,`Certification Task ${i}`,status,priority,assignee,due,CREATED,CREATED);
  }

  const a=db.prepare(`INSERT OR IGNORE INTO activity_events(id,entity_type,entity_id,event_type,actor_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`);
  a.run("30000000-0000-4000-8000-000000000001","project","10000000-0000-4000-8000-000000000001","created",ADMIN_ID,JSON.stringify({seed:true}),CREATED);
  a.run("30000000-0000-4000-8000-000000000002","task","20000000-0000-4000-8000-000000000001","created",MEMBER_ID,JSON.stringify({seed:true}),CREATED);
  a.run("30000000-0000-4000-8000-000000000003","task","20000000-0000-4000-8000-000000000003","status_changed",ADMIN_ID,JSON.stringify({from:"todo",to:"in_progress",seed:true}),CREATED);
}

export function verifyPassword(email,password) {
  const row=db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if(!row) return null;
  const actual=hashPassword(password,row.password_salt);
  const ok=crypto.timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(row.password_hash,"hex"));
  return ok?row:null;
}
export const IDS={ADMIN_ID,MEMBER_ID};
