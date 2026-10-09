/// <reference lib="webworker" />
/*
 * Analysis worker. Receives raw audio frames, tracks pitch with pitchy, and
 * runs the shared `analyze` chain over a rolling window, posting only
 * newly-completed events back to the main thread.
 */

import { PitchDetector } from 'pitchy';
import { analyze } from './analyze';
import { config } from './config';
import { bridgeGaps, gate, MedianSmoother, rms, type RawDetection } from './pitch';
import type { EngineBatch, PitchFrame } from './types';

export type WorkerIn =
  | { type: 'init'; sampleRate: number }
  | { type: 'tonic'; tonicHz: number }
  | { type: 'target'; ragaId: string | null }
  | { type: 'frame'; t: number; samples: Float32Array }
  /** new audio source: clear the analysis window but keep the session clock */
  | { type: 'reset' }
  /** new session: clear everything and restart the clock at zero */
  | { type: 'session' };

export type WorkerOut =
  | { type: 'batch'; batch: EngineBatch }
  | { type: 'ready' };

const WINDOW_SEC = 14;

let detector: PitchDetector<Float32Array> | null = null;
let sampleRate: number = config.sampleRate;
let tonicHz = 220;
let forcedRaga: string | null = null;

const smoother = new MedianSmoother();
let buffer: PitchFrame[] = [];
let pendingFrames: PitchFrame[] = [];
let lastPost = 0;
// The worklet's clock never restarts, so each source rebases on its first
// frame. `sessionBase` carries the elapsed session time forward across source
// changes, which keeps one continuous timeline through the demo script.
let tOrigin: number | null = null;
let sessionBase = 0;
let lastT = 0;
let lastVoicedT = 0;

/**
 * A finished file or synth voice stays connected and keeps feeding silence, and
 * a live singer pauses between phrases. Analysing that silence burns CPU and
 * stretches the session timeline with nothing in it, so posting stops a short
 * way past the last voiced frame and resumes the moment the voice returns.
 */
const SILENCE_IDLE_SEC = 2;

// Input telemetry, accumulated per batch so the UI can distinguish "too quiet"
// from "no clear pitch" from "hearing you fine".
let batchRms = 0;
let batchClarity = 0;
let batchFrames = 0;
let batchVoiced = 0;

function resetBatchStats(): void {
  batchRms = 0;
  batchClarity = 0;
  batchFrames = 0;
  batchVoiced = 0;
}

// Lock state lives here rather than inside the per-window recogniser: a window
// that has slid past the decisive pakad would otherwise unlock and relock.
let lockCandidate: string | null = null;
let lockSince = 0;
let lockedId: string | null = null;

function trackLock(t: number, topId: string, topP: number): string | null {
  if (forcedRaga) return forcedRaga;
  if (topP > config.lockP) {
    if (lockCandidate !== topId) {
      lockCandidate = topId;
      lockSince = t;
    } else if ((t - lockSince) * 1000 >= config.lockHoldMs) {
      lockedId = topId;
    }
  } else {
    lockCandidate = null;
    if (lockedId && topP < config.lockP * 0.6) lockedId = null;
  }
  return lockedId;
}

/*
 * Re-analysing a rolling window means the same musical event is recomputed
 * many times, and its boundaries jitter by a frame or two as the window slides.
 * A plain time watermark therefore re-emits events. Instead, every emitted
 * event is remembered by identity (what it is, not when exactly), and a
 * candidate is suppressed if an event of the same identity was already emitted
 * within DEDUPE_TOL seconds.
 */
const DEDUPE_TOL = 0.2;
/**
 * A pakad keeps matching the trailing window for several notes after it
 * completes, and the recogniser's own "report once per rendition" rule is
 * per-window, so phrases need a far wider suppression window than events tied
 * to a single note.
 */
const PHRASE_DEDUPE_TOL = 2.5;
let emitted = new Map<string, number[]>();

function tolFor(key: string): number {
  return key.startsWith('p:') ? PHRASE_DEDUPE_TOL : DEDUPE_TOL;
}

function alreadyEmitted(key: string, t: number): boolean {
  const times = emitted.get(key);
  if (!times) return false;
  const tol = tolFor(key);
  return times.some((x) => Math.abs(x - t) <= tol);
}

function remember(key: string, t: number): void {
  const times = emitted.get(key);
  if (times) times.push(t);
  else emitted.set(key, [t]);
}

/** Forget identities that have fallen out of the analysis window. */
function pruneEmitted(now: number): void {
  const cutoff = now - WINDOW_SEC - 1;
  for (const [k, times] of emitted) {
    const keep = times.filter((x) => x >= cutoff);
    if (keep.length) emitted.set(k, keep);
    else emitted.delete(k);
  }
}

/** Clear the analysis window for a new source, keeping the session clock. */
function resetState(): void {
  smoother.reset();
  buffer = [];
  pendingFrames = [];
  emitted = new Map();
  lastPost = 0;
  tOrigin = null;
  sessionBase = lastT > 0 ? lastT + 0.25 : 0;
  lastVoicedT = sessionBase;
  // the lock deliberately survives a source change: restarting the audio does
  // not change which raga is being sung. If the new audio really is a
  // different raga, the posterior falls and the lock is released on its own.
}

