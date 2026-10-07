export interface FulfillmentEmailParams {
  to: string;
  orderId: string;
  plan: string;
  licenseKey: string;
  downloadUrl?: string;
  supportUntil?: string;
}

export interface RefundEmailParams {
  to: string;
  orderId: string;
  amountMinor: number;
  reason?: string;
}

export interface AlertParams {
  title: string;
  message: string;
  level?: 'info' | 'warning' | 'critical';
  details?: Record<string, unknown>;
}

export interface EmailDeliveryAdapter {
  sendFulfillmentEmail(params: FulfillmentEmailParams): Promise<{ messageId: string }>;
  sendRefundEmail(params: RefundEmailParams): Promise<{ messageId: string }>;
  sendAlert(params: AlertParams): Promise<{ ok: boolean }>;
}

/**
 * In-memory mock adapter used for test environments and offline local development.
 */
export class MockEmailAdapter implements EmailDeliveryAdapter {
  public sentFulfillments: FulfillmentEmailParams[] = [];
  public sentRefunds: RefundEmailParams[] = [];
  public sentAlerts: AlertParams[] = [];

  async sendFulfillmentEmail(params: FulfillmentEmailParams) {
    this.sentFulfillments.push(params);
    return { messageId: `mock-fulfillment-${params.orderId}` };
  }

  async sendRefundEmail(params: RefundEmailParams) {
    this.sentRefunds.push(params);
    return { messageId: `mock-refund-${params.orderId}` };
  }

  async sendAlert(params: AlertParams) {
    this.sentAlerts.push(params);
    return { ok: true };
  }
}

/**
 * Production Resend API email adapter with fallback to mock when unconfigured.
 */
export class ResendEmailAdapter implements EmailDeliveryAdapter {
  private readonly apiKey: string | undefined;
  private readonly fromAddress: string;

  constructor(apiKey?: string, fromAddress?: string) {
    this.apiKey = apiKey ?? process.env.RESEND_API_KEY;
    this.fromAddress = fromAddress ?? process.env.EMAIL_FROM ?? 'Auto-Check <orders@auto-check.example>';
  }

  async sendFulfillmentEmail(params: FulfillmentEmailParams): Promise<{ messageId: string }> {
    if (!this.apiKey) {
      console.warn('[email-adapter] RESEND_API_KEY missing; simulated delivery for:', params.to);
      return { messageId: `simulated-fulfillment-${params.orderId}` };
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #111827;">感谢购买 Auto-Check / Thank you for your purchase</h2>
        <p>您的许可证密钥已成功生成，请妥善保存：</p>
        <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
          <span style="font-family: monospace; font-size: 20px; font-weight: bold; color: #1e40af; letter-spacing: 2px;">
            ${params.licenseKey}
          </span>
        </div>
        <h3>激活与使用指引 / Activation Guide</h3>
        <ol style="line-height: 1.6;">
          <li>打开 Chrome 浏览器，解压并加载 Auto-Check 扩展。</li>
          <li>在扩展弹窗中粘贴上方密钥并点击“激活”。</li>
          <li>激活成功后即可使用对应功能的自动化打卡与通知。</li>
        </ol>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #6b7280;">
          <strong>退款政策：</strong>自购买起 7 天内且<strong>未激活</strong>的许可证支持全额退款。一旦激活使用，原则上不予退款。<br/>
          如有疑问请访问 <a href="https://auto-check.example/support">客户支持中心</a>。
        </p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [params.to],
        subject: '您的 Auto-Check 许可证密钥 (Your Auto-Check License Key)',
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend fulfillment email failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as { id: string };
    return { messageId: data.id };
  }

  async sendRefundEmail(params: RefundEmailParams): Promise<{ messageId: string }> {
    if (!this.apiKey) {
      console.warn('[email-adapter] RESEND_API_KEY missing; simulated refund email for:', params.to);
      return { messageId: `simulated-refund-${params.orderId}` };
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #dc2626;">Auto-Check 订单退款确认 / Refund Confirmation</h2>
        <p>您的订单 <code>${params.orderId}</code> 已完成退款处理。</p>
        <p>退款金额：<strong>RM ${(params.amountMinor / 100).toFixed(2)}</strong></p>
        ${params.reason ? `<p>退款原因：${params.reason}</p>` : ''}
        <p style="font-size: 13px; color: #4b5563;">
          注：关联的软件许可证已吊销并作废，对应客户端设备将在后续自动验证中终止授权。退款款项将原路退回至您的支付账户。
        </p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [params.to],
        subject: 'Auto-Check 订单退款确认 (Refund Processed)',
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend refund email failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as { id: string };
    return { messageId: data.id };
  }

  async sendAlert(params: AlertParams): Promise<{ ok: boolean }> {
    console.warn(`[alert-${params.level ?? 'info'}] ${params.title}: ${params.message}`, params.details);
    return { ok: true };
  }
}
