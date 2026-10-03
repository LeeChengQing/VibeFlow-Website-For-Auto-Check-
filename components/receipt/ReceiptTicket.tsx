'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { toPng } from 'html-to-image';
import { Download, LoaderCircle } from 'lucide-react';
import { useLocale } from '../LocaleProvider';
import { getOrderPlanDisplay } from '@/lib/plans';
import type { Order } from '@/lib/types';
import { AdmitOneTicket } from '../ui/admit-one-ticket';
import styles from './receipt-ticket.module.css';

const MASK_RECEIPT_EMAIL = true;
function maskEmail(email: string) { if (!MASK_RECEIPT_EMAIL) return email; const [name, domain] = email.split('@'); return `${name.slice(0, 1)}•••••@${domain ?? ''}`; }

export function ReceiptTicket({ order, includedItems, error, onOpenSupport, onRefresh, refreshing }: {
  order: Order; includedItems: string[]; error: string; onOpenSupport: string; onRefresh: () => void; refreshing: boolean;
}) {
  const { locale, t } = useLocale();
  const frameRef = useRef<HTMLDivElement>(null); const ticketRef = useRef<HTMLDivElement>(null); const ticketImageRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0); const [shaderEnabled, setShaderEnabled] = useState(false); const [shaderMoving, setShaderMoving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false); const [downloadError, setDownloadError] = useState('');
  const plan = getOrderPlanDisplay(order.plan, locale); const amount = order.amount; const finalAmount = `RM ${(amount / 100).toFixed(2)}`;
  const dateLabel = order.paidAt ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-MY', { dateStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(order.paidAt)) : '';
  const ticketWidth = Math.max(320, Math.min(width, 680));

  async function handleDownloadTicket() {
    const ticketImage = ticketImageRef.current;
    if (!ticketImage || isDownloading) return;
    setIsDownloading(true); setDownloadError('');
    try {
      const dataUrl = await toPng(ticketImage, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.href = dataUrl; link.download = 'VibeFlow-Ticket.png';
      document.body.appendChild(link); link.click(); link.remove();
    } catch {
      setDownloadError(t('无法生成票券图片，请重试。', 'Could not generate the ticket image. Please try again.'));
    } finally {
      setIsDownloading(false);
    }
  }

  useEffect(() => { const node = frameRef.current; if (!node) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => {
    let gl: WebGL2RenderingContext | null = null;
    try { gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
    setShaderEnabled(Boolean(gl)); gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }, []);
  useEffect(() => {
    const node = frameRef.current;
    if (!node || !shaderEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let onScreen = false; let frozen = false;
    const sync = () => setShaderMoving(onScreen && !document.hidden && !frozen);
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    observer.observe(node);
    document.addEventListener('visibilitychange', sync);
    const freeze = window.setTimeout(() => { frozen = true; setShaderMoving(false); }, 2500);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); window.clearTimeout(freeze); };
  }, [shaderEnabled]);
  useEffect(() => {
    const ticket = ticketRef.current; const amountNode = amountRef.current; if (!ticket || !amountNode) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key = `vf-receipt-viewed:${order.reference}`; const replay = new URLSearchParams(window.location.search).get('replay') === '1';
    const viewed = sessionStorage.getItem(key) === '1';
    if (reduce || (viewed && !replay)) { ticket.dataset.animationState = 'finished'; ticket.dataset.animationPlayed = 'false'; amountNode.textContent = finalAmount; return; }
    ticket.dataset.animationPlayed = 'true'; ticket.dataset.animationState = 'running';
    const timeline = gsap.timeline({ onComplete: () => { ticket.dataset.animationState = 'finished'; sessionStorage.setItem(key, '1'); } });
    timeline.fromTo(ticket, { autoAlpha: 0, y: 18, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' });
    const counter = { value: 0 };
    gsap.to(counter, { value: amount / 100, duration: 0.7, delay: 0.5, ease: 'power1.out', onUpdate: () => { amountNode.textContent = `RM ${counter.value.toFixed(2)}`; }, onComplete: () => { amountNode.textContent = finalAmount; } });
    return () => { timeline.kill(); gsap.killTweensOf(counter); };
  }, [order.reference, amount, finalAmount]);

  return <div className={styles.receipt}>
    <div className={styles.surface} ref={frameRef}>
      <div ref={ticketRef} className={`${styles.ticketFrame} receipt-ticket receipt-stage`}>
        <div ref={ticketImageRef} className={styles.ticketArtwork} style={{ maxWidth: `${ticketWidth}px` }}>
          <AdmitOneTicket name={plan.name} presenter="VibeFlow presents" event="Auto-Check" venue={t('本地测试 · 无真实付款', 'LOCAL TEST · NO REAL PAYMENT')} dates={dateLabel} stubText={order.reference} watermark="PAID" width={ticketWidth} shaderEnabled={shaderEnabled} animate={shaderMoving} />
        </div>
        <button className={styles.downloadButton} type="button" onClick={handleDownloadTicket} disabled={isDownloading} aria-busy={isDownloading} aria-label={t('下载数字凭证', 'Download ticket')} title={t('下载数字凭证', 'Download ticket')}>
          {isDownloading ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
        </button>
        <span className={styles.srOnly}>{finalAmount}</span>
      </div>
      {downloadError && <p className={styles.downloadError} role="alert">{downloadError}</p>}
    </div>
    <section className={styles.details} aria-label={t('付款收据','Payment receipt')}>
      <div className={styles.detailHeading}><span className={styles.paidTag} data-testid="receipt-paid-status">{t('已付款','PAID')}</span><span className={styles.localTag}>{t('本地测试','LOCAL TEST')}</span><span className={styles.spacer} /><span>{t('订单号','ORDER')}</span><code>{order.reference}</code></div>
      <div className={styles.amountRow}><span>{t('金额 / MYR','TOTAL / MYR')}</span><strong ref={amountRef} className={`${styles.amount} receipt-counted-amount`} data-testid="receipt-amount" aria-label={finalAmount}>RM 0.00</strong><span className={styles.srOnly}>{finalAmount}</span></div>
      <div className={`${styles.detailGrid} receipt-info-grid`}><p><span>{t('接收邮箱','Delivery email')}</span><strong>{maskEmail(order.email)}</strong></p><p><span>{t('付款方式','Payment')}</span><strong>{t('模拟付款','Simulated payment')}</strong></p><p className={styles.srOnly}><time dateTime={order.paidAt ?? undefined}>{dateLabel}</time></p></div>
      <ul className={styles.includes}>{includedItems.map(item => <li key={item}>{item}</li>)}</ul>
      <div className={styles.actions}><a href={onOpenSupport}>{t('订单客服','Order support')} ↗</a><button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? t('刷新中…','Refreshing…') : t('刷新状态','Refresh status')}</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    <p className={`${styles.announcement} receipt-announcement`} role="status">{t('模拟付款已完成。','Simulated payment complete.')}</p>
  </div>;
}
