/**
 * The two numeric guards every validator in this package needs.
 *
 * They lived as private copies in four files until a review counted them.
 * One spelling means one place to decide, say, that negative zero is not a
 * valid budget.
 */

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));
