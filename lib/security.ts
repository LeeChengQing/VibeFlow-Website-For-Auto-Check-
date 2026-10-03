import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
export function localOnly(request: Request, mutate=false) {
  const url=new URL(request.url);
  // Next normalizes request.url internally; Host is the browser-facing authority.
  const actual=new URL(`${url.protocol}//${request.headers.get('host')||url.host}`);
  if(process.env.NODE_ENV==='production' || process.env.LOCAL_DEMO!=='true' || !['localhost','127.0.0.1','[::1]'].includes(actual.hostname)) throw new Error('LOCAL_ONLY');
  if(mutate && request.headers.get('origin')!==actual.origin) throw new Error('INVALID_ORIGIN');
}
function secret() { const s=process.env.LOCAL_ADMIN_PASSWORD; if(!s || s.length<12) throw new Error('ADMIN_NOT_CONFIGURED'); return s; }
export function verifyPassword(value: unknown) {
  if(typeof value!=='string') return false;
  const expected=Buffer.from(secret()); const actual=Buffer.from(value);
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
const sign=(value:string)=>createHmac('sha256',secret()).update(value).digest('hex');
export function newSession() { const expires=String(Date.now()+8*3600000); return `${expires}.${sign(expires)}`; }
export async function requireAdmin() {
  const value=(await cookies()).get('vf_admin')?.value || ''; const [expires,signature]=value.split('.');
  if(!expires || !signature || !/^\d+$/.test(expires) || Number(expires)<Date.now()) throw new Error('UNAUTHORIZED');
  const expected=Buffer.from(sign(expires)); const actual=Buffer.from(signature);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new Error('UNAUTHORIZED');
}
const attempts=new Map<string,{count:number; until:number}>();
export function rateLimit(request: Request, scope:string, limit=60) {
  // Local demo, single-process limit. Use a shared rate limiter when deploying cloud APIs.
  const key=`${scope}:${new URL(request.url).hostname}`; const item=attempts.get(key);
  if(!item || item.until<Date.now()) { attempts.set(key,{count:1,until:Date.now()+60000}); return; }
  if(++item.count>limit) throw new Error('RATE_LIMITED');
}
export function apiError(error: unknown) {
  const code=error instanceof Error?error.message:'SERVER_ERROR';
  const codes=['INVALID_EMAIL','INVALID_PLAN','INVALID_TEXT','INVALID_STATE','ORDER_MISMATCH','ORDER_EXPIRED','TICKET_CLOSED'];
  const status=code==='NOT_FOUND'?404:code==='UNAUTHORIZED'?401:code==='RATE_LIMITED'?429:['LOCAL_ONLY','INVALID_ORIGIN'].includes(code)?403:codes.includes(code)?400:500;
  return Response.json({error:status===500?'SERVER_ERROR':code},{status,headers:{'Cache-Control':'no-store'}});
}
