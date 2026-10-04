'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** One shared layout contract for support, purchase bar, menu and keyboard. */
export function MobileFloatingControls() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(max-width: 767px)');
    let frame = 0;
    const visibleActions = new Set<Element>();
    const attributes = ['data-mobile-editing', 'data-mobile-overlay', 'data-mobile-inline'];
    function update() {
      frame = 0;
      if (!media.matches) { attributes.forEach(attr => root.removeAttribute(attr)); return; }
      const focused = document.activeElement instanceof HTMLElement && document.activeElement.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]');
      const viewport = window.visualViewport;
      root.style.setProperty('--mobile-visual-height', `${viewport?.scale === 1 ? Math.min(window.innerHeight, viewport.height) : window.innerHeight}px`);
      const constrained = (viewport?.height ?? window.innerHeight) < 420 || (!!viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 180);
      root.toggleAttribute('data-mobile-editing', focused || constrained);
      root.toggleAttribute('data-mobile-overlay', !!document.querySelector('[data-checkout-open], [data-menu-open], dialog[open], [role=dialog][aria-modal=true]') || pathname.startsWith('/checkout/'));
      root.toggleAttribute('data-mobile-inline', visibleActions.size > 0);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.isIntersecting) visibleActions.add(entry.target); else visibleActions.delete(entry.target); }
      schedule();
    }, { rootMargin: '-56px 0px 0px 0px' });
    document.querySelectorAll('.buy-action, .mobile-inline-cta, .mobile-final-purchase').forEach(el => intersection.observe(el));
    const observer = new MutationObserver(records => {
      // Discover streamed/route content as it mounts, without rescanning on timer text updates.
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('.buy-action, .mobile-inline-cta, .mobile-final-purchase')) intersection.observe(node);
        node.querySelectorAll('.buy-action, .mobile-inline-cta, .mobile-final-purchase').forEach(el => intersection.observe(el));
      }
      for (const el of visibleActions) if (!el.isConnected) visibleActions.delete(el);
      schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-checkout-open', 'data-menu-open', 'open'] });
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
    media.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
      media.removeEventListener('change', schedule); attributes.forEach(attr => root.removeAttribute(attr));
      root.style.removeProperty('--mobile-visual-height');
    };
  }, [pathname]);
  return null;
}
