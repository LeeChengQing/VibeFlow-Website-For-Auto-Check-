'use client';

import { useLocale } from './LocaleProvider';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="language-switcher" data-locale={locale} data-locale-feedback="" role="group" aria-label={t('语言', 'Language')}>
      <button type="button" lang="zh-CN" aria-label="中文" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>
        中
      </button>
      <button type="button" lang="en" aria-label="English" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
        EN
      </button>
    </div>
  );
}
