'use client';
import Image from 'next/image';
import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { displayAmount, price } from '@/lib/plans';
import { useLocale } from './LocaleProvider';
import { Showcase } from './Showcase';
import { BuyButton } from './BuyButton';
import { BundleOfferCard } from './BundleOfferCard';
import { NotificationPricingCard } from './NotificationPricingCard';
import { GuideViewer } from './GuideViewer';
import { useLandingMotion } from './useLandingMotion';
import { MagicBento } from './MagicBento';
import { usePackagePrice, useSiteConfig } from './SiteConfigProvider';
import { MobileFinalPurchase } from './MobilePurchase';

function ExtensionPricingCard() {
  const { locale,t }=useLocale(); const {config}=useSiteConfig();
  const plan=config.packages.find(item=>item.id==='extension')!;
  const amount=usePackagePrice('extension');
  if(!plan.visible)return null;
  return <article className="price-card">
    <p className="eyebrow">THE ESSENTIAL</p>
    <div className="plan-heading"><h3>{plan.name[locale]}</h3>{plan.badge[locale]&&<span className="plan-badge">{plan.badge[locale]}</span>}</div>
    <p>{plan.description[locale]}</p>
    {amount<plan.amount&&<del>{price(plan.amount)}</del>}
    <div className="price"><span>RM</span>{displayAmount(amount)}<small>/ {t('一次买断','one-time')}</small></div>
    <ul>{plan.features.map((item,index)=><li key={index}>{item[locale]}</li>)}</ul>
    <BuyButton plan="extension" className="button secondary">{t('购买扩展','Get the extension')}</BuyButton>
  </article>;
}

