import type { Octave, SwaraIdx } from './types';

export const SWARA_NAMES = [
  'S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N',
] as const;

export const SWARA_LONG_NAMES = [
  'Sa', 'komal Re', 'shuddha Re', 'komal Ga', 'shuddha Ga', 'shuddha Ma',
  'tivra Ma', 'Pa', 'komal Dha', 'shuddha Dha', 'komal Ni', 'shuddha Ni',
] as const;

export const ALL_SWARAS: SwaraIdx[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Parse a single notation token like "S", ".D", "G'" into swara + octave. */
export function parseToken(token: string): { swara: SwaraIdx; octave: Octave } | null {
  let t = token.trim();
  if (!t) return null;
  let octave: Octave = 0;
  if (t.startsWith('.')) {
    octave = -1;
    t = t.slice(1);
  }
  if (t.endsWith("'")) {
    octave = 1;
    t = t.slice(0, -1);
  }
  const idx = (SWARA_NAMES as readonly string[]).indexOf(t);
  if (idx < 0) return null;
  return { swara: idx as SwaraIdx, octave };
}

/** Parse a whitespace-separated notation string, e.g. "G R S .D S R G". */
export function parseNotation(s: string): SwaraIdx[] {
  return s
    .split(/\s+/)
    .map(parseToken)
    .filter((x): x is { swara: SwaraIdx; octave: Octave } => x !== null)
    .map((x) => x.swara);
}

/** Parse a notation string keeping octave information. */
export function parseNotationFull(s: string): { swara: SwaraIdx; octave: Octave }[] {
  return s
    .split(/\s+/)
    .map(parseToken)
    .filter((x): x is { swara: SwaraIdx; octave: Octave } => x !== null);
}

export function notate(swara: SwaraIdx, octave: Octave = 0): string {
  const base = SWARA_NAMES[swara];
  if (octave < 0) return `.${base}`;
  if (octave > 0) return `${base}'`;
  return base;
}

export function notateSeq(swaras: SwaraIdx[]): string {
  return swaras.map((s) => SWARA_NAMES[s]).join(' ');
}

/** Fold raw cents (relative to tonic, can be negative/large) into pitch class 0..1199. */
export function foldCents(cents: number): number {
  return ((cents % 1200) + 1200) % 1200;
}

export function octaveOf(cents: number): Octave {
  const o = Math.floor(cents / 1200);
  return (o < -1 ? -1 : o > 1 ? 1 : o) as Octave;
}

/** Nearest swara index for a cents value, plus the signed deviation from its centre. */
export function centsToSwara(cents: number): {
  swara: SwaraIdx;
  octave: Octave;
  deviation: number;
} {
  const semis = Math.round(cents / 100);
  const swara = (((semis % 12) + 12) % 12) as SwaraIdx;
  const oct = Math.floor(semis / 12) || 0; // avoid -0
  const octave = (oct < -1 ? -1 : oct > 1 ? 1 : oct) as Octave;
  return { swara, octave, deviation: cents - semis * 100 };
}

/** Distance in cents from the nearest swara centre (0..50). */
export function distanceToSwaraCentre(cents: number): number {
  const pc = foldCents(cents);
  const d = pc % 100;
  return Math.min(d, 100 - d);
}

export function hzToCents(hz: number, tonicHz: number): number {
  return 1200 * Math.log2(hz / tonicHz);
}

export function centsToHz(cents: number, tonicHz: number): number {
  return tonicHz * Math.pow(2, cents / 1200);
}

/** Note names + frequencies for the tonic picker. */
export function noteNameToHz(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) return null;
  const semis: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let s = semis[m[1]];
  if (m[2] === '#') s += 1;
  if (m[2] === 'b') s -= 1;
  const oct = parseInt(m[3], 10);
  // A4 = 440 Hz, MIDI 69
  const midi = (oct + 1) * 12 + s;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