/** Clear everything, including the session clock. */
function newSession(): void {
  lastT = 0;
  lastVoicedT = 0;
  resetState();
  sessionBase = 0;
  lockCandidate = null;
  lockSince = 0;
  lockedId = null;
}

function ensureDetector(size: number): PitchDetector<Float32Array> {
  if (!detector || detector.inputLength !== size) {
    detector = PitchDetector.forFloat32Array(size);
  }
  return detector;
}

function handleFrame(rawT: number, samples: Float32Array): void {
  if (tOrigin === null) tOrigin = rawT;
  const t = rawT - tOrigin + sessionBase;
  lastT = t;
  const det = ensureDetector(samples.length);
  const [hz, clarity] = det.findPitch(samples, sampleRate);
  const raw: RawDetection = { t, hz, clarity, rms: rms(samples) };
  const gated = gate(raw, tonicHz);
  const smoothed: PitchFrame = {
    ...gated,
    cents: smoother.push(gated.cents),
  };
  batchFrames++;
  batchRms = Math.max(batchRms, raw.rms);
  batchClarity = Math.max(batchClarity, raw.clarity);
  if (smoothed.cents !== null) {
    batchVoiced++;
    lastVoicedT = t;
  }
  buffer.push(smoothed);
  pendingFrames.push(smoothed);

  // trim the rolling window
  const cutoff = t - WINDOW_SEC;
  let drop = 0;
  while (drop < buffer.length && buffer[drop].t < cutoff) drop++;
  if (drop > 0) buffer = buffer.slice(drop);

  if ((t - lastPost) * 1000 >= config.workerPostMs) {
    lastPost = t;
    if (t - lastVoicedT <= SILENCE_IDLE_SEC) {
      post(t);
    } else {
      // Stay idle, but keep reporting the input level: a microphone that is
      // connected yet never passes the gates must still be visible to the user.
      pendingFrames = [];
      postInputOnly();
      resetBatchStats();
    }
  }
}

function post(now: number): void {
  if (!buffer.length) return;
  const r = analyze(bridgeGaps(buffer), {
    forcedRaga: forcedRaga ?? undefined,
    preCleaned: true,
    requireLookahead: true,
  });

  // An event is only emitted once its tail is behind the live edge, so that a
  // note still being sung is not reported as finished.
  const settled = now - 0.08;

  function take<T>(items: T[], at: (x: T) => number, key: (x: T) => string): T[] {
    const out: T[] = [];
    for (const item of items) {
      const t = at(item);
      if (t > settled) continue;
      const k = key(item);
      if (alreadyEmitted(k, t)) continue;
      remember(k, t);
      out.push(item);
    }
    return out;
  }

  const notes = take(
    r.notes,
    (n) => n.tEnd,
    (n) => 'n:' + n.swara + ':' + n.octave,
  );
  const gamakas = take(
    r.gamakas,
    (g) => g.tEnd,
    (g) => 'g:' + g.type + ':' + (g.centerSwara ?? g.fromSwara ?? -1),
  );
  const vivadis = take(
    r.vivadis,
    (v) => v.t,
    // deliberately independent of the verdict class: one note must never be
    // reported twice with two different verdicts
    (v) => 'v:' + v.swara,
  );
  const phrases = take(
    r.phrases,
    (p) => p.t,
    (p) => 'p:' + p.ragaId + ':' + p.pakad,
  );
  pruneEmitted(now);

  if (r.posterior.ranked.length) {
    const top = r.posterior.ranked[0];
    const locked = trackLock(now, top.ragaId, top.p);
    r.posterior = { ...r.posterior, locked: locked ?? undefined };
  }

  const batch: EngineBatch = {
    input: currentInput(),
    frames: pendingFrames,
    notes,
    gamakas,
    vivadis,
    phrases,
    posterior: r.posterior,
  };
  pendingFrames = [];
  resetBatchStats();
  const msg: WorkerOut = { type: 'batch', batch };
  (self as unknown as Worker).postMessage(msg);
}

function currentInput() {
  return {
    rms: batchRms,
    clarity: batchClarity,
    voicedFraction: batchFrames ? batchVoiced / batchFrames : 0,
  };
}

/** Telemetry-only batch, sent while the input is silent or ungated. */
function postInputOnly(): void {
  const batch: EngineBatch = {
    input: currentInput(),
    frames: [],
    notes: [],
    gamakas: [],
    vivadis: [],
    phrases: [],
  };
  (self as unknown as Worker).postMessage({ type: 'batch', batch } satisfies WorkerOut);
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      sampleRate = m.sampleRate;
      newSession();
      (self as unknown as Worker).postMessage({ type: 'ready' } satisfies WorkerOut);
      break;
    case 'tonic':
      tonicHz = m.tonicHz;
      smoother.reset();
      break;
    case 'target':
      forcedRaga = m.ragaId;
      break;
    case 'frame':
      handleFrame(m.t, m.samples);
      break;
    case 'reset':
      resetState();
      break;
    case 'session':
      newSession();
      break;
  }
};
