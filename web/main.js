import * as THREE from 'three';
import { buildWorld, terrainH } from './world.js';
import { DIR } from './scenes.js';
import { shared } from './fx.js';
import { clamp, lerp, smooth } from './util.js';

const q = new URLSearchParams(location.search);
const FORMAT = q.get('format') || '1080p';
const PREVIEW = q.has('preview');

const plan = await (await fetch(`/build/${FORMAT}/plan.json`)).json();
const W_PX = innerWidth, H_PX = innerHeight, portrait = plan.portrait;
const hiRes = W_PX >= 3000;
const cfg = { shadow: hiRes ? 4096 : 2048, terrainSeg: hiRes ? 360 : 280, dustCount: hiRes ? 20000 : 14000 };

document.body.classList.toggle('portrait', portrait);
document.documentElement.style.setProperty('--u', `${(portrait ? W_PX : H_PX) / 1080}px`);
await document.fonts.load('600 40px Inter'); await document.fonts.load('700 40px "Barlow Condensed"'); await document.fonts.load('600 40px "Barlow Condensed"'); await document.fonts.ready;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W_PX, H_PX);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);
shared.res.value.set(W_PX, H_PX);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W_PX / H_PX, 0.05, 4500);
const W = buildWorld(scene, renderer, cfg);
const ctxBase = { sunDir: shared.sunDir.value, portrait };

// ------------------------------------------------------------------ environment
const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const skyCol = { hor: C(0.80, 0.56, 0.40), zen: C(0.50, 0.37, 0.30) };
function applyEnv(S) {
  const az = THREE.MathUtils.degToRad(S.sunAz), el = THREE.MathUtils.degToRad(S.sunElev);
  const d = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  shared.sunDir.value.copy(d);
  const L = W.lights, f = new THREE.Vector3(...S.focus);
  renderer.toneMappingExposure = S.exposure;
  scene.environmentIntensity = 1;
  W.skyMat.uniforms.uDust.value = S.dust || 0;
  W.sky.visible = S.loc === 'surface';
  scene.fog = null; scene.background = new THREE.Color(0x000000);
  L.rim.intensity = 0; L.hemi.intensity = 0.05;
  if (S.loc === 'surface') {
    const dust = S.dust;
    const hor = skyCol.hor.clone().lerp(C(0.34, 0.17, 0.085), smooth(0, 0.85, dust)).multiplyScalar(lerp(1, 0.6, smooth(0.4, 1, dust)));
    scene.fog = new THREE.FogExp2(hor, lerp(0.0009, 0.021, Math.pow(dust, 0.85)));
    scene.environment = W.envMars; scene.environmentIntensity = lerp(0.9, 0.35, dust);
    L.sun.color.setRGB(1, 0.9, 0.78); L.sun.intensity = 3.6 * (1 - 0.86 * smooth(0.1, 1, dust));
    L.hemi.color.copy(C(0.85, 0.62, 0.5)).lerp(C(0.4, 0.2, 0.1), dust); L.hemi.groundColor.copy(C(0.35, 0.17, 0.09)); L.hemi.intensity = lerp(0.55, 0.9, dust) * (S.sunElev < 8 ? 0.6 : 1);
    W.dust.material.uniforms.uAlpha.value = S.dustAlpha;
    W.dust.material.uniforms.uColor.value.copy(C(0.62, 0.40, 0.26).lerp(C(0.45, 0.24, 0.12), dust));
    W.skyMat.uniforms.uHor.value.copy(hor);
    W.skyMat.uniforms.uZen.value.copy(skyCol.zen).lerp(C(0.22, 0.11, 0.06), smooth(0, 0.85, dust)).multiplyScalar(lerp(1, 0.55, smooth(0.4, 1, dust)));
  } else if (S.loc === 'space') {
    scene.environment = W.envSpace; scene.environmentIntensity = 0.8;
    L.sun.color.setRGB(1, 0.96, 0.9); L.sun.intensity = S.sunI ?? 4.2; L.hemi.intensity = 0.03;
    L.rim.intensity = 0.7; L.rim.position.set(-d.x, 0.2, -d.z).multiplyScalar(100);
  } else {
    scene.environment = W.envStudio; scene.environmentIntensity = 0.7;
    L.sun.intensity = S.sunI ?? 0.5; L.hemi.intensity = 0.12;
  }
  L.sun.position.copy(f).addScaledVector(d, 150); L.sun.target.position.copy(f); L.sun.target.updateMatrixWorld();
  const sc = L.sun.shadow.camera, span = S.span || 16;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
}

