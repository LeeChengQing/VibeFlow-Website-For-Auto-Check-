'use client';
import Link from 'next/link';
import { useLocale } from './LocaleProvider';
export function SiteFooter(){const {t}=useLocale(); return <footer className="site-footer"><div className="footer-top"><Link href="/" className="brand">Vibeflow<span className="brand-muted">_MY</span></Link><p>{t('少一点重复操作，多一点安心。','Less repetition. More peace of mind.')}</p><Link href="/support">{t('需要帮助？','Need a hand?')} ↗</Link></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Vibeflow_MY</span><span>{t('专为 Southampton / UoSM 学生设计 · 非学校官方产品','Built for Southampton / UoSM students · Independent product')}</span><Link href="/admin">{t('管理后台','Admin')}</Link></div></footer>;}
