'use client';

import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { Dithering } from '@paper-design/shaders-react';
import styles from './admit-one-ticket.module.css';

export type AdmitOneTicketProps = {
  name: string;
  presenter: string;
  event: string;
  venue: string;
  dates: string;
  stubText: string;
  watermark: string;
  width: number;
  shaderEnabled?: boolean;
  animate?: boolean;
};

function splitName(name: string) {
  const trimmed = name.trim();
  if (/\s/.test(trimmed)) {
    const words = trimmed.split(/\s+/);
    const lines: string[] = [];
    for (const word of words) {
      const last = lines.length - 1;
      if (last >= 0 && `${lines[last]} ${word}`.length <= 19) lines[last] += ` ${word}`;
      else lines.push(word);
    }
    return lines;
  }
  const chars = Array.from(trimmed);
  if (chars.length <= 8) return [trimmed];
  const midpoint = Math.ceil(chars.length / 2);
  return [chars.slice(0, midpoint).join(''), chars.slice(midpoint).join('')];
}

function fitScale(width: number, lines: number) {
  const base = Math.max(24, Math.min(68, width * (width < 640 ? 0.075 : 0.105)));
  return `clamp(24px, ${base}px, ${lines > 1 ? 56 : 68}px)`;
}

class ShaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('Ticket shader unavailable; using CSS fallback.', error, info.componentStack); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function AdmitOneTicket({ name, presenter, event, venue, dates, stubText, watermark, width, shaderEnabled = true, animate = false }: AdmitOneTicketProps) {
  const lines = splitName(name);
  return <article className={`${styles.ticket} admit-one-ticket`} data-testid="admit-one-ticket" style={{ '--ticket-width': `${Math.max(320, width)}px`, '--name-size': fitScale(width, lines.length) } as CSSProperties} aria-label={`Admit One ticket for ${event}`}>
    <div className={styles.shaderFallback} aria-hidden="true" />
    {shaderEnabled && <ShaderBoundary><Dithering className={styles.shader} colorBack="#050507" colorFront="#2a2f36" shape="warp" type="random" size={1} speed={animate ? 0.35 : 0} scale={0.9} minPixelRatio={1} maxPixelCount={1_200_000} webGlContextAttributes={{ alpha: true, antialias: false, powerPreference: 'low-power' }} aria-hidden="true" /></ShaderBoundary>}
    <div className={styles.gloss} aria-hidden="true" />
    <div className={styles.content}>
      <header className={styles.header}><span>{presenter}</span><span className={styles.status}><i />PAID · LOCAL TEST</span></header>
      <div className={styles.brandRow}><span className={styles.kicker}>SOTON AUTO-CHECK</span><span className={styles.admitLabel}>ADMIT ONE</span></div>
      <h2 className={styles.name}>{lines.map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</h2>
      <div className={styles.rule} />
      <div className={styles.eventRow}><strong>{event}</strong><span>{venue}</span></div>
        <footer className={styles.footer}><span>{dates}</span><span className={styles.ref} data-testid="ticket-reference">{stubText}</span></footer>
      <span className={styles.watermark} aria-hidden="true">{watermark}</span>
    </div>
    <span className={`${styles.perforation} ${styles.left}`} aria-hidden="true" />
    <span className={`${styles.perforation} ${styles.right}`} aria-hidden="true" />
    <svg className={styles.edge} viewBox="0 0 741 425" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="ticket-edge" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".62"/><stop offset=".48" stopColor="#8a9099" stopOpacity=".18"/><stop offset="1" stopColor="#fff" stopOpacity=".4"/></linearGradient></defs><rect x="1" y="1" width="739" height="423" rx="22" fill="none" stroke="url(#ticket-edge)" strokeWidth="1.5" /></svg>
  </article>;
}

export { fitScale, splitName };
