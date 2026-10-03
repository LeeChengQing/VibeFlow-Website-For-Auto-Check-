'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SITE_CONFIG, offerIsActive, packagePrice, validateSiteConfig, type SiteActionResult, type SiteConfig, type SiteManagementData } from '@/lib/site-config';
import { completeSiteUploadAction, prepareSiteUploadAction, publishSiteAction, restoreSiteAction, saveSiteDraftAction, uploadSiteAssetAction } from './site-actions';
import { logoutAction } from './actions';
import { EditorPanel, SiteConfigEditor, TextField, type EditorSection } from './SiteConfigEditor';
import { glassPanel, primaryButton, secondaryButton } from './admin-ui';

const sections = ['Overview', 'Pricing & Offers', 'Packages', 'Guides', 'Content', 'Orders & Support', 'Key Inventory', 'History', 'Site Settings'] as const;
type Section = typeof sections[number];
type Guard = { message: string; proceed: () => void };
const unavailableManagement: SiteManagementData = { draft: DEFAULT_SITE_CONFIG, published: DEFAULT_SITE_CONFIG, version: 0, history: [], activity: [], local: false };
const stringify = (value: SiteConfig) => JSON.stringify(value, (_, item: unknown) => typeof item === 'number' && !Number.isFinite(item) ? 'INVALID_NUMBER' : item);
const rm = (amount: number) => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount / 100);
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(value));
const sectionDescription: Record<Section, string> = {
  Overview: 'Your storefront and operations at a glance.', 'Pricing & Offers': 'Set prices and schedule promotional offers.', Packages: 'Shape the packages customers see and buy.', Guides: 'Keep installation and setup instructions current.', Content: 'Write the storefront in English and Chinese.', 'Orders & Support': 'Manage customer orders and support requests.', 'Key Inventory': 'Provision and track activation keys.', History: 'Review publications and restore a previous version to draft.', 'Site Settings': 'Manage availability, contact details and release delivery.',
};

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); close(); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-white/15 bg-[#111719] p-6 text-white shadow-2xl backdrop:bg-black/75 sm:p-8"><div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><button type="button" className="min-h-8 px-2 text-xs text-white/60 hover:text-white" onClick={close}>Close</button></div>{children}</dialog>;
}

