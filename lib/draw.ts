/**
 * Published draws (master plan P4). A run order is either a random draw anyone can re-run from its seed,
 * a published rule (for example "reverse rank from the last round"), or a hand edit with a logged reason.
 * Pure and import-free so `npm test` runs it under plain Node and the browser can verify a draw too.
 *
 * The draw: sort the registration ids (plain string order), then Fisher–Yates from the end, taking
 * j = floor(rand() * (i + 1)), where rand() is sfc32 seeded from the seed text. All integer maths
 * until the last division, so every JavaScript engine gives the same order for the same seed.
 */

export type DrawMethod = 'random' | 'rule' | 'manual';

export const SEED_PATTERN = /^[a-z0-9-]{4,64}$/;

/** cyrb128: four 32-bit words from a string */
function seedWords(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** sfc32: a small PRNG; returns floats in [0, 1) */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** The order a seed produces for these ids. Input order doesn't matter. */
export function drawOrder(ids: string[], seed: string): string[] {
  const out = [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const rand = sfc32(...seedWords(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** True when `order` is exactly what `seed` draws for the same people. */
export function verifyDraw(order: string[], seed: string): boolean {
  const again = drawOrder(order, seed);
  return again.length === order.length && again.every((id, i) => id === order[i]);
}

/** A fresh seed such as "k3f9-a1b2c3d4" (web crypto, so it works in the browser and on the server). */
export function newSeed(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export interface DrawMeta {
  method: DrawMethod;
  seed?: string;
  rule?: string;
  reason?: string;
}

/**
 * Rules for recording how an order was made. Returns an error message or null.
 * `order` is the submitted order; a random draw must be exactly what its seed produces.
 */
export function checkDrawMeta(meta: DrawMeta | undefined, order: string[], required: boolean): string | null {
  if (!meta) return required ? 'Say how this order was made: a random draw, a rule, or a reason for the hand edit.' : null;
  if (meta.method === 'random') {
    if (!meta.seed || !SEED_PATTERN.test(meta.seed)) return 'A random draw needs its seed (4–64 letters, digits or dashes).';
    if (!verifyDraw(order, meta.seed)) return "That order isn't what the seed draws, so it can't be published as a random draw.";
  }
  if (meta.method === 'rule' && !(meta.rule ?? '').trim()) return 'A rule-based order needs the rule written out.';
  if (meta.method === 'manual' && (meta.reason ?? '').trim().length < 5) return 'A hand edit needs a reason (at least a few words).';
  return null;
}
