import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration='supabase/migrations/20261103142304_plugin_license_admin_device_release.sql';
test('release frees a seat and audits once without changing existing device-status RPC behavior',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema private; create table public.devices(id uuid primary key);');
    await db.exec(readFileSync('tests/fixtures/plugin-authorization-baseline.sql','utf8'));await db.exec(readFileSync(migration,'utf8'));
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',hash='a'.repeat(64);
    await db.query('insert into public.devices values ($1),($2)',[a,b]);
    const issue=await db.query<{result:{license_id:string}}>("select public.issue_plugin_license($1,'lifetime_license',null,1,'test') as result",[hash]);const id=issue.rows[0].result.license_id;
    const activate=async(device:string)=>(await db.query<{r:{ok:boolean}}>('select public.activate_plugin_license_for_device($1,$2) r',[hash,device])).rows[0].r;
    const state=async(device:string)=>(await db.query<{r:{licensed:boolean;reason?:string}}>('select public.validate_device_plugin_license($1) r',[device])).rows[0].r;
    assert.equal((await activate(a)).ok,true);assert.equal((await activate(b)).ok,false);
    await db.query('select public.release_plugin_license_device($1,$2,$3)',[id,a,'replacement']);
    assert.deepEqual(await state(a),{licensed:false,reason:'not_activated'});
    await db.query('select public.release_plugin_license_device($1,$2,$3)',[id,a,'repeat']);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from public.plugin_license_events where event_type='unbound'")).rows[0].n,1);
    assert.equal((await activate(b)).ok,true);assert.equal((await activate(a)).ok,false);assert.equal((await state(b)).licensed,true);
    await db.query('select public.release_plugin_license_device($1,$2,$3)',[id,b,'switch back']);assert.equal((await activate(a)).ok,true);assert.equal((await state(a)).licensed,true);
    await db.query('select public.revoke_plugin_license($1,$2)',[id,'revoke']);assert.equal((await state(a)).reason,'license_revoked');
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.release_plugin_license_device($1,$2,$3)',[id,a,'attack']),/permission denied/);await db.exec('reset role');
    }
    assert.equal((await db.query<{n:number}>('select count(*)::int n from public.devices')).rows[0].n,2);
  }finally{await db.close();}
});
