'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import dynamic from 'next/dynamic';
const ElectricLogo=dynamic(()=>import('./ElectricLogo'),{ssr:false,loading:()=>
  <div className="electric-logo"><span className="electric-logo-fallback" style={{maskImage:'url("/vibeflow-electric-mark.png")',backgroundColor:'#00f2fe'}}/></div>});
import {useLocale} from './LocaleProvider';

export function HeroAmbientLogo(){
  const [paused,setPaused]=useState(false);
  const [toggleRoot,setToggleRoot]=useState<HTMLElement|null>(null);
  const ambientRef=useRef<HTMLDivElement>(null);
  const {t}=useLocale();
  useEffect(()=>{
    const ambient=ambientRef.current;if(!ambient)return;
    // Suspend the static mask/gradient layer as well as ElectricLogo's draws.
    // Visibility preserves geometry and is restored before it enters the view.
    const observer=new IntersectionObserver(([entry])=>{
      ambient.style.visibility=entry.isIntersecting?'visible':'hidden';
    },{rootMargin:'100px'});
    observer.observe(ambient);return()=>{observer.disconnect();ambient.style.removeProperty('visibility');};
  },[]);
  useEffect(()=>{
    setToggleRoot(document.getElementById('hero-ambient-toggle-slot'));
  },[]);
  return <>
    <div ref={ambientRef} className="hero-ambient" aria-hidden="true">
      <ElectricLogo src="/vibeflow-electric-mark.png" color="#00f2fe" glowColor="#4facfe"
        intensity={0.7} scale={0.85} strands={2} bend={0.35} crackle={0.6}
        arcs={0.25} flicker={0.15} speed={0.6} interactive={false} paused={paused}/>
    </div>
    {toggleRoot&&createPortal(
      <button className="ambient-toggle" onClick={()=>setPaused(!paused)} aria-pressed={paused}>
        {paused?t('播放光效','Play glow'):t('暂停光效','Pause glow')}
      </button>,
      toggleRoot,
    )}
  </>;
}
