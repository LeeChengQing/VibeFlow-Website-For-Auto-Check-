'use client';

import { MOBILE_VIEWPORT_QUERY } from '@/lib/mobileViewport';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** One shared layout contract for support, purchase bar, menu and keyboard. */
export function MobileFloatingControls() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/checkout') return;
    const root = document.documentElement;
    const media = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    let frame = 0;
    const visibleActions = new Set<Element>();
    const purchaseSelector = '.buy-action, .mobile-inline-cta, .mobile-final-purchase';
    const overlaySelector = '[data-checkout-open], [data-menu-open], dialog[open], [role=dialog][aria-modal=true]';
    const attributes = ['data-mobile-editing', 'data-mobile-overlay', 'data-mobile-inline'];
    function update() {
      frame = 0;
      if (!media.matches) { attributes.forEach(attr => root.removeAttribute(attr)); return; }
      const focused = document.activeElement instanceof HTMLElement && document.activeElement.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]');
      const viewport = window.visualViewport;
      const constrained = (viewport?.height ?? window.innerHeight) < 420 || (!!viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 180);
      root.toggleAttribute('data-mobile-editing', focused || constrained);
      root.toggleAttribute('data-mobile-overlay', !!document.querySelector(overlaySelector) || pathname.startsWith('/checkout/'));
      root.toggleAttribute('data-mobile-inline', visibleActions.size > 0);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.isIntersecting) visibleActions.add(entry.target); else visibleActions.delete(entry.target); }
      schedule();
    }, { rootMargin: '-56px 0px 0px 0px' });
    const watch = (node: HTMLElement, callback: (el: Element) => void) => {
      if (node.matches(purchaseSelector)) callback(node);
      node.querySelectorAll(purchaseSelector).forEach(callback);
    };
    document.querySelectorAll(purchaseSelector).forEach(el => intersection.observe(el));
    const observer = new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        if (record.type === 'attributes') changed = true;
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          watch(node, el => intersection.observe(el));
          if (node.matches(overlaySelector) || node.querySelector(overlaySelector)) changed = true;
        }
        for (const node of record.removedNodes) {
          if (!(node instanceof HTMLElement) || node.isConnected) continue;
          watch(node, el => { intersection.unobserve(el); changed = visibleActions.delete(el) || changed; });
          if (node.matches(overlaySelector) || node.querySelector(overlaySelector)) changed = true;
        }
      }
      if (changed) schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-checkout-open', 'data-menu-open', 'open'] });
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
    media.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
      media.removeEventListener('change', schedule); attributes.forEach(attr => root.removeAttribute(attr));
    };
  }, [pathname]);
  return null;
}
