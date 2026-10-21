export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Seeded 2D value noise + fbm (deterministic, used for terrain height). */
export function makeNoise(seed = 1) {
  const r = mulberry32(seed);
  const T = new Float32Array(256 * 256);
  for (let i = 0; i < T.length; i++) T[i] = r();
  const at = (x, y) => T[((y & 255) << 8) | (x & 255)];
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }
  function fbm(x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  }
  return { n2, fbm };
}
