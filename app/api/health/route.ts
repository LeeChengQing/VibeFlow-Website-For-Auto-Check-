import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus = 'disconnected';

  try {
    const supabase = getServiceRoleClient();
    const { error } = await supabase.from('app_config').select('key').limit(1);
    if (!error) {
      dbStatus = 'connected';
    } else {
      dbStatus = `error: ${error.message}`;
    }
  } catch (err: any) {
    dbStatus = `unreachable: ${err.message}`;
  }

  const zipPath = resolve('public/downloads/auto-check-extension.zip');
  const releaseAssetReady = existsSync(zipPath);

  const healthy = dbStatus === 'connected';
  const status = healthy ? 'healthy' : 'degraded';
  const statusCode = healthy ? 200 : 503;

  return NextResponse.json(
    {
      status,
      database: dbStatus,
      release_asset_ready: releaseAssetReady,
      version: '1.0.0',
      timestamp,
    },
    { status: statusCode }
  );
}
