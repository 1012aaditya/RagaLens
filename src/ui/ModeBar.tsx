import { RAGAS } from '../data/loadRagas';
import {
  startDemo,
  startMic,
  stopInput,
  syncTargetRaga,
  toggleDrone,
} from '../controller';
import { useStore } from '../store';
import { RecordButton } from './RecordButton';

export function ModeBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const practiceRagaId = useStore((s) => s.practiceRagaId);
  const setPracticeRaga = useStore((s) => s.setPracticeRaga);
  const running = useStore((s) => s.running);
  const sourceLabel = useStore((s) => s.sourceLabel);
  const droneOn = useStore((s) => s.droneOn);
  const setPhase = useStore((s) => s.setPhase);

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-panel px-3 py-2 backdrop-blur">
      <div className="flex overflow-hidden rounded-lg border border-white/15">
        {(['explore', 'practice'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              syncTargetRaga();
            }}
            className={
              'px-3 py-1.5 text-xs font-medium capitalize transition ' +
              (mode === m ? 'bg-gold text-ink' : 'text-neutral-300 hover:bg-white/10')
            }
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'practice' && (
        <select
          value={practiceRagaId}
          onChange={(e) => {
            setPracticeRaga(e.target.value);
            syncTargetRaga();
          }}
          className="rounded-md border border-white/15 bg-black/50 px-2 py-1.5 text-xs text-white outline-none focus:border-gold/70"
        >
          {RAGAS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}

      <span className="mx-1 h-5 w-px bg-white/15" />

      {running ? (
        <button
          onClick={stopInput}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={() => void startMic()}
          className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-ink transition hover:brightness-110"
        >
          Sing
        </button>
      )}

      <button
        onClick={() => void startDemo(mode === 'practice' ? practiceRagaId : 'bhupali')}
        className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
      >
        Demo voice
      </button>

      <button
        onClick={() => toggleDrone(!droneOn)}
        className={
          'rounded-md border px-3 py-1.5 text-xs transition ' +
          (droneOn
            ? 'border-gold/70 text-gold'
            : 'border-white/20 text-white hover:bg-white/10')
        }
      >
        Tanpura
      </button>

      <RecordButton />

      <button
        onClick={() => setPhase('report')}
        className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
      >
        Session report
      </button>

      <span className="ml-auto truncate pl-2 text-[11px] text-neutral-500">
        {running ? 'listening — ' : 'idle — '}
        {sourceLabel}
      </span>
    </div>
  );
}
