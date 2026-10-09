import { AnimatePresence, motion } from 'framer-motion';
import { useStore, type FeedItem } from '../store';

const STYLE: Record<string, { ring: string; chip: string }> = {
  mistake: { ring: 'border-red-500/50', chip: 'bg-red-500/20 text-red-300' },
  embellishment: { ring: 'border-amber-400/50', chip: 'bg-amber-400/20 text-amber-200' },
  stylistic: { ring: 'border-violet-400/50', chip: 'bg-violet-400/20 text-violet-200' },
  direction_violation: {
    ring: 'border-orange-400/50',
    chip: 'bg-orange-400/20 text-orange-200',
  },
  gamaka: { ring: 'border-sky-400/40', chip: 'bg-sky-400/15 text-sky-200' },
  phrase: { ring: 'border-emerald-400/40', chip: 'bg-emerald-400/15 text-emerald-200' },
  lock: { ring: 'border-gold/50', chip: 'bg-gold/20 text-gold' },
  nyas: { ring: 'border-white/15', chip: 'bg-white/10 text-neutral-200' },
  system: { ring: 'border-white/10', chip: 'bg-white/5 text-neutral-400' },
};

function styleFor(item: FeedItem) {
  return STYLE[item.cls ?? ''] ?? STYLE[item.kind] ?? STYLE.system;
}

export function EventFeed() {
  const feed = useStore((s) => s.feed);

  return (
    <div className="pointer-events-auto flex w-80 flex-col overflow-hidden rounded-xl border border-white/10 bg-panel backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">
          What the engine heard
        </p>
        <span className="font-mono text-[10px] text-neutral-600">{feed.length}</span>
      </div>

      <div className="max-h-[52vh] space-y-1.5 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {feed.map((item) => {
            const st = styleFor(item);
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className={'rounded-lg border bg-black/30 px-2.5 py-2 ' + st.ring}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={'rounded px-1.5 py-0.5 text-[10px] font-semibold ' + st.chip}
                  >
                    {item.label}
                  </span>
                  {item.severity !== undefined && (
                    <span className="font-mono text-[10px] text-neutral-500">
                      severity {item.severity.toFixed(2)}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-neutral-600">
                    {item.t.toFixed(1)}s
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-neutral-300">
                  {item.reason}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {feed.length === 0 && (
          <p className="px-1 py-6 text-center text-[11px] text-neutral-600">
            Sing, or run the demo voice. Every gamaka and every off-raga note will be
            explained here.
          </p>
        )}
      </div>
    </div>
  );
}
