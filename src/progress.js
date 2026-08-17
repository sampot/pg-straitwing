import { LEVEL_COUNT } from "./levels.js";

export const EMPTY_PROGRESS = { best: 0, cleared: 0, plays: 0, wins: 0 };

/** Accept whatever KV hands back (null / junk / older shape) and normalise it. */
export function normalizeProgress(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const cleared = Number(p.cleared);
  return {
    best: Math.max(0, Math.floor(Number(p.best) || 0)),
    cleared: Math.min(LEVEL_COUNT, Math.max(0, Number.isFinite(cleared) ? Math.floor(cleared) : 0)),
    plays: Math.max(0, Math.floor(Number(p.plays) || 0)),
    wins: Math.max(0, Math.floor(Number(p.wins) || 0)),
  };
}

/**
 * Fold one run's result into stored progress. `ended` marks a finished attempt
 * (shot down or campaign complete) so mid-campaign level clears don't inflate plays.
 */
export function mergeRun(progress, run = {}) {
  const base = normalizeProgress(progress);
  const score = Math.max(0, Math.floor(Number(run.score) || 0));
  const clearedNow = Math.max(0, Math.floor(Number(run.clearedLevels) || 0));
  return {
    best: Math.max(base.best, score),
    cleared: Math.min(LEVEL_COUNT, Math.max(base.cleared, clearedNow)),
    plays: base.plays + (run.ended ? 1 : 0),
    wins: base.wins + (run.won ? 1 : 0),
  };
}

/** Levels the player may start from: everything cleared so far, plus the next one. */
export function unlockedLevels(progress) {
  const { cleared } = normalizeProgress(progress);
  return Math.min(LEVEL_COUNT, cleared + 1);
}

export function isUnlocked(progress, levelIndex) {
  return levelIndex >= 0 && levelIndex < unlockedLevels(progress);
}
