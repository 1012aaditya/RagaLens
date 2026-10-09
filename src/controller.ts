/*
 * Single owner of the audio engine and of all side-effecting transport actions.
 * React components only read the store and call these functions.
 */

import { AudioEngine } from './audio/audioGraph';
import { DEMO_SCORES, DEMO_SCRIPT } from './engine/demo';
import { calibrateTonic } from './engine/tonic';
import type { PitchFrame } from './engine/types';
import { useStore } from './store';

let engine: AudioEngine | null = null;
let canvas: HTMLCanvasElement | null = null;
let recorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let calibrationBuffer: PitchFrame[] | null = null;
let calibrationTimer: number | null = null;
let scriptRunning = false;

export function setCanvas(c: HTMLCanvasElement | null): void {
  canvas = c;
}

function getEngine(): AudioEngine {
  if (engine) return engine;
  engine = new AudioEngine({
    onBatch(batch) {
      if (calibrationBuffer) calibrationBuffer.push(...batch.frames);
      useStore.getState().ingest(batch);
    },
    onSourceEnded() {
      if (scriptRunning) return;
      useStore.getState().setRunning(false);
      useStore.getState().pushFeed({
        t: useStore.getState().now,
        kind: 'system',
        label: 'Input',
        reason: 'Source finished.',
      });
    },
    onError(message) {
      useStore.getState().setError(message);
    },
  });
  return engine;
}

async function prepare(): Promise<AudioEngine> {
  const e = getEngine();
  await e.init();
  const s = useStore.getState();
  e.setTonic(s.tonicHz);
  e.setTargetRaga(s.mode === 'practice' ? s.practiceRagaId : null);
  return e;
}

export async function startMic(): Promise<void> {
  const s = useStore.getState();
  const e = await prepare();
  s.resetSession();
  e.newSession();
  const ok = await e.useMic();
  if (!ok) {
    // useMic has already reported why; do not claim to be listening
    s.setSourceLabel('no input');
    s.setRunning(false);
    return;
  }
  s.setError(null);
  s.setSourceLabel('live microphone');
  s.setRunning(true);
  s.setPhase('live');
}

export async function startDemo(ragaId: string): Promise<void> {
  const s = useStore.getState();
  const score = DEMO_SCORES[ragaId];
  if (!score) {
    s.setError(`No demo passage for ${ragaId}.`);
    return;
  }
  const e = await prepare();
  s.resetSession();
  e.newSession();
  await e.useSynth(score, s.tonicHz);
  s.setSourceLabel(`synthetic singer — ${ragaId}`);
  s.setRunning(true);
  s.setPhase('live');
}

export async function startFile(src: string | File): Promise<void> {
  const s = useStore.getState();
  const e = await prepare();
  s.resetSession();
  e.newSession();
  await e.useFile(src);
  s.setSourceLabel(typeof src === 'string' ? src.split('/').pop() ?? 'demo clip' : src.name);
  s.setRunning(true);
  s.setPhase('live');
}

export function stopInput(): void {
  engine?.stopSource();
  useStore.getState().setRunning(false);
}

export function setTonicHz(hz: number): void {
  useStore.getState().setTonicHz(hz);
  engine?.setTonic(hz);
}

export function syncTonic(): void {
  engine?.setTonic(useStore.getState().tonicHz);
}

export function syncTargetRaga(): void {
  const s = useStore.getState();
  engine?.setTargetRaga(s.mode === 'practice' ? s.practiceRagaId : null);
}

export function toggleDrone(on: boolean): void {
  const e = getEngine();
  void e.init().then(() => {
    e.setTonic(useStore.getState().tonicHz);
    if (on) e.tanpura?.start();
    else e.tanpura?.stop();
    useStore.getState().setDrone(on);
  });
}

