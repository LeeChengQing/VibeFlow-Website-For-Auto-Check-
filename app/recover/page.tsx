'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function OrderRecoveryPage() {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState('');
  const [email, setEmail] = useState('');
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    router.push(`/order/${encodeURIComponent(trimmed)}`);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setSubmittingEmail(true);
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
          setError('请求过于频繁，请稍候再试。/ Too many recovery attempts. Please wait a moment.');
        } else {
          setError(data.error || '提交找回请求失败。/ Failed to submit recovery request.');
        }
      } else {
        setMessage(data.message || '若存在对应订单，找回链接已排队发送至您的邮箱。请同时检查垃圾箱。');
      }
    } catch {
      setError('网络异常，请重试。/ Network error. Please try again.');
    } finally {
      setSubmittingEmail(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: '0 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>订单与卡密多通道找回 (Order Recovery)</h1>
      <p style={{ color: '#4b5563', lineHeight: 1.6, fontSize: 14 }}>
        按照「零成本模式」设计，系统优先推荐使用<strong>订单凭证</strong>即时提取卡密，避免受学校邮箱反垃圾拦截影响。
      </p>

      {/* Mode 1: Direct Token */}
      <div style={{ marginTop: 24, padding: 20, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginTop: 0, marginBottom: 6 }}>方式一：输入订单凭证（推荐 · 即时提取）</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 16 }}>
          结账成功后展示的订单访问代码。输入即可立即查看卡密与下载链接，100% 免疫邮件延迟。
        </p>

        <form onSubmit={handleTokenSubmit}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              required
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="在此粘贴订单访问凭证 (Order Access Token)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 14, borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
          </div>
          <button
            type="submit"
            style={{ width: '100%', padding: '11px', background: '#059669', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            立即提取卡密 (View Order Immediately)
          </button>
        </form>
      </div>

      {/* Mode 2: Email Recovery */}
      <div style={{ marginTop: 24, padding: 20, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginTop: 0, marginBottom: 6 }}>方式二：通过购买邮箱申请重发</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 16 }}>
          凭证丢失时，可输入付款填写的邮箱。系统将向您的邮箱排队发送专属访问链接。
        </p>

        {message && (
          <div style={{ padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSubmit}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@soton.ac.uk"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 14, borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
          </div>
          <button
            type="submit"
            disabled={submittingEmail}
            style={{ width: '100%', padding: '11px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {submittingEmail ? '正在处理...' : '发送找回邮件 (Send Recovery Email)'}
          </button>
        </form>

        <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
          ⚠️ 零成本模式提示：为节省成本，邮件投递可能稍有延迟或进入垃圾箱。若未收到邮件，请检查垃圾邮件，或使用下方客服辅助找回。
        </div>
      </div>

      {/* Mode 3: Support */}
      <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
          凭证丢失且收不到邮件？
          <Link href="/support" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline', marginLeft: 4 }}>
            联系客服辅助找回
          </Link>
          （核对支付流水号后人工生成新链接）
        </p>
      </div>

      <div style={{ marginTop: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
        <Link href="/" style={{ color: '#4b5563', textDecoration: 'none' }}>← 返回网站首页 (Back to Home)</Link>
      </div>
    </div>
  );
}
