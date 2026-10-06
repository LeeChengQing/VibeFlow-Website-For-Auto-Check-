import { getCommerceDatabase, isCommerceConfigured } from '@/lib/supabase/commerce';
import { apiError, rateLimit } from '@/lib/security';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    rateLimit(request, 'config', 60);

    if (!isCommerceConfigured()) {
      return Response.json(
        {
          min_version: '1.0.0',
          announcement: null,
          features: { phone_alerts_enabled: true, offline_grace_hours: 72 },
        },
        { headers: CORS_HEADERS }
      );
    }

    const db = getCommerceDatabase() as any;
    const { data, error } = await db
      .from('app_config')
      .select('key, value')
      .eq('is_public', true);

    if (error) {
      throw error;
    }

    const config: Record<string, any> = {};
    for (const item of data || []) {
      config[item.key] = item.value;
    }

    return Response.json(config, { headers: CORS_HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
