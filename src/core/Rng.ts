// src/core/Rng.ts — RNG ber-seed (mulberry32) untuk penempatan deterministik (GDD §4.8)
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG gameplay umum (non-deterministik). */
export const rng: Rng = Math.random;

export const randRange = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const randSym = (r: Rng, a: number) => (r() * 2 - 1) * a;
export const randInt = (r: Rng, a: number, b: number) => Math.floor(a + (b - a + 1) * r());
