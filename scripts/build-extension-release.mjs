import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const releaseDir = resolve('dist/extension-release');
const zipOutput = resolve('public/downloads/auto-check-extension.zip');

mkdirSync(releaseDir, { recursive: true });
mkdirSync(resolve('public/downloads'), { recursive: true });

// 1. Extension source files for MV3 release
const manifest = {
  manifest_version: 3,
  name: "Auto-Check",
  version: "1.0.0",
  description: "Auto-Check Extension - Automated Class Check-in and Attendance",
  permissions: ["storage", "alarms", "notifications"],
  action: {
    default_title: "Auto-Check"
  },
  background: {
    service_worker: "background.js"
  }
};

const backgroundCode = `// Auto-Check MV3 Background Service Worker
// Fail-open for previously activated users: network errors do not block existing users.
self.addEventListener('install', () => {
  console.log('[Auto-Check] Extension installed.');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkin-refresh') {
    console.log('[Auto-Check] Check-in alarm triggered.');
  }
});
`;

const readme = `# Auto-Check Browser Extension v1.0.0

## Installation Instructions
1. Open Google Chrome and navigate to \`chrome://extensions/\`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Unzip this folder, or click **Load unpacked** and select the unzipped directory.
4. Pin the Auto-Check icon to your toolbar.
5. Click the icon to view your license status and configure settings.

For assistance, visit: https://auto-check.example/support
`;

writeFileSync(join(releaseDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(releaseDir, 'background.js'), backgroundCode);
writeFileSync(join(releaseDir, 'README.md'), readme);

// 2. Security scan: ensure zero secrets or sensitive files
const forbiddenPatterns = [
  /service_role/i,
  /sk_live_/i,
  /whsec_/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /BEGIN (RSA|EC|OPENSSH)? PRIVATE KEY/i,
  /\.env/i,
];

for (const file of readdirSync(releaseDir)) {
  const content = readFileSync(join(releaseDir, file), 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(`SECURITY SCAN FAILED: File ${file} matches forbidden pattern ${pattern}`);
    }
  }
}

// 3. Compress to ZIP using PowerShell Compress-Archive
try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${releaseDir}/*' -DestinationPath '${zipOutput}' -Force"`,
    { stdio: 'inherit' }
  );
  const zipBytes = readFileSync(zipOutput);
  const hash = createHash('sha256').update(zipBytes).digest('hex');
  console.log(`[Extension Build] Successfully created ${zipOutput}`);
  console.log(`[Extension Build] Size: ${zipBytes.length} bytes`);
  console.log(`[Extension Build] SHA-256: ${hash}`);
} catch (error) {
  console.error('[Extension Build] Failed to create zip archive:', error);
  process.exit(1);
}
