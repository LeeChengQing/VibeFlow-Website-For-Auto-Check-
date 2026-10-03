'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale } from './LocaleProvider';
export function SiteHeader() {
  const {locale,setLocale,t}=useLocale(); const [menu,setMenu]=useState(false);
  return <header className="site-header"><div className="nav-wrap">
    <Link href="/" className="brand" aria-label="Auto-Check home"><Image src="/files/logo.png" alt="" width="34" height="34" sizes="34px" quality={100} loading="eager"/><span className="brand-copy"><span className="brand-name">Auto-Check</span><span className="brand-credit">by <span className="vibeflow-wordmark">Vibe<strong>Flow</strong></span></span></span></Link>
    <nav className={menu?'nav-links is-open':'nav-links'} aria-label={t('主导航','Main navigation')}>
      <Link href="/#product" onClick={()=>setMenu(false)}>{t('产品介绍','Product')}</Link><Link href="/#tutorials" onClick={()=>setMenu(false)}>{t('使用教程','Guides')}</Link><Link href="/support" onClick={()=>setMenu(false)}>{t('联系客服','Support')}</Link>
    </nav>
    <div className="nav-actions"><button className="language-button" onClick={()=>setLocale(locale==='zh'?'en':'zh')} aria-label={locale==='zh'?'Switch to English':'切换中文'}>{locale==='zh'?'EN':'中文'}</button><Link className="button small primary" href="/#pricing">{t('立即购买','Get started')} <span aria-hidden>↗</span></Link><button className="menu-button" aria-label={t('打开导航','Toggle navigation')} aria-expanded={menu} onClick={()=>setMenu(!menu)}>☰</button></div>
  </div></header>;
}
