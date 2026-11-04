'use client';
import {memo,useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import styles from './hero-isolation.module.css';
const ElectricLogo=dynamic(()=>import('./ElectricLogo'),{ssr:false,loading:()=>
  <div className="electric-logo"><span className="electric-logo-fallback" style={{maskImage:'url("/vibeflow-electric-mark.png")',backgroundColor:'#00f2fe'}}/></div>});

export const HeroAmbientLogo=memo(function HeroAmbientLogo(){
  const ambientRef=useRef<HTMLDivElement>(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(document.documentElement.dataset.intro!=='playing'){setReady(true);return;}
    const reveal=()=>setReady(true);
    window.addEventListener('intro:prewarm',reveal,{once:true});
    window.addEventListener('intro:done',reveal,{once:true});
    return()=>{window.removeEventListener('intro:prewarm',reveal);window.removeEventListener('intro:done',reveal);};
  },[]);
  useEffect(()=>{
    const ambient=ambientRef.current;if(!ambient)return;
    // Suspend the static mask/gradient layer as well as ElectricLogo's draws.
    // Visibility preserves geometry and is restored before it enters the view.
    const observer=new IntersectionObserver(([entry])=>{
      ambient.style.visibility=entry.isIntersecting?'visible':'hidden';
    },{rootMargin:'100px'});
    observer.observe(ambient);return()=>{observer.disconnect();ambient.style.removeProperty('visibility');};
  },[]);
  return <div ref={ambientRef} className={`hero-ambient contain-layout contain-paint transform-gpu ${styles.ambient}`} aria-hidden="true">
    {ready ? <ElectricLogo src="/vibeflow-electric-mark.png" color="#00f2fe" glowColor="#4facfe"
      intensity={0.7} scale={0.85} strands={2} bend={0.35} crackle={0.6}
      arcs={0.25} flicker={0.15} speed={0.6} interactive={false}/> : <div className="electric-logo"><span className="electric-logo-fallback" style={{maskImage:'url("/vibeflow-electric-mark.png")',backgroundColor:'#00f2fe'}}/></div>}
  </div>;
});
