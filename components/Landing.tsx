'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { getPlanAmount, plans, price, notificationPlanCodes, type NotificationBillingPlan } from '@/lib/plans';
import { purchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { Showcase } from './Showcase';
import { BuyButton } from './BuyButton';
import { BundleOfferCard } from './BundleOfferCard';
import { HeroPurchaseCard } from './HeroPurchaseCard';
import { BillingSegmentedControl } from './BillingSegmentedControl';
import { NotificationPriceDisplay } from './NotificationPriceDisplay';
import { GuideViewer } from './GuideViewer';
import { useLandingMotion } from './useLandingMotion';
import { HeroAmbientLogo } from './HeroAmbientLogo';
import { MagicBento } from './MagicBento';
export function Landing(){
  const {t,locale}=useLocale();const [selectedNotificationPlan,setSelectedNotificationPlan]=useState<NotificationBillingPlan>('yearly'); const [guide,setGuide]=useState<{src:string;title:string}|null>(null);
  const selectedNotificationCode=notificationPlanCodes[selectedNotificationPlan];
  const notificationCta=purchaseText(locale, selectedNotificationPlan === 'yearly' ? 'yearlyCta' : 'semesterCta');
  const rootRef=useRef<HTMLDivElement>(null);useLandingMotion(rootRef,locale);
  const features=[
    [t('你的课表，一次导入','One timetable. One setup.'),t('支持 PDF、JPG、JPEG、PNG，识别课程、星期和时间，并允许手动修改。','Import PDF, JPG, JPEG, or PNG. Review detected classes, days, and times, then make any edits.')],
    [t('连接你的签到入口','Connect your check-in'),t('上传课程二维码或粘贴 Microsoft Forms 链接，匹配 Lecture、Tutorial 和 Lab。','Upload a course QR code or paste a Microsoft Forms link. Match Lectures, Tutorials, and Labs.')],
    [t('每周任务，清晰可见','Your week, laid out'),t('保存学生资料，自动生成每周课程任务，确认后按课程时间执行。','Save your student details, generate weekly tasks, and confirm them before scheduled execution.')],
    [t('结果明确，不猜状态','Clear results, less guessing'),t('仅在 Forms 明确提交成功时显示成功；失败、错过时间和状态未知分别提示。','Success appears only when Forms confirms submission. Failures, missed times, and unknown results stay distinct.')],
    [t('记录留在你手中','A record you can check'),t('查看课程绑定状态和历史签到记录，资料保存在本地 Chrome 中。','Check course connections and past results. Your student information stays in local Chrome storage.')],
    [t('适配你现有的电脑','Made for your computer'),t('支持 Windows 和 macOS，使用 Chrome 扩展，无需安装 Node.js 或注册云端账号。','Works in Chrome on Windows and macOS. No Node.js installation or cloud account needed.')],
  ];
  const guides=[
    {src:'/files/chrome-windows.jpg',title:t('Chrome 插件安装 · Windows','Chrome extension · Windows'),sub:t('下载 ZIP → 解压 → 开发者模式 → 加载已解压的扩展','Download ZIP → Unzip → Developer mode → Load unpacked'),label:'01 / WINDOWS'},
    {src:'/files/chrome-mac.jpg',title:t('Chrome 插件安装 · macOS','Chrome extension · macOS'),sub:t('下载 ZIP → 解压 → 打开扩展程序 → 加载已解压的扩展','Download ZIP → Unzip → Open extensions → Load unpacked'),label:'02 / MACOS'},
    {src:'/files/ntfy-iphone.jpg',title:t('手机通知配置 · iPhone','Mobile notifications · iPhone'),sub:t('安装 ntfy → 添加 Topic → 允许通知','Install ntfy → Add your topic → Allow notifications'),label:'03 / IPHONE'},
    {src:'/files/ntfy-android.jpg',title:t('手机通知配置 · Android','Mobile notifications · Android'),sub:t('安装 ntfy → 扫描二维码 → 测试通知','Install ntfy → Scan the QR code → Test notifications'),label:'04 / ANDROID'},
  ];
  const faqs=[
    [t('需要同时买扩展和手机通知吗？','Do I need to buy the extension and notifications separately?'),t('不需要。完整体验包包含扩展和首学期手机通知；单独购买手机通知时，需要已有课程签到扩展。','No. The complete bundle includes the extension and first semester of notifications. A standalone notification plan requires the extension.')],
    [t('完整体验包包含什么？','What does the complete bundle include?'),t(`包含一次买断的课程签到扩展和首学期手机通知。限时价 ${price(getPlanAmount('bundle'))}；优惠结束后 ${price(plans.bundle.amount)}。之后续订手机通知为 ${price(plans.mobile_notification.amount)} / 学期。`,`It includes the one-time extension and the first semester of mobile notifications. The offer is ${price(getPlanAmount('bundle'))}, then ${price(plans.bundle.amount)} after it ends. Notification renewals are ${price(plans.mobile_notification.amount)} per semester.`)],
    [t('付款后如何获取内容？','How is my purchase delivered?'),t('完整体验包会包含扩展 ZIP 下载预览和手机通知 DEMO 密钥；正式服务接通后，扩展链接有效 7 天。当前本地版本不会发送邮件或提供真实文件、密钥。','The bundle preview includes an extension ZIP link and a mobile notification DEMO key. Live extension links will be valid for 7 days. This local version sends no email and provides no real files or keys.')],
    [t('电脑需要一直开着吗？','Does my computer need to stay on?'),t('需要。在签到时间保持电脑开机、联网，并确保 Chrome 和扩展可运行。手机通知不会替代电脑执行签到。','Yes. Keep your computer awake, online, and Chrome available at check-in time. Phone notifications do not perform the check-in themselves.')],
    [t('遇到问题如何联系客服？','How do I get help?'),t('点击右下角的动态球或联系客服。提供邮箱及订单号，我们可以查看问题并在工单内回复。请保存你的专属工单链接。','Use the animated orb or the support link. Include your email and order reference, and keep your private ticket link to view replies.')],
  ];
  return <div className="landing" ref={rootRef}>
    <section className="hero shell" aria-labelledby="hero-title">
      <HeroAmbientLogo/>
      <div className="hero-grid"><div className="hero-copy"><p className="eyebrow"><span className="status-dot"/>{t('为学生的日常，少一点琐碎','LESS ADMIN. MORE STUDENT LIFE.')}</p><h1 id="hero-title" aria-label={t('一次配置， 告别签到遗漏。','Set it up. Stay on track.')}><div className="hero-line-mask" aria-hidden="true"><span className="hero-line">{t('一次配置，','Set it up.')}</span></div><div className="hero-line-mask" aria-hidden="true"><span className="hero-line hero-line-accent">{t('告别签到遗漏。','Stay on track.')}</span></div></h1><p className="hero-description">{t('让课表与签到自然衔接。为 Southampton / UoSM 学生设计的课程签到辅助，把重复操作交给 Auto-Check。','Bring your timetable and check-ins together. Auto-Check takes the repetition out of your class routine at Southampton / UoSM.')}</p><div className="hero-buttons"><a className="button primary" href="#pricing">{t('选择你的方案','Find your package')} <span aria-hidden>↗</span></a><a className="button secondary" href="#workflow">{t('了解使用流程','See how it works')} <span aria-hidden>↓</span></a></div><p className="hero-note">{t('Windows & macOS · 本地保存资料 · 无需注册账号','Windows & macOS · Local data · No account required')}</p></div>
      <HeroPurchaseCard/></div>
      <div className="hero-base"><span>SOUTHAMPTON / UOSM STUDENTS</span><span>{t('为你的课程安排而设计','DESIGNED AROUND YOUR TIMETABLE')}</span><a href="#showcase" aria-label={t('向下探索','Explore below')}>SCROLL TO EXPLORE ↓</a></div>
    </section>
    <Showcase/>
    <section id="workflow" className="shell section" aria-labelledby="workflow-title"><div className="section-heading"><div><p className="eyebrow">HOW IT WORKS / 01</p><h2 id="workflow-title">{t('开始，其实很简单。','Simple from the start.')}</h2></div><p>{t('选对方案，完成设置，回到你的课程。','Pick your package, get set up, and get back to your classes.')}</p></div><div className="steps">{[
      [t('选择你的方案','Choose your package'),t('选择完整体验包，或单独购买扩展与手机通知。','Choose the complete bundle or buy the extension and notifications separately.')],
      [t('完成付款','Complete checkout'),t('正式上线后前往 HitPay 安全付款，并填写接收邮箱。','At live checkout, pay securely through HitPay and enter your delivery email.')],
      [t('配置，即可开始','Set up and get going'),t('收到 ZIP 链接或通知密钥，跟随下方图文教程设置。','Receive your ZIP link or notification key, then follow the setup guides below.')],
    ].map(([title,description],i)=><article className="step" key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section id="pricing" className="shell section pricing-section" aria-labelledby="pricing-title">
      <div className="section-heading"><div><p className="eyebrow">YOUR PACKAGE / 02</p><h2 id="pricing-title">{t('选择适合你的方式。','Just what you need.')}</h2></div><p>{t('完整体验包优惠，或按需单独选择扩展与手机通知。','Choose the bundle offer or pick either individual plan.')}</p></div>
      <div className="pricing-grid">
        <BundleOfferCard/>
        <article className="price-card">
          <p className="eyebrow">THE ESSENTIAL</p>
          <div className="plan-heading"><h3>{t('浏览器扩展','Browser extension')}</h3><span className="plan-badge">{t('一次买断','YOURS TO KEEP')}</span></div>
          <p>{t('把每周签到，变成更简单的日常。','A simpler routine for your weekly class check-ins.')}</p>
          <div className="price"><span>RM</span>{(plans.extension.amount / 100).toFixed(2)}<small>/ {t('一次买断','one-time')}</small></div>
          <ul>{[t('Chrome ZIP 安装包','Chrome extension ZIP'),t('课表导入与课程任务','Timetable import & class tasks'),t('二维码 / Microsoft Forms 绑定','QR code / Microsoft Forms connection'),t('本地资料与历史记录','Local data & check-in history'),t('7 天有效的下载链接','Download link valid for 7 days')].map(x=><li key={x}>{x}</li>)}</ul>
          <BuyButton plan="extension" className="button secondary">{t('购买扩展','Get the extension')}</BuyButton>
        </article>
        <article className="price-card featured">
          <p className="eyebrow">STAY IN THE LOOP</p>
          <div className="plan-heading"><h3>{t('手机通知服务','Mobile notifications')}</h3><span className="plan-badge">{t('扩展附加服务','EXTENSION ADD-ON')}</span></div>
          <p>{t('不必一直看电脑，也能了解签到结果。','Check your phone, not your computer, for updates.')}</p>
          <BillingSegmentedControl id="pricing-notification" value={selectedNotificationPlan} onChange={setSelectedNotificationPlan}/>
          <NotificationPriceDisplay id="pricing-notification-price" context="pricing" billingPlan={selectedNotificationPlan}/>
          <ul>{[t('执行、成功与失败提醒','Execution, success & failure updates'),t('错过时间与状态未知提醒','Missed & unknown-status alerts'),t('独立手机通知密钥','Your own notification key'),t('支持 iPhone 与 Android','For iPhone & Android'),t('配置教程与客服支持','Setup guides & customer support')].map(x=><li key={x}>{x}</li>)}</ul>
          <BuyButton plan={selectedNotificationCode}>{notificationCta}</BuyButton>
        </article>
      </div>
      <p className="pricing-note">{t(`完整体验包含扩展与首学期通知；单独购买手机通知需已有扩展。续订 ${price(plans.mobile_notification.amount)} / 学期。当前为本地测试，不会扣款。`,`The bundle includes the extension and first notification semester. Standalone notifications require the extension; renewals are ${price(plans.mobile_notification.amount)} per semester. Local test only; no payment is collected.`)}</p>
    </section>
    <section id="product" className="shell section product-section" aria-labelledby="product-title"><div className="section-heading"><div><p className="eyebrow">THE DETAILS / 03</p><h2 id="product-title">{t('少一点重复，','Less repetition.')}<br/><span className="muted">{t('多一点安心。','More peace of mind.')}</span></h2></div><p>{t('从课表导入，到签到结果。每一步都清楚。','From your timetable to your results, every step stays clear.')}</p></div><MagicBento className="product-bento-grid" items={features.map(([title,body],i)=>({id:`feature-${i}`,className:`feature ${i===0||i===5?'bento-wide':''}`,content:<><span className="feature-number">0{i+1}</span><h3>{title}</h3><p>{body}</p>{(i===0||i===5)&&<div className="bento-format-list" aria-hidden="true">{(i===0?['PDF','JPG / JPEG','PNG']:['Windows','macOS','Chrome']).map(label=><span key={label}>{label}</span>)}</div>}</>}))}/><div className="product-workflow"><span>{t('上传课表','Import timetable')}</span><span aria-hidden>→</span><span>{t('绑定入口','Connect form')}</span><span aria-hidden>→</span><span>{t('填写资料','Add details')}</span><span aria-hidden>→</span><span>{t('确认任务','Confirm tasks')}</span><span aria-hidden>→</span><span>{t('执行签到','Check in')}</span></div></section>
    <section className="shell section"><div className="notification-banner"><div><p className="eyebrow">A LITTLE EXTRA PEACE OF MIND</p><h2>{t('结果，在手机上见。','Updates. In your pocket.')}</h2><p>{t('开通手机通知，完成一次 ntfy 设置。执行、成功、失败、错过时间或状态未知，及时掌握。','Add notifications and set up ntfy once. Get execution, success, failure, missed, and unknown-status updates on your phone.')}</p><a className="text-link" href="#tutorials">{t('查看手机配置教程','See the phone setup guides')} ↗</a></div><div className="phone-preview" aria-label={t('通知效果示意','Illustrative notification preview')}><span>9:41</span><div className="phone-notification"><Image src="/files/logo.png" alt="" width="32" height="32" sizes="32px" quality={100}/><div><small>AUTO-CHECK <span>now</span></small><strong>{t('签到成功','Check-in successful')}</strong><p>{t('课程签到已完成。安心上课吧。','Your class check-in is complete.')}</p></div></div><p className="phone-caption">{t('通知示意 · 实际状态以执行结果为准','Illustration · Actual results may vary')}</p></div></div></section>
    <section id="tutorials" className="shell section" aria-labelledby="tutorial-title"><div className="section-heading"><div><p className="eyebrow">GET SET UP / 04</p><h2 id="tutorial-title">{t('跟着做，轻松开始。','A guide for every step.')}</h2></div><p>{t('电脑安装与手机配置。点击图片查看完整教程。','Computer installation and phone setup. Open a guide to see every step.')}</p></div><div className="guide-grid">{guides.map(g=><button className="guide-card" key={g.src} onClick={()=>setGuide(g)}><div className="guide-image"><Image src={g.src} alt={g.title} width={1024} height={1536} sizes="(max-width:767px) calc(100vw - 44px), (max-width:1240px) calc((100vw - 105px)/2), 567px" quality={100} loading="lazy"/><span>{t('查看完整教程','View full guide')} ↗</span></div><div className="guide-caption"><p className="eyebrow">{g.label}</p><h3>{g.title}</h3><p>{g.sub}</p></div></button>)}</div><div className="video-section">{process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_URL?<video controls preload="metadata" src={process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_URL} aria-label={t('完整教学视频','Complete tutorial video')}/>:<><span className="video-play" aria-hidden>▷</span><div><p className="eyebrow">THE COMPLETE WALKTHROUGH</p><h3>{t('完整教学视频','The complete video guide')}</h3><p>{t('即将上线。现在可以先使用上面的图文教程。','Coming soon. Get started with the illustrated guides above.')}</p></div><span className="coming-soon">{t('即将上线','COMING SOON')}</span></>}</div></section>
    <section className="shell section faq-section" aria-labelledby="faq-title"><div><p className="eyebrow">A FEW GOOD QUESTIONS / 05</p><h2 id="faq-title">{t('还有疑问？','Good questions.')}<br/><span className="muted">{t('这里有答案。','Clear answers.')}</span></h2><Link className="text-link" href="/support">{t('和我们聊聊','Talk to us')} ↗</Link></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden>+</span></summary><p>{a}</p></details>)}</div></section>
    <section className="shell final-cta"><p className="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h2>{t('课表安排好。','Timetable sorted.')}<br/><span className="muted">{t('下一节，安心上课。','Bring on the semester.')}</span></h2><a href="#pricing" className="button primary">{t('选择你的方案','Find your package')} ↗</a></section>
    <GuideViewer guide={guide} onClose={()=>setGuide(null)}/>
  </div>;
}

