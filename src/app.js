import { GameAudio, soundForEvent } from "./audio.js";
import { advanceLevel, createGame, startLevel, step, summarize } from "./game.js";
import { createInput } from "./input.js";
import { getLevel, LEVEL_COUNT, LEVELS, objectiveText } from "./levels.js";
import { loadProgress, saveProgress } from "./persist.js";
import { isUnlocked, mergeRun } from "./progress.js";
import { createRenderer, loadSprites } from "./render.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  lobby: $("#lobby"),
  field: $("#field"),
  levelList: $("#level-list"),
  start: $("#start"),
  best: $("#best"),
  cleared: $("#cleared"),
  sound: $("#sound"),
  canvas: $("#stage"),
  overlay: $("#overlay"),
  toast: $("#toast"),
  hudLevel: $("#hud-level"),
  hudScore: $("#hud-score"),
  hudObjective: $("#hud-objective"),
  hpFill: $("#hp-fill"),
  heatFill: $("#heat-fill"),
  hudFlares: $("#hud-flares"),
  pause: $("#pause"),
  stickZone: $("#stick-zone"),
  btnFire: $("#btn-fire"),
  btnFlare: $("#btn-flare"),
};

try {
  await globalThis.PG?.ready;
} catch {
  /* standalone open: the host SDK simply is not there */
}

const audio = new GameAudio();
const sprites = loadSprites();
const renderer = createRenderer(els.canvas, sprites);
const { input, reset: resetInput } = createInput({
  stickZone: els.stickZone,
  fireButton: els.btnFire,
  flareButton: els.btnFlare,
});

let progress = await loadProgress();
let state = null;
let paused = false;
let selectedLevel = 0;
let lastPhase = "";
let saveWarned = false;

function markCoarsePointer(event) {
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    document.body.dataset.touch = "on";
  }
}
addEventListener("pointerdown", markCoarsePointer, { capture: true });
const coarse = globalThis.matchMedia?.("(pointer: coarse)").matches || (navigator.maxTouchPoints || 0) > 0;
if (coarse) document.body.dataset.touch = "on";

function toast(text, seconds = 2.2) {
  els.toast.textContent = text;
  els.toast.dataset.show = "on";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => delete els.toast.dataset.show, seconds * 1000);
}

function renderLobby() {
  els.best.textContent = String(progress.best);
  els.cleared.textContent = `${progress.cleared}／${LEVEL_COUNT}`;
  els.levelList.replaceChildren();
  LEVELS.forEach((level, index) => {
    const unlocked = isUnlocked(progress, index);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "level";
    btn.disabled = !unlocked;
    btn.setAttribute("aria-pressed", String(index === selectedLevel));
    const num = document.createElement("b");
    num.textContent = `第 ${index + 1} 關`;
    const name = document.createElement("span");
    name.textContent = unlocked ? level.name : "未解鎖";
    btn.append(num, name);
    btn.onclick = () => {
      selectedLevel = index;
      renderLobby();
    };
    li.append(btn);
    els.levelList.append(li);
  });
  if (!isUnlocked(progress, selectedLevel)) selectedLevel = Math.max(0, progress.cleared);
}

function showLobby() {
  state = null;
  paused = false;
  lastPhase = "";
  resetInput();
  audio.music(null);
  els.lobby.hidden = false;
  els.field.hidden = true;
  setOverlay(null);
  renderLobby();
}

function launch(levelIndex) {
  selectedLevel = levelIndex;
  state = createGame({ seed: (Date.now() ^ (levelIndex * 7919)) & 0x7fffffff, levelIndex });
  paused = false;
  lastPhase = "briefing";
  els.lobby.hidden = true;
  els.field.hidden = false;
  audio.unlock();
  setOverlay("briefing");
}

function beginLevel() {
  if (!state) return;
  startLevel(state);
  lastPhase = "playing";
  setOverlay(null);
  resetInput();
  audio.music(getLevel(state.levelIndex).music || "battle");
}

function card(title, lines, actions) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  const h = document.createElement("h2");
  h.textContent = title;
  wrap.append(h);
  for (const line of lines) {
    if (!line) continue;
    const p = document.createElement("p");
    p.textContent = line;
    wrap.append(p);
  }
  const row = document.createElement("div");
  row.className = "card-actions";
  for (const [label, fn, primary] of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (primary) b.className = "primary";
    b.onclick = fn;
    row.append(b);
  }
  wrap.append(row);
  return wrap;
}

