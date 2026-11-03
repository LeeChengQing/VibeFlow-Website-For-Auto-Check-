'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {PLUGIN_PLANS,type PluginLicenseData,type PluginIssueResult} from '@/lib/plugin-license-types';
import {issuePluginAction,revokePluginAction,releasePluginAction} from './plugin-actions';
import {field,primaryButton,secondaryButton} from './admin-ui';

const date=(value:string|null)=>value?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(value)):'永久';
const statusNames={active:'有效',revoked:'已停用',expired:'已到期'};
const eventNames:Record<string,string>={issued:'签发',activated:'激活',revoked:'停用',unbound:'解绑'};
const modalClass='fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-white/20 bg-zinc-950 p-6 text-white shadow-xl backdrop:bg-black/80 sm:p-8';
type Confirmation={license:string;device?:string};

export function PluginLicensePanel({data}:{data:PluginLicenseData|null}){
  const router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [plan,setPlan]=useState('trial'),[generated,setGenerated]=useState<PluginIssueResult|null>(null),[saved,setSaved]=useState(false),[copyNotice,setCopyNotice]=useState('');
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null),[confirmError,setConfirmError]=useState('');
  const keyDialog=useRef<HTMLDialogElement>(null),confirmDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(!generated)return;setSaved(false);setCopyNotice('');keyDialog.current?.showModal();
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[generated]);
  useEffect(()=>{if(confirmation){setConfirmError('');confirmDialog.current?.showModal();}else confirmDialog.current?.close();},[confirmation]);
  function issue(form:FormData){
    setError('');setNotice('');const local=String(form.get('expiresAt')||'');
    start(async()=>{
      try{
        const result=await issuePluginAction({plan:String(form.get('plan')),expiresAt:local?new Date(local+'+08:00').toISOString():'',maxDevices:Number(form.get('maxDevices')),note:String(form.get('note')||'')});
        if('error' in result)setError(result.error);else {setGenerated(result);router.refresh();}
      }catch{setError('请求中断，请先刷新查看签发记录，避免重复生成。');}
    });
  }
  function mutate(form:FormData){
    if(!confirmation)return;const target=confirmation;setConfirmError('');
    start(async()=>{
      try{
        const note=String(form.get('reason')||''),result=target.device?await releasePluginAction(target.license,target.device,note):await revokePluginAction(target.license,note);
        if('error' in result)setConfirmError(result.error);else{setConfirmation(null);setNotice(target.device?'设备已解绑，名额已释放。':'密钥已停用，绑定设备在下一次联网授权检查后锁定。');router.refresh();}
      }catch{setConfirmError('请求中断，请刷新核实状态后重试。');}
    });
  }
  function closeKey(){if(saved){keyDialog.current?.close();setGenerated(null);}}
  async function copy(){try{await navigator.clipboard.writeText(generated?.code||'');setCopyNotice('已复制，请妥善保存。');}catch{setCopyNotice('无法访问剪贴板，请在输入框中选择并复制。');}}
  function pageHref(page:number){const params=new URLSearchParams({page:String(page)});if(data?.plan)params.set('plan',data.plan);if(data?.status)params.set('status',data.status);return '/admin?'+params;}
  return <section className="min-w-0 text-white" aria-labelledby="plugin-license-title">
    <header className="mb-7 border-b border-white/10 pb-6"><h1 id="plugin-license-title" className="text-3xl font-semibold tracking-tight">插件密钥管理</h1><p className="mt-3! max-w-2xl text-sm leading-6 text-white/70">为插件签发授权、查看激活设备及处理换机。手机提醒订阅单独管理。</p></header>
    {notice&&<p role="status" className="mb-5 text-sm leading-6 text-cyan-100">{notice}</p>}
    <section className="mb-8 rounded-xl border border-white/10 p-5 sm:p-6" aria-labelledby="issue-plugin-title">
      <h2 id="issue-plugin-title" className="text-xl font-semibold">签发新密钥</h2><p className="mt-2! text-sm leading-6 text-white/70">到期时间从你填写的时刻计算。原始密钥只显示一次，请当场保存。</p>
      <form action={issue} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">授权方案<select name="plan" value={plan} onChange={event=>setPlan(event.target.value)} disabled={pending} className={field}>{Object.entries(PLUGIN_PLANS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-2 text-sm">到期时间（马来西亚 UTC+8）<input type="datetime-local" name="expiresAt" required={plan!=='lifetime_license'} disabled={pending||plan==='lifetime_license'} defaultValue={new Date(Date.now()+32*3600000).toISOString().slice(0,16)} className={field}/></label>
        <label className="grid gap-2 text-sm">最多激活设备数<input type="number" name="maxDevices" min={1} max={100} step={1} defaultValue={1} required disabled={pending} className={field}/></label>
        <label className="grid gap-2 text-sm">签发备注<input name="note" maxLength={500} required placeholder="例如：测试授权、订单或客户备注" disabled={pending} className={field}/></label>
        <div className="sm:col-span-2"><button disabled={pending||Boolean(generated)} className={primaryButton}>{pending?'正在处理…':'生成插件密钥'}</button></div>
        {error&&<p role="alert" className="text-sm text-rose-200 sm:col-span-2">{error}</p>}
      </form>
    </section>
    <section aria-labelledby="plugin-ledger-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5"><div><h2 id="plugin-ledger-title" className="text-xl font-semibold">授权记录</h2>{data&&<p className="mt-2! text-sm text-white/70">共 {data.total} 个密钥 · 当前筛选 {data.matching} 个</p>}</div><button type="button" disabled={pending} onClick={()=>router.refresh()} className={secondaryButton}>刷新记录</button></div>
      {!data?<p role="alert" className="rounded-lg border border-amber-200/30 p-5 text-sm leading-6 text-amber-100">授权记录暂不可用，请检查授权数据库配置和迁移状态，再刷新重试。</p>:<>
        <form action="/admin" method="get" className="mb-5 flex flex-wrap items-end gap-3"><label className="grid flex-1 gap-2 text-sm sm:flex-none">方案<select name="plan" defaultValue={data.plan} className={field}><option value="">全部方案</option>{Object.entries(PLUGIN_PLANS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="grid flex-1 gap-2 text-sm sm:flex-none">状态<select name="status" defaultValue={data.status} className={field}><option value="">全部状态</option>{Object.entries(statusNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className={secondaryButton}>筛选</button></form>
        <div className="divide-y divide-white/10 border-y border-white/10">{data.licenses.length===0?<p className="py-10 text-sm text-white/70">没有符合条件的授权记录。</p>:data.licenses.map(license=><article key={license.id} className="py-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-mono text-sm text-cyan-100">{license.identifier}…</h3><p className="mt-2! text-sm">{PLUGIN_PLANS[license.plan]} · <span className={license.status==='active'?'text-emerald-200':'text-amber-100'}>{statusNames[license.status]}</span> · {license.devices.filter(device=>!device.releasedAt).length}/{license.maxDevices} 台设备</p></div>{license.status!=='revoked'&&<button type="button" disabled={pending} onClick={()=>setConfirmation({license:license.id})} className={secondaryButton}>停用密钥</button>}</div>
          <p className="mt-3! text-sm leading-6 text-white/70">到期：{date(license.expiresAt)} · 签发：{date(license.createdAt)}（马来西亚时间）</p><p className="mt-2! break-words text-sm text-white/70">{license.note}</p>
          <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm text-cyan-100">设备与操作记录</summary>
            <ul className="space-y-3">{license.devices.map(device=><li key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/5 p-3"><div className="min-w-0"><p className="break-all font-mono text-xs">{device.id}</p><p className="mt-2! text-xs text-white/70">{device.releasedAt?'已解绑 · '+date(device.releasedAt):'激活 · '+date(device.activatedAt)}</p></div>{!device.releasedAt&&<button type="button" disabled={pending} onClick={()=>setConfirmation({license:license.id,device:device.id})} className={secondaryButton}>解绑设备</button>}</li>)}</ul>
            {license.devices.length===0&&<p className="py-3 text-sm text-white/70">尚无激活设备。</p>}
            <ol className="mt-4 space-y-3 border-t border-white/10 pt-4 text-xs leading-6 text-white/70">{license.events.map((event,index)=><li key={index}><span>{date(event.createdAt)} · {eventNames[event.type]||event.type}</span><p className="break-words">{event.note}</p>{event.deviceId&&<p className="break-all font-mono">{event.deviceId}</p>}</li>)}</ol><p className="mt-3! text-xs text-white/60">显示最近 20 条操作记录。</p>
          </details>
        </article>)}</div>
        <nav aria-label="授权记录分页" className="mt-5 flex flex-wrap items-center gap-4 text-sm"><span>第 {data.page}/{data.pageCount} 页</span>{data.page>1&&<Link href={pageHref(data.page-1)} prefetch={false} className={secondaryButton}>上一页</Link>}{data.page<data.pageCount&&<Link href={pageHref(data.page+1)} prefetch={false} className={secondaryButton}>下一页</Link>}</nav>
      </>}
    </section>
    <dialog ref={keyDialog} aria-labelledby="plugin-key-heading" onCancel={event=>{event.preventDefault();closeKey();}} className={modalClass}>{generated&&<>
      <h2 id="plugin-key-heading" className="text-2xl font-semibold">保存你的新密钥</h2><p className="mt-3! text-sm leading-6 text-amber-100">仅显示这一次。刷新或离开页面后无法找回原始密钥。</p>
      <label className="mt-5 grid gap-2 text-sm">插件激活密钥<textarea readOnly spellCheck={false} value={generated.code} rows={3} className={field+' resize-none p-3 font-mono text-sm'}/></label>
      <button type="button" autoFocus onClick={()=>void copy()} className={primaryButton+' mt-4'}>复制密钥</button>{copyNotice&&<p role="status" className="mt-3! text-sm text-cyan-100">{copyNotice}</p>}
      <label className="mt-6 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={saved} onChange={event=>setSaved(event.target.checked)}/>我已保存此密钥</label><button type="button" disabled={!saved} onClick={closeKey} className={secondaryButton+' mt-3'}>关闭并清除显示</button>
    </>}</dialog>
    <dialog ref={confirmDialog} aria-labelledby="plugin-confirm-heading" onCancel={event=>{if(pending)event.preventDefault();else setConfirmation(null);}} className={modalClass}>{confirmation&&<>
      <h2 id="plugin-confirm-heading" className="text-xl font-semibold">{confirmation.device?'解绑此设备？':'停用此密钥？'}</h2><p className="mt-3! text-sm leading-6 text-white/70">{confirmation.device?'将释放一个设备名额，保留解绑历史。持有密钥的人仍可在有名额时重新激活。':'此密钥将无法继续激活，已绑定设备会在下次联网检查后锁定。操作记录将保留。'}</p>
      {confirmation.device&&<p className="mt-3! break-all font-mono text-xs">{confirmation.device}</p>}
      <form action={mutate} className="mt-5"><label className="grid gap-2 text-sm">操作原因<textarea name="reason" required maxLength={500} disabled={pending} className={field}/></label>{confirmError&&<p role="alert" className="mt-3! text-sm text-rose-200">{confirmError}</p>}<div className="mt-5 flex gap-3"><button disabled={pending} className={primaryButton}>{pending?'处理中…':'确认操作'}</button><button type="button" disabled={pending} onClick={()=>setConfirmation(null)} className={secondaryButton}>取消</button></div></form>
    </>}</dialog>
  </section>;
}
