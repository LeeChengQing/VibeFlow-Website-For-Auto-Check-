import { createHash } from 'node:crypto';
import {
  validateKeyFormat,
  canonicalizeKey,
  computeKeyHmac,
} from './key-generator';
import {
  signActivationToken,
  verifyActivationToken,
  TokenClaims,
  TokenVerificationResult,
} from './token-service';

export interface ActivationRequest {
  key: string;
  deviceId: string;
  appVersion?: string;
  clientIp?: string;
}

export interface ActivationResponse {
  success: boolean;
  status: string;
  token?: string;
  claims?: TokenClaims;
  features?: string[];
  validUntil?: string | null;
  maxDevices?: number;
  activeDevices?: number;
  error?: string;
}

export interface RefreshRequest {
  token: string;
  deviceId: string;
  appVersion?: string;
}

export interface DeactivateRequest {
  token: string;
  deviceId: string;
}

export interface KeyStatusRequest {
  key?: string;
  token?: string;
}

function hashString(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

/**
 * Service orchestrating key activation, JWS token signing, device quotas,
 * and rate limiting across the database and crypto modules.
 */
export class ActivationService {
  private db: any;
  private hmacSecret: string;
  private privateKeyPem: string;
  private currentKid: string;
  private keyring: Record<string, string>;

  constructor(options: {
    db: any;
    hmacSecret?: string;
    privateKeyPem?: string;
    currentKid?: string;
    keyring?: Record<string, string>;
  }) {
    this.db = options.db;
    this.hmacSecret = options.hmacSecret || process.env.KEY_HMAC_SECRET || 'dev-hmac-secret-placeholder-32-bytes!!';
    this.privateKeyPem = options.privateKeyPem || process.env.ED25519_PRIVATE_KEY_PEM || '';
    this.currentKid = options.currentKid || process.env.ED25519_CURRENT_KID || 'kid-2026-v1';
    this.keyring = options.keyring || {};
  }

  private async callRpc(
    rpcName: string,
    args: Record<string, any>,
    sql: string,
    params: any[]
  ): Promise<any[]> {
    if (typeof this.db?.query === 'function') {
      const res = await this.db.query(sql, params);
      return res.rows || [];
    }
    if (typeof this.db?.rpc === 'function') {
      const res = await this.db.rpc(rpcName, args);
      if (res.error) throw res.error;
      return Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    }
    throw new Error('Unsupported database client interface');
  }

  /**
   * Activates a license key for a given device.
   */
  async activate(req: ActivationRequest): Promise<ActivationResponse> {
    if (!req.key || typeof req.key !== 'string') {
      return { success: false, status: 'INVALID_KEY', error: 'Missing activation key' };
    }
    if (!req.deviceId || typeof req.deviceId !== 'string') {
      return { success: false, status: 'INVALID_DEVICE', error: 'Missing device ID' };
    }

    // 1. Client-side format & check digit validation
    if (!validateKeyFormat(req.key)) {
      return { success: false, status: 'INVALID_KEY', error: 'Invalid key format or check digit' };
    }

    // 2. Hash computation
    const keyHash = computeKeyHmac(req.key, this.hmacSecret);
    const deviceIdHash = hashString(req.deviceId);
    const clientIpHash = req.clientIp ? hashString(req.clientIp) : 'anonymous';
    const appVersion = req.appVersion || '1.0.0';

    // 3. Database RPC activation in single transaction
    const rows = await this.callRpc(
      'activate_license_key',
      {
        p_key_hash: keyHash,
        p_device_id_hash: deviceIdHash,
        p_app_version: appVersion,
        p_client_ip_hash: clientIpHash,
      },
      `select * from public.activate_license_key($1, $2, $3, $4)`,
      [keyHash, deviceIdHash, appVersion, clientIpHash]
    );

    const row = rows[0];
    if (!row || !row.success) {
      const errStatus = row?.status || 'INVALID_KEY';
      return {
        success: false,
        status: errStatus,
        error: errStatus === 'DEVICE_LIMIT_EXCEEDED'
          ? `Device limit exceeded (maximum ${row?.max_devices || 2} devices)`
          : 'Activation key is invalid, expired, or revoked',
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const claims: TokenClaims = {
      sub: row.license_key_id,
      did: deviceIdHash,
      plan: row.plan_code,
      feat: row.features || ['core'],
      iat: nowSec,
      exp: nowSec + 7 * 86400, // 7 days validity
      ver: 2,
      min_app: '1.0.0',
    };

    let token = '';
    if (this.privateKeyPem) {
      token = signActivationToken(claims, this.privateKeyPem, this.currentKid);
    }

    return {
      success: true,
      status: row.status,
      token,
      claims,
      features: row.features,
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      maxDevices: row.max_devices,
      activeDevices: row.active_devices,
    };
  }

  /**
   * Refreshes an existing JWS activation token.
   */
  async refresh(req: RefreshRequest): Promise<{
    success: boolean;
    token?: string;
    claims?: TokenClaims;
    status: string;
    error?: string;
  }> {
    if (!req.token) {
      return { success: false, status: 'INVALID_TOKEN', error: 'Missing token' };
    }

    const verification: TokenVerificationResult = verifyActivationToken(req.token, this.keyring, {
      allowOfflineGrace: true,
    });

    if (!verification.allowed || !verification.claims) {
      return { success: false, status: verification.status, error: verification.error };
    }

    const deviceIdHash = hashString(req.deviceId);
    if (verification.claims.did !== deviceIdHash) {
      return { success: false, status: 'DEVICE_MISMATCH', error: 'Token was issued for a different device' };
    }

    // Verify key in DB is not revoked or refunded
    const keyRes = await this.db.query(
      `select status, valid_until from public.license_keys where id = $1`,
      [verification.claims.sub]
    );

    const keyRow = keyRes.rows?.[0];
    if (!keyRow || keyRow.status === 'revoked' || keyRow.status === 'refunded') {
      return { success: false, status: 'REVOKED_KEY', error: 'License key has been revoked' };
    }

    if (keyRow.status === 'expired' || (keyRow.valid_until && new Date(keyRow.valid_until).getTime() < Date.now())) {
      return { success: false, status: 'EXPIRED_KEY', error: 'License key has expired' };
    }

    // Issue refreshed token (7 days)
    const nowSec = Math.floor(Date.now() / 1000);
    const newClaims: TokenClaims = {
      ...verification.claims,
      iat: nowSec,
      exp: nowSec + 7 * 86400,
    };

    const newToken = this.privateKeyPem
      ? signActivationToken(newClaims, this.privateKeyPem, this.currentKid)
      : req.token;

    return {
      success: true,
      status: 'REFRESHED',
      token: newToken,
      claims: newClaims,
    };
  }

  /**
   * Deactivates a device registration for self-serve device unbinding.
   */
  async deactivate(req: DeactivateRequest): Promise<{ success: boolean; error?: string }> {
    if (!req.token) {
      return { success: false, error: 'Missing token' };
    }

    const verification = verifyActivationToken(req.token, this.keyring, { allowOfflineGrace: true });
    if (!verification.allowed || !verification.claims) {
      return { success: false, error: 'Invalid token' };
    }

    const deviceIdHash = hashString(req.deviceId);
    const rows = await this.callRpc(
      'deactivate_device',
      { p_key_id: verification.claims.sub, p_device_id_hash: deviceIdHash },
      `select * from public.deactivate_device($1, $2)`,
      [verification.claims.sub, deviceIdHash]
    );

    const success = rows[0]?.success ?? false;
    return { success, error: success ? undefined : 'Device was not actively registered' };
  }

  /**
   * Looks up safe public status information for a key or token.
   */
  async getStatus(req: KeyStatusRequest): Promise<any> {
    let keyHash = '';
    if (req.key) {
      if (!validateKeyFormat(req.key)) {
        return { exists: false, status: 'INVALID_KEY' };
      }
      keyHash = computeKeyHmac(req.key, this.hmacSecret);
    } else if (req.token) {
      const verification = verifyActivationToken(req.token, this.keyring, { allowOfflineGrace: true });
      if (!verification.allowed || !verification.claims) {
        return { exists: false, status: 'INVALID_TOKEN' };
      }
      if (typeof this.db?.query === 'function') {
        const keyRes = await this.db.query(
          `select key_hash from public.license_keys where id = $1`,
          [verification.claims.sub]
        );
        keyHash = keyRes.rows?.[0]?.key_hash;
      } else if (typeof this.db?.from === 'function') {
        const { data } = await this.db
          .from('license_keys')
          .select('key_hash')
          .eq('id', verification.claims.sub)
          .single();
        keyHash = data?.key_hash;
      }
    }

    if (!keyHash) {
      return { exists: false, status: 'NOT_FOUND' };
    }

    const rows = await this.callRpc(
      'get_key_status',
      { p_key_hash: keyHash },
      `select * from public.get_key_status($1)`,
      [keyHash]
    );
    const row = rows[0];
    if (!row || !row.key_found) {
      return { exists: false, status: 'NOT_FOUND' };
    }

    return {
      exists: true,
      status: row.status,
      plan: row.plan_code,
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      maxDevices: row.max_devices,
      activeDevices: row.active_devices,
    };
  }
}
