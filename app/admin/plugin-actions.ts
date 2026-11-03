'use server';
import {revalidatePath} from 'next/cache';
import {issuePluginLicense,revokePluginLicense,releasePluginDevice} from '@/lib/plugin-license-admin';
import type {PluginIssueInput,PluginIssueResult} from '@/lib/plugin-license-types';
type Failure={error:string};
function failure(error:unknown):Failure{
  const code=error instanceof Error?error.message:'';
  return {error:code==='UNAUTHORIZED'?'登录已过期，请重新登录。':code==='INVALID_PARAMETERS'?'请检查方案、未来的到期时间、1–100 台设备及操作备注。':'操作未确认成功，请刷新查看记录后再重试。'};
}
export async function issuePluginAction(input:PluginIssueInput):Promise<PluginIssueResult|Failure>{
  try{const result=await issuePluginLicense(input);revalidatePath('/admin');return result;}catch(error){return failure(error);}
}
export async function revokePluginAction(id:string,note:string):Promise<{ok:true}|Failure>{
  try{await revokePluginLicense(id,note);revalidatePath('/admin');return {ok:true};}catch(error){return failure(error);}
}
export async function releasePluginAction(id:string,device:string,note:string):Promise<{ok:true}|Failure>{
  try{await releasePluginDevice(id,device,note);revalidatePath('/admin');return {ok:true};}catch(error){return failure(error);}
}
