import { describe, expect, it } from "vitest";
import { angleDiff, clamp, normalize, rand, turnToward, wrapAngle } from "../src/vec.js";

describe("angles", () => {
  it("wraps into (-PI, PI]", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 6);
  });

  it("takes the short way round when comparing headings", () => {
    // 170° to -170° is a 20° right turn, not 340° the other way.
    const d = angleDiff((170 * Math.PI) / 180, (-170 * Math.PI) / 180);
    expect(d).toBeCloseTo((20 * Math.PI) / 180, 6);
  });

  it("limits a turn to the rate budget and never overshoots", () => {
    const stepped = turnToward(0, Math.PI / 2, 0.1);
    expect(stepped).toBeCloseTo(0.1, 6);
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05, 6);
  });
});

describe("vectors", () => {
  it("normalizes to unit length and survives a zero vector", () => {
    const v = normalize(3, 4);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    expect(normalize(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("clamps within bounds", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });
});

describe("rng", () => {
  it("is deterministic per seed and stays in [0,1)", () => {
    const a = { rngSeed: 1234 };
    const b = { rngSeed: 1234 };
    const rollsA = [rand(a), rand(a), rand(a)];
    const rollsB = [rand(b), rand(b), rand(b)];
    expect(rollsA).toEqual(rollsB);
    for (const r of rollsA) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
    expect(new Set(rollsA).size).toBe(3);
  });
});
