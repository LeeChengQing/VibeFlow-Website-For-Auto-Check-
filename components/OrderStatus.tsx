'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from './LocaleProvider';
import { api, errorCopy } from '@/lib/client';
import { getOrderPlanDisplay, isNotificationPlan, price } from '@/lib/plans';
import type { Order } from '@/lib/types';

const ReceiptTicket = dynamic(() => import('./receipt/ReceiptTicket').then(module => module.ReceiptTicket), {
  loading: () => <div className="receipt-loading" role="status">Loading your ticket…</div>,
});

export function OrderStatus({ token }: { token: string }) {
  const { locale, t } = useLocale();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setBusy(true); setError('');
    try { setOrder(await api<Order>(`/api/orders/${token}`)); }
    catch (e) { setError(errorCopy(e, t)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [token]);

  async function copyDelivery() {
    if (!order?.delivery) return;
    try { await navigator.clipboard.writeText(order.delivery); setCopied(true); }
    catch { setError(t('无法复制密钥，请手动选择并复制。', 'Could not copy the key. Please select and copy it manually.')); }
  }

  if (!order) return <section className="portal narrow"><p className={error ? 'form-error' : 'loading-state'} role={error ? 'alert' : undefined}>{error || t('加载中…', 'Loading…')}</p><Link prefetch={true} className="button" href="/">{t('回到首页', 'Back home')}</Link></section>;

  const isPaid = order.status === 'paid';
  const status = { pending: t('等待付款', 'Awaiting payment'), paid: t('模拟付款成功', 'Simulated payment complete'), cancelled: t('付款已取消', 'Payment cancelled'), refunded: t('订单已退款', 'Order refunded') }[order.status];
  const expired = order.expiresAt ? Date.now() > new Date(order.expiresAt).getTime() : false;
  const plan = getOrderPlanDisplay(order.plan, locale);
  const receiptItems = order.plan === 'bundle'
    ? [t('课程签到浏览器扩展 · 一次买断', 'Class check-in browser extension · one-time'), t('手机通知服务 · 首学期已包含', 'Mobile notifications · first semester included')]
    : isNotificationPlan(order.plan)
      ? [plan.period ? `${plan.name} · ${plan.period}` : plan.name]
      : [t('Chrome 扩展 ZIP 安装包', 'Chrome extension ZIP package')];
  const canCopyDelivery = Boolean(order.delivery && order.plan !== 'extension' && !expired);
  const supportHref = order.email ? `/support?reference=${encodeURIComponent(order.reference)}&email=${encodeURIComponent(order.email)}` : '/support';

  return <section className={`portal order-page pb-32 ${isPaid ? 'is-paid' : ''}`}>
    <div className="order-layout">
      <section className="order-copy" aria-labelledby="order-page-title">
        <Link prefetch={true} className="back-link" href="/">← {t('回到网站', 'Back to website')}</Link>
        <p className="eyebrow">YOUR ORDER / LOCAL PREVIEW</p>
        <h1 id="order-page-title" className="portal-title">{status}</h1>
        <p className="portal-intro">{t('保存此专属链接，以便查看订单状态和联系客服。', 'Keep this private link to check your order and contact support.')}</p>
      </section>

      <div className="order-receipt-column w-full max-w-md xl:max-w-lg">
        {isPaid ? <ReceiptTicket order={order} includedItems={receiptItems} error={error} onOpenSupport={supportHref} onRefresh={refresh} refreshing={busy} /> : <section className="panel order-plain-card" aria-label={t('订单详情', 'Order details')}>
          <span className={`status-badge ${order.status}`}>{status}</span>
          <div className="status-display">
            <div className="row"><span>{t('订单号', 'Reference')}</span><strong>{order.reference}</strong></div>
            <div className="row"><span>{t('方案', 'Package')}</span><strong>{plan.name}</strong></div>
            <div className="row"><span>{t('金额', 'Amount')}</span><strong>{price(order.amount)}</strong></div>
            {order.email && <div className="row"><span>{t('接收邮箱', 'Delivery email')}</span><strong>{order.email}</strong></div>}
          </div>
          {order.status === 'cancelled' && <p className="notice">{t('没有扣款或交付内容。你可以重新选择方案。', 'No money was collected and nothing was delivered. You can choose a package again.')}</p>}
          {order.status === 'refunded' && <p className="notice">{t('交付预览已停用。', 'The delivery preview has been disabled.')}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="portal-actions">
            {order.status === 'pending' ? <Link prefetch={true} className="button primary" href={`/checkout/${token}`}>{t('继续测试付款', 'Continue test checkout')} ↗</Link> : <Link prefetch={true} className="button primary" href="/#pricing">{t('查看方案', 'Browse packages')} ↗</Link>}
            <Link prefetch={true} className="button" href={supportHref}>{t('订单客服', 'Order support')}</Link>
            <button className="button" onClick={refresh} disabled={busy}>{t('刷新状态', 'Refresh status')}</button>
          </div>
        </section>}
      </div>

      {isPaid && <section className="delivery-preview order-delivery-column" aria-labelledby="delivery-preview-title">
        <h2 id="delivery-preview-title">{t('交付内容预览', 'Delivery preview')}</h2>
        {expired ? <p>{t('链接已过期，请联系客服重新处理。', 'The link has expired. Please contact support.')}</p> : <>
          {order.plan === 'extension' && <p>{t('正式接通后，此处会提供有效期为 7 天的安全 ZIP 下载链接。当前未附带真实扩展文件。', 'Once live services are connected, a secure ZIP link valid for 7 days will appear here. No real extension file is attached.')}</p>}
          {isNotificationPlan(order.plan) && <><p className="delivery-key">{order.delivery}</p><p>{t('DEMO 密钥仅用于测试，无法激活手机通知。', 'This DEMO key is a test value and cannot activate notifications.')}</p></>}
          {order.plan === 'bundle' && <>
            <p>{t('扩展：这里会提供有效期为 7 天的安全 ZIP 下载链接。当前未附带真实扩展文件。', 'Extension: a secure ZIP download link valid for 7 days would appear here. No real extension file is attached.')}</p>
            <p className="delivery-key-label">{t('首学期手机通知 DEMO 密钥：', 'First-semester mobile notification DEMO key: ')}</p>
            <p className="delivery-key">{order.delivery}</p>
            <p>{t('DEMO 密钥仅用于测试，无法激活手机通知。', 'This DEMO key is for testing only and cannot activate mobile notifications.')}</p>
          </>}
          {order.expiresAt && <p className="order-expiry">{t('预览有效期至：', 'Preview expiry: ')}{new Date(order.expiresAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} MYT</p>}
          {canCopyDelivery && <button className="button small delivery-copy" onClick={copyDelivery} aria-label={t('复制 DEMO 通知密钥', 'Copy DEMO notification key')}>{copied ? t('已复制', 'Copied') : t('复制密钥', 'Copy key')}</button>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="portal-actions order-paid-actions"><Link prefetch={true} className="button primary" href="/#pricing">{t('查看方案', 'Browse packages')} ↗</Link></div>
      </section>}

      <div className="order-notice-column"><div className="local-banner">{t('此订单仅用于本地测试。没有真实付款或邮件交付。', 'This order is for local testing only. No real payment or email delivery took place.')}</div>{isPaid && error && <p className="form-error" role="alert">{error}</p>}</div>
    </div>
  </section>;
}
