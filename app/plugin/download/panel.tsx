'use client';
import { useState, type FormEvent } from 'react';
import { useLocale } from '@/components/LocaleProvider';
import type { LatestPluginRelease } from '@/lib/plugin-download';

export function PluginDownloadPanel({signedIn,release}:{signedIn:boolean;release:LatestPluginRelease|null}){
  const {locale,t}=useLocale();
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [codeStep,setCodeStep]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<'sent'|'invalid'|'download'|null>(null);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const action=codeStep?'verify':'request';
      const response=await fetch('/api/plugin/otp/'+action,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(codeStep?{email,code}:{email}),
      });
      if(codeStep&&response.ok){window.location.reload();return;}
      if(codeStep)setMessage('invalid');
      else {setCodeStep(true);setMessage('sent');}
    }catch{
      if(codeStep)setMessage('invalid');
      else {setCodeStep(true);setMessage('sent');}
    }finally{setBusy(false);}
  }

  async function download(){
    setBusy(true);
    setMessage(null);
    try {
      const response=await fetch('/api/plugin/download-link',{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
      });
      if(!response.ok)throw Error();
      const {url}=await response.json();
      if(typeof url!=='string'||!/^\/api\/plugin\/download\/[A-Za-z0-9_-]{43}$/.test(url))throw Error();
      window.location.assign(url);
    }catch{setMessage('download');}
    finally{setBusy(false);}
  }

  return <section className="mx-auto max-w-2xl py-24 sm:py-32" aria-labelledby="plugin-download-title">
    <h1 id="plugin-download-title" className="text-3xl font-semibold">{t('下载 Auto-Check','Download Auto-Check')}</h1>
    <p className="mt-4 md:hidden">{t('请在电脑上打开此页面安装扩展。','Open this page on a PC to install the extension.')}</p>
    {signedIn ? release ? <div className="mt-6 rounded-xl border border-current/20 p-5">
      <h2 className="text-xl font-semibold">{t('版本','Version')} {release.version}</h2>
      <time className="mt-1 block" dateTime={release.date}>{new Intl.DateTimeFormat(locale==='zh'?'zh-MY':'en-MY',{dateStyle:'medium',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(release.date))}</time>
      {release.notes[locale]&&<p className="mt-4 whitespace-pre-wrap break-words">{release.notes[locale]}</p>}
      <p className="mt-4 text-sm">SHA-256 <code className="block break-all select-all">{release.sha256}</code></p>
      <button type="button" className="button mt-5" disabled={busy} onClick={download}>{t('下载','Download')}</button>
    </div> : <p className="mt-6">{t('暂时没有可下载的版本。','No release is available right now.')}</p> :
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        {codeStep ? <>
          <p className="break-all">{email}</p>
          <label htmlFor="plugin-code">{t('六位验证码','Six-digit code')}</label>
          <input autoFocus id="plugin-code" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} className="w-full rounded-xl border border-current/30 bg-transparent px-4 py-3 text-base"/>
          <div className="flex flex-wrap gap-3">
            <button className="button" disabled={busy}>{t('验证','Verify')}</button>
            <button type="button" className="button secondary" disabled={busy} onClick={()=>{setCodeStep(false);setCode('');setMessage(null);}}>{t('更改邮箱','Change email')}</button>
          </div>
        </> : <>
          <label htmlFor="plugin-email">{t('购买时使用的邮箱','Email used for purchase')}</label>
          <input id="plugin-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-current/30 bg-transparent px-4 py-3 text-base"/>
          <button className="button justify-self-start" disabled={busy}>{t('发送验证码','Send code')}</button>
        </>}
      </form>}
    <p role="status" className="mt-4">
      {message==='sent'&&t('如果此邮箱有符合条件的订单，我们会发送验证码。','If this email has an eligible order, we’ll send a code.')}
      {message==='invalid'&&t('暂时无法验证此验证码，请检查后重试。','We couldn’t verify this code. Check it and try again.')}
      {message==='download'&&t('暂时无法下载，请稍后重试。','Download unavailable. Please try again.')}
    </p>
    <h2 className="mt-8 text-xl font-semibold">{t('电脑安装步骤','Install on PC')}</h2>
    <ol className="mt-3 list-decimal space-y-2 pl-6">
      <li>{t('下载并解压 ZIP。','Download and extract the ZIP.')}</li>
      <li>{t('在 Chrome 打开 chrome://extensions，然后开启开发者模式。','Open chrome://extensions in Chrome and enable Developer mode.')}</li>
      <li>{t('点击「加载已解压的扩展程序」，选择含 manifest.json 的文件夹。','Click Load unpacked and select the folder containing manifest.json.')}</li>
    </ol>
  </section>;
}
