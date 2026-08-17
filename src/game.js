import {
  applyDamage,
  bodiesHit,
  canFire,
  commitFire,
  createGun,
  makeBullet,
  updateGun,
} from "./combat.js";
import { isTailed, pickTarget, planBombRun, planBreak, planPursuit, planTurret } from "./ai.js";
import { getLevel, LEVEL_COUNT } from "./levels.js";
import {
  ALLY_KINDS,
  ENEMY_KINDS,
  PICKUP_KINDS,
  PICKUP_TABLE,
  PLAYER,
  scaleStats,
  WORLD,
} from "./units.js";
import { clamp, normalize, rand, randRange, turnToward } from "./vec.js";

export const MAX_BULLETS = 400;
export const DROP_CHANCE = 0.32;

const NEUTRAL_INPUT = { moveX: 0, moveY: 0, primary: false, secondary: false };

function makePlayer() {
  return {
    x: WORLD.w / 2,
    y: WORLD.h - 380,
    vx: 0,
    vy: -120,
    heading: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    r: PLAYER.r,
    gun: createGun(),
    flares: PLAYER.flares,
    flareCd: 0,
    invuln: PLAYER.spawnInvuln,
    hitFlash: 0,
    alive: true,
  };
}

export function createGame({ seed = 1, levelIndex = 0, score = 0 } = {}) {
  const state = {
    rngSeed: seed | 0,
    seed: seed | 0,
    levelIndex: clamp(levelIndex, 0, LEVEL_COUNT - 1),
    phase: "briefing",
    outcome: "playing",
    failReason: "",
    time: 0,
    levelTime: 0,
    tick: 0,
    player: makePlayer(),
    enemies: [],
    allies: [],
    bullets: [],
    pickups: [],
    effects: [],
    spawnQueue: [],
    spawnTimer: 0,
    maxAlive: 3,
    spawnInterval: 3,
    nextId: 1,
    kills: 0,
    levelKills: 0,
    score,
    levelScore: 0,
    delivered: 0,
    allyLost: 0,
    allyTotal: 0,
    alliesAlive: 0,
    targetsDown: 0,
    targetTotal: 0,
    bombersDown: 0,
    leaks: 0,
    bossHp: 0,
    bossMaxHp: 0,
    bossDown: false,
    shake: 0,
    message: "",
    messageT: 0,
    events: [],
    secondaryHeld: false,
    clearBonus: 0,
  };
  return state;
}

/** Arm the current level: spawn its scripted units and queue reinforcements. */
export function startLevel(state) {
  const level = getLevel(state.levelIndex);
  state.phase = "playing";
  state.levelTime = 0;
  state.levelKills = 0;
  state.levelScore = 0;
  state.enemies = [];
  state.allies = [];
  state.bullets = [];
  state.pickups = [];
  state.effects = [];
  state.delivered = 0;
  state.allyLost = 0;
  state.targetsDown = 0;
  state.targetTotal = 0;
  state.bombersDown = 0;
  state.leaks = 0;
  state.bossDown = false;
  state.bossHp = 0;
  state.bossMaxHp = 0;
  state.clearBonus = 0;
  state.levelStartScore = state.score;
  state.player = makePlayer();

  for (const spec of level.allies || []) {
    state.allies.push(spawnAlly(state, spec));
  }
  state.allyTotal = state.allies.length;
  state.alliesAlive = state.allies.length;

  for (const spec of level.statics || []) {
    spawnEnemy(state, spec.kind, spec);
    if (spec.isTarget) state.targetTotal += 1;
  }

  const rein = level.reinforcements || { queue: [], maxAlive: 3, interval: 3 };
  state.spawnQueue = [...rein.queue];
  state.maxAlive = rein.maxAlive;
  state.spawnInterval = rein.interval;
  state.spawnTimer = 1.2;
  state.message = level.hint || "";
  state.messageT = 5;
  state.events.push({ type: "levelStart", level: state.levelIndex });
  return state;
}

