/** Floating analog stick: the first touch sets the centre, so nothing to aim at. */
export const STICK = { radius: 62, deadzone: 0.16 };

/**
 * Convert a touch position into a normalised move vector.
 * Values ramp from 0 at the deadzone edge to 1 at the ring, so slow nudges work.
 */
export function stickVector(center, point, cfg = STICK) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0, force: 0 };
  const raw = Math.min(1, dist / cfg.radius);
  if (raw < cfg.deadzone) return { x: 0, y: 0, force: 0 };
  const force = (raw - cfg.deadzone) / (1 - cfg.deadzone);
  return { x: (dx / dist) * force, y: (dy / dist) * force, force };
}

/** Where to draw the knob: clamped inside the ring. */
export function knobOffset(center, point, cfg = STICK) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= cfg.radius) return { x: dx, y: dy };
  return { x: (dx / dist) * cfg.radius, y: (dy / dist) * cfg.radius };
}

/** Keyboard axes from a held-key set; diagonals stay inside the unit circle. */
export function keyboardVector(keys) {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) y += 1;
  const l = Math.hypot(x, y);
  if (l > 1) return { x: x / l, y: y / l };
  return { x, y };
}

export const FIRE_KEYS = new Set(["Space", "KeyJ", "KeyZ"]);
export const FLARE_KEYS = new Set(["KeyK", "KeyX", "ShiftLeft", "ShiftRight"]);
