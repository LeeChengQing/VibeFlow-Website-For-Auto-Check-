'use client';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { useLocale } from './LocaleProvider';
export function GuideViewer({guide,onClose}:{guide:{src:string;title:string}|null;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null); const {t}=useLocale();
  useEffect(()=>{if(guide)ref.current?.showModal();else ref.current?.close();},[guide]);
  return <dialog ref={ref} className="guide-dialog" data-lenis-prevent="" onClose={onClose} onClick={event=>{if(event.target===ref.current)onClose();}} aria-label={guide?.title}><div className="guide-dialog-head"><h2>{guide?.title}</h2><button className="button small" onClick={onClose} autoFocus>{t('关闭','Close')} ×</button></div>{guide&&<Image src={guide.src} alt={guide.title} width={1024} height={1536} sizes="(max-width:904px) 94vw, 850px" quality={100} loading="eager"/>}</dialog>;
}
