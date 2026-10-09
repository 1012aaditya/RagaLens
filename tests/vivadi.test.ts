import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine/analyze';
import { render } from './fixtures/contours';
import type { Score } from '../src/engine/contour';
import type { VivadiEvent } from '../src/engine/types';

function grade(score: Score, ragaId: string): VivadiEvent[] {
  return analyze(render(score), { forcedRaga: ragaId }).vivadis;
}

const find = (vs: VivadiEvent[], swara: number) => vs.filter((v) => v.swara === swara);

describe('vivadi grading — Bhupali', () => {
  const lead: Score = [
    { kind: 'note', token: 'G', ms: 320 },
    { kind: 'note', token: 'R', ms: 320 },
    { kind: 'note', token: 'S', ms: 320 },
  ];

  it('flags a sustained shuddha Ma as a mistake', () => {
    const vs = grade([...lead, { kind: 'note', token: 'm', ms: 500 }, { kind: 'note', token: 'G', ms: 320 }], 'bhupali');
    const ma = find(vs, 5);
    expect(ma.length, JSON.stringify(vs, null, 1)).toBeGreaterThan(0);
    expect(ma[0].cls).toBe('mistake');
    expect(ma[0].severity).toBeGreaterThan(0.5);
    expect(ma[0].reason).toMatch(/absent from Bhupali/);
  });

  it('accepts a short shuddha Ni touched inside a meend D→S as an embellishment', () => {
    const score: Score = [
      ...lead,
      { kind: 'note', token: 'D', ms: 320 },
      { kind: 'meend', from: 'D', to: "S'", ms: 420 },
      { kind: 'note', token: "S'", ms: 320 },
    ];
    const vs = grade(score, 'bhupali');
    const ni = find(vs, 11);
    expect(ni.length, JSON.stringify(vs, null, 1)).toBeGreaterThan(0);
    expect(ni[0].cls).toBe('embellishment');
    expect(ni[0].severity).toBeLessThan(0.3);
    expect(ni[0].reason).toMatch(/kan|quick touch/);
  });

  it('says nothing about a clean in-raga phrase', () => {
    const vs = grade(
      [...lead, { kind: 'note', token: 'D', ms: 320 }, { kind: 'note', token: 'P', ms: 320 }],
      'bhupali',
    );
    expect(vs, JSON.stringify(vs, null, 1)).toHaveLength(0);
  });
});

describe('vivadi grading — Yaman: same note, different verdict', () => {
  it('accepts shuddha Ma inside G m G R S as stylistic Yaman Kalyan usage', () => {
    const score: Score = [
      { kind: 'note', token: 'G', ms: 320 },
      { kind: 'note', token: 'm', ms: 320 },
      { kind: 'note', token: 'G', ms: 320 },
      { kind: 'note', token: 'R', ms: 320 },
      { kind: 'note', token: 'S', ms: 320 },
    ];
    const ma = find(grade(score, 'yaman'), 5);
    expect(ma.length).toBeGreaterThan(0);
    expect(ma[0].cls).toBe('stylistic');
    expect(ma[0].reason).toMatch(/Yaman Kalyan/);
  });

  it('flags the same shuddha Ma as a mistake outside that phrase', () => {
    const score: Score = [
      { kind: 'note', token: 'S', ms: 320 },
      { kind: 'note', token: 'R', ms: 320 },
      { kind: 'note', token: 'G', ms: 320 },
      { kind: 'note', token: 'm', ms: 320 },
      { kind: 'note', token: 'P', ms: 320 },
    ];
    const ma = find(grade(score, 'yaman'), 5);
    expect(ma.length).toBeGreaterThan(0);
    expect(ma[0].cls).toBe('mistake');
    expect(ma[0].reason).toMatch(/outside its sanctioned phrase/);
  });
});

describe('vivadi grading — Bihag tivra Ma', () => {
  it('accepts tivra Ma inside P M G m G', () => {
    const score: Score = [
      { kind: 'note', token: 'P', ms: 320 },
      { kind: 'note', token: 'M', ms: 320 },
      { kind: 'note', token: 'G', ms: 320 },
      { kind: 'note', token: 'm', ms: 320 },
      { kind: 'note', token: 'G', ms: 320 },
    ];
    const tivra = find(grade(score, 'bihag'), 6);
    expect(tivra.length).toBeGreaterThan(0);
    expect(tivra[0].cls).toBe('stylistic');
  });
});

describe('vivadi grading — Bhairavi liberties', () => {
  it('reports shuddha Re as a low-severity stylistic choice', () => {
    const score: Score = [
      { kind: 'note', token: 'S', ms: 320 },
      { kind: 'note', token: 'R', ms: 320 },
      { kind: 'note', token: 'g', ms: 320 },
      { kind: 'note', token: 'm', ms: 320 },
    ];
    const re = find(grade(score, 'bhairavi'), 2);
    expect(re.length).toBeGreaterThan(0);
    expect(re[0].cls).toBe('stylistic');
    expect(re[0].severity).toBeLessThanOrEqual(0.3);
    expect(re[0].reason).toMatch(/light-classical/);
  });
});

describe('vivadi grading — Khamaj direction rules', () => {
  it('flags Re taken in the ascent as a direction violation', () => {
    const score: Score = [
      { kind: 'note', token: 'S', ms: 320 },
      { kind: 'note', token: 'R', ms: 320 },
      { kind: 'note', token: 'G', ms: 320 },
    ];
    const re = find(grade(score, 'khamaj'), 2);
    expect(re.length).toBeGreaterThan(0);
    expect(re[0].cls).toBe('direction_violation');
    expect(re[0].reason).toMatch(/ascending/);
  });

  it('allows Re in the descent', () => {
    const score: Score = [
      { kind: 'note', token: 'G', ms: 320 },
      { kind: 'note', token: 'R', ms: 320 },
      { kind: 'note', token: 'S', ms: 320 },
    ];
    const re = find(grade(score, 'khamaj'), 2);
    expect(re).toHaveLength(0);
  });
});

describe('every vivadi event carries a human-readable reason', () => {
  it('never emits an empty explanation', () => {
    const score: Score = [
      { kind: 'note', token: 'S', ms: 320 },
      { kind: 'note', token: 'm', ms: 600 },
      { kind: 'note', token: 'M', ms: 400 },
      { kind: 'note', token: 'n', ms: 400 },
    ];
    const vs = grade(score, 'bhupali');
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) {
      expect(v.reason.length).toBeGreaterThan(10);
      expect(v.severity).toBeGreaterThanOrEqual(0);
      expect(v.severity).toBeLessThanOrEqual(1);
    }
  });
});
