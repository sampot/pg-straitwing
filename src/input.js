import { FIRE_KEYS, FLARE_KEYS, keyboardVector, knobOffset, STICK, stickVector } from "./stick.js";

/**
 * One input object fed by keyboard and touch alike; the simulation only ever
 * reads `{ moveX, moveY, primary, secondary }`.
 */
export function createInput({ stickZone, fireButton, flareButton, target = window }) {
  const input = { moveX: 0, moveY: 0, primary: false, secondary: false };
  const keys = new Set();
  const stick = { active: false, pointerId: null, cx: 0, cy: 0, px: 0, py: 0 };
  const touch = { fire: false, flare: false };
  const listeners = [];

  function on(el, type, fn, opts) {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    listeners.push([el, type, fn, opts]);
  }

  function sync() {
    if (stick.active) {
      const v = stickVector({ x: stick.cx, y: stick.cy }, { x: stick.px, y: stick.py });
      input.moveX = v.x;
      input.moveY = v.y;
    } else {
      const v = keyboardVector(keys);
      input.moveX = v.x;
      input.moveY = v.y;
    }
    input.primary = touch.fire || [...FIRE_KEYS].some((k) => keys.has(k));
    input.secondary = touch.flare || [...FLARE_KEYS].some((k) => keys.has(k));
  }

  function reset() {
    keys.clear();
    touch.fire = false;
    touch.flare = false;
    stick.active = false;
    stick.pointerId = null;
    input.moveX = 0;
    input.moveY = 0;
    input.primary = false;
    input.secondary = false;
    if (stickZone) stickZone.removeAttribute("data-active");
    fireButton?.removeAttribute("data-active");
    flareButton?.removeAttribute("data-active");
  }

  on(target, "keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Tab") return;
    keys.add(e.code);
    if (FIRE_KEYS.has(e.code) || FLARE_KEYS.has(e.code) || e.code.startsWith("Arrow")) e.preventDefault();
    sync();
  });
  on(target, "keyup", (e) => {
    keys.delete(e.code);
    sync();
  });
  on(target, "blur", reset);
  on(document, "visibilitychange", () => {
    if (document.hidden) reset();
  });

  on(
    stickZone,
    "pointerdown",
    (e) => {
      if (stick.active) return;
      stick.active = true;
      stick.pointerId = e.pointerId;
      stick.cx = e.clientX;
      stick.cy = e.clientY;
      stick.px = e.clientX;
      stick.py = e.clientY;
      stickZone.setAttribute("data-active", "");
      placeKnob();
      try {
        stickZone.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; move handlers still fire */
      }
      e.preventDefault();
      sync();
    },
    { passive: false },
  );
  on(stickZone, "pointermove", (e) => {
    if (!stick.active || e.pointerId !== stick.pointerId) return;
    stick.px = e.clientX;
    stick.py = e.clientY;
    placeKnob();
    sync();
  });
  const endStick = (e) => {
    if (!stick.active || (e && e.pointerId !== stick.pointerId)) return;
    stick.active = false;
    stick.pointerId = null;
    stickZone.removeAttribute("data-active");
    sync();
  };
  on(stickZone, "pointerup", endStick);
  on(stickZone, "pointercancel", endStick);
  on(stickZone, "lostpointercapture", endStick);

  function placeKnob() {
    if (!stickZone) return;
    const rect = stickZone.getBoundingClientRect();
    const knob = knobOffset({ x: stick.cx, y: stick.cy }, { x: stick.px, y: stick.py });
    stickZone.style.setProperty("--stick-x", `${stick.cx - rect.left}px`);
    stickZone.style.setProperty("--stick-y", `${stick.cy - rect.top}px`);
    stickZone.style.setProperty("--knob-x", `${knob.x}px`);
    stickZone.style.setProperty("--knob-y", `${knob.y}px`);
    stickZone.style.setProperty("--stick-r", `${STICK.radius}px`);
  }

  function bindButton(el, flag) {
    if (!el) return;
    const down = (e) => {
      touch[flag] = true;
      el.setAttribute("data-active", "");
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
      sync();
    };
    const up = () => {
      touch[flag] = false;
      el.removeAttribute("data-active");
      sync();
    };
    on(el, "pointerdown", down, { passive: false });
    on(el, "pointerup", up);
    on(el, "pointercancel", up);
    on(el, "lostpointercapture", up);
  }
  bindButton(fireButton, "fire");
  bindButton(flareButton, "flare");

  function destroy() {
    for (const [el, type, fn, opts] of listeners) el.removeEventListener(type, fn, opts);
    listeners.length = 0;
    reset();
  }

  return { input, reset, destroy, sync };
}
