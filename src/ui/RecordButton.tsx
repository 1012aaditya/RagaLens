import { getLastRecording, startRecording, stopRecording } from '../controller';
import { useStore } from '../store';

export function RecordButton() {
  const recording = useStore((s) => s.recording);
  const last = getLastRecording();

  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={() => (recording ? stopRecording() : startRecording(15))}
        className={
          'rounded-md border px-3 py-1.5 text-xs transition ' +
          (recording
            ? 'border-red-400/70 bg-red-500/20 text-red-200'
            : 'border-white/20 text-white hover:bg-white/10')
        }
      >
        {recording ? 'Recording — stop' : 'Record 15 s reel'}
      </button>
      {!recording && last && (
        <a
          href={last.url}
          download="ragalens-reel.webm"
          className="rounded-md border border-gold/60 px-2.5 py-1.5 text-xs text-gold transition hover:bg-gold/10"
        >
          Download reel
        </a>
      )}
    </span>
  );
}
