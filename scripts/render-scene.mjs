/**
 * Render one scene (or all) of a format to build/<format>/clips/<scene>.mp4 (silent, frame-exact).
 *
 *   node scripts/render-scene.mjs --format 1080p --scene dust-storm
 *   node scripts/render-scene.mjs --format 4k --all
 *   options: --every N (render every Nth frame, for quick drafts)   --jpeg-quality 95
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { FORMATS, buildDir } from './lib/config.mjs';
import { parseArgs } from './lib/util.mjs';
import { startServer } from './lib/server.mjs';
import { launchBrowser } from './lib/browser.mjs';

const args = parseArgs();
const format = args.format || '1080p';
const f = FORMATS[format];
if (!f) throw new Error(`Unknown format ${format}`);
const dir = buildDir(format);
const planFile = path.join(dir, 'plan.json');
if (!fs.existsSync(planFile)) throw new Error(`Missing ${planFile}. Run: node scripts/plan.mjs --format ${format}  (the GitHub workflow does this in its plan job)`);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const wanted = args.all ? plan.scenes.map((s) => s.id) : String(args.scene || '').split(',').filter(Boolean);
if (!wanted.length) throw new Error('Pass --scene <id[,id]> or --all');
const quality = Number(args['jpeg-quality'] || 95);
const every = Number(args.every || 1);

const { server, port } = await startServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /warn|error/i.test(t)) console.log(`[page:${m.type()}] ${t.slice(0, 400)}`); });
  page.on('pageerror', (e) => { console.error('[pageerror]', e.message); });
  await page.setViewport({ width: plan.width, height: plan.height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/web/index.html?format=${format}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });

  for (const id of wanted) {
    const sc = plan.scenes.find((s) => s.id === id);
    if (!sc) throw new Error(`Scene ${id} not in plan for ${format}`);
    const out = path.join(dir, 'clips', `${id}.mp4`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const outFps = plan.fps / every;
    const ff = spawn('ffmpeg', [
      '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(outFps), '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
      '-c:v', 'libx264', '-preset', format === '4k' ? 'medium' : 'slow', '-crf', String(f.crf), '-r', String(outFps),
      '-g', String(Math.round(outFps * 2)), '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => { ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))); ff.on('error', rej); });
    ff.stdin.on('error', () => {});

    const t0 = Date.now();
    let n = 0;
    for (let fr = 0; fr < sc.frames; fr += every) {
      await page.evaluate((i, k) => window.renderFrame(i, k), sc.index, fr);
      const buf = await page.screenshot({ type: 'jpeg', quality: quality, optimizeForSpeed: true });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      n++;
      if (n % 30 === 0 || fr + every >= sc.frames) {
        const el = (Date.now() - t0) / 1000;
        console.log(`[render] ${format}/${id}: ${fr + 1}/${sc.frames} frames  ${(n / el).toFixed(2)} fps  eta ${(((sc.frames / every - n) / (n / el)) | 0)}s`);
      }
    }
    ff.stdin.end();
    await done;
    console.log(`[render] wrote ${path.relative(process.cwd(), out)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
} finally {
  await browser.close();
  server.close();
}
