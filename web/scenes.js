// Visual direction for each scene: environment state, object poses and a multi-camera shot list.
// Shot times `u` are normalised (0..1) so scene length can follow the narration.
import * as THREE from 'three';
import { terrainH, poseHumanoid } from './world.js';
import { smooth, lerp, clamp } from './util.js';

const place = (o, x, z, yaw = 0, dy = 0) => { o.visible = true; o.position.set(x, terrainH(x, z) + dy, z); o.rotation.set(0, yaw, 0); return o; };
const spinWheels = (o, dist, r) => o.userData.wheels.forEach((w) => (w.rotation.z = -dist / r));

function surface(S, W, o = {}) {
  S.loc = 'surface'; S.env = 'mars';
  S.dust = o.dust ?? 0.1; S.sunElev = o.elev ?? 18; S.sunAz = o.az ?? 50; S.exposure = o.exposure ?? 1.0;
  S.focus = o.focus ?? [0, 0, 0]; S.span = o.span ?? 16;
  W.groups.surface.visible = true; W.terrainNear.parent.visible = true; W.dust.visible = true;
  S.dustAlpha = 0.14 + 0.5 * S.dust;
}
function space(S, W, o = {}) {
  S.loc = 'space'; S.env = 'space';
  S.dust = 0; S.sunElev = o.elev ?? 22; S.sunAz = o.az ?? 65; S.exposure = o.exposure ?? 1.0; S.sunI = o.sunI ?? 4.2;
  S.focus = o.focus ?? [0, 0, 0]; S.span = o.span ?? 70;
  W.groups.space.visible = true; W.stars.visible = true;
}

