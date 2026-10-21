// Shader-based effects: dust, dust devils, bursts, particle streaks (radiation), stars, planets.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const glslNoise = /* glsl */ `
float hash31(vec3 p){p=fract(p*0.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<6;i++){s+=a*vnoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
`;

export const shared = { time: { value: 0 }, res: { value: new THREE.Vector2(1920, 1080) }, cam: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(1, 0.3, 0.4).normalize() } };

// ---------------------------------------------------------------- ambient dust cloud around the camera
export function makeDust(count = 14000) {
  const r = mulberry32(11);
  const geo = new THREE.BufferGeometry();
  const base = new Float32Array(count * 3), rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) { base[i * 3] = r(); base[i * 3 + 1] = r(); base[i * 3 + 2] = r(); rnd[i] = r(); }
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.time, uRes: shared.res, uCam: shared.cam, uBox: { value: new THREE.Vector3(60, 18, 60) }, uWind: { value: new THREE.Vector3(7, 0.4, 2.5) }, uAlpha: { value: 0.3 }, uSize: { value: 1.0 }, uColor: { value: new THREE.Color(0.55, 0.32, 0.18) } },
    vertexShader: /* glsl */ `
      attribute float aR; uniform float uTime,uSize; uniform vec2 uRes; uniform vec3 uCam,uBox,uWind; varying float vA;
      void main(){
        vec3 p = position*uBox + uWind*uTime*(0.6+aR*0.8) + vec3(sin(uTime*.7+aR*40.)*.6,cos(uTime*.5+aR*30.)*.4,0.);
        vec3 c = uCam - uBox*.5; c.y = max(0., uCam.y-2.);
        vec3 w = mod(p - c, uBox) + c;
        vec4 mv = viewMatrix*vec4(w,1.);
        float d = -mv.z;
        gl_PointSize = clamp(uSize*(0.6+aR)*uRes.y/1080.*34./max(d,0.6), 1., 90.);
        vA = smoothstep(0.3,2.,d) * (1.-smoothstep(uBox.x*.3,uBox.x*.5,d)) * (0.4+0.6*aR);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main(){ vec2 q=gl_PointCoord-.5; float a=smoothstep(.5,.0,length(q)); gl_FragColor=vec4(uColor, a*a*vA*uAlpha); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- dust devil
export function makeDevil(count = 5000) {
  const r = mulberry32(23);
  const geo = new THREE.BufferGeometry();
  const rnd = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { rnd[i * 3] = r(); rnd[i * 3 + 1] = r(); rnd[i * 3 + 2] = r(); }
  geo.setAttribute('position', new THREE.BufferAttribute(rnd, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.time, uRes: shared.res, uBase: { value: new THREE.Vector3() }, uH: { value: 60 }, uAlpha: { value: 0.5 }, uColor: { value: new THREE.Color(0.5, 0.3, 0.17) } },
    vertexShader: /* glsl */ `
      uniform float uTime,uH; uniform vec2 uRes; uniform vec3 uBase; varying float vA;
      void main(){
        float h = fract(position.x + uTime*0.05*(0.5+position.z)) ;
        float y = h*uH;
        float rad = 1.2 + h*h*uH*0.16 + position.y*h*3.;
        float ang = position.y*6.2831 + uTime*(2.6 - h*1.5);
        vec3 w = uBase + vec3(cos(ang)*rad + sin(y*.08+uTime*.3)*h*5., y, sin(ang)*rad);
        vec4 mv = viewMatrix*vec4(w,1.);
        gl_PointSize = clamp((2.+h*7.)*uRes.y/1080.*55./max(-mv.z,1.),1.,70.);
        vA = (1.-h)*smoothstep(0.,.05,h);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main(){ vec2 q=gl_PointCoord-.5; float a=smoothstep(.5,.0,length(q)); gl_FragColor=vec4(uColor,a*a*vA*uAlpha); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- one-shot dust burst (helicopter downwash, landings)
export function makeBurst(count = 2500) {
  const r = mulberry32(37);
  const geo = new THREE.BufferGeometry();
  const dir = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    dir[i * 3] = Math.cos(a); dir[i * 3 + 1] = r() * 0.3; dir[i * 3 + 2] = Math.sin(a);
    rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.time, uRes: shared.res, uOrigin: { value: new THREE.Vector3() }, uT0: { value: 0 }, uPower: { value: 3 }, uDur: { value: 5 }, uSize: { value: 1 }, uAlpha: { value: 0.5 }, uColor: { value: new THREE.Color(0.6, 0.36, 0.2) } },
    vertexShader: /* glsl */ `
      attribute vec4 aR; uniform float uTime,uT0,uPower,uDur,uSize; uniform vec2 uRes; uniform vec3 uOrigin; varying float vA;
      void main(){
        float age = uTime - uT0 - aR.x*0.5;
        if(age<0. || age>uDur){ gl_Position=vec4(2.,2.,2.,1.); gl_PointSize=0.; vA=0.; return; }
        float k = 1.-exp(-age*1.8);
        vec3 p = uOrigin + position*uPower*(0.4+aR.y)*k;
        p.y += (0.3+aR.z)*k*uPower*0.45 + 0.05;
        vec4 mv = viewMatrix*vec4(p,1.);
        gl_PointSize = clamp(uSize*(0.6+aR.w)*(1.+age*0.8)*uRes.y/1080.*38./max(-mv.z,0.8),1.,160.);
        vA = (1.-age/uDur)*smoothstep(0.,.2,age);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main(){ vec2 q=gl_PointCoord-.5; float a=smoothstep(.5,.0,length(q)); gl_FragColor=vec4(uColor,a*a*vA*uAlpha); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- particle streaks (cosmic rays / solar particles)
export function makeRays(count = 420) {
  const r = mulberry32(51);
  const geo = new THREE.BufferGeometry();
  const side = new Float32Array(count * 4), end = new Float32Array(count * 4), rnd = new Float32Array(count * 16), pos = new Float32Array(count * 12);
  const idx = [];
  for (let i = 0; i < count; i++) {
    const a = r(), b = r(), c = r(), d = r();
    for (let k = 0; k < 4; k++) {
      side[i * 4 + k] = k % 2 === 0 ? -1 : 1;
      end[i * 4 + k] = k < 2 ? 0 : 1;
      rnd.set([a, b, c, d], i * 16 + k * 4);
    }
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 4));
  geo.setIndex(idx);
  const uniforms = {
    uTime: shared.time, uRes: shared.res,
    uArea: { value: new THREE.Vector3() }, uSpan: { value: 120 }, uTop: { value: 70 }, uSpread: { value: 0.5 },
    uLen: { value: 14 }, uSpeed: { value: 0.35 }, uPx: { value: 2.2 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(0.55, 0.8, 1.0) },
  };
  const common = /* glsl */ `
    attribute vec4 aR; uniform float uTime,uSpan,uTop,uSpread,uLen,uSpeed; uniform vec3 uArea;
    void rayState(out vec3 S, out vec3 D, out float s, out float Lp){
      float r5 = fract(aR.x*17.13 + aR.y*5.71);
      S = vec3((aR.x-.5)*uSpan, uTop, (aR.y-.5)*uSpan) + uArea;
      D = normalize(vec3((aR.z-.5)*uSpread, -1., (r5-.5)*uSpread));
      Lp = uTop/(-D.y);
      s = fract(aR.w*13.7 + uTime*uSpeed*(0.6+0.8*aR.z));
    }`;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: common + /* glsl */ `
      attribute float aSide; attribute float aEnd; uniform vec2 uRes; uniform float uPx; varying float vA; varying float vS; varying float vE;
      void main(){
        vec3 S,D; float s,Lp; rayState(S,D,s,Lp);
        vec3 head = S + D*s*Lp;
        vec3 tail = head - D*min(uLen, s*Lp);
        vec4 h = projectionMatrix*viewMatrix*vec4(head,1.);
        vec4 t = projectionMatrix*viewMatrix*vec4(tail,1.);
        vec2 pH = h.xy/h.w*uRes*.5, pT = t.xy/t.w*uRes*.5;
        vec2 d = pH-pT; float l=length(d); d = l>1e-4 ? d/l : vec2(1.,0.);
        vec2 n = vec2(-d.y,d.x);
        vec4 p = mix(t,h,aEnd);
        p.xy += (n*aSide*uPx*(uRes.y/1080.)*.5 + d*mix(-1.,1.,aEnd)*uPx*.5) * 2./uRes * p.w;
        vA = smoothstep(0.,.04,s)*(1.-smoothstep(.96,1.,s));
        vS = aSide; vE = aEnd;
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA; varying float vS; varying float vE;
      void main(){ float e = 1.-abs(vS); float a = vA*e*e*mix(.12,1.,vE)*uAlpha; gl_FragColor = vec4(uColor*a,a); }`,
  });
  const streaks = new THREE.Mesh(geo, mat);
  streaks.frustumCulled = false;

  // impact sparks where the rays meet the ground
  const pgeo = new THREE.BufferGeometry();
  const prnd = new Float32Array(count * 4), ppos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) prnd.set(rnd.subarray(i * 16, i * 16 + 4), i * 4);
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pgeo.setAttribute('aR', new THREE.BufferAttribute(prnd, 4));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: common + /* glsl */ `
      uniform vec2 uRes; varying float vA;
      void main(){
        vec3 S,D; float s,Lp; rayState(S,D,s,Lp);
        vec3 hit = S + D*Lp;
        float f = smoothstep(.955,.985,s)*(1.-smoothstep(.985,1.,s));
        vec4 mv = viewMatrix*vec4(hit,1.);
        gl_PointSize = f*clamp(uRes.y/1080.*160./max(-mv.z,1.),2.,50.);
        vA = f;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main(){ vec2 q=gl_PointCoord-.5; float a=smoothstep(.5,.0,length(q)); a=a*a*vA*uAlpha; gl_FragColor=vec4(uColor*a*1.4,a); }`,
  });
  const sparks = new THREE.Points(pgeo, pmat);
  sparks.frustumCulled = false;
  const group = new THREE.Group();
  group.add(streaks, sparks);
  group.userData.uniforms = uniforms;
  return group;
}

// ---------------------------------------------------------------- stars
export function makeStars(count = 6000) {
  const r = mulberry32(5);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * 3000, u * 3000, Math.sin(a) * s * 3000], i * 3);
    const t = r(), m = 0.55 + r() * 0.45;
    col.set([m * (0.8 + 0.2 * t), m * 0.9, m * (1 - 0.25 * t)], i * 3);
    sz[i] = r() < 0.04 ? 3.2 : 1.1 + r() * 1.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uRes: shared.res },
    vertexShader: `attribute vec3 color; attribute float aSz; uniform vec2 uRes; varying vec3 vC; void main(){ vC=color; gl_PointSize=aSz*uRes.y/1080.; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q=gl_PointCoord-.5; float a=smoothstep(.5,.1,length(q)); gl_FragColor=vec4(vC*a,a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- planets (Mars / Earth) with atmosphere
export function makeGlobe(kind = 'mars', radius = 100) {
  const uniforms = {
    uTime: shared.time, uSun: shared.sunDir, uKind: { value: kind === 'earth' ? 1 : 0 }, uStorm: { value: 0 }, uSpin: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uSpin;
      void main(){ vP = position/ ${radius.toFixed(3)}; float c=cos(uSpin), s=sin(uSpin); vP = vec3(c*vP.x + s*vP.z, vP.y, -s*vP.x + c*vP.z);
        vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: glslNoise + /* glsl */ `
      uniform vec3 uSun; uniform float uKind,uStorm,uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 p = normalize(vP); vec3 albedo;
        if(uKind<.5){
          float big = fbm3(p*2.2); float det = fbm3(p*9.);
          vec3 rust = vec3(.55,.24,.11), dark=vec3(.16,.09,.07), pale=vec3(.72,.46,.27);
          albedo = mix(rust, dark, smoothstep(.5,.66,big)*.85);
          albedo = mix(albedo, pale, smoothstep(.42,.3,big)*.6);
          albedo *= .85 + .3*det;
          float cap = smoothstep(.86,.93,abs(p.y)+ (det-.5)*.08); albedo = mix(albedo, vec3(.92,.93,.95), cap);
          // global dust storm: swirling ochre veil spreading from a source region
          float src = 1.-smoothstep(0.,1.25+uStorm*1.6, length(p - normalize(vec3(.7,-.18,.7))));
          float swirl = fbm3(p*3.2 + vec3(uTime*.03,0.,uTime*.02) + fbm3(p*5.)*1.3);
          float storm = clamp(uStorm*1.6*src*smoothstep(.28,.62,swirl+src*.25),0.,1.);
          albedo = mix(albedo, vec3(.78,.55,.34)*(.9+.2*swirl), storm*.93);
        } else {
          float big = fbm3(p*2.6); float land = smoothstep(.5,.55,big);
          vec3 ocean = mix(vec3(.02,.07,.2), vec3(.03,.18,.4), fbm3(p*8.));
          vec3 ground = mix(vec3(.12,.28,.08), vec3(.45,.38,.22), smoothstep(.55,.75,fbm3(p*6.)));
          albedo = mix(ocean, ground, land);
          float ice = smoothstep(.86,.93,abs(p.y)); albedo = mix(albedo, vec3(.95), ice);
          float cl = smoothstep(.5,.72,fbm3(p*4.+vec3(uTime*.01,0.,0.))); albedo = mix(albedo, vec3(1.), cl*.85);
        }
        float nl = dot(normalize(vN), normalize(uSun));
        float diff = smoothstep(-.08,.55,nl);
        float fres = pow(1.-max(dot(normalize(vN),normalize(vV)),0.),3.);
        vec3 atm = uKind<.5 ? vec3(.95,.6,.38) : vec3(.35,.6,1.);
        vec3 col = albedo*(diff*1.25+.012) + atm*fres*(.25+.9*smoothstep(-.3,.4,nl))*(uKind<.5?.5:1.);
        gl_FragColor = vec4(col,1.);
      }`,
  });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 72), mat);
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uSun: shared.sunDir, uKind: uniforms.uKind },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uKind; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(max(dot(-normalize(vN), normalize(vV)),0.), 3.2); float lit = smoothstep(-.4,.6,dot(normalize(vN),normalize(uSun))*-1.+.2);
        vec3 c = uKind<.5? vec3(.95,.55,.3):vec3(.3,.55,1.); gl_FragColor=vec4(c*f*(.35+.65*clamp(lit+.35,0.,1.)), f); }`,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 96, 48), haloMat);
  g.add(mesh, halo);
  g.userData = { uniforms, mesh, halo };
  return g;
}
