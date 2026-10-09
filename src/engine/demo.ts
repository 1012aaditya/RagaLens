/*
 * Idiomatic ~15 s demo passages, one per raga. Used by the recogniser tests, by
 * the synthetic singer and by the Demo button when no live voice is available.
 *
 * MUSICAL DATA PENDING MUSICIAN REVIEW — see src/data/loadRagas.ts.
 */

import type { Score, ScoreItem } from './contour';

const N = (token: string, ms = 320): ScoreItem => ({ kind: 'note', token, ms });
const REST = (ms = 160): ScoreItem => ({ kind: 'rest', ms });

/** A notation string as equal-length steady notes. */
function P(notation: string, ms = 320): ScoreItem[] {
  return notation.split(/\s+/).filter(Boolean).map((t) => N(t, ms));
}

const meend = (from: string, to: string, ms = 420): ScoreItem => ({
  kind: 'meend',
  from,
  to,
  ms,
});

const andolan = (token: string, ms = 1300, rateHz = 1.5, extentCents = 45): ScoreItem => ({
  kind: 'andolan',
  token,
  ms,
  rateHz,
  extentCents,
});

export const DEMO_SCORES: Record<string, Score> = {
  bhupali: [
    ...P('S R G'),
    N('P', 520),
    ...P('G R S .D S R G'),
    REST(),
    ...P('P G D P G R S'),
    REST(),
    ...P('S R G P D'),
    N("S'", 480),
    meend("S'", 'D'),
    ...P('D P G R S'),
    REST(),
    ...P('G R S .D S R G'),
    N('G', 700),
  ],

  yaman: [
    ...P('.N R G R'),
    REST(),
    ...P('P R .N R S'),
    REST(),
    ...P('S R G M P D N'),
    N("S'", 480),
    meend("S'", 'N'),
    ...P('N D P M G R S'),
    REST(),
    ...P('.N R G R'),
    ...P('G M P M G R'),
    N('G', 700),
  ],

  bhairav: [
    N('S', 400),
    andolan('r'),
    ...P('G m d d P'),
    REST(),
    ...P('G m r r S'),
    andolan('d'),
    ...P('P d N'),
    N("S'", 420),
    ...P('N d P m G'),
    andolan('r'),
    N('S', 600),
  ],

  malkauns: [
    N('S', 420),
    ...P('m g m d n d m'),
    REST(),
    ...P('g m g S'),
    REST(),
    ...P('S g m d n'),
    N("S'", 460),
    meend("S'", 'n'),
    ...P('n d m g S'),
    REST(),
    ...P('m g m d n d m'),
    N('m', 700),
  ],

  bhairavi: [
    ...P('S r g m P'),
    REST(),
    ...P('d P m g r S'),
    REST(),
    ...P('S r g m P d n'),
    N("S'", 460),
    meend("S'", 'n'),
    ...P('n d P m g r S'),
    REST(),
    ...P('S r g m P'),
    N('m', 700),
  ],

  khamaj: [
    ...P('S G m P D n'),
    N("S'", 440),
    ...P("S' N D P m G R S"),
    REST(),
    ...P('n D P m G'),
    REST(),
    ...P('G m P D n D P'),
    REST(),
    ...P('S G m P D n'),
    N("S'", 600),
  ],

  bihag: [
    ...P('S G m P'),
    N('N', 420),
    N("S'", 460),
    meend("S'", 'N'),
    ...P('N D P m G'),
    REST(),
    ...P('P M G m G'),
    ...P('G m P N'),
    N("S'", 440),
    REST(),
    ...P('G m P N S'),
    N('G', 700),
  ],

  darbari: [
    ...P('.n S R S'),
    andolan('g', 1300, 1.3, 55),
    ...P('g m R S'),
    REST(),
    ...P('R g m P'),
    andolan('d', 1300, 1.3, 55),
    ...P('d n P m P g m R S'),
    REST(),
    ...P('g m R S'),
    N('R', 700),
  ],
};

/** Total rendered duration of a demo passage, in seconds. */
export function scoreDurationSec(score: Score): number {
  return score.reduce((a, item) => a + item.ms, 0) / 1000;
}

/* ---------------------------------------------------------------------------
 * The 90-second demo script (see README). Each step sets the mode and target
 * raga, then sings a passage chosen to trigger one specific verdict, so the
 * same-note-different-verdict moment lands without a live singer.
 * ------------------------------------------------------------------------- */

export interface DemoStep {
  label: string;
  caption: string;
  mode: 'explore' | 'practice';
  ragaId: string;
  score: Score;
}

export const DEMO_SCRIPT: DemoStep[] = [
  {
    label: 'Bhupali takes shape',
    caption: 'The pakad G R S .D S R G locks the raga and the palette turns evening gold.',
    mode: 'explore',
    ragaId: 'bhupali',
    score: [
      ...P('S R G'),
      N('P', 520),
      ...P('G R S .D S R G'),
      REST(),
      ...P('P G D P G R S'),
      N('G', 620),
    ],
  },
  {
    label: 'A permitted kan',
    caption: 'Shuddha Ni is varjya in Bhupali, but a quick touch inside a meend is allowed.',
    mode: 'explore',
    ragaId: 'bhupali',
    score: [
      ...P('G P D'),
      N('D', 420),
      meend('D', "S'", 480),
      N("S'", 520),
      meend("S'", 'D', 460),
      ...P('D P G'),
    ],
  },
  {
    label: 'A real mistake',
    caption: 'The same kind of foreign note, now sustained: shuddha Ma is not part of Bhupali.',
    mode: 'explore',
    ragaId: 'bhupali',
    score: [...P('G R S'), N('m', 620), ...P('G R S')],
  },
  {
    label: 'Yaman Kalyan: the same note, accepted',
    caption: 'In Yaman, shuddha Ma inside G m G R S is conventional usage, not an error.',
    mode: 'practice',
    ragaId: 'yaman',
    score: [
      ...P('.N R G R'),
      REST(),
      ...P('G m G R S'),
      REST(),
      ...P('P R .N R S'),
      N('G', 560),
    ],
  },
  {
    label: 'Bhairav at dawn',
    caption: 'Andolan on komal Re and komal Dha: a slow breathing ring, and a dawn palette.',
    mode: 'practice',
    ragaId: 'bhairav',
    score: [
      N('S', 400),
      andolan('r'),
      ...P('G m d d P'),
      andolan('d'),
      ...P('G m r r S'),
      N('S', 600),
    ],
  },
];
