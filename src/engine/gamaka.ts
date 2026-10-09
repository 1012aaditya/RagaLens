import { config } from './config';
import { centsToSwara, SWARA_NAMES } from './swara';
import type { GamakaEvent, GamakaType, NoteEvent, SwaraIdx } from './types';
import type { TransientSegment } from './segmenter';

export interface ContourPoint {
  t: number;
  cents: number;
}

export interface ContourFeatures {
  durationMs: number;
  extent: number;
  /** p10..p90 range: ignores the approach ramp into an oscillation */
  extentRobust: number;
  monotonicity: number;
  rateHz: number;
  extremaCount: number;
  cycles: number;
  distinctSwaras: SwaraIdx[];
  startCents: number;
  endCents: number;
  meanCents: number;
}

function linFit(pts: ContourPoint[]): { a: number; b: number } {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) {
    sx += p.t;
    sy += p.cents;
    sxx += p.t * p.t;
    sxy += p.t * p.cents;
  }
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return { a: 0, b: sy / n };
  const a = (n * sxy - sx * sy) / d;
  const b = (sy - a * sx) / n;
  return { a, b };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function smooth(xs: number[], taps: number): number[] {
  const half = taps >> 1;
  return xs.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k < 0 || k >= xs.length) continue;
      s += xs[k];
      c++;
    }
    return s / c;
  });
}

export function features(pts: ContourPoint[]): ContourFeatures {
  const n = pts.length;
  const cents = pts.map((p) => p.cents);
  const durationMs = n < 2 ? 0 : (pts[n - 1].t - pts[0].t) * 1000;
  const min = Math.min(...cents);
  const max = Math.max(...cents);
  const extent = max - min;
  const sorted = [...cents].sort((a, b) => a - b);
  const extentRobust = percentile(sorted, 0.9) - percentile(sorted, 0.1);

  // monotonicity over meaningful steps only, so micro-jitter does not count
  let signSum = 0;
  let steps = 0;
  for (let i = 1; i < n; i++) {
    const d = cents[i] - cents[i - 1];
    if (Math.abs(d) < 1) continue;
    signSum += Math.sign(d);
    steps++;
  }
  const monotonicity = steps ? Math.abs(signSum) / steps : 0;

  // detrend, then count zero crossings to estimate oscillation rate
  const { a, b } = linFit(pts);
  const resid = pts.map((p) => p.cents - (a * p.t + b));
  let crossings = 0;
  for (let i = 1; i < n; i++) {
    const prev = Math.sign(resid[i - 1]);
    const cur = Math.sign(resid[i]);
    if (prev !== 0 && cur !== 0 && prev !== cur) crossings++;
  }
  const durSec = durationMs / 1000;
  const rateHz = durSec > 0 ? crossings / 2 / durSec : 0;
  const cycles = crossings / 2;

  // local extrema on a lightly smoothed track
  const sm = smooth(cents, 3);
  let extremaCount = 0;
  for (let i = 1; i < sm.length - 1; i++) {
    const d1 = sm[i] - sm[i - 1];
    const d2 = sm[i + 1] - sm[i];
    if (Math.abs(d1) < 3 || Math.abs(d2) < 3) continue;
    if (Math.sign(d1) !== Math.sign(d2)) extremaCount++;
  }

  const distinct = new Set<SwaraIdx>();
  for (const c of cents) distinct.add(centsToSwara(c).swara);

  return {
    durationMs,
    extent,
    extentRobust,
    monotonicity,
    rateHz,
    extremaCount,
    cycles,
    distinctSwaras: [...distinct],
    startCents: cents[0],
    endCents: cents[n - 1],
    meanCents: cents.reduce((x, y) => x + y, 0) / n,
  };
}

/** How centred a value sits inside a [lo,hi] band, normalised 0..1. */
function bandMargin(v: number, lo: number, hi: number): number {
  if (v < lo || v > hi) return 0;
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  return half === 0 ? 1 : 1 - Math.abs(v - mid) / half;
}

