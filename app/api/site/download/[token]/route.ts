import { localOnly } from '@/lib/security';
import { readSiteAssetRecord } from '@/lib/site-settings';
import { readAssetBytes } from '@/lib/site-assets';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    // Existing order storage is deliberately a local-only commerce demo.
    localOnly(request);
    const { token } = await params;
    if (!/^[0-9a-f]{64}$/.test(token)) return new Response('Not found', { status: 404 });
    const { getOrder } = await import('@/lib/store');
    const order = getOrder(token);
    if (!order || order.status !== 'paid' || !order.expiresAt || Date.parse(order.expiresAt) <= Date.now() || !order.extensionRelease || !['extension', 'bundle'].includes(order.plan)) return new Response('Not found', { status: 404 });
    const asset = await readSiteAssetRecord(order.extensionRelease.assetId);
    if (!asset || asset.kind !== 'release') return new Response('Not found', { status: 404 });
    const bytes = await readAssetBytes(asset);
    return new Response(new Blob([bytes as BlobPart]), { headers: { 'Content-Type': 'application/zip', 'Content-Length': String(bytes.byteLength), 'Content-Disposition': `attachment; filename="${asset.name.replace(/[^a-zA-Z0-9_. -]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
