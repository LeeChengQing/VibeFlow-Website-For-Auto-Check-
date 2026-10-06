import { NextRequest, NextResponse } from 'next/server';
import { verifyActivationToken, getActivationKeyring } from '@/lib/activation/token-service';
import { sanitizeNotificationContent } from '@/lib/notifications/sanitizer';
import { getServiceRoleClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== 'object') {
      return NextResponse.json({ error: 'INVALID_JSON_BODY' }, { status: 400 });
    }

    const { token, event_id, kind, title, body, expires_seconds } = json;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'MISSING_ACTIVATION_TOKEN' }, { status: 401 });
    }

    if (!event_id || typeof event_id !== 'string') {
      return NextResponse.json({ error: 'MISSING_EVENT_ID' }, { status: 400 });
    }

    // 1. Verify Ed25519 token
    const keyring = getActivationKeyring();
    const tokenResult = verifyActivationToken(token, keyring);
    if (!tokenResult.allowed || !tokenResult.claims) {
      return NextResponse.json({ error: tokenResult.error || 'INVALID_TOKEN' }, { status: 401 });
    }

    const claims = tokenResult.claims;
    if (!claims.feat || !claims.feat.includes('phone_notify')) {
      return NextResponse.json({ error: 'PHONE_NOTIFY_NOT_ENTITLED' }, { status: 403 });
    }

    // 2. Sanitize notification content
    const sanitized = sanitizeNotificationContent({ kind, title, body });
    if (!sanitized.valid) {
      return NextResponse.json({ error: sanitized.error || 'INVALID_CONTENT' }, { status: 400 });
    }

    // 3. Database operations with service role
    const supabase = getServiceRoleClient();

    // Query active entitlement for key
    const { data: ent, error: entErr } = await supabase
      .from('entitlements')
      .select('id, status')
      .eq('key_id', claims.sub)
      .eq('feature', 'phone_notify')
      .eq('status', 'active')
      .maybeSingle();

    if (entErr || !ent) {
      return NextResponse.json({ error: 'NO_ACTIVE_ENTITLEMENT' }, { status: 403 });
    }

    // 4. Enqueue notification RPC
    const { data: notifId, error: rpcErr } = await supabase.rpc('enqueue_notification', {
      p_entitlement_id: ent.id,
      p_event_id: event_id,
      p_kind: sanitized.kind,
      p_title: sanitized.sanitizedTitle,
      p_body: sanitized.sanitizedBody,
      p_expires_seconds: expires_seconds ?? 1200,
    });

    if (rpcErr) {
      if (rpcErr.message?.includes('RATE_LIMIT_EXCEEDED')) {
        return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED' }, { status: 429 });
      }
      if (rpcErr.message?.includes('ENTITLEMENT_INACTIVE')) {
        return NextResponse.json({ error: 'ENTITLEMENT_INACTIVE' }, { status: 403 });
      }
      return NextResponse.json({ error: 'ENQUEUE_FAILED', message: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      notification_id: notifId,
      status: 'queued',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