function spawnAlly(state, spec) {
  const base = ALLY_KINDS[spec.kind];
  return {
    id: state.nextId++,
    kind: spec.kind,
    stats: base,
    sprite: base.sprite,
    x: spec.x,
    y: spec.y,
    vx: 0,
    vy: base.speed,
    heading: Math.PI / 2,
    hp: base.hp,
    maxHp: base.hp,
    r: base.r,
    hitFlash: 0,
    invuln: 0,
    alive: true,
    delivered: false,
    sway: randRange(state, 0, Math.PI * 2),
  };
}

export function spawnEnemy(state, kind, spec = {}) {
  const level = getLevel(state.levelIndex);
  const base = ENEMY_KINDS[kind];
  const stats = scaleStats(base, level.scale);
  // Bombers start off the north edge and run the gauntlet; everyone else drops
  // in over the northern half of the strait.
  const defaultY = base.runsSouth ? randRange(state, -110, -50) : randRange(state, 60, 240);
  const enemy = {
    id: state.nextId++,
    kind,
    stats,
    sprite: base.sprite,
    prefersAllies: !!base.prefersAllies,
    isTarget: !!spec.isTarget,
    isBoss: !!spec.isBoss || !!base.boss,
    x: spec.x ?? randRange(state, 140, WORLD.w - 140),
    y: spec.y ?? defaultY,
    vx: 0,
    vy: spec.y === undefined ? stats.maxSpeed * 0.6 : 0,
    heading: Math.PI / 2,
    hp: stats.hp,
    maxHp: stats.hp,
    r: stats.r,
    fireCd: randRange(state, 0.4, 1.2),
    burstLeft: 0,
    burstCd: 0,
    aim: Math.PI / 2,
    phase: randRange(state, 0, Math.PI * 2),
    breakT: 0,
    hitFlash: 0,
    invuln: 0,
    alive: true,
  };
  state.enemies.push(enemy);
  if (enemy.isBoss) {
    state.bossHp = enemy.hp;
    state.bossMaxHp = enemy.maxHp;
  }
  return enemy;
}

function integrate(body, stats, ax, ay, dt) {
  body.vx += ax * dt;
  body.vy += ay * dt;
  const drag = Math.max(0, 1 - stats.drag * dt);
  body.vx *= drag;
  body.vy *= drag;
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > stats.maxSpeed) {
    body.vx = (body.vx / speed) * stats.maxSpeed;
    body.vy = (body.vy / speed) * stats.maxSpeed;
  }
  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

function keepInBounds(body, bounce = 0.2) {
  const m = WORLD.margin;
  if (body.x < m) {
    body.x = m;
    body.vx = Math.abs(body.vx) * bounce;
  } else if (body.x > WORLD.w - m) {
    body.x = WORLD.w - m;
    body.vx = -Math.abs(body.vx) * bounce;
  }
  if (body.y < m) {
    body.y = m;
    body.vy = Math.abs(body.vy) * bounce;
  } else if (body.y > WORLD.h - m) {
    body.y = WORLD.h - m;
    body.vy = -Math.abs(body.vy) * bounce;
  }
}

function updatePlayer(state, input, dt) {
  const p = state.player;
  if (!p.alive) return;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.flareCd = Math.max(0, p.flareCd - dt);

  const ix = clamp(input.moveX || 0, -1, 1);
  const iy = clamp(input.moveY || 0, -1, 1);
  const mag = Math.min(1, Math.hypot(ix, iy));
  let ax = 0;
  let ay = 0;
  if (mag > 0.08) {
    const dir = normalize(ix, iy);
    ax = dir.x * PLAYER.accel * mag;
    ay = dir.y * PLAYER.accel * mag;
    p.heading = turnToward(p.heading, Math.atan2(dir.y, dir.x), PLAYER.turn * dt);
  }
  integrate(p, PLAYER, ax, ay, dt);

  // A fighter never hovers: it always keeps flying wherever its nose points.
  const minSpeed = 95;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed < minSpeed) {
    p.vx += Math.cos(p.heading) * (minSpeed - speed);
    p.vy += Math.sin(p.heading) * (minSpeed - speed);
  }
  keepInBounds(p, 0.1);

  updateGun(p.gun, dt);
  if (input.primary && canFire(p.gun)) {
    commitFire(p.gun);
    firePlayerGuns(state, p);
  }

  const wantFlare = !!input.secondary;
  if (wantFlare && !state.secondaryHeld) popFlare(state, p);
  state.secondaryHeld = wantFlare;
}

