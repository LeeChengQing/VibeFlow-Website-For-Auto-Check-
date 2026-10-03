import type { ReactNode } from 'react';
import { HeroAmbientLogo } from './HeroAmbientLogo';
import { HeroBase, LeftHeroText } from './HeroText';
import styles from './hero-isolation.module.css';

// Server Component: the interactive card is composed by app/page.tsx.
export function Hero({ children }: { children: ReactNode }) {
  return (
    <section id="hero" className={`hero shell ${styles.hero}`} aria-labelledby="hero-title">
      <HeroAmbientLogo />
      <div className="hero-grid">
        <div className={styles.copyColumn}>
          <LeftHeroText />
        </div>
        {children}
      </div>
      <HeroBase />
    </section>
  );
}
