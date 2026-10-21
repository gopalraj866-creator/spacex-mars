import { spawn } from 'node:child_process';

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

/** Run a command, resolve with {code, stdout, stderr}. Rejects on non-zero unless allowFail. */
export function run(cmd, args, { allowFail = false, cwd, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; if (!quiet) process.stdout.write(d); });
    p.stderr.on('data', (d) => { stderr += d; if (!quiet) process.stderr.write(d); });
    p.on('error', (e) => (allowFail ? resolve({ code: -1, stdout, stderr: String(e) }) : reject(e)));
    p.on('close', (code) => {
      if (code !== 0 && !allowFail) {
        reject(new Error(`${cmd} ${args.slice(0, 6).join(' ')} ... exited ${code}\n${stderr.slice(-2000)}`));
      } else resolve({ code, stdout, stderr });
    });
  });
}

export async function hasCommand(cmd) {
  const r = await run('which', [cmd], { allowFail: true });
  return r.code === 0;
}

export async function probeDuration(file) {
  const r = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(r.stdout.trim());
}

export function listFormats(arg, ALL) {
  if (!arg || arg === 'all') return ALL;
  return String(arg).split(',').map((s) => s.trim()).filter(Boolean);
}
