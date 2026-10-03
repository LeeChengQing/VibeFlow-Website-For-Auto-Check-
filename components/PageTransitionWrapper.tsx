'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import * as m from 'framer-motion/m';
import styles from './page-transition.module.css';

const entry = { opacity: 0, transform: 'translate3d(0, 15px, 0)' };
const settled = {
  opacity: 1,
  transform: 'translate3d(0, 0, 0)',
  transitionEnd: { transform: 'none' },
};

export function PageTransitionWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const element = useRef<HTMLDivElement>(null);

  return (
    <m.div
      // Root templates only remount for their own segment. This also covers
      // deeper pathname changes without replaying for query or hash changes.
      key={pathname}
      ref={element}
      className={styles.page}
      data-page-transition=""
      initial={entry}
      animate={settled}
      transition={{
        type: 'tween',
        duration: reducedMotion ? 0 : 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ willChange: 'transform, opacity' }}
      onAnimationStart={() => {
        if (!reducedMotion) element.current?.style.setProperty('will-change', 'transform, opacity');
      }}
      onAnimationComplete={() => element.current?.style.removeProperty('will-change')}
    >
      {children}
    </m.div>
  );
}
