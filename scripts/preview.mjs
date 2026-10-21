/** Live realtime preview in your own browser (needs a GPU for smooth playback).  npm run preview [-- --format shorts] */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, run } from './lib/util.mjs';
import { buildDir } from './lib/config.mjs';
import { startServer } from './lib/server.mjs';
const args = parseArgs(); const format = args.format || '1080p';
if (!fs.existsSync(path.join(buildDir(format), 'plan.json'))) await run('node', ['scripts/plan.mjs', '--format', format, '--tts', 'none'], { quiet: false });
const { port } = await startServer(Number(args.port || 8080));
console.log(`Preview: http://localhost:${port}/web/index.html?format=${format}&preview=1   (&scene=3 to start at scene 3)`);
