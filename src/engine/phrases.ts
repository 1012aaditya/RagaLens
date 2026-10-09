import { config } from './config';
import { PAKAD_SWARAS, RAGAS } from '../data/loadRagas';
import { parseNotation } from './swara';
import type { SwaraIdx } from './types';

/** Levenshtein distance between two swara sequences. */
export function editDistance(a: SwaraIdx[], b: SwaraIdx[]): number {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array<number>(m + 1);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

export interface PhraseHit {
  ragaId: string;
  pakad: string;
  swaras: SwaraIdx[];
  editDistance: number;
}

/**
 * Look for any raga's pakad inside the trailing window of sung swaras.
 * A pakad of length L is tested against every L-length (and L±1) suffix-anchored
 * window, so a match is reported as soon as the phrase has just been completed.
 */
export function matchPakad(
  recent: SwaraIdx[],
  maxEdit = config.phraseMaxEdit,
): PhraseHit[] {
  const hits: PhraseHit[] = [];
  for (const raga of RAGAS) {
    for (const { text, swaras } of PAKAD_SWARAS[raga.id]) {
      const L = swaras.length;
      let best: { d: number; win: SwaraIdx[] } | null = null;
      for (const len of [L - 1, L, L + 1]) {
        if (len < 2 || len > recent.length) continue;
        const win = recent.slice(recent.length - len);
        const d = editDistance(win, swaras);
        if (!best || d < best.d) best = { d, win };
      }
      if (best && best.d <= maxEdit) {
        hits.push({ ragaId: raga.id, pakad: text, swaras: best.win, editDistance: best.d });
      }
    }
  }
  return hits.sort((a, b) => a.editDistance - b.editDistance);
}

/**
 * Does a sung context contain a given notation pattern (allowing one edit)?
 * Used by the vivadi grader to test `allowedContexts`.
 */
export function contextMatches(
  context: SwaraIdx[],
  pattern: string,
  maxEdit?: number,
): boolean {
  const pat = parseNotation(pattern);
  if (!pat.length || !context.length) return false;
  // Short patterns must match exactly. One edit inside a three-note pattern
  // would accept "G m P" as "G m G", which is precisely the distinction the
  // vivadi grader exists to make.
  const tol = maxEdit ?? (pat.length >= 5 ? config.phraseMaxEdit : 0);
  const L = pat.length;
  for (let start = 0; start < context.length; start++) {
    for (const len of [L - 1, L, L + 1]) {
      if (len < 2) continue;
      if (start + len > context.length) continue;
      const win = context.slice(start, start + len);
      if (editDistance(win, pat) <= tol) return true;
    }
  }
  return false;
}

export function matchesAnyContext(
  context: SwaraIdx[],
  patterns: string[] | undefined,
): string | null {
  if (!patterns) return null;
  for (const p of patterns) {
    if (contextMatches(context, p)) return p;
  }
  return null;
}
