import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Output formats. `mode` picks which narration/scene set from content/script.json is used.
 *  - long  : full documentary, all scenes, `narration`
 *  - short : vertical YouTube Shorts / Reels cut, scenes flagged `"short": true`, `shortNarration`
 */
export const FORMATS = {
  '1080p': { width: 1920, height: 1080, fps: 30, crf: 17, msaa: 4, texSize: 2048, shadow: 2048, portrait: false, mode: 'long' },
  '4k': { width: 3840, height: 2160, fps: 30, crf: 16, msaa: 2, texSize: 4096, shadow: 4096, portrait: false, mode: 'long' },
  shorts: { width: 1080, height: 1920, fps: 30, crf: 17, msaa: 4, texSize: 2048, shadow: 2048, portrait: true, mode: 'short', maxSeconds: 59 },
};

export const ALL_FORMATS = Object.keys(FORMATS);

export function buildDir(format) {
  return path.join(ROOT, 'build', format);
}
