'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {useLocale} from './LocaleProvider';
import {isLowEffects,subscribeEffectsPolicy} from '@/lib/performancePolicy';
import {isScrollActive,subscribeScrollActivity} from '@/lib/scrollActivity';
import {isAmbientBusy,subscribeAmbientActivity} from '@/lib/ambientActivity';
export function SupportOrb(){
  const isAdmin=usePathname()==='/admin';
  const {t}=useLocale();const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    let visible=false;
    const sync=()=>{if(visible&&!document.hidden&&!isLowEffects()&&!isScrollActive()&&!isAmbientBusy()){
      if(!video.getAttribute('src'))video.src='/files/customer-assist.mp4';if(video.paused)void video.play().catch(()=>{});
    }else video.pause();};
    const observer=new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;sync();});observer.observe(video);
    const releaseScroll=subscribeScrollActivity(sync);
    const releasePolicy=subscribeEffectsPolicy(sync);
    const releaseAmbient=subscribeAmbientActivity(sync);
    document.addEventListener('visibilitychange',sync);
    return()=>{observer.disconnect();releaseScroll();releasePolicy();releaseAmbient();video.pause();document.removeEventListener('visibilitychange',sync);};
  },[isAdmin]);
  if(isAdmin)return null;
  return <Link prefetch={true} href="/support" className="support-orb" aria-label={t('联系客服','Contact support')}>
    <span className="support-orb-hint" aria-hidden="true">{t('这里找客服','Support here')}</span>
    <span className="orb-art"><video ref={videoRef} className="orb-animated" poster="/files/customer-assist-poster.png" width={192} height={192} muted loop playsInline preload="none" aria-hidden="true"/>
      <Image className="orb-static" src="/files/customer-assist-poster.png" alt="" width={192} height={192} sizes="94px" aria-hidden="true"/>
    </span>
  </Link>;
}
