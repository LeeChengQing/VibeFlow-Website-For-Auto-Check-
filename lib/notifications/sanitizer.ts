export type NotificationKind =
  | 'checkin_reminder'
  | 'checkin_success'
  | 'checkin_failure'
  | 'warning';

export const ALLOWED_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'checkin_reminder',
  'checkin_success',
  'checkin_failure',
  'warning',
];

export interface NotificationContentInput {
  kind?: string;
  title: string;
  body: string;
}

export interface SanitizedNotificationResult {
  valid: boolean;
  kind: NotificationKind;
  sanitizedTitle: string;
  sanitizedBody: string;
  error?: string;
}

export function sanitizeNotificationContent(
  input: NotificationContentInput
): SanitizedNotificationResult {
  const kind = (input.kind || 'checkin_reminder') as NotificationKind;
  if (!ALLOWED_NOTIFICATION_KINDS.includes(kind)) {
    return {
      valid: false,
      kind: 'checkin_reminder',
      sanitizedTitle: '',
      sanitizedBody: '',
      error: `Invalid notification kind: ${kind}`,
    };
  }

  if (!input.title || typeof input.title !== 'string') {
    return {
      valid: false,
      kind,
      sanitizedTitle: '',
      sanitizedBody: '',
      error: 'Notification title is required',
    };
  }

  if (!input.body || typeof input.body !== 'string') {
    return {
      valid: false,
      kind,
      sanitizedTitle: '',
      sanitizedBody: '',
      error: 'Notification body is required',
    };
  }

  // 1. Scrub sensitive patterns
  let cleanTitle = input.title.trim();
  let cleanBody = input.body.trim();

  // Scrub 8-12 digit numbers (student ID pattern)
  cleanBody = cleanBody.replace(/\b\d{8,12}\b/g, '[REDACTED]');

  // Scrub credential patterns: password, token, secret
  cleanBody = cleanBody.replace(/(?:password|secret|token|pwd)[_=\s:]+[^\s,;]+/gi, '[REDACTED]');

  // Scrub URLs
  cleanBody = cleanBody.replace(/https?:\/\/[^\s]+/gi, '[LINK_REMOVED]');

  // 2. Bound length
  if (cleanTitle.length > 60) {
    cleanTitle = cleanTitle.slice(0, 57) + '...';
  }

  if (cleanBody.length > 200) {
    cleanBody = cleanBody.slice(0, 197) + '...';
  }

  return {
    valid: true,
    kind,
    sanitizedTitle: cleanTitle,
    sanitizedBody: cleanBody,
  };
}
