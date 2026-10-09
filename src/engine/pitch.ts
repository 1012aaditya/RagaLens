import { config } from './config';
import { hzToCents } from './swara';
import type { PitchFrame } from './types';

/** RMS of a frame; used for the silence gate. */
export function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export interface RawDetection {
  t: number;
  hz: number;
  clarity: number;
  rms: number;
}

/** Apply the confidence / range / silence gates. Returns null hz when gated out. */
export function gate(d: RawDetection, tonicHz: number): PitchFrame {
  const ok =
    d.clarity >= config.clarityMin &&
    d.rms >= config.silenceRms &&
    d.hz >= config.hzMin &&
    d.hz <= config.hzMax &&
    Number.isFinite(d.hz);
  if (!ok) return { t: d.t, hz: null, cents: null, conf: d.clarity };
  return { t: d.t, hz: d.hz, cents: hzToCents(d.hz, tonicHz), conf: d.clarity };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Streaming median filter over the cents track. Null frames pass through as null
 * but do not pollute the window.
 */
export class MedianSmoother {
  private buf: number[] = [];
  constructor(private taps = config.medianTaps) {}

  push(cents: number | null): number | null {
    if (cents === null) {
      this.buf.length = 0;
      return null;
    }
    this.buf.push(cents);
    if (this.buf.length > this.taps) this.buf.shift();
    return median(this.buf);
  }

  reset(): void {
    this.buf.length = 0;
  }
}

/** Offline equivalent of MedianSmoother, for tests and file analysis. */
export function medianFilterCents(
  frames: PitchFrame[],
  taps = config.medianTaps,
): PitchFrame[] {
  const out: PitchFrame[] = [];
  const sm = new MedianSmoother(taps);
  for (const f of frames) {
    const c = sm.push(f.cents);
    out.push({ ...f, cents: c, hz: c === null ? null : f.hz });
  }
  return out;
}

/**
 * Linearly interpolate across null gaps no longer than config.gapBridgeMs,
 * so that a single dropped frame mid-meend does not split a segment.
 */
export function bridgeGaps(
  frames: PitchFrame[],
  maxMs = config.gapBridgeMs,
): PitchFrame[] {
  const out = frames.map((f) => ({ ...f }));
  let i = 0;
  while (i < out.length) {
    if (out[i].cents !== null) {
      i++;
      continue;
    }
    const gapStart = i;
    while (i < out.length && out[i].cents === null) i++;
    const gapEnd = i; // exclusive
    const before = gapStart - 1;
    const after = gapEnd;
    if (before < 0 || after >= out.length) continue;
    const a = out[before];
    const b = out[after];
    if (a.cents === null || b.cents === null) continue;
    const durMs = (b.t - a.t) * 1000;
    if (durMs > maxMs) continue;
    const span = gapEnd - gapStart + 1;
    for (let k = gapStart; k < gapEnd; k++) {
      const f = (k - before) / span;
      out[k].cents = a.cents + (b.cents - a.cents) * f;
      out[k].conf = Math.min(a.conf, b.conf);
    }
  }
  return out;
}

/** Full offline cleanup chain: median filter then gap bridging. */
export function cleanTrack(frames: PitchFrame[]): PitchFrame[] {
  return bridgeGaps(medianFilterCents(frames));
}
