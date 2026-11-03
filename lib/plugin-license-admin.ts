import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createHash,randomBytes} from 'node:crypto';
import {requireAdminSession} from '@/lib/admin-auth';
import type {PluginIssueInput,PluginIssueResult,PluginLicenseData,PluginLicenseView,PluginSearchParams,PluginPlan} from './plugin-license-types';

const plans=['trial','semester_license','lifetime_license'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function database(){
  const url=process.env.CHINA_SUPABASE_URL,key=process.env.CHINA_SUPABASE_SERVICE_ROLE_KEY;
  const local=process.env.NODE_ENV!=='production'&&url==='http://127.0.0.1:54330';
  if((url!=='https://qckpwckfukyurkobrsig.supabase.co'&&!local)||!key?.trim())throw Error('PLUGIN_ADMIN_NOT_CONFIGURED');
  return createClient(url,key.trim(),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})}});
}
function validNote(note:unknown){return typeof note==='string'&&note.trim().length>0&&note.length<=500;}
function generate(){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let raw='',value=0,bits=0;
  for(const byte of randomBytes(20)){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;raw+=alphabet[(value>>>bits)&31];}}
  return `AC-LIC-${raw.match(/.{4}/g)!.join('-')}`;
}
export async function issuePluginLicense(input:PluginIssueInput):Promise<PluginIssueResult>{
  await requireAdminSession();
  if(!input||typeof input!=='object'||!plans.includes(input.plan)||!Number.isInteger(input.maxDevices)||input.maxDevices<1||input.maxDevices>100||!validNote(input.note)||typeof input.expiresAt!=='string')throw Error('INVALID_PARAMETERS');
  const expiresAt=input.expiresAt?new Date(input.expiresAt):null;
  if((input.plan!=='lifetime_license'&&!expiresAt)||(expiresAt&&(!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now())))throw Error('INVALID_PARAMETERS');
  const db=database(),code=generate(),hash=createHash('sha256').update(code).digest('hex');
  const {data,error}=await db.rpc('issue_plugin_license',{p_key_hash:hash,p_plan:input.plan,p_expires_at:expiresAt?.toISOString()??null,p_max_devices:input.maxDevices,p_note:'Admin: '+input.note.trim().slice(0,493)});
  if(error||data?.ok!==true||typeof data.license_id!=='string'||!uuid.test(data.license_id))throw Error('PLUGIN_WRITE_UNAVAILABLE');
  return {code,licenseId:data.license_id};
}
export async function revokePluginLicense(id:string,note:string){
  await requireAdminSession();if(!uuid.test(id)||!validNote(note))throw Error('INVALID_PARAMETERS');
  const {data,error}=await database().rpc('revoke_plugin_license',{p_license_id:id,p_note:'Admin: '+note.trim().slice(0,493)});
  if(error||data?.ok!==true)throw Error('PLUGIN_WRITE_UNAVAILABLE');
}
export async function releasePluginDevice(id:string,device:string,note:string){
  await requireAdminSession();if(!uuid.test(id)||!uuid.test(device)||!validNote(note))throw Error('INVALID_PARAMETERS');
  const {data,error}=await database().rpc('release_plugin_license_device',{p_license_id:id,p_device_id:device,p_note:'Admin: '+note.trim().slice(0,493)});
  if(error||data?.ok!==true)throw Error('PLUGIN_WRITE_UNAVAILABLE');
}
type Row={id:string;license_key_hash:string;plan:PluginPlan;status:PluginLicenseView['status'];max_devices:number;expires_at:string|null;created_at:string;note:string;plugin_license_activations:{device_id:string;activated_at:string}[];plugin_license_events:{event_type:string;device_id:string|null;note:string;created_at:string}[]};
export async function getPluginLicenseData(params:PluginSearchParams={}):Promise<PluginLicenseData>{
  await requireAdminSession();const db=database(),now=new Date().toISOString();
  const plan=typeof params.plan==='string'&&plans.includes(params.plan)?params.plan:'';
  const status=typeof params.status==='string'&&['active','revoked','expired'].includes(params.status)?params.status:'';
  const requested=typeof params.page==='string'&&/^[1-9]\d{0,5}$/.test(params.page)?Number(params.page):1;
  const filtered=()=>{
    let query=db.from('plugin_licenses').select('id',{count:'exact',head:true});
    if(plan)query=query.eq('plan',plan);
    if(status==='active')query=query.eq('status','active').or(`expires_at.is.null,expires_at.gt.${now}`);
    else if(status==='expired')query=query.neq('status','revoked').or(`status.eq.expired,expires_at.lte.${now}`);
    else if(status)query=query.eq('status',status);
    return query;
  };
  const [all,matched]=await Promise.all([db.from('plugin_licenses').select('id',{count:'exact',head:true}),filtered()]);
  if(all.error||matched.error)throw Error('PLUGIN_READ_UNAVAILABLE');
  const pageCount=Math.max(1,Math.ceil((matched.count??0)/25)),page=Math.min(requested,pageCount);
  let query=db.from('plugin_licenses').select('id,license_key_hash,plan,status,max_devices,expires_at,created_at,note,plugin_license_activations(device_id,activated_at),plugin_license_events(event_type,device_id,note,created_at)').order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*25,page*25-1).order('created_at',{referencedTable:'plugin_license_events',ascending:false}).limit(20,{referencedTable:'plugin_license_events'});
  if(plan)query=query.eq('plan',plan);
  if(status==='active')query=query.eq('status','active').or(`expires_at.is.null,expires_at.gt.${now}`);
  else if(status==='expired')query=query.neq('status','revoked').or(`status.eq.expired,expires_at.lte.${now}`);
  else if(status)query=query.eq('status',status);
  const {data,error}=await query;if(error)throw Error('PLUGIN_READ_UNAVAILABLE');
  const licenses=((data??[]) as unknown as Row[]).map(row=>({id:row.id,identifier:row.license_key_hash.slice(0,12),plan:row.plan,status:row.status==='active'&&row.expires_at&&row.expires_at<=now?'expired' as const:row.status,maxDevices:row.max_devices,expiresAt:row.expires_at,createdAt:row.created_at,note:row.note,devices:(row.plugin_license_activations??[]).map(d=>({id:d.device_id,activatedAt:d.activated_at,releasedAt:null})),events:(row.plugin_license_events??[]).map(e=>({type:e.event_type,deviceId:e.device_id,note:e.note,createdAt:e.created_at}))}));
  return {licenses,total:all.count??0,matching:matched.count??0,page,pageCount,plan,status};
}
