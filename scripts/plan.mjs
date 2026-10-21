/**
 * Builds build/<format>/plan.json: per-scene durations, caption timings and narration audio.
 *
 * Narration engines (TTS_ENGINE = auto | edge | espeak | none):
 *   0. content/voiceover/<scene-id>.(wav|mp3|m4a|ogg)  (and <scene-id>-short.*  for Shorts) always wins
 *   1. edge-tts   (pip install edge-tts)    natural Microsoft neural voice, needs internet   (TTS_VOICE)
 *   2. espeak-ng  (apt install espeak-ng)   robotic, fully offline
 *   3. none       silent, durations are estimated from the word count
 *
 * Usage: node scripts/plan.mjs --format 1080p|4k|shorts|all [--fps 30] [--matrix]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, FORMATS, ALL_FORMATS, buildDir } from './lib/config.mjs';
import { parseArgs, run, hasCommand, probeDuration, listFormats } from './lib/util.mjs';

const args = parseArgs();
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'script.json'), 'utf8'));
const engineWanted = (args.tts || process.env.TTS_ENGINE || 'auto').toLowerCase();
const VOICE = process.env.TTS_VOICE || 'en-US-GuyNeural';
const ESPEAK_VOICE = process.env.ESPEAK_VOICE || 'en-us+m3';
const AUDIO_LEAD = 0.55; // seconds of silence before narration starts
const AUDIO_TAIL = 1.1;  // seconds after narration ends
const cacheDir = path.join(ROOT, 'build', '_tts');
fs.mkdirSync(cacheDir, { recursive: true });

const have = { edge: await hasCommand('edge-tts'), espeak: await hasCommand('espeak-ng') };
let engineOrder = [];
if (engineWanted === 'none') engineOrder = [];
else if (engineWanted === 'edge') engineOrder = ['edge'];
else if (engineWanted === 'espeak') engineOrder = ['espeak'];
else engineOrder = ['edge', 'espeak'];

function findCustom(id, short) {
  const dir = path.join(ROOT, 'content', 'voiceover');
  for (const base of short ? [`${id}-short`, id] : [id]) {
    for (const ext of ['wav', 'mp3', 'm4a', 'ogg', 'flac']) {
      const p = path.join(dir, `${base}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function toWav(src, dst) {
  await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-ar', '44100', '-ac', '2', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.01', dst]);
}

async function synth(text, key) {
  const wav = path.join(cacheDir, `${key}.wav`);
  if (fs.existsSync(wav)) return wav;
  for (const eng of engineOrder) {
    if (!have[eng]) continue;
    try {
      const raw = path.join(cacheDir, `${key}.raw.${eng === 'edge' ? 'mp3' : 'wav'}`);
      if (eng === 'edge') {
        await run('edge-tts', ['--voice', VOICE, '--rate=-4%', '--text', text, '--write-media', raw]);
      } else {
        await run('espeak-ng', ['-v', ESPEAK_VOICE, '-s', '152', '-p', '38', '-g', '4', '-w', raw, text]);
      }
      await toWav(raw, wav);
      return wav;
    } catch (e) {
      console.warn(`[tts] ${eng} failed (${String(e.message).split('\n')[0]}), trying next engine`);
    }
  }
  return null;
}

/** Split narration into caption chunks, timed proportionally to character count. */
function makeCaptions(text, audioStart, audioDur, maxWords) {
  const sentences = text.match(/[^.!?]+[.!?]*/g).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  for (const s of sentences) {
    const words = s.split(/\s+/);
    let cur = [];
    for (let i = 0; i < words.length; i++) {
      cur.push(words[i]);
      const endsClause = /[,;:]$/.test(words[i]);
      if (cur.length >= maxWords || (endsClause && cur.length >= Math.ceil(maxWords * 0.5)) || i === words.length - 1) {
        chunks.push(cur.join(' '));
        cur = [];
      }
    }
  }
  const total = chunks.reduce((a, c) => a + c.length + 6, 0);
  let t = audioStart;
  return chunks.map((c) => {
    const d = ((c.length + 6) / total) * audioDur;
    const o = { text: c, t0: +t.toFixed(3), t1: +(t + d).toFixed(3) };
    t += d;
    return o;
  });
}

