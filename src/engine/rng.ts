// Seeded randomness: every simulation in What If is reproducible from its seed.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash for building seeds from strings and numbers. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

/** Poisson sample (Knuth). Fine for the small rates used in football. */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

/** Poisson by inverse CDF: the same uniform gives the same quantile under any rate (coupled draws). */
export function poissonInv(u: number, lambda: number): number {
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (u > cdf && k < 20) {
    k++;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}

export function gaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
