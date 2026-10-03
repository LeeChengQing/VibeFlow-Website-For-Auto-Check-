'use client';
import {LazyMotion} from 'framer-motion';
const loadFeatures=()=>import('./motionFeatures').then(module=>module.default);
export function MotionProvider({children}:{children:React.ReactNode}){
  return <LazyMotion features={loadFeatures} strict>{children}</LazyMotion>;
}
