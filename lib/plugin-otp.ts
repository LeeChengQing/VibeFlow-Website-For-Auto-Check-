import 'server-only';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { after } from 'next/server';
import { ResendEmailAdapter } from '@/lib/mail/email-service';
import { pluginProof } from '@/lib/order-access-token';
import { createPluginOrderSession, isPluginSchemaUnavailable } from '@/lib/plugin-download';
import { readStripeBody } from '@/lib/stripe-server';
import { commerceDatabase, commerceOrigin, reply, unifiedHeaders } from '@/lib/unified-commerce';

const accepted=()=>reply({ok:true});
const rejected=()=>reply({error:'forbidden'},403);
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');

async function otpInput(request:Request) {
  if(request.headers.get('origin')!==commerceOrigin()||!request.headers.get('content-type')?.startsWith('application/json'))return null;
  try {
    const data=JSON.parse((await readStripeBody(request,4096)).toString('utf8'));
    const email=typeof data?.email==='string'?data.email.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
    const ip=request.headers.get('cf-connecting-ip')??'';
    return {email,code:data.code,emailHash:pluginProof('email',email),lookupHash:sha256(email),
      ipHash:pluginProof('ip',isIP(ip)?ip:'unknown')};
  }catch{return null;}
}

export async function requestPluginOtp(request:Request) {
  try {
    const input=await otpInput(request);
    if(!input)return accepted();
    const id=randomUUID(),code=String(randomInt(1_000_000)).padStart(6,'0');
    const result=await commerceDatabase().rpc('request_plugin_otp',{
      p_id:id,p_email_hash:input.emailHash,p_lookup_hash:input.lookupHash,p_ip_hash:input.ipHash,
      p_code_hash:pluginProof('code',input.emailHash,id,code),
    });
    if(isPluginSchemaUnavailable(result.error))return rejected();
    if(result.data===true&&!result.error)after(async()=>{
      try { await new ResendEmailAdapter().sendPluginOtp(input.email,code,id); }catch {}
    });
  }catch {}
  return accepted();
}

export async function verifyPluginOtp(request:Request) {
  try {
    const input=await otpInput(request);
    if(!input||typeof input.code!=='string'||!/^[0-9]{6}$/.test(input.code))return rejected();
    const db=commerceDatabase();
    const {data:challenge,error}=await db.rpc('plugin_otp_challenge',{p_email_hash:input.emailHash,p_ip_hash:input.ipHash});
    if(error)return rejected();
    const candidate=Buffer.from(pluginProof('code',input.emailHash,challenge?.id??'',input.code),'hex');
    const expected=challenge?Buffer.from(challenge.codeHash,'hex'):Buffer.alloc(32);
    const matched=timingSafeEqual(candidate,expected);
    if(!challenge)return rejected();
    const result=await db.rpc('finish_plugin_otp',{
      p_id:challenge.id,p_email_hash:input.emailHash,p_lookup_hash:input.lookupHash,p_matched:matched,
    });
    if(result.error||!result.data)return rejected();
    return Response.json({ok:true},{headers:{...unifiedHeaders,'Set-Cookie':createPluginOrderSession(result.data)}});
  }catch{return rejected();}
}
