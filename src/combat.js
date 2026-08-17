import { angleDiff, clamp, normalize } from "./vec.js";

/** Cannon model: fire rate limited, and heat-limited so holding the trigger overheats. */
/** Holding the trigger jams the cannon after roughly two seconds of fire. */
export const GUN = {
  interval: 0.11,
  heatPerShot: 0.085,
  coolRate: 0.34,
  unlockAt: 0.45,
};

export function createGun() {
  return { cooldown: 0, heat: 0, locked: false };
}

export function updateGun(gun, dt, cfg = GUN) {
  gun.cooldown = Math.max(0, gun.cooldown - dt);
  gun.heat = clamp(gun.heat - cfg.coolRate * dt, 0, 1);
  if (gun.locked && gun.heat <= cfg.unlockAt) gun.locked = false;
  return gun;
}

export function canFire(gun) {
  return !gun.locked && gun.cooldown <= 0;
}

export function commitFire(gun, cfg = GUN) {
  gun.cooldown = cfg.interval;
  gun.heat = clamp(gun.heat + cfg.heatPerShot, 0, 1);
  if (gun.heat >= 1) gun.locked = true;
  return gun;
}

/** Circle-vs-circle overlap using each body's `r`. */
export function bodiesHit(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = (a.r || 0) + (b.r || 0);
  return dx * dx + dy * dy <= rr * rr;
}

/**
 * Where to aim so a bullet of `bulletSpeed` meets a moving target.
 * Two fixed-point passes are plenty for the speeds used here.
 */
export function leadTarget(shooter, target, bulletSpeed) {
  if (!(bulletSpeed > 0)) return { x: target.x, y: target.y };
  let t = Math.hypot(target.x - shooter.x, target.y - shooter.y) / bulletSpeed;
  for (let i = 0; i < 2; i++) {
    const px = target.x + (target.vx || 0) * t;
    const py = target.y + (target.vy || 0) * t;
    t = Math.hypot(px - shooter.x, py - shooter.y) / bulletSpeed;
  }
  return {
    x: target.x + (target.vx || 0) * t,
    y: target.y + (target.vy || 0) * t,
  };
}

/** True when `target` sits inside `cone` radians of the shooter's heading. */
export function inFiringCone(shooter, target, cone) {
  const bearing = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  return Math.abs(angleDiff(shooter.heading, bearing)) <= cone;
}

/** Subtract damage, honouring invulnerability. Returns true when the body died. */
export function applyDamage(body, dmg) {
  if (!body.alive) return false;
  if (body.invuln > 0) return false;
  body.hp -= dmg;
  body.hitFlash = 0.16;
  if (body.hp <= 0) {
    body.hp = 0;
    body.alive = false;
    return true;
  }
  return false;
}

export function makeBullet(x, y, angle, speed, team, dmg, opts = {}) {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed + (opts.inheritVx || 0),
    vy: Math.sin(angle) * speed + (opts.inheritVy || 0),
    team,
    dmg,
    r: opts.r ?? 4,
    life: opts.life ?? 1.6,
    kind: opts.kind ?? "tracer",
  };
}

/**
 * Steering toward a goal with a hard turn-rate budget: returns the unit thrust
 * vector, so callers just scale it by their acceleration.
 */
export function steerTo(self, goalX, goalY) {
  return normalize(goalX - self.x, goalY - self.y);
}
