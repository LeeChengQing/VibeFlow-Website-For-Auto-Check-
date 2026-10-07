import { createHash } from 'node:crypto';
import { localOnly } from '@/lib/security';
import { readSiteAssetRecord, getPublishedSiteConfig } from '@/lib/site-settings';
import { readAssetBytes } from '@/lib/site-assets';
import { getCommerceDatabase, isCommerceConfigured } from '@/lib/supabase/commerce';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!/^[0-9a-f]{64}$/.test(token)) return new Response('Not found', { status: 404 });

    if (isCommerceConfigured()) {
      const db = getCommerceDatabase();
      const tokenDigest = createHash('sha256').update(token).digest('hex');

      const { data: order } = await db
        .from('orders')
        .select('id, plan, status, release_asset_id')
        .eq('order_access_token_hash', tokenDigest)
        .maybeSingle();

      if (!order || order.status !== 'paid' || !['extension', 'bundle'].includes(order.plan)) {
        return new Response('Not found', { status: 404 });
      }

      let asset = null;
      if (order.release_asset_id) {
        asset = await readSiteAssetRecord(order.release_asset_id);
      }
      if (!asset) {
        const config = await getPublishedSiteConfig();
        if (config.settings.extensionRelease) {
          asset = await readSiteAssetRecord(config.settings.extensionRelease.assetId);
        }
      }

      if (!asset || asset.kind !== 'release') return new Response('Not found', { status: 404 });

      const bytes = await readAssetBytes(asset);
      return new Response(new Blob([bytes as BlobPart]), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(bytes.byteLength),
          'Content-Disposition': `attachment; filename="${asset.name.replace(/[^a-zA-Z0-9_. -]/g, '_')}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }

    // Fallback for local demo preview
    localOnly(request);
    const { getOrder } = await import('@/lib/store');
    const order = getOrder(token);
    if (!order || order.status !== 'paid' || !order.expiresAt || Date.parse(order.expiresAt) <= Date.now() || !order.extensionRelease || !['extension', 'bundle'].includes(order.plan)) {
      return new Response('Not found', { status: 404 });
    }
    const asset = await readSiteAssetRecord(order.extensionRelease.assetId);
    if (!asset || asset.kind !== 'release') return new Response('Not found', { status: 404 });
    const bytes = await readAssetBytes(asset);
    return new Response(new Blob([bytes as BlobPart]), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${asset.name.replace(/[^a-zA-Z0-9_. -]/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
