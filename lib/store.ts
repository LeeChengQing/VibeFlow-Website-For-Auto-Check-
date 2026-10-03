import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getPlanAmount, isPlan } from './plans';
import type { Order, Ticket } from './types';
export type { Order, Ticket } from './types';

const dbPath = process.env.LOCAL_DB_PATH || join(process.cwd(), '.local', 'vibeflow.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, reference TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, data TEXT NOT NULL);`);
const now = () => new Date().toISOString();
const token = () => randomBytes(32).toString('hex');
function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function decode<T>(row: unknown): T|undefined { return row ? JSON.parse((row as {data:string}).data) as T : undefined; }
function saveOrder(o: Order) { db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(o), o.id); return o; }
function saveTicket(t: Ticket) { db.prepare('UPDATE tickets SET data=? WHERE id=?').run(JSON.stringify(t), t.id); return t; }
export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new Error('INVALID_EMAIL');
  return value.trim().toLowerCase();
}
function text(value: unknown, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error('INVALID_TEXT');
  return value.trim();
}
export function createOrder(input: {plan:unknown; locale:unknown; period?:unknown}): Order {
  if (!isPlan(input.plan) || input.period === 'degree') throw new Error('INVALID_PLAN');
  const o: Order = { id:randomUUID(), token:token(), reference:`VF-${randomBytes(6).toString('hex').toUpperCase()}`, plan:input.plan, amount:getPlanAmount(input.plan), locale:input.locale==='en'?'en':'zh', email:'', status:'pending', createdAt:now(), paidAt:null, expiresAt:null, delivery:null, resends:0 };
  db.prepare('INSERT INTO orders (id,token,reference,data) VALUES (?,?,?,?)').run(o.id,o.token,o.reference,JSON.stringify(o));
  return o;
}
export function getOrder(accessToken: string) {
  const o=decode<Order>(db.prepare('SELECT data FROM orders WHERE token=?').get(accessToken));
  if(o?.expiresAt && new Date(o.expiresAt).getTime()<=Date.now()) o.delivery=null;
  return o;
}
export function listOrders() { return db.prepare('SELECT data FROM orders ORDER BY rowid DESC').all().map(row => decode<Order>(row)!); }
function orderById(id: string) { const o = decode<Order>(db.prepare('SELECT data FROM orders WHERE id=?').get(id)); if(!o) throw new Error('NOT_FOUND'); return o; }
function requireOrder(accessToken: string) { const o=getOrder(accessToken); if(!o) throw new Error('NOT_FOUND'); return o; }
export function completeOrder(accessToken: string, email: unknown): Order {
  const normalized=normalizeEmail(email);
  return transaction(() => {
    const o=requireOrder(accessToken);
    if(o.status==='paid') return o;
    if(o.status!=='pending') throw new Error('INVALID_STATE');
    if(Date.now() - new Date(o.createdAt).getTime() > 86400000) throw new Error('ORDER_EXPIRED');
    o.email=normalized; o.status='paid'; o.paidAt=now();
    o.expiresAt=new Date(Date.now()+7*86400000).toISOString();
    o.delivery=o.plan==='extension'?'LOCAL PREVIEW: a private ZIP download link would be delivered here. No real extension file is attached.':`DEMO-${randomBytes(8).toString('hex').toUpperCase()}`;
    return saveOrder(o);
  });
}
export function cancelOrder(accessToken: string) { return transaction(() => { const o=requireOrder(accessToken); if(o.status!=='pending') throw new Error('INVALID_STATE'); o.status='cancelled'; return saveOrder(o); }); }
export function refundOrder(id: string) { return transaction(() => { const o=orderById(id); if(o.status!=='paid') throw new Error('INVALID_STATE'); o.status='refunded'; o.delivery=null; o.expiresAt=null; return saveOrder(o); }); }
export function resendOrder(id: string, correctedEmail?: unknown) { return transaction(() => { const o=orderById(id); if(o.status!=='paid') throw new Error('INVALID_STATE'); if(correctedEmail) o.email=normalizeEmail(correctedEmail); o.resends++; o.expiresAt=new Date(Date.now()+7*86400000).toISOString(); return saveOrder(o); }); }
export function createTicket(input: {email:unknown; reference:unknown; subject:unknown; message:unknown; locale:unknown}): Ticket {
  const email=normalizeEmail(input.email); const reference=typeof input.reference==='string'?input.reference.trim().toUpperCase():'';
  if(reference) {
    const o=decode<Order>(db.prepare('SELECT data FROM orders WHERE reference=?').get(reference));
    if(!o || o.email!==email) throw new Error('ORDER_MISMATCH');
  }
  const t:Ticket={id:randomUUID(),token:token(),email,reference,subject:text(input.subject,2,120),locale:input.locale==='en'?'en':'zh',status:'open',createdAt:now(),messages:[{id:randomUUID(),author:'customer',body:text(input.message,5,4000),createdAt:now()}]};
  db.prepare('INSERT INTO tickets (id,token,data) VALUES (?,?,?)').run(t.id,t.token,JSON.stringify(t));
  return t;
}
export function getTicket(accessToken: string) { return decode<Ticket>(db.prepare('SELECT data FROM tickets WHERE token=?').get(accessToken)); }
export function listTickets() { return db.prepare('SELECT data FROM tickets ORDER BY rowid DESC').all().map(row=>decode<Ticket>(row)!); }
export function replyTicket(id: string, body:unknown, author:'admin'|'customer') { return transaction(() => {
  const t=decode<Ticket>(db.prepare('SELECT data FROM tickets WHERE id=?').get(id)); if(!t) throw new Error('NOT_FOUND');
  if(t.status==='closed') throw new Error('TICKET_CLOSED');
  t.messages.push({id:randomUUID(),author,body:text(body,1,4000),createdAt:now()}); return saveTicket(t);
}); }
export function closeTicket(id: string) { return transaction(() => { const t=decode<Ticket>(db.prepare('SELECT data FROM tickets WHERE id=?').get(id)); if(!t) throw new Error('NOT_FOUND'); t.status='closed'; return saveTicket(t); }); }
