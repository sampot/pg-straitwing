import { describe, expect, it } from "vitest";
import { isTailed, pickTarget, planBombRun, planBreak, planPursuit, planTurret } from "../src/ai.js";

const self = (over = {}) => ({ x: 0, y: 0, vx: 0, vy: 0, heading: 0, ...over });

describe("pursuit", () => {
  it("shoots only when lined up and in range", () => {
    const shooter = self({ heading: 0 });
    const lined = planPursuit(shooter, { x: 300, y: 0, vx: 0, vy: 0 }, { fireRange: 430, fireCone: 0.2 });
    expect(lined.fire).toBe(true);

    const offAngle = planPursuit(shooter, { x: 300, y: 300, vx: 0, vy: 0 }, { fireRange: 430, fireCone: 0.2 });
    expect(offAngle.fire).toBe(false);

    const tooFar = planPursuit(shooter, { x: 900, y: 0, vx: 0, vy: 0 }, { fireRange: 430, fireCone: 0.2 });
    expect(tooFar.fire).toBe(false);
  });

  it("steers toward the target and leads a mover", () => {
    const plan = planPursuit(self(), { x: 400, y: 0, vx: 0, vy: 200 }, {});
    expect(plan.steerX).toBeGreaterThan(0);
    expect(plan.steerY).toBeGreaterThan(0);
    expect(Math.hypot(plan.steerX, plan.steerY)).toBeCloseTo(1, 6);
    expect(plan.aim).toBeGreaterThan(0);
  });

  it("flies through instead of parking on top of the target", () => {
    const plan = planPursuit(self(), { x: 20, y: 0, vx: 0, vy: 0 }, { standoff: 80 });
    expect(plan.distance).toBeLessThan(80);
    expect(plan.steerX).toBeCloseTo(1, 6);
  });
});

describe("bomb run", () => {
  it("keeps pushing toward the goal line", () => {
    const run = planBombRun(self({ y: 100 }), 1800, 0);
    expect(run.steerY).toBeGreaterThan(0);
    const weaved = planBombRun(self({ y: 100 }), 1800, Math.PI / 2);
    expect(weaved.steerX).not.toBeCloseTo(run.steerX, 3);
  });
});

describe("turrets", () => {
  it("fires inside range only", () => {
    const inRange = planTurret(self(), { x: 200, y: 0, vx: 0, vy: 0 }, { range: 300 });
    expect(inRange.fire).toBe(true);
    expect(inRange.aim).toBeCloseTo(0, 6);
    const outOfRange = planTurret(self(), { x: 900, y: 0, vx: 0, vy: 0 }, { range: 300 });
    expect(outOfRange.fire).toBe(false);
  });
});

describe("target choice", () => {
  const player = { x: 0, y: 0, alive: true };
  const allies = [
    { x: 500, y: 0, alive: true },
    { x: 100, y: 0, alive: false },
  ];

  it("sends escort hunters after the nearest live ally", () => {
    const target = pickTarget({ x: 0, y: 0, prefersAllies: true }, player, allies);
    expect(target).toBe(allies[0]);
  });

  it("falls back to the player when no ally is left", () => {
    const target = pickTarget({ x: 0, y: 0, prefersAllies: true }, player, [allies[1]]);
    expect(target).toBe(player);
  });

  it("sends plain fighters after the player", () => {
    expect(pickTarget({ x: 0, y: 0, prefersAllies: false }, player, allies)).toBe(player);
  });
});

describe("defensive flying", () => {
  it("detects a threat sitting on your six", () => {
    const me = self({ heading: 0 });
    expect(isTailed(me, { x: -100, y: 0 })).toBe(true);
    expect(isTailed(me, { x: 100, y: 0 })).toBe(false);
    expect(isTailed(me, { x: -900, y: 0 })).toBe(false);
  });

  it("breaks away from the threat", () => {
    const br = planBreak(self({ x: 0, y: 0 }), { x: -100, y: 0 });
    expect(br.steerX).toBeGreaterThan(0);
    expect(Math.hypot(br.steerX, br.steerY)).toBeCloseTo(1, 6);
  });
});
