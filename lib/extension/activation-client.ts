import { verifyActivationToken } from '../activation/token-service';

export interface ActivationStorageState {
  hasEverActivated: boolean;
  cachedToken: string | null;
  lastVerifiedAt: number | null;
  lastServerStatus: 'ACTIVATED' | 'REVOKED' | 'EXPIRED' | 'UNACTIVATED' | null;
  plan?: string;
  features?: string[];
  validUntil?: string | null;
  revocationReason?: string | null;
  deviceId?: string;
}

export type GateStatus = 'ALLOWED' | 'ALLOWED_WITH_WARNING' | 'REJECTED';

export interface CoreGateResult {
  allowed: boolean;
  status: GateStatus;
  reason?: 'NEVER_ACTIVATED' | 'KEY_REVOKED' | 'TOKEN_EXPIRED_PAST_GRACE' | 'DEVICE_MISMATCH';
  warning?: 'OFFLINE_GRACE_PERIOD' | 'SERVER_TEMPORARILY_UNREACHABLE' | 'TOKEN_EXPIRING_SOON';
  details?: string | null;
}

export interface EvaluationContext {
  networkAvailable?: boolean;
  serverReachable?: boolean;
  transientError?: string;
}

export interface DiagnosticsInfo {
  appVersion: string;
  hasEverActivated: boolean;
  status: string;
  lastVerifiedAt: string | null;
  plan: string;
  features: string[];
}

export function evaluateCoreGate(
  state: ActivationStorageState,
  context?: EvaluationContext,
  keyring?: Record<string, string>
): CoreGateResult {
  // 1. Never activated user: strictly reject
  if (!state.hasEverActivated) {
    return {
      allowed: false,
      status: 'REJECTED',
      reason: 'NEVER_ACTIVATED',
      details: 'This extension requires license activation before automated tasks can run.',
    };
  }

  // 2. Explicitly revoked license: strictly reject
  if (state.lastServerStatus === 'REVOKED') {
    return {
      allowed: false,
      status: 'REJECTED',
      reason: 'KEY_REVOKED',
      details: state.revocationReason || 'License key has been refunded or revoked.',
    };
  }

  // 3. Transient errors / network unreachable: Fail-Open for previously activated users!
  const isNetworkDown = context?.networkAvailable === false;
  const isServerDown = context?.serverReachable === false;
  const hasTransientError = Boolean(context?.transientError);

  if (isNetworkDown || isServerDown || hasTransientError) {
    return {
      allowed: true,
      status: 'ALLOWED_WITH_WARNING',
      warning: isNetworkDown ? 'OFFLINE_GRACE_PERIOD' : 'SERVER_TEMPORARILY_UNREACHABLE',
      details: 'Using offline grace period: automated check-in continuing without interruption.',
    };
  }

  // 4. Verify cached token
  if (!state.cachedToken) {
    // If user has activated before but token is missing during online verification
    return {
      allowed: true,
      status: 'ALLOWED_WITH_WARNING',
      warning: 'SERVER_TEMPORARILY_UNREACHABLE',
    };
  }

  if (keyring) {
    const tokenResult = verifyActivationToken(state.cachedToken, keyring);
    if (!tokenResult.allowed) {
      if (tokenResult.status === 'grace_period') {
        return {
          allowed: true,
          status: 'ALLOWED_WITH_WARNING',
          warning: 'OFFLINE_GRACE_PERIOD',
          details: 'Activation token is within 72-hour offline grace period.',
        };
      }

      return {
        allowed: false,
        status: 'REJECTED',
        reason: 'TOKEN_EXPIRED_PAST_GRACE',
        details: tokenResult.error || 'Activation token has expired.',
      };
    }
  }

  // Active and verified
  return {
    allowed: true,
    status: 'ALLOWED',
  };
}

export function createActivationClient(options: {
  storage: any;
  apiBaseUrl?: string;
  keyring?: Record<string, string>;
}) {
  const storage = options.storage;
  const keyring = options.keyring;
  const STORAGE_KEY = 'autocheck_activation_state';

  async function getState(): Promise<ActivationStorageState> {
    const data = await storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || {
      hasEverActivated: false,
      cachedToken: null,
      lastVerifiedAt: null,
      lastServerStatus: null,
    };
  }

  async function saveState(state: Partial<ActivationStorageState>): Promise<void> {
    const current = await getState();
    const updated = { ...current, ...state };
    await storage.local.set({ [STORAGE_KEY]: updated });
  }

  return {
    getState,
    async checkGate(evalContext?: { forceOffline?: boolean }): Promise<CoreGateResult> {
      const state = await getState();
      const ctx: EvaluationContext = {
        networkAvailable: !evalContext?.forceOffline,
        serverReachable: !evalContext?.forceOffline,
        transientError: evalContext?.forceOffline ? 'OFFLINE_MODE' : undefined,
      };
      return evaluateCoreGate(state, ctx, keyring);
    },

    async recordActivationSuccess(params: {
      token: string;
      plan: string;
      features: string[];
      validUntil?: string | null;
      deviceId?: string;
    }): Promise<void> {
      await saveState({
        hasEverActivated: true,
        cachedToken: params.token,
        lastVerifiedAt: Date.now(),
        lastServerStatus: 'ACTIVATED',
        plan: params.plan,
        features: params.features,
        validUntil: params.validUntil,
        deviceId: params.deviceId,
        revocationReason: null,
      });
    },

    async recordRevocation(reason?: string): Promise<void> {
      await saveState({
        cachedToken: null,
        lastVerifiedAt: Date.now(),
        lastServerStatus: 'REVOKED',
        revocationReason: reason || 'Revoked by server',
      });
    },

    async getDiagnostics(): Promise<DiagnosticsInfo> {
      const state = await getState();
      return {
        appVersion: '1.0.0',
        hasEverActivated: state.hasEverActivated,
        status: state.lastServerStatus || 'UNACTIVATED',
        lastVerifiedAt: state.lastVerifiedAt ? new Date(state.lastVerifiedAt).toISOString() : null,
        plan: state.plan || 'none',
        features: state.features || [],
      };
    },
  };
}
