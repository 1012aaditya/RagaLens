import { config } from './config';
import { RAGAS } from '../data/loadRagas';
import { matchPakad, type PhraseHit } from './phrases';
import type {
  Direction,
  GamakaEvent,
  NoteEvent,
  Raga,
  RagaPosterior,
  SwaraIdx,
} from './types';

/** Per-raga pitch-class log-likelihood template. */
function template(raga: Raga): number[] {
  const w = new Array<number>(12).fill(config.disallowedEps);
  for (const rule of raga.varjyaRules) {
    if (rule.category !== 'dissonant') w[rule.swara] = config.weightConditional;
  }
  for (const s of raga.swaras) w[s] = config.weightAllowed;
  for (const s of raga.nyas) w[s] = Math.max(w[s], config.weightNyas);
  w[raga.samvadi] = Math.max(w[raga.samvadi], config.weightSamvadi);
  w[raga.vadi] = Math.max(w[raga.vadi], config.weightVadi);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.log(x / sum));
}

const TEMPLATES: Record<string, number[]> = Object.fromEntries(
  RAGAS.map((r) => [r.id, template(r)]),
);

/** Absolute scale position so octave jumps get the right direction. */
export function position(n: NoteEvent): number {
  return n.swara + n.octave * 12;
}

export function directionOf(prev: NoteEvent, cur: NoteEvent): Direction {
  const d = position(cur) - position(prev);
  if (d > 0) return 'aroha';
  if (d < 0) return 'avaroha';
  return 'flat';
}

function bigramAllowed(raga: Raga, dir: Direction, swara: SwaraIdx): boolean {
  if (dir === 'aroha') return raga.aroha.includes(swara);
  if (dir === 'avaroha') return raga.avaroha.includes(swara);
  return raga.swaras.includes(swara);
}

export function violatesDirection(
  raga: Raga,
  dir: Direction,
  swara: SwaraIdx,
): { note: string } | null {
  if (dir === 'flat') return null;
  for (const r of raga.directionRules ?? []) {
    if (r.swara === swara && r.forbiddenIn === dir) return { note: r.note };
  }
  return null;
}

export interface RecognizerOptions {
  /** Practice mode: the user has chosen a raga, so lock immediately. */
  forcedRaga?: string;
}

/**
 * Streaming raga recogniser. Accumulates exponentially-decayed log evidence
 * from pitch classes, note transitions, pakad matches and gamaka placement,
 * then softmaxes into a posterior.
 */
export class RagaRecognizer {
  private scores: Record<string, number> = {};
  private lastT = 0;
  private recent: SwaraIdx[] = [];
  private lockCandidate: string | null = null;
  private lockSince = 0;
  private lockedId: string | null = null;
  private forced: string | null = null;
  private noteCount = 0;
  /** last note index at which each (raga, pakad) pair was reported */
  private phraseSeen = new Map<string, number>();

  constructor(opts: RecognizerOptions = {}) {
    for (const r of RAGAS) this.scores[r.id] = 0;
    if (opts.forcedRaga) this.force(opts.forcedRaga);
  }

  /** Practice mode: pin the target raga. Evidence still accumulates. */
  force(ragaId: string | null): void {
    this.forced = ragaId;
    this.lockedId = ragaId;
  }

  reset(): void {
    for (const r of RAGAS) this.scores[r.id] = 0;
    this.recent = [];
    this.lastT = 0;
    this.lockCandidate = null;
    this.lockSince = 0;
    this.lockedId = this.forced;
    this.noteCount = 0;
    this.phraseSeen.clear();
  }

  private decayTo(t: number): void {
    const dt = Math.max(0, t - this.lastT);
    if (dt > 0) {
      const k = Math.pow(0.5, dt / config.ragaMemorySec);
      for (const id of Object.keys(this.scores)) this.scores[id] *= k;
      this.lastT = t;
    }
  }

  /** Feed a steady note. Returns any pakad hits triggered by it. */
  feedNote(note: NoteEvent, prev?: NoteEvent): PhraseHit[] {
    this.decayTo(note.tEnd);
    const durSec = Math.max(0.01, note.tEnd - note.tStart);
    const w = Math.min(3, Math.max(0.3, durSec / 0.3));

    for (const raga of RAGAS) {
      let s = TEMPLATES[raga.id][note.swara] * w;
      if (prev) {
        const dir = directionOf(prev, note);
        if (bigramAllowed(raga, dir, note.swara)) s += config.transitionBonus;
        if (violatesDirection(raga, dir, note.swara)) s -= config.directionPenalty;
      }
      this.scores[raga.id] += s;
    }

    this.recent.push(note.swara);
    if (this.recent.length > config.phraseWindow) this.recent.shift();

    this.noteCount++;

    // A trailing window keeps matching the same pakad for several notes after
    // it completes. Evidence still accrues (at a reduced weight) but the phrase
    // is only *reported* once per actual rendition.
    const hits = matchPakad(this.recent);
    const fresh: PhraseHit[] = [];
    for (const h of hits) {
      const key = h.ragaId + '|' + h.pakad;
      const last = this.phraseSeen.get(key);
      const isFresh = last === undefined || this.noteCount - last >= h.swaras.length;
      // a shorter edit distance is stronger evidence
      const bonus = config.phraseBonus / (1 + h.editDistance);
      this.scores[h.ragaId] += isFresh ? bonus : bonus * 0.25;
      if (isFresh) {
        this.phraseSeen.set(key, this.noteCount);
        fresh.push(h);
      }
    }
    return fresh;
  }

  /** Feed a gamaka event: andolan on a raga's andolanOn note is strong evidence. */
  feedGamaka(g: GamakaEvent): void {
    this.decayTo(g.tEnd);
    if (g.type !== 'andolan' || g.centerSwara === undefined) return;
    for (const raga of RAGAS) {
      if ((raga.andolanOn ?? []).includes(g.centerSwara)) {
        this.scores[raga.id] += config.gamakaBonus * Math.max(0.2, g.confidence);
      }
    }
  }

  /** Current softmax posterior, with lock state applied. */
  posterior(t: number): RagaPosterior {
    const ids = Object.keys(this.scores);
    const max = Math.max(...ids.map((id) => this.scores[id]));
    const exps = ids.map((id) => Math.exp(this.scores[id] - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const ranked = ids
      .map((id, i) => ({ ragaId: id, p: exps[i] / sum }))
      .sort((a, b) => b.p - a.p);

    if (this.forced) {
      return { t, ranked, locked: this.forced };
    }

    const top = ranked[0];
    if (top.p > config.lockP) {
      if (this.lockCandidate !== top.ragaId) {
        this.lockCandidate = top.ragaId;
        this.lockSince = t;
      } else if ((t - this.lockSince) * 1000 >= config.lockHoldMs) {
        this.lockedId = top.ragaId;
      }
    } else {
      this.lockCandidate = null;
      if (this.lockedId && top.p < config.lockP * 0.6) this.lockedId = null;
    }
    return { t, ranked, locked: this.lockedId ?? undefined };
  }

  /** The raga the vivadi grader should judge against. */
  targetRaga(t: number): string {
    if (this.forced) return this.forced;
    return this.lockedId ?? this.posterior(t).ranked[0].ragaId;
  }

  recentSwaras(): SwaraIdx[] {
    return [...this.recent];
  }
}
