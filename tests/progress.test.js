import { describe, expect, it } from "vitest";
import { LEVEL_COUNT } from "../src/levels.js";
import { isUnlocked, mergeRun, normalizeProgress, unlockedLevels } from "../src/progress.js";

describe("stored progress", () => {
  it("survives junk coming back from KV", () => {
    expect(normalizeProgress(null)).toEqual({ best: 0, cleared: 0, plays: 0, wins: 0 });
    expect(normalizeProgress("nope")).toEqual({ best: 0, cleared: 0, plays: 0, wins: 0 });
    expect(normalizeProgress({ best: "1200.7", cleared: 99, plays: -4 })).toEqual({
      best: 1200,
      cleared: LEVEL_COUNT,
      plays: 0,
      wins: 0,
    });
  });

  it("keeps the best score and the furthest level", () => {
    const first = mergeRun({ best: 900, cleared: 2, plays: 3, wins: 0 }, { score: 400, clearedLevels: 1 });
    expect(first.best).toBe(900);
    expect(first.cleared).toBe(2);
    const second = mergeRun(first, { score: 1500, clearedLevels: 3 });
    expect(second.best).toBe(1500);
    expect(second.cleared).toBe(3);
  });

  it("counts a play only when the attempt actually ended", () => {
    const midRun = mergeRun({ plays: 2 }, { score: 10, clearedLevels: 1 });
    expect(midRun.plays).toBe(2);
    const ended = mergeRun(midRun, { score: 10, ended: true });
    expect(ended.plays).toBe(3);
    expect(ended.wins).toBe(0);
    const won = mergeRun(ended, { score: 10, ended: true, won: true, clearedLevels: LEVEL_COUNT });
    expect(won.wins).toBe(1);
    expect(won.cleared).toBe(LEVEL_COUNT);
  });
});

describe("level unlocking", () => {
  it("opens the next mission after each clear", () => {
    expect(unlockedLevels({ cleared: 0 })).toBe(1);
    expect(unlockedLevels({ cleared: 2 })).toBe(3);
    expect(unlockedLevels({ cleared: LEVEL_COUNT })).toBe(LEVEL_COUNT);
  });

  it("gates locked missions", () => {
    const progress = { cleared: 1 };
    expect(isUnlocked(progress, 0)).toBe(true);
    expect(isUnlocked(progress, 1)).toBe(true);
    expect(isUnlocked(progress, 2)).toBe(false);
    expect(isUnlocked(progress, -1)).toBe(false);
  });
});
