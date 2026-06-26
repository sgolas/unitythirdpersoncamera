// ============================================================================
// Void Protocol — headless browser smoke test.
// Serves the repo and drives the real UI: home -> zone -> battle -> victory.
// Asserts there are no console/page errors along the way.
//
// Requires Playwright's chromium. Run with:
//   node tests/browser.smoke.mjs
// Optionally set CHROMIUM_PATH to a chromium executable if auto-launch fails.
// ============================================================================
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
  res.end(fs.readFileSync(fp));
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('SKIP: playwright not installed'); server.close(); process.exit(0); }

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

ok(await page.locator('.home').count() > 0, 'home renders');
await page.click('[data-go="campaign"]');
ok(await page.locator('.zone-list').count() > 0, 'campaign zone list');
await page.click('[data-zone="ruined_city"]');
ok(await page.locator('.ow-map').count() > 0, 'overworld map');
await page.click('[data-node="rc_1"]');
await page.waitForSelector('.battle', { timeout: 3000 });
ok(await page.locator('.grid .tile').count() === 25, 'battle grid has 25 tiles');

let resolved = false;
for (let i = 0; i < 150 && !resolved; i++) {
  if (await page.locator('#overlay.show').count()) { resolved = true; break; }
  const btn = page.locator('.card.grav .dirbtn:not([disabled])').first();
  if (await btn.count()) await btn.click().catch(() => {});
  else { const e = page.locator('.endbtn:not([disabled])').first(); if (await e.count()) await e.click().catch(() => {}); }
  await page.waitForTimeout(140);
}
ok(resolved, 'battle resolves to a result overlay');
ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join('; ') : ''));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
