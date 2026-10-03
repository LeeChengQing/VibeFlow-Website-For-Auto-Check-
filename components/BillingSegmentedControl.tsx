'use client';

import { useRef } from 'react';
import {useReducedMotion} from 'framer-motion';
import * as m from 'framer-motion/m';
import { notificationBillingOptions, type NotificationBillingPlan } from '@/lib/plans';
import { useLocale } from './LocaleProvider';
import { billingPeriodText, purchaseText } from '@/lib/purchaseLocale';

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
    onChange(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return <div className="billing-segmented-control" role="tablist" aria-label={purchaseText(locale, 'mobileBillingLabel')}>
      <m.span className="billing-segment-active" aria-hidden="true" initial={false}
        style={{width:'calc((100% - 6px) / 2)',left:3,top:3,bottom:3,right:'auto'}}
        animate={{x:`${selectedIndex*100}%`}}
        transition={shouldReduceMotion?{duration:0}:{duration:0.22,ease:'easeOut'}}/>
      {notificationBillingOptions.map((option, index) => <button
        key={option.id}
        ref={node => { tabRefs.current[index] = node; }}
        id={`${id}-${option.id}`}
        type="button"
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
