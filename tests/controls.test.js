import { describe, expect, it } from "vitest";
import { keyboardVector, knobOffset, STICK, stickVector } from "../src/stick.js";

const center = { x: 100, y: 100 };

describe("floating analog stick", () => {
  it("ignores a thumb that barely moves", () => {
    const v = stickVector(center, { x: 104, y: 100 });
    expect(v).toEqual({ x: 0, y: 0, force: 0 });
  });

  it("reaches full deflection at the ring and clamps beyond it", () => {
    const edge = stickVector(center, { x: 100 + STICK.radius, y: 100 });
    expect(edge.force).toBeCloseTo(1, 6);
    expect(edge.x).toBeCloseTo(1, 6);
    const past = stickVector(center, { x: 100 + STICK.radius * 4, y: 100 });
    expect(past.force).toBeCloseTo(1, 6);
    expect(Math.hypot(past.x, past.y)).toBeCloseTo(1, 6);
  });

  it("keeps diagonals inside the unit circle", () => {
    const v = stickVector(center, { x: 100 + STICK.radius, y: 100 + STICK.radius });
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1.0001);
    expect(v.x).toBeCloseTo(v.y, 6);
  });

  it("ramps smoothly out of the deadzone", () => {
    const near = stickVector(center, { x: 100 + STICK.radius * 0.4, y: 100 });
    const far = stickVector(center, { x: 100 + STICK.radius * 0.8, y: 100 });
    expect(near.force).toBeGreaterThan(0);
    expect(far.force).toBeGreaterThan(near.force);
    expect(far.force).toBeLessThan(1);
  });

  it("draws the knob inside the ring", () => {
    const inside = knobOffset(center, { x: 130, y: 100 });
    expect(inside).toEqual({ x: 30, y: 0 });
    const outside = knobOffset(center, { x: 100 + STICK.radius * 3, y: 100 });
    expect(Math.hypot(outside.x, outside.y)).toBeCloseTo(STICK.radius, 6);
  });
});

describe("keyboard axes", () => {
  it("maps WASD and arrows to the same axes", () => {
    expect(keyboardVector(new Set(["KeyD"]))).toEqual({ x: 1, y: 0 });
    expect(keyboardVector(new Set(["ArrowRight"]))).toEqual({ x: 1, y: 0 });
    expect(keyboardVector(new Set(["KeyW"]))).toEqual({ x: 0, y: -1 });
  });

  it("normalizes diagonals and cancels opposites", () => {
    const diag = keyboardVector(new Set(["KeyW", "KeyD"]));
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 6);
    expect(keyboardVector(new Set(["KeyA", "KeyD"]))).toEqual({ x: 0, y: 0 });
    expect(keyboardVector(new Set())).toEqual({ x: 0, y: 0 });
  });
});
