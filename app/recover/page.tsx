'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function OrderRecoveryPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'RATE_LIMIT_EXCEEDED') {
          setError('Too many recovery attempts. Please wait a moment and try again.');
        } else {
          setError(data.error || 'Failed to submit recovery request.');
        }
      } else {
        setMessage(data.message || 'If an order was found, an email has been sent.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 540, margin: '60px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h1>Recover Your License Key</h1>
      <p style={{ color: '#4b5563', lineHeight: 1.5 }}>
        Lost your order link or activation key? Enter the email address used during purchase.
        If an active order exists, we will deliver an access link to your inbox.
      </p>

      {message && (
        <div style={{ padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', marginBottom: 20 }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', marginBottom: 20 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            Buyer Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@school.edu"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 15, borderRadius: 6, border: '1px solid #d1d5db' }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          {submitting ? 'Sending Request...' : 'Send Recovery Link'}
        </button>
      </form>

      <div style={{ marginTop: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>Back to Home</Link>
        {' · '}
        <Link href="/support" style={{ color: '#2563eb', textDecoration: 'none' }}>Contact Support</Link>
      </div>
    </div>
  );
}
