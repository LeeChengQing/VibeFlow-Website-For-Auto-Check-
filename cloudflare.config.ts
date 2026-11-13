import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "auto-check",
    entrypoint: "./cloudflare-worker.ts",
    compatibilityDate: "2026-11-06",
    compatibilityFlags: ["nodejs_compat"],
    observability: { enabled: true },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      ADMIN_LOGIN_RATE_LIMIT: bindings.rateLimit({ namespace: "101", simple: { limit: 10, period: 60 } }),
      APP_URL: bindings.text("https://auto-check.vibeflow-my.workers.dev"),
      PUBLIC_SALES_ENABLED: bindings.text("true"),
      STRIPE_LIVE_MODE: bindings.text("true"),
      SUPABASE_URL: bindings.text("https://qckpwckfukyurkobrsig.supabase.co"),
      TOYYIBPAY_SANDBOX: bindings.text("false"),
      ADMIN_DASHBOARD_PASSWORD: bindings.secret(),
      ADMIN_SESSION_SECRET: bindings.secret(),
      LICENSE_KEY_ENCRYPTION_KEY: bindings.secret(),
      PLUGIN_OTP_SECRET: bindings.secret(),
      RESEND_API_KEY: bindings.secret(),
      EMAIL_FROM: bindings.secret(),
      STRIPE_SECRET_KEY: bindings.secret(),
      STRIPE_WEBHOOK_SECRET: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      TOYYIBPAY_CATEGORY_CODE: bindings.secret(),
      TOYYIBPAY_SECRET_KEY: bindings.secret(),
    },
  }),
});
