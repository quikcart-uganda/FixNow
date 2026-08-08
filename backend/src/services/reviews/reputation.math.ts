import { env } from '../../config/env.js';

export const REVIEW_EDIT_WINDOW_MS = env.REVIEW_EDIT_WINDOW_MS;

export function ratingPoints(overall: number): number {
  if (overall >= 5) return 15;
  if (overall >= 4) return 8;
  if (overall >= 3) return 2;
  if (overall >= 2) return -8;
  return -20;
}

export function reputationLevel(score: number): string {
  if (score >= 750) return 'elite';
  if (score >= 500) return 'respected';
  if (score >= 300) return 'established';
  if (score >= 100) return 'rising';
  return 'new';
}

export function clampScore(n: number, min = 0, max = 1000): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function average(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function distribution(ratings: number[]): Record<string, number> {
  const buckets: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const r of ratings) {
    const key = String(Math.min(5, Math.max(1, Math.round(r))));
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return buckets;
}

export function rateFromCounts(completed: number, cancelled: number): number {
  const total = completed + cancelled;
  if (total === 0) return 0;
  return Math.round((completed / total) * 1000) / 10;
}
