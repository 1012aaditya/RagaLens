import { config } from './config';
import { centsToSwara, distanceToSwaraCentre } from './swara';
import type { NoteEvent, PitchFrame, SwaraIdx } from './types';

export interface TransientSegment {
  id: string;
  tStart: number;
  tEnd: number;
  /** cents track of the segment, nulls removed */
  contour: { t: number; cents: number }[];
  prevNote?: NoteEvent;
  nextNote?: NoteEvent;
}

export interface Segmentation {
  notes: NoteEvent[];
  segments: TransientSegment[];
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

/**
 * Classify each frame as steady or transient using a window of config.windowMs
 * centred on it. Steady requires both low pitch deviation and proximity to a
 * swara centre.
 */
export function steadyMask(frames: PitchFrame[]): boolean[] {
  const halfWin = config.windowMs / 2000;
  const mask: boolean[] = new Array(frames.length).fill(false);
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].cents === null) continue;
    const vals: number[] = [];
    for (let k = i; k >= 0 && frames[i].t - frames[k].t <= halfWin; k--) {
      if (frames[k].cents === null) break;
      vals.push(frames[k].cents as number);
    }
    for (let k = i + 1; k < frames.length && frames[k].t - frames[i].t <= halfWin; k++) {
      if (frames[k].cents === null) break;
      vals.push(frames[k].cents as number);
    }
    if (vals.length < 3) continue;
    mask[i] =
      std(vals) < config.stableStdCents &&
      distanceToSwaraCentre(mean(vals)) < config.stableBandCents;
  }
  return mask;
}

let uid = 0;
function nextId(prefix: string): string {
  return prefix + (uid++).toString(36);
}

/** Reset the internal id counter (tests only). */
export function resetSegmenterIds(): void {
  uid = 0;
}

interface Run {
  from: number;
  to: number;
  steady: boolean;
}

function runSwara(frames: PitchFrame[], r: Run): SwaraIdx | -1 {
  const vals: number[] = [];
  for (let k = r.from; k <= r.to; k++) {
    const c = frames[k].cents;
    if (c !== null) vals.push(c);
  }
  if (!vals.length) return -1;
  return centsToSwara(mean(vals)).swara;
}

function durMs(frames: PitchFrame[], r: Run): number {
  return (frames[r.to].t - frames[r.from].t) * 1000;
}

/**
 * Split a cleaned pitch track into steady NoteEvents and the transient spans
 * between them. Anything voiced that is not part of a qualifying steady note —
 * including the brief "steady-looking" plateaux at the turning points of a
 * kampita — is folded into the surrounding transient segment, so an
 * oscillation reaches the gamaka classifier whole rather than in slivers.
 */
export function segment(frames: PitchFrame[]): Segmentation {
  const mask = steadyMask(frames);

  // 1. raw runs of equal classification over voiced frames
  const runs: Run[] = [];
  let i = 0;
  while (i < frames.length) {
    if (frames[i].cents === null) {
      while (i < frames.length && frames[i].cents === null) i++;
      continue;
    }
    const s = mask[i];
    const from = i;
    while (i < frames.length && frames[i].cents !== null && mask[i] === s) i++;
    runs.push({ from, to: i - 1, steady: s });
  }

  // 2. merge adjacent steady runs on the same swara
  const merged: Run[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.steady &&
      r.steady &&
      prev.to + 1 === r.from &&
      runSwara(frames, prev) === runSwara(frames, r)
    ) {
      prev.to = r.to;
    } else {
      merged.push({ ...r });
    }
  }

  // 3. steady runs long enough become notes; mark their frames
  const isNoteFrame = new Array<boolean>(frames.length).fill(false);
  const notes: NoteEvent[] = [];
  for (const r of merged) {
    if (!r.steady || durMs(frames, r) < config.minNoteMs) continue;
    const vals: number[] = [];
    for (let k = r.from; k <= r.to; k++) {
      const c = frames[k].cents;
      if (c !== null) vals.push(c);
      isNoteFrame[k] = true;
    }
    if (!vals.length) continue;
    const m = mean(vals);
    const { swara, octave } = centsToSwara(m);
    notes.push({
      id: nextId('n'),
      swara,
      octave,
      tStart: frames[r.from].t,
      tEnd: frames[r.to].t,
      meanCents: m,
      stability: std(vals),
      isNyas: durMs(frames, r) >= config.nyasMs,
    });
  }

  // 4. every maximal voiced span that is not a note becomes one transient segment
  const segments: TransientSegment[] = [];
  let j = 0;
  while (j < frames.length) {
    if (frames[j].cents === null || isNoteFrame[j]) {
      j++;
      continue;
    }
    const from = j;
    while (j < frames.length && frames[j].cents !== null && !isNoteFrame[j]) j++;
    const to = j - 1;
    const contour: { t: number; cents: number }[] = [];
    for (let k = from; k <= to; k++) {
      contour.push({ t: frames[k].t, cents: frames[k].cents as number });
    }
    if (contour.length < 2) continue;
    segments.push({
      id: nextId('s'),
      tStart: frames[from].t,
      tEnd: frames[to].t,
      contour,
    });
  }

  // 5. attach neighbouring notes
  for (const s of segments) {
    s.prevNote = [...notes].reverse().find((n) => n.tEnd <= s.tStart + 1e-9);
    s.nextNote = notes.find((n) => n.tStart >= s.tEnd - 1e-9);
  }

  return { notes, segments };
}
