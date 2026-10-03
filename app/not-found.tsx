import Link from 'next/link';
export default function NotFound(){return <div className="portal narrow"><p className="eyebrow">404 / PAGE NOT FOUND</p><h1 className="portal-title">找不到这个页面。</h1><p className="portal-intro">This page doesn’t exist. Check the link or return to the website.</p><Link className="button primary" href="/">回到首页 / Back home ↗</Link></div>;}
