'use client';

import { BUNDLE_OFFER_ENDS_AT, displayAmount, getPlanAmount, plans, price } from '@/lib/plans';
import { useLocale } from './LocaleProvider';
import { BuyButton } from './BuyButton';
import { useBundleCountdown } from './useBundleCountdown';

export function BundleOfferCard() {
  const { locale, t } = useLocale();
  const { isOfferActive: offerActive, remainingSeconds: remaining } = useBundleCountdown();
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  return <article className="price-card bundle-card">
    <div className="bundle-card-heading">
      <div>
        <p className="eyebrow">THE ALL-IN-ONE EXPERIENCE</p>
        <h3>{t('完整体验包 (扩展 + 手机通知)','Complete experience (extension + mobile notifications)')}</h3>
        <p>{t('一次搞定签到与提醒，享受无缝体验。','Get check-ins and notifications together for a seamless experience.')}</p>
      </div>
      <span className="bundle-badge">{locale === 'zh' ? '限时特惠' : 'BEST VALUE'}</span>
    </div>
    <div className="bundle-card-content">
      <div className="bundle-offer-summary">
        <div className="bundle-prices">
          {offerActive && <del className="bundle-original-price">{price(plans.bundle.originalAmount)}</del>}
          <strong className="bundle-current-price"><span>RM</span>{displayAmount(getPlanAmount('bundle'))}</strong>
          <small>{t('扩展买断 + 首学期通知','One-time extension + first semester notifications')}</small>
        </div>
        {offerActive && <div className="bundle-countdown">
          <span>{t('优惠倒计时','OFFER ENDS IN')}</span>
          <time dateTime={new Date(BUNDLE_OFFER_ENDS_AT).toISOString()} aria-label={t('优惠剩余时间','Time remaining in offer')}>
            {days}天 {twoDigits(hours)}时 {twoDigits(minutes)}分 {twoDigits(seconds)}秒
          </time>
        </div>}
      </div>
      <ul className="bundle-features">
        <li>{t('Chrome 扩展 ZIP 安装包，下载链接有效 7 天','Chrome extension ZIP, with a 7-day download link')}</li>
        <li>{t('导入课表、管理课程任务与签到历史','Import timetables, manage class tasks, and check history')}</li>
        <li>{t('连接二维码或 Microsoft Forms 签到入口','Connect QR codes or Microsoft Forms check-in links')}</li>
        <li>{t('接收执行、成功、失败、错过和未知状态提醒','Get execution, success, failure, missed, and unknown-status alerts')}</li>
        <li>{t('独立通知密钥，支持 iPhone 与 Android','A personal notification key for iPhone and Android')}</li>
        <li>{t(`首学期通知已包含；之后 ${price(plans.mobile_notification.amount)} / 学期`,`First semester included; then ${price(plans.mobile_notification.amount)} per semester`)}</li>
      </ul>
    </div>
    <BuyButton plan="bundle" className="button primary bundle-buy">{t('立即购买完整体验包','Get the complete bundle')}</BuyButton>
  </article>;
}