function firePlayerGuns(state, p) {
  const nx = Math.cos(p.heading);
  const ny = Math.sin(p.heading);
  for (const side of [-1, 1]) {
    const ox = -ny * 9 * side;
    const oy = nx * 9 * side;
    pushBullet(
      state,
      makeBullet(p.x + ox + nx * 14, p.y + oy + ny * 14, p.heading, PLAYER.bulletSpeed, "player", PLAYER.bulletDmg, {
        inheritVx: p.vx * 0.3,
        inheritVy: p.vy * 0.3,
        life: 1.1,
      }),
    );
  }
  state.events.push({ type: "gun" });
}

export function popFlare(state, p) {
  if (p.flares <= 0 || p.flareCd > 0) {
    state.events.push({ type: "denied" });
    return false;
  }
  p.flares -= 1;
  p.flareCd = PLAYER.flareCooldown;
  p.invuln = Math.max(p.invuln, PLAYER.flareInvuln);
  let burned = 0;
  state.bullets = state.bullets.filter((b) => {
    if (b.team !== "enemy") return true;
    const inside = Math.hypot(b.x - p.x, b.y - p.y) <= PLAYER.flareRadius;
    if (inside) burned += 1;
    return !inside;
  });
  state.effects.push({ kind: "flare", x: p.x, y: p.y, t: 0, dur: 0.5 });
  state.events.push({ type: "flare", burned });
  return true;
}

function startBurst(enemy, aim) {
  enemy.aim = aim;
  enemy.burstLeft = enemy.stats.burst;
  enemy.burstCd = 0;
  enemy.fireCd = enemy.stats.fireInterval;
}

function emitEnemyBullet(state, enemy) {
  const stats = enemy.stats;
  const shots = stats.spread || 1;
  const arc = stats.spreadArc || 0;
  for (let i = 0; i < shots; i++) {
    const offset = shots === 1 ? 0 : (i - (shots - 1) / 2) * arc;
    pushBullet(
      state,
      makeBullet(enemy.x, enemy.y, enemy.aim + offset, stats.bulletSpeed, "enemy", stats.dmg, {
        life: stats.naval ? 2.4 : 1.8,
        kind: stats.naval ? "flak" : "tracer",
        r: stats.naval ? 6 : 4,
      }),
    );
  }
  enemy.burstLeft -= 1;
  enemy.burstCd = stats.burstGap;
  state.events.push({ type: "enemyGun", naval: !!stats.naval });
}

