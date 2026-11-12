import type { Metadata, Viewport } from 'next';
import {Inter} from 'next/font/google';
import {SiteIntro} from '@/components/SiteIntro';
import { LocaleProvider } from '@/components/LocaleProvider';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SupportOrb } from '@/components/SupportOrb';
import {MotionProvider} from '@/components/MotionProvider';
import {PerformanceRuntime} from '@/components/PerformanceRuntime';
import { SiteConfigProvider } from '@/components/SiteConfigProvider';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { DEFAULT_SITE_CONFIG } from '@/lib/site-config';
import { MOBILE_VIEWPORT_QUERY, TOUCH_VIEWPORT_QUERY } from '@/lib/mobileViewport';
import './globals.css';
import './intro.css';
import './mobile.css';
import { MobileFloatingControls } from '@/components/MobileFloatingControls';
const inter=Inter({subsets:['latin'],weight:['600','700','800'],display:'swap',variable:'--font-inter'});
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light) and (max-width: 900px)', color: '#f7f9fc' },
    { media: '(prefers-color-scheme: light) and (max-width: 1100px) and (max-height: 500px) and (pointer: coarse)', color: '#f7f9fc' },
    { color: '#080809' },
  ],
};
export const metadata:Metadata={title:'Vibeflow_MY · Auto-Check',description:'Auto-Check — class check-in assistance and mobile notifications for Southampton / UoSM students.',icons:{icon:'/files/logo.png'},robots:{index:false,follow:false}};
export default async function RootLayout({children}:{children:React.ReactNode}) {
  // Keep the navigation and admin login available during a settings outage.
  // The storefront page still requires its own successful published-settings read.
  const config=await getPublishedSiteConfig().catch(()=>DEFAULT_SITE_CONFIG);
  const skipIntro = JSON.stringify(`${MOBILE_VIEWPORT_QUERY}, ${TOUCH_VIEWPORT_QUERY}, (prefers-reduced-motion: reduce)`);
  const introScript = `try{var d=document.documentElement;d.dataset.intro=(location.pathname!=='/'||navigator.webdriver||matchMedia(${skipIntro}).matches||sessionStorage.getItem('vf-intro'))?'done':'playing'}catch(e){document.documentElement.dataset.intro='done'}`;
  return <html lang={config.settings.defaultLocale==='zh'?'zh-CN':'en'} className={`scroll-smooth ${inter.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:introScript}}/><noscript><style>{'#site-intro{display:none!important}'}</style></noscript></head><body><MotionProvider><SiteConfigProvider config={config} initialNow={Date.now()}><LocaleProvider defaultLocale={config.settings.defaultLocale}><PerformanceRuntime/><SiteIntro/><MobileFloatingControls/><a className="skip-link" href="#main">Skip to content</a><SiteHeader/><main id="main" className="min-h-[100dvh] px-4 pb-32 md:px-8 lg:px-12">{children}</main><SiteFooter/><SupportOrb/></LocaleProvider></SiteConfigProvider></MotionProvider></body></html>;
}
