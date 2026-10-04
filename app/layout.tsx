import type { Metadata, Viewport } from 'next';
import { LocaleProvider } from '@/components/LocaleProvider';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SupportOrb } from '@/components/SupportOrb';
import {MotionProvider} from '@/components/MotionProvider';
import {PerformanceRuntime} from '@/components/PerformanceRuntime';
import { SiteConfigProvider } from '@/components/SiteConfigProvider';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { DEFAULT_SITE_CONFIG } from '@/lib/site-config';
import './globals.css';
import './mobile.css';
import { MobileFloatingControls } from '@/components/MobileFloatingControls';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export const metadata:Metadata={title:'Vibeflow_MY · Auto-Check',description:'Auto-Check — class check-in assistance and mobile notifications for Southampton / UoSM students.',icons:{icon:'/files/logo.png'},robots:{index:false,follow:false}};
export default async function RootLayout({children}:{children:React.ReactNode}) {
  // Keep the navigation and admin login available during a settings outage.
  // The storefront page still requires its own successful published-settings read.
  const config=await getPublishedSiteConfig().catch(()=>DEFAULT_SITE_CONFIG);
  return <html lang={config.settings.defaultLocale==='zh'?'zh-CN':'en'} className="scroll-smooth" data-scroll-behavior="smooth"><body><MotionProvider><SiteConfigProvider config={config} initialNow={Date.now()}><LocaleProvider defaultLocale={config.settings.defaultLocale}><PerformanceRuntime/><MobileFloatingControls/><a className="skip-link" href="#main">Skip to content</a><SiteHeader/><main id="main" className="min-h-[100dvh] px-4 pb-32 md:px-8 lg:px-12">{children}</main><SiteFooter/><SupportOrb/></LocaleProvider></SiteConfigProvider></MotionProvider></body></html>;
}
