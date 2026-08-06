/**
 * Publish an over-the-air (OTA) update.
 *
 * Zips the built web app (dist/), uploads it as a versioned bundle to Supabase
 * storage, and updates latest.json so installed apps pick it up on next launch.
 *
 * Usage:
 *   npm run build
 *   SUPABASE_SERVICE_KEY=... node scripts/publish-ota.mjs
 *
 * Env:
 *   SUPABASE_SERVICE_KEY  (required) — Supabase service-role key
 *   SUPABASE_URL          (optional) — defaults to the project URL below
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zyqnaldaaqqdhnbqitjn.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1); }

const version = `1.0.${Math.floor(Date.now() / 1000)}`;
const bundlePath = '/tmp/ota-bundle.zip';

// Zip the CONTENTS of dist (index.html must be at the zip root for Capgo).
execSync(`cd dist && zip -qr ${bundlePath} .`, { stdio: 'inherit' });

const bucketPath = `bundles/${version}.zip`;
const uploadUrl = `${SUPABASE_URL}/storage/v1/object/downloads/${bucketPath}`;
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/downloads/${bucketPath}`;

// Upload the bundle
execSync(
  `curl -sS -X POST "${uploadUrl}" -H "Authorization: Bearer ${KEY}" -H "apikey: ${KEY}" ` +
  `-H "x-upsert: true" -H "Content-Type: application/zip" --data-binary @${bundlePath}`,
  { stdio: 'inherit' },
);

// Update latest.json
const manifest = JSON.stringify({ version, url: publicUrl, published: new Date().toISOString() });
execSync(
  `curl -sS -X POST "${SUPABASE_URL}/storage/v1/object/downloads/latest.json" ` +
  `-H "Authorization: Bearer ${KEY}" -H "apikey: ${KEY}" -H "x-upsert: true" ` +
  `-H "Content-Type: application/json" --data-raw '${manifest}'`,
  { stdio: 'inherit' },
);

console.log(`\n✓ Published OTA ${version}`);
console.log(`  bundle: ${publicUrl}`);
console.log(`  Size: ${(readFileSync(bundlePath).length / 1024).toFixed(0)} KB`);
