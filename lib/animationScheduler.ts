'use client';
import {gsap} from 'gsap';

type FrameTask=(timeMs:number)=>void;
const tasks=new Set<FrameTask>();
let listening=false,initialized=false;
// One application frame queue. GSAP owns the only persistent animation clock.
const tick=(seconds:number)=>{if(!document.hidden)tasks.forEach(task=>task(seconds*1000));};
const sync=()=>{
  const shouldRun=tasks.size>0&&!document.hidden;
  if(shouldRun&&!listening){listening=true;gsap.ticker.add(tick,false,true);}
  else if(!shouldRun&&listening){listening=false;gsap.ticker.remove(tick);}
};
export function subscribeAnimationFrame(task:FrameTask){
  if(!initialized){initialized=true;gsap.ticker.lagSmoothing(0);gsap.ticker.fps(120);}
  if(tasks.size===0)document.addEventListener('visibilitychange',sync);
  const createdFrame=gsap.ticker.frame;
  const deferred:FrameTask=time=>{if(gsap.ticker.frame!==createdFrame)task(time);};
  tasks.add(deferred);sync();
  return ()=>{tasks.delete(deferred);sync();if(tasks.size===0)document.removeEventListener('visibilitychange',sync);};
}
export function scheduleAnimationFrame(task:FrameTask){
  // Defer registration's first synchronous GSAP wake until the following tick.
  let ready=false,release=()=>{};
  release=subscribeAnimationFrame(time=>{if(!ready)return;release();task(time);});ready=true;
  return release;
}
