import { create } from 'zustand';
import { RAGA_BY_ID } from './data/loadRagas';
import { config } from './engine/config';
import { SessionLog } from './engine/session';
import { applyFineTune, tonicChoiceHz } from './engine/tonic';
import type {
  EngineBatch,
  InputLevel,
  GamakaEvent,
  NoteEvent,
  PhraseMatchEvent,
  RagaPosterior,
  VivadiEvent,
} from './engine/types';

export type Phase = 'landing' | 'live' | 'report';
export type Mode = 'explore' | 'practice';

export interface TrailPoint {
  t: number;
  cents: number;
  conf: number;
}

export type FeedKind = 'gamaka' | 'vivadi' | 'phrase' | 'lock' | 'nyas' | 'system';

export interface ScriptStep {
  index: number;
  total: number;
  label: string;
  caption: string;
}

export interface FeedItem {
  id: string;
  t: number;
  kind: FeedKind;
  label: string;
  reason: string;
  severity?: number;
  cls?: string;
}

const TRAIL_CAP = 1400;
const FEED_CAP = 60;
const EVENT_CAP = 120;

interface State {
  phase: Phase;
  mode: Mode;

  // tonic
  tonicNote: string;
  fineTuneCents: number;
  tonicHz: number;
  calibrating: boolean;
  calibrationMessage: string;

  // raga
  practiceRagaId: string;
  posterior: RagaPosterior | null;
  lockedRagaId: string | null;
  /** the raga the grader is judging against right now */
  targetRagaId: string | null;

  // live data
  input: InputLevel | null;
  now: number;
  trail: TrailPoint[];
  currentCents: number | null;
  notes: NoteEvent[];
  gamakas: GamakaEvent[];
  vivadis: VivadiEvent[];
  phrases: PhraseMatchEvent[];
  feed: FeedItem[];

  // transport
  sourceLabel: string;
  running: boolean;
  recording: boolean;
  droneOn: boolean;
  error: string | null;

  scriptStep: ScriptStep | null;

  session: SessionLog;

  // actions
  setPhase(p: Phase): void;
  setMode(m: Mode): void;
  setPracticeRaga(id: string): void;
  setTonicNote(n: string): void;
  setFineTune(c: number): void;
  setTonicHz(hz: number): void;
  setCalibrating(v: boolean, message?: string): void;
  setSourceLabel(s: string): void;
  setRunning(v: boolean): void;
  setRecording(v: boolean): void;
  setDrone(v: boolean): void;
  setError(e: string | null): void;
  setScriptStep(step: ScriptStep | null): void;
  ingest(batch: EngineBatch): void;
  pushFeed(item: Omit<FeedItem, 'id'>): void;
  resetSession(): void;
}

const GAMAKA_LABEL: Record<string, string> = {
  meend: 'Meend',
  kampita: 'Kampita',
  andolan: 'Andolan',
  murki: 'Murki',
  kan: 'Kan',
  none: '—',
};

const VIVADI_LABEL: Record<string, string> = {
  mistake: 'Off-raga',
  embellishment: 'Permitted',
  stylistic: 'Stylistic',
  direction_violation: 'Direction',
};

const ragaName = (id: string) => RAGA_BY_ID[id]?.name ?? id;

let feedId = 0;

