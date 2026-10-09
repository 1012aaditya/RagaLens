/*
 * Synthesised tanpura drone: the classic Pa–Sa–Sa–Sa' cycle, each stroke a
 * plucked-string-ish burst of harmonics with a long decay and a touch of
 * jawari shimmer. Retunes live when the tonic changes.
 */

export interface TanpuraHandle {
  start(): void;
  stop(): void;
  setTonic(hz: number): void;
  setGain(v: number): void;
  readonly output: GainNode;
}

const HARMONICS = [1, 2, 3, 4, 5, 6, 8];
const HARMONIC_GAIN = [1, 0.5, 0.33, 0.2, 0.14, 0.1, 0.06];

export function createTanpura(ctx: AudioContext, tonicHz: number): TanpuraHandle {
  const output = ctx.createGain();
  output.gain.value = 0.18;

  const bus = ctx.createGain();
  bus.gain.value = 1;

  // a gentle low-pass keeps the plucks warm rather than buzzy
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.Q.value = 0.4;

  bus.connect(lp).connect(output);

  let tonic = tonicHz;
  let timer: number | null = null;
  let strokeIndex = 0;
  let nextTime = 0;
  const strokeSec = 1.15;

  /** Pa (below Sa), Sa, Sa, Sa' — the standard four-string cycle. */
  function strokeFreq(i: number): number {
    switch (i % 4) {
      case 0:
        return tonic * Math.pow(2, -5 / 12); // Pa of the lower octave
      case 1:
      case 2:
        return tonic;
      default:
        return tonic * 2;
    }
  }

  function pluck(freq: number, at: number): void {
    const voice = ctx.createGain();
    voice.gain.value = 0;
    voice.connect(bus);

    const attack = 0.012;
    const decay = 2.6;
    voice.gain.setValueAtTime(0, at);
    voice.gain.linearRampToValueAtTime(0.5, at + attack);
    voice.gain.exponentialRampToValueAtTime(0.0008, at + decay);

    const oscs: OscillatorNode[] = [];
    HARMONICS.forEach((h, idx) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * h;
      // jawari: the upper partials drift slightly, giving the buzzing bloom
      if (h > 2) {
        o.detune.setValueAtTime(0, at);
        o.detune.linearRampToValueAtTime(h * 2.5, at + decay);
      }
      const g = ctx.createGain();
      g.gain.value = HARMONIC_GAIN[idx] * 0.4;
      o.connect(g).connect(voice);
      o.start(at);
      o.stop(at + decay + 0.1);
      oscs.push(o);
    });
    oscs[oscs.length - 1].onended = () => voice.disconnect();
  }

  function schedule(): void {
    const horizon = ctx.currentTime + 2;
    while (nextTime < horizon) {
      pluck(strokeFreq(strokeIndex), nextTime);
      strokeIndex++;
      nextTime += strokeSec;
    }
  }

  return {
    output,
    start() {
      if (timer !== null) return;
      nextTime = Math.max(nextTime, ctx.currentTime + 0.1);
      schedule();
      timer = window.setInterval(schedule, 700);
    },
    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      nextTime = 0;
      strokeIndex = 0;
    },
    setTonic(hz: number) {
      tonic = hz;
    },
    setGain(v: number) {
      output.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
  };
}
