const SFX = {
  gun: { file: "gun.ogg", volume: 0.3, gap: 0.05 },
  enemyGun: { file: "enemy-gun.ogg", volume: 0.16, gap: 0.09 },
  hit: { file: "hit.ogg", volume: 0.5, gap: 0.06 },
  explode: { file: "explode.ogg", volume: 0.5, gap: 0.05 },
  explodeBig: { file: "explode-big.ogg", volume: 0.7, gap: 0.05 },
  flare: { file: "flare.ogg", volume: 0.45, gap: 0.1 },
  blip: { file: "blip.ogg", volume: 0.4, gap: 0.1 },
  clear: { file: "jingle-clear.ogg", volume: 0.6, gap: 0.5 },
  fail: { file: "jingle-fail.ogg", volume: 0.6, gap: 0.5 },
};

const TRACKS = {
  battle: { file: "music-battle.ogg", volume: 0.3 },
  ace: { file: "music-ace.ogg", volume: 0.32 },
};

const POOL_SIZE = 4;

/** Thin wrapper over HTMLAudio: pooled one-shots plus a looping music bed. */
export class GameAudio {
  constructor(base = "./assets/audio/") {
    this.base = base;
    this.enabled = true;
    this.unlocked = false;
    this.pools = new Map();
    this.last = new Map();
    this.tracks = new Map();
    this.currentTrack = null;
    this.now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000);
  }

  pool(name) {
    if (this.pools.has(name)) return this.pools.get(name);
    const def = SFX[name];
    if (!def) return null;
    const voices = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = new Audio(this.base + def.file);
      el.preload = "auto";
      el.volume = def.volume;
      voices.push(el);
    }
    const entry = { voices, index: 0, def };
    this.pools.set(name, entry);
    return entry;
  }

  play(name) {
    if (!this.enabled) return;
    const entry = this.pool(name);
    if (!entry) return;
    const t = this.now();
    if (t - (this.last.get(name) || -99) < entry.def.gap) return;
    this.last.set(name, t);
    const el = entry.voices[entry.index];
    entry.index = (entry.index + 1) % entry.voices.length;
    try {
      el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      /* autoplay restrictions before the first gesture */
    }
  }

  track(name) {
    if (this.tracks.has(name)) return this.tracks.get(name);
    const def = TRACKS[name];
    if (!def) return null;
    const el = new Audio(this.base + def.file);
    el.loop = true;
    el.volume = def.volume;
    el.preload = "auto";
    this.tracks.set(name, el);
    return el;
  }

  music(name) {
    if (this.currentTrack === name) {
      if (this.enabled) void this.track(name)?.play().catch(() => {});
      return;
    }
    if (this.currentTrack) {
      const prev = this.track(this.currentTrack);
      if (prev) {
        prev.pause();
        prev.currentTime = 0;
      }
    }
    this.currentTrack = name;
    if (!name || !this.enabled) return;
    const el = this.track(name);
    if (el) void el.play().catch(() => {});
  }

  unlock() {
    this.unlocked = true;
    if (this.currentTrack) this.music(this.currentTrack);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      for (const el of this.tracks.values()) el.pause();
      return;
    }
    if (this.currentTrack) this.music(this.currentTrack);
  }
}

/** Simulation events → sound names. Keeps the core sim free of audio concerns. */
export const EVENT_SOUNDS = {
  gun: "gun",
  enemyGun: "enemyGun",
  hitPlayer: "hit",
  collide: "hit",
  flare: "flare",
  pickup: "blip",
  delivered: "blip",
  levelStart: "blip",
  levelClear: "clear",
  levelFailed: "fail",
  leak: "explodeBig",
  allyLost: "explodeBig",
  playerDown: "explodeBig",
};

export function soundForEvent(event) {
  if (event.type === "explode") return event.big ? "explodeBig" : "explode";
  return EVENT_SOUNDS[event.type] || null;
}
