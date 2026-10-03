'use client';

import { useEffect, useRef, useState } from 'react';
import { PLAN_LABELS } from '@/lib/admin-key-options';
import type { ActivationKeyPlan } from '@/lib/supabase/admin';
import { primaryButton, secondaryButton } from './admin-ui';

export type GeneratedBatch = { codes: string[]; plan: ActivationKeyPlan };

export function GeneratedKeysModal({ batch, onDiscard }: { batch: GeneratedBatch | null; onDiscard: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!batch) return;
    setSaved(false); setNotice(''); setError('');
    dialog.current?.showModal();
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [batch]);

  function discard() {
    if (!saved) { setError('Save the codes, then check the acknowledgment before closing.'); return; }
    dialog.current?.close();
  }
  async function copy() {
    if (!batch) return;
    setError('');
    try { await navigator.clipboard.writeText(batch.codes.join('\n')); setNotice('Codes copied to clipboard.'); }
    catch { setError('Clipboard access failed. Download the CSV or select and copy the codes manually.'); }
  }
  function download() {
    if (!batch) return;
    setError('');
    // Generated codes and allowlisted plans contain no CSV delimiters or formula prefixes.
    const csv = 'code,plan_type\r\n' + batch.codes.map(code => `${code},${batch.plan}`).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `auto-check-${batch.plan}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setNotice('CSV download started. Confirm that you have saved the file.');
  }

  return <dialog ref={dialog} aria-labelledby="generated-heading" aria-describedby="generated-warning"
    onCancel={event => { event.preventDefault(); discard(); }}
    onClose={onDiscard}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-cyan-200/20 bg-zinc-950 p-5 text-white shadow-[0_0_80px_rgba(34,211,238,0.08)] backdrop:bg-black/85 backdrop:backdrop-blur-md sm:p-8">
    {batch && <>
      <p className="font-mono text-xs tracking-[0.18em] text-cyan-200">PROVISIONING COMPLETE</p>
      <h2 id="generated-heading" className="mt-3! text-2xl font-semibold tracking-tight">Save your {batch.codes.length} new {batch.codes.length === 1 ? 'key' : 'keys'}</h2>
      <p className="mt-2! text-sm text-white/70">{PLAN_LABELS[batch.plan]} · This is the only time these codes will be shown.</p>
      <p id="generated-warning" className="mt-6! rounded-lg border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-200">
        Closing this window or refreshing the tab permanently loses access to these codes. Copy them or download the CSV before you continue.
      </p>
      <label htmlFor="generated-codes" className="mb-2 mt-6 block text-xs text-white/70">Generated activation codes</label>
      <textarea id="generated-codes" readOnly value={batch.codes.join('\n')} spellCheck={false} wrap="off"
        rows={Math.min(8, Math.max(3, batch.codes.length))}
        className="w-full resize-y rounded-lg border border-white/10 bg-black p-4 font-mono! text-xs! leading-7! text-cyan-100" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button type="button" autoFocus onClick={() => void copy()} className={secondaryButton}>Copy to Clipboard</button>
        <button type="button" onClick={download} className={primaryButton}>Download as CSV</button>
      </div>
      {notice && <p role="status" className="mt-4! text-sm text-cyan-200">{notice}</p>}
      {error && <p role="alert" className="mt-4! text-sm text-rose-300">{error}</p>}
      <div className="mt-7 border-t border-white/10 pt-5">
        <label className="flex min-h-11 items-center gap-3 text-sm text-white/70">
          <input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} className="h-4 w-4 accent-cyan-300" />
          I have saved these codes
        </label>
        <button type="button" onClick={discard} disabled={!saved} className={`${secondaryButton} mt-3 w-full`}>Close and discard codes</button>
      </div>
    </>}
  </dialog>;
}