/** "Sing Sa for 3 seconds": collect confident frames, take the median. */
export async function calibrate(seconds = 3): Promise<void> {
  const s = useStore.getState();
  const e = await prepare();
  if (e.sourceKind !== 'mic') await e.useMic();
  calibrationBuffer = [];
  s.setCalibrating(true, `Sing Sa and hold it for ${seconds} seconds…`);
  if (calibrationTimer !== null) window.clearTimeout(calibrationTimer);
  calibrationTimer = window.setTimeout(() => {
    const frames = calibrationBuffer ?? [];
    calibrationBuffer = null;
    const result = calibrateTonic(frames);
    if (result.tonicHz) setTonicHz(result.tonicHz);
    useStore.getState().setCalibrating(false, result.message);
  }, seconds * 1000);
}

export function cancelCalibration(): void {
  if (calibrationTimer !== null) window.clearTimeout(calibrationTimer);
  calibrationTimer = null;
  calibrationBuffer = null;
  useStore.getState().setCalibrating(false, '');
}

export interface RecordingResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

let lastRecording: RecordingResult | null = null;
export function getLastRecording(): RecordingResult | null {
  return lastRecording;
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

/** Record the scene + audio to a .webm reel. */
export function startRecording(maxSeconds = 15): void {
  const s = useStore.getState();
  if (!canvas) {
    s.setError('The scene is not ready to record yet.');
    return;
  }
  const stream = getEngine().recordingStream(canvas);
  if (!stream) {
    s.setError('Recording is unavailable in this browser.');
    return;
  }
  const mimeType = pickMime();
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (err) {
    s.setError('Recording failed: ' + (err instanceof Error ? err.message : String(err)));
    return;
  }
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
    if (lastRecording) URL.revokeObjectURL(lastRecording.url);
    lastRecording = {
      url: URL.createObjectURL(blob),
      mimeType: blob.type,
      sizeBytes: blob.size,
    };
    useStore.getState().setRecording(false);
    useStore.getState().pushFeed({
      t: useStore.getState().now,
      kind: 'system',
      label: 'Reel',
      reason: `Recorded ${(blob.size / 1_000_000).toFixed(1)} MB — ready to download.`,
    });
  };
  recorder.start();
  s.setRecording(true);
  window.setTimeout(() => stopRecording(), maxSeconds * 1000);
}

export function stopRecording(): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
}

export function downloadSessionJson(): void {
  const s = useStore.getState();
  const data = s.session.toJSON(s.targetRagaId ?? s.practiceRagaId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ragalens-session.json';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function disposeEngine(): void {
  engine?.dispose();
  engine = null;
}

/* ---------------------------------------------------------------------------
 * The scripted demo: runs the five steps of the pitch in order, switching mode
 * and target raga between them, so the novelty moment lands without a singer.
 * ------------------------------------------------------------------------- */

let scriptTimer: number | null = null;
let scriptCancelled = false;

export async function runDemoScript(): Promise<void> {
  const s = useStore.getState();
  scriptCancelled = false;
  scriptRunning = true;
  const e = await prepare();
  s.resetSession();
  e.newSession();
  s.setPhase('live');
  e.tanpura?.start();
  s.setDrone(true);

  for (let i = 0; i < DEMO_SCRIPT.length; i++) {
    if (scriptCancelled) break;
    const step = DEMO_SCRIPT[i];
    const st = useStore.getState();
    st.setMode(step.mode);
    if (step.mode === 'practice') st.setPracticeRaga(step.ragaId);
    syncTargetRaga();
    st.setScriptStep({ index: i, total: DEMO_SCRIPT.length, ...step });
    st.setSourceLabel(`demo script — ${step.label}`);
    st.setRunning(true);

    const dur = await e.useSynth(step.score, useStore.getState().tonicHz);
    await wait((dur + 0.9) * 1000);
  }

  scriptRunning = false;
  if (!scriptCancelled) {
    const st = useStore.getState();
    st.setRunning(false);
    st.setScriptStep(null);
    st.pushFeed({
      t: st.now,
      kind: 'system',
      label: 'Demo',
      reason: 'Script finished — open the session report to see every verdict.',
    });
  }
}

export function cancelDemoScript(): void {
  scriptCancelled = true;
  scriptRunning = false;
  if (scriptTimer !== null) window.clearTimeout(scriptTimer);
  scriptTimer = null;
  stopInput();
  useStore.getState().setScriptStep(null);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    scriptTimer = window.setTimeout(resolve, ms);
  });
}
