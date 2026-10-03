'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Locale } from '@/lib/plans';
type LocaleContext={locale:Locale; setLocale:(locale:Locale)=>void; t:(zh:string,en:string)=>string};
const Context=createContext<LocaleContext>({locale:'en',setLocale:()=>{},t:(_zh,en)=>en});
export function LocaleProvider({children}:{children:React.ReactNode}) {
  const [locale,setState]=useState<Locale>('en');
  useEffect(()=>{ const value=localStorage.getItem('vf-locale'); if(value==='en'||value==='zh') setState(value); },[]);
  useEffect(()=>{document.documentElement.lang=locale==='zh'?'zh-CN':'en';},[locale]);
  function setLocale(value:Locale) { setState(value); localStorage.setItem('vf-locale',value); }
  return <Context.Provider value={{locale,setLocale,t:(zh,en)=>locale==='zh'?zh:en}}>{children}</Context.Provider>;
}
export function useLocale() {return useContext(Context);}
