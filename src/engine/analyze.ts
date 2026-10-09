/*
 * Offline/windowed orchestration of the whole analysis chain. The worker runs
 * this over a rolling window of frames and emits only newly-finished events, so
 * the live path and the test path share exactly one implementation.
 */

import { config } from './config';
import { getRaga, RAGAS } from '../data/loadRagas';
import { detectAndolanInNote, classifySegment } from './gamaka';
import { cleanTrack } from './pitch';
import { directionOf, RagaRecognizer } from './recognizer';
import { segment, type TransientSegment } from './segmenter';
import type {
  GamakaEvent,
  NoteEvent,
  PhraseMatchEvent,
  PitchFrame,
  RagaPosterior,
  SwaraIdx,
  VivadiEvent,
} from './types';
import { buildInput, gradeVivadi } from './vivadi';

export interface AnalyzeOptions {
  /** Practice mode target. When set, grading always uses this raga. */
  forcedRaga?: string;
  /** Skip the input cleanup chain (tests feeding already-clean contours). */
  preCleaned?: boolean;
  /**
   * Streaming use: skip grading the final note of the window. The vivadi
   * grader needs a one-note lookahead, and a note graded without it would be
   * re-graded differently once the window slides — producing two contradictory
   * verdicts for the same note.
   */
  requireLookahead?: boolean;
  recognizer?: RagaRecognizer;
}

export interface AnalyzeResult {
  frames: PitchFrame[];
  notes: NoteEvent[];
  gamakas: GamakaEvent[];
  vivadis: VivadiEvent[];
  phrases: PhraseMatchEvent[];
  posterior: RagaPosterior;
  targetRaga: string;
}

let pid = 0;
export function resetAnalyzeIds(): void {
  pid = 0;
}

/** Does a note sit inside (or immediately adjacent to) a gamaka segment? */
function noteInGamaka(
  note: NoteEvent,
  gamakas: GamakaEvent[],
  tol = 0.03,
): boolean {
  return gamakas.some(
    (g) =>
      g.type !== 'none' &&
      note.tStart >= g.tStart - tol &&
      note.tEnd <= g.tEnd + tol,
  );
}

/**
 * Touch-notes that never become steady notes: the swara a kan flicks through,
 * and the intermediate swaras of a murki. These must be graded too — a kan
 * through a varjya swara is exactly the "permitted embellishment" case.
 */
function touchNotes(
  seg: TransientSegment,
  g: GamakaEvent,
  allowed: SwaraIdx[],
): { swara: SwaraIdx; t: number; durationMs: number }[] {
  if (g.type !== 'kan' && g.type !== 'murki' && g.type !== 'meend') return [];
  const out: { swara: SwaraIdx; t: number; durationMs: number }[] = [];
  // group consecutive contour points by swara and keep the out-of-raga runs
  let runSwara: SwaraIdx | null = null;
  let runStart = 0;
  const flush = (swara: SwaraIdx, t0: number, t1: number) => {
    if (allowed.includes(swara)) return;
    const durationMs = (t1 - t0) * 1000;
    // a swara the contour merely passes through in a frame or two is transit,
    // not an ornament: grading it would bury the real verdicts in noise
    if (durationMs < config.minTouchMs) return;
    out.push({ swara, t: t0, durationMs });
  };
  for (const p of seg.contour) {
    const s = Math.round(p.cents / 100);
    const sw = ((((s % 12) + 12) % 12) as SwaraIdx);
    if (runSwara === null) {
      runSwara = sw;
      runStart = p.t;
    } else if (sw !== runSwara) {
      flush(runSwara, runStart, p.t);
      runSwara = sw;
      runStart = p.t;
    }
  }
  if (runSwara !== null) {
    flush(runSwara, runStart, seg.contour[seg.contour.length - 1].t);
  }
  return out;
}

