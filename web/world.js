import * as THREE from 'three';
import { mulberry32, makeNoise, smooth, clamp, lerp } from './util.js';
import { shared, makeDust, makeDevil, makeBurst, makeRays, makeStars, makeGlobe } from './fx.js';

const noise = makeNoise(7);

export function terrainH(x, z) {
  const r = Math.hypot(x, z);
  const flat = smooth(14, 70, r);
  const big = noise.fbm(x * 0.004 + 10, z * 0.004, 4) * 46 * smooth(50, 320, r);
  const hills = noise.fbm(x * 0.02, z * 0.02, 4) * 3.4 * flat;
  const ripple = Math.sin(x * 0.85 + noise.n2(x * 0.09, z * 0.09) * 7) * 0.035;
  const micro = noise.fbm(x * 0.3, z * 0.3, 3) * 0.14;
  return big + hills + ripple + micro;
}

const std = (color, rough = 0.6, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; };

function canvasTex(size, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

export function buildWorld(scene, renderer, cfg) {
  const W = { scene, groups: {}, lights: {} };
  const rand = mulberry32(99);

  // ---------------------------------------------------------------- environment map (for metals)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h=normalize(vP).y; vec3 hor=vec3(1.0,.62,.4), top=vec3(.35,.28,.3), bot=vec3(.28,.14,.08); vec3 c = h>0.? mix(hor,top,pow(h,.5)) : mix(hor,bot,pow(-h,.5)); gl_FragColor=vec4(c,1.); }',
  }));
  envScene.add(envSky);
  const sunPanel = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 11, 8) }));
  sunPanel.position.set(30, 14, 18); envScene.add(sunPanel);
  const fill = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.8) }));
  fill.position.set(-30, 8, -20); fill.lookAt(0, 0, 0); envScene.add(fill);
  W.envMars = pmrem.fromScene(envScene, 0.02).texture;

  const envSpace = new THREE.Scene();
  envSpace.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x03040a, side: THREE.BackSide })));
  const sunS = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(18, 16, 13) })); sunS.position.set(34, 12, 18); envSpace.add(sunS);
  const marsS = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .22, .1) })); marsS.position.set(-10, -34, -6); envSpace.add(marsS);
  W.envSpace = pmrem.fromScene(envSpace, 0.02).texture;

  const envStudio = new THREE.Scene();
  envStudio.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x06090d, side: THREE.BackSide })));
  const k1 = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 9) })); k1.position.set(0, 30, 6); envStudio.add(k1);
  const k2 = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 3, 4) })); k2.position.set(-34, 4, 0); envStudio.add(k2);
  W.envStudio = pmrem.fromScene(envStudio, 0.02).texture;

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xffd9b8, 0x6a3418, 0.55);
  const sun = new THREE.DirectionalLight(0xfff1de, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);
  const rim = new THREE.DirectionalLight(0xbfd6ff, 1.2); scene.add(rim);
  const glow = new THREE.PointLight(0xff7a22, 0, 7, 1.6); scene.add(glow);
  const chipKey = new THREE.SpotLight(0xcfe8ff, 0, 0, 0.5, 0.7, 1.2); chipKey.position.set(-3, 5, 4); scene.add(chipKey, chipKey.target);
  const chipFill = new THREE.PointLight(0x2affc8, 0, 14, 1.5); scene.add(chipFill);
  W.lights = { hemi, sun, rim, glow, chipKey, chipFill };

  // ---------------------------------------------------------------- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uDust: { value: 0 }, uSun: shared.sunDir, uHor: { value: new THREE.Color(0.7, 0.3, 0.13) }, uZen: { value: new THREE.Color(0.2, 0.1, 0.07) } },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.); }',
    fragmentShader: /* glsl */ `
      uniform float uDust; uniform vec3 uSun; uniform vec3 uHor; uniform vec3 uZen; varying vec3 vD;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec3 d = normalize(vD); float e = d.y;
        vec3 c = mix(uHor, uZen, pow(clamp(e,0.,1.), .45));
        float sd = max(dot(d, normalize(uSun)), 0.);
        float clearK = 1. - smoothstep(0., .85, uDust);
        c += (vec3(.10,.22,.55)*pow(sd,18.)*.9 + vec3(.9,.45,.2)*pow(sd,5.)*.22) * clearK;
        c += vec3(.5,.2,.08)*pow(sd,3.)*.10*(1.-clearK);
        float disc = smoothstep(.999955,.999985,sd) * (1.-smoothstep(.15,.8,uDust));
        c += vec3(1.,.93,.82)*disc*14. + vec3(1.,.75,.5)*pow(sd,400.)*.9*(1.-smoothstep(.1,.7,uDust));
        gl_FragColor = vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (h21(gl_FragCoord.xy)-.5)/255.;
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  W.sky = sky; W.skyMat = skyMat;

  // ---------------------------------------------------------------- terrain
  const surface = new THREE.Group(); scene.add(surface); W.groups.surface = surface;
  const detail = canvasTex(512, (g, s) => {
    const img = g.createImageData(s, s); const r = mulberry32(3);
    for (let i = 0; i < s * s; i++) { const v = 150 + r() * 80 - 25 * Math.sin(i / 7); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.25;
    for (let i = 0; i < 1400; i++) { g.fillStyle = r() > 0.5 ? '#fff' : '#000'; g.beginPath(); g.arc(r() * s, r() * s, r() * 3 + 0.5, 0, 7); g.fill(); }
  }, { repeat: 1 });
  const colorAt = (x, z, h, out) => {
    const n = noise.fbm(x * 0.03 + 4, z * 0.03, 4), m = noise.fbm(x * 0.12, z * 0.12 + 9, 3);
    const rust = [0.32, 0.125, 0.052], pale = [0.5, 0.26, 0.12], dark = [0.1, 0.055, 0.04];
    let c = rust.map((v, i) => lerp(v, pale[i], smooth(0.35, 0.65, n)));
    c = c.map((v, i) => lerp(v, dark[i], smooth(0.55, 0.8, m) * 0.7));
    const hl = 0.9 + 0.2 * smooth(0, 14, h);
    out[0] = c[0] * hl; out[1] = c[1] * hl; out[2] = c[2] * hl;
  };
  function terrainMesh(size, seg, uvRepeat, material, yOff = 0) {
    const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), tmp = [0, 0, 0];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = terrainH(x, z);
      p.setY(i, h + yOff); colorAt(x, z, h, tmp); col.set(tmp, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / uvRepeat, p.getZ(i) / uvRepeat);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material); m.receiveShadow = true; return m;
  }
  const nearTex = detail.clone(); nearTex.needsUpdate = true; nearTex.repeat.set(1, 1);
  const matNear = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: nearTex, bumpMap: nearTex, bumpScale: 1.5 });
  const matFar = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: detail, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  const near = terrainMesh(90, cfg.terrainSeg, 3, matNear);
  const far = terrainMesh(1700, 340, 14, matFar, -0.02);
  surface.add(far, near);
  W.terrainNear = near;

  // rocks
  const rockGeo = new THREE.IcosahedronGeometry(1, 2);
  { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.78 + noise.n2(p.getX(i) * 2.1 + 5, p.getY(i) * 2.3 + p.getZ(i) * 1.7) * 0.55; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } rockGeo.computeVertexNormals(); }
  const rockN = 900, rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), rockN);
  const dummy = new THREE.Object3D(), cc = new THREE.Color();
  for (let i = 0; i < rockN; i++) {
    const a = rand() * 6.283, rr = 4 + Math.pow(rand(), 0.7) * 140; const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const s = (0.08 + Math.pow(rand(), 3) * 1.1) * (rr > 60 ? 2.2 : 1);
    dummy.position.set(x, terrainH(x, z) + s * 0.15, z); dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6); dummy.scale.set(s, s * (0.6 + rand() * 0.5), s * (0.7 + rand() * 0.6)); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    const t = rand(); cc.setRGB(0.12 + t * 0.2, 0.06 + t * 0.09, 0.045 + t * 0.05); rocks.setColorAt(i, cc);
  }
  rocks.castShadow = rocks.receiveShadow = true; surface.add(rocks);

  W.dust = makeDust(cfg.dustCount); W.devil = makeDevil(); W.burst = makeBurst(); W.burst2 = makeBurst(1800);
  W.rays = makeRays(460);
  surface.add(W.dust, W.devil, W.burst, W.burst2, W.rays);

  // ---------------------------------------------------------------- space objects
  const space = new THREE.Group(); scene.add(space); W.groups.space = space;
  W.stars = makeStars(); scene.add(W.stars);
  W.mars = makeGlobe('mars', 100); W.earth = makeGlobe('earth', 100); space.add(W.mars, W.earth);

  // magnetic field lines (Earth)
  const field = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ color: 0x69a8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const L of [1.7, 2.2, 3.0]) for (let k = 0; k < 14; k++) {
    const phi = (k / 14) * Math.PI * 2, lm = Math.acos(Math.sqrt(1 / L)), pts = [];
    for (let i = 0; i <= 48; i++) { const lat = lerp(-lm, lm, i / 48), r = L * Math.cos(lat) ** 2; pts.push(new THREE.Vector3(r * Math.cos(lat) * Math.cos(phi), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(phi)).multiplyScalar(100)); }
    field.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.55 + L * 0.12, 5), fm));
  }
  W.earth.add(field); W.field = field;

  // ---------------------------------------------------------------- Starship
  const ship = new THREE.Group(); W.ship = ship; space.add(ship);
  {
    const steel = std(0xc7cbd2, 0.3, 1, { envMapIntensity: 1.1 }), blackTile = std(0x0b0b0e, 0.35, 0.25), dark = std(0x1a1a1d, 0.6, 0.8);
    const prof = []; const R = 4.5, H = 50;
    prof.push(new THREE.Vector2(0.01, 0), new THREE.Vector2(R * 0.9, 0), new THREE.Vector2(R, 1.2), new THREE.Vector2(R, 32));
    for (let i = 1; i <= 14; i++) { const t = i / 14; prof.push(new THREE.Vector2(R * Math.sqrt(1 - Math.pow(t, 1.7)) * (1 - 0.0 * t) + 0.01, 32 + t * (H - 32))); }
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), steel); ship.add(body);
    const shield = new THREE.Mesh(new THREE.LatheGeometry(prof.map((v) => new THREE.Vector2(v.x > 0.1 ? v.x + 0.05 : v.x, v.y)), 72, Math.PI * 0.25, Math.PI * 1.5 * 0.67), blackTile); ship.add(shield);
    const skirt = cyl(R * 0.92, R * 0.92, 1.8, dark, 0, 0.5, 0, 48); ship.add(skirt);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283, e = cyl(0.25, 0.7, 1.8, dark, Math.cos(a) * 2.2, -0.5, Math.sin(a) * 2.2, 16); ship.add(e); }
    const flap = (w, h, y, sx, mat) => { const f = box(w, h, 0.35, mat, sx * (R + w * 0.42), y, 0); f.rotation.z = sx * -0.12; return f; };
    for (const sx of [-1, 1]) { ship.add(flap(2.4, 7, 41, sx, steel)); ship.add(flap(3.4, 11, 6.5, sx, blackTile)); }
    const win = box(0.05, 0.9, 1.6, std(0x111, 0.2, 0.9)); win.position.set(R * 0.998, 44, 0); ship.add(win);
    ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // plasma sheath for atmospheric entry
    const plasma = new THREE.Group();
    const pm = (c, a) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    for (const [s, c, a] of [[1.12, 0xff5a14, 0.35], [1.4, 0xffa040, 0.18], [1.85, 0xffd9a0, 0.09]]) { const p = new THREE.Mesh(new THREE.LatheGeometry(prof.map((v) => new THREE.Vector2(v.x * s + 0.01, v.y * (s > 1.3 ? 1.0 : 1))), 36), pm(c, a)); plasma.add(p); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(R * 1.1, 70, 32, 1, true), pm(0xff7a22, 0.22)); tail.position.y = -35; tail.rotation.x = Math.PI; plasma.add(tail);
    plasma.scale.set(1, 1, 1); ship.add(plasma); W.plasma = plasma;
    ship.userData.height = H;
  }

  // ---------------------------------------------------------------- Perseverance (+ MMRTG)
  W.perseverance = makePerseverance(W);
  W.opportunity = makeOpportunity(W);
  W.ingenuity = makeIngenuity();
  W.humanoid = makeHumanoid();
  for (const o of [W.perseverance, W.opportunity, W.ingenuity, W.humanoid]) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); surface.add(o); }
  W.perseverance.userData.glowMat.userData = {};

  // ---------------------------------------------------------------- chip lab
  const lab = new THREE.Group(); lab.position.set(0, -600, 0); scene.add(lab); W.groups.lab = lab;
  buildChip(lab, W);

  W.setAll = (name, v) => { W.groups[name].visible = v; };
  W.hideAll = () => {
    for (const g of Object.values(W.groups)) g.visible = false;
    for (const o of [W.perseverance, W.opportunity, W.ingenuity, W.humanoid, W.ship, W.mars, W.earth, W.devil, W.burst, W.burst2, W.rays, W.dust, W.plasma, W.stars]) o.visible = false;
    W.terrainNear.parent.visible = false;
    glow.intensity = 0; chipKey.intensity = 0; chipFill.intensity = 0;
  };
  return W;
}

// ====================================================================== robots
function panelTexture(base = '#d9d8d3') {
  const t = canvasTex(512, (g, s) => { g.fillStyle = base; g.fillRect(0, 0, s, s); const r = mulberry32(4); g.strokeStyle = 'rgba(40,36,32,.55)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.strokeRect(r() * s * 0.6, r() * s * 0.6, 80 + r() * s * 0.4, 60 + r() * s * 0.3); }
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(50,46,42,.6)'; g.beginPath(); g.arc(r() * s, r() * s, 2.2, 0, 7); g.fill(); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${90 + r() * 80},${70 + r() * 50},${50 + r() * 40},${0.04 + r() * 0.06})`; g.fillRect(r() * s, r() * s, 20 + r() * 60, 3 + r() * 10); } });
  return t;
}
function makePerseverance(W) {
  const g = new THREE.Group();
  const pt = panelTexture();
  const white = new THREE.MeshStandardMaterial({ map: pt, bumpMap: pt, bumpScale: 1.2, roughness: 0.55, metalness: 0.2 }), grey = std(0x8a8e95, 0.5, 0.7, { envMapIntensity: 1.2 }), dark = std(0x1e2024, 0.7, 0.4), gold = std(0xd4a243, 0.3, 0.9), al = std(0x8f9298, 0.4, 0.9);
  g.add(box(2.15, 0.55, 1.45, white, 0, 0.98, 0));
  g.add(box(2.0, 0.07, 1.32, grey, 0, 1.28, 0));
  g.add(box(0.5, 0.2, 0.4, dark, -0.3, 1.42, -0.35)); g.add(box(0.45, 0.16, 0.5, gold, 0.2, 1.4, 0.3)); g.add(box(0.35, 0.12, 0.35, white, -0.5, 1.4, 0.4));
  // mast + SuperCam head
  g.add(cyl(0.045, 0.05, 1.05, grey, 0.72, 1.82, 0.42, 12));
  g.add(box(0.36, 0.22, 0.3, white, 0.72, 2.4, 0.42));
  for (const dz of [-0.08, 0.08]) { const l = cyl(0.04, 0.04, 0.09, dark, 0.9, 2.4, 0.42 + dz, 12); l.rotation.z = Math.PI / 2; g.add(l); }
  const lens = cyl(0.07, 0.07, 0.1, dark, 0.9, 2.52, 0.42, 16); lens.rotation.z = Math.PI / 2; g.add(lens);
  // high-gain antenna
  const hga = cyl(0.26, 0.26, 0.025, white, -0.1, 1.9, -0.45, 32); hga.rotation.x = 0.6; g.add(hga); g.add(cyl(0.02, 0.02, 0.55, grey, -0.1, 1.62, -0.45, 8));
  g.add(cyl(0.012, 0.012, 0.9, dark, -0.55, 1.75, 0.5, 6));
  // robotic arm (stowed)
  const arm = new THREE.Group(); arm.position.set(1.0, 0.95, -0.35);
  arm.add(box(0.7, 0.1, 0.1, grey, 0.35, 0, 0)); arm.add(box(0.1, 0.1, 0.55, grey, 0.72, 0, -0.2)); arm.add(cyl(0.16, 0.16, 0.25, dark, 0.78, -0.02, -0.5, 16));
  g.add(arm);
  // MMRTG
  const rtg = new THREE.Group(); rtg.position.set(-1.35, 1.02, 0);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff6a18, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7 });
  const core = cyl(0.17, 0.17, 0.75, glowMat, 0, 0, 0, 20); core.rotation.z = Math.PI / 2; rtg.add(core);
  const finMat = std(0x16171a, 0.5, 0.8);
  for (let i = 0; i < 10; i++) for (const s of [0, 1, 2, 3]) { const f = box(0.04, 0.5, 0.025, finMat, -0.31 + i * 0.07, 0, 0); f.rotation.x = (s * Math.PI) / 4; rtg.add(f); }
  g.add(rtg); g.userData.rtg = rtg; g.userData.glowMat = glowMat;
  // rocker-bogie + wheels
  g.userData.wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 28); wheelGeo.rotateX(Math.PI / 2);
  const grouser = new THREE.BoxGeometry(0.03, 0.045, 0.2);
  for (const s of [-1, 1]) {
    g.add(box(1.7, 0.07, 0.07, grey, 0.1, 0.72, s * 0.96).rotateZ(-0.14)); g.add(box(1.25, 0.07, 0.07, grey, -0.5, 0.45, s * 1.0).rotateZ(0.0));
    g.add(box(0.07, 0.55, 0.07, grey, 0.95, 0.55, s * 1.02)); g.add(box(0.07, 0.5, 0.07, grey, -1.0, 0.5, s * 1.02)); g.add(box(0.07, 0.5, 0.07, grey, 0.0, 0.46, s * 1.08)); g.add(box(0.07, 0.3, 0.07, grey, 0.4, 0.88, s * 0.82));
    for (const x of [1.05, 0, -1.05]) {
      const w = new THREE.Group(); w.position.set(x, 0.26, s * (x === 0 ? 1.15 : 1.1));
      w.add(new THREE.Mesh(wheelGeo, al));
      for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.283, gr = new THREE.Mesh(grouser, al); gr.position.set(Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0); gr.rotation.z = a; w.add(gr); }
      g.add(w); g.userData.wheels.push(w);
    }
  }
  return g;
}

