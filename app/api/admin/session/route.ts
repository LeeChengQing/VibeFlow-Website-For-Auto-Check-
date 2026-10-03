import { cookies } from 'next/headers';
import { localOnly, verifyPassword, newSession, apiError, rateLimit } from '@/lib/security';
export async function POST(request:Request) {
  try { localOnly(request,true); rateLimit(request,'login',10); const {password}=await request.json(); if(!verifyPassword(password)) throw new Error('UNAUTHORIZED'); (await cookies()).set('vf_admin',newSession(),{httpOnly:true,sameSite:'strict',maxAge:8*3600,path:'/',secure:new URL(request.url).protocol==='https:'}); return Response.json({ok:true}); } catch(error) { return apiError(error); }
}
export async function DELETE(request:Request) {
  try { localOnly(request,true); (await cookies()).delete('vf_admin'); return Response.json({ok:true}); } catch(error) { return apiError(error); }
}
