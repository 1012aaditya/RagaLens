import { Color } from 'three';
import type { Rasa, Raga, Samay } from '../engine/types';

export interface Palette {
  /** deep background, far field */
  bgA: Color;
  /** nearer background, used for the gradient and fog */
  bgB: Color;
  /** primary structure colour: mandala nodes, trail core */
  accent: Color;
  /** secondary, for vadi/samvadi anchors and bloom highlights */
  accent2: Color;
  /** motion speed multiplier, from the rasa */
  speed: number;
  /** background turbulence, from the rasa */
  turbulence: number;
}

const hex = (s: string) => new Color(s);

const SAMAY_COLORS: Record<Samay, { bgA: string; bgB: string; accent: string; accent2: string }> = {
  dawn: { bgA: '#190b14', bgB: '#48212a', accent: '#ff9e6b', accent2: '#ffd2a1' },
  morning: { bgA: '#0b1418', bgB: '#1d3a3c', accent: '#8fd6c0', accent2: '#e8f6c8' },
  afternoon: { bgA: '#15110a', bgB: '#443a1b', accent: '#ffd98a', accent2: '#fff0c2' },
  evening: { bgA: '#140a18', bgB: '#45251a', accent: '#f0c060', accent2: '#ffb27a' },
  night: { bgA: '#070b1c', bgB: '#1d1a42', accent: '#8aa6ff', accent2: '#c7b2ff' },
  midnight: { bgA: '#05050f', bgB: '#190d2e', accent: '#a06cf0', accent2: '#6ad7f0' },
};

const RASA_MOTION: Record<Rasa, { speed: number; turbulence: number }> = {
  shanta: { speed: 0.3, turbulence: 0.25 },
  karuna: { speed: 0.26, turbulence: 0.35 },
  shringar: { speed: 0.6, turbulence: 0.45 },
  bhakti: { speed: 0.4, turbulence: 0.3 },
  veera: { speed: 1.0, turbulence: 0.8 },
  adbhuta: { speed: 0.8, turbulence: 0.7 },
};

export const NEUTRAL_PALETTE: Palette = {
  bgA: hex('#05050c'),
  bgB: hex('#141427'),
  accent: hex('#9aa6c8'),
  accent2: hex('#d4dcf0'),
  speed: 0.35,
  turbulence: 0.3,
};

export function paletteFor(raga: Raga | null): Palette {
  if (!raga) return NEUTRAL_PALETTE;
  const c = SAMAY_COLORS[raga.samay];
  const m = RASA_MOTION[raga.rasa];
  return {
    bgA: hex(c.bgA),
    bgB: hex(c.bgB),
    accent: hex(c.accent),
    accent2: hex(c.accent2),
    speed: m.speed,
    turbulence: m.turbulence,
  };
}

/** Linear interpolation between palettes, for the 2 s lock morph. */
export function lerpPalette(a: Palette, b: Palette, t: number, out: Palette): Palette {
  out.bgA.copy(a.bgA).lerp(b.bgA, t);
  out.bgB.copy(a.bgB).lerp(b.bgB, t);
  out.accent.copy(a.accent).lerp(b.accent, t);
  out.accent2.copy(a.accent2).lerp(b.accent2, t);
  out.speed = a.speed + (b.speed - a.speed) * t;
  out.turbulence = a.turbulence + (b.turbulence - a.turbulence) * t;
  return out;
}

export function clonePalette(p: Palette): Palette {
  return {
    bgA: p.bgA.clone(),
    bgB: p.bgB.clone(),
    accent: p.accent.clone(),
    accent2: p.accent2.clone(),
    speed: p.speed,
    turbulence: p.turbulence,
  };
}

/** Verdict colours, shared by the scene FX and the HUD. */
export const VERDICT_COLORS = {
  mistake: '#f0484a',
  embellishment: '#f5c451',
  stylistic: '#a06cf0',
  direction_violation: '#ff9036',
} as const;