function makeOpportunity(W) {
  const g = new THREE.Group();
  const foil = std(0xc79a3e, 0.35, 0.8), grey = std(0x909399, 0.5, 0.7), dark = std(0x202228, 0.7, 0.4), white = std(0xdfdfdc, 0.5, 0.2);
  const panelTex = canvasTex(256, (c, s) => { c.fillStyle = '#16204a'; c.fillRect(0, 0, s, s); c.strokeStyle = '#6a7fc9'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo((i * s) / 8, 0); c.lineTo((i * s) / 8, s); c.moveTo(0, (i * s) / 8); c.lineTo(s, (i * s) / 8); c.stroke(); } });
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.2 });
  const dustMat = new THREE.MeshStandardMaterial({ color: 0x6f3a1d, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  g.add(box(1.0, 0.36, 0.8, foil, 0, 0.6, 0));
  for (const [w, d, x, z] of [[1.55, 1.25, 0, 0], [1.1, 0.5, 0, 0.88], [1.1, 0.5, 0, -0.88]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), panelMat); p.position.set(x, 0.82, z); g.add(p);
    const dp = new THREE.Mesh(new THREE.BoxGeometry(w + 0.005, 0.034, d + 0.005), dustMat); dp.position.set(x, 0.822, z); g.add(dp);
  }
  g.userData.dustMat = dustMat; g.userData.panelMat = panelMat;
  g.add(cyl(0.03, 0.03, 0.62, grey, 0.55, 1.15, 0.2, 10)); g.add(box(0.28, 0.14, 0.2, white, 0.55, 1.5, 0.2));
  const hga = cyl(0.16, 0.16, 0.02, white, -0.45, 1.0, -0.4, 24); hga.rotation.x = 0.7; g.add(hga);
  g.userData.wheels = [];
  const wg = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 18); wg.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    g.add(box(1.2, 0.04, 0.04, grey, 0, 0.35, s * 0.55).rotateZ(-0.12));
    for (const x of [0.5, 0, -0.5]) { const w = new THREE.Group(); w.position.set(x, 0.13, s * 0.58); w.add(new THREE.Mesh(wg, grey)); for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; const gr = box(0.02, 0.03, 0.1, grey, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0); gr.rotation.z = a; w.add(gr); } g.add(w); g.userData.wheels.push(w); g.add(box(0.03, 0.25, 0.03, grey, x, 0.28, s * 0.58)); }
  }
  return g;
}

