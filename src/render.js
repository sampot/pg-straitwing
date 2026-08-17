import { WORLD } from "./units.js";
import { clamp } from "./vec.js";

export const SPRITE_FILES = {
  "plane-player": "plane-player.png",
  "plane-fighter": "plane-fighter.png",
  "plane-heavy": "plane-heavy.png",
  "plane-bomber": "plane-bomber.png",
  "plane-ace": "plane-ace.png",
  "plane-transport": "plane-transport.png",
  bullet: "bullet.png",
  "blast-0": "blast-0.png",
  "blast-1": "blast-1.png",
  "blast-2": "blast-2.png",
  "blast-3": "blast-3.png",
  "pickup-repair": "pickup-repair.png",
  "pickup-flare": "pickup-flare.png",
  "pickup-cool": "pickup-cool.png",
  fire: "fire.png",
};

const PLANE_SIZE = {
  "plane-player": 46,
  "plane-fighter": 40,
  "plane-heavy": 48,
  "plane-bomber": 58,
  "plane-ace": 52,
  "plane-transport": 52,
};

/** Hand-placed islands: stable landmarks so the strait reads the same every run. */
const ISLANDS = [
  { x: 200, y: 1560, rx: 165, ry: 96 },
  { x: 1020, y: 1290, rx: 120, ry: 84 },
  { x: 430, y: 980, rx: 92, ry: 62 },
  { x: 880, y: 700, rx: 74, ry: 52 },
  { x: 150, y: 420, rx: 108, ry: 66 },
  { x: 700, y: 180, rx: 86, ry: 54 },
];

export function loadSprites(base = "./assets/images/") {
  const sprites = {};
  for (const [key, file] of Object.entries(SPRITE_FILES)) {
    const img = new Image();
    img.src = base + file;
    sprites[key] = img;
  }
  return sprites;
}

