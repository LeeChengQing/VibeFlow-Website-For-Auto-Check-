import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {loadServerModule} from './helpers/server-module';
import {createClient} from '@supabase/supabase-js';

function setup(authorized=true,fail=false){
  const calls: {name:string;args:Record<string,unknown>}[]=[];
  const admin=loadServerModule<typeof import('../lib/plugin-license-admin')>('lib/plugin-license-admin.ts',{
    '@/lib/admin-auth':{requireAdminSession:async()=>{if(!authorized)throw Error('UNAUTHORIZED');}},
    '@supabase/supabase-js':{createClient:()=>{calls.push({name:'client',args:{}});return {rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:{ok:!fail,license_id:'11111111-1111-4111-8111-111111111111'},error:fail?{message:'PRIVATE_DB_DETAIL'}:null};}};}},
  },{process:{env:{NODE_ENV:'test',PLUGIN_AUTH_SUPABASE_URL:'https://qckpwckfukyurkobrsig.supabase.co',PLUGIN_AUTH_SUPABASE_SERVICE_ROLE_KEY:'server-test-only'}}});
  return {admin,calls};
}
const input={plan:'trial',expiresAt:'2030-01-01T00:00:00Z',maxDevices:1,note:'testing'};
test('plugin signing generates canonical 160-bit keys and only persists their hash',async()=>{
  const {admin,calls}=setup();const keys=new Set();
  for(let i=0;i<20;i++){
    const result=await admin.issuePluginLicense(input);assert.ok('code' in result);if(!('code' in result))return;
    assert.match(result.code,/^AC-LIC-(?:[A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);keys.add(result.code);
    const call=calls.at(-1)!;assert.equal(call.name,'issue_plugin_license');assert.equal(call.args.p_key_hash,createHash('sha256').update(result.code).digest('hex'));
    assert.ok(!JSON.stringify(calls).includes(result.code));assert.equal(call.args.p_max_devices,1);
  }
  assert.equal(keys.size,20);
});
test('authorization and validation precede DB access',async()=>{
  const denied=setup(false);await assert.rejects(denied.admin.issuePluginLicense(input),/UNAUTHORIZED/);assert.equal(denied.calls.length,0);
  for(const value of [{...input,plan:'bundle'},{...input,maxDevices:0},{...input,maxDevices:101},{...input,maxDevices:'2'},{...input,expiresAt:'invalid'},{...input,expiresAt:'2000-01-01'},{...input,note:'x'.repeat(501)}]){
    const {admin,calls}=setup();await assert.rejects(admin.issuePluginLicense(value as never),/INVALID_PARAMETERS/);assert.equal(calls.length,0);
  }
});
test('lifetime can omit expiration; failed issuance never exposes code or DB detail',async()=>{
  const {admin,calls}=setup();await admin.issuePluginLicense({...input,plan:'lifetime_license',expiresAt:''});assert.equal(calls.at(-1)!.args.p_expires_at,null);
  const failed=setup(true,true);await assert.rejects(failed.admin.issuePluginLicense(input),/^Error: PLUGIN_WRITE_UNAVAILABLE$/);
});
test('revocation/release validate identifiers, require notes and use reviewed RPCs',async()=>{
  const {admin,calls}=setup();const id='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222';
  await admin.revokePluginLicense(id,'debug');assert.equal(calls.at(-1)!.name,'revoke_plugin_license');
  await admin.releasePluginDevice(id,device,'new computer');assert.equal(calls.at(-1)!.name,'release_plugin_license_device');
  for(const args of [[id,'bad','reason'],[id,device,''],['bad',device,'reason']])await assert.rejects(admin.releasePluginDevice(...args as [string,string,string]),/INVALID_PARAMETERS/);
  const denied=setup(false);await assert.rejects(denied.admin.revokePluginLicense(id,'debug'),/UNAUTHORIZED/);assert.equal(denied.calls.length,0);
});
test('ledger uses bounded queries, strips full hashes and ignores malformed filters',async()=>{
  const requests:URL[]=[];
  const client=createClient('https://qckpwckfukyurkobrsig.supabase.co','test-only',{global:{fetch:async(input,init)=>{
    const url=new URL(String(input));requests.push(url);
    const row={id:'11111111-1111-4111-8111-111111111111',license_key_hash:'a'.repeat(64),plan:'trial',status:'active',max_devices:1,expires_at:'2020-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',note:'note',plugin_license_activations:[],plugin_license_events:[]};
    return new Response(init?.method==='HEAD'?null:JSON.stringify([row]),{headers:{'Content-Type':'application/json','Content-Range':'0-0/26'}});
  }}});
  const admin=loadServerModule<typeof import('../lib/plugin-license-admin')>('lib/plugin-license-admin.ts',{'@/lib/admin-auth':{requireAdminSession:async()=>{}},'@supabase/supabase-js':{createClient:()=>client}},{process:{env:{PLUGIN_AUTH_SUPABASE_URL:'https://qckpwckfukyurkobrsig.supabase.co',PLUGIN_AUTH_SUPABASE_SERVICE_ROLE_KEY:'test-only'}}});
  const result=await admin.getPluginLicenseData({plan:'__proto__',status:['active'],page:'999'});
  assert.equal(result.page,2);assert.equal(result.plan,'');assert.equal(result.status,'');assert.equal(result.licenses[0].status,'expired');
  assert.equal(result.licenses[0].identifier,'a'.repeat(12));assert.ok(!JSON.stringify(result).includes('a'.repeat(64)));
  const list=requests.find(url=>url.searchParams.has('offset'))!;assert.equal(list.searchParams.get('offset'),'25');assert.equal(list.searchParams.get('limit'),'25');assert.equal(list.searchParams.get('plugin_license_events.limit'),'20');
  assert.ok(requests.every(url=>!url.toString().includes('__proto__')));
});
test('wrong authorization database fails closed even when commerce configuration is present',async()=>{
  let created=false;
  const admin=loadServerModule<typeof import('../lib/plugin-license-admin')>('lib/plugin-license-admin.ts',{'@/lib/admin-auth':{requireAdminSession:async()=>{}},'@supabase/supabase-js':{createClient:()=>{created=true;}}},{process:{env:{PLUGIN_AUTH_SUPABASE_URL:'https://wrong.supabase.co',PLUGIN_AUTH_SUPABASE_SERVICE_ROLE_KEY:'test',SUPABASE_URL:'https://qckpwckfukyurkobrsig.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}}});
  await assert.rejects(admin.issuePluginLicense(input),/PLUGIN_ADMIN_NOT_CONFIGURED/);assert.equal(created,false);
});
