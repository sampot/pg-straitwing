/** pg-straitwing — 海峽空戰 (空戰／載具戰) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1, mission = 1 } = {}) {
  return { seed, mission, hp: 5, foes: 3 + mission, score: 0, ammo: 12, outcome: "playing", msg: `任務 ${mission}：擊墜敵機` };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["bank", "fire", "flare"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.foes * 5 + s.ammo);
  if (action === "fire") {
    if (s.ammo <= 0) { s.msg = "彈藥耗盡"; return s; }
    s.ammo--;
    if (rnd() < 0.55) { s.foes--; s.score += 100; s.msg = "擊墜！"; }
    else s.msg = "彈幕掠過";
  } else if (action === "bank") {
    s.msg = "側滾迴避";
    if (rnd() < 0.2) { s.hp--; s.msg = "擦彈受傷"; }
  } else {
    if (rnd() < 0.7) s.msg = "熱焰彈誘偏飛彈";
    else { s.hp--; s.msg = "誘餌失敗"; }
  }
  if (rnd() < 0.25 && action !== "bank") { s.hp--; s.msg += "／被咬尾"; }
  if (s.hp <= 0) s.outcome = "lost";
  else if (s.foes <= 0) {
    if (s.mission >= 3) { s.outcome = "won"; s.msg = "海峽空域肅清"; }
    else { s.mission++; s.foes = 3 + s.mission; s.ammo += 6; s.msg = `進入任務 ${s.mission}`; }
  }
  return s;
}
export function summarize(s) {
  return { mission: s.mission, hp: s.hp, foes: s.foes, ammo: s.ammo, score: s.score, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }

