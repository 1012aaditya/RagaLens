/*
 * Context-graded vivadi engine — the core novelty of RagaLens.
 *
 * A note outside a raga's swara set is not automatically a mistake. The same
 * shuddha Ma that ruins a Bhupali phrase is correct Yaman Kalyan inside
 * `G m G R S`, and an 80 ms touch of shuddha Ni inside a meend is a permitted
 * kan rather than an error. This module decides which, and always explains why.
 */

import { config } from './config';
import { matchesAnyContext } from './phrases';
import { violatesDirection } from './recognizer';
import { SWARA_LONG_NAMES, SWARA_NAMES, notateSeq } from './swara';
import type {
  Direction,
  Raga,
  SwaraIdx,
  VarjyaRule,
  VivadiClass,
  VivadiEvent,
} from './types';

export interface VivadiInput {
  swara: SwaraIdx;
  t: number;
  durationMs: number;
  isNyas: boolean;
  /** the note occurred inside a gamaka segment (kan / murki touch, meend pass) */
  inGamaka: boolean;
  prevSwara?: SwaraIdx;
  nextSwara?: SwaraIdx;
  direction?: Direction;
  /** last ~5 sung swaras including this one, plus the 1-note lookahead */
  context: SwaraIdx[];
}

let uid = 0;
function nextId(): string {
  return 'v' + (uid++).toString(36);
}
export function resetVivadiIds(): void {
  uid = 0;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function ruleFor(raga: Raga, swara: SwaraIdx): VarjyaRule {
  const found = raga.varjyaRules.find((r) => r.swara === swara);
  return (
    found ?? {
      swara,
      category: 'dissonant',
      note: `${SWARA_LONG_NAMES[swara]} is not part of ${raga.name}.`,
    }
  );
}

function ev(
  input: VivadiInput,
  raga: Raga,
  cls: VivadiClass,
  severity: number,
  reason: string,
): VivadiEvent {
  return {
    id: nextId(),
    t: input.t,
    swara: input.swara,
    ragaId: raga.id,
    cls,
    severity: clamp01(severity),
    reason,
  };
}

/**
 * Grade one note (or one gamaka touch-note) against the target raga.
 * Returns null when the note is unremarkable, i.e. plainly in-raga.
 */
export function gradeVivadi(raga: Raga, input: VivadiInput): VivadiEvent | null {
  const { swara, durationMs, inGamaka, isNyas } = input;
  const nm = SWARA_LONG_NAMES[swara];

  // --- in-raga notes: only direction rules can still flag them
  if (raga.swaras.includes(swara)) {
    const dir = input.direction;
    if (!dir) return null;
    const v = violatesDirection(raga, dir, swara);
    if (!v) return null;
    const arrow = dir === 'aroha' ? 'ascending' : 'descending';
    return ev(
      input,
      raga,
      'direction_violation',
      0.6,
      `${nm} taken ${arrow} — ${v.note}`,
    );
  }

  // --- out-of-raga notes: grade by category and context
  const rule = ruleFor(raga, swara);
  const neighboursInRaga =
    (input.prevSwara === undefined || raga.swaras.includes(input.prevSwara)) &&
    (input.nextSwara === undefined || raga.swaras.includes(input.nextSwara));
  const ctxText = notateSeq(input.context);

  // 1. a fleeting touch inside an ornament, landing back in the raga
  if (durationMs < config.kanMs && inGamaka && neighboursInRaga) {
    return ev(
      input,
      raga,
      'embellishment',
      0.1,
      `Passing touch of ${SWARA_NAMES[swara]} (${Math.round(
        durationMs,
      )} ms) inside an ornament — permitted kan, not a wrong note`,
    );
  }

  // 2. a conventional borrowing, but only in its sanctioned phrase
  if (rule.category === 'conventional') {
    const hit = matchesAnyContext(input.context, rule.allowedContexts);
    if (hit) {
      return ev(
        input,
        raga,
        'stylistic',
        0.15,
        `${nm} in ${hit} — accepted usage. ${rule.note}`,
      );
    }
    return ev(
      input,
      raga,
      'mistake',
      clamp01(0.5 + 0.3 * (durationMs / 600) + (isNyas ? 0.2 : 0)),
      `${nm} outside its sanctioned phrase (sung in ${ctxText}) — ${rule.note}`,
    );
  }

  // 3. a light-classical liberty
  if (rule.category === 'optional') {
    return ev(input, raga, 'stylistic', 0.3, `${nm} in ${raga.name} — ${rule.note}`);
  }

  // 4. allowed as a short ornament only
  if (rule.category === 'embellishment_ok') {
    if (durationMs < config.embellishmentMaxMs) {
      return ev(
        input,
        raga,
        'embellishment',
        0.2,
        `${nm} held ${Math.round(durationMs)} ms — ${rule.note}`,
      );
    }
    return ev(
      input,
      raga,
      'mistake',
      clamp01(0.5 + 0.3 * (durationMs / 600) + (isNyas ? 0.2 : 0)),
      `${nm} sustained ${Math.round(durationMs)} ms — acceptable only as a quick touch. ${
        rule.note
      }`,
    );
  }

  // 5. genuinely dissonant
  return ev(
    input,
    raga,
    'mistake',
    clamp01(0.5 + 0.3 * (durationMs / 600) + (isNyas ? 0.2 : 0)),
    `${nm} sustained ${Math.round(durationMs)} ms — ${rule.note}`,
  );
}

/**
 * Build the grader input for a steady note given its neighbours and the
 * trailing swara window. `context` is last-5 plus the 1-note lookahead, which
 * is why the caller evaluates one note behind the live edge.
 */
export function buildInput(args: {
  swara: SwaraIdx;
  t: number;
  durationMs: number;
  isNyas: boolean;
  inGamaka: boolean;
  history: SwaraIdx[];
  prevSwara?: SwaraIdx;
  nextSwara?: SwaraIdx;
  direction?: Direction;
}): VivadiInput {
  const tail = args.history.slice(-5);
  const context = args.nextSwara === undefined ? tail : [...tail, args.nextSwara];
  return {
    swara: args.swara,
    t: args.t,
    durationMs: args.durationMs,
    isNyas: args.isNyas,
    inGamaka: args.inGamaka,
    prevSwara: args.prevSwara,
    nextSwara: args.nextSwara,
    direction: args.direction,
    context,
  };
}
