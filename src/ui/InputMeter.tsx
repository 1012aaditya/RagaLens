import { config } from '../engine/config';
import { useStore } from '../store';

/*
 * Live input diagnostics.
 *
 * The pitch gates reject frames silently, so a dead microphone, an input that
 * is too quiet, and a flawless in-raga performance all render identically: an
 * empty feed. This strip makes the difference visible, and names which gate is
 * rejecting the signal.
 */

type Verdict = {
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'bad' | 'idle';
};

function diagnose(
  running: boolean,
  input: { rms: number; clarity: number; voicedFraction: number } | null,
): Verdict {
  if (!running || !input) {
    return { label: 'idle', detail: 'no input running', tone: 'idle' };
  }
  if (input.rms < config.silenceRms) {
    return {
      label: 'too quiet',
      detail: `level ${input.rms.toFixed(3)} is below the ${config.silenceRms} gate — move closer, or raise the input level in Windows sound settings`,
      tone: 'bad',
    };
  }
  if (input.voicedFraction < 0.15) {
    return {
      label: 'no clear pitch',
      detail: `loud enough, but clarity peaks at ${input.clarity.toFixed(
        2,
      )} against the ${config.clarityMin} gate — sing a sustained vowel, or lower clarityMin`,
      tone: 'warn',
    };
  }
  return {
    label: 'hearing you',
    detail: `${Math.round(input.voicedFraction * 100)}% of frames tracked, clarity ${input.clarity.toFixed(2)}`,
    tone: 'ok',
  };
}

const TONE: Record<Verdict['tone'], { chip: string; bar: string }> = {
  ok: { chip: 'bg-emerald-400/20 text-emerald-200', bar: 'bg-emerald-400' },
  warn: { chip: 'bg-amber-400/20 text-amber-200', bar: 'bg-amber-400' },
  bad: { chip: 'bg-red-500/20 text-red-200', bar: 'bg-red-500' },
  idle: { chip: 'bg-white/10 text-neutral-400', bar: 'bg-white/30' },
};

export function InputMeter() {
  const input = useStore((s) => s.input);
  const running = useStore((s) => s.running);
  const v = diagnose(running, input);
  const tone = TONE[v.tone];

  // RMS is tiny and logarithmic in perception; map it to a readable bar
  const level = input ? Math.min(1, Math.sqrt(input.rms) * 3.2) : 0;
  const gateMark = Math.min(1, Math.sqrt(config.silenceRms) * 3.2);

  return (
    <div className="rounded-xl border border-white/10 bg-panel px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">Input</p>
        <span className={'rounded px-1.5 py-0.5 text-[10px] font-semibold ' + tone.chip}>
          {v.label}
        </span>
      </div>

      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={'h-full rounded-full transition-[width] duration-75 ' + tone.bar}
          style={{ width: `${level * 100}%` }}
        />
        {/* where the silence gate sits, so the bar is interpretable */}
        <div
          className="absolute top-0 h-full w-px bg-white/60"
          style={{ left: `${gateMark * 100}%` }}
          title={`silence gate (${config.silenceRms})`}
        />
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">{v.detail}</p>
    </div>
  );
}
