import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect } from 'react';
import {
  cancelDemoScript,
  runDemoScript,
  setCanvas,
  syncTargetRaga,
  syncTonic,
} from './controller';
import { useStore } from './store';
import { EventFeed } from './ui/EventFeed';
import { Hud } from './ui/Hud';
import { InputMeter } from './ui/InputMeter';
import { Landing } from './ui/Landing';
import { ModeBar } from './ui/ModeBar';
import { TonicCalibrator } from './ui/TonicCalibrator';
import { Scene } from './visual/Scene';

// Recharts is only needed once the report is opened, and it is the single
// largest dependency after three.js — so it is split out of the initial load.
const SessionReport = lazy(() =>
  import('./ui/SessionReport').then((m) => ({ default: m.SessionReport })),
);

export default function App() {
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const scriptStep = useStore((s) => s.scriptStep);
  const tonicHz = useStore((s) => s.tonicHz);
  const mode = useStore((s) => s.mode);
  const practiceRagaId = useStore((s) => s.practiceRagaId);

  // keep the worker's view of the tonic and target raga in step with the UI
  useEffect(() => {
    syncTonic();
  }, [tonicHz]);
  useEffect(() => {
    syncTargetRaga();
  }, [mode, practiceRagaId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      <Canvas
        className="absolute inset-0"
        camera={{ position: [0, 0, 8.2], fov: 45 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
        onCreated={({ gl }) => setCanvas(gl.domElement)}
      >
        <Scene />
      </Canvas>

      {/* live overlay */}
      {phase === 'live' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
          <div className="pointer-events-auto">
            <ModeBar />
          </div>

          <div className="mt-4 flex flex-1 items-start justify-between gap-4 overflow-hidden">
            <div className="hidden w-72 flex-col gap-3 sm:flex">
              <InputMeter />
              <Hud />
            </div>
            <EventFeed />
          </div>

          {/* the tonic panel is the first thing to go when space is tight:
              it is only needed between takes, and the feed must stay readable */}
          <div className="pointer-events-auto mt-3 flex flex-col-reverse items-stretch gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="hidden w-[min(92vw,30rem)] md:block">
              <TonicCalibrator />
            </div>

            <div className="flex justify-end gap-2">
              {scriptStep ? (
                <button
                  onClick={cancelDemoScript}
                  className="rounded-lg border border-gold/60 px-3 py-2 text-xs font-medium text-gold"
                >
                  Stop demo script
                </button>
              ) : (
                <button
                  onClick={() => void runDemoScript()}
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                >
                  Run the 90-second demo script
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* demo-script caption */}
      <AnimatePresence>
        {scriptStep && (
          <motion.div
            key={scriptStep.index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-none absolute left-1/2 top-20 w-[min(92vw,36rem)] -translate-x-1/2 rounded-xl border border-gold/30 bg-black/70 px-4 py-3 text-center backdrop-blur"
          >
            <p className="text-[10px] uppercase tracking-wider text-gold/80">
              step {scriptStep.index + 1} of {scriptStep.total}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">{scriptStep.label}</p>
            <p className="mt-1 text-xs leading-snug text-neutral-300">
              {scriptStep.caption}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'landing' && <Landing />}
      {phase === 'report' && (
        <Suspense
          fallback={
            <div className="absolute inset-0 z-20 grid place-items-center bg-ink/85 text-sm text-neutral-400 backdrop-blur">
              Preparing the report…
            </div>
          }
        >
          <SessionReport />
        </Suspense>
      )}

      {phase !== 'landing' && error && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm text-red-100 backdrop-blur">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white">
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