function updateEnemies(state, dt) {
  const p = state.player;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.fireCd = Math.max(0, e.fireCd - dt);
    e.burstCd = Math.max(0, e.burstCd - dt);
    e.breakT = Math.max(0, e.breakT - dt);
    e.phase += dt * 1.4;

    const stats = e.stats;
    const target = pickTarget(e, p, state.allies);
    let steerX = 0;
    let steerY = 0;
    let wantFire = false;
    let aim = e.aim;

    if (stats.naval) {
      const sway = Math.sin(e.phase * 0.35);
      steerX = sway;
      steerY = Math.cos(e.phase * 0.21) * 0.3;
      if (target) {
        const t = planTurret(e, target, { bulletSpeed: stats.bulletSpeed, range: stats.fireRange });
        aim = t.aim;
        wantFire = t.fire;
        e.heading = turnToward(e.heading, t.aim, 1.4 * dt);
      }
    } else if (stats.runsSouth) {
      const run = planBombRun(e, WORLD.leakY + 60, e.phase);
      steerX = run.steerX;
      steerY = run.steerY;
      if (target) {
        const t = planTurret(e, target, { bulletSpeed: stats.bulletSpeed, range: stats.fireRange });
        aim = t.aim;
        wantFire = t.fire;
      }
    } else if (target) {
      if (e.isBoss && e.breakT <= 0 && isTailed(e, p) && rand(state) < 0.02) {
        e.breakT = 1.1;
        state.events.push({ type: "bossBreak" });
      }
      if (e.breakT > 0) {
        const br = planBreak(e, p);
        steerX = br.steerX;
        steerY = br.steerY;
      } else {
        const plan = planPursuit(e, target, {
          bulletSpeed: stats.bulletSpeed,
          fireRange: stats.fireRange,
          fireCone: stats.fireCone,
          standoff: e.isBoss ? 110 : 78,
        });
        steerX = plan.steerX;
        steerY = plan.steerY;
        aim = plan.aim;
        wantFire = plan.fire;
      }
    } else {
      steerY = 1;
    }

    integrate(e, stats, steerX * stats.accel, steerY * stats.accel, dt);
    if (!stats.runsSouth) keepInBounds(e, 0.3);
    if (!stats.naval) {
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > 12) e.heading = turnToward(e.heading, Math.atan2(e.vy, e.vx), stats.turn * dt);
    }

    if (wantFire && e.fireCd <= 0 && e.burstLeft <= 0) startBurst(e, aim);
    if (e.burstLeft > 0 && e.burstCd <= 0) emitEnemyBullet(state, e);

    if (stats.runsSouth && e.y >= WORLD.leakY) {
      e.alive = false;
      e.leaked = true;
      state.leaks += 1;
      state.events.push({ type: "leak" });
      state.message = "轟炸機突破！";
      state.messageT = 2.4;
    }
    if (e.isBoss) state.bossHp = e.hp;
  }
}

function updateAllies(state, dt) {
  let alive = 0;
  for (const a of state.allies) {
    if (!a.alive) continue;
    a.hitFlash = Math.max(0, a.hitFlash - dt);
    a.sway += dt * 0.9;
    a.vx = Math.sin(a.sway) * 26;
    a.vy = a.stats.speed;
    a.x = clamp(a.x + a.vx * dt, WORLD.margin, WORLD.w - WORLD.margin);
    a.y += a.vy * dt;
    a.heading = Math.atan2(a.vy, a.vx);
    if (a.y >= WORLD.exitY) {
      a.alive = false;
      a.delivered = true;
      state.delivered += 1;
      state.score += a.stats.score;
      state.events.push({ type: "delivered" });
      state.message = "運補機進港！";
      state.messageT = 2.4;
      continue;
    }
    alive += 1;
  }
  state.alliesAlive = alive;
}

function pushBullet(state, bullet) {
  if (state.bullets.length >= MAX_BULLETS) state.bullets.shift();
  state.bullets.push(bullet);
}

function updateBullets(state, dt) {
  const p = state.player;
  const kept = [];
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -60 || b.x > WORLD.w + 60 || b.y < -120 || b.y > WORLD.h + 120) continue;

    let consumed = false;
    if (b.team === "player") {
      for (const e of state.enemies) {
        if (!e.alive || !bodiesHit(b, e)) continue;
        const died = applyDamage(e, b.dmg);
        state.events.push({ type: "hitEnemy" });
        if (died) killEnemy(state, e);
        consumed = true;
        break;
      }
    } else {
      if (p.alive && p.invuln <= 0 && bodiesHit(b, p)) {
        const died = applyDamage(p, b.dmg);
        state.shake = Math.min(14, state.shake + 4);
        state.events.push({ type: "hitPlayer" });
        if (died) downPlayer(state);
        consumed = true;
      }
      if (!consumed) {
        for (const a of state.allies) {
          if (!a.alive || !bodiesHit(b, a)) continue;
          const died = applyDamage(a, b.dmg);
          state.events.push({ type: "hitAlly" });
          if (died) loseAlly(state, a);
          consumed = true;
          break;
        }
      }
    }
    if (!consumed) kept.push(b);
  }
  state.bullets = kept;
}

