'use client';

import { useEffect, useState } from 'react';
import { BUNDLE_OFFER_ENDS_AT } from '@/lib/plans';

type CountdownListener = (remainingSeconds: number) => void;
const INITIAL_SECONDS = 10 * 24 * 60 * 60;
const listeners = new Set<CountdownListener>();
let intervalId: number | null = null;

function getRemainingSeconds() {
  return Math.max(0, Math.ceil((BUNDLE_OFFER_ENDS_AT - Date.now()) / 1000));
}

function stopCountdown() {
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
}

function publishCountdown() {
  const remaining = getRemainingSeconds();
  listeners.forEach(listener => listener(remaining));
  if (remaining === 0) stopCountdown();
}

function startCountdown() {
  if (intervalId !== null || document.hidden || getRemainingSeconds() === 0) return;
  intervalId = window.setInterval(publishCountdown, 1000);
}

function handleVisibilityChange() {
  if (document.hidden) stopCountdown();
  else {
    publishCountdown();
    startCountdown();
  }
}

export function subscribeBundleCountdown(listener: CountdownListener) {
  listeners.add(listener);
  listener(getRemainingSeconds());
  if (listeners.size === 1) document.addEventListener('visibilitychange', handleVisibilityChange);
  startCountdown();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopCountdown();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

export function useBundleCountdown() {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => subscribeBundleCountdown(setSecondsRemaining), []);

  const remaining = secondsRemaining ?? INITIAL_SECONDS;
  return {
    isOfferActive: remaining > 0,
    remainingSeconds: remaining,
  };
}
