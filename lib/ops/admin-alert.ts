import { createHash } from 'node:crypto';
import { sendNtfyNotification } from '../notifications/ntfy-adapter';

export type AlertSeverity = 'info' | 'warn' | 'critical';

export interface AdminAlertOptions {
  severity: AlertSeverity;
  title: string;
  message: string;
  adminTopic?: string;
  serverUrl?: string;
  authToken?: string;
  fetchFn?: typeof fetch;
}

export interface AdminAlertResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

// In-memory throttling map: 5-minute cooldown for identical alerts
const alertHistory = new Map<string, number>();

export function resetAlertThrottle(): void {
  alertHistory.clear();
}

export async function sendAdminAlert(
  options: AdminAlertOptions
): Promise<AdminAlertResult> {
  const topic = options.adminTopic || process.env.ADMIN_NTFY_TOPIC;
  if (!topic) {
    return { sent: false, reason: 'ADMIN_NTFY_TOPIC_NOT_CONFIGURED' };
  }

  // 1. Check duplicate alert throttling (5 minutes window)
  const now = Date.now();
  const alertFingerprint = createHash('sha256')
    .update(`${options.severity}:${options.title}:${options.message}`)
    .digest('hex');

  const lastSent = alertHistory.get(alertFingerprint);
  if (lastSent && now - lastSent < 5 * 60 * 1000) {
    return { sent: false, reason: 'THROTTLED' };
  }

  // 2. Map severity to ntfy priority
  const priorityMap: Record<AlertSeverity, number> = {
    critical: 5,
    warn: 4,
    info: 3,
  };
  const priority = priorityMap[options.severity] || 3;

  const tagMap: Record<AlertSeverity, string[]> = {
    critical: ['rotating_light', 'warning'],
    warn: ['warning'],
    info: ['information_source'],
  };

  try {
    const res = await sendNtfyNotification({
      topic,
      title: `[${options.severity.toUpperCase()}] ${options.title}`,
      message: options.message,
      priority,
      tags: tagMap[options.severity],
      serverUrl: options.serverUrl,
      authToken: options.authToken,
      fetchFn: options.fetchFn,
    });

    alertHistory.set(alertFingerprint, now);
    return { sent: true, messageId: res.messageId };
  } catch (err: any) {
    return { sent: false, reason: err.message || 'DISPATCH_FAILED' };
  }
}
