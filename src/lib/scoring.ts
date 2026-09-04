/**
 * Evaluation-score constants shared across job analytics, candidate
 * filtering, and org-wide analytics. Deliberately has zero imports (not
 * even `@/lib/db`) so any pure aggregation function built on these stays
 * unit-testable without a database or a generated Prisma client.
 */

/** Score at or above this (0-10 scale, matching Evaluation.overallScore) counts as "successful" anywhere that distinction is needed — no explicit pass/fail field exists on Evaluation. */
export const SUCCESSFUL_SCORE_THRESHOLD = 7;

export const SCORE_BUCKETS: [number, number, string][] = [
  [0, 2, '0-2'],
  [2, 4, '2-4'],
  [4, 6, '4-6'],
  [6, 8, '6-8'],
  [8, 10.001, '8-10'],
];
