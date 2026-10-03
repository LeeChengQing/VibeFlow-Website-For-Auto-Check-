'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="portal narrow"><h1 className="portal-title">暂时无法加载。</h1><p className="portal-intro">Something went wrong. Please try again.</p><button className="button primary" onClick={reset}>重试 / Try again</button></div>;}
