'use client';
import Image from 'next/image';
import {useReducedMotion} from 'framer-motion';
import * as m from 'framer-motion/m';
import {useRef} from 'react';
import {MagicBento} from './MagicBento';
import { useLocale } from './LocaleProvider';
export function Showcase(){
  const {t}=useLocale();const reduced=useReducedMotion();
  const sectionRef=useRef<HTMLElement>(null);
  const items=[
    {id:'extension',className:'showcase-main',content:<>
      <div className="bento-card-top"><span className="bento-kicker">SOTON AUTO-CHECK</span><span className="bento-pill">Chrome Extension</span></div>
      <h3>{t('签到安排，','Your class routine,')}<br/><span className="bento-muted">{t('一次理顺。','all lined up.')}</span></h3>
      <p>{t('导入课表、连接签到入口，确认每周任务。把重复操作交给扩展。','Import your timetable, connect your check-in, and confirm weekly tasks. Let the extension handle the repetition.')}</p>
      <div className="bento-app-preview" aria-label={t('课程任务界面示意','Illustrative course task preview')}>
        <div className="bento-app-bar"><Image src="/files/logo.png" alt="" width="32" height="32" sizes="32px" quality={100}/><div><strong>Soton Auto-Check</strong><small>{t('每周任务 · 产品示意','Weekly tasks · Preview')}</small></div><span className="bento-status-dot"/></div>
        <div className="bento-task"><span>09:00</span><div><strong>Lecture</strong><small>Microsoft Forms</small></div><span className="task-state">{t('已确认','Confirmed')}</span></div>
        <div className="bento-task"><span>14:00</span><div><strong>Tutorial</strong><small>QR / Forms</small></div><span className="task-state muted-state">{t('待确认','Review')}</span></div>
      </div>
      <div className="bento-card-bottom"><span>Windows & macOS</span><a href="#product">{t('探索功能','Explore features')} <span aria-hidden>↗</span></a></div>
    </>},
    {id:'timetable',className:'showcase-timetable',content:<>
      <div className="bento-card-top"><span className="bento-kicker">01 / TIMETABLE</span><span className="bento-pill">PDF · JPG · PNG</span></div>
      <h3>{t('从课表，到每周任务。','Your timetable, connected.')}</h3>
      <p>{t('识别课程、星期和时间，允许手动修改，再确认 Lecture、Tutorial 和 Lab 任务。','Review detected classes, days, and times. Make edits, then confirm Lectures, Tutorials, and Labs.')}</p>
      <div className="bento-day-strip" aria-hidden="true">{['MON','TUE','WED','THU','FRI'].map((day,i)=><span key={day}><small>{day}</small><i className={i===1||i===3?'day-block short':'day-block'}/></span>)}</div>
    </>},
    {id:'notifications',className:'showcase-notifications',content:<>
      <div className="bento-card-top"><span className="bento-kicker">02 / NOTIFICATIONS</span><span className="bento-pill">iPhone & Android</span></div>
      <h3>{t('结果，在手机上见。','Stay in the loop.')}</h3>
      <p>{t('手机通知是独立附加服务。执行、成功、失败与错过时间，及时掌握。','A separate notification add-on keeps you informed about execution, success, failure, and missed times.')}</p>
      <div className="bento-notification"><Image src="/files/logo.png" alt="" width="30" height="30" sizes="30px" quality={100}/><div><strong>{t('签到成功','Check-in successful')}</strong><small>{t('通知效果示意 · 实际结果以执行状态为准','Notification preview · Actual results may vary')}</small></div><span>now</span></div>
    </>},
    {id:'setup',className:'showcase-stat',content:<><span className="bento-kicker">LESS ADMIN</span><strong className="bento-stat">1<span>×</span></strong><h3>{t('一次配置。','One setup.')}</h3><p>{t('为每周的课程安排留出时间。','More room for your weekly classes.')}</p></>},
    {id:'packages',className:'showcase-stat',content:<><span className="bento-kicker">YOUR CHOICE</span><strong className="bento-stat">2</strong><h3>{t('按需选择。','Your choice.')}</h3><p>{t('扩展与手机通知，两个独立方案。','Extension and notifications, sold separately.')}</p></>},
    {id:'support',className:'showcase-support',content:<><div><span className="bento-kicker">GET SET UP</span><h3>{t('每一步，都有人帮你。','A guide for every step.')}</h3><p>{t('图文安装教程、手机配置说明，以及随时可找到的客服入口。','Illustrated installation guides, phone setup, and an easy way to reach support.')}</p></div><a className="bento-capsule-link" href="#tutorials">{t('查看使用教程','Open the guides')} <span aria-hidden>↗</span></a></>},
  ];
  return <m.section ref={sectionRef} id="showcase" className="shell product-showcase" initial={{opacity:0,y:32}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.08}} transition={{duration:reduced?0:.8,ease:[.22,1,.36,1]}} onViewportEnter={()=>{if(!reduced)sectionRef.current?.style.setProperty('will-change','transform, opacity');}} onAnimationComplete={()=>sectionRef.current?.style.removeProperty('will-change')} aria-labelledby="showcase-title">
    <div className="bento-section-heading"><div><p className="eyebrow">BUILT AROUND YOUR WEEK</p><h2 id="showcase-title">{t('让每周，','A lighter week,')}<br/><span className="bento-muted">{t('轻松一点。','by design.')}</span></h2></div><p>{t('从课表到签到结果。你需要的，都在这里。','From your timetable to your check-in results. Everything you need, in one place.')}</p></div>
    <MagicBento items={items} className="showcase-bento-grid"/>
  </m.section>;
}
