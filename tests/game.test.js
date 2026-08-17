import { beforeEach, describe, expect, it } from "vitest";
import { makeBullet } from "../src/combat.js";
import {
  advanceLevel,
  applyPickup,
  createGame,
  getOutcome,
  MAX_BULLETS,
  popFlare,
  spawnEnemy,
  startLevel,
  step,
  summarize,
} from "../src/game.js";
import { WORLD } from "../src/units.js";

const IDLE = { moveX: 0, moveY: 0, primary: false, secondary: false };
const FIRE = { moveX: 0, moveY: 0, primary: true, secondary: false };

/** Start a level ready to fly; `quiet` clears the AI so player tests stay hermetic. */
function armed(levelIndex = 0, { quiet = false, seed = 7 } = {}) {
  const state = createGame({ seed, levelIndex });
  startLevel(state);
  if (quiet) {
    state.spawnQueue.length = 0;
    state.enemies.length = 0;
  }
  state.player.invuln = 0;
  return state;
}

function run(state, seconds, input = IDLE) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) step(state, input, 1 / 60);
  return state;
}

/** Kill a body through the normal damage path (a bullet parked on top of it). */
function destroy(state, body, team = "player") {
  body.hp = 1;
  body.invuln = 0;
  state.bullets.push(makeBullet(body.x, body.y, 0, 0, team, 999, { life: 0.5 }));
  step(state, IDLE, 1 / 120);
  return state;
}

describe("campaign setup", () => {
  it("opens on a briefing with a fresh airframe and an empty sky", () => {
    const state = createGame({ seed: 3 });
    expect(state.phase).toBe("briefing");
    expect(getOutcome(state)).toBe("playing");
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.enemies).toHaveLength(0);
    expect(state.bullets).toHaveLength(0);
  });

  it("arms level 1 with a six-fighter reinforcement queue", () => {
    const state = armed(0);
    expect(state.phase).toBe("playing");
    expect(state.spawnQueue).toHaveLength(6);
    expect(state.spawnQueue.every((k) => k === "fighter")).toBe(true);
    expect(state.message).toBeTruthy();
  });

  it("arms the escort level with three transports in the air", () => {
    const state = armed(1);
    expect(state.allyTotal).toBe(3);
    expect(state.alliesAlive).toBe(3);
    expect(state.allies.every((a) => a.alive)).toBe(true);
  });
});

describe("flying the aircraft", () => {
  let state;
  beforeEach(() => {
    state = armed(0, { quiet: true });
  });

  it("accelerates toward the stick and swings the nose round", () => {
    const startX = state.player.x;
    expect(state.player.heading).toBeCloseTo(-Math.PI / 2, 6);
    run(state, 0.6, { ...IDLE, moveX: 1 });
    expect(state.player.x).toBeGreaterThan(startX + 20);
    // Nose has come round from "north" to "east" within the turn-rate budget.
    expect(Math.abs(state.player.heading)).toBeLessThan(0.4);
  });

  it("never hovers: the fighter keeps flying with no input at all", () => {
    run(state, 1.5, IDLE);
    const speed = Math.hypot(state.player.vx, state.player.vy);
    expect(speed).toBeGreaterThan(80);
  });

  it("keeps the player inside the strait", () => {
    state.player.x = 4;
    state.player.y = 4;
    step(state, IDLE, 1 / 60);
    expect(state.player.x).toBeGreaterThanOrEqual(WORLD.margin - 0.001);
    expect(state.player.y).toBeGreaterThanOrEqual(WORLD.margin - 0.001);
    state.player.x = WORLD.w + 200;
    step(state, IDLE, 1 / 60);
    expect(state.player.x).toBeLessThanOrEqual(WORLD.w - WORLD.margin + 0.001);
  });
});

describe("guns", () => {
  it("fires in bursts, then jams from heat until it cools", () => {
    const state = armed(0, { quiet: true });
    const fireOnce = () => {
      step(state, FIRE, 1 / 60);
      const n = state.events.filter((e) => e.type === "gun").length;
      state.events.length = 0;
      return n;
    };

    let shots = 0;
    let framesToJam = -1;
    for (let i = 0; i < 600 && framesToJam < 0; i++) {
      shots += fireOnce();
      if (state.player.gun.locked) framesToJam = i;
    }
    expect(state.player.gun.locked).toBe(true);
    expect(shots).toBeGreaterThan(8);
    expect(framesToJam).toBeGreaterThan(30);

    let shotsWhileJammed = 0;
    for (let i = 0; i < 20; i++) shotsWhileJammed += fireOnce();
    expect(shotsWhileJammed).toBe(0);

    run(state, 3, IDLE);
    expect(state.player.gun.locked).toBe(false);
    step(state, FIRE, 1 / 60);
    expect(state.events.some((e) => e.type === "gun")).toBe(true);
  });

  it("scores a kill when rounds connect, and drops the enemy from the sky", () => {
    const state = armed(0, { quiet: true });
    const enemy = spawnEnemy(state, "fighter", { x: state.player.x, y: state.player.y - 200 });
    const scoreBefore = state.score;
    destroy(state, enemy);
    expect(enemy.alive).toBe(false);
    expect(state.kills).toBe(1);
    expect(state.levelKills).toBe(1);
    expect(state.score).toBeGreaterThan(scoreBefore);
    expect(state.effects.some((fx) => fx.kind === "blast")).toBe(true);
  });
});

