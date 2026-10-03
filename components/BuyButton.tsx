'use client';
import { useState } from 'react';
import { useLocale } from './LocaleProvider';
import type { PlanCode } from '@/lib/plans';
export function BuyButton({plan,children,className='button primary'}:{plan:PlanCode;children:React.ReactNode;className?:string}) {
  const {locale,t}=useLocale(); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function buy(){setBusy(true);setError('');try{const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,locale})});const data=await response.json();if(!response.ok)throw Error(data.error);window.location.assign(data.url);}catch{setError(t('暂时无法创建订单，请重试。','Could not create an order. Please try again.'));setBusy(false);}}
  return <div className="buy-action"><button className={className} onClick={buy} disabled={busy}>{busy?t('正在打开…','Opening…'):children}<span aria-hidden>↗</span></button>{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
