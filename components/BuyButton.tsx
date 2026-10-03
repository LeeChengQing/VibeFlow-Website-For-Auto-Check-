'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from './LocaleProvider';
import type { PlanCode } from '@/lib/plans';
import {beginAmbientNavigation} from '@/lib/ambientActivity';
import { purchaseAllowed } from '@/lib/site-config';
import { useSiteConfig } from './SiteConfigProvider';
export function BuyButton({plan,children,className='button primary'}:{plan:PlanCode;children:React.ReactNode;className?:string}) {
  const {locale,t}=useLocale(); const router=useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const {config,preview}=useSiteConfig(); const available=!preview&&purchaseAllowed(config,plan);
  async function buy(){if(!available)return;setBusy(true);setError('');try{const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,locale})});const data=await response.json();if(!response.ok)throw Error(data.error);beginAmbientNavigation();router.push(data.url);}catch{setError(t('暂时无法创建订单，请重试。','Could not create an order. Please try again.'));setBusy(false);}}
  return <div className="buy-action"><button className={className} onClick={buy} disabled={busy||!available} title={!available?t(preview?'预览模式无法结账':'此方案暂不可购买',preview?'Checkout is disabled in preview':'This package is currently unavailable'):undefined}>{busy?t('正在打开…','Opening…'):children}<span aria-hidden>↗</span></button>{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
