/**
 * Quick visual check: renders still frames (default: 3 per scene) to build/<format>/stills/*.png
 *   node scripts/test-frames.mjs --format 1080p [--scene id] [--at 0.1,0.5,0.9] [--w 960]
 */
import fs from 'node:fs';
import path from 'node:path';
import { FORMATS, buildDir } from './lib/config.mjs';
import { parseArgs } from './lib/util.mjs';
import { startServer } from './lib/server.mjs';
import { launchBrowser } from './lib/browser.mjs';

const args = parseArgs();
const format = args.format || '1080p';
const dir = buildDir(format);
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
const ats = String(args.at || '0.12,0.5,0.88').split(',').map(Number);
const only = args.scene ? String(args.scene).split(',') : null;
const outDir = path.join(dir, 'stills'); fs.mkdirSync(outDir, { recursive: true });
const vw = Number(args.w || plan.width), vh = Math.round((vw * plan.height) / plan.width);

const { server, port } = await startServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[page:${m.type()}] ${m.text().slice(0, 600)}`); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/web/index.html?format=${format}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  for (const sc of plan.scenes) {
    if (only && !only.includes(sc.id)) continue;
    for (const a of ats) {
      const fr = Math.min(sc.frames - 1, Math.round(a * sc.frames));
      const t0 = Date.now();
      await page.evaluate((i, k) => window.renderFrame(i, k), sc.index, fr);
      const file = path.join(outDir, `${String(sc.index).padStart(2, '0')}-${sc.id}-${String(Math.round(a * 100)).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, type: 'png' });
      console.log(`[still] ${path.basename(file)}  ${Date.now() - t0}ms`);
    }
  }
} finally { await browser.close(); server.close(); }