/** How far past a minimum threshold a value sits, saturating at `soft`. */
function overMargin(v: number, min: number, soft: number): number {
  if (v < min) return 0;
  return Math.min(1, (v - min) / Math.max(1e-9, soft - min));
}

let uid = 0;
function nextId(): string {
  return 'g' + (uid++).toString(36);
}
export function resetGamakaIds(): void {
  uid = 0;
}

const name = (s: SwaraIdx) => SWARA_NAMES[s];

/**
 * Classify a transient contour. Rule-based and explainable; first match wins,
 * ordered so short ornaments are caught before long glides.
 */
export function classifyContour(
  pts: ContourPoint[],
  ctx: { prevSwara?: SwaraIdx; nextSwara?: SwaraIdx } = {},
): GamakaEvent {
  const none = (reason: string): GamakaEvent => ({
    id: nextId(),
    type: 'none' as GamakaType,
    tStart: pts.length ? pts[0].t : 0,
    tEnd: pts.length ? pts[pts.length - 1].t : 0,
    extentCents: 0,
    confidence: 0,
    reason,
  });
  if (pts.length < 3) return none('too short to classify');

  const f = features(pts);
  const base = {
    id: nextId(),
    tStart: pts[0].t,
    tEnd: pts[pts.length - 1].t,
    extentCents: Math.round(f.extent),
  };
  const fromSwara = centsToSwara(f.startCents).swara;
  const toSwara = centsToSwara(f.endCents).swara;
  const centerSwara = centsToSwara(f.meanCents).swara;

  // A short join between two different steady notes that stays inside the
  // interval it spans is just a note change, not an ornament. A kan, by
  // contrast, overshoots or touches a swara outside that interval. Testing the
  // travelled range rather than monotonicity keeps ordinary legato out of the
  // feed even when vocal jitter breaks strict monotonicity.
  if (
    ctx.prevSwara !== undefined &&
    ctx.nextSwara !== undefined &&
    ctx.prevSwara !== ctx.nextSwara &&
    f.durationMs < config.meend.minMs
  ) {
    const lo = Math.min(f.startCents, f.endCents) - config.stableBandCents;
    const hi = Math.max(f.startCents, f.endCents) + config.stableBandCents;
    const minC = Math.min(...pts.map((p) => p.cents));
    const maxC = Math.max(...pts.map((p) => p.cents));
    if (minC >= lo && maxC <= hi) {
      return none(
        'Plain step ' + name(ctx.prevSwara) + '→' + name(ctx.nextSwara) + ', ' +
          Math.round(f.durationMs) + ' ms',
      );
    }
  }

  // kan: a flick shorter than kanMs that touches a neighbour then lands
  if (f.durationMs < config.kanMs && f.extent >= 50) {
    const landed = ctx.nextSwara ?? toSwara;
    return {
      ...base,
      type: 'kan',
      fromSwara,
      toSwara: landed,
      confidence: 0.6 + 0.4 * (1 - f.durationMs / config.kanMs),
      reason:
        'Touch of ' + name(fromSwara) + ' for ' + Math.round(f.durationMs) +
        ' ms before ' + name(landed) + ' — kan',
    };
  }

  // murki: fast cluster with several direction changes over at least 3 swaras
  if (
    f.durationMs >= config.murkiMinMs &&
    f.durationMs <= config.murkiMaxMs &&
    f.extremaCount >= config.murkiMinExtrema &&
    f.distinctSwaras.length >= config.murkiMinSwaras
  ) {
    return {
      ...base,
      type: 'murki',
      fromSwara,
      toSwara,
      centerSwara,
      confidence: Math.min(
        1,
        0.5 +
          0.25 * overMargin(f.extremaCount, config.murkiMinExtrema, config.murkiMinExtrema + 3) +
          0.25 *
            overMargin(
              f.distinctSwaras.length,
              config.murkiMinSwaras,
              config.murkiMinSwaras + 2,
            ),
      ),
      reason:
        'Murki: ' + f.distinctSwaras.length + ' swaras, ' + f.extremaCount +
        ' turns in ' + Math.round(f.durationMs) + ' ms',
    };
  }

  // meend: monotonic glide connecting two swaras
  if (
    f.monotonicity > config.meend.minMonotonic &&
    f.extent >= config.meend.minExtent &&
    f.durationMs >= config.meend.minMs
  ) {
    const a = ctx.prevSwara ?? fromSwara;
    const b = ctx.nextSwara ?? toSwara;
    return {
      ...base,
      type: 'meend',
      fromSwara: a,
      toSwara: b,
      confidence: Math.min(
        1,
        0.4 +
          0.3 * overMargin(f.monotonicity, config.meend.minMonotonic, 1) +
          0.3 * overMargin(f.extent, config.meend.minExtent, config.meend.minExtent * 3),
      ),
      reason:
        'Glide ' + name(a) + '→' + name(b) + ', ' + Math.round(f.extent) +
        ' cents in ' + Math.round(f.durationMs) + ' ms, monotonic ' +
        f.monotonicity.toFixed(2),
    };
  }

  // kampita: fast shake
  if (
    f.rateHz >= config.kampita.rateMin &&
    f.rateHz <= config.kampita.rateMax &&
    f.extentRobust >= config.kampita.extentMin &&
    f.extentRobust <= config.kampita.extentMax &&
    f.cycles >= config.kampita.minCycles
  ) {
    return {
      ...base,
      type: 'kampita',
      centerSwara,
      rateHz: Number(f.rateHz.toFixed(2)),
      confidence: Math.min(
        1,
        0.4 +
          0.3 * bandMargin(f.rateHz, config.kampita.rateMin, config.kampita.rateMax) +
          0.3 * bandMargin(f.extentRobust, config.kampita.extentMin, config.kampita.extentMax),
      ),
      reason:
        'Kampita on ' + name(centerSwara) + ': ' + f.rateHz.toFixed(1) +
        ' Hz shake, ±' + Math.round(f.extentRobust / 2) + ' cents',
    };
  }

  // andolan: slow wide sway centred on a swara
  if (
    f.rateHz >= config.andolan.rateMin &&
    f.rateHz <= config.andolan.rateMax &&
    f.extentRobust >= config.andolan.extentMin &&
    f.extentRobust <= config.andolan.extentMax &&
    f.durationMs >= config.andolan.minMs
  ) {
    return {
      ...base,
      type: 'andolan',
      centerSwara,
      rateHz: Number(f.rateHz.toFixed(2)),
      confidence: Math.min(
        1,
        0.4 +
          0.3 * bandMargin(f.rateHz, config.andolan.rateMin, config.andolan.rateMax) +
          0.3 * bandMargin(f.extentRobust, config.andolan.extentMin, config.andolan.extentMax),
      ),
      reason:
        'Andolan on ' + name(centerSwara) + ': ' + f.rateHz.toFixed(1) +
        ' Hz sway, ±' + Math.round(f.extentRobust / 2) + ' cents over ' +
        Math.round(f.durationMs) + ' ms',
    };
  }

  return none(
    'No gamaka: ' + Math.round(f.durationMs) + ' ms, extent ' + Math.round(f.extent) +
      ' c, rate ' + f.rateHz.toFixed(1) + ' Hz',
  );
}

/** Classify a transient segment produced by the segmenter. */
export function classifySegment(seg: TransientSegment): GamakaEvent {
  return classifyContour(seg.contour, {
    prevSwara: seg.prevNote?.swara,
    nextSwara: seg.nextNote?.swara,
  });
}

/**
 * Long steady notes can hide a slow andolan that passes the stability gate,
 * so every note above config.oscillationScanMs is re-tested for oscillation.
 */
export function detectAndolanInNote(
  note: NoteEvent,
  contour: ContourPoint[],
): GamakaEvent | null {
  if ((note.tEnd - note.tStart) * 1000 < config.oscillationScanMs) return null;
  if (contour.length < 8) return null;
  const g = classifyContour(contour, {});
  if (g.type === 'andolan') return { ...g, centerSwara: note.swara };
  return null;
}
