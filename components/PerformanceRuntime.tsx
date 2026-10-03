'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {gsap} from 'gsap';
import {subscribeAnimationFrame} from '../lib/animationScheduler';
import {deviceEffectsReason,setEffectsPolicy} from '../lib/performancePolicy';
import {beginAmbientNavigation,pauseAmbientInteraction,settleAmbientNavigation} from '../lib/ambientActivity';

/** One tiny ticker sample, no scroll position and no React state. */
export function PerformanceRuntime(){
  const pathname=usePathname();
  useEffect(()=>settleAmbientNavigation(),[pathname]);
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion:reduce)'),coarse=matchMedia('(any-pointer:coarse)');
    let runtimeLow=false,previous=0,windowStart=0,total=0,count=0,slowWindows=0;
    let releaseMonitor:(()=>void)|undefined,pausedTimeline=false;
    const pausedAnimations=new Set<Animation>();
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const target=event.target instanceof Element?event.target:null;
      if(target?.closest('.mini-plan,.billing-segment'))pauseAmbientInteraction();
      const link=target?.closest<HTMLAnchorElement>('a[href]');
      if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
      const url=new URL(link.href,location.href);
      if(url.origin===location.origin&&url.pathname!==location.pathname)beginAmbientNavigation();
    };
    const key=(event:KeyboardEvent)=>{
      if(event.target instanceof Element&&event.target.closest('.mini-plan,.billing-segment')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))pauseAmbientInteraction();
    };
    const syncPolicy=()=>{const reason=deviceEffectsReason();setEffectsPolicy(!!reason||runtimeLow,reason||(runtimeLow?'runtime':''));};
    const sample=(now:number)=>{
      if(previous){total+=now-previous;count++;}previous=now;
      if(!windowStart)windowStart=now;
      if(now-windowStart<1000||!count)return;
      slowWindows=total/count>20?slowWindows+1:0;windowStart=now;total=0;count=0;
      if(slowWindows>=2){runtimeLow=true;syncPolicy();releaseMonitor?.();releaseMonitor=undefined;}
    };
    const visibility=()=>{
      previous=0;windowStart=0;total=0;count=0;slowWindows=0;
      if(document.hidden){
        if(!gsap.globalTimeline.paused()){pausedTimeline=true;gsap.globalTimeline.pause();}
        for(const animation of document.getAnimations())if(animation.playState==='running'){pausedAnimations.add(animation);animation.pause();}
      }else{
        if(pausedTimeline){pausedTimeline=false;gsap.globalTimeline.resume();}
        for(const animation of pausedAnimations){const target=(animation.effect as KeyframeEffect|null)?.target;if(target?.isConnected&&animation.playState==='paused')animation.play();}
        pausedAnimations.clear();
      }
    };
    syncPolicy();releaseMonitor=subscribeAnimationFrame(sample);
    document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
    reduced.addEventListener('change',syncPolicy);coarse.addEventListener('change',syncPolicy);document.addEventListener('visibilitychange',visibility);
    return()=>{releaseMonitor?.();document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);reduced.removeEventListener('change',syncPolicy);coarse.removeEventListener('change',syncPolicy);document.removeEventListener('visibilitychange',visibility);if(pausedTimeline)gsap.globalTimeline.resume();pausedAnimations.clear();};
  },[]);
  return null;
}