export const useStore = create<State>((set, get) => ({
  phase: 'landing',
  mode: 'explore',

  tonicNote: 'C3',
  fineTuneCents: 0,
  tonicHz: tonicChoiceHz('C3'),
  calibrating: false,
  calibrationMessage: '',

  practiceRagaId: 'bhupali',
  posterior: null,
  lockedRagaId: null,
  targetRagaId: null,

  input: null,
  now: 0,
  trail: [],
  currentCents: null,
  notes: [],
  gamakas: [],
  vivadis: [],
  phrases: [],
  feed: [],

  sourceLabel: 'no input',
  running: false,
  recording: false,
  droneOn: false,
  error: null,

  scriptStep: null,

  session: new SessionLog(),

  setPhase: (p) => set({ phase: p }),
  setMode: (m) => set({ mode: m }),
  setPracticeRaga: (id) => set({ practiceRagaId: id }),

  setTonicNote: (n) => {
    const base = tonicChoiceHz(n);
    set({ tonicNote: n, tonicHz: applyFineTune(base, get().fineTuneCents) });
  },
  setFineTune: (c) => {
    const base = tonicChoiceHz(get().tonicNote);
    set({ fineTuneCents: c, tonicHz: applyFineTune(base, c) });
  },
  setTonicHz: (hz) => set({ tonicHz: hz }),
  setCalibrating: (v, message) =>
    set({ calibrating: v, ...(message !== undefined ? { calibrationMessage: message } : {}) }),

  setSourceLabel: (s) => set({ sourceLabel: s }),
  setRunning: (v) => set({ running: v }),
  setRecording: (v) => set({ recording: v }),
  setDrone: (v) => set({ droneOn: v }),
  setError: (e) => set({ error: e }),
  setScriptStep: (step) => set({ scriptStep: step }),

  pushFeed: (item) =>
    set((s) => ({
      feed: [{ id: 'f' + feedId++, ...item }, ...s.feed].slice(0, FEED_CAP),
    })),

  ingest: (batch) => {
    const s = get();
    const session = s.session;

    // --- pitch trail
    let trail = s.trail;
    let currentCents = s.currentCents;
    let now = s.now;
    if (batch.frames.length) {
      const add: TrailPoint[] = [];
      for (const f of batch.frames) {
        now = Math.max(now, f.t);
        if (f.cents === null) continue;
        add.push({ t: f.t, cents: f.cents, conf: f.conf });
      }
      const last = batch.frames[batch.frames.length - 1];
      currentCents = last.cents;
      trail = [...trail, ...add];
      const cutoff = now - config.trailFadeSec;
      const firstKeep = trail.findIndex((p) => p.t >= cutoff);
      if (firstKeep > 0) trail = trail.slice(firstKeep);
      if (trail.length > TRAIL_CAP) trail = trail.slice(trail.length - TRAIL_CAP);
    }

    const newFeed: FeedItem[] = [];

    if (batch.notes.length) {
      session.addNotes(batch.notes);
      for (const n of batch.notes) {
        if (!n.isNyas) continue;
        newFeed.push({
          id: 'f' + feedId++,
          t: n.tStart,
          kind: 'nyas',
          label: 'Nyas',
          reason: `Resting note held ${Math.round((n.tEnd - n.tStart) * 1000)} ms`,
        });
      }
    }

    if (batch.gamakas.length) {
      session.addGamakas(batch.gamakas);
      for (const g of batch.gamakas) {
        if (g.type === 'none') continue;
        newFeed.push({
          id: 'f' + feedId++,
          t: g.tStart,
          kind: 'gamaka',
          label: GAMAKA_LABEL[g.type] ?? g.type,
          reason: g.reason,
          cls: g.type,
        });
      }
    }

    if (batch.vivadis.length) {
      session.addVivadis(batch.vivadis);
      for (const v of batch.vivadis) {
        newFeed.push({
          id: 'f' + feedId++,
          t: v.t,
          kind: 'vivadi',
          label: VIVADI_LABEL[v.cls] ?? v.cls,
          reason: v.reason,
          severity: v.severity,
          cls: v.cls,
        });
      }
    }

    if (batch.phrases.length) {
      session.addPhrases(batch.phrases);
      for (const p of batch.phrases) {
        newFeed.push({
          id: 'f' + feedId++,
          t: p.t,
          kind: 'phrase',
          label: 'Pakad',
          reason: `${p.pakad} — characteristic phrase of ${ragaName(p.ragaId)}`,
          cls: p.ragaId,
        });
      }
    }

    // --- posterior + lock
    let lockedRagaId = s.lockedRagaId;
    let targetRagaId = s.targetRagaId;
    const posterior = batch.posterior ?? s.posterior;
    if (batch.posterior) {
      const top = batch.posterior.ranked[0];
      session.addConfidence(batch.posterior.t, top.ragaId, top.p);
      const nextLock = batch.posterior.locked ?? null;
      // in practice mode the target is the user's choice, not a recognition
      // result, so announcing a "lock" with the posterior's confidence would
      // be misleading
      if (nextLock && nextLock !== s.lockedRagaId && s.mode === 'explore') {
        const own = batch.posterior.ranked.find((r) => r.ragaId === nextLock);
        newFeed.push({
          id: 'f' + feedId++,
          t: batch.posterior.t,
          kind: 'lock',
          label: 'Raga',
          reason: `Locked onto ${ragaName(nextLock)} at ${Math.round(
            (own?.p ?? top.p) * 100,
          )}% confidence`,
          cls: nextLock,
        });
      }
      lockedRagaId = nextLock;
      targetRagaId =
        s.mode === 'practice' ? s.practiceRagaId : nextLock ?? top.ragaId;
      session.targetRaga = targetRagaId;
    }

    set({
      input: batch.input ?? s.input,
      trail,
      currentCents,
      now,
      notes: [...s.notes, ...batch.notes].slice(-EVENT_CAP),
      gamakas: [...s.gamakas, ...batch.gamakas.filter((g) => g.type !== 'none')].slice(
        -EVENT_CAP,
      ),
      vivadis: [...s.vivadis, ...batch.vivadis].slice(-EVENT_CAP),
      phrases: [...s.phrases, ...batch.phrases].slice(-EVENT_CAP),
      // events from one window can be finalised out of order, so the feed is
      // sorted by musical time rather than by arrival
      feed: [...newFeed, ...s.feed].sort((a, b) => b.t - a.t).slice(0, FEED_CAP),
      posterior,
      lockedRagaId,
      targetRagaId,
    });
  },

  resetSession: () => {
    const s = get();
    s.session.reset();
    set({
      input: null,
      trail: [],
      currentCents: null,
      now: 0,
      notes: [],
      gamakas: [],
      vivadis: [],
      phrases: [],
      feed: [],
      posterior: null,
      lockedRagaId: null,
      targetRagaId: s.mode === 'practice' ? s.practiceRagaId : null,
    });
  },
}));
