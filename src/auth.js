import crypto from "node:crypto";
import { getUser } from "./db.js";
const SECRET=process.env.SESSION_SECRET || "isolated-webcontainer-deep-cert-fixture-only";
function b64(v){return Buffer.from(v).toString("base64url");}
function sign(v){return crypto.createHmac("sha256",SECRET).update(v).digest("base64url");}
export function issueToken(userId){const body=b64(JSON.stringify({sub:userId,iat:Date.now()}));return body+"."+sign(body);}
export function readToken(token){
  if(!token||!token.includes("."))return null;
  const [body,sig]=token.split(".");const expected=sign(body);
  if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  try{return JSON.parse(Buffer.from(body,"base64url").toString("utf8"));}catch{return null;}
}
export function auth(req,res,next){
  const raw=req.headers.authorization||"";const claims=readToken(raw.startsWith("Bearer ")?raw.slice(7):"");
  if(!claims?.sub)return res.status(401).json({error:"unauthorized"});
  const user=getUser(claims.sub);if(!user)return res.status(401).json({error:"unauthorized"});
  req.user=user;next();
}
export function adminOnly(req,res,next){if(req.user?.role!=="admin")return res.status(403).json({error:"admin_required"});next();}
