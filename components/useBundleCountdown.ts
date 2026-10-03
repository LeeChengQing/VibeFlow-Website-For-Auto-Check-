'use client';

import { useEffect, useState } from 'react';
import { useOfferActive, useSiteConfig } from './SiteConfigProvider';

type CountdownListener = (remainingSeconds: number) => void;
const listeners = new Map<CountdownListener, number>();
let intervalId: number | null = null;

function remainingSeconds(endsAt: number, now = Date.now()) { return Math.max(0, Math.ceil((endsAt - now) / 1000)); }
function stopCountdown() { if (intervalId !== null) window.clearInterval(intervalId); intervalId = null; }
function publishCountdown() {
  const now = Date.now();
  listeners.forEach((endsAt, listener) => listener(remainingSeconds(endsAt, now)));
  if (![...listeners.values()].some(endsAt => endsAt > now)) stopCountdown();
}
function startCountdown() {
  if (intervalId !== null || document.hidden || ![...listeners.values()].some(endsAt => endsAt > Date.now())) return;
  intervalId = window.setInterval(publishCountdown, 1000);
}
function handleVisibilityChange() { if (document.hidden) stopCountdown(); else { publishCountdown(); startCountdown(); } }

/** All visible countdowns share one timer, including a draft preview with its own end date. */
export function subscribeBundleCountdown(listener: CountdownListener, endsAt: number) {
  listeners.set(listener, endsAt);
  listener(remainingSeconds(endsAt));
  if (listeners.size === 1) document.addEventListener('visibilitychange', handleVisibilityChange);
  startCountdown();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { stopCountdown(); document.removeEventListener('visibilitychange', handleVisibilityChange); }
  };
}

export function useBundleCountdown(enabled = true) {
  const { config, initialNow } = useSiteConfig();
  const active = useOfferActive();
  const endsAt = Date.parse(config.offer.endsAt);
  const [remaining, setRemaining] = useState(() => remainingSeconds(endsAt, initialNow || Date.now()));
  useEffect(() => {
    if (!enabled || !active || !config.offer.showCountdown) return;
    return subscribeBundleCountdown(setRemaining, endsAt);
  }, [enabled, active, config.offer.showCountdown, endsAt]);
  return { isOfferActive: active, remainingSeconds: active ? remaining : 0 };
}
