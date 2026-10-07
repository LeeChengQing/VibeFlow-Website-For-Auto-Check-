import type { Metadata } from 'next';
import Link from 'next/link';
import { CURRENT_TERMS_VERSION } from '@/lib/consent';

export const metadata: Metadata = {
  title: '服务条款、隐私政策与退款规则 · Auto-Check',
  description: 'Auto-Check 服务条款、隐私政策、退款规则与法律免责声明（草稿，需专业人士审阅）',
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0c0d10] text-gray-200 px-4 py-12 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-10">
        {/* Navigation & Header */}
        <div className="border-b border-white/10 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Auto-Check 法律与服务协议</h1>
            <p className="text-sm text-gray-400 mt-1">版本：{CURRENT_TERMS_VERSION} · 生效日期：2026-10-06</p>
          </div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 underline">
            ← 返回首页
          </Link>
        </div>

        {/* Legal Review Disclaimer Alert Banner */}
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm leading-relaxed" role="alert">
          <p className="font-semibold text-amber-300">【草稿提示 / DRAFT NOTICE】</p>
          <p className="mt-1">
            本页所有条款、隐私政策与退款声明均为业务草稿，仅供用户购买前知悉当前产品逻辑。正式法律文本需经合格律师或专业人士审阅确认。
          </p>
        </div>

        {/* Section 1: Terms of Service */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-white/10 pb-2">1. 服务条款 (Terms of Service)</h2>
          <div className="text-sm space-y-3 leading-relaxed text-gray-300">
            <p>
              1.1 <strong>服务性质与尽力而为原则</strong>：Auto-Check 系一款辅助性工具，旨在提供便利的提醒与自动化辅助操作。由于目标院校第三方系统及其网络环境可能随时变更、维护或限制访问，Auto-Check 按“现状”（As-Is）及“尽力而为”（Best Effort）原则提供服务，不构成对任何打卡、签到成功率的绝对保证。
            </p>
            <p>
              1.2 <strong>用户合规责任</strong>：用户知悉并同意，使用本工具须自行遵守其所在院校、机构或组织的所有规章制度与考勤纪律。因使用本工具导致的任何纪律、学业或合规后果由用户完全自行承担。
            </p>
            <p>
              1.3 <strong>许可证授权范围</strong>：每份购买的许可证仅供购买者个人在授权设备数内激活使用，严禁转售、反编译、公开破解或在公共网络二次分发。
            </p>
            <p>
              1.4 <strong>第三方系统变更与补偿机制</strong>：若因目标签到系统架构升级导致工具暂时不可用，团队将优先安排代码适配更新。若因不可抗力或目标系统永久关闭导致无法恢复，默认补偿方案为延长同等时长的支持服务，非直接现金违约赔偿。
            </p>
          </div>
        </section>

        {/* Section 2: Privacy Policy */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-white/10 pb-2">2. 隐私与数据安全政策 (Privacy Policy)</h2>
          <div className="text-sm space-y-3 leading-relaxed text-gray-300">
            <p>
              2.1 <strong>无凭据上传原则</strong>：扩展端<strong>严禁且不会上传</strong>用户的学校学号密码、登录凭证、Cookie 或教务系统敏感个人数据到我们的服务器。
            </p>
            <p>
              2.2 <strong>激活与设备信息最小化</strong>：在激活许可证时，扩展端生成随机本地设备 UUID 并仅向服务端发送不可逆的匿名哈希值，用于设备并发数量校验；不采集用户的硬件序列号或设备个人信息。
            </p>
            <p>
              2.3 <strong>同意记录留存</strong>：下单结账时，系统依据支付争议举证要求记录买家填写的接收邮箱、所选方案、条款同意版本与时间戳、以及脱敏处理的 IP 哈希。
            </p>
          </div>
        </section>

        {/* Section 3: Refund Policy */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-white/10 pb-2">3. 退款规则 (Refund Policy)</h2>
          <div className="text-sm space-y-3 leading-relaxed text-gray-300">
            <p>
              3.1 <strong>7天未激活无理由退款</strong>：自订单支付完成之时起 7 个自然日（168 小时）内，若许可证密钥<strong>尚未在任何设备上进行过激活兑换</strong>，用户可联系客服申请全额退款。
            </p>
            <p>
              3.2 <strong>已激活数字商品的除外规则</strong>：数字软件许可证一旦完成设备激活绑定，即视为数字资产已实质交付与消费。除法律法规强制要求或系统经确认存在完全无法使用的严重固有缺陷外，已激活订单原则上不予退款。
            </p>
            <p>
              3.3 <strong>退款与吊销</strong>：退款申请核准执行后，关联的订单状态将转为 <code>refunded</code>，已发放的许可证密钥及设备授权将永久失效并标记为 <code>revoked</code>，不可再次使用或恢复。
            </p>
          </div>
        </section>

        {/* Section 4: Support & Contact */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-white/10 pb-2">4. 客服与争议联系 (Support & Contact)</h2>
          <div className="text-sm space-y-3 leading-relaxed text-gray-300">
            <p>
              如对条款、激活问题或退款有任何疑问，请通过以下统一客服途径联系处理：
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>在线工单：<Link href="/support" className="text-blue-400 hover:text-blue-300 underline">客服工单系统 (/support)</Link></li>
              <li>官方联系邮箱：<code>support@auto-check.example</code></li>
            </ul>
          </div>
        </section>

        <div className="border-t border-white/10 pt-6 text-xs text-gray-500 text-center">
          &copy; {new Date().getFullYear()} Auto-Check · 保留所有权利
        </div>
      </div>
    </main>
  );
}
