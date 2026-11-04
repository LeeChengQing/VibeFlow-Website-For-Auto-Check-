export interface NtfySendOptions {
  topic: string;
  title: string;
  message: string;
  priority?: number; // 1 (min) to 5 (max), default 3
  tags?: string[];
  serverUrl?: string;
  authToken?: string;
  fetchFn?: typeof fetch;
}

export interface NtfySendResult {
  success: boolean;
  messageId: string;
}

export class NtfyError extends Error {
  readonly isRetryable: boolean;
  readonly statusCode: number;

  constructor(message: string, statusCode: number, isRetryable: boolean) {
    super(message);
    this.name = 'NtfyError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

export async function sendNtfyNotification(
  options: NtfySendOptions
): Promise<NtfySendResult> {
  const server = (options.serverUrl || process.env.NTFY_SERVER_URL || 'https://ntfy.sh').replace(/\/+$/, '');
  const url = `${server}/${encodeURIComponent(options.topic)}`;
  const fetchClient = options.fetchFn || fetch;

  const headers: Record<string, string> = {
    'Title': options.title,
    'Priority': String(options.priority ?? 3),
  };

  if (options.tags && options.tags.length > 0) {
    headers['Tags'] = options.tags.join(',');
  }

  const token = options.authToken || process.env.NTFY_AUTH_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetchClient(url, {
      method: 'POST',
      headers,
      body: options.message,
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Text responses on some ntfy proxies
      }
      return {
        success: true,
        messageId: data?.id || 'ntfy-delivered',
      };
    }

    const errorText = await res.text().catch(() => '');
    const isRetryable = res.status === 429 || res.status >= 500;
    throw new NtfyError(
      `Ntfy request failed with status ${res.status}: ${errorText.slice(0, 100)}`,
      res.status,
      isRetryable
    );
  } catch (err: any) {
    if (err instanceof NtfyError) throw err;
    // Network errors or timeout
    throw new NtfyError(err.message || 'Network error reaching ntfy', 0, true);
  }
}
