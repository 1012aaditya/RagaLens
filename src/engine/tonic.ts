import { noteNameToHz } from './swara';
import type { PitchFrame } from './types';

/** Candidate tonics for the manual picker. */
export const TONIC_CHOICES_MALE = [
  'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
];
export const TONIC_CHOICES_FEMALE = [
  'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4',
];

export function tonicChoiceHz(name: string): number {
  const hz = noteNameToHz(name);
  if (hz === null) throw new Error(`bad note name: ${name}`);
  return hz;
}

/** Apply a fine-tune offset in cents to a base tonic. */
export function applyFineTune(baseHz: number, cents: number): number {
  return baseHz * Math.pow(2, cents / 1200);
}

export interface CalibrationResult {
  tonicHz: number | null;
  /** fraction of the window that was confidently voiced */
  coverage: number;
  /** spread of the confident frames, in cents */
  spreadCents: number;
  message: string;
}

/**
 * Estimate the tonic from a "sing Sa" window: the median of confidently
 * voiced frames. `frames` must carry raw hz (cents are meaningless before the
 * tonic is known).
 */
export function calibrateTonic(
  frames: PitchFrame[],
  minConf = 0.9,
): CalibrationResult {
  const voiced = frames.filter((f) => f.hz !== null && f.conf >= minConf);
  const coverage = frames.length ? voiced.length / frames.length : 0;
  if (voiced.length < 10) {
    return {
      tonicHz: null,
      coverage,
      spreadCents: 0,
      message: 'Not enough steady voice in that take — try again, a little louder.',
    };
  }
  const hz = voiced.map((f) => f.hz as number).sort((a, b) => a - b);
  const mid = hz.length >> 1;
  const median = hz.length % 2 ? hz[mid] : (hz[mid - 1] + hz[mid]) / 2;
  const cents = hz.map((h) => 1200 * Math.log2(h / median));
  const lo = cents[Math.floor(cents.length * 0.1)];
  const hi = cents[Math.floor(cents.length * 0.9)];
  const spreadCents = hi - lo;

  if (spreadCents > 120) {
    return {
      tonicHz: median,
      coverage,
      spreadCents,
      message: `That take wandered by ${Math.round(
        spreadCents,
      )} cents. Sa set to ${median.toFixed(1)} Hz — hold it steadier to sharpen it.`,
    };
  }
  return {
    tonicHz: median,
    coverage,
    spreadCents,
    message: `Sa set to ${median.toFixed(1)} Hz (±${Math.round(spreadCents / 2)} cents).`,
  };
}

/** Nearest named note to a frequency, for display next to the slider. */
export function nearestNoteName(hz: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = names[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  const exact = 440 * Math.pow(2, (midi - 69) / 12);
  const off = Math.round(1200 * Math.log2(hz / exact));
  const sign = off > 0 ? '+' : '';
  return off === 0 ? `${name}${oct}` : `${name}${oct} ${sign}${off}¢`;
}
