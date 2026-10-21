# Built for Dust and Radiation: a three.js Mars documentary

A procedural documentary, **"How NASA and SpaceX robots survive Martian dust storms and radiation"**, drawn entirely
in three.js / WebGL (planets, terrain, Opportunity, Perseverance + MMRTG, Ingenuity, a humanoid, Starship, a rad-hard chip),
with multi-camera shot lists, captions, data call-outs and narration. It renders **headlessly in GitHub Actions**
(software WebGL, no GPU needed) to **4K, 1080p and vertical Shorts**.

## Run it on GitHub
1. Push this folder to a GitHub repo (keep `package-lock.json`).
2. **Actions → "Render documentary" → Run workflow**, then pick:
   - `format`: `1080p` | `4k` | `shorts` | `all`
   - `fps`: 30 or 24 · `tts`: `edge` (natural voice) | `espeak` | `none` · `voice`: any edge-tts voice
3. Download the artifact `mars-documentary-<format>` (an `.mp4` plus an `.srt` subtitle file).

Each scene renders in its own parallel job, then an assemble job joins the clips and mixes narration with a generated ambient score.

**Render time:** software WebGL is slow. Roughly 3-4 s per 1080p frame and about 4x that at 4K. One scene is about 20-60 min at 1080p,
and up to a few hours at 4K (jobs are capped at 350 min; use `fps: 24` to cut about 20%). Shorts and 1080p are the quick options.

## Formats
| format | resolution | cut |
|---|---|---|
| `1080p` | 1920x1080 | full documentary, about 3-4 min |
| `4k` | 3840x2160 | full documentary |
| `shorts` | 1080x1920 | 5 scenes with short narration, under 59 s |

## Local use
```bash
npm install                        # needs Node 20+, ffmpeg; optional: pip install edge-tts / apt install espeak-ng
npm run test:frames -- --format 1080p --w 960 --at 0.5      # still frames -> build/1080p/stills
npm run build:shorts -- --tts none --every 10               # fast draft (every 10th frame)
npm run build:1080p                                          # full render -> build/1080p/out/*.mp4
npm run preview                                              # realtime preview in your browser (GPU recommended)
```

## Editing
- `content/script.json`: narration, short-form narration, call-outs, sources. Scene length follows the narration.
- `content/voiceover/<scene-id>.mp3|wav` (and `<scene-id>-short.*`): use your own recording instead of TTS.
- `web/scenes.js`: camera shots, lighting and animation per scene. `web/world.js`: models, terrain, sky.

## Facts and sources
Figures come from NASA/JPL, NTRS, SwRI/Science (Curiosity RAD), and reporting on SpaceX's Mars plans. See `content/script.json`.
Status note as of Oct 2026: SpaceX has not published how Optimus would be hardened, and the Nov-Dec 2026 Starship Mars window has effectively slipped.
Models are simplified procedural stand-ins, not CAD copies of the real spacecraft. Re-check the SpaceX facts before you publish.
