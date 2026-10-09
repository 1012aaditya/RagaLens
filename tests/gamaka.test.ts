import { describe, expect, it } from 'vitest';
import { renderScore } from '../src/engine/contour';
import { classifyContour, features } from '../src/engine/gamaka';
import { analyze } from '../src/engine/analyze';
import {
  ANDOLAN_KOMAL_RE,
  KAMPITA_R,
  MEEND_G_TO_P,
  MURKI,
  render,
} from './fixtures/contours';
import type { PitchFrame } from '../src/engine/types';

function contourOf(frames: PitchFrame[]) {
  return frames
    .filter((f) => f.cents !== null)
    .map((f) => ({ t: f.t, cents: f.cents as number }));
}

describe('contour features', () => {
  it('measures a glide as monotonic and wide', () => {
    const f = features(contourOf(renderScore([{ kind: 'meend', from: 'G', to: 'P', ms: 420 }])));
    expect(f.monotonicity).toBeGreaterThan(0.9);
    expect(f.extent).toBeGreaterThan(280);
    expect(Math.round(f.durationMs / 10) * 10).toBeGreaterThanOrEqual(400);
  });

  it('measures a 6 Hz shake at roughly 6 Hz', () => {
    const f = features(
      contourOf(renderScore([{ kind: 'kampita', token: 'R', ms: 1000, rateHz: 6, extentCents: 200 }])),
    );
    expect(f.rateHz).toBeGreaterThan(5);
    expect(f.rateHz).toBeLessThan(7);
  });
});

describe('gamaka classifier', () => {
  it('classifies a meend G→P with high confidence', () => {
    const g = classifyContour(
      contourOf(renderScore([{ kind: 'meend', from: 'G', to: 'P', ms: 420 }])),
    );
    expect(g.type).toBe('meend');
    expect(g.confidence).toBeGreaterThan(0.7);
    expect(g.reason).toMatch(/Glide/);
  });

  it('finds the meend inside a full G — glide — P passage', () => {
    const r = analyze(render(MEEND_G_TO_P));
    const meend = r.gamakas.find((g) => g.type === 'meend');
    expect(meend, JSON.stringify(r.gamakas, null, 1)).toBeTruthy();
    expect(meend!.confidence).toBeGreaterThan(0.7);
    expect(meend!.fromSwara).toBe(4);
    expect(meend!.toSwara).toBe(7);
  });

  it('classifies a 6 Hz ±100 cent oscillation on R as kampita', () => {
    const r = analyze(render(KAMPITA_R));
    const k = r.gamakas.find((g) => g.type === 'kampita');
    expect(k, JSON.stringify(r.gamakas, null, 1)).toBeTruthy();
    expect(k!.rateHz!).toBeGreaterThan(4);
    expect(k!.rateHz!).toBeLessThan(9);
    expect(k!.centerSwara).toBe(2);
  });

  it('classifies a 1.5 Hz ±20 cent sway on komal Re as andolan', () => {
    const r = analyze(render(ANDOLAN_KOMAL_RE), { forcedRaga: 'bhairav' });
    const a = r.gamakas.find((g) => g.type === 'andolan');
    expect(a, JSON.stringify(r.gamakas, null, 1)).toBeTruthy();
    expect(a!.centerSwara).toBe(1);
    expect(a!.rateHz!).toBeGreaterThanOrEqual(0.8);
    expect(a!.rateHz!).toBeLessThanOrEqual(3);
    expect(a!.reason).toMatch(/Andolan/);
  });

  it('classifies a fast multi-swara cluster as murki', () => {
    const r = analyze(render(MURKI));
    const m = r.gamakas.find((g) => g.type === 'murki');
    expect(m, JSON.stringify(r.gamakas, null, 1)).toBeTruthy();
    expect(m!.reason).toMatch(/Murki/);
  });

  it('classifies a sub-120 ms neighbour flick as kan', () => {
    const g = classifyContour(
      contourOf(renderScore([{ kind: 'kan', token: 'N', to: "S'", ms: 80 }])),
      { nextSwara: 0 },
    );
    expect(g.type).toBe('kan');
    expect(g.reason).toMatch(/kan/);
  });

  it('reports none for a plain steady note', () => {
    const g = classifyContour(contourOf(renderScore([{ kind: 'note', token: 'G', ms: 400 }])));
    expect(g.type).toBe('none');
  });
});
