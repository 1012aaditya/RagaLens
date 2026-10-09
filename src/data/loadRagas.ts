/*
 * ============================================================================
 *  MUSICAL DATA PENDING MUSICIAN REVIEW
 * ----------------------------------------------------------------------------
 *  src/data/ragas.json encodes swara sets, aroha/avaroha, vadi/samvadi, pakad
 *  phrases, andolan notes, graded vivadi rules and direction rules for eight
 *  Hindustani ragas. It was assembled from standard textbook descriptions to
 *  drive the analysis demo and has NOT been vetted by a practising musician or
 *  musicologist. Treat every rule — especially the `conventional` and
 *  `optional` vivadi categories, which decide whether a note is reported as a
 *  mistake or as permitted usage — as provisional. Gharana practice varies,
 *  and several of these judgements are legitimately contested.
 *
 *  Reviewers: edit ragas.json only. Nothing else in the engine hard-codes
 *  musical facts; all thresholds live in src/engine/config.ts.
 * ============================================================================
 */

import { z } from 'zod';
import raw from './ragas.json';
import type { Raga, SwaraIdx } from '../engine/types';
import { parseNotation } from '../engine/swara';

const swaraIdx = z.number().int().min(0).max(11);

const varjyaRule = z.object({
  swara: swaraIdx,
  category: z.enum(['dissonant', 'optional', 'conventional', 'embellishment_ok']),
  allowedContexts: z.array(z.string()).optional(),
  note: z.string().min(1),
});

const directionRule = z.object({
  swara: swaraIdx,
  forbiddenIn: z.enum(['aroha', 'avaroha']),
  note: z.string().min(1),
});

const ragaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  thaat: z.string().min(1),
  swaras: z.array(swaraIdx).min(3),
  aroha: z.array(swaraIdx).min(3),
  avaroha: z.array(swaraIdx).min(3),
  vadi: swaraIdx,
  samvadi: swaraIdx,
  nyas: z.array(swaraIdx).min(1),
  pakad: z.array(z.string().min(1)).min(1),
  andolanOn: z.array(swaraIdx).optional(),
  varjyaRules: z.array(varjyaRule),
  directionRules: z.array(directionRule).optional(),
  samay: z.enum(['dawn', 'morning', 'afternoon', 'evening', 'night', 'midnight']),
  rasa: z.enum(['shanta', 'karuna', 'shringar', 'bhakti', 'veera', 'adbhuta']),
});

const fileSchema = z.object({
  _comment: z.string().optional(),
  ragas: z.array(ragaSchema).min(1),
});

function validate(): Raga[] {
  const parsed = fileSchema.parse(raw);
  const ragas = parsed.ragas as unknown as Raga[];

  for (const r of ragas) {
    if (!r.swaras.includes(r.vadi)) {
      throw new Error(`${r.id}: vadi ${r.vadi} is not in the swara set`);
    }
    if (!r.swaras.includes(r.samvadi)) {
      throw new Error(`${r.id}: samvadi ${r.samvadi} is not in the swara set`);
    }
    for (const n of r.nyas) {
      if (!r.swaras.includes(n)) throw new Error(`${r.id}: nyas ${n} is not in the swara set`);
    }
    for (const rule of r.varjyaRules) {
      if (r.swaras.includes(rule.swara)) {
        throw new Error(
          `${r.id}: varjya rule for swara ${rule.swara} but that swara is in the allowed set`,
        );
      }
    }
    for (const p of r.pakad) {
      if (parseNotation(p).length === 0) throw new Error(`${r.id}: unparseable pakad "${p}"`);
    }
  }
  return ragas;
}

export const RAGAS: Raga[] = validate();

export const RAGA_BY_ID: Record<string, Raga> = Object.fromEntries(
  RAGAS.map((r) => [r.id, r]),
);

export function getRaga(id: string): Raga {
  const r = RAGA_BY_ID[id];
  if (!r) throw new Error(`unknown raga: ${id}`);
  return r;
}

/** Parsed pakad phrases, cached per raga, for the phrase matcher. */
export const PAKAD_SWARAS: Record<string, { text: string; swaras: SwaraIdx[] }[]> =
  Object.fromEntries(
    RAGAS.map((r) => [r.id, r.pakad.map((p) => ({ text: p, swaras: parseNotation(p) }))]),
  );
