'use client';

import { useRef } from 'react';
import {useReducedMotion} from 'framer-motion';
import * as m from 'framer-motion/m';
import { type NotificationBillingPlan } from '@/lib/plans';
import { useLocale } from './LocaleProvider';
import { billingPeriodText, purchaseText } from '@/lib/purchaseLocale';
import { notificationOptions, useSiteConfig } from './SiteConfigProvider';

export function BillingSegmentedControl({
  value,
  onChange,
  id,
}: {
  value: NotificationBillingPlan;
  onChange: (value: NotificationBillingPlan) => void;
  id: string;
}) {
  const { locale } = useLocale();
  const shouldReduceMotion = useReducedMotion();
  const { config } = useSiteConfig();
  const notificationBillingOptions = notificationOptions(config);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = notificationBillingOptions.findIndex(option => option.id === value);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % notificationBillingOptions.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + notificationBillingOptions.length) % notificationBillingOptions.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = notificationBillingOptions.length - 1;
    else return;

    event.preventDefault();
    const next = notificationBillingOptions[nextIndex];
    if (!next.enabled) {
      const direction = event.key === 'ArrowLeft' || event.key === 'End' ? -1 : 1;
      for (let offset = 1; offset < notificationBillingOptions.length; offset++) {
        const candidateIndex = (nextIndex + direction * offset + notificationBillingOptions.length) % notificationBillingOptions.length;
        if (notificationBillingOptions[candidateIndex].enabled) {
          onChange(notificationBillingOptions[candidateIndex].id);
          tabRefs.current[candidateIndex]?.focus();
          return;
        }
      }
      return;
    }
    onChange(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

  if (!notificationBillingOptions.length) return null;
  return <div className="billing-segmented-control" role="tablist" aria-label={purchaseText(locale, 'mobileBillingLabel')}>
      <m.span className="billing-segment-active" aria-hidden="true" initial={false}
        style={{width:`calc((100% - 6px) / ${notificationBillingOptions.length})`,left:3,top:3,bottom:3,right:'auto'}}
        animate={{x:`${selectedIndex*100}%`}}
        transition={shouldReduceMotion?{duration:0}:{duration:0.22,ease:'easeOut'}}/>
      {notificationBillingOptions.map((option, index) => <button
        key={option.id}
        ref={node => { tabRefs.current[index] = node; }}
        id={`${id}-${option.id}`}
        type="button"
        disabled={!option.enabled}
        role="tab"
        aria-selected={value === option.id}
        aria-controls={`${id}-price`}
        tabIndex={value === option.id ? 0 : -1}
        className="billing-segment"
        onClick={() => onChange(option.id)}
        onKeyDown={event => handleKeyDown(event, index)}
      >
        <span className="billing-segment-label">{billingPeriodText(locale, option.id)}</span>
      </button>)}
    </div>;
}