function makeIngenuity() {
  const g = new THREE.Group();
  const black = std(0x1b1c20, 0.6, 0.4), gold = std(0xc9a14a, 0.35, 0.8), carbon = std(0x2a2b30, 0.5, 0.5), blue = std(0x1a2a63, 0.3, 0.6);
  g.add(box(0.14, 0.14, 0.14, gold, 0, 0.62, 0)); g.add(box(0.42, 0.015, 0.34, blue, 0, 1.0, 0)); g.add(cyl(0.012, 0.012, 0.4, carbon, 0, 0.82, 0, 8));
  for (const [a, b] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) { const l = box(0.012, 0.5, 0.012, carbon, a, 0.32, b); l.rotation.set(b * 0.5, 0, -a * 0.5); g.add(l); }
  g.userData.rotors = [];
  for (const y of [0.97, 0.88]) {
    const r = new THREE.Group(); r.position.y = y;
    for (const s of [-1, 1]) r.add(box(0.6, 0.006, 0.05, carbon, s * 0.3, 0, 0));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); disc.rotation.x = Math.PI / 2; r.add(disc);
    g.add(r); g.userData.rotors.push(r);
  }
  return g;
}

function makeHumanoid() {
  const g = new THREE.Group();
  const shell = std(0xe9e9ea, 0.35, 0.3), joint = std(0x17181b, 0.55, 0.6), visor = std(0x050507, 0.12, 0.9, { envMapIntensity: 1.5 });
  const cap = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m);
  const torso = cap(0.19, 0.38, shell); torso.scale.z = 0.72; torso.position.y = 1.2; g.add(torso);
  g.add(box(0.28, 0.12, 0.18, joint, 0, 0.93, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), shell); head.position.set(0, 1.62, 0); head.scale.set(1, 1.05, 1); g.add(head);
  const vz = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16, -0.9, 1.8, 0.7, 1.8), visor); vz.position.set(0.035, 1.62, 0); vz.rotation.y = Math.PI / 2; vz.scale.set(1.0, 1, 1.0); g.add(vz);
  g.add(cyl(0.045, 0.045, 0.08, joint, 0, 1.5, 0, 12));
  const limbs = {};
  const arm = (s) => { const sh = new THREE.Group(); sh.position.set(0, 1.4, s * 0.25); const up = cap(0.045, 0.22, shell); up.position.y = -0.17; sh.add(up); const el = new THREE.Group(); el.position.y = -0.34; const lo = cap(0.04, 0.2, shell); lo.position.y = -0.15; el.add(lo, new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), joint)); const hand = box(0.07, 0.1, 0.05, joint, 0, -0.32, 0); el.add(hand); sh.add(el); g.add(sh); return { sh, el }; };
  const leg = (s) => { const hip = new THREE.Group(); hip.position.set(0, 0.92, s * 0.11); const th = cap(0.06, 0.3, shell); th.position.y = -0.24; hip.add(th); const kn = new THREE.Group(); kn.position.y = -0.46; const sh = cap(0.05, 0.3, shell); sh.position.y = -0.22; kn.add(sh, new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), joint)); const foot = box(0.2, 0.06, 0.1, joint, 0.05, -0.47, 0); kn.add(foot); hip.add(kn); g.add(hip); return { hip, kn }; };
  limbs.armL = arm(-1); limbs.armR = arm(1); limbs.legL = leg(-1); limbs.legR = leg(1);
  g.userData.limbs = limbs;
  g.userData.shellMat = shell;
  return g;
}

