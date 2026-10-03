import type { Metadata } from 'next';
import { LocaleProvider } from '@/components/LocaleProvider';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SupportOrb } from '@/components/SupportOrb';
import {MotionProvider} from '@/components/MotionProvider';
import {PerformanceRuntime} from '@/components/PerformanceRuntime';
import './globals.css';
export const metadata:Metadata={title:'Vibeflow_MY · Auto-Check',description:'Auto-Check — class check-in assistance and mobile notifications for Southampton / UoSM students.',icons:{icon:'/files/logo.png'},robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="zh-CN"><body><MotionProvider><LocaleProvider><PerformanceRuntime/><a className="skip-link" href="#main">Skip to content</a><SiteHeader/><main id="main">{children}</main><SiteFooter/><SupportOrb/></LocaleProvider></MotionProvider></body></html>;}
