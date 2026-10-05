// Each factory returns fresh mutable objects: retries must never share state.
export const WORLD_WIDTH = 9100;
export const GROUND_Y = 550;

export const CHARACTERS = [
  {
    id: "red",
    name: "RED",
    color: "#ff536b",
    role: "攻撃・突破",
    description: "正面から道を開く長姉。連続ブーストと高火力で制圧する。",
    skill: "近接ブレイク",
    quote: "「かかってきな。道は私が開く」",
  },
  {
    id: "blue",
    name: "BLUE",
    color: "#59d7ff",
    role: "解析・支配",
    description:
      "敵の視界に入り込む次姉。ドローンを直接操作し、都市の封鎖を解く。",
    skill: "敵機ハッキング",
    quote: "「鍵なら、向こうが持っている」",
  },
  {
    id: "gold",
    name: "GOLD",
    color: "#ffd16a",
    role: "機動・回避",
    description:
      "加速を止めない末妹。大型敵にワイヤーを掛け、戦場を飛び越える。",
    skill: "ワイヤー飛翔",
    quote: "「はいはい、そこでやっててね」",
  },
];

export const SECTORS = [
  {
    id: 0,
    name: "01 / 封鎖された外縁",
    shortName: "OUTER RING",
    start: 0,
    end: 1900,
    checkpointX: 150,
    objective: "REDの銃撃で赤い強化隔壁を破壊する",
    hint: "1：RED ／ J：射撃 ／ K：近接ブレイク ／ Shift・L：連続ブースト。",
    story:
      "軌道都市ノクスの夜が止まった。戦術部隊A.O.T.U.の三姉妹は、市民を拘束する中枢塔へ向かう。",
  },
  {
    id: 1,
    name: "02 / 奪われた回線",
    shortName: "SIGNAL LOCK",
    start: 1900,
    end: 3900,
    checkpointX: 2050,
    objective: "BLUEでドローンを奪い、高所の青い中継器を撃つ",
    hint: "2 → ドローンに近づいてK。WASD / 矢印で操作、Jで中継器へ射撃。Kで解除。",
    story: "BLUEが監視機の回線に侵入。敵の目と銃口を、解放のために借りる。",
  },
  {
    id: 2,
    name: "03 / 空白の高架",
    shortName: "SKYLINE RUN",
    start: 3900,
    end: 6200,
    checkpointX: 4050,
    objective: "GOLDのワイヤーで大型敵を捕らえ、崩落した高架を越える",
    hint: "3：GOLD ／ Shift・L長押し：Bダッシュ加速。対岸の大型敵へ近づいてK。",
    story: "高架は途切れている。でもGOLDには、対岸の巨兵が足場に見える。",
  },
  {
    id: 3,
    name: "04 / 都市の心臓",
    shortName: "CENTRAL CORE",
    start: 6200,
    end: 9100,
    checkpointX: 6380,
    objective: "BLUEで障壁を解き、GOLDで背後へ。REDの火力で中枢を止める",
    hint: "BLUEのKで障壁解除 → GOLDのKで弱点露出 → REDのJ。光る床攻撃はジャンプ。",
    story:
      "塔の守護機WARDENが目を覚ます。三つの力を重ね、ノクスに朝を取り戻せ。",
  },
];

export function createWorld() {
  return {
    width: WORLD_WIDTH,
    groundY: GROUND_Y,
    platforms: [
      { x: 1040, y: 438, w: 170, h: 18 },
      { x: 2770, y: 438, w: 240, h: 18 },
      { x: 4220, y: 440, w: 250, h: 18 },
      { x: 6900, y: 425, w: 200, h: 18 },
      { x: 8500, y: 425, w: 210, h: 18 },
    ],
    gaps: [{ x: 4700, w: 660 }],
    gates: [
      {
        id: "red-gate",
        x: 1650,
        y: 285,
        w: 54,
        h: 265,
        kind: "red",
        open: false,
        hp: 100,
        maxHp: 100,
      },
      {
        id: "blue-gate",
        x: 3370,
        y: 285,
        w: 54,
        h: 265,
        kind: "blue",
        open: false,
      },
      {
        id: "gold-gate",
        x: 5940,
        y: 285,
        w: 54,
        h: 265,
        kind: "gold",
        open: false,
      },
    ],
    anchors: [{ id: "sky-anchor", x: 5480, y: 285 }],
    relays: [
      { id: "blue-relay", x: 3230, y: 370, w: 42, h: 56, active: false },
    ],
    pickups: [
      { id: "outer-health", x: 1440, y: 510, kind: "health", collected: false },
      {
        id: "signal-energy",
        x: 3570,
        y: 510,
        kind: "energy",
        collected: false,
      },
      { id: "sky-health", x: 5680, y: 510, kind: "health", collected: false },
      { id: "core-energy", x: 7180, y: 510, kind: "energy", collected: false },
      { id: "core-health", x: 7460, y: 510, kind: "health", collected: false },
    ],
    decor: [
      {
        kind: "sign",
        x: 310,
        y: 325,
        w: 245,
        h: 76,
        text: "NOX // ACCESS DENIED",
        color: "#ff536b",
      },
      {
        kind: "magnet",
        x: 2260,
        y: 210,
        w: 1020,
        h: 14,
        text: "MAGNETIC SERVICE RAIL",
        color: "#59d7ff",
      },
      {
        kind: "sign",
        x: 4060,
        y: 305,
        w: 290,
        h: 76,
        text: "SKYWAY // MISSING LINK",
        color: "#ffd16a",
      },
      {
        kind: "tower",
        x: 7930,
        y: 70,
        w: 350,
        h: 480,
        text: "WARDEN",
        color: "#b69aff",
      },
      {
        kind: "sign",
        x: 8700,
        y: 325,
        w: 250,
        h: 76,
        text: "NOX // DAWN PROTOCOL",
        color: "#9af3d3",
      },
    ],
  };
}

function enemy(id, type, x, y, options = {}) {
  const profiles = {
    trooper: { w: 34, h: 64, maxHp: 65 },
    drone: { w: 46, h: 34, maxHp: 65 },
    sentinel: { w: 90, h: 135, maxHp: 380 },
    boss: { w: 138, h: 184, maxHp: 4500 },
  };
  const p = profiles[type];
  return {
    id,
    type,
    x,
    y,
    ...p,
    hp: p.maxHp,
    facing: -1,
    attackTime: 0,
    stun: 0,
    controlled: false,
    shielded: type === "boss",
    phase: 1,
    telegraph: 0,
    vx: 0,
    vy: 0,
    originX: x,
    originY: y,
    ...options,
  };
}

export function createEnemies() {
  return [
    enemy("outer-01", "trooper", 740, GROUND_Y),
    enemy("outer-02", "trooper", 1200, GROUND_Y),
    enemy("blue-drone", "drone", 2470, 380, { tutorial: true, hackable: true }),
    enemy("signal-guard", "trooper", 2970, GROUND_Y),
    enemy("sky-patrol", "trooper", 4470, GROUND_Y),
    enemy("gold-sentinel", "sentinel", 5480, GROUND_Y, {
      tutorial: true,
      stationary: true,
      anchor: true,
    }),
    enemy("core-guard-01", "trooper", 6690, GROUND_Y),
    enemy("core-guard-02", "trooper", 7130, GROUND_Y),
    enemy("oracle", "boss", 7980, GROUND_Y, {
      stationary: true,
      name: "WARDEN / 都市拘束中枢",
    }),
  ];
}
