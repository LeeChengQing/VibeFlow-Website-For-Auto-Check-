'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { loginAction } from './actions';
import { adminSurface, field, glassPanel, primaryButton } from './admin-ui';

export function AdminLoginForm({ showLocalPreview }: { showLocalPreview: boolean }) {
  const [error, action, pending] = useActionState(async (_previous: string, data: FormData) => {
    return (await loginAction(String(data.get('password') ?? ''))).error;
  }, '');

  return <section className={`${adminSurface} flex min-h-[65dvh] items-center justify-center`}>
    <div aria-hidden="true" className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
    <div className="relative w-full max-w-md">
      <p className="mb-8! font-mono text-xs tracking-[0.2em] text-cyan-200">AUTO-CHECK / ADMIN</p>
      <div className={`${glassPanel} p-6 sm:p-8`}>
        <span className="font-mono text-xs text-white/50">AUTHORIZED OPERATORS</span>
        <h1 className="mt-4! text-3xl font-semibold tracking-tight">Admin access</h1>
        <p className="mt-3! text-sm leading-6 text-white/70">Sign in to manage your website, offers, content and activation keys.</p>
        <form action={action} className="mt-8 space-y-5">
          <div>
            <label htmlFor="admin-password" className="mb-2 block text-sm text-white/70">Admin password</label>
            <input id="admin-password" name="password" type="password" autoComplete="current-password" required
              maxLength={1024} disabled={pending} aria-describedby={error ? 'login-error' : undefined} className={field} />
          </div>
          {error && <p id="login-error" role="alert" className="text-sm leading-6 text-rose-300">{error}</p>}
          <button disabled={pending} className={`${primaryButton} w-full`}>{pending ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-6! font-mono text-[11px] text-white/50">PRIVATE SITE MANAGEMENT · SECURE SESSION</p>
      </div>
      <div className="mt-6 flex items-center justify-between text-xs text-white/50">
        <Link href="/" className="hover:text-white">Back to Auto-Check</Link>
        {showLocalPreview && <Link href="/admin/local" prefetch={false} className="hover:text-white">Local demo</Link>}
      </div>
    </div>
  </section>;
}
