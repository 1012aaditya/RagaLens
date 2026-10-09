// Pure pitch-contour synthesis: a tiny notation+gamaka score language rendered
// to a PitchFrame stream. Used by the unit tests and by the audio synth singer,
// so it must stay DOM-free.

import { config } from './config';
import { parseToken } from './swara';
import type { PitchFrame } from './types';

export type ScoreItem =
  | { kind: 'note'; token: string; ms: number; jitterCents?: number }
  | { kind: 'rest'; ms: number }
  | { kind: 'meend'; from: string; to: string; ms: number }
  | { kind: 'kampita'; token: string; ms: number; rateHz?: number; extentCents?: number }
  | { kind: 'andolan'; token: string; ms: number; rateHz?: number; extentCents?: number }
  | { kind: 'murki'; tokens: string[]; ms: number }
  | { kind: 'kan'; token: string; to: string; ms: number };

export type Score = ScoreItem[];

const FRAME_MS = (config.hop / config.sampleRate) * 1000; // ≈ 11.61 ms

export function tokenCents(token: string): number {
  const p = parseToken(token);
  if (!p) throw new Error(`bad token: ${token}`);
  return p.swara * 100 + p.octave * 1200;
}

/** Deterministic pseudo-random in [-1,1], so tests never flake. */
function wobble(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

/**
 * Render a score to a PitchFrame stream at the engine's hop rate.
 * `startT` lets callers concatenate passages.
 */
export function renderScore(score: Score, startT = 0): PitchFrame[] {
  const frames: PitchFrame[] = [];
  let t = startT;
  let fi = 0;

  const emit = (cents: number | null) => {
    frames.push({
      t,
      hz: cents === null ? null : 220 * Math.pow(2, cents / 1200),
      cents,
      conf: cents === null ? 0 : 0.97,
    });
    t += FRAME_MS / 1000;
    fi++;
  };

  for (const item of score) {
    const n = Math.max(1, Math.round(item.ms / FRAME_MS));
    switch (item.kind) {
      case 'rest': {
        for (let k = 0; k < n; k++) emit(null);
        break;
      }
      case 'note': {
        const c = tokenCents(item.token);
        const j = item.jitterCents ?? 6;
        for (let k = 0; k < n; k++) emit(c + wobble(fi) * j);
        break;
      }
      case 'meend': {
        const a = tokenCents(item.from);
        const b = tokenCents(item.to);
        for (let k = 0; k < n; k++) {
          // smooth monotonic glide (smoothstep) so monotonicity stays high
          const u = n === 1 ? 1 : k / (n - 1);
          const e = u * u * (3 - 2 * u);
          emit(a + (b - a) * e + wobble(fi) * 2);
        }
        break;
      }
      case 'kampita': {
        const c = tokenCents(item.token);
        const rate = item.rateHz ?? 6;
        const ext = item.extentCents ?? 100;
        for (let k = 0; k < n; k++) {
          const sec = (k * FRAME_MS) / 1000;
          emit(c + (ext / 2) * Math.sin(2 * Math.PI * rate * sec));
        }
        break;
      }
      case 'andolan': {
        const c = tokenCents(item.token);
        const rate = item.rateHz ?? 1.5;
        const ext = item.extentCents ?? 40;
        for (let k = 0; k < n; k++) {
          const sec = (k * FRAME_MS) / 1000;
          emit(c + (ext / 2) * Math.sin(2 * Math.PI * rate * sec));
        }
        break;
      }
      case 'murki': {
        const pts = item.tokens.map(tokenCents);
        for (let k = 0; k < n; k++) {
          const u = n === 1 ? 0 : (k / (n - 1)) * (pts.length - 1);
          const i0 = Math.min(pts.length - 1, Math.floor(u));
          const i1 = Math.min(pts.length - 1, i0 + 1);
          const f = u - i0;
          emit(pts[i0] + (pts[i1] - pts[i0]) * f);
        }
        break;
      }
      case 'kan': {
        const touch = tokenCents(item.token);
        const land = tokenCents(item.to);
        for (let k = 0; k < n; k++) {
          const u = n === 1 ? 1 : k / (n - 1);
          emit(touch + (land - touch) * u);
        }
        break;
      }
    }
  }
  return frames;
}

/** Convenience: a plain notation string, each note the same duration. */
export function renderNotation(notation: string, msPerNote = 320): PitchFrame[] {
  const items: Score = notation
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ kind: 'note' as const, token, ms: msPerNote }));
  return renderScore(items);
}

export const FRAME_INTERVAL_MS = FRAME_MS;
