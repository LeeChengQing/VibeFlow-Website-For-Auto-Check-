import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy · Auto-Check',
  description: 'Refund Policy for Auto-Check Browser Extension and Services',
};

export default function RefundPolicyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif', lineHeight: 1.6, color: '#1f2937' }}>
      <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', marginBottom: 24, fontSize: 13, fontWeight: 500 }}>
        ⚠️ <strong>草稿说明：</strong> 本退款政策为技术团队起草的标准售后条款，标注文档草稿，需经法务专业审阅。
      </div>

      <h1>Refund Policy (退款与售后政策)</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>Last Updated: October 2026 · Version 1.0.0</p>

      <section style={{ marginTop: 24 }}>
        <h2>1. 7-Day Money-Back Guarantee (7天无理由退款保障)</h2>
        <p>
          我们为直接在官网购买的用户提供自付款之日起 <strong>7 天内</strong> 的售后支持。如果您在使用过程中遇到不可兼容的系统故障或功能不符合预期，可通过客服工单提出退款申请。
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>2. Automatic Revocation (退款联动注销)</h2>
        <p>
          当退款被批准并执行后：
        </p>
        <ul>
          <li>关联的许可证密钥（License Key）将立即被服务端吊销（Status: <code>revoked</code>）。</li>
          <li>已激活该密钥的所有浏览器扩展设备将被解绑。</li>
          <li>若购买了手机通知服务，对应的推送频道（ntfy topic）将被自动作废与注销。</li>
          <li>被退款的密钥将被永久标记为报废，绝不会被重新上架或二次转售。</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>3. Third-Party Purchases (第三方卡网寄售购买)</h2>
        <p>
          通过第三方寄售平台（如 368云寄售）购买的密钥，其退款与资金往来由对应寄售平台的售后规则承保。官方客服可协助排查密钥有效性与系统适配问题。
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>4. How to Request a Refund</h2>
        <p>
          请访问我们的 <Link href="/support">客户支持页面</Link>，提交工单并附上您的付款邮箱与订单参考编号（如 <code>ORD-...</code>），我们的团队将在 24-48 小时内处理。
        </p>
      </section>

      <div style={{ marginTop: 40, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>← Back to Home</Link>
        {' · '}
        <Link href="/terms" style={{ color: '#2563eb', textDecoration: 'none' }}>Terms of Service</Link>
        {' · '}
        <Link href="/privacy" style={{ color: '#2563eb', textDecoration: 'none' }}>Privacy Policy</Link>
      </div>
    </div>
  );
}