export function createRenderer(canvas, sprites) {
  const ctx = canvas.getContext("2d");
  const cam = { x: 0, y: 0 };

  function viewport() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || canvas.width || 360;
    const cssH = rect.height || canvas.height || 640;
    const aspect = cssW / cssH;
    let h = 690;
    let w = h * aspect;
    if (w > 1080) {
      w = 1080;
      h = w / aspect;
    }
    if (w < 330) {
      w = 330;
      h = w / aspect;
    }
    return { cssW, cssH, w, h, scale: cssW / w };
  }

  function resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round((rect.width || 360) * dpr));
    const h = Math.max(1, Math.round((rect.height || 640) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  }

  function sea(view, time) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, "#0a3550");
    g.addColorStop(0.55, "#0f5773");
    g.addColorStop(1, "#146b83");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    // Wave streaks on a world-aligned grid so they scroll with the camera.
    ctx.strokeStyle = "rgba(210, 244, 255, 0.13)";
    ctx.lineWidth = 2;
    const step = 90;
    const startY = Math.floor(cam.y / step) * step;
    const startX = Math.floor(cam.x / step) * step;
    ctx.beginPath();
    for (let wy = startY; wy < cam.y + view.h + step; wy += step) {
      for (let wx = startX; wx < cam.x + view.w + step; wx += step) {
        const jitter = ((wx * 13 + wy * 7) % 97) / 97;
        const sx = wx + jitter * 60;
        const sy = wy + ((wx * 31 + wy * 17) % 71) * 0.6 + Math.sin(time * 0.9 + jitter * 6) * 3;
        ctx.moveTo(sx - cam.x, sy - cam.y);
        ctx.lineTo(sx - cam.x + 22 + jitter * 14, sy - cam.y);
      }
    }
    ctx.stroke();
  }

  function islands(view) {
    for (const isle of ISLANDS) {
      const x = isle.x - cam.x;
      const y = isle.y - cam.y;
      if (x < -260 || x > view.w + 260 || y < -220 || y > view.h + 220) continue;
      ctx.fillStyle = "rgba(150, 226, 235, 0.30)";
      ellipse(x, y, isle.rx * 1.28, isle.ry * 1.3);
      ctx.fillStyle = "#e2cf9b";
      ellipse(x, y, isle.rx, isle.ry);
      ctx.fillStyle = "#2f8b5d";
      ellipse(x, y, isle.rx * 0.78, isle.ry * 0.74);
      ctx.fillStyle = "#246f4c";
      ellipse(x - isle.rx * 0.2, y - isle.ry * 0.18, isle.rx * 0.34, isle.ry * 0.3);
    }
  }

  function coasts(view) {
    // Home shore to the south: what the transports are running for.
    const homeY = WORLD.exitY - cam.y;
    if (homeY < view.h + 40) {
      ctx.fillStyle = "rgba(150, 226, 235, 0.34)";
      ctx.fillRect(0, homeY - 26, view.w, view.h - homeY + 80);
      ctx.fillStyle = "#e2cf9b";
      ctx.fillRect(0, homeY, view.w, view.h - homeY + 60);
      ctx.fillStyle = "#2f8b5d";
      ctx.fillRect(0, homeY + 26, view.w, view.h - homeY + 60);
      ctx.fillStyle = "#f5f7e8";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillText("我方港口", 16, homeY + 18);
    }
    // Enemy shore to the north.
    const enemyY = 0 - cam.y;
    if (enemyY > -60) {
      ctx.fillStyle = "#5a4a52";
      ctx.fillRect(0, enemyY - 70, view.w, 62);
      ctx.fillStyle = "rgba(255, 138, 128, 0.5)";
      ctx.fillRect(0, enemyY - 12, view.w, 6);
    }
  }

  function clouds(view, time) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.13)";
    const parallax = 0.72;
    const step = 260;
    const ox = cam.x * parallax;
    const oy = cam.y * parallax - time * 8;
    const startY = Math.floor(oy / step) * step;
    const startX = Math.floor(ox / step) * step;
    for (let wy = startY; wy < oy + view.h + step; wy += step) {
      for (let wx = startX; wx < ox + view.w + step; wx += step) {
        const seed = ((wx * 7 + wy * 11) % 211) / 211;
        if (seed < 0.42) continue;
        const cx = wx - ox + seed * 120;
        const cy = wy - oy + ((wx * 5 + wy * 3) % 89);
        ellipse(cx, cy, 74 + seed * 66, 30 + seed * 22);
      }
    }
  }

  function ellipse(x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function shadow(body, size) {
    ctx.fillStyle = "rgba(4, 26, 40, 0.26)";
    ellipse(body.x - cam.x + 14, body.y - cam.y + 20, size * 0.42, size * 0.3);
  }

  /** Trailing flame so a badly damaged aircraft reads as "nearly finished". */
  function burning(body, size, time) {
    if (body.hp / body.maxHp > 0.35) return;
    const img = sprites.fire;
    if (!img || !img.complete || !img.naturalWidth) return;
    const flicker = 0.7 + Math.sin(time * 22 + body.x) * 0.3;
    const s = size * 0.5 * flicker;
    const x = body.x - cam.x - Math.cos(body.heading) * size * 0.45;
    const y = body.y - cam.y - Math.sin(body.heading) * size * 0.45;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }

  function plane(body, spriteKey, size) {
    const img = sprites[spriteKey];
    ctx.save();
    ctx.translate(body.x - cam.x, body.y - cam.y);
    ctx.rotate(body.heading + Math.PI / 2);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = "#cfe8ff";
      ctx.fillRect(-size / 4, -size / 2, size / 2, size);
    }
    ctx.restore();
    if (body.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 240, 210, ${Math.min(0.75, body.hitFlash * 4)})`;
      ellipse(body.x - cam.x, body.y - cam.y, size * 0.4, size * 0.4);
    }
  }

  function healthBar(body, w = 34) {
    if (body.hp >= body.maxHp) return;
    const x = body.x - cam.x - w / 2;
    const y = body.y - cam.y - 28;
    ctx.fillStyle = "rgba(6, 18, 28, 0.7)";
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = body.hp / body.maxHp > 0.4 ? "#ffd166" : "#ff6b6b";
    ctx.fillRect(x, y, (w * body.hp) / body.maxHp, 5);
  }

  function boat(body) {
    const x = body.x - cam.x;
    const y = body.y - cam.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(230, 250, 255, 0.4)";
    ellipse(0, 14, 30, 12);
    ctx.rotate(body.heading + Math.PI / 2);
    ctx.fillStyle = "#4a5a66";
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(11, -4);
    ctx.lineTo(9, 20);
    ctx.lineTo(-9, 20);
    ctx.lineTo(-11, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9fb0bd";
    ctx.fillRect(-6, -6, 12, 14);
    ctx.fillStyle = "#2c3944";
    ctx.fillRect(-2.5, -20, 5, 12);
    ctx.restore();
    healthBar(body, 40);
  }

  function bullets(view) {
    for (const b of view.state.bullets) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      if (x < -30 || y < -30 || x > view.w + 30 || y > view.h + 30) continue;
      if (b.team === "player") {
        const img = sprites.bullet;
        const angle = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2);
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -5, -11, 10, 22);
        else {
          ctx.fillStyle = "#ffe066";
          ctx.fillRect(-2, -8, 4, 16);
        }
        ctx.restore();
      } else if (b.kind === "flak") {
        ctx.fillStyle = "#ffb347";
        ellipse(x, y, 6, 6);
        ctx.strokeStyle = "rgba(60, 30, 10, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const a = Math.atan2(b.vy, b.vx);
        ctx.strokeStyle = "#ff7b6b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(a) * 13, y - Math.sin(a) * 13);
        ctx.stroke();
      }
    }
  }

  function pickups(state, time) {
    for (const item of state.pickups) {
      const img = sprites[item.sprite];
      const bob = Math.sin(time * 4 + item.x) * 3;
      const x = item.x - cam.x;
      const y = item.y - cam.y + bob;
      const blink = item.life < 4 && Math.floor(item.life * 6) % 2 === 0;
      ctx.globalAlpha = blink ? 0.4 : 1;
      ctx.fillStyle = "rgba(10, 40, 60, 0.45)";
      ellipse(x, y, 18, 18);
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - 14, y - 14, 28, 28);
      ctx.globalAlpha = 1;
    }
  }

  function effects(state) {
    for (const fx of state.effects) {
      const t = fx.t / fx.dur;
      const x = fx.x - cam.x;
      const y = fx.y - cam.y;
      if (fx.kind === "blast") {
        const frame = Math.min(3, Math.floor(t * 4));
        const img = sprites[`blast-${frame}`];
        const size = 40 * (fx.scale || 1) * (0.7 + t * 0.7);
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        else {
          ctx.fillStyle = `rgba(255, 190, 90, ${1 - t})`;
          ellipse(x, y, size / 2, size / 2);
        }
      } else if (fx.kind === "splash") {
        ctx.strokeStyle = `rgba(226, 250, 255, ${1 - t})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, 16 + t * 56 * (fx.scale || 1), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 210, 130, ${0.7 * (1 - t)})`;
        ellipse(x, y, 18 * (1 - t) + 6, 14 * (1 - t) + 5);
      } else if (fx.kind === "flare") {
        ctx.strokeStyle = `rgba(255, 226, 130, ${1 - t})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x, y, 24 + t * 120, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function threatArrows(state, view) {
    const p = state.player;
    const cx = p.x - cam.x;
    const cy = p.y - cam.y;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const x = e.x - cam.x;
      const y = e.y - cam.y;
      if (x > -20 && x < view.w + 20 && y > -20 && y < view.h + 20) continue;
      const angle = Math.atan2(y - cy, x - cx);
      const radius = Math.min(view.w, view.h) * 0.42;
      const ax = clamp(cx + Math.cos(angle) * radius, 20, view.w - 20);
      const ay = clamp(cy + Math.sin(angle) * radius, 20, view.h - 20);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = e.isBoss ? "#ffd166" : "rgba(255, 123, 107, 0.85)";
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, 7);
      ctx.lineTo(-8, -7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function borderWarning(state, view) {
    const p = state.player;
    const near = 150;
    const edges = [
      [p.x - WORLD.margin, "left"],
      [WORLD.w - WORLD.margin - p.x, "right"],
      [p.y - WORLD.margin, "top"],
      [WORLD.h - WORLD.margin - p.y, "bottom"],
    ];
    for (const [dist, side] of edges) {
      if (dist > near) continue;
      const alpha = (1 - dist / near) * 0.35;
      const g =
        side === "left"
          ? ctx.createLinearGradient(0, 0, 90, 0)
          : side === "right"
            ? ctx.createLinearGradient(view.w, 0, view.w - 90, 0)
            : side === "top"
              ? ctx.createLinearGradient(0, 0, 0, 90)
              : ctx.createLinearGradient(0, view.h, 0, view.h - 90);
      g.addColorStop(0, `rgba(255, 90, 80, ${alpha})`);
      g.addColorStop(1, "rgba(255, 90, 80, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function draw(state, time = 0) {
    const dpr = resize();
    const view = viewport();
    view.state = state;

    const p = state.player;
    const lookX = p.x + p.vx * 0.35;
    const lookY = p.y + p.vy * 0.35;
    const targetX = clamp(lookX - view.w / 2, 0, Math.max(0, WORLD.w - view.w));
    const targetY = clamp(lookY - view.h / 2, 0, Math.max(0, WORLD.h - view.h));
    cam.x += (targetX - cam.x) * 0.14;
    cam.y += (targetY - cam.y) * 0.14;

    const shake = state.shake > 0 ? state.shake : 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, sx * dpr, sy * dpr);
    ctx.imageSmoothingEnabled = false;

    sea(view, time);
    islands(view);
    coasts(view);
    clouds(view, time);

    for (const item of state.enemies) {
      if (!item.alive) continue;
      if (item.stats.naval) {
        boat(item);
      } else {
        const size = PLANE_SIZE[item.sprite] || 42;
        shadow(item, size);
      }
    }
    for (const a of state.allies) {
      if (!a.alive) continue;
      shadow(a, 52);
    }
    if (p.alive) shadow(p, 46);

    pickups(state, time);

    for (const a of state.allies) {
      if (!a.alive) continue;
      burning(a, 52, time);
      plane(a, a.sprite, 52);
      healthBar(a, 40);
      ctx.fillStyle = "#9ff2c0";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillText("友機", a.x - cam.x - 12, a.y - cam.y - 32);
    }

    for (const e of state.enemies) {
      if (!e.alive || e.stats.naval) continue;
      const size = PLANE_SIZE[e.sprite] || 42;
      burning(e, size, time);
      plane(e, e.sprite, size);
      healthBar(e, e.isBoss ? 58 : 34);
      if (e.isTarget || e.isBoss) {
        ctx.strokeStyle = e.isBoss ? "rgba(255, 209, 102, 0.9)" : "rgba(255, 138, 128, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x - cam.x, e.y - cam.y, 32, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (p.alive) {
      burning(p, 46, time);
      if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.55;
      plane(p, "plane-player", 46);
      ctx.globalAlpha = 1;
      if (p.invuln > 0) {
        ctx.strokeStyle = "rgba(160, 230, 255, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x - cam.x, p.y - cam.y, 26, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    bullets(view);
    effects(state);
    borderWarning(state, view);
    threatArrows(state, view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { draw, viewport, camera: cam };
}
