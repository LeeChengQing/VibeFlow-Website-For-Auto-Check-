import { NextRequest, NextResponse } from 'next/server';
import { handleOrderRecovery } from '@/lib/recovery/order-recovery-service';
import { getServiceRoleClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== 'object' || !json.email) {
      return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 });
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const supabase = getServiceRoleClient();

    const result = await handleOrderRecovery(supabase, {
      email: json.email,
      clientIp,
    });

    if (!result.success) {
      if (result.error === 'RATE_LIMIT_EXCEEDED') {
        return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED' }, { status: 429 });
      }
      return NextResponse.json({ error: result.error || 'BAD_REQUEST' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (err: any) {
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
