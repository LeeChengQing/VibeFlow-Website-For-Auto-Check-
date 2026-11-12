'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {gsap} from 'gsap';
import {TOUCH_VIEWPORT_QUERY} from '../lib/mobileViewport';
import {subscribeAnimationFrame} from '../lib/animationScheduler';
import {deviceEffectsReason,setEffectsPolicy} from '../lib/performancePolicy';
import {beginAmbientNavigation,pauseAmbientInteraction,settleAmbientNavigation} from '../lib/ambientActivity';

/** One tiny ticker sample, no scroll position and no React state. */
export function PerformanceRuntime(){
  const pathname=usePathname();
  useEffect(()=>settleAmbientNavigation(),[pathname]);
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion:reduce)');
    const touch=matchMedia(TOUCH_VIEWPORT_QUERY);
    let runtimeLow=false,previous=0,windowStart=0,total=0,count=0,slowWindows=0;
    let ignoreUntil=0;
    let frameBudget=1000/60;
    const introDone=()=>{ignoreUntil=performance.now()+1000;};
    window.addEventListener('intro:done',introDone);
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
    const sample=(now:number)=>{
      if(document.documentElement.dataset.intro==='playing'||performance.now()<ignoreUntil){previous=0;windowStart=0;total=0;count=0;slowWindows=0;return;}
      if(previous){const delta=now-previous;total+=delta;count++;if(delta>=4)frameBudget=Math.min(frameBudget,delta);}previous=now;
      if(!windowStart)windowStart=now;
      if(now-windowStart<1000||!count)return;
      slowWindows=total/count>frameBudget*1.5?slowWindows+1:0;windowStart=now;total=0;count=0;
      if(slowWindows>=2){runtimeLow=true;syncPolicy();}
    };
    const syncPolicy=()=>{
      const reason=deviceEffectsReason()||(runtimeLow?'runtime':'');
      setEffectsPolicy(!!reason,reason);
      if(reason){releaseMonitor?.();releaseMonitor=undefined;}
      else if(!releaseMonitor){
        previous=0;windowStart=0;total=0;count=0;slowWindows=0;frameBudget=1000/60;
        releaseMonitor=subscribeAnimationFrame(sample);
      }
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
    syncPolicy();
    document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
    reduced.addEventListener('change',syncPolicy);touch.addEventListener('change',syncPolicy);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('intro:done',introDone);releaseMonitor?.();document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);reduced.removeEventListener('change',syncPolicy);touch.removeEventListener('change',syncPolicy);document.removeEventListener('visibilitychange',visibility);if(pausedTimeline)gsap.globalTimeline.resume();for(const animation of pausedAnimations){const target=(animation.effect as KeyframeEffect|null)?.target;if(target?.isConnected&&animation.playState==='paused')animation.play();}pausedAnimations.clear();};
  },[]);
  return null;
}
