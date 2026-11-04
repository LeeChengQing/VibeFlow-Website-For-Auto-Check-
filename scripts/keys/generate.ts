import { writeFileSync } from 'node:fs';
import { generateV2Key, computeKeyHmac } from '../../lib/activation/key-generator';

export interface GenerateOptions {
  plan: string;
  channel: 'website' | 'kawang';
  region: 'cn' | 'global';
  count: number;
  batchId: string;
  dryRun?: boolean;
  outFile?: string;
  hmacSecret?: string;
}

export function generateBatch(options: GenerateOptions): {
  keys: string[];
  records: Array<{
    key_hash: string;
    hash_version: number;
    channel: string;
    region: string;
    batch_id: string;
    plan_code: string;
    status: string;
    max_devices: number;
  }>;
} {
  const secret = options.hmacSecret || process.env.KEY_HMAC_SECRET || 'dev-hmac-secret-placeholder-32-bytes!!';
  const keys: string[] = [];
  const records = [];

  for (let i = 0; i < options.count; i++) {
    const key = generateV2Key();
    const hash = computeKeyHmac(key, secret);
    keys.push(key);
    records.push({
      key_hash: hash,
      hash_version: 2,
      channel: options.channel,
      region: options.region,
      batch_id: options.batchId,
      plan_code: options.plan,
      status: 'listed',
      max_devices: 2,
    });
  }

  return { keys, records };
}

// CLI Execution Support
if (process.argv[1]?.includes('generate')) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const plan = getArg('--plan') || 'core';
  const channel = (getArg('--channel') || 'website') as 'website' | 'kawang';
  const region = (getArg('--region') || 'global') as 'cn' | 'global';
  const count = parseInt(getArg('--count') || '10', 10);
  const batchId = getArg('--batch') || `batch-${Date.now()}`;
  const outFile = getArg('--out');
  const dryRun = args.includes('--dry-run');

  const { keys, records } = generateBatch({ plan, channel, region, count, batchId });

  console.log('=== Batch Key Generation ===');
  console.log(`Plan: ${plan}, Channel: ${channel}, Region: ${region}`);
  console.log(`Batch ID: ${batchId}, Count: ${count}`);

  if (outFile) {
    writeFileSync(outFile, keys.join('\n') + '\n', { mode: 0o600 });
    console.log(`[SECURITY NOTICE] Plaintext batch saved to: ${outFile}`);
    console.log(`WARNING: Keep this file offline/encrypted. Destroy after distribution.`);
  }

  if (dryRun) {
    console.log('[DRY-RUN] No database modifications made.');
    console.log(`Sample key: ${keys[0]} -> hash: ${records[0].key_hash.slice(0, 16)}...`);
  }
}
