'use client';
import {useEffect} from 'react';
import {gsap} from 'gsap';
import {subscribeAnimationFrame} from '../lib/animationScheduler';
import {deviceEffectsReason,setEffectsPolicy} from '../lib/performancePolicy';

/** One tiny ticker sample, no scroll position and no React state. */
export function PerformanceRuntime(){
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion:reduce)'),coarse=matchMedia('(any-pointer:coarse)');
    let runtimeLow=false,previous=0,windowStart=0,total=0,count=0,slowWindows=0;
    let releaseMonitor:(()=>void)|undefined,pausedTimeline=false;
    const pausedAnimations=new Set<Animation>();
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
    reduced.addEventListener('change',syncPolicy);coarse.addEventListener('change',syncPolicy);document.addEventListener('visibilitychange',visibility);
    return()=>{releaseMonitor?.();reduced.removeEventListener('change',syncPolicy);coarse.removeEventListener('change',syncPolicy);document.removeEventListener('visibilitychange',visibility);if(pausedTimeline)gsap.globalTimeline.resume();pausedAnimations.clear();};
  },[]);
  return null;
}
