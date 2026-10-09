import { motion } from 'framer-motion';
import { useRef } from 'react';
import { RAGAS } from '../data/loadRagas';
import { startDemo, startFile, startMic, toggleDrone } from '../controller';
import { useStore } from '../store';
import { TonicCalibrator } from './TonicCalibrator';

const CLAIM =
  'Real-time gamaka classification and context-graded vivadi grading from live vocals, rendered as raga structure rather than audio energy.';

export function Landing() {
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-ink/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="m-auto w-[min(92vw,56rem)] rounded-2xl border border-white/10 bg-panel p-8 shadow-2xl"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-white">RagaLens</h1>
          <span className="text-sm text-gold">raga structure, made visible</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-300">{CLAIM}</p>

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <TonicCalibrator />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void startMic()}
                className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
              >
                Sing live
              </button>
              <button
                onClick={() => void startDemo('bhupali')}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Run the demo voice
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Load an audio file
              </button>
              <button
                onClick={() => toggleDrone(true)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Start tanpura
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void startFile(f);
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                Or hear a synthetic singer in
              </p>
              <div className="flex flex-wrap gap-1.5">
                {RAGAS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => void startDemo(r.id)}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-gold/60 hover:text-gold"
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="max-w-xs space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-neutral-400">
            <p className="font-semibold text-neutral-200">What makes this different</p>
            <p>
              Existing tools mark an off-raga note as right or wrong. RagaLens decides
              whether it is a mistake, a permitted kan, a conventional borrowing, or a
              light-classical liberty — and tells you which, live.
            </p>
            <p className="text-neutral-500">
              Everything runs in the browser. No account, no server, no recording leaves
              this machine.
            </p>
            <p className="text-amber-500/80">
              Musical data is provisional and awaiting review by a musician.
            </p>
          </aside>
        </div>

        {error && (
          <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white">
              dismiss
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
