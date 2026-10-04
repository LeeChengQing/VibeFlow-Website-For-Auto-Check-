import type { Locale, NotificationBillingPlan } from './plans';

const purchaseLocale = {
  zh: {
    semester: '学期',
    yearly: '年付',
    semesterCta: '开通手机通知 · 学期付',
    yearlyCta: '开通手机通知 · 年付',
    from: '低至',
    perSemester: '/ 学期',
    perYear: '/ 年',
    bundleSave: '立省 {amount}',
    savingsPercent: '立省 {percent}%',
    bundleTimerLabel: '完整体验包优惠倒计时',
    compactTimer: '{days}天 {hours}时',
    fullTimer: '{days}天 {hours}时 {minutes}分 {seconds}秒',
    mobileBillingLabel: '手机通知计费周期',
    mobileTimer: '{days}天 {hours}时 {minutes}分',
    mobileShortTimer: '{hours}时 {minutes}分',
  },
  en: {
    semester: 'Semester',
    yearly: 'Yearly',
    semesterCta: 'Enable mobile notifications · Semester',
    yearlyCta: 'Enable mobile notifications · Yearly',
    from: 'From',
    perSemester: '/ semester',
    perYear: '/ year',
    bundleSave: 'Save {amount}',
    savingsPercent: 'Save {percent}%',
    bundleTimerLabel: 'Complete bundle offer countdown',
    compactTimer: '{days}d {hours}h',
    fullTimer: '{days}d {hours}h {minutes}m {seconds}s',
    mobileBillingLabel: 'Mobile notification billing period',
    mobileTimer: '{days}d {hours}h {minutes}m',
    mobileShortTimer: '{hours}h {minutes}m',
  },
} as const;

type PurchaseLocaleKey = keyof typeof purchaseLocale.zh;

export function purchaseText(locale: Locale, key: PurchaseLocaleKey) {
  return purchaseLocale[locale][key];
}

export function billingPeriodText(locale: Locale, plan: NotificationBillingPlan) {
  return purchaseText(locale, plan);
}

export function formatPurchaseText(
  locale: Locale,
  key: 'bundleSave' | 'savingsPercent' | 'compactTimer' | 'fullTimer' | 'mobileTimer' | 'mobileShortTimer',
  values: Record<string, string | number>,
) {
  return purchaseText(locale, key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}
