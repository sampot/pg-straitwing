import { describe, expect, it } from "vitest";
import { soundForEvent } from "../src/audio.js";
import { createGame, startLevel } from "../src/game.js";
import { expandQueue, getLevel, LEVEL_COUNT, LEVELS, objectiveText } from "../src/levels.js";
import { ENEMY_KINDS, scaleStats } from "../src/units.js";

describe("mission chain", () => {
  it("ships five escalating missions", () => {
    expect(LEVEL_COUNT).toBe(5);
    expect(LEVELS).toHaveLength(5);
    for (const level of LEVELS) {
      expect(level.name).toBeTruthy();
      expect(level.brief).toBeTruthy();
      expect(level.objective.kind).toBeTruthy();
    }
    const kinds = LEVELS.map((l) => l.objective.kind);
    expect(new Set(kinds).size).toBe(5);
  });

  it("gets harder level by level", () => {
    const speeds = LEVELS.map((l) => l.scale.speed);
    const fires = LEVELS.map((l) => l.scale.fire);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]);
      expect(fires[i]).toBeGreaterThan(fires[i - 1]);
    }
    expect(speeds.at(-1)).toBeGreaterThan(speeds[0]);
  });

  it("clamps level lookups to the campaign", () => {
    expect(getLevel(-3)).toBe(LEVELS[0]);
    expect(getLevel(99)).toBe(LEVELS[LEVEL_COUNT - 1]);
  });
});

describe("reinforcement queues", () => {
  it("interleaves mixed waves so heavies and fighters arrive together", () => {
    expect(
      expandQueue([
        ["bomber", 2],
        ["fighter", 3],
      ]),
    ).toEqual(["bomber", "fighter", "bomber", "fighter", "fighter"]);
    expect(expandQueue([["fighter", 2]])).toEqual(["fighter", "fighter"]);
    expect(expandQueue([])).toEqual([]);
  });
});

describe("objective readouts", () => {
  it("reports live progress for every objective kind", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const state = createGame({ seed: 11, levelIndex: i });
      startLevel(state);
      const text = objectiveText(state);
      expect(text.length).toBeGreaterThan(3);
    }
  });

  it("counts kills as they happen", () => {
    const state = createGame({ seed: 11, levelIndex: 0 });
    startLevel(state);
    expect(objectiveText(state)).toContain("0／6");
    state.levelKills = 4;
    expect(objectiveText(state)).toContain("4／6");
    state.levelKills = 12;
    expect(objectiveText(state)).toContain("6／6");
  });
});

describe("unit scaling", () => {
  it("raises hp and rate of fire without mutating the base stats", () => {
    const base = ENEMY_KINDS.fighter;
    const scaled = scaleStats(base, { hp: 2, speed: 1.5, fire: 2 });
    expect(scaled.hp).toBe(base.hp * 2);
    expect(scaled.maxSpeed).toBeCloseTo(base.maxSpeed * 1.5, 6);
    expect(scaled.fireInterval).toBeCloseTo(base.fireInterval / 2, 6);
    expect(ENEMY_KINDS.fighter.hp).toBe(base.hp);
  });
});

describe("event soundtrack", () => {
  it("maps simulation events onto sounds, big kills included", () => {
    expect(soundForEvent({ type: "gun" })).toBe("gun");
    expect(soundForEvent({ type: "explode", big: false })).toBe("explode");
    expect(soundForEvent({ type: "explode", big: true })).toBe("explodeBig");
    expect(soundForEvent({ type: "levelClear" })).toBe("clear");
    expect(soundForEvent({ type: "somethingElse" })).toBeNull();
  });
});
