/*
 * Audio graph owner: one AudioContext, one capture worklet, one analysis
 * worker. Sources (mic, demo file, synthetic singer) are swapped in and out of
 * the same analysis tap, so everything downstream is source-agnostic.
 */

import { createTanpura, type TanpuraHandle } from './tanpura';
import { playScore, type SynthSingerHandle } from './synthSinger';
import type { Score } from '../engine/contour';
import type { EngineBatch } from '../engine/types';
import type { WorkerIn, WorkerOut } from '../engine/worker';

export type SourceKind = 'none' | 'mic' | 'file' | 'synth';

export interface AudioEngineCallbacks {
  onBatch(batch: EngineBatch): void;
  onSourceEnded?(): void;
  onError?(message: string): void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private tap: GainNode | null = null;
  private monitor: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private current: { kind: SourceKind; disconnect(): void } | null = null;
  private micStream: MediaStream | null = null;
  tanpura: TanpuraHandle | null = null;
  sourceKind: SourceKind = 'none';

  constructor(private cb: AudioEngineCallbacks) {}

  get ready(): boolean {
    return this.ctx !== null && this.worklet !== null;
  }

  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    // the worklet module is a static asset (see public/ragalens-capture.js)
    await ctx.audioWorklet.addModule(
      new URL('ragalens-capture.js', document.baseURI).toString(),
    );
    this.ctx = ctx;

    this.tap = ctx.createGain();
    this.tap.gain.value = 1;

    // monitoring is off by default: hearing your own mic through the speakers
    // invites feedback
    this.monitor = ctx.createGain();
    this.monitor.gain.value = 0;
    this.monitor.connect(ctx.destination);

    this.recordDest = ctx.createMediaStreamDestination();

    this.worklet = new AudioWorkletNode(ctx, 'ragalens-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    // the worklet produces no audio; keep it alive with a zero-gain sink
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.worklet.connect(sink).connect(ctx.destination);

    this.tap.connect(this.worklet);
    this.tap.connect(this.monitor);
    this.tap.connect(this.recordDest);

    this.worker = new Worker(new URL('../engine/worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'batch') this.cb.onBatch(e.data.batch);
    };
    this.send({ type: 'init', sampleRate: ctx.sampleRate });

    this.worklet.port.onmessage = (
      e: MessageEvent<{ t: number; samples: Float32Array }>,
    ) => {
      const { t, samples } = e.data;
      this.worker?.postMessage({ type: 'frame', t, samples } satisfies WorkerIn, [
        samples.buffer,
      ]);
    };

    this.tanpura = createTanpura(ctx, 220);
    this.tanpura.output.connect(ctx.destination);
    this.tanpura.output.connect(this.recordDest);
  }

  private send(m: WorkerIn): void {
    this.worker?.postMessage(m);
  }

  setTonic(hz: number): void {
    this.send({ type: 'tonic', tonicHz: hz });
    this.tanpura?.setTonic(hz);
  }

  setTargetRaga(ragaId: string | null): void {
    this.send({ type: 'target', ragaId });
  }

  resetAnalysis(): void {
    this.send({ type: 'reset' });
  }

  /** Clear the analysis window and restart the session clock at zero. */
  newSession(): void {
    this.send({ type: 'session' });
  }

  setMonitor(on: boolean): void {
    if (!this.ctx || !this.monitor) return;
    this.monitor.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.02);
  }

  private swap(kind: SourceKind, node: AudioNode, cleanup?: () => void): void {
    this.stopSource();
    node.connect(this.tap as GainNode);
    this.current = {
      kind,
      disconnect: () => {
        try {
          node.disconnect();
        } catch {
          /* already gone */
        }
        cleanup?.();
      },
    };
    this.sourceKind = kind;
    this.resetAnalysis();
  }

  stopSource(): void {
    // Track-stopping belongs to the source's own cleanup closure, never here.
    // stopSource() runs at the *start* of swap(), so anything it tears down by
    // field reference can be a resource the incoming source just acquired.
    this.current?.disconnect();
    this.current = null;
    this.sourceKind = 'none';
  }

  async useMic(): Promise<boolean> {
    await this.init();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const src = (this.ctx as AudioContext).createMediaStreamSource(stream);
      // swap() first: it tears down the previous source, and only afterwards
      // does this stream become ours to hold and eventually stop.
      this.swap('mic', src, () => {
        for (const t of stream.getTracks()) t.stop();
        if (this.micStream === stream) this.micStream = null;
      });
      this.micStream = stream;
      // the mic must not be monitored back out through the speakers
      this.setMonitor(false);
      return true;
    } catch (err) {
      this.cb.onError?.(
        'Microphone unavailable: ' + (err instanceof Error ? err.message : String(err)),
      );
      return false;
    }
  }

  /** Play a demo clip (URL or File) through the analyser. */
  async useFile(src: string | File): Promise<void> {
    await this.init();
    const ctx = this.ctx as AudioContext;
    try {
      const data =
        typeof src === 'string'
          ? await (await fetch(src)).arrayBuffer()
          : await src.arrayBuffer();
      const buf = await ctx.decodeAudioData(data);
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.onended = () => this.cb.onSourceEnded?.();
      this.swap('file', node);
      this.setMonitor(true);
      node.start();
    } catch (err) {
      this.cb.onError?.(
        'Could not load that audio: ' + (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /** Render a score with the synthetic singer and analyse it live. */
  async useSynth(score: Score, tonicHz: number): Promise<number> {
    await this.init();
    const ctx = this.ctx as AudioContext;
    const handle: SynthSingerHandle = playScore(
      ctx,
      score,
      ctx.currentTime + 0.08,
      tonicHz,
    );
    handle.onended = () => this.cb.onSourceEnded?.();
    this.swap('synth', handle.output, () => {
      // a voice swapped out mid-phrase has not "finished"; silence its callback
      // before stopping it, or every demo-script step reports an ending
      handle.onended = undefined;
      handle.stop();
    });
    this.setMonitor(true);
    return handle.durationSec;
  }

  /** Combined canvas + audio stream for the reel export. */
  recordingStream(canvas: HTMLCanvasElement, fps = 30): MediaStream | null {
    if (!this.recordDest) return null;
    const video = canvas.captureStream(fps);
    const out = new MediaStream();
    for (const t of video.getVideoTracks()) out.addTrack(t);
    for (const t of this.recordDest.stream.getAudioTracks()) out.addTrack(t);
    return out;
  }

  dispose(): void {
    this.stopSource();
    this.tanpura?.stop();
    this.worker?.terminate();
    this.worker = null;
    void this.ctx?.close();
    this.ctx = null;
    this.worklet = null;
  }
}
