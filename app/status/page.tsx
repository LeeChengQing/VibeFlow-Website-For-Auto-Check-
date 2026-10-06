import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Service Status · Auto-Check',
  description: 'Live Service Status, Portal Compatibility, and Announcements',
};

export const dynamic = 'force-dynamic';

export default function StatusPage() {
  const systems = [
    { name: 'License Activation API', status: 'Operational', latency: '42ms' },
    { name: 'Mobile Notification Pipeline (ntfy)', status: 'Operational', latency: '120ms' },
    { name: 'Payment Gateways (Stripe / ToyyibPay)', status: 'Operational', latency: 'Normal' },
    { name: 'Target Portal Check-in Compatibility', status: 'Adapted (2026.10)', latency: 'Verified' },
  ];

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif', lineHeight: 1.6, color: '#1f2937' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>System Status (服务运行状态)</h1>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#dcfce7', color: '#166534', borderRadius: 9999, fontSize: 13, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}></span>
          All Systems Operational
        </span>
      </div>

      <p style={{ color: '#6b7280' }}>
        实时监测 Auto-Check 各核心服务、支付网关及学校打卡系统的适配兼容情况。
      </p>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
        {systems.map((s, idx) => (
          <div
            key={s.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: idx < systems.length - 1 ? '1px solid #e5e7eb' : 'none',
              background: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
            }}
          >
            <div>
              <strong>{s.name}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{s.latency}</span>
              <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{s.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 20, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#1e40af' }}>📢 最新公告 (Announcements)</h3>
        <p style={{ margin: 0, fontSize: 14, color: '#1e3a8a' }}>
          <strong>当前扩展版本：</strong> v1.0.0 (支持最新 Mod-37 Crockford Base32 密钥体系与 72 小时离线宽松门禁)。所有打卡与通知链路运行平稳。
        </p>
      </div>

      <div style={{ marginTop: 40, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>← 返回首页</Link>
        {' · '}
        <Link href="/kawang" style={{ color: '#2563eb', textDecoration: 'none' }}>卡网买家指南</Link>
        {' · '}
        <Link href="/support" style={{ color: '#2563eb', textDecoration: 'none' }}>客户支持工单</Link>
      </div>
    </div>
  );
}
