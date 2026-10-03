'use client';

import { memo } from 'react';
import { useLocale } from './LocaleProvider';
import { useSiteConfig } from './SiteConfigProvider';

export const LeftHeroText = memo(function LeftHeroText() {
  const { locale } = useLocale();
  const { config: { hero } } = useSiteConfig();

  return (
    <div className="hero-copy">
      <p className="eyebrow">
        <span className="status-dot" />
        {hero.eyebrow[locale]}
      </p>
      <h1 id="hero-title" aria-label={`${hero.line1[locale]} ${hero.line2[locale]}`}>
        <div className="hero-line-mask" aria-hidden="true">
          <span className="hero-line">{hero.line1[locale]}</span>
        </div>
        <div className="hero-line-mask" aria-hidden="true">
          <span className="hero-line hero-line-accent">{hero.line2[locale]}</span>
        </div>
      </h1>
      <p className="hero-description">
        {hero.description[locale]}
      </p>
      <div className="hero-buttons">
        <a className="button primary" href="#pricing">
          {hero.primaryButton[locale]} <span aria-hidden>↗</span>
        </a>
        <a className="button secondary" href="#workflow">
          {hero.secondaryButton[locale]} <span aria-hidden>↓</span>
        </a>
      </div>
      <p className="hero-note">
        {hero.note[locale]}
      </p>
    </div>
  );
});

export const HeroBase = memo(function HeroBase() {
  const { t } = useLocale();

  return (
    <div className="hero-base">
      <span>SOUTHAMPTON / UOSM STUDENTS</span>
      <span>{t('为你的课程安排而设计', 'DESIGNED AROUND YOUR TIMETABLE')}</span>
      <a href="#showcase" aria-label={t('向下探索', 'Explore below')}>SCROLL TO EXPLORE ↓</a>
    </div>
  );
});