describe("countermeasures", () => {
  it("burns nearby enemy rounds, spends a flare and buys invulnerability", () => {
    const state = armed(0, { quiet: true });
    const p = state.player;
    for (const dy of [-20, 20, 40]) {
      state.bullets.push(makeBullet(p.x, p.y + dy, 0, 0, "enemy", 5, { life: 2 }));
    }
    state.bullets.push(makeBullet(p.x + 600, p.y, 0, 0, "enemy", 5, { life: 2 }));
    step(state, { ...IDLE, secondary: true }, 1 / 60);
    expect(p.flares).toBe(2);
    expect(p.invuln).toBeGreaterThan(0);
    expect(state.bullets.filter((b) => b.team === "enemy")).toHaveLength(1);
  });

  it("refuses to fire an empty flare rack", () => {
    const state = armed(0, { quiet: true });
    state.player.flares = 0;
    expect(popFlare(state, state.player)).toBe(false);
    expect(state.events.some((e) => e.type === "denied")).toBe(true);
  });
});

describe("losing", () => {
  it("fails the mission when the player is shot down", () => {
    const state = armed(0, { quiet: true });
    destroy(state, state.player, "enemy");
    expect(state.player.alive).toBe(false);
    expect(state.phase).toBe("lost");
    expect(getOutcome(state)).toBe("lost");
    expect(state.failReason).toContain("擊落");
  });

  it("freezes the simulation once the mission is over", () => {
    const state = armed(0, { quiet: true });
    destroy(state, state.player, "enemy");
    const tickAfterLoss = state.tick;
    run(state, 1, FIRE);
    expect(state.tick).toBe(tickAfterLoss);
  });
});

describe("mission objectives", () => {
  it("clears the intercept once six raiders are down, with a clear bonus", () => {
    const state = armed(0, { quiet: true });
    for (let i = 0; i < 6; i++) {
      const foe = spawnEnemy(state, "fighter", { x: 300 + i * 90, y: 400 });
      destroy(state, foe);
    }
    expect(state.levelKills).toBe(6);
    expect(state.phase).toBe("levelClear");
    expect(state.clearBonus).toBeGreaterThan(0);
    expect(state.score).toBeGreaterThan(state.levelStartScore);
  });

  it("clears the escort when a transport reaches port", () => {
    const state = armed(1, { quiet: true });
    const [first, ...rest] = state.allies;
    first.y = WORLD.exitY + 1;
    step(state, IDLE, 1 / 60);
    expect(state.delivered).toBe(1);
    expect(state.phase).toBe("playing");
    for (const ally of rest) destroy(state, ally, "enemy");
    expect(state.phase).toBe("levelClear");
  });

  it("fails the escort when every transport is lost", () => {
    const state = armed(1, { quiet: true });
    for (const ally of [...state.allies]) destroy(state, ally, "enemy");
    expect(state.delivered).toBe(0);
    expect(state.phase).toBe("lost");
    expect(state.failReason).toContain("運補機");
  });

  it("clears the strike only when the last patrol boat is sunk", () => {
    const state = armed(2, { quiet: false });
    state.spawnQueue.length = 0;
    const boats = state.enemies.filter((e) => e.isTarget);
    expect(boats).toHaveLength(4);
    for (let i = 0; i < boats.length; i++) {
      destroy(state, boats[i]);
      if (i < boats.length - 1) expect(state.phase).toBe("playing");
    }
    expect(state.targetsDown).toBe(4);
    expect(state.phase).toBe("levelClear");
  });

  it("loses air superiority when two bombers slip through", () => {
    const state = armed(3, { quiet: true });
    for (let i = 0; i < 2; i++) {
      const bomber = spawnEnemy(state, "bomber", { x: 400 + i * 200, y: WORLD.leakY - 1 });
      bomber.y = WORLD.leakY + 1;
      step(state, IDLE, 1 / 60);
    }
    expect(state.leaks).toBe(2);
    expect(state.phase).toBe("lost");
  });

  it("clears air superiority when the bombers are accounted for", () => {
    const state = armed(3, { quiet: true });
    for (let i = 0; i < 3; i++) {
      const bomber = spawnEnemy(state, "bomber", { x: 300 + i * 200, y: 500 });
      destroy(state, bomber);
    }
    expect(state.bombersDown).toBe(3);
    expect(state.phase).toBe("levelClear");
  });

  it("ends the campaign when the ace goes down", () => {
    const state = armed(4);
    state.spawnQueue.length = 0;
    const ace = state.enemies.find((e) => e.isBoss);
    expect(ace).toBeTruthy();
    expect(state.bossMaxHp).toBeGreaterThan(100);
    destroy(state, ace);
    expect(state.bossDown).toBe(true);
    expect(state.phase).toBe("levelClear");
    advanceLevel(state);
    expect(state.phase).toBe("won");
    expect(getOutcome(state)).toBe("won");
  });

  it("walks forward one level at a time", () => {
    const state = armed(0, { quiet: true });
    for (let i = 0; i < 6; i++) destroy(state, spawnEnemy(state, "fighter", { x: 400, y: 400 }));
    expect(state.phase).toBe("levelClear");
    advanceLevel(state);
    expect(state.levelIndex).toBe(1);
    expect(state.phase).toBe("briefing");
    expect(advanceLevel(state).levelIndex).toBe(1);
  });
});

