'use client';
import {gsap} from 'gsap';
import type {BentoEffects} from '../components/MagicBento';
import {scheduleAnimationFrame} from './animationScheduler';
import {subscribeScrollActivity,isScrollActive} from './scrollActivity';
type Bounds={left:number;top:number;width:number;height:number};
const measure=(element:HTMLElement,bounds:Bounds)=>{
  bounds.left=0;bounds.top=0;bounds.width=element.offsetWidth;bounds.height=element.offsetHeight;
  // Layout coordinates exclude the entrance/hover transforms. Read only in RO.
  for(let node:HTMLElement|null=element;node;node=node.offsetParent as HTMLElement|null){bounds.left+=node.offsetLeft;bounds.top+=node.offsetTop;}
};
const emptyBounds=():Bounds=>({left:0,top:0,width:0,height:0});
export function mountBentoMotion(grid:HTMLElement,{spotlightRadius=300,particleCount=12,enableStars=true,
  enableSpotlight=true,enableTilt=true,enableMagnetism=true,clickEffect=true}:BentoEffects){
  const media=gsap.matchMedia();
  media.add('(min-width:768px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)',()=>{
    const cards=Array.from(grid.querySelectorAll<HTMLElement>('.magic-bento-card'));
    const spotlight=grid.querySelector<HTMLElement>('.bento-spotlight')!;
    const gridBounds=emptyBounds(),bounds=cards.map(emptyBounds);
    const originals=cards.map(card=>card.style.transform);
    const surfaces=cards.map(card=>Array.from(card.querySelectorAll<HTMLElement>('.bento-card-aura,.bento-card-border')));
    const moves=cards.map(card=>({x:gsap.quickTo(card,'x',{duration:.35,ease:'power3.out'}),
      y:gsap.quickTo(card,'y',{duration:.35,ease:'power3.out'}),rx:gsap.quickTo(card,'rotationX',{duration:.35,ease:'power3.out'}),ry:gsap.quickTo(card,'rotationY',{duration:.35,ease:'power3.out'})}));
    const spotX=gsap.quickTo(spotlight,'x',{duration:.2,ease:'power3.out'}),spotY=gsap.quickTo(spotlight,'y',{duration:.2,ease:'power3.out'}),spotOpacity=gsap.quickTo(spotlight,'opacity',{duration:.25,ease:'power2.out'});
    gsap.set(spotlight,{xPercent:-50,yPercent:-50});
    const particlePool=Array.from({length:enableStars?Math.max(0,Math.min(12,particleCount)):0},(_,index)=>{
      const node=document.createElement('span');node.className='bento-particle';node.setAttribute('aria-hidden','true');
      // Native transform/opacity animation stays on the compositor. Reuse this
      // animation and its node; no per-frame JS/style writes for the stars.
      const animation=node.animate([{transform:'translate(0px,0px) scale(0)',opacity:0},
        {transform:`translate(${(Math.random()-.5)*65}px,${(Math.random()-.5)*65}px) scale(${.6+Math.random()*.6})`,opacity:.75}],
        {duration:1600+Math.random()*1000,delay:index*40,iterations:Infinity,direction:'alternate',easing:'cubic-bezier(.37,0,.63,1)'});
      animation.pause();return {node,animation};
    });
    const ripplePool=Array.from({length:clickEffect?2:0},()=>{
      const node=document.createElement('span');node.className='bento-ripple';node.setAttribute('aria-hidden','true');
      const tween=gsap.fromTo(node,{scale:0,opacity:.65},{scale:1,opacity:0,duration:.8,paused:true,ease:'power2.out',onComplete:()=>node.remove()});
      return {node,tween};
    });
    let alive=true,visible=false,inside=false,scrolling=false,mouseX=0,mouseY=0,hovered=-1,rippleIndex=0;
    let cancelFrame:(()=>void)|undefined;
    const resetHover=(immediate=false)=>{
      if(hovered<0)return;const index=hovered;hovered=-1;
      particlePool.forEach(({node,animation})=>{animation.pause();node.remove();});
      delete cards[index].dataset.hovered;
      const move=moves[index];
      if(immediate){for(const tween of Object.values(move))tween.tween.pause();gsap.set(cards[index],{x:0,y:0,rotationX:0,rotationY:0});}
      else{move.x(0);move.y(0);move.rx(0);move.ry(0);}
    };
    const suspend=(immediate=false)=>{
      resetHover(immediate);
      ripplePool.forEach(({node,tween})=>{tween.pause();node.remove();});
      surfaces.forEach(layers=>layers.forEach(layer=>{layer.style.opacity='0';layer.style.removeProperty('will-change');(layer.firstElementChild as HTMLElement).style.removeProperty('will-change');}));
      if(immediate){spotX.tween.pause();spotY.tween.pause();spotOpacity.tween.pause();gsap.set(spotlight,{opacity:0});}else spotOpacity(0);
      delete grid.dataset.pointerActive;
    };
    const paint=()=>{
      cancelFrame=undefined;if(!alive)return;
      if(!inside||!visible||scrolling||isScrollActive()||document.hidden){if(grid.dataset.pointerActive)suspend(scrolling||isScrollActive()||document.hidden);return;}
      const x=mouseX+window.scrollX,y=mouseY+window.scrollY;
      if(x<gridBounds.left||x>gridBounds.left+gridBounds.width||y<gridBounds.top||y>gridBounds.top+gridBounds.height){inside=false;suspend();return;}
      if(!grid.dataset.pointerActive)grid.dataset.pointerActive='true';spotX(x-gridBounds.left);spotY(y-gridBounds.top);spotOpacity(enableSpotlight?.65:0);
      let next=-1;
      for(let i=0;i<cards.length;i++){
        const rect=bounds[i],localX=x-rect.left,localY=y-rect.top;
        const hit=localX>=0&&localY>=0&&localX<=rect.width&&localY<=rect.height;
        if(hit)next=i;
        const distance=Math.hypot(Math.max(rect.left-x,0,x-rect.left-rect.width),Math.max(rect.top-y,0,y-rect.top-rect.height));
        const opacity=Math.max(0,1-distance/spotlightRadius);
        for(const layer of surfaces[i]){
          const gradient=layer.firstElementChild as HTMLElement;
          layer.style.willChange=opacity>0?'opacity':'';gradient.style.willChange=opacity>0?'transform':'';
          if(opacity>0)gradient.style.transform=`translate(${localX-spotlightRadius}px,${localY-spotlightRadius}px)`;
          layer.style.opacity=String(opacity);
        }
      }
      if(next!==hovered){resetHover();hovered=next;if(next>=0){
        cards[next].dataset.hovered='true';
        for(const {node,animation} of particlePool){node.style.left=`${Math.random()*bounds[next].width}px`;node.style.top=`${Math.random()*bounds[next].height}px`;cards[next].appendChild(node);animation.currentTime=0;animation.play();}
      }}
      if(hovered>=0){const rect=bounds[hovered],localX=x-rect.left,localY=y-rect.top,move=moves[hovered];
        if(enableTilt){move.rx((.5-localY/rect.height)*5);move.ry((localX/rect.width-.5)*5);}
        if(enableMagnetism){move.x((localX-rect.width/2)*.025);move.y((localY-rect.height/2)*.025);}
      }
    };
    const queue=()=>{if(!cancelFrame)cancelFrame=scheduleAnimationFrame(paint);};
    const resizeObserver=new ResizeObserver(()=>{
      measure(grid,gridBounds);cards.forEach((card,index)=>measure(card.parentElement!,bounds[index]));queue();
    });
    resizeObserver.observe(grid);resizeObserver.observe(document.body);cards.forEach(card=>resizeObserver.observe(card.parentElement!));
    const pointer=(event:PointerEvent)=>{if(event.pointerType!=='mouse')return;mouseX=event.clientX;mouseY=event.clientY;inside=true;queue();};
    const leave=()=>{inside=false;queue();};
    const unsubscribe=subscribeScrollActivity(busy=>{scrolling=busy;queue();});
    const observer=new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;if(!visible)inside=false;queue();});observer.observe(grid);
    const click=(event:MouseEvent)=>{
      if(!clickEffect||!event.detail||scrolling||!visible)return;
      const index=cards.findIndex(card=>event.target instanceof Node&&card.contains(event.target));if(index<0)return;
      const rect=bounds[index],radius=Math.hypot(rect.width,rect.height),{node,tween}=ripplePool[rippleIndex++%ripplePool.length];
      tween.pause();node.style.width=node.style.height=`${radius*2}px`;
      node.style.left=`${event.clientX+scrollX-rect.left-radius}px`;node.style.top=`${event.clientY+scrollY-rect.top-radius}px`;
      cards[index].appendChild(node);tween.invalidate().restart();
    };
    const visibility=()=>{if(document.hidden){cancelFrame?.();cancelFrame=undefined;inside=false;suspend(true);}};
    grid.dataset.motion='enabled';
    grid.addEventListener('pointermove',pointer,{passive:true});grid.addEventListener('pointerleave',leave,{passive:true});grid.addEventListener('click',click);
    document.addEventListener('visibilitychange',visibility);
    return()=>{
      alive=false;cancelFrame?.();unsubscribe();observer.disconnect();resizeObserver.disconnect();
      grid.removeEventListener('pointermove',pointer);grid.removeEventListener('pointerleave',leave);grid.removeEventListener('click',click);document.removeEventListener('visibilitychange',visibility);
      suspend(true);particlePool.forEach(({node,animation})=>{animation.cancel();node.remove();});ripplePool.forEach(({node,tween})=>{tween.kill();node.remove();});
      moves.forEach(move=>Object.values(move).forEach(tween=>tween.tween.kill()));spotX.tween.kill();spotY.tween.kill();spotOpacity.tween.kill();
      cards.forEach((card,index)=>{card.style.transform=originals[index];delete card.dataset.hovered;});
      surfaces.forEach(layers=>layers.forEach(layer=>{layer.style.removeProperty('opacity');(layer.firstElementChild as HTMLElement).style.removeProperty('transform');}));
      delete grid.dataset.motion;delete grid.dataset.pointerActive;
    };
  });
  return()=>media.revert();
}
