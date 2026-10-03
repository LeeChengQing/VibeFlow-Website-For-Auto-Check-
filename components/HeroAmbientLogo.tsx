'use client';
import {memo,useEffect,useRef} from 'react';
import dynamic from 'next/dynamic';
import styles from './hero-isolation.module.css';
const ElectricLogo=dynamic(()=>import('./ElectricLogo'),{ssr:false,loading:()=>
  <div className="electric-logo"><span className="electric-logo-fallback" style={{maskImage:'url("/vibeflow-electric-mark.png")',backgroundColor:'#00f2fe'}}/></div>});

export const HeroAmbientLogo=memo(function HeroAmbientLogo(){
  const ambientRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const ambient=ambientRef.current;if(!ambient)return;
    // Suspend the static mask/gradient layer as well as ElectricLogo's draws.
    // Visibility preserves geometry and is restored before it enters the view.
    const observer=new IntersectionObserver(([entry])=>{
      ambient.style.visibility=entry.isIntersecting?'visible':'hidden';
    },{rootMargin:'100px'});
    observer.observe(ambient);return()=>{observer.disconnect();ambient.style.removeProperty('visibility');};
  },[]);
  return <div ref={ambientRef} className={`hero-ambient ${styles.ambient}`} aria-hidden="true">
    <ElectricLogo src="/vibeflow-electric-mark.png" color="#00f2fe" glowColor="#4facfe"
      intensity={0.7} scale={0.85} strands={2} bend={0.35} crackle={0.6}
      arcs={0.25} flicker={0.15} speed={0.6} interactive={false}/>
  </div>;
});
