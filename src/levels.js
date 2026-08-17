import { WORLD } from "./units.js";

/** `[["fighter", 3], ["heavy", 1]]` → flat spawn order, interleaved by pass. */
export function expandQueue(spec) {
  const pools = spec.map(([kind, count]) => ({ kind, left: count }));
  const queue = [];
  let live = true;
  while (live) {
    live = false;
    for (const pool of pools) {
      if (pool.left > 0) {
        queue.push(pool.kind);
        pool.left -= 1;
        live = true;
      }
    }
  }
  return queue;
}

export const LEVELS = [
  {
    id: "intercept",
    name: "攔截來襲",
    brief: "敵方戰機越過海峽中線。擊落 6 架，把他們趕回去。",
    hint: "咬住敵機尾巴再開火。機砲會過熱——短點放，別按住不放。",
    objective: { kind: "kills", target: 6 },
    // Two at a time: the opening mission has to teach the turn fight, not swamp it.
    reinforcements: { queue: expandQueue([["fighter", 6]]), maxAlive: 2, interval: 2.4 },
    scale: { speed: 1, fire: 1, hp: 1 },
    music: "battle",
  },
  {
    id: "escort",
    name: "護航船團",
    brief: "三架運補機南下返港。攻擊機專打運補機——至少護住一架進港。",
    hint: "攻擊機不理你，只咬運補機。先解決離船團最近的那架。",
    objective: { kind: "escort", need: 1 },
    allies: [
      { kind: "transport", x: 300, y: 150 },
      { kind: "transport", x: 600, y: 110 },
      { kind: "transport", x: 900, y: 150 },
    ],
    reinforcements: {
      queue: expandQueue([
        ["heavy", 3],
        ["fighter", 3],
      ]),
      maxAlive: 3,
      interval: 3.2,
    },
    scale: { speed: 1.05, fire: 1.05, hp: 1 },
    music: "battle",
  },
  {
    id: "strike",
    name: "制壓巡邏艇",
    brief: "四艘武裝巡邏艇封鎖航道，防空火網密集。全部擊沉。",
    hint: "巡邏艇打高射砲：別直線接近，繞著打。掩護機同時會來。",
    objective: { kind: "targets" },
    statics: [
      { kind: "boat", x: 250, y: 700, isTarget: true },
      { kind: "boat", x: 940, y: 520, isTarget: true },
      { kind: "boat", x: 520, y: 380, isTarget: true },
      { kind: "boat", x: 880, y: 1120, isTarget: true },
    ],
    reinforcements: { queue: expandQueue([["fighter", 3]]), maxAlive: 2, interval: 6 },
    scale: { speed: 1.1, fire: 1.1, hp: 1.05 },
    music: "battle",
  },
  {
    id: "superiority",
    name: "空優作戰",
    brief: "三架轟炸機直撲我方港口，護航戰機隨行。全數擊落——漏掉兩架就失守。",
    hint: "轟炸機皮厚又有尾砲，先甩開護航機再從側面切入。",
    objective: { kind: "interceptRun", target: 3, allowedLeaks: 1 },
    reinforcements: {
      queue: expandQueue([
        ["bomber", 3],
        ["fighter", 4],
      ]),
      maxAlive: 4,
      interval: 3.4,
    },
    scale: { speed: 1.15, fire: 1.2, hp: 1.1 },
    music: "battle",
  },
  {
    id: "ace",
    name: "王牌決戰",
    brief: "海峽王牌親自升空，兩機僚護。擊落王牌，海峽就是我們的。",
    hint: "王牌會反咬你的尾巴：被咬住時放熱焰彈脫離，再回頭補槍。",
    objective: { kind: "boss" },
    statics: [{ kind: "ace", x: WORLD.w / 2, y: 240, isBoss: true }],
    reinforcements: { queue: expandQueue([["fighter", 4]]), maxAlive: 3, interval: 5 },
    scale: { speed: 1.2, fire: 1.3, hp: 1.15 },
    music: "ace",
  },
];

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

/** Human-readable objective progress line for the HUD. */
export function objectiveText(state) {
  const level = getLevel(state.levelIndex);
  const o = level.objective;
  switch (o.kind) {
    case "kills":
      return `擊落敵機 ${Math.min(state.levelKills, o.target)}／${o.target}`;
    case "escort":
      return `運補機 進港 ${state.delivered}／${state.allyTotal} · 空中 ${state.alliesAlive}`;
    case "targets":
      return `巡邏艇 擊沉 ${state.targetsDown}／${state.targetTotal}`;
    case "interceptRun":
      return `轟炸機 擊落 ${state.bombersDown}／${o.target} · 漏掉 ${state.leaks}／${o.allowedLeaks + 1}`;
    case "boss":
      return `王牌機體 ${Math.max(0, Math.ceil(state.bossHp))}／${state.bossMaxHp}`;
    default:
      return "";
  }
}
