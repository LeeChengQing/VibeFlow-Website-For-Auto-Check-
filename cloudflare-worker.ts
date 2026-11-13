import vinext from "vinext/server/fetch-handler";
export * from "vinext/server/fetch-handler";

type AdminRateLimit = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

export default {
  async fetch(
    request: Request,
    env: Parameters<typeof vinext.fetch>[1] & { ADMIN_LOGIN_RATE_LIMIT: AdminRateLimit },
    context: Parameters<typeof vinext.fetch>[2],
  ) {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    if (request.method === "POST" && (pathname === "/admin" || pathname === "/api/admin/session")) {
      const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const result = await env.ADMIN_LOGIN_RATE_LIMIT.limit({ key });
      if (!result.success) {
        return new Response("Too many requests. Please try again in a minute.", {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        });
      }
    }
    return vinext.fetch(request, env, context);
  },
};