function updateCollisions(state) {
  const p = state.player;
  if (!p.alive) return;
  for (const e of state.enemies) {
    if (!e.alive || !e.stats.ram || !bodiesHit(p, e)) continue;
    const died = applyDamage(p, e.stats.ram);
    state.shake = Math.min(18, state.shake + 7);
    state.events.push({ type: "collide" });
    if (died) {
      downPlayer(state);
      return;
    }
    if (applyDamage(e, 14)) killEnemy(state, e);
  }
}

function updatePickups(state, dt) {
  const p = state.player;
  const kept = [];
  for (const item of state.pickups) {
    item.life -= dt;
    item.y += 12 * dt;
    if (item.life <= 0) continue;
    if (p.alive && bodiesHit(item, p)) {
      applyPickup(state, item.kind);
      continue;
    }
    kept.push(item);
  }
  state.pickups = kept;
}

export function applyPickup(state, kind) {
  const def = PICKUP_KINDS[kind];
  const p = state.player;
  if (def.hp) p.hp = Math.min(p.maxHp, p.hp + def.hp);
  if (def.flares) p.flares += def.flares;
  if (def.cool) {
    p.gun.heat = 0;
    p.gun.locked = false;
  }
  state.score += 40;
  state.message = `${def.label} 補給`;
  state.messageT = 1.8;
  state.events.push({ type: "pickup", kind });
  return p;
}

function maybeDrop(state, enemy) {
  if (rand(state) > DROP_CHANCE) return;
  const kind = PICKUP_TABLE[Math.floor(rand(state) * PICKUP_TABLE.length)] || "cool";
  state.pickups.push({
    kind,
    sprite: PICKUP_KINDS[kind].sprite,
    x: enemy.x,
    y: enemy.y,
    r: 18,
    life: 15,
  });
}

function killEnemy(state, e) {
  const stats = e.stats;
  state.kills += 1;
  state.levelKills += 1;
  state.score += stats.score;
  state.levelScore += stats.score;
  if (e.isTarget) state.targetsDown += 1;
  if (stats.runsSouth) state.bombersDown += 1;
  if (e.isBoss) {
    state.bossDown = true;
    state.bossHp = 0;
  }
  const big = e.isBoss || stats.hp >= 40;
  state.effects.push({
    kind: stats.naval ? "splash" : "blast",
    x: e.x,
    y: e.y,
    t: 0,
    dur: big ? 0.7 : 0.45,
    scale: big ? 2.1 : 1.2,
  });
  state.shake = Math.min(20, state.shake + (big ? 10 : 4));
  state.events.push({ type: "explode", big });
  maybeDrop(state, e);
}

function loseAlly(state, ally) {
  state.allyLost += 1;
  state.effects.push({ kind: "blast", x: ally.x, y: ally.y, t: 0, dur: 0.6, scale: 1.7 });
  state.events.push({ type: "allyLost" });
  state.message = "運補機被擊落！";
  state.messageT = 2.4;
}

function downPlayer(state) {
  const p = state.player;
  p.alive = false;
  state.effects.push({ kind: "blast", x: p.x, y: p.y, t: 0, dur: 0.9, scale: 2.6 });
  state.shake = 24;
  state.events.push({ type: "playerDown" });
}

function updateEffects(state, dt) {
  const kept = [];
  for (const fx of state.effects) {
    fx.t += dt;
    if (fx.t < fx.dur) kept.push(fx);
  }
  state.effects = kept;
}

function maybeSpawn(state, dt) {
  if (!state.spawnQueue.length) return;
  state.spawnTimer -= dt;
  const alive = state.enemies.reduce((n, e) => n + (e.alive && !e.isBoss ? 1 : 0), 0);
  if (state.spawnTimer > 0 || alive >= state.maxAlive) return;
  spawnEnemy(state, state.spawnQueue.shift());
  state.spawnTimer = state.spawnInterval;
}

