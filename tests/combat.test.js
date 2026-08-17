import { describe, expect, it } from "vitest";
import {
  applyDamage,
  bodiesHit,
  canFire,
  commitFire,
  createGun,
  GUN,
  inFiringCone,
  leadTarget,
  updateGun,
} from "../src/combat.js";

const body = (x, y, r) => ({ x, y, r });

describe("cannon heat", () => {
  it("rate-limits shots", () => {
    const gun = createGun();
    expect(canFire(gun)).toBe(true);
    commitFire(gun);
    expect(canFire(gun)).toBe(false);
    updateGun(gun, GUN.interval + 0.001);
    expect(canFire(gun)).toBe(true);
  });

  it("locks up when the trigger is held down", () => {
    const gun = createGun();
    let shots = 0;
    for (let i = 0; i < 400 && !gun.locked; i++) {
      updateGun(gun, 1 / 60);
      if (canFire(gun)) {
        commitFire(gun);
        shots += 1;
      }
    }
    expect(gun.locked).toBe(true);
    expect(gun.heat).toBe(1);
    expect(shots).toBeGreaterThan(8);
    expect(canFire(gun)).toBe(false);
  });

  it("stays locked until heat drops back under the unlock threshold", () => {
    const gun = { cooldown: 0, heat: 1, locked: true };
    updateGun(gun, 0.2);
    expect(gun.locked).toBe(true);
    expect(gun.heat).toBeGreaterThan(GUN.unlockAt);
    updateGun(gun, 4);
    expect(gun.locked).toBe(false);
    expect(gun.heat).toBe(0);
  });
});

describe("hit detection", () => {
  it("uses summed radii", () => {
    expect(bodiesHit(body(0, 0, 5), body(8, 0, 4))).toBe(true);
    expect(bodiesHit(body(0, 0, 5), body(10.1, 0, 5))).toBe(false);
  });

  it("aims ahead of a crossing target", () => {
    const shooter = { x: 0, y: 0 };
    const target = { x: 0, y: 100, vx: 200, vy: 0 };
    const aim = leadTarget(shooter, target, 400);
    expect(aim.x).toBeGreaterThan(30);
    expect(aim.y).toBe(100);
  });

  it("does not lead a stationary target", () => {
    const aim = leadTarget({ x: 0, y: 0 }, { x: 50, y: 50, vx: 0, vy: 0 }, 400);
    expect(aim).toEqual({ x: 50, y: 50 });
  });

  it("knows when a target sits in the gun cone", () => {
    const shooter = { x: 0, y: 0, heading: 0 };
    expect(inFiringCone(shooter, { x: 100, y: 2 }, 0.2)).toBe(true);
    expect(inFiringCone(shooter, { x: 100, y: 100 }, 0.2)).toBe(false);
  });
});

describe("damage", () => {
  it("kills at zero and reports the kill once", () => {
    const target = { hp: 10, alive: true, invuln: 0, hitFlash: 0 };
    expect(applyDamage(target, 4)).toBe(false);
    expect(target.hp).toBe(6);
    expect(applyDamage(target, 6)).toBe(true);
    expect(target.alive).toBe(false);
    expect(applyDamage(target, 6)).toBe(false);
  });

  it("ignores damage while invulnerable", () => {
    const target = { hp: 10, alive: true, invuln: 0.5, hitFlash: 0 };
    expect(applyDamage(target, 99)).toBe(false);
    expect(target.hp).toBe(10);
  });
});
