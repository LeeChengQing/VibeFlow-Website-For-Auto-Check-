'use client';

type Listener = (busy: boolean) => void;
const listeners = new Set<Listener>();
let interactionUntil = 0, navigationUntil = 0, busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function isAmbientBusy() { return busy; }

function sync() {
  clearTimeout(timer);
  const remaining = Math.max(interactionUntil, navigationUntil) - performance.now();
  const next = remaining > 0;
  if (next !== busy) { busy = next; listeners.forEach(listener => listener(busy)); }
  if (next) timer = setTimeout(sync, remaining + 1);
}

/** Pause decorative work while a selection transition is in flight. */
export function pauseAmbientInteraction() {
  interactionUntil = performance.now() + 250;
  sync();
}

/** A timeout also recovers from cancelled or failed route navigation. */
export function beginAmbientNavigation() {
  navigationUntil = performance.now() + 5000;
  sync();
}

export function settleAmbientNavigation() {
  if (navigationUntil <= performance.now()) return;
  navigationUntil = performance.now() + 400;
  sync();
}

export function subscribeAmbientActivity(listener: Listener) {
  listeners.add(listener); listener(busy);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearTimeout(timer); interactionUntil = navigationUntil = 0; busy = false; }
  };
}