// ------------------------------------------------------------------ camera
function pickShot(shots, u) { for (const s of shots) if (u >= s.u[0] && u < s.u[1]) return s; return shots[shots.length - 1]; }
const arr = (v) => (Array.isArray(v) ? v : v ? [v.x, v.y, v.z] : null);
function aim(shot, u, t, ctx, S) {
  const lu = clamp((u - shot.u[0]) / (shot.u[1] - shot.u[0]));
  const e = lerp(lu, lu * lu * (3 - 2 * lu), 0.55);
  const A = ctx.anchor && shot.rel ? ctx.anchor : [0, 0, 0];
  const mix = (a, b) => [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];
  let pos, look;
  if (shot.orbit) {
    const o = shot.orbit, a = THREE.MathUtils.degToRad(lerp(o.a[0], o.a[1], e)), r = lerp(o.r[0], o.r[1], e), h = lerp(o.h[0], o.h[1], e);
    pos = [o.c[0] + Math.cos(a) * r, o.c[1] + h, o.c[2] + Math.sin(a) * r];
  } else {
    const f = shot.fromFn ? shot.fromFn(ctx) : shot.from, g = shot.toFn ? shot.toFn(ctx) : shot.to;
    pos = mix(f, g);
  }
  if (shot.lookFn) look = shot.lookFn(ctx); else if (shot.lookFrom) look = mix(shot.lookFrom, shot.lookTo); else look = shot.look;
  pos = [pos[0] + A[0], pos[1] + A[1], pos[2] + A[2]]; look = [look[0] + A[0], look[1] + A[1], look[2] + A[2]];
  if (portrait) { const k = shot.noPortraitPull ? 1 : 1.16; pos = [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k]; }
  const sh = shot.shake || 0;
  if (sh) { pos[0] += (Math.sin(t * 1.7) + 0.6 * Math.sin(t * 3.9 + 1)) * sh; pos[1] += (Math.sin(t * 2.3 + 2) + 0.5 * Math.sin(t * 4.7)) * sh * 0.7; look[0] += Math.sin(t * 1.1 + 4) * sh * 0.8; look[1] += Math.sin(t * 1.9) * sh * 0.5; }
  if (S.loc === 'surface') pos[1] = Math.max(pos[1], terrainH(pos[0], pos[2]) + 0.22);
  camera.position.set(...pos);
  camera.fov = (shot.fov || 38) * (portrait ? 1.42 : 1); camera.aspect = W_PX / H_PX; camera.updateProjectionMatrix();
  camera.lookAt(...look);
  shared.cam.value.copy(camera.position);
}