export function Landing({children}:{children:ReactNode}){
  const {t,locale,setLocale}=useLocale();const [guide,setGuide]=useState<{src:string;title:string;alt:string}|null>(null);
  const {config,preview}=useSiteConfig();
  const rootRef=useRef<HTMLDivElement>(null);useLandingMotion(rootRef,locale);
  const features=config.content.features.map(item=>[item.title[locale],item.description[locale]]);
  const guides=config.guides.filter(item=>item.visible).sort((a,b)=>a.order-b.order).map(item=>({...item,title:item.title[locale],sub:item.description[locale],alt:item.alt[locale]}));
  const faqs=config.content.faqs.filter(item=>item.visible);
  const notificationPackages=config.packages.filter(item=>item.visible&&(item.id==='mobile_notification'||item.id==='mobile_notification_yearly')).sort((a,b)=>a.order-b.order);
  const cards=config.packages.filter(item=>item.visible&&(item.id==='bundle'||item.id==='extension')).map(item=>({id:item.id,order:item.order}));
  if(notificationPackages.length)cards.push({id:notificationPackages[0].id,order:notificationPackages[0].order});
  cards.sort((a,b)=>a.order-b.order);
  return <div className="landing" ref={rootRef}>
    {preview&&<div className="shell panel" role="status">{t('草稿预览 · 结账已禁用','Draft preview · Checkout disabled')} <button type="button" className="button small secondary" onClick={()=>setLocale(locale==='zh'?'en':'zh')}>{locale==='zh'?'Preview in English':'预览中文'}</button></div>}
    {config.settings.maintenance&&<div className="shell panel" role="status">{config.settings.maintenanceMessage[locale]}</div>}
    {config.content.announcementEnabled&&<div className="shell panel" role="status">{config.content.announcement[locale]}</div>}
    {!config.settings.checkoutEnabled&&!config.settings.maintenance&&!preview&&<div className="shell panel" role="status">{t('结账暂不可用，请稍后再来。','Checkout is currently unavailable. Please check back soon.')}</div>}
    {children}
    <Showcase/>
    <section id="workflow" className="shell section" aria-labelledby="workflow-title"><div className="section-heading"><div><p className="eyebrow">HOW IT WORKS / 01</p><h2 id="workflow-title">{t('开始，其实很简单。','Simple from the start.')}</h2></div><p>{t('选对方案，完成设置，回到你的课程。','Pick your package, get set up, and get back to your classes.')}</p></div><div className="steps">{[
      [t('选择你的方案','Choose your package'),t('选择完整体验包，或单独购买扩展与手机通知。','Choose the complete bundle or buy the extension and notifications separately.')],
      [t('完成付款','Complete checkout'),t('正式上线后前往 HitPay 安全付款，并填写接收邮箱。','At live checkout, pay securely through HitPay and enter your delivery email.')],
      [t('配置，即可开始','Set up and get going'),t('收到 ZIP 链接或通知密钥，跟随下方图文教程设置。','Receive your ZIP link or notification key, then follow the setup guides below.')],
    ].map(([title,description],i)=><article className="step" key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section id="pricing" className="shell section pricing-section" aria-labelledby="pricing-title">
      <div className="section-heading"><div><p className="eyebrow">YOUR PACKAGE / 02</p><h2 id="pricing-title">{t('选择适合你的方式。','Just what you need.')}</h2></div><p>{t('完整体验包优惠，或按需单独选择扩展与手机通知。','Choose the bundle offer or pick either individual plan.')}</p></div>
      <div className="pricing-grid">
        {cards.map(item=>item.id==='bundle'?<BundleOfferCard key={item.id}/>:item.id==='extension'?<ExtensionPricingCard key={item.id}/>:<NotificationPricingCard key="notification"/>)}
      </div>
      <p className="pricing-note">{config.content.purchaseNotice[locale]}</p>
    </section>
    <section id="product" className="shell section product-section" aria-labelledby="product-title"><div className="section-heading"><div><p className="eyebrow">THE DETAILS / 03</p><h2 id="product-title">{t('少一点重复，','Less repetition.')}<br/><span className="muted">{t('多一点安心。','More peace of mind.')}</span></h2></div><p>{t('从课表导入，到签到结果。每一步都清楚。','From your timetable to your results, every step stays clear.')}</p></div><MagicBento className="product-bento-grid" items={features.map(([title,body],i)=>({id:`feature-${i}`,className:`feature ${i===0||i===5?'bento-wide':''}`,content:<><span className="feature-number">0{i+1}</span><h3>{title}</h3><p>{body}</p>{(i===0||i===5)&&<div className="bento-format-list" aria-hidden="true">{(i===0?['PDF','JPG / JPEG','PNG']:['Windows','macOS','Chrome']).map(label=><span key={label}>{label}</span>)}</div>}</>}))}/><div className="product-workflow"><span>{t('上传课表','Import timetable')}</span><span aria-hidden>→</span><span>{t('绑定入口','Connect form')}</span><span aria-hidden>→</span><span>{t('填写资料','Add details')}</span><span aria-hidden>→</span><span>{t('确认任务','Confirm tasks')}</span><span aria-hidden>→</span><span>{t('执行签到','Check in')}</span></div></section>
    <section className="shell section"><div className="notification-banner"><div><p className="eyebrow">A LITTLE EXTRA PEACE OF MIND</p><h2>{t('结果，在手机上见。','Updates. In your pocket.')}</h2><p>{t('开通手机通知，完成一次 ntfy 设置。执行、成功、失败、错过时间或状态未知，及时掌握。','Add notifications and set up ntfy once. Get execution, success, failure, missed, and unknown-status updates on your phone.')}</p><a className="text-link" href="#tutorials">{t('查看手机配置教程','See the phone setup guides')} ↗</a></div><div className="phone-preview" aria-label={t('通知效果示意','Illustrative notification preview')}><span>9:41</span><div className="phone-notification"><Image src="/files/logo.png" alt="" width="32" height="32" sizes="32px" quality={100}/><div><small>AUTO-CHECK <span>now</span></small><strong>{t('签到成功','Check-in successful')}</strong><p>{t('课程签到已完成。安心上课吧。','Your class check-in is complete.')}</p></div></div><p className="phone-caption">{t('通知示意 · 实际状态以执行结果为准','Illustration · Actual results may vary')}</p></div></div></section>
    <section id="tutorials" className="shell section" aria-labelledby="tutorial-title"><div className="section-heading"><div><p className="eyebrow">GET SET UP / 04</p><h2 id="tutorial-title">{t('跟着做，轻松开始。','A guide for every step.')}</h2></div><p>{t('电脑安装与手机配置。点击图片查看完整教程。','Computer installation and phone setup. Open a guide to see every step.')}</p></div><div className="guide-grid">{guides.map(g=><button className="guide-card" key={g.src} onClick={()=>setGuide(g)}><div className="guide-image"><Image src={g.src} alt={g.alt} unoptimized={g.src.startsWith('/api/')} width={1024} height={1536} sizes="(max-width:767px) calc(100vw - 44px), (max-width:1240px) calc((100vw - 105px)/2), 567px" quality={100} loading="lazy"/><span>{t('查看完整教程','View full guide')} ↗</span></div><div className="guide-caption"><p className="eyebrow">{g.label}</p><h3>{g.title}</h3><p>{g.sub}</p></div></button>)}</div><div className="video-section">{config.settings.videoUrl?<video controls preload="metadata" src={config.settings.videoUrl} aria-label={t('完整教学视频','Complete tutorial video')}/>:<><span className="video-play" aria-hidden>▷</span><div><p className="eyebrow">THE COMPLETE WALKTHROUGH</p><h3>{t('完整教学视频','The complete video guide')}</h3><p>{t('即将上线。现在可以先使用上面的图文教程。','Coming soon. Get started with the illustrated guides above.')}</p></div><span className="coming-soon">{t('即将上线','COMING SOON')}</span></>}</div></section>
    <section className="shell section faq-section" aria-labelledby="faq-title"><div><p className="eyebrow">A FEW GOOD QUESTIONS / 05</p><h2 id="faq-title">{t('还有疑问？','Good questions.')}<br/><span className="muted">{t('这里有答案。','Clear answers.')}</span></h2>{config.settings.supportUrl&&<Link prefetch={true} className="text-link" href={config.settings.supportUrl}>{t('和我们聊聊','Talk to us')} ↗</Link>}{config.settings.supportEmail&&<p><a className="text-link" href={`mailto:${config.settings.supportEmail}`}>{config.settings.supportEmail}</a></p>}</div><div className="faq-list">{faqs.map(item=><details key={item.id}><summary>{item.question[locale]}<span aria-hidden>+</span></summary><p>{item.answer[locale]}</p></details>)}</div></section>
    <section className="shell final-cta"><p className="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h2>{t('课表安排好。','Timetable sorted.')}<br/><span className="muted">{t('下一节，安心上课。','Bring on the semester.')}</span></h2><a href="#pricing" className="button primary desktop-final-purchase">{t('选择你的方案','Find your package')} ↗</a><MobileFinalPurchase /></section>
    <GuideViewer guide={guide} onClose={()=>setGuide(null)}/>
  </div>;
}

