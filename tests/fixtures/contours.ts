import { renderScore, type Score } from '../../src/engine/contour';
import type { PitchFrame } from '../../src/engine/types';

/** A steady note, long enough to be a NoteEvent. */
export function steady(token: string, ms = 350): Score {
  return [{ kind: 'note', token, ms }];
}

/** Notation string rendered as equal-length steady notes with short joins. */
export function phrase(notation: string, msPerNote = 320): Score {
  return notation
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ kind: 'note' as const, token, ms: msPerNote }));
}

export function render(score: Score): PitchFrame[] {
  return renderScore(score);
}

/** meend G→P, the canonical glide test case. */
export const MEEND_G_TO_P: Score = [
  { kind: 'note', token: 'G', ms: 300 },
  { kind: 'meend', from: 'G', to: 'P', ms: 420 },
  { kind: 'note', token: 'P', ms: 300 },
];

/** 6 Hz, ±100 cents shake on shuddha Re. */
export const KAMPITA_R: Score = [
  { kind: 'note', token: 'S', ms: 200 },
  { kind: 'kampita', token: 'R', ms: 700, rateHz: 6, extentCents: 200 },
  { kind: 'note', token: 'S', ms: 200 },
];

/** 1.5 Hz, ±20 cents sway on komal Re (Bhairav andolan). */
export const ANDOLAN_KOMAL_RE: Score = [
  { kind: 'note', token: 'S', ms: 200 },
  { kind: 'andolan', token: 'r', ms: 1400, rateHz: 1.5, extentCents: 40 },
  { kind: 'note', token: 'S', ms: 200 },
];

/** Fast zig-zag cluster across several swaras: murki. */
export const MURKI: Score = [
  { kind: 'note', token: 'G', ms: 250 },
  { kind: 'murki', tokens: ['G', 'P', 'G', 'R', 'P', 'G'], ms: 300 },
  { kind: 'note', token: 'G', ms: 250 },
];
