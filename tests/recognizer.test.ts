import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine/analyze';
import { renderScore } from '../src/engine/contour';
import { DEMO_SCORES, scoreDurationSec } from '../src/engine/demo';
import { editDistance, matchPakad } from '../src/engine/phrases';
import { RAGAS } from '../src/data/loadRagas';
import { parseNotation } from '../src/engine/swara';

describe('phrase matching', () => {
  it('computes edit distance', () => {
    expect(editDistance([0, 2, 4], [0, 2, 4])).toBe(0);
    expect(editDistance([0, 2, 4], [0, 2, 5])).toBe(1);
    expect(editDistance([0, 2, 4], [0, 4])).toBe(1);
  });

  it('finds the Bhupali pakad in a trailing window', () => {
    const recent = parseNotation('P D G R S .D S R G');
    const hits = matchPakad(recent);
    expect(hits.some((h) => h.ragaId === 'bhupali')).toBe(true);
  });

  it('tolerates one wrong note in a pakad', () => {
    const recent = parseNotation('G R S D S R G');
    const hits = matchPakad(recent);
    expect(hits.some((h) => h.ragaId === 'bhupali')).toBe(true);
  });
});

describe('raga recogniser on synthetic passages', () => {
  const results: { id: string; top: string; p: number; locked?: string }[] = [];

  for (const raga of RAGAS) {
    it(`ranks ${raga.name} top-1 or reports why not`, () => {
      const score = DEMO_SCORES[raga.id];
      expect(score, `no demo score for ${raga.id}`).toBeTruthy();
      expect(scoreDurationSec(score)).toBeGreaterThan(8);
      const r = analyze(renderScore(score));
      results.push({
        id: raga.id,
        top: r.posterior.ranked[0].ragaId,
        p: r.posterior.ranked[0].p,
        locked: r.posterior.locked,
      });
      // individual ragas may legitimately be confusable; the suite-level
      // assertion below is the real requirement
      expect(r.posterior.ranked.length).toBe(RAGAS.length);
    });
  }

  it('gets at least 7 of 8 correct and reports the confusion', () => {
    const correct = results.filter((r) => r.id === r.top);
    const wrong = results.filter((r) => r.id !== r.top);
    expect(
      correct.length,
      'misidentified: ' + JSON.stringify(wrong, null, 1),
    ).toBeGreaterThanOrEqual(7);
  });

  it('locks onto Bhupali from its own pakad', () => {
    const r = analyze(renderScore(DEMO_SCORES.bhupali));
    expect(r.posterior.locked).toBe('bhupali');
  });

  it('emits phrase-match events with the matched pakad text', () => {
    const r = analyze(renderScore(DEMO_SCORES.bhupali));
    const own = r.phrases.filter((p) => p.ragaId === 'bhupali');
    expect(own.length).toBeGreaterThan(0);
    expect(own[0].pakad.length).toBeGreaterThan(0);
  });
});

describe('practice mode', () => {
  it('grades against the chosen raga regardless of the posterior', () => {
    const r = analyze(renderScore(DEMO_SCORES.bhupali), { forcedRaga: 'malkauns' });
    expect(r.targetRaga).toBe('malkauns');
    expect(r.vivadis.length).toBeGreaterThan(0);
    expect(r.vivadis.every((v) => v.ragaId === 'malkauns')).toBe(true);
  });
});
