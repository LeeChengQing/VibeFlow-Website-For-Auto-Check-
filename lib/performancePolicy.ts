'use client';
type Listener=(low:boolean)=>void;
const listeners=new Set<Listener>();
export function deviceEffectsReason(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return 'reduced-motion';
  if(navigator.maxTouchPoints>0||matchMedia('(any-pointer:coarse)').matches)return 'touch';
  const memory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory;
  if(navigator.hardwareConcurrency<=4||(memory!==undefined&&memory<=4))return 'hardware';
  return '';
}
export function isLowEffects(){const mode=document.documentElement.dataset.perf;return mode?mode==='low':!!deviceEffectsReason();}
export function setEffectsPolicy(low:boolean,reason=''){
  const root=document.documentElement,mode=low?'low':'normal';
  if(root.dataset.perf===mode&&root.dataset.perfReason===reason)return;
  root.dataset.perf=mode;root.dataset.perfReason=reason;listeners.forEach(listener=>listener(low));
}
export function subscribeEffectsPolicy(listener:Listener){listeners.add(listener);listener(isLowEffects());return()=>{listeners.delete(listener);};}
