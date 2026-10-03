'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useRef} from 'react';
import {useLocale} from './LocaleProvider';
import {isLowEffects,subscribeEffectsPolicy} from '../lib/performancePolicy';
export function SupportOrb(){
  const {t}=useLocale();const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    const media=matchMedia('(prefers-reduced-motion:reduce)');let visible=false;
    const sync=()=>{if(visible&&!document.hidden&&!isLowEffects()){
      if(!video.getAttribute('src'))video.src='/files/customer-assist.mp4';void video.play().catch(()=>{});
    }else video.pause();};
    const observer=new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;sync();});observer.observe(video);
    document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
    const unsubscribe=subscribeEffectsPolicy(sync);
    return()=>{unsubscribe();observer.disconnect();video.pause();document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);};
  },[]);
  return <Link href="/support" className="support-orb" aria-label={t('联系客服','Contact support')}>
    <span className="support-orb-hint">{t('这里找客服','Support here')}</span>
    <span className="orb-art"><video ref={videoRef} className="orb-animated" poster="/files/customer-assist-poster.png" width={192} height={192} muted loop playsInline preload="metadata" aria-hidden="true"/>
      <Image className="orb-static" src="/files/logo.png" alt="" width={100} height={100} sizes="94px" quality={100}/></span>
  </Link>;
}
