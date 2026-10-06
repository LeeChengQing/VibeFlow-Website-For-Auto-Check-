import { readFileSync } from 'node:fs';

export interface KeyImportRecord {
  key_hash: string;
  encrypted_key?: string;
  plan_type: string;
  status: string;
  channel?: string;
  region?: string;
  batch_id?: string;
}

export interface KeyImportReport {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  byPlan: Record<string, number>;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  byRegion: Record<string, number>;
  errors: Array<{ line: number; error: string }>;
}

export function parseAndValidateKeysCSV(
  csvContent: string,
  defaults: { channel?: string; region?: string; batch_id?: string } = {}
): { records: KeyImportRecord[]; report: KeyImportReport } {
  const lines = csvContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const report: KeyImportReport = {
    totalRows: 0,
    validRows: 0,
    duplicateRows: 0,
    invalidRows: 0,
    byPlan: {},
    byStatus: {},
    byChannel: {},
    byRegion: {},
    errors: [],
  };

  if (lines.length === 0) {
    return { records: [], report };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
  const hashIdx = headers.indexOf('key_hash');
  const encIdx = headers.indexOf('encrypted_key');
  const planIdx = headers.indexOf('plan_type');
  const statusIdx = headers.indexOf('status');

  const startIndex = hashIdx !== -1 ? 1 : 0;
  const seenHashes = new Set<string>();
  const records: KeyImportRecord[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const lineNum = i + 1;
    report.totalRows++;
    const parts = lines[i].split(',').map(p => p.trim());

    const keyHash = hashIdx !== -1 ? parts[hashIdx] : parts[0];
    const encKey = encIdx !== -1 ? parts[encIdx] : parts[1];
    const planType = (planIdx !== -1 ? parts[planIdx] : parts[2]) || 'core';
    const status = (statusIdx !== -1 ? parts[statusIdx] : parts[3]) || 'available';

    if (!keyHash || keyHash.length < 16) {
      report.invalidRows++;
      report.errors.push({ line: lineNum, error: 'Invalid or missing key_hash' });
      continue;
    }

    if (seenHashes.has(keyHash)) {
      report.duplicateRows++;
      report.errors.push({ line: lineNum, error: `Duplicate key_hash: ${keyHash.slice(-4)}` });
      continue;
    }

    seenHashes.add(keyHash);
    report.validRows++;

    const channel = defaults.channel || 'website';
    const region = defaults.region || 'global';
    const batchId = defaults.batch_id || 'csv-import';

    report.byPlan[planType] = (report.byPlan[planType] || 0) + 1;
    report.byStatus[status] = (report.byStatus[status] || 0) + 1;
    report.byChannel[channel] = (report.byChannel[channel] || 0) + 1;
    report.byRegion[region] = (report.byRegion[region] || 0) + 1;

    records.push({
      key_hash: keyHash,
      encrypted_key: encKey,
      plan_type: planType,
      status: status,
      channel,
      region,
      batch_id: batchId,
    });
  }

  return { records, report };
}

// CLI Execution Support
if (process.argv[1]?.endsWith('import-keys.ts') || process.argv[1]?.endsWith('import-keys.js')) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.log('Usage: node scripts/import-keys.mjs <csv-file-path> [--dry-run] [--channel <ch>] [--region <reg>] [--batch <id>]');
    process.exit(0);
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const { report } = parseAndValidateKeysCSV(content);

    console.log('=== Legacy Keys Import Report ===');
    console.log(`Total Rows: ${report.totalRows}`);
    console.log(`Valid: ${report.validRows}, Duplicates: ${report.duplicateRows}, Invalid: ${report.invalidRows}`);
    console.log('By Plan:', report.byPlan);
    console.log('By Status:', report.byStatus);
    console.log('By Channel:', report.byChannel);
    console.log('By Region:', report.byRegion);

    if (isDryRun) {
      console.log('DRY RUN COMPLETE: No database modifications made.');
    }
  } catch (err: any) {
    console.error('Import error:', err.message);
    process.exit(1);
  }
}
