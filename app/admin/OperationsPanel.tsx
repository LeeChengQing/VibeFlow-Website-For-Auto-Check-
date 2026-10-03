'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { operationAction } from './operations-actions';
import { getOrderPlanDisplay, price } from '@/lib/plans';
import type { SiteOperation, SiteOperationsData } from '@/lib/site-operations';

const field = 'w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/60';
const button = 'rounded-xl border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
function timestamp(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(value));
}

export function OperationsOverview({ data }: { data: SiteOperationsData }) {
  const paid = data.orders.filter(order => order.status === 'paid');
  const stats = [
    ['Local orders', String(data.orders.length)],
    ['Simulated paid total', price(paid.reduce((sum, order) => sum + order.amount, 0))],
    ['Open support tickets', String(data.tickets.filter(ticket => ticket.status === 'open').length)],
    ['Simulated refunds', String(data.orders.filter(order => order.status === 'refunded').length)],
  ];
  if (!data.local) return <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">Order and support metrics are unavailable here. Existing commerce tools run only in the local preview.</p>;
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs text-white/55">{label}</p><p className="mt-2 break-words text-2xl font-semibold text-white">{value}</p></div>)}</div>;
}

export function OperationsPanel({ data }: { data: SiteOperationsData }) {
  const [tab, setTab] = useState<'orders' | 'tickets'>('orders');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState('');
  const [email, setEmail] = useState('');
  const [reply, setReply] = useState('');
  const [feedback, setFeedback] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  const needle = query.trim().toLowerCase();
  const orders = data.orders.filter(order => (!status || order.status === status) && `${order.reference} ${order.email} ${order.plan}`.toLowerCase().includes(needle));
  const tickets = data.tickets.filter(ticket => (!status || ticket.status === status) && `${ticket.subject} ${ticket.email} ${ticket.reference}`.toLowerCase().includes(needle));
  const order = tab === 'orders' ? data.orders.find(item => item.id === selected) : undefined;
  const ticket = tab === 'tickets' ? data.tickets.find(item => item.id === selected) : undefined;
  const linkedOrder = ticket?.reference ? data.orders.find(item => item.reference === ticket.reference) : undefined;

  function perform(action: SiteOperation, payload: { email?: string; message?: string } = {}) {
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await operationAction(action, selected, payload);
        setFeedback(result);
        if ('ok' in result && action === 'reply') setReply('');
      } catch { setFeedback({ error: 'Could not reach the server. Refresh and try again.' }); }
    });
  }
  function changeTab(value: 'orders' | 'tickets') { setTab(value); setStatus(''); setSelected(''); setFeedback({}); setReply(''); }
  function select(id: string, deliveryEmail = '') { if (pending) return; setSelected(id); setEmail(deliveryEmail); setFeedback({}); setReply(''); }

  if (!data.local) return <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Orders & support</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Local commerce operations are unavailable on this host. Live payments and email delivery have not been connected. Use the authenticated localhost preview to manage test orders and support tickets.</p></section>;

  return <section className="space-y-5" aria-label="Local orders and support">
    <div><h2 className="text-xl font-semibold text-white">Orders & support</h2><p className="mt-1 text-sm text-white/55">Local test data · no live payments or email sending · all times MYT</p></div>
    <OperationsOverview data={data} />
    <div className="flex flex-wrap gap-2" role="group" aria-label="Record type">{(['orders', 'tickets'] as const).map(value => <button key={value} type="button" className={`${button} ${tab === value ? 'bg-white/10' : ''}`} aria-pressed={tab === value} onClick={() => changeTab(value)}>{value === 'orders' ? 'Orders' : 'Support tickets'}</button>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="min-w-0 flex-1"><span className="mb-1 block text-xs text-white/55">Search {tab}</span><input className={field} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'orders' ? 'Reference, email or package' : 'Subject, email or order reference'} /></label><label className="sm:w-44"><span className="mb-1 block text-xs text-white/55">Status</span><select className={field} value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{(tab === 'orders' ? ['pending', 'paid', 'cancelled', 'refunded'] : ['open', 'closed']).map(value => <option value={value} key={value}>{value}</option>)}</select></label></div>
    {feedback.error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{feedback.error}</p>}
    {feedback.message && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-200">{feedback.message}</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm"><caption className="sr-only">Searchable local {tab}</caption><thead className="bg-white/5 text-xs text-white/50"><tr><th className="p-3">{tab === 'orders' ? 'Reference / buyer' : 'Subject / customer'}</th><th className="p-3">Status</th><th className="p-3">{tab === 'orders' ? 'Amount' : 'Order'}</th></tr></thead><tbody className="divide-y divide-white/10 text-white/80">{tab === 'orders' ? orders.map(item => <tr key={item.id} className={selected === item.id ? 'bg-white/5' : ''}><td className="p-3"><button type="button" className="text-left font-medium text-emerald-200 hover:underline" onClick={() => select(item.id, item.email)}>{item.reference}</button><p className="mt-1 max-w-56 break-words text-xs text-white/45">{item.email || 'No email yet'}</p></td><td className="p-3">{item.status}</td><td className="whitespace-nowrap p-3">{price(item.amount)}</td></tr>) : tickets.map(item => <tr key={item.id} className={selected === item.id ? 'bg-white/5' : ''}><td className="p-3"><button type="button" className="max-w-64 break-words text-left font-medium text-emerald-200 hover:underline" onClick={() => select(item.id)}>{item.subject}</button><p className="mt-1 max-w-56 break-words text-xs text-white/45">{item.email}</p></td><td className="p-3">{item.status}</td><td className="p-3">{item.reference || '—'}</td></tr>)}{(tab === 'orders' ? orders : tickets).length === 0 && <tr><td colSpan={3} className="p-8 text-center text-white/45">No {tab} match this search.</td></tr>}</tbody></table>
      </div>
      <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-5">
        {!order && !ticket && <p className="text-sm text-white/50">Select a record to view its details and available actions.</p>}
        {order && <div className="space-y-4"><h3 className="break-words text-lg font-medium text-white">{order.reference}</h3><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-white/45">Package</dt><dd className="break-words text-white">{getOrderPlanDisplay(order.plan, 'en').name}</dd><dt className="text-white/45">Amount</dt><dd className="text-white">{price(order.amount)} · {order.status}</dd><dt className="text-white/45">Created</dt><dd className="text-white">{timestamp(order.createdAt)}</dd><dt className="text-white/45">Paid</dt><dd className="text-white">{timestamp(order.paidAt)}</dd><dt className="text-white/45">Link expires</dt><dd className="text-white">{timestamp(order.expiresAt)}</dd><dt className="text-white/45">Refreshes</dt><dd className="text-white">{order.resends}</dd><dt className="text-white/45">ZIP release</dt><dd className="break-words text-white">{order.extensionRelease?.label || 'No release captured'}</dd></dl><Link className="inline-block text-sm text-emerald-200 underline" href={`/order/${order.token}`} target="_blank" rel="noopener noreferrer">Open private customer preview ↗</Link>{order.status === 'paid' && <><form className="space-y-2" onSubmit={event => { event.preventDefault(); perform('resend', { email }); }}><label className="block text-sm text-white/60" htmlFor="operation-email">Correct delivery email & refresh link</label><input className={field} id="operation-email" type="email" maxLength={254} required value={email} disabled={pending} onChange={event => setEmail(event.target.value)} /><button className={button} disabled={pending} type="submit">Refresh local delivery</button><p className="text-xs leading-5 text-white/40">Updates the saved email and renews delivery for 7 days. No email is sent.</p></form><div className="border-t border-white/10 pt-4"><p className="mb-2 text-xs leading-5 text-white/45">A simulated refund disables this order’s delivery. No money is moved.</p><button className={`${button} border-red-300/25 text-red-200`} disabled={pending} onClick={() => perform('refund')}>Record simulated refund</button></div></>}</div>}
        {ticket && <div className="space-y-4"><h3 className="break-words text-lg font-medium text-white">{ticket.subject}</h3><p className="break-words text-sm text-white/60">{ticket.email} · {ticket.status}<br />Created {timestamp(ticket.createdAt)}</p>{ticket.reference && <div className="rounded-xl border border-white/10 p-3 text-sm text-white/65"><p>Linked order: {ticket.reference}</p>{linkedOrder ? <><p className="mt-1">{getOrderPlanDisplay(linkedOrder.plan, 'en').name} · {price(linkedOrder.amount)} · {linkedOrder.status}</p><p className="mt-1 break-words">Current email: {linkedOrder.email}</p><Link className="mt-2 inline-block text-emerald-200 underline" href={`/order/${linkedOrder.token}`} target="_blank" rel="noopener noreferrer">Open order preview ↗</Link></> : <p className="mt-1">Linked order is unavailable.</p>}</div>}<div className="max-h-96 space-y-3 overflow-y-auto" aria-label="Ticket conversation">{ticket.messages.map(message => <article key={message.id} className={`rounded-xl p-3 ${message.author === 'admin' ? 'bg-emerald-300/5' : 'bg-black/20'}`}><p className="mb-2 text-xs text-white/40">{message.author === 'admin' ? 'Support' : 'Customer'} · {timestamp(message.createdAt)}</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-white/80">{message.body}</p></article>)}</div>{ticket.status === 'open' && <form className="space-y-2" onSubmit={event => { event.preventDefault(); perform('reply', { message: reply }); }}><label htmlFor="operation-reply" className="text-sm text-white/60">Reply to customer</label><textarea className={field} id="operation-reply" rows={4} required maxLength={4000} value={reply} disabled={pending} onChange={event => setReply(event.target.value)} /><button className={button} type="submit" disabled={pending || !reply.trim()}>Save reply</button><p className="text-xs text-white/40">Reply appears on the private ticket page. No email is sent.</p></form>}<button className={button} disabled={pending} onClick={() => perform(ticket.status === 'open' ? 'close' : 'reopen')}>{ticket.status === 'open' ? 'Close ticket' : 'Reopen ticket'}</button></div>}
      </div>
    </div>
    {pending && <p role="status" className="text-sm text-white/50">Saving the local record…</p>}
  </section>;
}
