import { calibrate, cancelCalibration, syncTonic } from '../controller';
import {
  nearestNoteName,
  TONIC_CHOICES_FEMALE,
  TONIC_CHOICES_MALE,
} from '../engine/tonic';
import { useStore } from '../store';

const ALL_CHOICES = Array.from(
  new Set([...TONIC_CHOICES_MALE, ...TONIC_CHOICES_FEMALE]),
);

export function TonicCalibrator() {
  const tonicNote = useStore((s) => s.tonicNote);
  const fineTune = useStore((s) => s.fineTuneCents);
  const tonicHz = useStore((s) => s.tonicHz);
  const calibrating = useStore((s) => s.calibrating);
  const message = useStore((s) => s.calibrationMessage);
  const setTonicNote = useStore((s) => s.setTonicNote);
  const setFineTune = useStore((s) => s.setFineTune);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-neutral-500">Your Sa</p>
        <p className="font-mono text-xs text-gold">
          {tonicHz.toFixed(1)} Hz · {nearestNoteName(tonicHz)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={tonicNote}
          onChange={(e) => {
            setTonicNote(e.target.value);
            syncTonic();
          }}
          className="rounded-md border border-white/15 bg-black/50 px-2 py-1.5 text-sm text-white outline-none focus:border-gold/70"
        >
          {ALL_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <label className="flex flex-1 items-center gap-2 text-xs text-neutral-400">
          fine tune
          <input
            type="range"
            min={-50}
            max={50}
            step={1}
            value={fineTune}
            onChange={(e) => {
              setFineTune(Number(e.target.value));
              syncTonic();
            }}
            className="h-1 flex-1 accent-gold"
          />
          <span className="w-12 text-right font-mono text-neutral-300">
            {fineTune > 0 ? '+' : ''}
            {fineTune}¢
          </span>
        </label>

        {calibrating ? (
          <button
            onClick={cancelCalibration}
            className="rounded-md border border-gold/60 px-3 py-1.5 text-xs font-medium text-gold"
          >
            listening… cancel
          </button>
        ) : (
          <button
            onClick={() => void calibrate(3)}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            Sing Sa to calibrate
          </button>
        )}
      </div>

      {message && <p className="mt-2 text-xs text-neutral-400">{message}</p>}
    </div>
  );
}
