'use client';

import {useEffect, type RefObject} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {subscribeAnimationFrame} from '../lib/animationScheduler';

gsap.registerPlugin(ScrollTrigger);

/** Own the landing page's scroll loop and animations, including SPA cleanup. */
export function useLandingMotion(rootRef:RefObject<HTMLDivElement|null>,locale:string) {
  useEffect(()=>{
    const root=rootRef.current;
    if(!root)return;
    // ScrollTrigger's global media refresh temporarily scrolls to zero. Killing
    // the last triggers during that cycle clears its recorded scroll cache.
    // Preserve reading position across the entire cycle, after GSAP restores.
    let mediaX=window.scrollX,mediaY=window.scrollY;
    const beforeMedia=()=>{mediaX=window.scrollX;mediaY=window.scrollY;};
    const afterMedia=()=>{window.scrollTo({left:mediaX,top:mediaY,behavior:'instant'});ScrollTrigger.update();};
    ScrollTrigger.addEventListener('revert',beforeMedia);
    ScrollTrigger.addEventListener('matchMedia',afterMedia);
    const media=gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)',()=>{
      let active=true;
      const originals=Array.from(root.querySelectorAll<HTMLElement>('.hero-line,.step,.feature')).map(element=>({
        element,transform:element.style.transform,opacity:element.style.opacity,willChange:element.style.willChange,
      }));
      const context=gsap.context(()=>{},root);
      // Lenis only animates anchors. Its non-passive virtual input listeners
      // attach to an inert node, leaving real wheel/trackpad/touch input native.
      const lenis=new Lenis({eventsTarget:document.createElement('div'),lerp:.2,
        autoRaf:false,autoResize:false,smoothWheel:false,syncTouch:false});
      const tick=(timeMs:number)=>lenis.raf(timeMs);
      lenis.on('scroll',ScrollTrigger.update);
      let ticking=false;
      let releaseTick=()=>{};
      const stopTick=()=>{releaseTick();releaseTick=()=>{};ticking=false;};
      const startTick=()=>{if(!ticking){
        // Rebase Lenis before an anchor so time spent with no active tween
        // cannot become its first delta. The shared clock stays GSAP time * 1000.
        gsap.ticker.wake();lenis.time=gsap.ticker.time*1000;ticking=true;
        releaseTick=subscribeAnimationFrame(tick);
      }};
      const interruptAnchor=()=>{if(!ticking)return;stopTick();lenis.stop();lenis.start();};
      const onWheel=(event:WheelEvent)=>{if(!event.ctrlKey)interruptAnchor();};
      const onKey=(event:KeyboardEvent)=>{
        if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
        if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))interruptAnchor();
      };
      window.addEventListener('wheel',onWheel,{passive:true});
      window.addEventListener('touchstart',interruptAnchor,{passive:true});
      window.addEventListener('keydown',onKey);
      const onVisibility=()=>{if(document.hidden)interruptAnchor();};
      document.addEventListener('visibilitychange',onVisibility);
      const dialog=root.querySelector<HTMLDialogElement>('.guide-dialog');
      const syncDialog=()=>{if(dialog?.open){stopTick();lenis.stop();}else lenis.start();};
      const dialogObserver=new MutationObserver(syncDialog);
      if(dialog)dialogObserver.observe(dialog,{attributes:true,attributeFilter:['open']});
      syncDialog();

      // Lenis uses native document scrolling, so no scrollerProxy is needed.
      const refresh=()=>{lenis.resize();ScrollTrigger.refresh();};
      let refreshTimer:ReturnType<typeof setTimeout>;
      const scheduleRefresh=()=>{
        clearTimeout(refreshTimer);
        refreshTimer=setTimeout(()=>{if(active)refresh();},100);
      };
      const resizeObserver=new ResizeObserver(scheduleRefresh);
      resizeObserver.observe(root);
      window.addEventListener('resize',scheduleRefresh,{passive:true});
      root.addEventListener('load',scheduleRefresh,true);
      root.addEventListener('toggle',scheduleRefresh,true);

      const navigate=(event:MouseEvent)=>{
        if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
        if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
        const url=new URL(link.href,location.href);
        if(url.origin!==location.origin||url.pathname!==location.pathname||url.search!==location.search||!url.hash)return;
        let target:HTMLElement|null;
        try{target=document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{return;}
        if(!target)return;
        event.preventDefault();
        if(location.hash!==url.hash)history.pushState(null,'',url.hash);
        // Reconcile any native/keyboard scroll that interrupted the wheel tween.
        stopTick();lenis.stop();lenis.start();
        // Lenis 1.3 honors the site's CSS scroll-padding and scroll-margin.
        lenis.scrollTo(target,{duration:.4,easing:t=>1-Math.pow(1-t,3),onStart:startTick,onComplete:()=>{
          stopTick();
          // Move keyboard focus to the section without changing the scroll position.
          if(!target.hasAttribute('tabindex')){
            target.setAttribute('tabindex','-1');
            target.addEventListener('blur',()=>target.removeAttribute('tabindex'),{once:true});
          }
          target.focus({preventScroll:true});
        }});
      };
      // Capture before Next Link's default hash navigation; its menu handlers still run.
      document.addEventListener('click',navigate,true);

      void document.fonts.ready.then(()=>{
        if(!active)return;
        context.add(()=>{
          gsap.timeline().fromTo(root.querySelectorAll('.hero-line'),
            {yPercent:100,opacity:0,willChange:'transform, opacity'},
            {yPercent:0,opacity:1,duration:1.5,ease:'power4.out',stagger:0.15,clearProps:'transform,opacity,willChange'});

          // The three setup cards form the first staggered group below the hero.
          gsap.fromTo(root.querySelectorAll('.step'),{y:50,opacity:0},
            {y:0,opacity:1,duration:0.8,ease:'power3.out',stagger:0.2,
              onStart:()=>gsap.set(root.querySelectorAll('.step'),{willChange:'transform, opacity'}),
              clearProps:'transform,opacity,willChange',scrollTrigger:{trigger:root.querySelector('.steps'),start:'top 85%',once:true}});

          // Batch actual viewport entries, so two/three-column rows survive resizing.
          const cards=Array.from(root.querySelectorAll<HTMLElement>('.feature'));
          gsap.set(cards,{y:50,opacity:0});
          ScrollTrigger.batch(cards,{start:'top 88%',once:true,interval:0.1,
            onEnter:batch=>{
              if(!active)return;
              context.add(()=>{
                gsap.set(batch,{willChange:'transform, opacity'});
                gsap.to(batch,{y:0,opacity:1,duration:0.8,ease:'power3.out',stagger:0.2,clearProps:'transform,opacity,willChange'});
              });
            }});
        });
        refresh();
      });

      return ()=>{
        active=false;
        clearTimeout(refreshTimer);
        resizeObserver.disconnect();
        window.removeEventListener('resize',scheduleRefresh);
        dialogObserver.disconnect();
        root.removeEventListener('load',scheduleRefresh,true);
        root.removeEventListener('toggle',scheduleRefresh,true);
        document.removeEventListener('click',navigate,true);
        stopTick();
        window.removeEventListener('wheel',onWheel);window.removeEventListener('touchstart',interruptAnchor);
        window.removeEventListener('keydown',onKey);
        document.removeEventListener('visibilitychange',onVisibility);
        lenis.off('scroll',ScrollTrigger.update);
        // Reset native velocity/idle timer before destroying the instance.
        lenis.stop();
        lenis.destroy();
        context.revert();
        // Restore owned properties even when a batched tween was mid-entry.
        originals.forEach(({element,transform,opacity,willChange})=>{
          if(transform)element.style.transform=transform;else element.style.removeProperty('transform');
          if(opacity)element.style.opacity=opacity;else element.style.removeProperty('opacity');
          if(willChange)element.style.willChange=willChange;else element.style.removeProperty('will-change');
        });
      };
    });
    return ()=>{
      const x=window.scrollX,y=window.scrollY;
      ScrollTrigger.removeEventListener('revert',beforeMedia);ScrollTrigger.removeEventListener('matchMedia',afterMedia);
      media.revert();window.scrollTo({left:x,top:y,behavior:'instant'});
    };
  },[rootRef,locale]);
}
