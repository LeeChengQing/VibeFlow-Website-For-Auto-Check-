import {subscribeAnimationFrame} from './animationScheduler';
type Subscriber=(scrolling:boolean)=>void;
const subscribers=new Set<Subscriber>();
let scrolling=false,requested=false,deadline=0,releaseTick:(()=>void)|undefined;
export function isScrollActive(){return requested||scrolling;}
const update=()=>{
  const active=requested&&performance.now()<deadline;
  if(active!==scrolling){scrolling=active;subscribers.forEach(callback=>callback(active));}
  if(!active){requested=false;releaseTick?.();releaseTick=undefined;}
};
// Passive handlers only record activity. All subscribers run from the ticker.
const markActive=(event:Event)=>{
  if(event instanceof WheelEvent&&event.ctrlKey)return;
  requested=true;deadline=performance.now()+120;
  if(!releaseTick)releaseTick=subscribeAnimationFrame(update);
};
export function subscribeScrollActivity(callback:Subscriber){
  if(subscribers.size===0){
    window.addEventListener('scroll',markActive,{passive:true});window.addEventListener('wheel',markActive,{passive:true});window.addEventListener('touchmove',markActive,{passive:true});
  }
  subscribers.add(callback);callback(isScrollActive());
  return()=>{
    subscribers.delete(callback);if(subscribers.size)return;
    window.removeEventListener('scroll',markActive);window.removeEventListener('wheel',markActive);window.removeEventListener('touchmove',markActive);
    releaseTick?.();releaseTick=undefined;scrolling=false;requested=false;deadline=0;
  };
}
