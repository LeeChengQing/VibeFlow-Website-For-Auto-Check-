// Local REST fixture for dashboard browser tests. No real Supabase project is used.
import { createServer } from 'node:http';
import {randomUUID} from 'node:crypto';

let rows = [];
let licenses = [];
let failInsert = false;
let failRead = false;
let pluginRows=[];
const reset = () => {
  failInsert = false; failRead = false;
  pluginRows=Array.from({length:27},(_,index)=>({id:`44444444-4444-4444-8444-${String(index).padStart(12,'0')}`,license_key_hash:index.toString(16).padStart(64,'0'),plan:'trial',status:'active',max_devices:1,expires_at:'2030-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',note:`Fixture license ${index}`,plugin_license_activations:index===26?[{device_id:'55555555-5555-4555-8555-555555555555',activated_at:'2026-01-01T00:00:00Z'}]:[],plugin_license_events:[]}));
  rows = Array.from({ length: 32 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    key_hash: index.toString(16).padStart(64, '0'),
    plan_type: ['bundle', 'semester', 'yearly', 'internal_check'][index % 4],
    status: index < 24 ? 'available' : 'assigned',
  }));
  licenses = rows.slice(24).map((row, index) => ({
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    order_id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    inventory_id: row.id,
    plan_type: row.plan_type,
    buyer_email: 'buyer@example.com',
    device_id: index === 0 ? null : 'device-123',
    activated_at: index === 0 ? null : '2026-10-03T12:00:00Z',
    status: index < 6 ? 'active' : 'revoked',
  }));
};
reset();
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:54329');
  const json = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(data));
  };
  if (url.pathname === '/health') return json(200, { ok: true });
  if (url.pathname === '/__reset') { reset(); return json(200, { ok: true }); }
  if (url.pathname === '/__fail-insert') { failInsert = true; return json(200, { ok: true }); }
  if (url.pathname === '/__fail-read') { failRead = true; return json(200, { ok: true }); }
  const joined = row => ({ ...row, issued_licenses: licenses.find(license => license.inventory_id === row.id) ?? null });
  if (url.pathname === '/__rows') return json(200, rows.map(joined));
  if (url.pathname === '/__licenses') return json(200, licenses);
  if(url.pathname==='/__plugin-rows')return json(200,pluginRows);
  if(url.pathname==='/rest/v1/plugin_licenses'||url.pathname.startsWith('/rest/v1/rpc/')){
    if(request.headers.apikey!=='test-service-role-only-credentials')return json(401,{});
    if(url.pathname.includes('/rpc/')){
      let body='';for await(const chunk of request)body+=chunk;const args=JSON.parse(body);
      if(failInsert)return json(500,{message:'private-plugin-db-error'});
      if(url.pathname.endsWith('/issue_plugin_license')){
        if(!/^[a-f0-9]{64}$/.test(args.p_key_hash)||Object.keys(args).some(key=>!['p_key_hash','p_plan','p_expires_at','p_max_devices','p_note'].includes(key)))return json(400,{});
        const row={id:randomUUID(),license_key_hash:args.p_key_hash,plan:args.p_plan,status:'active',expires_at:args.p_expires_at,max_devices:args.p_max_devices,note:args.p_note,created_at:new Date().toISOString(),plugin_license_activations:[],plugin_license_events:[{event_type:'issued',device_id:null,note:args.p_note,created_at:new Date().toISOString()}]};pluginRows.unshift(row);return json(200,{ok:true,license_id:row.id});
      }
      const row=pluginRows.find(row=>row.id===args.p_license_id);if(!row)return json(200,{ok:false});
      if(url.pathname.endsWith('/revoke_plugin_license')){row.status='revoked';row.plugin_license_events.push({event_type:'revoked',note:args.p_note,device_id:null,created_at:new Date().toISOString()});return json(200,{ok:true});}
      if(url.pathname.endsWith('/release_plugin_license_device')){row.plugin_license_activations=row.plugin_license_activations.filter(d=>d.device_id!==args.p_device_id);row.plugin_license_events.push({event_type:'unbound',device_id:args.p_device_id,note:args.p_note,created_at:new Date().toISOString()});return json(200,{ok:true});}
      return json(404,{});
    }
    if(failRead)return json(500,{message:'private-plugin-db-error'});
    let result=pluginRows.filter(row=>(!url.searchParams.has('plan')||url.searchParams.get('plan')===`eq.${row.plan}`)&&(!url.searchParams.has('status')||url.searchParams.get('status')===`eq.${row.status}`||url.searchParams.get('status')===`neq.revoked`&&row.status!=='revoked'));
    const count=result.length;result.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||25);result=result.slice(offset,offset+limit);
    response.setHeader('Content-Range',`${offset}-${offset+result.length-1}/${count}`);response.setHeader('Content-Type','application/json');response.writeHead(200);return response.end(request.method==='HEAD'?undefined:JSON.stringify(result));
  }
  const table = url.pathname.slice('/rest/v1/'.length);
  if (!['key_inventory', 'issued_licenses'].includes(table) || !url.pathname.startsWith('/rest/v1/')) return json(404, {});
  if (request.headers.apikey !== 'test-service-role-only-credentials') return json(401, { message: 'invalid credential' });
  if (table === 'issued_licenses' && request.method === 'PATCH') {
    let body = ''; for await (const chunk of request) body += chunk;
    const patch = JSON.parse(body);
    if (patch.status !== 'revoked' || Object.keys(patch).length !== 1 ||
        url.searchParams.get('status') !== 'eq.active') return json(400, { message: 'invalid revocation' });
    const license = licenses.find(row => `eq.${row.id}` === url.searchParams.get('id') && row.status === 'active');
    if (!license) return json(200, []);
    license.status = 'revoked';
    return json(200, [{ id: license.id }]);
  }
  if (table === 'key_inventory' && request.method === 'POST') {
    let body = ''; for await (const chunk of request) body += chunk;
    const batch = JSON.parse(body);
    if (failInsert) return json(500, { message: 'private-database-error' });
    if (!Array.isArray(batch) || batch.some(row => !/^[a-f0-9]{64}$/.test(row.key_hash) ||
      !['bundle', 'semester', 'yearly', 'internal_check'].includes(row.plan_type) ||
      row.status !== 'available' || Object.keys(row).some(field => !['key_hash', 'plan_type', 'status'].includes(field))) ||
      new Set([...rows, ...batch].map(row => row.key_hash)).size !== rows.length + batch.length) {
      return json(409, { message: 'constraint violation' });
    }
    rows.push(...batch.map((row, index) => ({ ...row,
      id: `11111111-1111-4111-8111-${String(rows.length + index).padStart(12, '0')}`,
    })));
    response.writeHead(201); return response.end();
  }
  if (!['GET', 'HEAD'].includes(request.method)) return json(405, {});
  if (failRead) return json(500, { message: 'private-database-error' });
  const select = url.searchParams.get('select');
  if (select !== 'id' && (table !== 'key_inventory' || select !== 'id,key_hash,plan_type,status,issued_licenses(id,buyer_email,device_id,activated_at,status)')) {
    return json(400, { message: 'unknown column or relationship' });
  }
  if (url.searchParams.has('order') && url.searchParams.get('order') !== 'id.desc') return json(400, { message: 'unknown order column' });
  let result = (table === 'key_inventory' ? rows : licenses).filter(row => ['plan_type', 'status'].every(field =>
    !url.searchParams.has(field) || url.searchParams.get(field) === `eq.${row[field]}`));
  result.sort((a, b) => b.id.localeCompare(a.id));
  const count = result.length;
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = Number(url.searchParams.get('limit') || count);
  result = result.slice(offset, offset + limit);
  result = select === 'id' ? result.map(row => ({ id: row.id })) : result.map(row => {
    const { issued_licenses, ...inventory } = joined(row);
    return { ...inventory, issued_licenses: issued_licenses && {
      id: issued_licenses.id, buyer_email: issued_licenses.buyer_email,
      device_id: issued_licenses.device_id, activated_at: issued_licenses.activated_at, status: issued_licenses.status,
    } };
  });
  response.setHeader('Content-Range', `${offset}-${Math.max(offset, offset + result.length - 1)}/${count}`);
  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(request.method === 'HEAD' ? undefined : JSON.stringify(result));
}).listen(Number(process.env.ADMIN_FIXTURE_PORT || 54329), '127.0.0.1');
