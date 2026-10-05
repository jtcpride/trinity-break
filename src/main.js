import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { AudioEngine } from "./audio.js";
import { CHARACTERS, SECTORS } from "./world.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game");
const audio = new AudioEngine(),
  renderer = new Renderer(canvas);
let game,
  helpReturn = "title",
  lastMode = "",
  lastFrame = 0,
  hudElapsed = 0,
  records = {};
try {
  records = JSON.parse(localStorage.getItem("trinity-break-records") || "{}");
} catch {}
let muted = records.muted === true;
audio.setMuted(muted);
const persist = () => {
  try {
    localStorage.setItem("trinity-break-records", JSON.stringify(records));
  } catch {}
};
const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const input = new Input($("app"), {
  onPause: togglePause,
  onGesture: () => audio.unlock(),
});
function buildGame() {
  game = new Game({
    difficulty: $("difficulty").value,
    onEvent: (e) => audio.event(e),
  });
  window.__TRINITY__ = {
    get game() {
      return game;
    },
    input,
    renderer,
    audio,
    version: "1.1.0",
  };
}
buildGame();
function start() {
  input.reset();
  audio.unlock();
  buildGame();
  game.start();
  lastMode = "";
  $("help-screen").classList.add("hidden");
  input.enabled = true;
  syncScreen();
}
function togglePause() {
  if (!$("help-screen").classList.contains("hidden")) {
    closeHelp();
    return;
  }
  if (game.state.mode === "playing") {
    game.pause(true);
    input.reset();
  } else if (game.state.mode === "paused") {
    game.pause(false);
    input.reset();
  }
  syncScreen();
}
function showHelp() {
  helpReturn = game.state.mode;
  if (helpReturn === "playing") game.pause(true);
  input.enabled = false;
  input.reset();
  $("help-screen").classList.remove("hidden");
  $("help-close").focus();
}
function closeHelp() {
  $("help-screen").classList.add("hidden");
  if (helpReturn === "playing") game.pause(false);
  input.reset();
  syncScreen();
}
function title() {
  input.reset();
  buildGame();
  lastMode = "";
  syncScreen();
  $("start-button").focus();
}
$("start-button").addEventListener("click", start);
$("instructions-button").addEventListener("click", showHelp);
$("help-close").addEventListener("click", closeHelp);
$("pause").addEventListener("click", togglePause);
$("resume-button").addEventListener("click", togglePause);
$("pause-help").addEventListener("click", showHelp);
$("return-title").addEventListener("click", title);
$("result-title-button").addEventListener("click", title);
$("retry-button").addEventListener("click", () => {
  audio.unlock();
  input.reset();
  if (game.state.mode === "victory") start();
  else {
    game.retry();
    lastMode = "";
    syncScreen();
  }
});
$("armor-button").addEventListener("click", () => {
  if (input.enabled) input.pulses.add("overdrive");
});
$("mute").addEventListener("click", () => {
  audio.unlock();
  muted = !muted;
  audio.setMuted(muted);
  records.muted = muted;
  persist();
  updateMute();
});
function updateMute() {
  $("mute").textContent = muted ? "♪̸" : "♪";
  $("mute").setAttribute(
    "aria-label",
    muted ? "音をオンにする" : "音をオフにする",
  );
  $("mute").title = muted ? "音：オフ" : "音：オン";
}
updateMute();
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.state.mode === "playing") {
    game.pause(true);
    input.reset();
    syncScreen();
  }
});
window.addEventListener("blur", () => {
  if (game.state.mode === "playing") {
    game.pause(true);
    syncScreen();
  }
});
function syncScreen() {
  const mode = game.state.mode;
  input.enabled =
    mode === "playing" && $("help-screen").classList.contains("hidden");
  $("title-screen").classList.toggle("hidden", mode !== "title");
  $("hud").classList.toggle("hidden", mode === "title");
  $("pause-screen").classList.toggle("hidden", mode !== "paused");
  $("result-screen").classList.toggle(
    "hidden",
    !["dead", "victory"].includes(mode),
  );
  if (mode !== lastMode) {
    if (mode === "victory" || mode === "dead") showResult(mode);
    lastMode = mode;
  }
  if (records.wins)
    $("save-note").textContent =
      `作戦完了 ${records.wins}回 · ベスト ${formatTime(records.best || 0)} · 再出撃可能`;
}
function showResult(mode) {
  const s = game.state,
    win = mode === "victory";
  input.reset();
  $("result-eyebrow").textContent = win
    ? "DAWN PROTOCOL / COMPLETE"
    : "SIGNAL LOST / RETRY";
  $("result-title").textContent = win
    ? "三つの光が、夜を破った。"
    : "まだ、終わりじゃない。";
  $("result-story").textContent = win
    ? "WARDENの支配が崩れ、軌道都市ノクスに朝が戻る。REDが銃を下ろす。BLUEが街の声を聞く。GOLDはもう、次の道を見つけていた。"
    : "意識信号を退避しました。三姉妹は直前の安全区画から作戦を再開できます。";
  const t = s.stats?.time || s.time || 0;
  const stats = [
    ["作戦時間", formatTime(t)],
    ["切り替え", s.stats?.switches || 0],
    ["撃破", s.stats?.kills || 0],
    ["再挑戦", s.stats?.deaths || 0],
  ];
  $("result-stats").replaceChildren(
    ...stats.map(([label, value]) => {
      const d = document.createElement("div"),
        b = document.createElement("b"),
        span = document.createElement("span");
      b.textContent = value;
      span.textContent = label;
      d.append(b, span);
      return d;
    }),
  );
  $("result-note").textContent = win
    ? "三人がつないだ最後のシグナル。THANK YOU FOR PLAYING."
    : `再開地点：${SECTORS[s.checkpoint || 0]?.name || "外縁"} ／ 体力を回復して再挑戦`;
  $("retry-button").firstChild.textContent = win
    ? "もう一度、三人で挑む "
    : "チェックポイントから再挑戦 ";
  if (win) {
    records.wins = (records.wins || 0) + 1;
    records.best = Math.min(records.best || Infinity, t);
    persist();
  }
}
function updateHud() {
  const s = game.state,
    p = s.player,
    c = CHARACTERS[p.character] || CHARACTERS[0];
  document.documentElement.style.setProperty("--accent", c.color);
  $("health-number").textContent =
    `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
  $("health-fill").style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  $("energy-fill").style.width = `${Math.min(100, s.energy)}%`;
  $("energy-number").textContent =
    p.overdrive > 0 ? `${p.overdrive.toFixed(1)}s` : `${Math.floor(s.energy)}%`;
  $("armor-button").classList.toggle(
    "ready",
    s.energy >= 100 || p.overdrive > 0,
  );
  const sector = SECTORS[s.sector] || SECTORS[0];
  $("sector-label").textContent = `0${s.sector + 1} / ${sector.shortName}`;
  $("objective").textContent = s.objective || sector.objective;
  $("context-hint").textContent = s.hint || sector.hint;
  [...$("mission-progress").children].forEach((el, i) =>
    el.classList.toggle("passed", i <= s.sector),
  );
  document.querySelectorAll(".sister").forEach((b, i) => {
    b.classList.toggle("active", p.character === i);
    b.setAttribute("aria-pressed", String(p.character === i));
    const cd = s.skillCooldown?.[i] || 0;
    b.querySelector(".cooldown").style.width =
      `${Math.min(100, (cd / [1.05, 4.5, 1.8][i]) * 100)}%`;
    b.querySelector("small").textContent =
      `${i + 1} · ${cd > 0.05 ? cd.toFixed(1) + "s" : "READY"}`;
  });
  const banner = s.banner;
  $("transmission").style.opacity = banner && banner.ttl > 0 ? "1" : "0";
  $("banner-title").textContent = banner?.title || "";
  $("banner-text").textContent = banner?.text || "";
  const boss = s.boss || s.enemies.find((e) => e.type === "boss");
  const bossOn = s.sector === 3 && boss && boss.hp > 0;
  $("boss-panel").classList.toggle("hidden", !bossOn);
  if (bossOn) {
    $("boss-fill").style.width =
      `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    $("boss-state").textContent = boss.shielded
      ? "SHIELD / BLUE K"
      : `OPEN ${Math.max(0, boss.vulnerable || 0).toFixed(1)}s${boss.marked > 0 ? " · MARK " + boss.marked.toFixed(1) + "s" : " · GOLD K"}`;
  }
  $("possession").classList.toggle("hidden", !s.possession);
  if (s.possession)
    $("possession-time").textContent = `${s.possession.remaining.toFixed(1)}s`;
}
function frame(now) {
  const dt = Math.min(0.033, Math.max(0, (now - (lastFrame || now)) / 1000));
  lastFrame = now;
  game.update(dt, input.sample());
  audio.update(game.state, dt);
  renderer.draw(game.state, dt);
  syncScreen();
  hudElapsed += dt;
  if (hudElapsed > 0.075) {
    updateHud();
    hudElapsed = 0;
  }
  requestAnimationFrame(frame);
}
syncScreen();
updateHud();
requestAnimationFrame(frame);
