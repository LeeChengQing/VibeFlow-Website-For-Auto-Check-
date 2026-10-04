'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useLocale } from './LocaleProvider';
import { useSiteConfig } from './SiteConfigProvider';
export function SiteHeader() {
  const {locale,setLocale,t}=useLocale(); const [menu,setMenu]=useState(false);
  const pathname = usePathname();
  const { config } = useSiteConfig();
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const media = window.matchMedia('(max-width: 767px)');
    if (!media.matches) { setMenu(false); return; }
    headerRef.current?.querySelector<HTMLAnchorElement>('.nav-links a')?.focus();
    const close = () => { setMenu(false); menuRef.current?.focus(); };
    const resize = () => { if (!media.matches) close(); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const controls = [...(headerRef.current?.querySelectorAll<HTMLElement>('.nav-links a, .language-button, .menu-button') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown); media.addEventListener('change', resize);
    return () => { document.removeEventListener('keydown', keydown); media.removeEventListener('change', resize); };
  }, [menu]);

  function handleLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    setMenu(false);
    if (
      pathname !== '/' || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    ) return;

    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return <header ref={headerRef} className="site-header" data-menu-open={menu ? '' : undefined}><div className="nav-wrap">
    <Link prefetch={true} href="/" onClick={handleLogoClick} className="brand" aria-label="Auto-Check home"><Image src="/files/logo.png" alt="" width="34" height="34" sizes="34px" quality={100} loading="eager"/><span className="brand-copy"><span className="brand-name">Auto-Check</span><span className="brand-credit">by <span className="vibeflow-wordmark">Vibe<strong>Flow</strong></span></span></span></Link>
    <nav id="site-navigation" className={menu?'nav-links is-open':'nav-links'} aria-label={t('主导航','Main navigation')}>
      <Link prefetch={true} href="/#product" onClick={()=>setMenu(false)}>{t('产品介绍','Product')}</Link><Link prefetch={true} href="/#tutorials" onClick={()=>setMenu(false)}>{t('使用教程','Guides')}</Link>{config.settings.supportUrl&&<Link prefetch={true} href={config.settings.supportUrl} onClick={()=>setMenu(false)}>{t('联系客服','Support')}</Link>}
    </nav>
    <div className="nav-actions"><button className="language-button" onClick={()=>setLocale(locale==='zh'?'en':'zh')} aria-label={locale==='zh'?'Switch to English':'切换中文'}>{locale==='zh'?'EN':'中文'}</button><Link prefetch={true} className="button small primary" href="/#pricing">{t('立即购买','Get started')} <span aria-hidden>↗</span></Link><button ref={menuRef} className="menu-button" aria-label={menu?t('关闭导航','Close navigation'):t('打开导航','Toggle navigation')} aria-controls="site-navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?'×':'☰'}</button></div>
  </div></header>;
}
