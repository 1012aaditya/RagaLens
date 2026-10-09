import { AnimatePresence, motion } from 'framer-motion';
import { RAGA_BY_ID } from '../data/loadRagas';
import { centsToSwara, SWARA_LONG_NAMES, SWARA_NAMES } from '../engine/swara';
import { useStore } from '../store';

const GAMAKA_LIFE = 2.2;

export function Hud() {
  const posterior = useStore((s) => s.posterior);
  const locked = useStore((s) => s.lockedRagaId);
  const mode = useStore((s) => s.mode);
  const practiceRagaId = useStore((s) => s.practiceRagaId);
  const currentCents = useStore((s) => s.currentCents);
  const gamakas = useStore((s) => s.gamakas);
  const now = useStore((s) => s.now);

  const shownId = mode === 'practice' ? practiceRagaId : locked ?? posterior?.ranked[0].ragaId;
  const raga = shownId ? RAGA_BY_ID[shownId] : undefined;
  const top5 = posterior?.ranked.slice(0, 5) ?? [];

  const swara = currentCents === null ? null : centsToSwara(currentCents);
  const inRaga = raga && swara ? raga.swaras.includes(swara.swara) : false;

  const lastGamaka = gamakas[gamakas.length - 1];
  const gamakaFresh = lastGamaka && now - lastGamaka.tEnd < GAMAKA_LIFE;

  return (
    <div className="pointer-events-none flex w-72 flex-col gap-3">
      {/* current swara */}
      <div className="rounded-xl border border-white/10 bg-panel px-4 py-3 backdrop-blur">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">Singing</p>
        {swara ? (
          <div className="flex items-baseline gap-2">
            <span
              className={
                'text-3xl font-semibold ' + (inRaga ? 'text-white' : 'text-red-400')
              }
            >
              {SWARA_NAMES[swara.swara]}
              {swara.octave > 0 ? '′' : swara.octave < 0 ? '.' : ''}
            </span>
            <span className="text-xs text-neutral-400">
              {SWARA_LONG_NAMES[swara.swara]}
            </span>
            <span className="ml-auto font-mono text-[11px] text-neutral-500">
              {swara.deviation > 0 ? '+' : ''}
              {Math.round(swara.deviation)}¢
            </span>
          </div>
        ) : (
          <p className="text-2xl font-light text-neutral-600">—</p>
        )}

        <div className="mt-2 h-5">
          <AnimatePresence mode="wait">
            {gamakaFresh && (
              <motion.div
                key={lastGamaka.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 text-xs"
              >
                <span className="rounded bg-gold/20 px-1.5 py-0.5 font-medium capitalize text-gold">
                  {lastGamaka.type}
                </span>
                <span className="truncate text-neutral-400">
                  {Math.round(lastGamaka.confidence * 100)}% confident
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* raga identification */}
      <div className="rounded-xl border border-white/10 bg-panel px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            {mode === 'practice' ? 'Practising' : locked ? 'Locked onto' : 'Listening for'}
          </p>
          {locked && mode === 'explore' && (
            <span className="rounded bg-gold/20 px-1.5 text-[10px] font-medium text-gold">
              locked
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xl font-semibold text-white">
          {raga ? raga.name : '—'}
        </p>

        {raga && (
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {raga.thaat} thaat · vadi {SWARA_NAMES[raga.vadi]} / samvadi{' '}
            {SWARA_NAMES[raga.samvadi]} · {raga.samay} · {raga.rasa}
          </p>
        )}

        {mode === 'explore' && top5.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {top5.map((r) => (
              <div key={r.ragaId} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-neutral-300">
                  {RAGA_BY_ID[r.ragaId]?.name ?? r.ragaId}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className={
                      'h-full rounded-full ' +
                      (r.ragaId === shownId ? 'bg-gold' : 'bg-white/35')
                    }
                    animate={{ width: `${Math.round(r.p * 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[10px] text-neutral-500">
                  {Math.round(r.p * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