function setOverlay(kind) {
  els.overlay.replaceChildren();
  els.overlay.hidden = !kind;
  if (!kind || !state) return;
  const level = getLevel(state.levelIndex);
  const view = summarize(state);

  if (kind === "briefing") {
    els.overlay.append(
      card(
        `第 ${state.levelIndex + 1} 關 · ${level.name}`,
        [level.brief, level.hint],
        [
          ["出擊", beginLevel, true],
          ["回基地", showLobby],
        ],
      ),
    );
  } else if (kind === "paused") {
    els.overlay.append(
      card(
        "暫停",
        [objectiveText(state), "移動：搖桿／WASD · 開火：J／Space · 熱焰彈：K／Shift"],
        [
          ["繼續飛行", () => togglePause(false), true],
          ["重飛本關", () => launch(state.levelIndex)],
          ["回基地", showLobby],
        ],
      ),
    );
  } else if (kind === "levelClear") {
    const last = state.levelIndex >= LEVEL_COUNT - 1;
    els.overlay.append(
      card(
        `任務完成 · ${level.name}`,
        [
          `本關擊落 ${state.levelKills} 架 · 用時 ${state.levelTime.toFixed(1)} 秒`,
          `任務加給 ${state.clearBonus} 分 · 累計 ${state.score} 分`,
        ],
        [[last ? "看戰果" : "下一關", nextLevel, true]],
      ),
    );
  } else if (kind === "lost") {
    els.overlay.append(
      card(
        "任務失敗",
        [state.failReason, `累計 ${state.score} 分 · 擊落 ${state.kills} 架`],
        [
          ["重飛本關", () => launch(state.levelIndex), true],
          ["回基地", showLobby],
        ],
      ),
    );
  } else if (kind === "won") {
    els.overlay.append(
      card(
        "海峽已在我方掌握",
        [`五個任務全數完成，總分 ${view.score}，擊落 ${state.kills} 架。`, "最高分已存進場內存檔。"],
        [
          ["再打一輪", () => launch(0), true],
          ["回基地", showLobby],
        ],
      ),
    );
  }
  const first = els.overlay.querySelector("button.primary") || els.overlay.querySelector("button");
  first?.focus();
}

function nextLevel() {
  if (!state) return;
  advanceLevel(state);
  if (state.phase === "won") {
    lastPhase = "won";
    setOverlay("won");
    return;
  }
  lastPhase = "briefing";
  setOverlay("briefing");
}

function togglePause(next = !paused) {
  if (!state || state.phase !== "playing") return;
  paused = next;
  resetInput();
  setOverlay(paused ? "paused" : null);
}

async function persistRun(run) {
  progress = mergeRun(progress, run);
  renderLobby();
  const res = await saveProgress(progress);
  if (!res.ok && !saveWarned) {
    saveWarned = true;
    toast("存檔同步失敗，這局照樣可以飛", 3);
  }
}

function handlePhaseChange() {
  const phase = state.phase;
  if (phase === lastPhase) return;
  lastPhase = phase;
  if (phase === "levelClear") {
    const last = state.levelIndex >= LEVEL_COUNT - 1;
    resetInput();
    setOverlay("levelClear");
    void persistRun({
      score: state.score,
      clearedLevels: state.levelIndex + 1,
      won: last,
      ended: last,
    });
  } else if (phase === "lost") {
    resetInput();
    audio.music(null);
    setOverlay("lost");
    void persistRun({ score: state.score, clearedLevels: state.levelIndex, ended: true });
  }
}

function drainEvents() {
  for (const event of state.events) {
    const sound = soundForEvent(event);
    if (sound) audio.play(sound);
    if (event.type === "leak") toast("轟炸機突破防線！", 2);
    if (event.type === "allyLost") toast("運補機被擊落！", 2);
  }
  state.events.length = 0;
}

function updateHud() {
  const view = summarize(state);
  els.hudLevel.textContent = `第 ${view.level}／${view.levelTotal} 關 · ${view.levelName}`;
  els.hudScore.textContent = `${view.score} 分`;
  els.hudObjective.textContent = objectiveText(state);
  els.hpFill.style.width = `${Math.max(0, (view.hp / view.maxHp) * 100)}%`;
  els.hpFill.dataset.low = view.hp / view.maxHp < 0.3 ? "on" : "off";
  els.heatFill.style.width = `${Math.min(100, view.heat * 100)}%`;
  els.heatFill.dataset.hot = view.overheated ? "on" : "off";
  els.hudFlares.textContent = `熱焰彈 ${view.flares}`;
  if (view.message) toast(view.message, 1.6);
}

els.start.onclick = () => launch(selectedLevel);
els.pause.onclick = () => togglePause();
els.sound.onclick = () => {
  audio.setEnabled(!audio.enabled);
  els.sound.textContent = audio.enabled ? "音效 開" : "音效 關";
  els.sound.setAttribute("aria-pressed", String(audio.enabled));
};
addEventListener("keydown", (event) => {
  if (event.code === "KeyP" || event.code === "Escape") {
    if (state && state.phase === "playing") {
      event.preventDefault();
      togglePause();
    }
  }
});
addEventListener("pointerdown", () => audio.unlock(), { once: true });

let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!state) return;
  if (state.phase === "playing" && !paused) {
    let left = dt;
    while (left > 0) {
      const slice = Math.min(1 / 60, left);
      step(state, input, slice);
      left -= slice;
    }
  }
  drainEvents();
  handlePhaseChange();
  renderer.draw(state, now / 1000);
  updateHud();
}

showLobby();
requestAnimationFrame(frame);
