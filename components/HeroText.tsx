'use client';

import { memo } from 'react';
import { useLocale } from './LocaleProvider';

export const LeftHeroText = memo(function LeftHeroText() {
  const { t } = useLocale();

  return (
    <div className="hero-copy">
      <p className="eyebrow">
        <span className="status-dot" />
        {t('为学生的日常，少一点琐碎', 'LESS ADMIN. MORE STUDENT LIFE.')}
      </p>
      <h1 id="hero-title" aria-label={t('一次配置， 告别签到遗漏。', 'Set it up. Stay on track.')}>
        <div className="hero-line-mask" aria-hidden="true">
          <span className="hero-line">{t('一次配置，', 'Set it up.')}</span>
        </div>
        <div className="hero-line-mask" aria-hidden="true">
          <span className="hero-line hero-line-accent">{t('告别签到遗漏。', 'Stay on track.')}</span>
        </div>
      </h1>
      <p className="hero-description">
        {t(
          '让课表与签到自然衔接。为 Southampton / UoSM 学生设计的课程签到辅助，把重复操作交给 Auto-Check。',
          'Bring your timetable and check-ins together. Auto-Check takes the repetition out of your class routine at Southampton / UoSM.',
        )}
      </p>
      <div className="hero-buttons">
        <a className="button primary" href="#pricing">
          {t('选择你的方案', 'Find your package')} <span aria-hidden>↗</span>
        </a>
        <a className="button secondary" href="#workflow">
          {t('了解使用流程', 'See how it works')} <span aria-hidden>↓</span>
        </a>
      </div>
      <p className="hero-note">
        {t('Windows & macOS · 本地保存资料 · 无需注册账号', 'Windows & macOS · Local data · No account required')}
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