// ------------------------------------------------------------------ overlay
const $ = (s) => document.querySelector(s);
const chapterEl = $('#chapter'), captionEl = $('#caption'), capSpan = $('#caption span'), calloutsEl = $('#callouts'), fadeEl = $('#fade');
const calloutDom = new Map();
function buildCallouts(sc) {
  calloutsEl.innerHTML = ''; calloutDom.clear();
  sc.callouts.forEach((c, i) => {
    const el = document.createElement('div');
    if (c.type === 'stat') { el.className = 'callout stat'; el.innerHTML = `<div class="v">${c.value}</div><div class="l">${c.label}</div><div class="s">SOURCE · ${c.source}</div>`; }
    else if (c.type === 'bars') {
      el.className = 'callout bars';
      el.innerHTML = `<div class="h">${c.title}</div>` + c.items.map((it) => `<div class="row"><div class="n"><span>${it.label}</span><b>${it.value}</b></div><div class="track"><div class="fill"></div></div></div>`).join('') + `<div class="s">SOURCE · ${c.source}</div>`;
    } else if (c.type === 'sources') {
      el.className = 'callout sources';
      el.innerHTML = `<div class="h">Sources</div><ul>${plan.sources.map((s) => `<li>${s}</li>`).join('')}</ul>`;
    }
    calloutsEl.appendChild(el); calloutDom.set(i, el);
  });
}
let builtFor = -1;
function updateOverlay(sc, u, t) {
  if (builtFor !== sc.index) { buildCallouts(sc); builtFor = sc.index; chapterEl.querySelector('.k').textContent = sc.chapter || ''; chapterEl.querySelector('.t').textContent = sc.title; }
  // chapter card
  const showChapter = sc.chapter || sc.id === 'outro';
  const ct = t - 0.55, ca = showChapter ? smooth(0, 0.6, ct) * (1 - smooth(3.4, 4.1, ct)) : 0;
  chapterEl.style.opacity = ca; chapterEl.style.transform = `translateY(${(1 - ca) * 14}px)`;
  if (sc.id === 'outro') { chapterEl.style.opacity = smooth(0, 0.8, t - 0.3) * (1 - smooth(0.2, 0.26, u)); }
  // callouts
  sc.callouts.forEach((c, i) => {
    const el = calloutDom.get(i); const fade = 0.04;
    const a = smooth(c.u0, c.u0 + fade, u) * (1 - smooth(c.u1 - fade, c.u1, u));
    el.style.opacity = a; el.style.transform = `translateY(${(1 - a) * 18}px)`;
    if (c.type === 'bars') { const k = smooth(c.u0 + 0.01, c.u0 + 0.12, u); c.items.forEach((it, j) => { el.querySelectorAll('.fill')[j].style.width = `${(it.value / 2.0) * 100 * k * clamp((k * 3 - j * 0.4))}%`; }); }
  });
  // captions
  const cap = sc.captions.find((c) => t >= c.t0 && t < c.t1);
  if (cap) { if (capSpan.textContent !== cap.text) capSpan.textContent = cap.text; captionEl.style.opacity = smooth(cap.t0, cap.t0 + 0.18, t) * (1 - smooth(cap.t1 - 0.1, cap.t1, t)); } else captionEl.style.opacity = 0;
  // fades between scenes
  const first = sc.index === 0, last = sc.index === plan.scenes.length - 1;
  const fin = first ? 1 - smooth(0, 1.0, t) : 1 - smooth(0, 0.35, t);
  const fout = last ? smooth(sc.duration - 1.4, sc.duration, t) : smooth(sc.duration - 0.35, sc.duration, t);
  fadeEl.style.opacity = Math.max(fin, fout);
}

// ------------------------------------------------------------------ frame
function renderAt(sceneIndex, t) {
  const sc = plan.scenes[sceneIndex];
  const dir = DIR[sc.id];
  if (!dir) throw new Error(`No direction for scene ${sc.id}`);
  const u = clamp(t / sc.duration, 0, 0.99999);
  shared.time.value = t + sc.start * 0.0;  // per-scene clock: every scene renders identically in any job
  W.hideAll();
  const S = { dust: 0, sunElev: 20, sunAz: 50, exposure: 1, focus: [0, 0, 0], span: 16, loc: 'surface', env: 'mars', dustAlpha: 0.2 };
  const ctx = { ...ctxBase, anchor: null, heliY: 0, ship: [0, 0, 0], hum: [0, 0, 0] };
  const shot = pickShot(dir.shots, u);
  dir.frame({ W, S, u, t, dur: sc.duration, ctx, shot });
  applyEnv(S);
  aim(shot, u, t, ctx, S);
  renderer.render(scene, camera);
  updateOverlay(sc, u, t);
}

window.__plan = plan;
window.renderFrame = (sceneIndex, frame) => { renderAt(sceneIndex, frame / plan.fps); return true; };
window.__ready = true;

// ------------------------------------------------------------------ live preview (npm run preview)
if (PREVIEW) {
  let idx = Number(q.get('scene') || 0), t0 = performance.now();
  const loop = () => {
    let t = (performance.now() - t0) / 1000;
    if (t >= plan.scenes[idx].duration) { idx = (idx + 1) % plan.scenes.length; t0 = performance.now(); t = 0; }
    renderAt(idx, t); requestAnimationFrame(loop);
  };
  loop();
}