export function SiteManagementDashboard({ management: suppliedManagement, children, operations, overview }: { management: SiteManagementData | null; children: ReactNode; operations: ReactNode; overview?: ReactNode }) {
  const router = useRouter();
  const [retainedManagement, setRetainedManagement] = useState(suppliedManagement);
  const management = suppliedManagement ?? retainedManagement ?? unavailableManagement;
  const settingsAvailable = suppliedManagement !== null;
  const [section, setSelectedSection] = useState<Section>('Overview');
  const [config, setConfig] = useState(management.draft);
  const [baseline, setBaseline] = useState(stringify(management.draft));
  const [version, setVersion] = useState(management.version);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [guard, setGuard] = useState<Guard | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState('');
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const dirty = stringify(config) !== baseline;
  const dirtyRef = useRef(dirty);
  const versionRef = useRef(version);
  dirtyRef.current = dirty;
  versionRef.current = version;
  const savedChanges = baseline !== stringify(management.published);
  const busy = pending || uploading;

  useEffect(() => { if (suppliedManagement) setRetainedManagement(suppliedManagement); }, [suppliedManagement]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (['plan', 'status', 'page'].some(key => params.has(key))) { setSelectedSection('Key Inventory'); return; }
    try { const saved = sessionStorage.getItem('auto-check:admin-section'); if (sections.includes(saved as Section)) setSelectedSection(saved as Section); } catch { /* Section navigation works when storage is disabled. */ }
  }, []);
  function setSection(next: Section) {
    setSelectedSection(next);
    try { sessionStorage.setItem('auto-check:admin-section', next); } catch { /* Section navigation works when storage is disabled. */ }
  }

  useEffect(() => {
    if (management.version < versionRef.current) return;
    if (dirtyRef.current) { if (management.version !== versionRef.current) setError('A newer draft was saved in another session. Your edits are preserved. Reload the saved draft before applying changes again.'); return; }
    setConfig(management.draft); setBaseline(stringify(management.draft)); setVersion(management.version);
  }, [management]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { if (!dirtyRef.current) return; event.preventDefault(); event.returnValue = ''; };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const href = anchor.href;
      if (!href || href.startsWith('mailto:')) return;
      const destination = new URL(href);
      if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
      event.preventDefault(); event.stopPropagation();
      setGuard({ message: 'You have unsaved changes. Save the draft before leaving this page, or discard your edits.', proceed: () => { window.location.assign(href); } });
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [dirty]);

  function change(next: SiteConfig) { setConfig(next); setMessage(''); }
  function request(proceed: () => void, message = 'You have unsaved changes. Save your draft before switching sections, or discard your edits.') {
    if (busy) return;
    if (dirty) setGuard({ message, proceed }); else proceed();
  }
  function showError(result: SiteActionResult) {
    if ('error' in result) { setError(result.error); return true; }
    return false;
  }
  function save(after?: () => void) {
    if (!settingsAvailable) { setError('Site settings are unavailable. Retry loading settings before saving.'); return; }
    setError(''); setMessage('');
    const snapshot = config;
    try { validateSiteConfig(snapshot); } catch { setError('The draft has invalid fields. Use positive MYR prices with up to two decimals; promotional prices must not exceed regular prices. Include both package names, a valid start/end window, and valid HTTPS URLs or site paths.'); return; }
    startTransition(async () => {
      try {
        const result = await saveSiteDraftAction(snapshot, version);
        if (showError(result)) return;
        if ('ok' in result) { setBaseline(stringify(snapshot)); setVersion(result.version ?? version + 1); dirtyRef.current = false; versionRef.current = result.version ?? version + 1; setMessage('Draft saved. The live website is unchanged.'); setGuard(null); router.refresh(); after?.(); }
      } catch { setError('The save was interrupted. Your edits are still here. Reload the saved draft to check its state before retrying.'); }
    });
  }
  function upload(file: File, kind: 'guide' | 'release', apply: (asset: { assetId: string; src?: string }) => void) {
    if (!settingsAvailable) { setError('Site settings are unavailable. Retry loading settings before uploading.'); return; }
    setError(''); setMessage('');
    const validType = kind === 'guide' ? ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || (!file.type && /\.(png|jpe?g|webp)$/i.test(file.name)) : /\.zip$/i.test(file.name);
    if (!validType || file.size < 1 || file.size > (kind === 'guide' ? 5 : 20) * 1024 * 1024) { setError(kind === 'guide' ? 'Choose a PNG, JPEG or WebP image up to 5 MB.' : 'Choose a ZIP release up to 20 MB.'); return; }
    setUploading(true);
    startTransition(async () => {
      try {
        let result: SiteActionResult;
        if (management.local) {
          const form = new FormData(); form.set('file', file); form.set('kind', kind);
          result = await uploadSiteAssetAction(form);
        } else {
          const prepared = await prepareSiteUploadAction(kind, file.type, file.size, file.name);
          if (showError(prepared)) return;
          if (!('ok' in prepared) || !prepared.uploadId || !prepared.uploadUrl) { setError('Could not prepare the private upload. Try again.'); return; }
          const response = await fetch(prepared.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': prepared.uploadMime || file.type }, credentials: 'omit' });
          if (!response.ok) { setError('The private upload failed. Try uploading the file again.'); return; }
          result = await completeSiteUploadAction(prepared.uploadId);
        }
        if (showError(result)) return;
        if ('ok' in result && result.assetId) { apply({ assetId: result.assetId, src: result.src }); setMessage('Upload complete. Save the draft and publish to apply it.'); }
        else setError('The upload did not return an asset. Try again.');
      } catch { setError('Upload failed. Check the file type and size, then try again.'); } finally { setUploading(false); }
    });
  }
  function signOut() {
    request(() => { startTransition(async () => { await logoutAction(); }); }, 'You have unsaved changes. Save the draft before signing out, or discard your edits.');
  }
  function publish() {
    if (!settingsAvailable) { setError('Site settings are unavailable. Retry loading settings before publishing.'); return; }
    setError(''); setMessage('');
    startTransition(async () => {
      try { const result = await publishSiteAction(version, publishNote); if (showError(result)) return; if ('ok' in result) { setVersion(result.version ?? version + 1); versionRef.current = result.version ?? version + 1; setMessage('Published. The live website now uses this configuration.'); setPublishOpen(false); setPublishNote(''); router.refresh(); } }
      catch { setError('Publication was interrupted. Refresh to check the live version before retrying.'); }
    });
  }
  function restore(id: string) {
    if (!settingsAvailable) { setError('Site settings are unavailable. Retry loading settings before restoring.'); return; }
    setError(''); setMessage('');
    startTransition(async () => {
      try { const result = await restoreSiteAction(id, version); if (showError(result)) return; if ('ok' in result) { const entry = management.history.find(v => v.id === id); if (entry) { setConfig(entry.config); setBaseline(stringify(entry.config)); } setVersion(result.version ?? version + 1); versionRef.current = result.version ?? version + 1; setRestoreId(null); setMessage('Version restored to draft. Preview it before publishing.'); router.refresh(); } }
      catch { setError('Restore was interrupted. Refresh to check the saved draft before retrying.'); }
    });
  }
  function discard() { setConfig(management.draft); setBaseline(stringify(management.draft)); setVersion(management.version); dirtyRef.current = false; versionRef.current = management.version; setError(''); }

  return <div className="mx-auto my-5 w-full max-w-[1600px] px-3 text-white sm:my-8 sm:px-6">
    <a href="#management-content" className="sr-only focus:not-sr-only focus:mb-4 focus:block focus:text-cyan-200">Skip to dashboard content</a>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080d10] lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="border-b border-white/10 bg-white/[0.025] lg:border-r lg:border-b-0">
        <div className="border-b border-white/10 p-5 lg:p-6"><p className="font-mono text-[10px] tracking-[0.18em] text-cyan-200">AUTO-CHECK</p><p className="mt-2! text-lg font-semibold tracking-tight">Control room</p><p className="mt-2! text-xs text-white/45">{!settingsAvailable && !retainedManagement ? 'Workspace unavailable' : management.local ? 'Local development' : 'Production workspace'}</p></div>
        <nav aria-label="Site management sections" className="flex gap-1 overflow-x-auto p-3 lg:grid lg:overflow-visible">{sections.map((name, i) => <button key={name} type="button" aria-current={section === name ? 'page' : undefined} disabled={busy} onClick={() => { if (name !== section) request(() => setSection(name)); }} className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg border! px-3 py-3 text-left text-sm transition-colors focus-visible:outline-cyan-200 disabled:opacity-40 lg:w-full ${section === name ? 'border-cyan-200/15! bg-cyan-300/10! text-cyan-100!' : 'border-transparent! bg-transparent! text-white/55! hover:bg-white/5! hover:text-white!'}`}><span className="font-mono text-[10px] text-white/30">{String(i + 1).padStart(2, '0')}</span>{name}</button>)}</nav>
        <div className="hidden border-t border-white/10 p-6 lg:block"><a href="/" target="_blank" rel="noopener noreferrer" className="text-xs text-white/65 underline underline-offset-4 hover:text-white">Open live website ↗</a><p className="mt-4! text-xs leading-6 text-white/35">Changes stay in draft until you publish.</p></div>
      </aside>
      <div className="min-w-0">
        <header className="border-b border-white/10 bg-white/[0.015] p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-6"><div><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-[10px] tracking-widest text-cyan-200">SITE MANAGEMENT</span><span className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-white/50">v{version}</span></div><h1 className="mt-3! text-2xl font-semibold tracking-tight sm:text-3xl">{section}</h1><p className="mt-2! max-w-xl text-sm leading-6 text-white/50">{sectionDescription[section]}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => save()} disabled={busy || !settingsAvailable || !dirty} className={secondaryButton}>{pending && !uploading ? 'Working…' : 'Save draft'}</button><a href="/admin/preview" target="_blank" rel="noopener noreferrer" className={secondaryButton} title="Preview the last saved draft">Preview draft ↗</a><button type="button" onClick={() => { setError(''); setPublishOpen(true); }} disabled={busy || !settingsAvailable || dirty || !savedChanges} className={primaryButton}>Publish changes</button><button type="button" disabled={busy} onClick={signOut} className={secondaryButton}>Sign out</button></div></div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs"><span className={dirty ? 'text-amber-200' : savedChanges ? 'text-cyan-200' : 'text-white/50'}><span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${dirty ? 'bg-amber-200' : savedChanges ? 'bg-cyan-200' : 'bg-white/40'}`} />{dirty ? 'Unsaved edits' : savedChanges ? 'Saved draft · unpublished changes' : 'Draft matches live website'}</span><span className="text-white/40">Preview shows the saved draft.</span>{dirty && <span className="text-white/40">Save before publishing.</span>}<a href="/" target="_blank" rel="noopener noreferrer" className="ml-auto text-white/60 underline underline-offset-4">View live ↗</a></div>
        </header>
        <div id="management-content" className="min-w-0 p-4 sm:p-7">
          {!settingsAvailable && <div role="alert" className="mb-6 rounded-xl border border-amber-200/20 bg-amber-200/5 p-4"><p className="text-sm leading-6 text-amber-100">Site settings could not be loaded. {retainedManagement ? 'The last loaded draft remains visible.' : 'The editor shows default settings until loading recovers.'} Saving, publishing, restoring and uploads are disabled. Key inventory and operations remain accessible.</p><button type="button" disabled={busy} onClick={() => router.refresh()} className={`${secondaryButton} mt-3`}>Retry loading settings</button></div>}
          {error && <div role="alert" className="mb-6 rounded-xl border border-rose-300/20 bg-rose-300/5 p-4"><p className="text-sm leading-6 text-rose-200">{error}</p><button type="button" className="mt-3 text-xs text-white/75 underline underline-offset-4" disabled={busy} onClick={() => request(() => { discard(); router.refresh(); }, 'Reloading the saved draft will discard your unsaved changes. Save them first, or discard them to reload.')}>Reload saved draft</button></div>}
          {message && <p role="status" className="mb-6 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-sm leading-6 text-cyan-100">{message}</p>}
          {uploading && <p role="status" className="mb-5 text-sm text-cyan-200">Uploading file…</p>}
          {section === 'Overview' && <div className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Packages visible', `${config.packages.filter(p => p.visible).length} / ${config.packages.length}`, 'Draft storefront'], ['Guides visible', String(config.guides.filter(g => g.visible).length), 'Draft setup guides'], ['Offer status', offerIsActive(config) ? 'Active' : config.offer.enabled && Date.parse(config.offer.startsAt) > Date.now() ? 'Scheduled' : 'Inactive', 'Draft · Malaysia time'], ['Checkout', config.settings.maintenance ? 'Maintenance' : config.settings.checkoutEnabled ? 'Enabled' : 'Disabled', 'Draft availability']].map(([label, value, caption]) => <section key={label} className={`${glassPanel} p-5`}><h2 className="text-xs text-white/55">{label}</h2><p className="mt-4! text-2xl font-semibold tabular-nums tracking-tight">{value}</p><p className="mt-3! text-[10px] text-white/35">{caption}</p></section>)}</div>
            {overview}
            <EditorPanel title="Draft package prices" description="Amounts use the draft offer schedule. Customers use the published configuration."><div className="divide-y divide-white/10">{config.packages.slice().sort((a, b) => a.order - b.order).map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium">{p.name.en}</p><p className="mt-1! text-xs text-white/45">{!p.visible ? 'Hidden' : !p.enabled ? 'Purchasing disabled' : 'Visible · purchasing enabled'}</p></div><p className="font-mono text-lg tabular-nums text-cyan-100">{rm(packagePrice(config, p.id))}</p></div>)}</div></EditorPanel>
            <EditorPanel title="Publication workflow" description="Edit → Save draft → Preview draft → Publish changes"><p className="text-sm leading-6 text-white/55">A saved draft is private. Publishing applies its prices, content, guides and settings to the storefront together. History restores a previous publication into draft for review.</p><div className="flex flex-wrap gap-3"><button type="button" className={secondaryButton} onClick={() => request(() => setSection('Pricing & Offers'))}>Edit pricing</button><button type="button" className={secondaryButton} onClick={() => request(() => setSection('History'))}>Review history</button></div></EditorPanel>
          </div>}
          {/* Keep inventory mounted so one-time plaintext keys survive saves and section changes. */}
          <div hidden={section !== 'Key Inventory'} className="min-w-0 [&>section]:my-0 [&>section]:border-0 [&>section]:p-0">{children}</div>
          <div hidden={section !== 'Orders & Support'} className="min-w-0">{operations}</div>
          {(['Pricing & Offers', 'Packages', 'Guides', 'Content', 'Site Settings'] as string[]).includes(section) && <form onSubmit={e => { e.preventDefault(); if (!busy && dirty) save(); }}><fieldset disabled={busy || !settingsAvailable} className="min-w-0"><legend className="sr-only">{section} draft editor</legend><SiteConfigEditor section={section as EditorSection} config={config} onChange={change} upload={upload} uploading={uploading || !settingsAvailable} /></fieldset></form>}
          {section === 'History' && <div className="grid gap-6"><EditorPanel title="Published versions" description="Restoring creates a new draft. The current live website stays unchanged until you publish.">{management.history.length === 0 ? <p className="py-5 text-sm text-white/50">No publications yet. Your first publication will appear here.</p> : <div className="divide-y divide-white/10">{management.history.map(entry => <article key={entry.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div className="min-w-0"><p className="text-sm font-medium">Version {entry.version}<span className="ml-3 text-xs font-normal text-white/45">{date(entry.createdAt)} MYT</span></p><p className="mt-2! whitespace-pre-wrap break-words text-sm leading-6 text-white/55">{entry.note || 'Published without a note'}</p></div><button type="button" disabled={busy || !settingsAvailable} className={secondaryButton} onClick={() => request(() => setRestoreId(entry.id), 'Restoring this version will replace the draft. Save your current edits first, or discard them to continue.')}>Restore to draft</button></article>)}</div>}</EditorPanel><EditorPanel title="Activity log" description="Recent administrative changes, newest first.">{management.activity.length === 0 ? <p className="text-sm text-white/50">No activity recorded yet.</p> : <ol className="divide-y divide-white/10">{management.activity.map(entry => <li key={entry.id} className="grid gap-2 py-4 sm:grid-cols-[150px_minmax(0,1fr)]"><time className="font-mono text-[11px] leading-6 text-white/40">{date(entry.createdAt)}</time><div><p className="text-sm font-medium">{entry.action.replaceAll('_', ' ')}</p><p className="mt-1! break-words text-sm leading-6 text-white/50">{entry.detail}</p></div></li>)}</ol>}</EditorPanel></div>}
        </div>
      </div>
    </div>
    {guard && <Modal title="Unsaved changes" close={() => { if (!busy) setGuard(null); }}><p className="text-sm leading-7 text-white/65">{guard.message}</p>{error && <p role="alert" className="mt-4! text-sm leading-6 text-rose-200">{error}</p>}<div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy || !settingsAvailable} className={primaryButton} onClick={() => save(guard.proceed)}>{pending ? 'Saving…' : 'Save and continue'}</button><button type="button" disabled={busy} className={secondaryButton} onClick={() => { const proceed = guard.proceed; discard(); setGuard(null); proceed(); }}>Discard and continue</button><button type="button" disabled={busy} className={secondaryButton} onClick={() => setGuard(null)}>Keep editing</button></div></Modal>}
    {publishOpen && <Modal title="Publish saved draft" close={() => { if (!busy) setPublishOpen(false); }}><p className="mb-5! text-sm leading-7 text-white/65">This applies the saved draft to the live website, including prices, checkout availability and uploaded assets.</p><TextField label="Publication note" value={publishNote} onChange={setPublishNote} multiline hint="Optional. Describe this change for the history log." />{error && <p role="alert" className="mt-4! text-sm text-rose-200">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" className={primaryButton} disabled={busy || !settingsAvailable || dirty} onClick={publish}>{pending ? 'Publishing…' : 'Publish now'}</button><button type="button" className={secondaryButton} disabled={busy} onClick={() => setPublishOpen(false)}>Cancel</button></div></Modal>}
    {restoreId && <Modal title="Restore publication to draft" close={() => { if (!busy) setRestoreId(null); }}><p className="text-sm leading-7 text-white/65">Replace the saved draft with version {management.history.find(v => v.id === restoreId)?.version}. Preview the restored draft before publishing.</p>{error && <p role="alert" className="mt-4! text-sm text-rose-200">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" className={primaryButton} disabled={busy || !settingsAvailable} onClick={() => restore(restoreId)}>{pending ? 'Restoring…' : 'Restore to draft'}</button><button type="button" className={secondaryButton} disabled={busy} onClick={() => setRestoreId(null)}>Cancel</button></div></Modal>}
  </div>;
}
