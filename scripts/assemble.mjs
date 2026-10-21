/**
 * Concatenate scene clips, add narration (aligned per scene) + procedural ambient score with ducking,
 * write build/<format>/out/mars-documentary-<format>.mp4 and copy the .srt next to it.
 *   node scripts/assemble.mjs --format 1080p
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, FORMATS, buildDir } from './lib/config.mjs';
import { parseArgs, run } from './lib/util.mjs';

const args = parseArgs();
const format = args.format || '1080p';
if (!FORMATS[format]) throw new Error(`Unknown format ${format}`);
const dir = buildDir(format);
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
const outDir = path.join(dir, 'out'); fs.mkdirSync(outDir, { recursive: true });

const clips = plan.scenes.map((s) => path.join(dir, 'clips', `${s.id}.mp4`));
const missing = clips.filter((c) => !fs.existsSync(c));
if (missing.length) throw new Error(`Missing clips:\n${missing.join('\n')}`);

const list = path.join(dir, 'clips.txt');
fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));

const T = plan.total;
const narr = plan.scenes.filter((s) => s.audio && fs.existsSync(path.join(ROOT, s.audio)));
const inputs = ['-f', 'concat', '-safe', '0', '-i', list];
for (const [f, hz] of [['sine=f=55', 0], ['sine=f=82.41', 0], ['sine=f=110', 0], ['anoisesrc=color=pink:amplitude=0.08', 0]]) inputs.push('-f', 'lavfi', '-t', String(T + 1), '-i', f);
for (const s of narr) inputs.push('-i', path.join(ROOT, s.audio));

const fc = [];
fc.push('[1:a]volume=0.55[s0]', '[2:a]volume=0.32,tremolo=f=0.15:d=0.5[s1]', '[3:a]volume=0.2,tremolo=f=0.23:d=0.6[s2]', '[4:a]highpass=f=80,lowpass=f=650,tremolo=f=0.1:d=0.7,volume=1.1[w]');
fc.push(`[s0][s1][s2][w]amix=inputs=4:normalize=0,aformat=channel_layouts=stereo,aecho=0.8:0.8:900|1700:0.3|0.2,lowpass=f=1500,volume=0.5,afade=t=in:d=3,afade=t=out:st=${Math.max(0, T - 4).toFixed(2)}:d=4,atrim=0:${T.toFixed(2)}[music]`);
if (narr.length) {
  narr.forEach((s, i) => { const ms = Math.round((s.start + s.audioStart) * 1000); fc.push(`[${5 + i}:a]aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${i}]`); });
  fc.push(`${narr.map((_, i) => `[n${i}]`).join('')}amix=inputs=${narr.length}:normalize=0:duration=longest,apad=whole_dur=${T.toFixed(2)},atrim=0:${T.toFixed(2)},asplit=2[nm][nsc]`);
  fc.push('[music][nsc]sidechaincompress=threshold=0.015:ratio=9:attack=30:release=600[duck]');
  fc.push('[nm][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]');
} else fc.push('[music]alimiter=limit=0.95[aout]');

const out = path.join(outDir, `mars-documentary-${format}.mp4`);
await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', T.toFixed(3), '-movflags', '+faststart', out]);
fs.copyFileSync(path.join(dir, 'captions.srt'), path.join(outDir, `mars-documentary-${format}.srt`));
console.log(`[assemble] ${path.relative(ROOT, out)}  ${T.toFixed(1)}s  narration=${narr.length ? 'yes' : 'no (music only)'}`);
