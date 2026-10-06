import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Consignment Buyer Guide · Auto-Check',
  description: 'Installation and Activation Guide for 368 Consignment Platform Buyers',
};

export default function KawangGuidePage() {
  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif', lineHeight: 1.6, color: '#1f2937' }}>
      <h1>卡网（368云寄售）买家使用指南</h1>
      <p style={{ color: '#4b5563' }}>
        感谢您通过 368云寄售平台购买 Auto-Check。以下是快速完成安装与激活的完整步骤。
      </p>

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 16, marginTop: 20 }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#166534' }}>📥 步骤一：下载官方扩展安装包</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 14 }}>
          请直接下载最新版本已打包的 Chrome 扩展安装 ZIP 文件：
        </p>
        <a
          href="/downloads/auto-check-extension.zip"
          download
          style={{ display: 'inline-block', padding: '10px 18px', background: '#16a34a', color: 'white', textDecoration: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14 }}
        >
          下载扩展安装包 (ZIP)
        </a>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginTop: 20 }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>🧩 步骤二：安装到 Chrome 浏览器</h3>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          <li>下载后将 ZIP 压缩包解压到本地固定文件夹。</li>
          <li>在 Google Chrome 地址栏输入 <code>chrome://extensions/</code> 并回车。</li>
          <li>在右上角打开 <strong>开发者模式 (Developer mode)</strong> 开关。</li>
          <li>点击左上角 <strong>加载已解压的扩展程序 (Load unpacked)</strong>，选择解压出的文件夹。</li>
          <li>点击右上角拼图图标，将 Auto-Check 图标固定到浏览器工具栏。</li>
        </ol>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginTop: 20 }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>🔑 步骤三：输入卡密激活</h3>
        <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
          点击浏览器右上角的 Auto-Check 图标打开弹窗：
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          <li>将您在寄售平台提取到的 20 位激活卡密（格式形如 <code>XXXXX-XXXXX-XXXXX-XXXXX-C</code>）粘贴到输入框。</li>
          <li>点击 <strong>Activate License (激活)</strong> 按钮。</li>
          <li>激活成功后，界面将展示对应的功能（Core 签到或 Bundle 通知包）与有效期。</li>
          <li>每个卡密默认支持绑定 <strong>2 台常用设备</strong>。</li>
        </ul>
      </div>

      <div style={{ marginTop: 32, padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 14 }}>
        <strong>常见问题解答 (FAQ)：</strong>
        <p style={{ margin: '8px 0 4px 0' }}>Q: 激活提示 "DEVICE_LIMIT_EXCEEDED" 怎么办？</p>
        <p style={{ margin: 0, color: '#4b5563' }}>A: 说明该卡密绑定的设备已满 2 台。如需更换设备，请联系客服工单申请设备解绑。</p>
      </div>

      <div style={{ marginTop: 40, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>← 返回网站首页</Link>
        {' · '}
        <Link href="/support" style={{ color: '#2563eb', textDecoration: 'none' }}>联系在线客服</Link>
        {' · '}
        <Link href="/status" style={{ color: '#2563eb', textDecoration: 'none' }}>服务状态公告</Link>
      </div>
    </div>
  );
}
