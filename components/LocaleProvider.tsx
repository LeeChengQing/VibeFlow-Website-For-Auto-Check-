'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Locale } from '@/lib/plans';
type LocaleContext={locale:Locale; setLocale:(locale:Locale)=>void; t:(zh:string,en:string)=>string};
const Context=createContext<LocaleContext>({locale:'en',setLocale:()=>{},t:(_zh,en)=>en});
export function LocaleProvider({children,defaultLocale='en',persist=true}:{children:React.ReactNode;defaultLocale?:Locale;persist?:boolean}) {
  const [locale,setState]=useState<Locale>(defaultLocale);
  useEffect(()=>{ if(!persist)return; const value=localStorage.getItem('vf-locale'); if(value==='en'||value==='zh') setState(value); },[persist]);
  useEffect(()=>{document.documentElement.lang=locale==='zh'?'zh-CN':'en';},[locale]);
  function setLocale(value:Locale) { setState(value); if(persist)localStorage.setItem('vf-locale',value); }
  return <Context.Provider value={{locale,setLocale,t:(zh,en)=>locale==='zh'?zh:en}}>{children}</Context.Provider>;
}
export function useLocale() {return useContext(Context);}
