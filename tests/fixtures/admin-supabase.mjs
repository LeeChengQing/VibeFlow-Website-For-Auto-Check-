// Local REST fixture for dashboard browser tests. No real Supabase project is used.
import { createServer } from 'node:http';

let rows = [];
let failInsert = false;
let failRead = false;
const reset = () => {
  failInsert = false; failRead = false;
  rows = Array.from({ length: 32 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    key_hash: index.toString(16).padStart(64, '0'),
    plan_type: ['bundle', 'semester', 'yearly', 'internal_check'][index % 4],
    status: index < 24 ? 'available' : index < 30 ? 'redeemed' : 'revoked',
    buyer_email: index >= 24 ? 'buyer@example.com' : null,
    device_id: index >= 24 ? 'device-123' : null,
    redeemed_at: index >= 24 ? '2026-10-03T12:00:00Z' : null,
    created_at: new Date(Date.UTC(2026, 9, 3, 0, index)).toISOString(),
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
  if (url.pathname === '/__rows') return json(200, rows);
  if (url.pathname === '/rest/v1/rpc/revoke_activation_key' && request.method === 'POST') {
    if (request.headers.apikey !== 'test-service-role-only-credentials') return json(401, {});
    let body = ''; for await (const chunk of request) body += chunk;
    const { p_key_id } = JSON.parse(body);
    const key = rows.find(row => row.id === p_key_id);
    if (!key || key.status === 'revoked') return json(400, { message: 'KEY_NOT_AVAILABLE' });
    key.status = 'revoked';
    return json(200, null);
  }
  if (url.pathname !== '/rest/v1/activation_keys') return json(404, {});
  if (request.headers.apikey !== 'test-service-role-only-credentials') return json(401, { message: 'invalid credential' });
  if (request.method === 'POST') {
    let body = ''; for await (const chunk of request) body += chunk;
    const batch = JSON.parse(body);
    if (failInsert) return json(500, { message: 'private-database-error' });
    if (!Array.isArray(batch) || batch.some(row => !/^[a-f0-9]{64}$/.test(row.key_hash) ||
      !['bundle', 'semester', 'yearly', 'internal_check'].includes(row.plan_type)) ||
      new Set([...rows, ...batch].map(row => row.key_hash)).size !== rows.length + batch.length) {
      return json(409, { message: 'constraint violation' });
    }
    rows.push(...batch.map((row, index) => ({ ...row,
      id: `11111111-1111-4111-8111-${String(rows.length + index).padStart(12, '0')}`,
      created_at: new Date().toISOString(), buyer_email: null, device_id: null, redeemed_at: null,
    })));
    response.writeHead(201); return response.end();
  }
  if (failRead) return json(500, { message: 'private-database-error' });
  let result = rows.filter(row => ['plan_type', 'status'].every(field =>
    !url.searchParams.has(field) || url.searchParams.get(field) === `eq.${row[field]}`));
  result.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const count = result.length;
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = Number(url.searchParams.get('limit') || count);
  result = result.slice(offset, offset + limit);
  response.setHeader('Content-Range', `${offset}-${Math.max(offset, offset + result.length - 1)}/${count}`);
  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(request.method === 'HEAD' ? undefined : JSON.stringify(result));
}).listen(Number(process.env.ADMIN_FIXTURE_PORT || 54329), '127.0.0.1');
