import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RAGA_BY_ID } from '../data/loadRagas';
import { downloadSessionJson } from '../controller';
import { SWARA_NAMES } from '../engine/swara';
import { useStore } from '../store';
import { VERDICT_COLORS } from '../visual/palettes';

const AXIS = { stroke: '#6b7280', fontSize: 11 };

export function SessionReport() {
  const session = useStore((s) => s.session);
  const targetRagaId = useStore((s) => s.targetRagaId);
  const practiceRagaId = useStore((s) => s.practiceRagaId);
  const setPhase = useStore((s) => s.setPhase);
  const resetSession = useStore((s) => s.resetSession);

  const target = targetRagaId ?? practiceRagaId;
  const stats = session.stats(target);
  const raga = RAGA_BY_ID[target];

  const swaraData = stats.swaraSeconds.map((sec, i) => ({
    swara: SWARA_NAMES[i],
    seconds: Number(sec.toFixed(2)),
    inRaga: raga ? raga.swaras.includes(i as 0) : false,
  }));

  const gamakaData = (
    ['meend', 'kampita', 'andolan', 'murki', 'kan'] as const
  ).map((k) => ({ type: k, count: stats.gamakaCounts[k] }));

  const timeline = stats.confidenceTimeline.map((p) => ({
    t: Number(p.t.toFixed(1)),
    confidence: Number((p.p * 100).toFixed(1)),
  }));

  const verdicts = [
    { key: 'mistake', label: 'Mistakes', n: stats.vivadiCounts.mistake },
    { key: 'embellishment', label: 'Permitted', n: stats.vivadiCounts.embellishment },
    { key: 'stylistic', label: 'Stylistic', n: stats.vivadiCounts.stylistic },
    {
      key: 'direction_violation',
      label: 'Direction',
      n: stats.vivadiCounts.direction_violation,
    },
  ] as const;

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-ink/85 backdrop-blur">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto my-8 w-[min(94vw,68rem)] space-y-5"
      >
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">Session report</h2>
            <p className="text-sm text-neutral-400">
              {raga ? raga.name : 'no raga identified'} ·{' '}
              {stats.durationSec.toFixed(1)} s · {stats.noteCount} notes
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadSessionJson}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
            >
              Export JSON
            </button>
            <button
              onClick={() => {
                resetSession();
                setPhase('live');
              }}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
            >
              Clear and continue
            </button>
            <button
              onClick={() => setPhase('live')}
              className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-ink transition hover:brightness-110"
            >
              Back to the scene
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Time in raga" value={`${Math.round(stats.inRagaFraction * 100)}%`} />
          <Stat label="Pakad matches" value={String(stats.phraseMatches)} />
          {verdicts.map((v) => (
            <Stat
              key={v.key}
              label={v.label}
              value={String(v.n)}
              color={VERDICT_COLORS[v.key]}
            />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Where the voice spent its time" hint="bars outside the raga are red">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={swaraData}>
                <CartesianGrid stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="swara" {...AXIS} />
                <YAxis unit="s" {...AXIS} width={34} />
                <Tooltip
                  contentStyle={{
                    background: '#0d0d16',
                    border: '1px solid #ffffff20',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="seconds" radius={[3, 3, 0, 0]}>
                  {swaraData.map((d, i) => (
                    <Cell key={i} fill={d.inRaga ? '#f0c060' : '#f0484a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Gamakas detected">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gamakaData}>
                <CartesianGrid stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="type" {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} width={28} />
                <Tooltip
                  contentStyle={{
                    background: '#0d0d16',
                    border: '1px solid #ffffff20',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#8aa6ff" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            title="Raga confidence over time"
            hint="the engine revises its belief as you sing"
            className="lg:col-span-2"
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeline}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="t" unit="s" {...AXIS} />
                <YAxis domain={[0, 100]} unit="%" {...AXIS} width={38} />
                <Tooltip
                  contentStyle={{
                    background: '#0d0d16',
                    border: '1px solid #ffffff20',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  stroke="#f0c060"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </section>

        <Panel title="Every verdict, with its reason">
          <div className="max-h-80 overflow-y-auto">
            {session.vivadis.length === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-600">
                Nothing off-raga was detected in this session.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0d0d16] text-neutral-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">t</th>
                    <th className="px-2 py-1.5 font-medium">swara</th>
                    <th className="px-2 py-1.5 font-medium">verdict</th>
                    <th className="px-2 py-1.5 font-medium">sev.</th>
                    <th className="px-2 py-1.5 font-medium">reason</th>
                  </tr>
                </thead>
                <tbody>
                  {session.vivadis.map((v) => (
                    <tr key={v.id} className="border-t border-white/5">
                      <td className="px-2 py-1.5 font-mono text-neutral-500">
                        {v.t.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 font-semibold text-white">
                        {SWARA_NAMES[v.swara]}
                      </td>
                      <td
                        className="px-2 py-1.5 font-medium"
                        style={{ color: VERDICT_COLORS[v.cls] }}
                      >
                        {v.cls.replace('_', ' ')}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-neutral-400">
                        {v.severity.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-neutral-300">{v.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        'rounded-xl border border-white/10 bg-panel p-4 ' + (className ?? '')
      }
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
        {hint && <span className="text-[10px] text-neutral-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