describe("supplies and reinforcements", () => {
  it("pickups repair the airframe, restock flares and clear a jam", () => {
    const state = armed(0, { quiet: true });
    state.player.hp = 40;
    applyPickup(state, "repair");
    expect(state.player.hp).toBeGreaterThan(40);

    state.player.flares = 0;
    applyPickup(state, "flare");
    expect(state.player.flares).toBe(2);

    state.player.gun.heat = 1;
    state.player.gun.locked = true;
    applyPickup(state, "cool");
    expect(state.player.gun.locked).toBe(false);
    expect(state.player.gun.heat).toBe(0);
  });

  it("feeds reinforcements in without ever exceeding the concurrency cap", () => {
    const state = armed(0);
    let peak = 0;
    for (let i = 0; i < 60 * 40; i++) {
      state.player.invuln = 5; // survive long enough to watch the spawner
      step(state, IDLE, 1 / 60);
      peak = Math.max(peak, state.enemies.filter((e) => e.alive).length);
    }
    expect(peak).toBeLessThanOrEqual(state.maxAlive);
    expect(peak).toBeGreaterThan(0);
    expect(state.spawnQueue.length).toBeLessThan(6);
  });

  it("fields tougher aircraft in the later levels", () => {
    const early = armed(0, { quiet: true });
    const late = armed(4, { quiet: true });
    const a = spawnEnemy(early, "fighter", { x: 400, y: 400 });
    const b = spawnEnemy(late, "fighter", { x: 400, y: 400 });
    expect(b.maxHp).toBeGreaterThan(a.maxHp);
    expect(b.stats.maxSpeed).toBeGreaterThan(a.stats.maxSpeed);
    expect(b.stats.fireInterval).toBeLessThan(a.stats.fireInterval);
  });
});

describe("simulation integrity", () => {
  const script = (i) => ({
    moveX: Math.sin(i / 37),
    moveY: Math.cos(i / 23),
    primary: i % 9 < 5,
    secondary: i % 419 === 0,
  });

  it("is fully deterministic for a given seed and input script", () => {
    const runOnce = () => {
      const state = armed(0, { seed: 4242 });
      for (let i = 0; i < 60 * 12; i++) step(state, script(i), 1 / 60);
      return {
        view: summarize(state),
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        enemies: state.enemies.length,
      };
    };
    expect(runOnce()).toEqual(runOnce());
  });

  it("stays finite and bounded across a long session", () => {
    const state = armed(0, { seed: 99 });
    for (let i = 0; i < 60 * 60; i++) step(state, script(i), 1 / 60);
    expect(Number.isFinite(state.player.x)).toBe(true);
    expect(Number.isFinite(state.player.y)).toBe(true);
    expect(state.bullets.length).toBeLessThanOrEqual(MAX_BULLETS);
    expect(state.events.length).toBeLessThanOrEqual(300);
    expect(["playing", "won", "lost"]).toContain(getOutcome(state));
    expect(summarize(state).hp).toBeGreaterThanOrEqual(0);
  });
});
