const fs = require('node:fs');
const crypto = require('node:crypto');

const outputRoot = `${__dirname}/../generated_keys`;
const internationalRoot = `${outputRoot}/international_region`;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const csvHeader = 'key_hash,encrypted_key,plan_type,status';

// `node` does not load Next.js environment files automatically. Preserve an
// explicitly supplied process environment value while supporting local runs.
const localEnvPath = `${__dirname}/../.env.local`;
if (fs.existsSync(localEnvPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(localEnvPath);
}

function encryptionKey() {
  const encoded = process.env.LICENSE_KEY_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(encoded)) {
    throw new Error('Set LICENSE_KEY_ENCRYPTION_KEY to the app’s canonical base64 encoding of 32 bytes before generating keys.');
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('LICENSE_KEY_ENCRYPTION_KEY must be the app’s canonical base64 encoding of exactly 32 bytes.');
  }
  return key;
}

function encryptKey(rawKey, keyHash, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(keyHash, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${nonce.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

const plans = [
  {
    directory: 'bundle',
    filename: 'bundle_keys.csv',
    rawFilename: 'bundle_raw.txt',
    prefix: 'AC-INTL-BNDL-',
    planType: 'bundle',
  },
  {
    directory: 'mobile_notification/monthly',
    filename: 'mobile_monthly_keys.csv',
    rawFilename: 'mobile_monthly_raw.txt',
    prefix: 'AC-INTL-MOBM-',
    planType: 'semester',
  },
  {
    directory: 'mobile_notification/yearly',
    filename: 'mobile_yearly_keys.csv',
    rawFilename: 'mobile_yearly_raw.txt',
    prefix: 'AC-INTL-MOBY-',
    planType: 'yearly',
  },
];

function createRandomSuffix() {
  const length = crypto.randomInt(8, 13);
  let suffix = '';

  for (let index = 0; index < length; index += 1) {
    suffix += alphabet[crypto.randomInt(alphabet.length)];
  }

  return suffix;
}

function createCsvRow(rawKey, planType, key) {
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const encryptedKey = encryptKey(rawKey, keyHash, key);
  return `${keyHash},${encryptedKey},${planType},available`;
}

// Validate encryption configuration before removing a previous usable batch.
const key = encryptionKey();
fs.rmSync(outputRoot, { recursive: true, force: true });

for (const plan of plans) {
  const directory = `${internationalRoot}/${plan.directory}`;
  fs.mkdirSync(directory, { recursive: true });

  const keys = new Set();
  while (keys.size < 50) {
    keys.add(`${plan.prefix}${createRandomSuffix()}`);
  }

  const rows = Array.from(keys, (rawKey) => createCsvRow(rawKey, plan.planType, key));
  const csv = [csvHeader, ...rows].join('\n') + '\n';
  fs.writeFileSync(`${directory}/${plan.filename}`, csv, 'utf8');
  fs.writeFileSync(`${directory}/${plan.rawFilename}`, `${Array.from(keys).join('\n')}\n`, 'utf8');
}

console.log('Generated 50 international keys for each of 3 plans.');
