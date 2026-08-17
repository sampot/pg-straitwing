import { inFiringCone, leadTarget, steerTo } from "./combat.js";
import { angleDiff, normalize } from "./vec.js";

/**
 * Dogfight brain for pursuit craft (fighter / heavy / ace).
 * Pure: takes snapshots, returns intent. The caller integrates physics.
 */
export function planPursuit(self, target, cfg = {}) {
  const bulletSpeed = cfg.bulletSpeed ?? 420;
  const standoff = cfg.standoff ?? 78;
  const fireRange = cfg.fireRange ?? 430;
  const fireCone = cfg.fireCone ?? 0.22;

  const aimPoint = leadTarget(self, target, bulletSpeed);
  const dx = target.x - self.x;
  const dy = target.y - self.y;
  const distance = Math.hypot(dx, dy);

  // Too close to shoot: bleed through and past the target instead of ramming,
  // which is what forces the player to keep turning.
  let goalX = aimPoint.x;
  let goalY = aimPoint.y;
  if (distance < standoff) {
    goalX = target.x + dx;
    goalY = target.y + dy;
  }

  const steer = steerTo(self, goalX, goalY);
  const aim = Math.atan2(aimPoint.y - self.y, aimPoint.x - self.x);
  const align = Math.abs(angleDiff(self.heading, Math.atan2(dy, dx)));
  const fire = distance <= fireRange && align <= fireCone;
  return { steerX: steer.x, steerY: steer.y, aim, fire, distance, align };
}

/**
 * Straight-line bomber run toward `goalY`, weaving so it is not a static target.
 * `phase` keeps each bomber's weave independent.
 */
export function planBombRun(self, goalY, phase = 0, cfg = {}) {
  const amplitude = cfg.amplitude ?? 0.55;
  const dir = goalY >= self.y ? 1 : -1;
  const sway = Math.sin(phase) * amplitude;
  const steer = normalize(sway, dir);
  return { steerX: steer.x, steerY: steer.y };
}

/** Defensive turret (bomber gunner, patrol-boat flak): only aim + trigger. */
export function planTurret(self, target, cfg = {}) {
  const bulletSpeed = cfg.bulletSpeed ?? 300;
  const range = cfg.range ?? 300;
  const aimPoint = leadTarget(self, target, bulletSpeed);
  const distance = Math.hypot(target.x - self.x, target.y - self.y);
  return {
    aim: Math.atan2(aimPoint.y - self.y, aimPoint.x - self.x),
    fire: distance <= range,
    distance,
  };
}

/** Escort craft prefer soft targets; everything else hunts the player. */
export function pickTarget(enemy, player, allies) {
  if (enemy.prefersAllies) {
    let best = null;
    let bestD = Infinity;
    for (const ally of allies) {
      if (!ally.alive) continue;
      const d = Math.hypot(ally.x - enemy.x, ally.y - enemy.y);
      if (d < bestD) {
        bestD = d;
        best = ally;
      }
    }
    if (best) return best;
  }
  return player.alive ? player : null;
}

/**
 * Break turn when someone is on your six: returns a steer that pulls away from
 * the threat. Used by the ace to shake the player off.
 */
export function planBreak(self, threat) {
  const away = normalize(self.x - threat.x, self.y - threat.y);
  const perp = { x: -away.y, y: away.x };
  const steer = normalize(away.x + perp.x * 0.85, away.y + perp.y * 0.85);
  return { steerX: steer.x, steerY: steer.y };
}

/** True when `threat` is behind `self` and close — i.e. `self` is being gunned. */
export function isTailed(self, threat, cone = 0.6, range = 300) {
  const dx = threat.x - self.x;
  const dy = threat.y - self.y;
  if (Math.hypot(dx, dy) > range) return false;
  const bearing = Math.atan2(dy, dx);
  return Math.abs(angleDiff(self.heading, bearing)) > Math.PI - cone;
}

export { inFiringCone };
