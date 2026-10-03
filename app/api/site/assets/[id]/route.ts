import { getAdminSession } from '@/lib/admin-auth';
import { getPublishedSiteConfig, readSiteAssetRecord } from '@/lib/site-settings';
import { readAssetBytes } from '@/lib/site-assets';

export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
    const config = await getPublishedSiteConfig();
    const published = config.guides.some(guide => guide.visible && guide.src === `/api/site/assets/${id}`);
    let admin = false;
    if (!published) { try { admin = !!await getAdminSession(); } catch { /* deny */ } }
    if (!published && !admin) return new Response('Not found', { status: 404 });
    const asset = await readSiteAssetRecord(id);
    if (!asset || asset.kind !== 'guide') return new Response('Not found', { status: 404 });
    const bytes = await readAssetBytes(asset);
    return new Response(new Blob([bytes as BlobPart]), { headers: { 'Content-Type': asset.mime, 'Content-Length': String(bytes.byteLength), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