async function planFormat(name) {
  const f = FORMATS[name];
  const fps = args.fps ? Number(args.fps) : f.fps;
  const short = f.mode === 'short';
  const dir = buildDir(name);
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'clips'), { recursive: true });

  const scenes = [];
  let start = 0;
  let sceneIndex = 0;
  for (const [srcIndex, sc] of script.scenes.entries()) {
    if (short && !sc.short) continue;
    const text = short ? sc.shortNarration || sc.narration : sc.narration;
    let audioPath = null;
    let audioDur = 0;

    const custom = findCustom(sc.id, short);
    if (custom) {
      audioPath = path.join(dir, 'audio', `${sc.id}.wav`);
      await toWav(custom, audioPath);
    } else {
      const key = crypto.createHash('sha1').update(`${engineOrder.join(',')}|${VOICE}|${ESPEAK_VOICE}|${text}`).digest('hex').slice(0, 16);
      const wav = engineOrder.length ? await synth(text, key) : null;
      if (wav) {
        audioPath = path.join(dir, 'audio', `${sc.id}.wav`);
        fs.copyFileSync(wav, audioPath);
      }
    }
    if (audioPath) audioDur = await probeDuration(audioPath);
    else audioDur = text.split(/\s+/).length / 2.55; // ~153 wpm estimate when silent

    const minDur = short ? sc.shortMinDuration || 6 : sc.minDuration || 8;
    const duration = Math.max(minDur, AUDIO_LEAD + audioDur + AUDIO_TAIL);
    const frames = Math.round(duration * fps);
    scenes.push({
      index: sceneIndex++,
      srcIndex,
      id: sc.id,
      chapter: sc.chapter,
      title: sc.title,
      text,
      callouts: (sc.callouts || []).filter((c) => !c.formats || c.formats.includes(f.mode)),
      audio: audioPath ? path.relative(ROOT, audioPath) : null,
      audioStart: AUDIO_LEAD,
      audioDur: +audioDur.toFixed(3),
      start: +start.toFixed(3),
      duration: +(frames / fps).toFixed(3),
      frames,
      captions: makeCaptions(text, AUDIO_LEAD, audioDur, f.portrait ? 5 : 10),
    });
    start += frames / fps;
  }

  if (short && start > (f.maxSeconds || 59) + 0.01) {
    console.warn(`[plan] WARNING: Shorts cut is ${start.toFixed(1)}s, over the ${f.maxSeconds}s Shorts limit. Shorten "shortNarration" in content/script.json.`);
  }

  const plan = {
    format: name,
    width: f.width,
    height: f.height,
    fps,
    portrait: f.portrait,
    mode: f.mode,
    title: script.title,
    subtitle: script.subtitle,
    sources: script.sources,
    total: +start.toFixed(3),
    totalFrames: scenes.reduce((a, s) => a + s.frames, 0),
    scenes,
  };
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2));

  // SRT sidecar for upload as soft subtitles
  let srt = '';
  let n = 1;
  const ts = (x) => {
    const ms = Math.round(x * 1000);
    const p = (v, l = 2) => String(v).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  for (const s of scenes) for (const c of s.captions) srt += `${n++}\n${ts(s.start + c.t0)} --> ${ts(s.start + c.t1)}\n${c.text}\n\n`;
  fs.writeFileSync(path.join(dir, 'captions.srt'), srt);

  console.log(`[plan] ${name}: ${scenes.length} scenes, ${plan.total.toFixed(1)}s, ${plan.totalFrames} frames @${fps}fps, narration=${scenes.some((s) => s.audio) ? 'yes' : 'silent'}`);
  return plan;
}

const formats = listFormats(args.format, ALL_FORMATS);
const plans = [];
for (const f of formats) {
  if (!FORMATS[f]) throw new Error(`Unknown format "${f}". Use one of: ${ALL_FORMATS.join(', ')}, all`);
  plans.push(await planFormat(f));
}

if (args.matrix) {
  // GitHub Actions matrix: one job per (format, scene)
  const include = plans.flatMap((p) => p.scenes.map((s) => ({ format: p.format, scene: s.id, frames: s.frames })));
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'matrix.json'), JSON.stringify({ include }));
  console.log(`[plan] matrix: ${include.length} jobs`);
}
