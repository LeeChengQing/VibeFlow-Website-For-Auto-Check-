'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PLAN_LABELS, STATUS_LABELS, KEY_PAGE_SIZE, isKeyPlan, type DashboardData } from '@/lib/admin-key-options';
import { generateKeysAction, logoutAction } from './actions';
import { revokeKeyAction } from './site-actions';
import { GeneratedKeysModal, type GeneratedBatch } from './GeneratedKeysModal';
import { adminSurface, field, glassPanel, primaryButton, secondaryButton } from './admin-ui';

const statusStyles = {
  available: 'border-cyan-300/20 bg-cyan-300/5 text-cyan-200',
  redeemed: 'border-emerald-300/20 bg-emerald-300/5 text-emerald-200',
  revoked: 'border-rose-300/20 bg-rose-300/5 text-rose-200',
};
function SignOutButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={secondaryButton}>{pending ? 'Signing out…' : 'Sign out'}</button>;
}
function date(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(value));
}

export function AdminDashboard({ data, showLocalPreview, embedded = false }: { data: DashboardData | null; showLocalPreview: boolean; embedded?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [batch, setBatch] = useState<GeneratedBatch | null>(null);
  const [error, setError] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState('');
  const revokeDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (revokeId) { setRevokeError(''); revokeDialog.current?.showModal(); }
    else revokeDialog.current?.close();
  }, [revokeId]);

  function revoke() {
    if (!revokeId) return;
    setRevokeError('');
    startTransition(async () => {
      try {
        const result = await revokeKeyAction(revokeId);
        if ('error' in result) setRevokeError(result.error);
        else { setRevokeId(null); router.refresh(); }
      } catch { setRevokeError('The request was interrupted. Refresh inventory to check the key status before retrying.'); }
    });
  }

  function generate(form: FormData) {
    const plan = form.get('plan');
    if (!isKeyPlan(plan)) return;
    setError('');
    startTransition(async () => {
      try {
        const result = await generateKeysAction(plan, Number(form.get('count')));
        if (Array.isArray(result)) setBatch({ codes: result, plan });
        else setError(result.error);
      } catch { setError('The request was interrupted. Check inventory before submitting another batch.'); }
    });
  }
  function pageHref(page: number) {
    const params = new URLSearchParams();
    if (data?.plan) params.set('plan', data.plan);
    if (data?.status) params.set('status', data.status);
    params.set('page', String(page));
    return `/admin?${params}`;
  }

  return <section className={embedded ? 'relative min-w-0 text-white' : adminSurface}>
    <div aria-hidden="true" className="pointer-events-none absolute -top-64 right-0 h-[500px] w-[500px] rounded-full bg-cyan-400/[0.07] blur-3xl" />
    <header className="relative mb-9 flex flex-wrap items-center justify-between gap-6 border-b border-white/10 pb-7">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-cyan-200">AUTO-CHECK / CONTROL ROOM</p>
        <h1 className="mt-3! text-3xl font-semibold tracking-tight sm:text-4xl">Key inventory</h1>
        <p className="mt-3! text-sm text-white/70">Provision access. Track activation. Keep every key accounted for.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {showLocalPreview && <Link href="/admin/local" prefetch={false} className="text-xs text-white/70 hover:text-white">Local demo</Link>}
        <span className="font-mono text-[11px] text-cyan-200"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />ADMIN SESSION</span>
        {!embedded && <form action={logoutAction}><SignOutButton /></form>}
      </div>
    </header>

    {!data ? <div className={`${glassPanel} p-7`}>
      <p role="alert" className="text-sm text-amber-200">Inventory is unavailable. Check the database configuration or try again shortly.</p>
      <button onClick={() => router.refresh()} className={`${secondaryButton} mt-5`}>Retry inventory</button>
    </div> : <>
      <div className="relative grid gap-4 sm:grid-cols-3">
        {[['Total keys', data.summary.total, 'ALL PLANS', 'total-count'],
          ['Available', data.summary.available, 'READY TO ACTIVATE', 'available-count'],
          ['Redeemed', data.summary.redeemed, 'ACCESS ACTIVATED', 'redeemed-count']].map(([label, value, caption, testId]) =>
          <section key={label} className={`${glassPanel} p-6`}>
            <h2 className="text-sm font-medium text-white/70">{label}</h2>
            <p data-testid={testId} className={`mt-4! font-mono text-4xl tabular-nums tracking-tight ${label === 'Available' ? 'text-cyan-200' : 'text-white'}`}>{value.toLocaleString('en-GB')}</p>
            <p className="mt-4! font-mono text-[10px] tracking-widest text-white/50">{caption}</p>
          </section>)}
      </div>
      <div aria-label="Inventory by plan" className="my-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-white/10 py-5 lg:grid-cols-4">
        {Object.entries(data.summary.plans).map(([plan, count]) => <div key={plan} className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/70">{PLAN_LABELS[plan as keyof typeof PLAN_LABELS]}</span>
          <span className="font-mono text-lg tabular-nums">{count.toLocaleString('en-GB')}</span>
        </div>)}
      </div>

      <section className="my-8 grid items-center gap-6 rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.025] p-5 lg:grid-cols-[1fr_1.5fr] lg:p-6">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-cyan-200">NEW BATCH</p>
          <h2 className="mt-2! text-xl font-semibold tracking-tight">Provision activation keys</h2>
          <p className="mt-2! max-w-sm text-sm leading-6 text-white/70">Generate up to 100 keys. Save the codes immediately; they cannot be recovered later.</p>
        </div>
        <form action={generate} className="grid gap-3 sm:grid-cols-[1fr_100px_auto] sm:items-end">
          <div>
            <label htmlFor="provision-plan" className="mb-2 block text-xs text-white/70">Provisioning plan</label>
            <select id="provision-plan" name="plan" defaultValue="bundle" disabled={pending} className={field}>
              {Object.entries(PLAN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="provision-count" className="mb-2 block text-xs text-white/70">Number of keys</label>
            <input id="provision-count" name="count" type="number" min={1} max={100} step={1} defaultValue={1} required disabled={pending} className={field} />
          </div>
          <button disabled={pending || Boolean(batch)} className={primaryButton}>{pending ? 'Generating…' : 'Generate keys'}</button>
          {error && <p role="alert" className="text-sm text-rose-300 sm:col-span-3">{error}</p>}
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.015]">
        <div className="flex flex-wrap items-center justify-between gap-5 border-b border-white/10 p-5 lg:p-6">
          <div><h2 className="text-lg font-semibold">Activation ledger</h2><p className="mt-1! text-xs text-white/50">{data.matchingCount.toLocaleString('en-GB')} matching keys · newest first</p></div>
          <form action="/admin" method="get" className="flex w-full flex-wrap items-end gap-3 lg:w-auto">
            <div className="min-w-32 flex-1"><label htmlFor="filter-plan" className="mb-2 block text-xs text-white/70">Filter by plan</label>
              <select key={`plan:${data.plan}`} id="filter-plan" name="plan" defaultValue={data.plan} className={field}>
                <option value="">All plans</option>{Object.entries(PLAN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></div>
            <div className="min-w-32 flex-1"><label htmlFor="filter-status" className="mb-2 block text-xs text-white/70">Filter by status</label>
              <select key={`status:${data.status}`} id="filter-status" name="status" defaultValue={data.status} className={field}>
                <option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></div>
            <button className={secondaryButton}>Apply filters</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
            <caption className="sr-only">Activation keys identified by hash prefix; all timestamps in Malaysia time.</caption>
            <thead className="bg-white/[0.025] font-mono text-[10px] uppercase tracking-wider text-white/50">
              <tr>{['Hash identifier', 'Plan', 'Status', 'Buyer email', 'Device ID', 'Created · MYT', 'Redeemed · MYT', 'Action'].map(label => <th key={label} scope="col" className="px-5 py-4 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.keys.map(key => <tr key={key.id} className="hover:bg-white/[0.025]">
                <td className="whitespace-nowrap px-5 py-5 font-mono text-white/70">{key.hashPrefix}…</td>
                <td className="px-5 py-5"><span className="whitespace-nowrap rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">{PLAN_LABELS[key.plan_type]}</span></td>
                <td className="px-5 py-5"><span className={`whitespace-nowrap rounded-md border px-2 py-1 ${statusStyles[key.status]}`}>{STATUS_LABELS[key.status]}</span></td>
                <td className="max-w-56 break-all px-5 py-5 text-white/70">{key.buyer_email ?? '—'}</td>
                <td className="max-w-40 break-all px-5 py-5 font-mono text-white/50">{key.device_id ?? '—'}</td>
                <td className="whitespace-nowrap px-5 py-5 text-white/70">{date(key.created_at)}</td>
                <td className="whitespace-nowrap px-5 py-5 text-white/50">{date(key.redeemed_at)}</td>
                <td className="px-5 py-5">{key.status !== 'revoked' && <button disabled={pending} onClick={() => setRevokeId(key.id)} className="text-rose-200 hover:text-rose-100">Revoke</button>}</td>
              </tr>)}
              {data.keys.length === 0 && <tr><td colSpan={8} className="px-6 py-16 text-center text-white/70">No keys match these filters. Choose another plan or status.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 p-5 text-xs text-white/70">
          <p>{data.matchingCount ? `${(data.page - 1) * KEY_PAGE_SIZE + 1}–${Math.min(data.page * KEY_PAGE_SIZE, data.matchingCount)}` : '0'} of {data.matchingCount} keys · Page {data.page} / {data.pageCount}</p>
          <nav aria-label="Key inventory pagination" className="flex gap-3">
            {data.page > 1 ? <Link prefetch={false} scroll={false} href={pageHref(data.page - 1)} className={secondaryButton}>Previous</Link> : <span className="px-4 py-3 text-white/30">Previous</span>}
            {data.page < data.pageCount ? <Link prefetch={false} scroll={false} href={pageHref(data.page + 1)} className={secondaryButton}>Next</Link> : <span className="px-4 py-3 text-white/30">Next</span>}
          </nav>
        </footer>
      </section>
      <p className="mt-5! font-mono text-[10px] leading-5 text-white/40">HASH-ONLY STORAGE · ORIGINAL CODES ARE SHOWN ONCE · TIMES IN MYT (UTC+08:00)</p>
    </>}
    <GeneratedKeysModal batch={batch} onDiscard={() => setBatch(null)} />
    <dialog ref={revokeDialog} aria-labelledby="revoke-title" onClose={() => setRevokeId(null)} onCancel={event => { if (pending) event.preventDefault(); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-7 text-white backdrop:bg-black/80 backdrop:backdrop-blur-sm">
      {revokeId && <><h2 id="revoke-title" className="text-xl font-semibold">Revoke this activation key?</h2><p className="mt-3! text-sm leading-6 text-white/70">This key will no longer be available for activation. Its redemption details will remain in the ledger.</p>{revokeError && <p role="alert" className="mt-4! text-sm text-rose-200">{revokeError}</p>}<div className="mt-6 flex flex-wrap gap-3"><button className={secondaryButton} disabled={pending} onClick={() => setRevokeId(null)}>Cancel</button><button className={primaryButton} disabled={pending} onClick={revoke}>{pending ? 'Revoking…' : 'Confirm revocation'}</button></div></>}
    </dialog>
  </section>;
}
