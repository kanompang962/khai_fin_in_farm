export interface Rng {
  state: number;
}

/** mulberry32 — เร็วและ deterministic, state เก็บเป็นตัวเลขเดียวจึง persist ได้ */
export function rand(r: Rng): number {
  r.state = (r.state + 0x6d2b79f5) | 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(r: Rng, min: number, max: number): number {
  return min + Math.floor(rand(r) * (max - min + 1));
}

export function normal(r: Rng, mean = 0, sd = 1): number {
  const u = Math.max(rand(r), 1e-12);
  const v = rand(r);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pickWeighted<K extends string>(r: Rng, weights: Record<K, number>): K {
  const keys = Object.keys(weights) as K[];
  const total = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  let x = rand(r) * total;
  for (const k of keys) {
    x -= Math.max(0, weights[k]);
    if (x <= 0) return k;
  }
  return keys[keys.length - 1];
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26) */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
