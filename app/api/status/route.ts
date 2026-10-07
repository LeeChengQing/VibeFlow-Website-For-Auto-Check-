import { ActivationService } from '@/lib/activation/activation-service';
import { getCommerceDatabase, isCommerceConfigured } from '@/lib/supabase/commerce';
import { apiError, rateLimit } from '@/lib/security';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    rateLimit(request, 'status', 30);
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key') || undefined;
    const token = searchParams.get('token') || undefined;

    if (!key && !token) {
      return Response.json(
        { exists: false, error: 'Must provide key or token parameter' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!isCommerceConfigured()) {
      return Response.json(
        { exists: false, error: 'Database service is not configured' },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    const db = getCommerceDatabase();
    const service = new ActivationService({ db });

    const result = await service.getStatus({ key, token });
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
