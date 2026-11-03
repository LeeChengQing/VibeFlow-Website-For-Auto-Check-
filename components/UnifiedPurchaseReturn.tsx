'use client';
import {useEffect,useState} from 'react';
type Order={status:string;hasLicense:boolean;downloadAvailable:boolean};
export function UnifiedPurchaseReturn({orderId}:{orderId:string}){
  const [order,setOrder]=useState<Order|null>(null),[message,setMessage]=useState('正在确认付款状态 / Confirming payment'),[license,setLicense]=useState('');
  useEffect(()=>{
    let stopped=false,count=0;
    async function refresh(){try{const r=await fetch('/api/purchase/'+orderId,{cache:'no-store'});const data=await r.json();if(stopped)return;if(r.ok){setOrder(data);setMessage(data.status==='paid'?'付款已确认 / Payment confirmed':data.status==='refunded'?'订单已退款 / Order refunded':'正在等待付款确认 / Awaiting payment confirmation');}else setMessage('请回到发起购买的插件刷新订阅状态，或使用原购买浏览器查看订单。 / Refresh your subscription in the extension, or use the browser where you purchased.');}catch{if(!stopped)setMessage('暂时无法确认，请稍后刷新 / Please refresh shortly');}}
    void refresh();const timer=setInterval(()=>{if(++count<40)void refresh();else clearInterval(timer);},3000);return()=>{stopped=true;clearInterval(timer);};
  },[orderId]);
  async function action(type:string){try{const r=await fetch('/api/purchase/'+orderId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:type})});const data=await r.json();if(!r.ok){setMessage('暂时无法读取，请稍后重试 / Please retry shortly');return;}if(type==='reveal')setLicense(data.licenseKey);else if(data.url)window.location.assign(data.url);}catch{setMessage('暂时无法读取，请稍后重试 / Please retry shortly');}}
  return <main className="mx-auto max-w-2xl px-6 py-32"><h1 className="text-3xl font-semibold">购买状态 / Purchase status</h1><p role="status" className="my-6">{message}</p>{order?.status==='paid'&&<div className="flex flex-wrap gap-4">{order.hasLicense&&<button className="button" onClick={()=>action('reveal')}>查看插件密钥 / View license key</button>}{order.downloadAvailable&&<button className="button secondary" onClick={()=>action('download')}>下载安装包 / Download extension</button>}</div>}{license&&<div className="my-6 rounded-xl border border-white/20 p-5"><p>请妥善保存密钥 / Keep your license key safe</p><code className="mt-3 block break-all select-all">{license}</code></div>}<p className="mt-8"><a href="/">返回首页 / Home</a></p></main>;
}
