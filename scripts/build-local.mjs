/** Full local pipeline: plan -> render every scene -> assemble.
 *  node scripts/build-local.mjs --format 1080p|4k|shorts|all [--tts none|espeak|edge] [--fps 24] [--every 4 (draft: render every 4th frame)] */
import { ALL_FORMATS } from './lib/config.mjs';
import { parseArgs, run, listFormats } from './lib/util.mjs';
const args = parseArgs();
const formats = listFormats(args.format, ALL_FORMATS);
for (const f of formats) {
  const plan = ['scripts/plan.mjs', '--format', f]; if (args.tts) plan.push('--tts', String(args.tts)); if (args.fps) plan.push('--fps', String(args.fps));
  await run('node', plan, { quiet: false });
  const render = ['scripts/render-scene.mjs', '--format', f, '--all']; if (args.every) render.push('--every', String(args.every));
  await run('node', render, { quiet: false });
  await run('node', ['scripts/assemble.mjs', '--format', f], { quiet: false });
}
