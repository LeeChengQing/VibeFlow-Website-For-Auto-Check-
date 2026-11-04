'use client';

import {useEffect,useRef,useState} from 'react';
import {gsap} from 'gsap';
import {useLocale} from './LocaleProvider';

export function SiteIntro(){
  const {t}=useLocale();
  const rootRef=useRef<HTMLDivElement>(null);
  const [done,setDone]=useState(false);
  useEffect(()=>{
    const html=document.documentElement;
    if(html.dataset.intro!=='playing'){setDone(true);return;}
    const el=rootRef.current;
    if(!el)return;
    let active=true,finished=false,skipped=false;
    let tl:gsap.core.Timeline|undefined;
    let startNow=()=>{};
    const context=gsap.context(()=>{},el);
    const removeListeners=()=>{
      el.removeEventListener('pointerdown',skip);
      window.removeEventListener('keydown',key);
    };
    const finish=()=>{
      if(finished)return;
      finished=true;removeListeners();
      try{sessionStorage.setItem('vf-intro','1');}catch{}
      html.dataset.intro='done';
      gsap.set(document.getElementById('main'),{clearProps:'all'});
      window.dispatchEvent(new Event('intro:done'));
      setDone(true);tl?.kill();
    };
    function skip(event:Event){
      event.preventDefault();event.stopPropagation();
      if(skipped)return;
      skipped=true;removeListeners();startNow();tl?.timeScale(4);
    }
    function key(event:KeyboardEvent){if(['Escape','Enter',' '].includes(event.key))skip(event);}
    el.addEventListener('pointerdown',skip);
    window.addEventListener('keydown',key);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fontTimer:ReturnType<typeof setTimeout>|undefined;
    if(reduced){
      window.dispatchEvent(new Event('intro:prewarm'));
      window.dispatchEvent(new Event('intro:reveal'));
      context.add(()=>{tl=gsap.timeline({onComplete:finish}).to(el,{opacity:0,duration:.4});});
    }else{
      const ready=new Promise<void>(resolve=>{startNow=resolve;fontTimer=setTimeout(resolve,1200);});
      void Promise.race([document.fonts.ready,ready]).then(()=>{
        clearTimeout(fontTimer);
        if(!active)return;
        context.add(()=>{
          const w=window.innerWidth,h=window.innerHeight,F=Math.max(80,.14*Math.min(w,h));
          const state={r:-F};
          el.style.setProperty('--f',F+'px');el.style.setProperty('--band',.14*Math.min(w,h)+'px');
          el.style.setProperty('--r',state.r+'px');
          tl=gsap.timeline({onComplete:finish})
            .fromTo('.si-logo',{opacity:0},{opacity:1,duration:.2},.3)
            .fromTo('.si-logo',{scale:.92},{scale:1,duration:.9,ease:'expo.out'},.3)
            .fromTo('.si-ring',{strokeDashoffset:1},{strokeDashoffset:0,duration:.55,ease:'power2.out'},.3)
            .fromTo('.si-tick',{strokeDashoffset:1},{strokeDashoffset:0,duration:.35,ease:'power2.out'},.8)
            .to('.si-skip',{opacity:1,duration:.4},.8)
            .fromTo('.si-letter',{opacity:0,y:24,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.5,stagger:.045,ease:'power3.out'},1)
            .call(()=>{window.dispatchEvent(new Event('intro:prewarm'));},[],1.9)
            .to('.si-logo',{scale:1.03,duration:.5,ease:'sine.inOut'},1.9)
            .to('.si-content',{scale:1.15,opacity:0,filter:'blur(6px)',duration:.4,ease:'power2.in'},2.3)
            .to('.si-skip',{opacity:0,duration:.2},2.3)
            .call(()=>{window.dispatchEvent(new Event('intro:reveal'));},[],2.4)
            .to(state,{r:Math.hypot(w/2,h/2)+F+10,duration:1.2,ease:'power2.inOut',onUpdate:()=>{el.style.setProperty('--r',state.r+'px');}},2.4)
            .fromTo('.si-grid',{opacity:0},{opacity:1,duration:.2},2.4)
            .to('.si-grid',{opacity:0,duration:.5},3.1)
            .fromTo('.si-grid-lines',{scale:1},{scale:1.08,duration:1.2},2.4)
            .fromTo('.si-veil',{opacity:.45},{opacity:0,duration:1.2,ease:'power2.out'},2.4)
            .fromTo(document.getElementById('main'),{scale:1.05,transformOrigin:'50% 35%'},{scale:1,duration:1.2,ease:'expo.out'},2.4);
          if(skipped)tl.timeScale(4);
        });
      });
    }
    return()=>{active=false;clearTimeout(fontTimer);removeListeners();context.revert();};
  },[]);
  if(done)return null;
  return <div ref={rootRef} id="site-intro" role="button" tabIndex={0} aria-label="Skip intro" onClick={event=>{event.preventDefault();event.stopPropagation();}}>
    <div className="si-veil"/>
    <div className="si-grid"><div className="si-grid-lines"/></div>
    <div className="si-paper"/>
    <div className="si-content">
      <svg className="si-logo" aria-hidden="true" viewBox="368 361 520 520" fill="none">
        <defs><linearGradient id="si-ring" x1="420" y1="414" x2="800" y2="830" gradientUnits="userSpaceOnUse"><stop stopColor="#00b894"/><stop offset="1" stopColor="#0097d6"/></linearGradient></defs>
        <path className="si-ring" pathLength="1" d="M776 475C738 435 685 413 628 413C513 413 419 506 419 621C419 736 513 829 628 829C691 829 748 802 790 756" stroke="url(#si-ring)" strokeWidth="46" strokeLinecap="round"/>
        <path className="si-tick" pathLength="1" d="M522 631L598 707L805 455" stroke="#00b8d4" strokeWidth="50" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div className="si-text" aria-label="Auto Check">{Array.from('Auto Check').map((letter,index)=><span key={index} className="si-letter" aria-hidden="true">{letter===' '?'\u00A0':letter}</span>)}</div>
    </div>
    <div className="si-skip">{t('点击跳过','Click to skip')}</div>
  </div>;
}