function clearLevel(state) {
  const p = state.player;
  const timeBonus = Math.max(0, Math.round(120 - state.levelTime) * 5);
  const bonus = 500 + p.hp * 4 + p.flares * 40 + timeBonus;
  state.clearBonus = bonus;
  state.score += bonus;
  state.phase = "levelClear";
  state.events.push({ type: "levelClear", level: state.levelIndex });
  if (state.levelIndex >= LEVEL_COUNT - 1) {
    state.outcome = "won";
    state.events.push({ type: "campaignWon" });
  }
}

function failLevel(state, reason) {
  state.phase = "lost";
  state.outcome = "lost";
  state.failReason = reason;
  state.events.push({ type: "levelFailed" });
}

/** Objective bookkeeping; runs once per simulation step. */
export function evaluateObjective(state) {
  if (state.phase !== "playing") return state.phase;
  const level = getLevel(state.levelIndex);
  const o = level.objective;

  if (!state.player.alive) {
    failLevel(state, "你的座機被擊落，墜入海峽。");
    return state.phase;
  }

  switch (o.kind) {
    case "kills":
      if (state.levelKills >= o.target) clearLevel(state);
      break;
    case "escort": {
      const resolved = state.delivered + state.allyLost >= state.allyTotal;
      if (resolved) {
        if (state.delivered >= o.need) clearLevel(state);
        else failLevel(state, "運補機全數被擊落，補給線斷了。");
      }
      break;
    }
    case "targets":
      if (state.targetTotal > 0 && state.targetsDown >= state.targetTotal) clearLevel(state);
      break;
    case "interceptRun":
      if (state.leaks > o.allowedLeaks) {
        failLevel(state, "轟炸機突破防線，港口挨了炸。");
      } else if (state.bombersDown + state.leaks >= o.target) {
        clearLevel(state);
      }
      break;
    case "boss":
      if (state.bossDown) clearLevel(state);
      break;
    default:
      break;
  }
  return state.phase;
}

/**
 * Advance the simulation by `dt` seconds. Mutates and returns `state` — the sim
 * runs 60×/s, so cloning entity arrays every frame would be pure waste.
 */
export function step(state, input = NEUTRAL_INPUT, dt = 1 / 60) {
  if (state.phase !== "playing") return state;
  const d = clamp(dt, 0, 1 / 30);
  state.tick += 1;
  state.time += d;
  state.levelTime += d;
  state.messageT = Math.max(0, state.messageT - d);
  state.shake = Math.max(0, state.shake - d * 32);

  updatePlayer(state, input, d);
  updateEnemies(state, d);
  updateAllies(state, d);
  updateBullets(state, d);
  updateCollisions(state);
  updatePickups(state, d);
  updateEffects(state, d);
  maybeSpawn(state, d);
  evaluateObjective(state);

  if (state.enemies.length > 60) state.enemies = state.enemies.filter((e) => e.alive);
  // Guard against a consumer that never drains the event queue.
  if (state.events.length > 300) state.events.splice(0, state.events.length - 300);
  return state;
}

/** Move from a cleared level to the next briefing (or leave the campaign won). */
export function advanceLevel(state) {
  if (state.phase !== "levelClear") return state;
  if (state.levelIndex >= LEVEL_COUNT - 1) {
    state.phase = "won";
    state.outcome = "won";
    return state;
  }
  state.levelIndex += 1;
  state.phase = "briefing";
  state.message = "";
  state.messageT = 0;
  return state;
}

export function getOutcome(state) {
  if (state.phase === "won") return "won";
  if (state.phase === "lost") return "lost";
  return "playing";
}

export function summarize(state) {
  const level = getLevel(state.levelIndex);
  return {
    level: state.levelIndex + 1,
    levelName: level.name,
    levelTotal: LEVEL_COUNT,
    phase: state.phase,
    outcome: state.outcome,
    hp: Math.max(0, Math.round(state.player.hp)),
    maxHp: state.player.maxHp,
    heat: state.player.gun.heat,
    overheated: state.player.gun.locked,
    flares: state.player.flares,
    score: state.score,
    kills: state.kills,
    enemies: state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0),
    remaining: state.spawnQueue.length,
    message: state.messageT > 0 ? state.message : "",
  };
}