export const DIR = {
  // ------------------------------------------------------------------ prologue
  'cold-open': {
    shots: [
      { u: [0, 0.55], from: [-150, 55, 335], to: [-70, 30, 262], lookFrom: [0, 0, 0], lookTo: [24, 0, 0], fov: 36 },
      { u: [0.55, 1], from: [95, -18, 240], to: [150, 6, 170], lookFrom: [40, -12, 0], lookTo: [48, -10, 0], fov: 34 },
    ],
    frame({ W, S, u, t }) {
      space(S, W, { elev: 20, az: 62 });
      W.mars.visible = true; W.mars.position.set(0, 0, 0); W.mars.scale.setScalar(1);
      const un = W.mars.userData.uniforms; un.uSpin.value = 0.35 + t * 0.018; un.uStorm.value = lerp(0.12, 1.0, smooth(0, 1, u));
    },
  },

  // ------------------------------------------------------------------ Opportunity vs the storm
  'dust-storm': {
    shots: [
      { u: [0, 0.3], from: [9, 1.7, 8], to: [6.2, 1.4, 5.4], look: [0, 0.75, 0], fov: 38, shake: 0.01 },
      { u: [0.3, 0.55], from: [2.0, 0.6, 1.9], to: [1.4, 0.95, 1.1], look: [0, 0.78, 0], fov: 40 },
      { u: [0.55, 0.8], from: [0.6, 1.55, 0.2], to: [0.6, 1.55, 0.2], lookFn: (c) => { const d = c.sunDir; return [0.6 + d.x * 10, 1.55 + d.y * 10, 0.2 + d.z * 10]; }, fov: 58, shake: 0.012 },
      { u: [0.8, 1], from: [24, 13, 26], to: [31, 20, 33], look: [0, 1, 0], fov: 40 },
    ],
    frame({ W, S, u, t }) {
      surface(S, W, { dust: 0.06 + 0.94 * smooth(0.1, 0.72, u), elev: 21, az: 40, span: 12 });
      const o = place(W.opportunity, 0, 0, 0.35);
      o.userData.dustMat.opacity = 0.62 * smooth(0.25, 0.95, u);
    },
  },

  // ------------------------------------------------------------------ electrostatic dust, Ingenuity
  'sticky-dust': {
    shots: [
      { u: [0, 0.38], from: [3.4, 0.9, 3.2], to: [2.5, 0.95, 2.2], lookFn: (c) => [0, 0.5 + c.heliY * 0.5, 0], fov: 38, shake: 0.008 },
      { u: [0.38, 0.66], fromFn: (c) => [1.7, c.heliY + 0.5, 1.5], toFn: (c) => [1.1, c.heliY + 0.55, 0.8], lookFn: (c) => [0, c.heliY + 0.5, 0], fov: 36 },
      { u: [0.66, 1], from: [-15, 1.7, 11], to: [-8, 2.3, 7], look: [30, 9, -40], fov: 36 },
    ],
    frame({ W, S, u, t, dur, ctx }) {
      surface(S, W, { dust: 0.24, elev: 11, az: 235, span: 12 });
      const h = 3.2 * smooth(0.16, 0.3, u) - 3.2 * smooth(0.58, 0.7, u);
      ctx.heliY = h;
      const hp = place(W.ingenuity, 0, 0, 0.6, h);
      W.ingenuity.userData.rotors.forEach((r, i) => (r.rotation.y = t * (i ? -42 : 42) * (h > 0.02 || (u > 0.12 && u < 0.72) ? 1 : 0)));
      place(W.perseverance, -9, -4, 0.5);
      W.burst.visible = true; W.burst.material.uniforms.uOrigin.value.set(0, terrainH(0, 0), 0); W.burst.material.uniforms.uT0.value = 0.15 * dur; W.burst.material.uniforms.uPower.value = 5.5; W.burst.material.uniforms.uDur.value = 7; W.burst.material.uniforms.uSize.value = 1.0;
      W.burst2.visible = true; W.burst2.material.uniforms.uOrigin.value.set(0, terrainH(0, 0), 0); W.burst2.material.uniforms.uT0.value = 0.6 * dur; W.burst2.material.uniforms.uPower.value = 4.0; W.burst2.material.uniforms.uDur.value = 6; W.burst2.material.uniforms.uSize.value = 0.9;
      W.devil.visible = true; const bx = 30, bz = -42; W.devil.material.uniforms.uBase.value.set(bx, terrainH(bx, bz), bz); W.devil.material.uniforms.uH.value = 55;
    },
  },

  // ------------------------------------------------------------------ nuclear heart
  'nuclear-heart': {
    shots: [
      { u: [0, 0.34], orbit: { c: [0, 1.2, 0], r: [9, 6.4], h: [2.4, 1.8], a: [205, 265] }, look: [0, 1.1, 0], rel: true, fov: 38 },
      { u: [0.34, 0.66], from: [-3.4, 1.15, 2.5], to: [-2.7, 1.35, 1.8], look: [-1.3, 1.05, 0], rel: true, fov: 36, shake: 0.006 },
      { u: [0.66, 1], from: [0, 13, 3.6], to: [0, 9.6, 1.3], look: [0, 0.8, 0], rel: true, fov: 40 },
    ],
    frame({ W, S, u, ctx }) {
      surface(S, W, { dust: 0.18 + 0.7 * smooth(0.2, 0.7, u), elev: 11, az: 150, span: 12 });
      const x = -3 + 6 * u; const r = place(W.perseverance, x, 0, 0.0); spinWheels(r, x, 0.26);
      ctx.anchor = [x, r.position.y, 0];
      const k = 0.9 + 2.0 * smooth(0.28, 0.5, u); r.userData.glowMat.emissiveIntensity = k;
      const wp = new THREE.Vector3(); r.userData.rtg.getWorldPosition(wp);
      W.lights.glow.position.copy(wp).add(new THREE.Vector3(-0.4, 0.2, 0)); W.lights.glow.intensity = 3 + 14 * smooth(0.25, 0.5, u);
    },
  },

  // ------------------------------------------------------------------ wheels
  wheels: {
    shots: [
      { u: [0, 0.5], from: [2.7, 0.42, 2.9], to: [1.7, 0.48, 2.1], lookFrom: [1.05, 0.28, 1.1], lookTo: [0.8, 0.28, 1.1], rel: true, fov: 36, shake: 0.008 },
      { u: [0.5, 1], from: [3.0, 0.6, 4.6], to: [3.0, 0.95, 3.9], look: [0.5, 0.65, 0], fov: 38 },
    ],
    frame({ W, S, u, ctx }) {
      surface(S, W, { dust: 0.3, elev: 9, az: 200, span: 12 });
      const x = -2.2 + 5.2 * u; const r = place(W.perseverance, x, 0, 0); spinWheels(r, x, 0.26);
      ctx.anchor = [x, r.position.y, 0];
      r.userData.glowMat.emissiveIntensity = 1.0;
    },
  },

  // ------------------------------------------------------------------ radiation
  radiation: {
    shots: [
      { u: [0, 0.36], from: [8, 0.9, 9], to: [6, 1.15, 7], look: [0, 2.8, 0], fov: 44, shake: 0.008 },
      { u: [0.36, 0.64], from: [3.2, 1.2, 2.8], to: [2.3, 1.55, 2.1], look: [0, 1.2, 0], fov: 38 },
      { u: [0.64, 1], space: true, from: [0, 6, 380], to: [0, 4, 320], look: [0, 0, 0], fov: 38 },
    ],
    frame({ W, S, u, t, ctx, shot }) {
      if (shot.space) {
        space(S, W, { elev: 8, az: 90, sunI: 4.5 });
        const portrait = ctx.portrait;
        W.earth.visible = true; W.mars.visible = true;
        W.earth.position.set(portrait ? 0 : -140, portrait ? 150 : 0, 0); W.earth.scale.setScalar(portrait ? 0.9 : 1);
        W.mars.position.set(portrait ? 0 : 150, portrait ? -110 : 0, 0); W.mars.scale.setScalar(0.56);
        W.earth.userData.uniforms.uSpin.value = t * 0.05; W.mars.userData.uniforms.uSpin.value = 1.2 + t * 0.03; W.mars.userData.uniforms.uStorm.value = 0.1;
        W.field.visible = true; W.field.scale.setScalar(1);
        W.field.children.forEach((m) => (m.material.opacity = 0.18 + 0.28 * smooth(0.64, 0.8, u)));
        return;
      }
      surface(S, W, { dust: 0.12, elev: 5, az: 255, span: 12, exposure: 1.0 });
      place(W.perseverance, 0, 0, 0.3); W.perseverance.userData.glowMat.emissiveIntensity = 1;
      W.rays.visible = true; const U = W.rays.userData.uniforms; U.uArea.value.set(0, terrainH(0, 0), 0); U.uTop.value = 70; U.uLen.value = 16; U.uPx.value = 2.4; U.uSpeed.value = 0.38; U.uColor.value.setRGB(0.5, 0.8, 1.0); U.uAlpha.value = 1;
    },
  },

  // ------------------------------------------------------------------ radiation-hardened computing
  'rad-hard': {
    shots: [
      { u: [0, 0.45], from: [-5.4, 1.5, 3.9], to: [-2.7, 1.0, 2.7], lookFrom: [-0.8, 0.3, 0], lookTo: [0, 0.3, 0], rel: true, fov: 34 },
      { u: [0.45, 1], from: [0.5, 5.2, 1.0], to: [0.25, 3.5, 0.55], look: [0, 0.3, 0], rel: true, fov: 36 },
    ],
    frame({ W, S, u, t, dur, ctx }) {
      S.loc = 'lab'; S.env = 'studio'; S.dust = 0; S.exposure = 1.1; S.sunElev = 40; S.sunAz = 40; S.focus = [0, -600, 0]; S.span = 8; S.sunI = 0.4;
      W.groups.lab.visible = true; ctx.anchor = [0, -600, 0];
      const L = W.lights; L.chipKey.intensity = 260; L.chipKey.position.set(-3, -595, 4); L.chipKey.target.position.set(0, -600, 0); L.chipFill.intensity = 7; L.chipFill.position.set(0, -598.4, 0);
      const base = new THREE.Color(0x0b6677), bad = new THREE.Color(0xff2a3a), good = new THREE.Color(0x2dff8a), c = new THREE.Color();
      const strikes = [{ u: 0.5, i: 2, j: 5 }, { u: 0.64, i: 6, j: 2 }, { u: 0.78, i: 4, j: 4 }];
      const grid = W.chipGrid;
      for (let k = 0; k < 64; k++) {
        const i = (k / 8) | 0, j = k % 8; c.copy(base).multiplyScalar(0.7 + 0.5 * Math.sin(t * 1.5 + i * 1.7 + j * 2.3) ** 2);
        for (const s of strikes) if (s.i === i && s.j === j) { const ts = s.u * dur, d = t - ts; if (d > 0 && d < 1.0) c.copy(bad).multiplyScalar(1.6); else if (d >= 1.0 && d < 2.1) c.copy(good).multiplyScalar(1.4); }
        grid.setColorAt(k, c);
      }
      grid.instanceColor.needsUpdate = true;
      // incoming particle
      const dirv = new THREE.Vector3(0.45, -1, 0.25).normalize(); let any = false;
      for (const s of strikes) {
        const ts = s.u * dur, hit = new THREE.Vector3(-0.87 + s.i * 0.25, -600 + 0.38, -0.87 + s.j * 0.25);
        const p = clamp((t - (ts - 0.4)) / 0.4);
        if (t > ts - 0.4 && t < ts + 0.05) {
          any = true; W.strike.visible = true;
          const dist = (1 - p) * 9 + 2.0; W.strike.position.copy(hit).addScaledVector(dirv, -dist);
          W.strike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv);
        }
        const fd = t - ts; if (fd > 0 && fd < 0.55) { W.flash.visible = true; W.flash.position.copy(hit); W.flash.scale.setScalar(0.4 + fd * 2.4); W.flash.material.opacity = 1 - fd / 0.55; }
      }
      if (!any) W.strike.visible = false;
      if (!(strikes.some((s) => { const fd = t - s.u * dur; return fd > 0 && fd < 0.55; }))) W.flash.visible = false;
    },
  },

  // ------------------------------------------------------------------ SpaceX
  spacex: {
    shots: [
      { u: [0, 0.3], loc: 'space', from: [-78, 8, 62], to: [-34, 16, 92], look: [0, 24, 0], fov: 38 },
      { u: [0.3, 0.5], loc: 'entry', from: [0, 1.8, 12], to: [4, 2.0, 12], lookFn: (c) => [c.ship[0], c.ship[1], c.ship[2]], fov: 42, shake: 0.012 },
      { u: [0.5, 0.72], loc: 'landed', from: [-6, 1.0, 17], to: [-2.5, 1.6, 12.5], lookFrom: [30, 17, -25], lookTo: [27, 11, -22], fov: 38 },
      { u: [0.72, 1], loc: 'landed', from: [11, 1.4, 7], to: [8.2, 1.25, 4.5], lookFn: (c) => [c.hum[0], 1.0, c.hum[2]], fov: 36, shake: 0.006 },
    ],
    frame({ W, S, u, t, dur, ctx, shot }) {
      const ship = W.ship;
      if (shot.loc === 'space') {
        space(S, W, { elev: 25, az: 100, sunI: 4.6 });
        ship.visible = true; ship.position.set(0, 0, 0); ship.rotation.set(0.05, t * 0.25 + 0.6, -0.18);
        W.mars.visible = true; W.mars.position.set(-230, -130, -560); W.mars.scale.setScalar(1.15); W.mars.userData.uniforms.uSpin.value = 0.9; W.mars.userData.uniforms.uStorm.value = 0.0;
        W.earth.visible = true; W.earth.position.set(620, 220, -1100); W.earth.scale.setScalar(0.45);
        ctx.ship = [0, 24, 0]; ctx.hum = [20, 0, -10];
        return;
      }
      surface(S, W, { dust: 0.16, elev: shot.loc === 'entry' ? 28 : 14, az: shot.loc === 'entry' ? 70 : 110, span: shot.loc === 'entry' ? 30 : 40, focus: shot.loc === 'entry' ? [0, 0, 0] : [22, 0, -14], exposure: 1.0 });
      W.groups.space.visible = true; ship.visible = true;
      if (shot.loc === 'entry') {
        const p = clamp((u - 0.3) / 0.2);
        const x = lerp(-150, 40, p), y = lerp(170, 70, p) , z = -60;
        ship.position.set(x, y, z); ship.rotation.set(0, 0.4, -Math.PI * 0.44 + p * 0.1);
        W.plasma.visible = true; W.plasma.children.forEach((m, i) => (m.material.opacity = [0.4, 0.2, 0.1, 0.24][i] * (0.75 + 0.25 * Math.sin(t * 22 + i))));
        ctx.ship = [x + 2, y + 10, z]; ctx.hum = [20, 0, -10];
        place(W.perseverance, -6, -4, 0.5);
        return;
      }
      const sx = 30, sz = -25; ship.position.set(sx, terrainH(sx, sz) + 0.2, sz); ship.rotation.set(0, 0.5, 0);
      const bt = 0.5 * dur;
      W.burst.visible = true; const a = W.burst.material.uniforms; a.uOrigin.value.set(sx, terrainH(sx, sz), sz); a.uT0.value = bt - 0.1; a.uPower.value = 32; a.uDur.value = 9; a.uSize.value = 3.4; a.uAlpha.value = 0.55;
      W.burst2.visible = true; const b = W.burst2.material.uniforms; b.uOrigin.value.set(sx, terrainH(sx, sz), sz); b.uT0.value = bt; b.uPower.value = 16; b.uDur.value = 8; b.uSize.value = 2.2; b.uAlpha.value = 0.5;
      place(W.perseverance, -7, -3, 0.9);
      const q = clamp((u - 0.62) / 0.38), hx = lerp(25.5, 11, q), hz = lerp(-17, -4.5, q);
      place(W.humanoid, hx, hz, Math.atan2(-(-4.5 + 17) / 1, (11 - 25.5)) , 0);
      W.humanoid.visible = q > 0; poseHumanoid(W.humanoid, t * 5.2, q > 0 && q < 1 ? 1 : 0.0);
      ctx.ship = [sx, 16, sz]; ctx.hum = [hx, 0, hz];
    },
  },

  // ------------------------------------------------------------------ lessons
  lessons: {
    shots: [
      { u: [0, 0.55], from: [-11, 1.4, 9], to: [6, 1.2, 8.6], lookFrom: [-5, 1, 0], lookTo: [4, 1, 0], fov: 38 },
      { u: [0.55, 1], from: [2, 1.6, 10], to: [4, 9, 27], look: [0, 1.1, 0], fov: 36 },
    ],
    frame({ W, S, u, t }) {
      surface(S, W, { dust: 0.26, elev: 5.5, az: 255, span: 22, focus: [0, 0, 0] });
      const face = -Math.PI / 2 + 0.12;
      place(W.opportunity, -5.2, 0, face); W.opportunity.userData.dustMat.opacity = 0.42;
      place(W.perseverance, -1.3, 0, face); W.perseverance.userData.glowMat.emissiveIntensity = 1.3;
      const h = 1.6 + 0.12 * Math.sin(t * 1.6); place(W.ingenuity, 2.7, 0, 0, h); W.ingenuity.userData.rotors.forEach((r, i) => (r.rotation.y = t * (i ? -42 : 42)));
      place(W.humanoid, 5.6, 0.2, -Math.PI / 2 + 0.5); poseHumanoid(W.humanoid, 0, 0);
    },
  },

  // ------------------------------------------------------------------ outro
  outro: {
    shots: [{ u: [0, 1], from: [6.5, 1.0, 8.5], to: [7.6, 1.5, 6.0], look: [0, 1.15, 0], fov: 36 }],
    frame({ W, S, t }) {
      surface(S, W, { dust: 0.12, elev: 3.5, az: 100, span: 12 });
      place(W.perseverance, 0, 0, 0.45); W.perseverance.userData.glowMat.emissiveIntensity = 1.2;
    },
  },
};
