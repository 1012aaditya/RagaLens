import { getRaga } from '../data/loadRagas';
import { SWARA_NAMES } from './swara';
import type {
  GamakaEvent,
  GamakaType,
  NoteEvent,
  PhraseMatchEvent,
  SwaraIdx,
  VivadiClass,
  VivadiEvent,
} from './types';

export interface SessionStats {
  durationSec: number;
  noteCount: number;
  /** share of sung time spent on swaras that belong to the target raga */
  inRagaFraction: number;
  vivadiCounts: Record<VivadiClass, number>;
  gamakaCounts: Record<GamakaType, number>;
  /** seconds spent on each of the 12 swaras */
  swaraSeconds: number[];
  /** the target raga's own template weight per swara, for comparison */
  ragaTemplate: number[];
  phraseMatches: number;
  confidenceTimeline: { t: number; p: number; ragaId: string }[];
  targetRaga: string;
}

const emptyVivadi = (): Record<VivadiClass, number> => ({
  mistake: 0,
  embellishment: 0,
  stylistic: 0,
  direction_violation: 0,
});

const emptyGamaka = (): Record<GamakaType, number> => ({
  meend: 0,
  kampita: 0,
  andolan: 0,
  murki: 0,
  kan: 0,
  none: 0,
});

/**
 * Accumulates everything the session report needs. Fed incrementally from the
 * store as batches arrive, so the report needs no re-analysis.
 */
export class SessionLog {
  notes: NoteEvent[] = [];
  gamakas: GamakaEvent[] = [];
  vivadis: VivadiEvent[] = [];
  phrases: PhraseMatchEvent[] = [];
  confidenceTimeline: { t: number; p: number; ragaId: string }[] = [];
  startedAt = 0;
  lastT = 0;
  targetRaga = '';

  reset(): void {
    this.notes = [];
    this.gamakas = [];
    this.vivadis = [];
    this.phrases = [];
    this.confidenceTimeline = [];
    this.startedAt = 0;
    this.lastT = 0;
  }

  addNotes(ns: NoteEvent[]): void {
    for (const n of ns) {
      this.notes.push(n);
      this.lastT = Math.max(this.lastT, n.tEnd);
    }
  }

  addGamakas(gs: GamakaEvent[]): void {
    for (const g of gs) if (g.type !== 'none') this.gamakas.push(g);
  }

  addVivadis(vs: VivadiEvent[]): void {
    this.vivadis.push(...vs);
  }

  addPhrases(ps: PhraseMatchEvent[]): void {
    this.phrases.push(...ps);
  }

  addConfidence(t: number, ragaId: string, p: number): void {
    const last = this.confidenceTimeline[this.confidenceTimeline.length - 1];
    if (last && t - last.t < 0.2) return;
    this.confidenceTimeline.push({ t, p, ragaId });
  }

  stats(targetRaga = this.targetRaga): SessionStats {
    const swaraSeconds = new Array<number>(12).fill(0);
    let total = 0;
    for (const n of this.notes) {
      const d = Math.max(0, n.tEnd - n.tStart);
      swaraSeconds[n.swara] += d;
      total += d;
    }

    const vivadiCounts = emptyVivadi();
    for (const v of this.vivadis) vivadiCounts[v.cls]++;
    const gamakaCounts = emptyGamaka();
    for (const g of this.gamakas) gamakaCounts[g.type]++;

    let inRaga = 0;
    let template = new Array<number>(12).fill(0);
    if (targetRaga) {
      const raga = getRaga(targetRaga);
      for (const s of raga.swaras) inRaga += swaraSeconds[s];
      template = new Array<number>(12).fill(0);
      for (const s of raga.swaras) template[s] = 1;
      template[raga.samvadi] = 2;
      template[raga.vadi] = 3;
    }

    return {
      durationSec: this.lastT,
      noteCount: this.notes.length,
      inRagaFraction: total > 0 ? inRaga / total : 0,
      vivadiCounts,
      gamakaCounts,
      swaraSeconds,
      ragaTemplate: template,
      phraseMatches: this.phrases.length,
      confidenceTimeline: this.confidenceTimeline,
      targetRaga,
    };
  }

  /** Full session export, suitable for writing to a .json file. */
  toJSON(targetRaga = this.targetRaga): unknown {
    const s = this.stats(targetRaga);
    return {
      app: 'RagaLens',
      version: 1,
      exportedAtIso: new Date().toISOString(),
      targetRaga,
      stats: {
        ...s,
        swaraSeconds: s.swaraSeconds.map((v, i) => ({
          swara: SWARA_NAMES[i as SwaraIdx],
          seconds: Number(v.toFixed(3)),
        })),
      },
      notes: this.notes,
      gamakas: this.gamakas,
      vivadis: this.vivadis,
      phrases: this.phrases,
    };
  }
}