export function poseHumanoid(h, phase, speed = 1) {
  const L = h.userData.limbs, s = Math.sin(phase), c = Math.cos(phase);
  L.legL.hip.rotation.z = s * 0.5 * speed; L.legR.hip.rotation.z = -s * 0.5 * speed;
  L.legL.kn.rotation.z = Math.max(0, -c) * 0.6 * speed; L.legR.kn.rotation.z = Math.max(0, c) * 0.6 * speed;
  L.armL.sh.rotation.z = -s * 0.45 * speed; L.armR.sh.rotation.z = s * 0.45 * speed;
  L.armL.el.rotation.z = 0.25 + Math.max(0, s) * 0.2; L.armR.el.rotation.z = 0.25 + Math.max(0, -s) * 0.2;
  h.children[0].rotation.x = 0; h.position.y = Math.abs(c) * 0.03 * speed;
}

// ====================================================================== chip lab
function buildChip(lab, W) {
  const boardTex = canvasTex(2048, (g, s) => {
    g.fillStyle = '#0c2e24'; g.fillRect(0, 0, s, s);
    const r = mulberry32(8); g.lineCap = 'round';
    for (let i = 0; i < 520; i++) { const x = r() * s, y = r() * s, l = 60 + r() * 380; g.strokeStyle = r() > 0.5 ? '#c7863a' : '#1d6b52'; g.lineWidth = 3 + r() * 5; g.beginPath(); g.moveTo(x, y); if (r() > 0.5) { g.lineTo(x + l, y); g.lineTo(x + l + 40, y + 40); } else { g.lineTo(x, y + l); g.lineTo(x + 40, y + l + 40); } g.stroke(); }
    for (let i = 0; i < 260; i++) { g.fillStyle = '#d9a257'; g.beginPath(); g.arc(r() * s, r() * s, 5 + r() * 6, 0, 7); g.fill(); g.fillStyle = '#082018'; g.beginPath(); g.arc(g.canvas.width * 0 + r() * s, r() * s, 2, 0, 7); g.fill(); }
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 6.2), [std(0x0a261e, 0.7), std(0x0a261e, 0.7), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.45, metalness: 0.35, emissive: 0x0a3a2c, emissiveMap: boardTex, emissiveIntensity: 0.35 }), std(0x0a261e, 0.7), std(0x0a261e, 0.7), std(0x0a261e, 0.7)]);
  lab.add(board); board.receiveShadow = true;
  const labelTex = canvasTex(512, (g, s) => { g.fillStyle = '#16171b'; g.fillRect(0, 0, s, s); g.fillStyle = '#9aa3ad'; g.font = '700 54px sans-serif'; g.textAlign = 'center'; g.fillText('RAD-HARD', s / 2, 210); g.font = '600 38px sans-serif'; g.fillText('FLIGHT CPU', s / 2, 270); g.strokeStyle = '#5a6068'; g.lineWidth = 6; g.strokeRect(20, 20, s - 40, s - 40); g.beginPath(); g.arc(46, 46, 10, 0, 7); g.stroke(); });
  labelTex.wrapS = THREE.RepeatWrapping; labelTex.repeat.x = -1; labelTex.offset.x = 1;
  const chipMats = [std(0x15161a, 0.5, 0.6), std(0x15161a, 0.5, 0.6), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.4, metalness: 0.7 }), std(0x15161a, 0.5, 0.6), std(0x15161a, 0.5, 0.6), std(0x15161a, 0.5, 0.6)];
  const chip = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 2.4), chipMats); chip.position.set(0, 0.24, 0); lab.add(chip);
  const pinM = std(0xc8ccd2, 0.3, 1);
  for (let i = 0; i < 18; i++) { const t = -1.1 + (i / 17) * 2.2; for (const [x, z, w, d] of [[-1.28, t, 0.14, 0.05], [1.28, t, 0.14, 0.05], [t, -1.28, 0.05, 0.14], [t, 1.28, 0.05, 0.14]]) lab.add(box(w, 0.05, d, pinM, x, 0.17, z)); }
  const capM = std(0xb6925a, 0.4, 0.5), blackM = std(0x111, 0.5, 0.3);
  const r = mulberry32(2);
  for (let i = 0; i < 46; i++) { const x = (r() - 0.5) * 9, z = (r() - 0.5) * 5.6; if (Math.abs(x) < 2 && Math.abs(z) < 2) continue; lab.add(box(0.22 + r() * 0.3, 0.12 + r() * 0.1, 0.14 + r() * 0.2, r() > 0.6 ? blackM : capM, x, 0.2, z)); }
  for (let i = 0; i < 5; i++) lab.add(box(1.0 + r() * 0.6, 0.18, 0.7 + r() * 0.5, blackM, -4 + i * 2, 0.22, i % 2 ? 2.2 : -2.3));
  // bit grid
  const cell = new THREE.BoxGeometry(0.18, 0.04, 0.18);
  const grid = new THREE.InstancedMesh(cell, new THREE.MeshBasicMaterial({ color: 0xffffff }), 64);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { dm.position.set(-0.87 + i * 0.25, 0.37, -0.87 + j * 0.25); dm.updateMatrix(); grid.setMatrixAt(i * 8 + j, dm.matrix); grid.setColorAt(i * 8 + j, new THREE.Color(0x0a5a6a)); }
  lab.add(grid); W.chipGrid = grid;
  // particle strike
  const strikeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 3, 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const strike = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 4, 8), strikeMat); lab.add(strike); W.strike = strike;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); lab.add(flash); W.flash = flash;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.25, metalness: 0.8 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; lab.add(floor);
  W.chipLab = lab;
}
