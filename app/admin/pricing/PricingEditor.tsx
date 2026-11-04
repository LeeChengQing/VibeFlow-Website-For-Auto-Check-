'use client';
import { useEffect,useState } from 'react';
import type { PriceRow,PricingCatalog } from '@/lib/canonical-pricing';
type Data={products:PriceRow[];campaign:PricingCatalog['campaign'];draft_campaign:PricingCatalog['campaign'];audit:{id:string;actor:string;changed_at:string;entity_id:string;old_value:unknown;new_value:unknown}[]};
const local=(iso:string|null)=>iso?new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,16):'';
export function PricingEditor() {
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){setError('');const r=await fetch('/api/admin/pricing',{cache:'no-store'});if(!r.ok){const body=await r.json().catch(()=>({}));const errors:Record<string,string>={pricing_configuration_unavailable:'价格数据库配置不可用。',pricing_audit_unavailable:'价格审计记录不可用。',pricing_catalog_myr_unavailable:'MYR 价格目录不可用。',pricing_catalog_cny_unavailable:'CNY 价格目录不可用。',pricing_catalog_usd_unavailable:'USD 价格目录不可用。'};throw Error(r.status===401?'登录已过期，请重新登录。':errors[body.error]??'价格服务暂不可用，请稍后重试。');}setData(await r.json());}
  useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
  async function save(kind:string,id:string,version:number,values:Record<string,unknown>){
    setBusy(true);setError('');
    try{const r=await fetch('/api/admin/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id,version,values})});if(!r.ok)throw Error('保存失败或价格已被其他会话修改，请刷新');await load();}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}
  }
  if(!data)return <div><p role={error?'alert':'status'}>{error||'读取价格…'}</p>{error&&<button type="button" onClick={()=>void load().catch(e=>setError(e instanceof Error?e.message:'价格服务暂不可用，请检查网络连接。'))}>重试</button>}</div>;
  const campaign=data.draft_campaign;
  return <section><p>编辑 MYR 价格与活动草稿。保存后需在网站管理中预览并发布，才会影响店面和结账。已发布活动：{data.campaign.state}。所有价格以分为单位；时区：Asia/Kuala_Lumpur。</p><a href="/admin">返回网站管理并发布</a>{error&&<p role="alert">{error}</p>}
    <h2>{campaign.name} · {campaign.state}</h2><form key={campaign.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const start=Date.parse(String(f.get('start'))+':00+08:00'),end=Date.parse(String(f.get('end'))+':00+08:00');if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end){setError('结束时间必须晚于开始时间。');return;}void save('campaign',campaign.id,campaign.version,{enabled:f.get('enabled')==='on',starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString()});}}>
      <label>开始 <input name="start" type="datetime-local" required defaultValue={local(campaign.starts_at)}/></label>
      <label>结束 <input name="end" type="datetime-local" required defaultValue={local(campaign.ends_at)}/></label><label><input name="enabled" type="checkbox" defaultChecked={campaign.enabled}/>启用优惠</label><button disabled={busy}>保存排期</button>
    </form>
    <h2>商品</h2>{data.products.map(p=><form key={p.id+':'+p.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save('product',p.id,p.version,{regular_amount_minor:Number(f.get('regular')),promotional_amount_minor:f.get('promo')===''?null:Number(f.get('promo')),enabled:f.get('enabled')==='on',promotion_enabled:f.get('promotion')==='on'});}}>
      <h3>{p.product_key} · {p.currency.toUpperCase()}</h3><p>草稿价格预览：{p.effective_amount_minor===null?'已停用':(p.effective_amount_minor/100).toFixed(2)} · 版本 {p.version}</p>
      <label>常规价格（分） <input name="regular" type="number" min="100" max="100000000" step="1" required defaultValue={p.regular_amount_minor}/></label>
      <label>优惠价格（分） <input name="promo" type="number" min="100" max={p.regular_amount_minor} step="1" defaultValue={p.promotional_amount_minor??''}/></label>
      <label><input name="enabled" type="checkbox" defaultChecked={p.enabled}/>启用商品</label><label><input name="promotion" type="checkbox" defaultChecked={p.promotion_enabled}/>参与优惠</label><button disabled={busy}>保存</button>
    </form>)}
    <h2>网站发布历史</h2>{data.audit.map(a=><details key={a.id}><summary>{new Date(a.changed_at).toLocaleString('zh-CN',{timeZone:'Asia/Kuala_Lumpur'})} · {a.actor} · {a.entity_id}</summary><pre>{JSON.stringify({old:a.old_value,new:a.new_value},null,2)}</pre></details>)}
  </section>;
}
