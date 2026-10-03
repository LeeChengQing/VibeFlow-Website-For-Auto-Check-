export type PlanCode = 'extension' | 'mobile_notification' | 'mobile_notification_yearly' | 'bundle';
export type OrderPlanCode = PlanCode | 'mobile_notification_degree_pass';
export type Locale = 'zh' | 'en';
export type NotificationBillingPlan = 'semester' | 'yearly';
export const BUNDLE_OFFER_ENDS_AT = Date.parse('2026-10-13T23:59:59+08:00');
export const plans = {
  extension: { amount: 2499, zh: '浏览器扩展', en: 'Browser extension', periodZh: '一次买断', periodEn: 'one-time' },
  mobile_notification: { amount: 1199, zh: '手机通知服务', en: 'Mobile notifications', periodZh: '学期', periodEn: 'semester', billingPlan: 'semester' },
  mobile_notification_yearly: { amount: 1999, originalAmount: 2398, zh: '手机通知服务 · 年付', en: 'Mobile notifications · Yearly', periodZh: '年付', periodEn: 'Yearly', billingPlan: 'yearly' },
  bundle: { amount: 3500, originalAmount: 3698, zh: '完整体验包', en: 'Complete experience bundle', periodZh: '扩展买断 + 通知首学期', periodEn: 'one-time extension + first semester notifications' },
} as const;
export const notificationPlanCodes: Record<NotificationBillingPlan, Exclude<PlanCode, 'extension' | 'bundle'>> = {
  semester: 'mobile_notification',
  yearly: 'mobile_notification_yearly',
};
export const notificationBillingOptions = [
  { id: 'semester' },
  { id: 'yearly' },
] as const satisfies ReadonlyArray<{ id: NotificationBillingPlan }>;
export function isPlan(value: unknown): value is PlanCode {
  return value === 'extension' || value === 'mobile_notification' || value === 'mobile_notification_yearly' || value === 'bundle';
}
export function isNotificationPlan(value: OrderPlanCode): value is Exclude<OrderPlanCode, 'extension' | 'bundle'> {
  return value === 'mobile_notification' || value === 'mobile_notification_yearly' || value === 'mobile_notification_degree_pass';
}
export function getOrderPlanDisplay(plan: OrderPlanCode, locale: Locale) {
  if (plan === 'mobile_notification_degree_pass') return { name: 'Degree Pass (legacy)', period: '' };
  const active = plans[plan];
  return { name: locale === 'zh' ? active.zh : active.en, period: locale === 'zh' ? active.periodZh : active.periodEn };
}
export function getPlanAmount(plan: PlanCode, now = Date.now()): number {
  return plan === 'bundle' && now < BUNDLE_OFFER_ENDS_AT ? 3000 : plans[plan].amount;
}
export function price(amount: number) { return `RM ${(amount / 100).toFixed(2)}`; }
export function displayAmount(amount: number) { return (amount / 100).toFixed(2); }
