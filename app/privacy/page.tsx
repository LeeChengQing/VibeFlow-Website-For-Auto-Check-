import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy · Auto-Check',
  description: 'Privacy Policy for Auto-Check Browser Extension and Website',
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif', lineHeight: 1.6, color: '#1f2937' }}>
      <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', marginBottom: 24, fontSize: 13, fontWeight: 500 }}>
        ⚠️ <strong>草稿说明：</strong> 本隐私政策为技术团队起草的标准保护声明，标注文档草稿，需经法务专业审阅。
      </div>

      <h1>Privacy Policy (隐私政策)</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>Last Updated: October 2026 · Version 1.0.0</p>

      <section style={{ marginTop: 24 }}>
        <h2>1. Zero Credential Transmission (零凭证上传承诺)</h2>
        <p>
          Auto-Check 浏览器扩展完全在用户的本地浏览器（Local Chrome Sandbox）中运行。我们<strong>绝不</strong>收集、存储或向任何远端服务器传输您的学校登录账号、学生密码、Session Cookies、个人成绩或个人身份信息。
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>2. Information We Collect (我们收集的必要信息)</h2>
        <p>为了完成许可证履约与防刷滥用，我们仅在服务端记录极简数据：</p>
        <ul>
          <li><strong>交易与订单数据：</strong> 付款邮箱、订单金额、支付平台交易号（Stripe/ToyyibPay/HitPay）、购买时间。</li>
          <li><strong>激活与设备摘要：</strong> 扩展激活时生成的随机本地 UUID 的不可逆单向哈希（用于限制最多绑定 2 台设备），不含硬件识别符或个人信息。</li>
          <li><strong>IP 哈希脱敏：</strong> 记录加盐 SHA-256 摘要用于频次限流，不留存真实公网 IP。</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>3. Mobile Notifications Privacy (手机通知隐私)</h2>
        <p>
          手机通知服务采用端到端极简设计：推送消息内容仅包含时间与通用状态提示（如"打卡待确认"、"签到成功"），严格过滤与剔除学号、姓名、课程名称等个人隐私信息。
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>4. Data Retention & Contact</h2>
        <p>
          日志与队列消息在 30 天后自动物理清除。如有隐私相关疑问，请通过 <Link href="/support">客户支持页面</Link> 联系我们。
        </p>
      </section>

      <div style={{ marginTop: 40, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>← Back to Home</Link>
        {' · '}
        <Link href="/terms" style={{ color: '#2563eb', textDecoration: 'none' }}>Terms of Service</Link>
        {' · '}
        <Link href="/refund" style={{ color: '#2563eb', textDecoration: 'none' }}>Refund Policy</Link>
      </div>
    </div>
  );
}