export function analyze(rawFrames: PitchFrame[], opts: AnalyzeOptions = {}): AnalyzeResult {
  const frames = opts.preCleaned ? rawFrames : cleanTrack(rawFrames);
  const { notes, segments } = segment(frames);

  // --- gamakas: one per transient segment, plus andolan hidden in long notes
  const gamakas: GamakaEvent[] = [];
  for (const seg of segments) {
    if (seg.contour.length < 3) continue;
    const g = classifySegment(seg);
    if (g.type !== 'none') gamakas.push(g);
  }
  for (const n of notes) {
    const contour = frames
      .filter((f) => f.cents !== null && f.t >= n.tStart && f.t <= n.tEnd)
      .map((f) => ({ t: f.t, cents: f.cents as number }));
    const g = detectAndolanInNote(n, contour);
    if (g) gamakas.push(g);
  }
  gamakas.sort((a, b) => a.tStart - b.tStart);

  // --- streaming recognition over the notes in order
  const rec = opts.recognizer ?? new RagaRecognizer({ forcedRaga: opts.forcedRaga });
  if (opts.forcedRaga) rec.force(opts.forcedRaga);
  const phrases: PhraseMatchEvent[] = [];
  let gi = 0;
  for (let i = 0; i < notes.length; i++) {
    // feed any gamaka that completed before this note
    while (gi < gamakas.length && gamakas[gi].tEnd <= notes[i].tStart) {
      rec.feedGamaka(gamakas[gi]);
      gi++;
    }
    const hits = rec.feedNote(notes[i], i > 0 ? notes[i - 1] : undefined);
    // evaluate the posterior per note so the lock-hold timer advances exactly
    // as it does in the live worker
    rec.posterior(notes[i].tEnd);
    for (const h of hits) {
      phrases.push({
        id: 'p' + (pid++).toString(36),
        t: notes[i].tEnd,
        ragaId: h.ragaId,
        pakad: h.pakad,
        swaras: h.swaras,
        editDistance: h.editDistance,
      });
    }
  }
  while (gi < gamakas.length) {
    rec.feedGamaka(gamakas[gi]);
    gi++;
  }

  const tEnd = frames.length ? frames[frames.length - 1].t : 0;
  const posterior = rec.posterior(tEnd);
  const targetRaga = opts.forcedRaga ?? posterior.locked ?? posterior.ranked[0].ragaId;
  const raga = getRaga(targetRaga);

  // --- vivadi grading, one note behind the edge so there is a lookahead
  const vivadis: VivadiEvent[] = [];
  const history: SwaraIdx[] = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    history.push(n.swara);
    const prev = i > 0 ? notes[i - 1] : undefined;
    const next = i + 1 < notes.length ? notes[i + 1] : undefined;
    if (opts.requireLookahead && next === undefined) continue;
    const input = buildInput({
      swara: n.swara,
      t: n.tStart,
      durationMs: (n.tEnd - n.tStart) * 1000,
      isNyas: n.isNyas,
      inGamaka: noteInGamaka(n, gamakas),
      history,
      prevSwara: prev?.swara,
      nextSwara: next?.swara,
      direction: prev ? directionOf(prev, n) : undefined,
    });
    const v = gradeVivadi(raga, input);
    if (v) vivadis.push(v);
  }

  // --- grade ornament touch-notes that never settled into steady notes
  for (const seg of segments) {
    const g = gamakas.find((x) => Math.abs(x.tStart - seg.tStart) < 1e-6);
    if (!g) continue;
    if (opts.requireLookahead && !seg.nextNote) continue;
    for (const tn of touchNotes(seg, g, raga.swaras)) {
      const hist = notes.filter((n) => n.tEnd <= seg.tStart).slice(-5).map((n) => n.swara);
      const input = buildInput({
        swara: tn.swara,
        t: tn.t,
        durationMs: tn.durationMs,
        isNyas: false,
        inGamaka: true,
        history: hist,
        prevSwara: seg.prevNote?.swara,
        nextSwara: seg.nextNote?.swara,
      });
      const v = gradeVivadi(raga, input);
      if (v) vivadis.push(v);
    }
  }
  vivadis.sort((a, b) => a.t - b.t);

  return { frames, notes, gamakas, vivadis, phrases, posterior, targetRaga };
}

export const ALL_RAGA_IDS = RAGAS.map((r) => r.id);
