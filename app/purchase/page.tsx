'use client';
import {useEffect,useRef,useState} from 'react';
type PurchaseData={order:{id:string;device_id:string|null;status:string;fulfillment_status:string;currency:string;amount_minor:number;phone_duration_days:number};hasLicense:boolean;downloadAvailable:boolean;needsClaim:boolean};
export default function Purchase(){
  const [data,setData]=useState<PurchaseData|null>(null),[licenseKey,setLicenseKey]=useState(''),[error,setError]=useState(''),[email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const csrf=useRef(''),generation=useRef(0);
  const orderId=()=>new URL(location.href).searchParams.get('order_id');
  const call=(action:string,extra:Record<string,unknown>={})=>fetch('/api/commerce',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(csrf.current?{'X-Commerce-CSRF':csrf.current}:{})},body:JSON.stringify({action,orderId:orderId(),...extra}),cache:'no-store'});
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>;const started=Date.now();
    const clear=()=>{generation.current++;setLicenseKey('');};
    const hidden=()=>{if(document.visibilityState==='hidden')clear();};
    window.addEventListener('pagehide',clear);document.addEventListener('visibilitychange',hidden);
    async function load(){try{
      const r=await call('purchase-status');if(!r.ok)throw Error('订单暂不可用。请使用购买邮箱找回，或稍后刷新。');
      const result=await r.json();if(!stopped){setData(result);setError('');if(result.order.status==='pending'||result.order.status==='paid'&&result.order.fulfillment_status==='pending'&&!result.needsClaim){if(Date.now()-started<180000)timer=setTimeout(load,5000);else setError('付款仍在确认，请稍后刷新或联系支持。');}}
    }catch(e){if(!stopped)setError(e instanceof Error?e.message:'订单暂不可用');}}
    void(async()=>{try{const r=await call('buyer-session');if(!r.ok)throw Error('会话暂不可用，请刷新重试。');const session=await r.json();if(stopped)return;csrf.current=session.csrfToken;await load();}catch{if(!stopped)setError('会话暂不可用，请刷新重试。');}})();
    return()=>{stopped=true;clearTimeout(timer);clear();csrf.current='';window.removeEventListener('pagehide',clear);document.removeEventListener('visibilitychange',hidden);};
  },[revision]);
  async function act(action:string){
    setBusy(true);setError('');const epoch=generation.current;
    try{
      const r=await call(action,{email,code});if(!r.ok)throw Error(r.status===429?'操作过于频繁，请稍后重试。':'操作未完成，请检查凭据或刷新会话后重试。');
      const result=await r.json();
      if(action==='reveal-license'){if(epoch===generation.current&&document.visibilityState!=='hidden')setLicenseKey(result.licenseKey);}
      else if(action==='private-download')location.assign(result.signedUrl);
      else if(action==='recovery-start')setSent(true);
      else{setSent(false);setCode('');setLicenseKey('');setRevision(v=>v+1);}
    }catch(e){setError(e instanceof Error?e.message:'暂不可用');}finally{setBusy(false);}
  }
  return <section className="portal narrow"><h1 className="portal-title">购买确认</h1><div className="panel form">{error&&<p className="form-error" role="alert">{error}</p>}{!data?<p>请使用购买凭据查询，或在下方找回订单。</p>:<><p className="break-all">订单：{data.order.id}</p><p>状态：{data.order.status} / {data.order.fulfillment_status}</p><p>支付金额：{data.order.currency.toUpperCase()} {(data.order.amount_minor/100).toFixed(2)}</p>{data.hasLicense&&data.order.status==='paid'&&<><p>插件许可证：<code className="break-all">{licenseKey||'••••••••'}</code></p><button className="button secondary" disabled={busy} onClick={()=>licenseKey?setLicenseKey(''):void act('reveal-license')}>{licenseKey?'隐藏许可证':'显示许可证'}</button></>}{data.downloadAvailable&&<button className="button primary" disabled={busy} onClick={()=>void act('private-download')}>下载扩展 ZIP</button>}{data.needsClaim&&<p>安装扩展后，使用许可证首次激活以完成授权。设备购买绑定入口另行提供。</p>}{data.order.status==='paid'&&data.order.fulfillment_status==='fulfilled'&&data.order.phone_duration_days>0&&<p>原手机通知授权已发放：{data.order.phone_duration_days} 天；找回不会重启时长或转移设备。</p>}</>}
    </div><details className="panel mt-6"><summary>使用购买邮箱找回订单</summary><form className="form mt-5" onSubmit={e=>{e.preventDefault();void act(sent?'recovery-complete':'recovery-start');}}><label>购买邮箱<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{sent&&<label>邮箱验证码<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)}/></label>}<button className="button primary" disabled={busy}>{sent?'验证并找回':'发送验证码'}</button>{sent&&<p>若邮箱和凭据匹配，验证码将发送至该邮箱。手机通知订单丢失凭据时仍需原设备证明，请从原设备访问或联系支持。</p>}</form></details><p><a href="/support">付款或授权问题：联系支持</a></p><a href="/">返回首页</a></section>;
}