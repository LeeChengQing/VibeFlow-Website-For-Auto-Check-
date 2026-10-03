'use client';
// Adapted from React Bits MagicBento. License: ../licenses/react-bits.txt
import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {isLowEffects,subscribeEffectsPolicy} from '../lib/performancePolicy';
export type BentoItem={id:string;content:ReactNode;className?:string};
export type BentoEffects={glowColor?:string;spotlightRadius?:number;particleCount?:number;
  enableStars?:boolean;enableSpotlight?:boolean;enableBorderGlow?:boolean;enableTilt?:boolean;
  enableMagnetism?:boolean;clickEffect?:boolean;disableAnimations?:boolean};
type MagicBentoProps=BentoEffects&{items:BentoItem[];className?:string};
/** Content is server rendered; only the optional interaction engine is deferred. */
export function MagicBento({items,className='',glowColor='59, 208, 192',spotlightRadius=300,
  particleCount=12,enableStars=true,enableSpotlight=true,enableBorderGlow=true,
  enableTilt=true,enableMagnetism=true,clickEffect=true,disableAnimations=false}:MagicBentoProps){
  const gridRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const grid=gridRef.current;if(!grid||disableAnimations)return;
    let alive=true,dispose:(()=>void)|undefined,loading=false,near=false;
    const load=()=>{
      if(!near||loading||dispose||isLowEffects())return;loading=true;
      void import('../lib/bentoMotion').then(({mountBentoMotion})=>{
        if(alive&&!isLowEffects())dispose=mountBentoMotion(grid,{spotlightRadius,particleCount,enableStars,enableSpotlight,enableTilt,enableMagnetism,clickEffect});
      }).finally(()=>{loading=false;});
    };
    const observer=new IntersectionObserver(entries=>{
      near=!!entries[0]?.isIntersecting;load();
    },{rootMargin:'150px'});
    observer.observe(grid);
    const unsubscribe=subscribeEffectsPolicy(low=>{if(low){dispose?.();dispose=undefined;}else load();});
    return()=>{alive=false;observer.disconnect();unsubscribe();dispose?.();};
  },[disableAnimations,spotlightRadius,particleCount,enableStars,enableSpotlight,enableTilt,enableMagnetism,clickEffect,items.length]);
  return <div ref={gridRef} className={`magic-bento-grid ${className}`} style={{'--glow-color':glowColor,'--glow-radius':`${spotlightRadius}px`} as CSSProperties}>
    <div className="bento-light-field" aria-hidden="true"><div className="bento-spotlight"/></div>
    {items.map(item=><div key={item.id} className={`bento-slot ${item.className||''}`}><article className="magic-bento-card">
      <div className="bento-card-aura" aria-hidden="true"><span/></div>
      {enableBorderGlow&&<div className="bento-card-border" aria-hidden="true"><span/></div>}
      <div className="bento-content">{item.content}</div>
    </article></div>)}
  </div>;
}
