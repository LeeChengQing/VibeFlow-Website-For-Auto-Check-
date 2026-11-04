import { ActivationService } from '@/lib/activation/activation-service';
import { getCommerceDatabase, isCommerceConfigured } from '@/lib/supabase/commerce';
import { apiError, rateLimit } from '@/lib/security';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    rateLimit(request, 'activate', 15);
    const body = await request.json().catch(() => ({}));
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    if (!isCommerceConfigured()) {
      return Response.json(
        { success: false, status: 'COMMERCE_NOT_CONFIGURED', error: 'Database service is not configured' },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    const db = getCommerceDatabase();
    const service = new ActivationService({ db });

    const result = await service.activate({
      key: body.key,
      deviceId: body.device_id || body.deviceId,
      appVersion: body.app_version || body.appVersion,
      clientIp,
    });

    const httpStatus = result.success ? 200 : (result.status === 'DEVICE_LIMIT_EXCEEDED' ? 403 : 400);
    return Response.json(result, { status: httpStatus, headers: CORS_HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
