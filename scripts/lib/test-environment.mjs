/**
 * Isolated test environment factory.
 * Guarantees zero leakage of production or live credentials into tests.
 */

const SYSTEM_ALLOWLIST = new Set([
  'PATH',
  'PATHEXT',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'COMSPEC',
  'USERPROFILE',
  'HOME',
  'APPDATA',
  'LOCALAPPDATA',
  'NODE_OPTIONS',
  'LANG',
  'LC_ALL',
  'TERM',
  'COLORTERM',
  'CI',
  'OS',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
]);

export function isolatedTestEnvironment(sourceEnv = process.env, options = {}) {
  const safeEnv = {};

  // 1. Copy allowlisted system variables only
  for (const [key, val] of Object.entries(sourceEnv)) {
    if (SYSTEM_ALLOWLIST.has(key.toUpperCase())) {
      safeEnv[key] = val;
    }
  }

  // 2. Inject explicit test defaults (safe, synthetic, non-production)
  const testDefaults = {
    NODE_ENV: 'test',
    APP_URL: 'http://127.0.0.1:3000',
    STRIPE_SECRET_KEY: 'sk_test_mock_stripe_key_never_live',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_mock_webhook_secret',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'mock_test_service_role_key_for_testing',
    TOYYIBPAY_SECRET_KEY: 'test_toyyib_secret',
    TOYYIBPAY_CATEGORY_CODE: 'test_category_code',
    LICENSE_KEY_ENCRYPTION_KEY: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
    ADMIN_SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ADMIN_DASHBOARD_PASSWORD: 'test_admin_password',
    RESEND_API_KEY: 're_test_mock_resend_api_key',
    NTFY_ADMIN_TOPIC: 'test_admin_ntfy_topic_mock',
  };

  Object.assign(safeEnv, testDefaults, options.overrides || {});
  return safeEnv;
}
