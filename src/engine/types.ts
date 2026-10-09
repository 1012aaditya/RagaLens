// Swara index 0..11 relative to Sa:
// 0 S, 1 r(komal Re), 2 R, 3 g(komal Ga), 4 G, 5 m(shuddha Ma), 6 M(tivra Ma),
// 7 P, 8 d(komal Dha), 9 D, 10 n(komal Ni), 11 N
export type SwaraIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type Octave = -1 | 0 | 1;

export interface PitchFrame {
  t: number;
  hz: number | null;
  cents: number | null;
  conf: number;
}

export interface NoteEvent {
  id: string;
  swara: SwaraIdx;
  octave: Octave;
  tStart: number;
  tEnd: number;
  meanCents: number;
  /** std deviation in cents across the note */
  stability: number;
  isNyas: boolean;
}

export type GamakaType = 'meend' | 'kampita' | 'andolan' | 'murki' | 'kan' | 'none';

export interface GamakaEvent {
  id: string;
  type: GamakaType;
  tStart: number;
  tEnd: number;
  fromSwara?: SwaraIdx;
  toSwara?: SwaraIdx;
  centerSwara?: SwaraIdx;
  extentCents: number;
  rateHz?: number;
  confidence: number;
  reason: string;
}

export type VivadiClass = 'mistake' | 'embellishment' | 'stylistic' | 'direction_violation';

export interface VivadiEvent {
  id: string;
  t: number;
  swara: SwaraIdx;
  ragaId: string;
  cls: VivadiClass;
  /** 0..1 */
  severity: number;
  reason: string;
}

export interface RagaPosterior {
  t: number;
  ranked: { ragaId: string; p: number }[];
  locked?: string;
}

export interface PhraseMatchEvent {
  id: string;
  t: number;
  ragaId: string;
  pakad: string;
  swaras: SwaraIdx[];
  editDistance: number;
}

export type VarjyaCategory = 'dissonant' | 'optional' | 'conventional' | 'embellishment_ok';

export interface VarjyaRule {
  swara: SwaraIdx;
  category: VarjyaCategory;
  /** phrase patterns (notation strings) in which the usage is accepted */
  allowedContexts?: string[];
  note: string;
}

export interface DirectionRule {
  swara: SwaraIdx;
  forbiddenIn: 'aroha' | 'avaroha';
  note: string;
}

export type Samay = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'midnight';
export type Rasa = 'shanta' | 'karuna' | 'shringar' | 'bhakti' | 'veera' | 'adbhuta';

export interface Raga {
  id: string;
  name: string;
  thaat: string;
  swaras: SwaraIdx[];
  aroha: SwaraIdx[];
  avaroha: SwaraIdx[];
  vadi: SwaraIdx;
  samvadi: SwaraIdx;
  nyas: SwaraIdx[];
  pakad: string[];
  andolanOn?: SwaraIdx[];
  varjyaRules: VarjyaRule[];
  directionRules?: DirectionRule[];
  samay: Samay;
  rasa: Rasa;
}

/** Direction of motion between two consecutive notes. */
export type Direction = 'aroha' | 'avaroha' | 'flat';

/**
 * Live input telemetry. Without this the pitch gates fail silently: a dead
 * microphone and a perfectly in-raga performance look identical on screen.
 */
export interface InputLevel {
  /** peak RMS over the batch, 0..1 */
  rms: number;
  /** best pitch clarity seen in the batch, 0..1 */
  clarity: number;
  /** fraction of frames that survived the gates */
  voicedFraction: number;
}

/** Everything the engine emits in one batch. */
export interface EngineBatch {
  frames: PitchFrame[];
  notes: NoteEvent[];
  gamakas: GamakaEvent[];
  vivadis: VivadiEvent[];
  phrases: PhraseMatchEvent[];
  posterior?: RagaPosterior;
  input?: InputLevel;
}
