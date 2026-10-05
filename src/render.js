import { CHARACTERS, SECTORS, GROUND_Y } from "./world.js";

const W = 1280,
  H = 720,
  TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const PALETTES = [
  {
    sky: "#479ccc",
    haze: "#d3eff3",
    light: "#fff2b4",
    accent: "#ff536e",
    city: ["#95c8dc", "#649bb7", "#416e91"],
    edge: "#a8f3f2",
  },
  {
    sky: "#237ca1",
    haze: "#98e6e4",
    light: "#baffee",
    accent: "#4fd9ff",
    city: ["#78bcbe", "#468d9f", "#2e647d"],
    edge: "#8bfaf1",
  },
  {
    sky: "#d77660",
    haze: "#ffe1a9",
    light: "#fff6bc",
    accent: "#f3bf58",
    city: ["#dca88b", "#ab7b83", "#6f607d"],
    edge: "#ffe4b0",
  },
  {
    sky: "#57528d",
    haze: "#c59ecb",
    light: "#f6d2ff",
    accent: "#bd9bff",
    city: ["#ad94bd", "#807597", "#4d5378"],
    edge: "#d6c6ff",
  },
];

/** All artwork is drawn locally, with no downloads, canvas reads or state mutation. */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.time = 0;
    this.stars = Array.from({ length: 45 }, (_, i) => ({
      x: hash(i + 1) * W,
      y: hash(i + 180) * 400,
      r: hash(i + 95) * 1.5,
    }));
    this.buildings = Array.from({ length: 62 }, (_, i) => ({
      x: i * 97,
      w: 44 + hash(i + 10) * 95,
      h: 60 + hash(i + 80) * 270,
      damage: hash(i + 55),
    }));
  }
  poly(points, fill, stroke, width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  line(points, color, width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  ellipse(x, y, rx, ry, color, stroke, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
    if (color) {
      c.fillStyle = color;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  glow(x, y, r, color, strength = 1) {
    const c = this.ctx;
    c.save();
    c.globalAlpha *= strength;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }
  text(text, x, y, color = "#acc8d5", size = 12, align = "left") {
    const c = this.ctx;
    c.fillStyle = color;
    c.font = `600 ${size}px "IBM Plex Sans", "Noto Sans JP", sans-serif`;
    c.textAlign = align;
    c.fillText(text, x, y);
    c.textAlign = "left";
  }
  draw(state, dt = 0) {
    const c = this.ctx;
    this.time = Number.isFinite(state.time) ? state.time : this.time + dt;
    const zoom = 1.25,
      viewWidth = W / zoom,
      cam = clamp(
        Math.max(state.camera?.x || 0, (state.player?.x || 0) - viewWidth + 80),
        0,
        Math.max(0, (state.world?.width || W) - viewWidth),
      ),
      sector = clamp(state.sector || 0, 0, 3),
      palette = PALETTES[sector];
    c.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0);
    c.globalAlpha = 1;
    c.lineCap = "round";
    c.lineJoin = "round";
    this.background(cam, sector, palette);
    c.save();
    const shake = Math.min(state.shake || 0, 12);
    // A closer world view keeps collision-sized actors readable. Anchor the
    // ground at its existing screen height; all world geometry uses this transform.
    c.translate(
      -cam * zoom + Math.sin(this.time * 81) * shake,
      GROUND_Y * (1 - zoom) + Math.cos(this.time * 67) * shake * 0.55,
    );
    c.scale(zoom, zoom);
    this.environment(state, cam, palette);
    for (const e of state.enemies || [])
      if (e.hp > 0 && e.x > cam - 250 && e.x < cam + W + 250)
        this.telegraph(e, state);
    this.connections(state);
    for (const e of state.enemies || [])
      if (e.hp > 0 && e.x > cam - 250 && e.x < cam + W + 250)
        this.enemy(e, state);
    this.skillTarget(state);
    if (state.player) this.hero(state.player, state);
    this.projectiles(state);
    this.particles(state);
    this.foreground(state, cam, palette);
    c.restore();
    this.atmosphere(cam, palette, state);
    if (state.flash > 0) {
      c.globalAlpha = Math.min(0.32, state.flash * 2);
      c.fillStyle = "#e1f8ff";
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }
  skillTarget(s) {
    const p = s.player;
    if (!p || s.possession || p.character === 0 || s.mode === "title") return;
    const targets = (s.enemies || [])
      .filter((e) => {
        if (e.hp <= 0) return false;
        if (p.character === 2)
          return (
            ["sentinel", "boss"].includes(e.type) && Math.abs(e.x - p.x) <= 1000
          );
        if (e.type === "boss") return Math.abs(e.x - p.x) <= 650;
        return (
          e.type === "drone" &&
          Math.hypot(e.x - p.x, e.y - e.h / 2 - (p.y - p.h / 2)) < 420
        );
      })
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    const target = targets[0];
    if (!target) return;
    const color = p.character === 1 ? "#77e8ff" : "#ffe28b";
    const x = target.x,
      y = target.y - target.h / 2,
      r = target.w / 2 + 14;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      this.line(
        [
          [x + sx * (r - 11), y + sy * r],
          [x + sx * r, y + sy * r],
          [x + sx * r, y + sy * (r - 11)],
        ],
        color,
        2,
      );
    const cd = s.skillCooldown?.[p.character] || 0;
    this.text(
      cd > 0.05
        ? `RECHARGE ${cd.toFixed(1)}s`
        : p.character === 1
          ? "K / LINK READY"
          : "K / WIRE READY",
      x,
      target.y - target.h - 65,
      color,
      11,
      "center",
    );
  }
  arcadeBackground(cam, p, sector) {
    const c = this.ctx;
    const sky = c.createLinearGradient(0, 0, 0, 550);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(1, p.haze);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    this.ellipse(
      980 - cam * 0.015,
      sector === 2 ? 242 : 151,
      sector === 3 ? 40 : 57,
      sector === 3 ? 40 : 57,
      p.light,
    );
    // Graphic clouds and clean orbital arcs keep the horizon calm behind action.
    c.save();
    c.globalAlpha = 0.58;
    for (let i = 0; i < 6; i++) {
      const x =
        ((((i * 290 - cam * 0.04 + this.time * 3) % 1740) + 1740) % 1740) - 180;
      this.ellipse(x, 124 + (i % 3) * 52, 99, 14, "#f1fbff");
      this.ellipse(x + 24, 113 + (i % 3) * 52, 49, 22, "#f1fbff");
    }
    this.line(
      [
        [-120, 34],
        [535, 123],
        [1410, 319],
      ],
      "#ecffff",
      12,
    );
    c.restore();
    for (let layer = 0; layer < 3; layer++) {
      const factor = 0.06 + layer * 0.075,
        base = 448 + layer * 26;
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i],
          x = b.x - cam * factor - 180;
        if (x + b.w < -40 || x > W + 40) continue;
        const top = base - b.h * (0.55 + layer * 0.18);
        this.poly(
          [
            [x, base],
            [x, top + 12],
            [x + 12, top],
            [x + b.w - 12, top],
            [x + b.w, top + 12],
            [x + b.w, base],
          ],
          p.city[layer],
        );
        c.fillStyle = p.edge;
        c.globalAlpha = 0.28;
        c.fillRect(x + 5, top + 18, 5, base - top - 18);
        c.globalAlpha = 1;
        for (let y = top + 26; y < base - 14; y += 36) {
          c.fillStyle = p.edge;
          c.fillRect(x + 18, y, Math.max(7, b.w - 34), 4);
        }
        if (i % 5 === 0)
          this.line(
            [
              [x + b.w / 2, top],
              [x + b.w / 2, top - 27],
            ],
            "#658da9",
            3,
          );
      }
    }
    const off = -(cam * 0.3) % 500;
    for (let x = off - 500; x < W + 500; x += 500) {
      this.poly(
        [
          [x, 369],
          [x + 490, 355],
          [x + 490, 380],
          [x, 394],
        ],
        p.city[2],
        "#25435f",
        2,
      );
      this.line(
        [
          [x, 369],
          [x + 490, 355],
        ],
        p.edge,
        4,
      );
      this.poly(
        [
          [x + 74, 390],
          [x + 109, 389],
          [x + 123, 550],
          [x + 56, 550],
        ],
        p.city[2],
      );
      this.line(
        [
          [x + 90, 401],
          [x + 90, 542],
        ],
        "#72a1b8",
        5,
      );
    }
  }
  background(cam, sector, p) {
    this.arcadeBackground(cam, p, sector);
    if (sector === 1 || sector === 3) this.facility(cam, sector, p);
  }
  facility(cam, sector, p) {
    const c = this.ctx,
      offset = -(cam * 0.48) % 410;
    const roof = c.createLinearGradient(0, 0, 0, 180);
    roof.addColorStop(0, "#1636529a");
    roof.addColorStop(1, "transparent");
    c.fillStyle = roof;
    c.fillRect(0, 0, W, 230);
    for (let x = offset - 410; x < W + 410; x += 410) {
      this.poly(
        [
          [x - 28, 0],
          [x + 9, 0],
          [x + 65, 141],
          [x + 63, 532],
          [x + 37, 532],
          [x + 37, 160],
        ],
        "#284761",
      );
      this.line(
        [
          [x + 15, 0],
          [x + 74, 141],
          [x + 74, 525],
        ],
        "#7491ae",
        3,
      );
      this.poly(
        [
          [x + 60, 73],
          [x + 363, 73],
          [x + 377, 94],
          [x + 68, 94],
        ],
        "#345675",
        "#7794b0",
      );
      this.line(
        [
          [x + 90, 80],
          [x + 343, 80],
        ],
        p.accent,
        2,
      );
      this.glow(x + 225, 85, 105, p.accent, 0.1);
      if (sector === 1) {
        c.fillStyle = "#122b3aaa";
        c.fillRect(x + 130, 325, 172, 183);
        this.line(
          [
            [x + 130, 325],
            [x + 302, 325],
          ],
          "#456478",
        );
        for (let n = 0; n < 4; n++) {
          c.fillStyle = "#263d4c";
          c.fillRect(x + 142, 340 + n * 38, 148, 26);
          c.fillStyle = "#54cbe3";
          c.fillRect(x + 150, 347 + n * 38, 3, 4);
          c.fillStyle = "#142c38";
          c.fillRect(x + 172, 347 + n * 38, 107, 4);
        }
      }
    }
  }
  environment(s, cam, p) {
    const c = this.ctx,
      world = s.world || {},
      ground = world.groundY || GROUND_Y || 550,
      gaps = world.gaps || [];
    // The void exposes distant pipework and orange depth lights.
    const under = c.createLinearGradient(0, ground, 0, H);
    under.addColorStop(0, "#101b27");
    under.addColorStop(1, "#04090f");
    c.fillStyle = under;
    c.fillRect(cam - 20, ground, W + 40, H - ground);
    for (const gap of gaps) {
      if (gap.x > cam + W || gap.x + gap.w < cam) continue;
      this.glow(gap.x + gap.w / 2, 691, 220, "#dd6240", 0.18);
      this.line(
        [
          [gap.x - 30, 636],
          [gap.x + gap.w + 50, 665],
        ],
        "#263b43",
        11,
      );
      this.line(
        [
          [gap.x + 40, 630],
          [gap.x + gap.w - 60, 635],
        ],
        "#587075",
        2,
      );
      for (let x = gap.x + 90; x < gap.x + gap.w; x += 135) {
        this.line(
          [
            [x, 612],
            [x, 720],
          ],
          "#172d36",
          12,
        );
        c.fillStyle = "#ee9b50";
        c.fillRect(x - 3, 635, 6, 4);
      }
      this.text(
        "VOID // ワイヤーで対岸へ",
        gap.x + gap.w / 2,
        ground + 56,
        "#e5b369",
        12,
        "center",
      );
    }
    let cursor = 0;
    for (const gap of [...gaps, { x: world.width || 9100, w: 0 }].sort(
      (a, b) => a.x - b.x,
    )) {
      if (gap.x > cursor)
        this.floor(
          Math.max(cursor, cam - 50),
          Math.min(gap.x, cam + W + 50),
          ground,
          p,
        );
      cursor = gap.x + gap.w;
    }
    for (const platform of world.platforms || []) {
      if (platform.x > cam + W + 50 || platform.x + platform.w < cam - 50)
        continue;
      this.platform(platform, p);
    }
    for (const d of world.decor || []) {
      if (d.x < cam - 160 || d.x > cam + W + 160) continue;
      if (d.kind === "sign") {
        const y = Math.min(d.y || 450, 490),
          width = d.w || 170;
        c.fillStyle = "#0a1b27d9";
        c.fillRect(d.x, y, width, 33);
        this.line(
          [
            [d.x, y],
            [d.x + width, y],
          ],
          d.color || "#507283",
        );
        this.text(
          d.text || "TRINITY / ACCESS",
          d.x + 10,
          y + 21,
          d.color || "#89aab9",
          10,
        );
      } else if (d.kind === "antenna") {
        this.line(
          [
            [d.x, ground],
            [d.x, ground - 95],
            [d.x + 17, ground - 105],
          ],
          "#3a5460",
          3,
        );
        this.glow(d.x + 17, ground - 105, 9, p.accent, 0.6);
      }
    }
    for (const sector of SECTORS || []) {
      if (sector.start < cam - 180 || sector.start > cam + W + 100) continue;
      const x = sector.start + 80;
      this.line(
        [
          [x, ground - 1],
          [x, ground + 12],
        ],
        "#668b98",
        2,
      );
      this.text(
        `0${(sector.id || 0) + 1} / ${sector.shortName || sector.name || "SECTOR"}`,
        x,
        ground + 40,
        "#65818d",
        13,
      );
    }
    for (const gate of world.gates || [])
      if (gate.x > cam - 120 && gate.x < cam + W + 120) this.gate(gate);
    for (const relay of world.relays || [])
      if (relay.x > cam - 150 && relay.x < cam + W + 150) this.relay(relay);
    for (const anchor of world.anchors || [])
      if (anchor.x > cam - 50 && anchor.x < cam + W + 50) {
        this.ellipse(anchor.x, anchor.y, 10, 10, "#18262b", "#d4ab50", 2);
        this.ellipse(anchor.x, anchor.y, 4, 4, "#ffe5a0");
      }
    for (const item of world.pickups || [])
      if (!item.collected && item.x > cam - 30 && item.x < cam + W + 30) {
        const y = item.y + Math.sin(this.time * 3 + item.x) * 5,
          health = item.kind === "health";
        this.glow(item.x, y, 28, health ? "#62ffb6" : "#a999ff", 0.24);
        this.poly(
          [
            [item.x, y - 13],
            [item.x + 11, y],
            [item.x, y + 13],
            [item.x - 11, y],
          ],
          "#172d3b",
          health ? "#73efb2" : "#b4a2ff",
          1.5,
        );
        c.fillStyle = health ? "#8dfbcd" : "#d4c4ff";
        if (health) {
          c.fillRect(item.x - 5, y - 1.5, 10, 3);
          c.fillRect(item.x - 1.5, y - 5, 3, 10);
        } else
          this.poly(
            [
              [item.x + 2, y - 7],
              [item.x - 4, y + 1],
              [item.x, y + 1],
              [item.x - 2, y + 7],
              [item.x + 5, y - 1],
              [item.x, y - 1],
            ],
            "#d4c4ff",
          );
      }
  }
  floor(x1, x2, y, p) {
    if (x2 <= x1) return;
    const c = this.ctx;
    c.fillStyle = "#22394f";
    c.fillRect(x1, y, x2 - x1, H - y);
    c.fillStyle = "#456881";
    c.fillRect(x1, y + 9, x2 - x1, 65);
    c.fillStyle = "#172b42";
    c.fillRect(x1, y + 75, x2 - x1, H - y - 75);
    this.line(
      [
        [x1, y],
        [x2, y],
      ],
      "#d3f2f5",
      3,
    );
    this.line(
      [
        [x1, y + 5],
        [x2, y + 5],
      ],
      p.edge,
      3,
    );
    c.save();
    c.beginPath();
    c.rect(x1, y + 9, x2 - x1, H - y);
    c.clip();
    for (let x = Math.floor(x1 / 190) * 190; x < x2; x += 190) {
      this.poly(
        [
          [x + 10, y + 19],
          [x + 168, y + 19],
          [x + 176, y + 62],
          [x + 17, y + 62],
        ],
        "#35546e",
        "#7690a4",
        1.5,
      );
      this.line(
        [
          [x + 28, y + 28],
          [x + 147, y + 28],
        ],
        "#93b7c7",
        2,
      );
      this.line(
        [
          [x + 8, y + 83],
          [x + 17, H],
        ],
        "#35536e",
        2,
      );
      this.poly(
        [
          [x + 26, y + 11],
          [x + 35, y + 11],
          [x + 26, y + 16],
          [x + 17, y + 16],
        ],
        "#ffdb83",
      );
    }
    c.restore();
  }
  platform(b, p) {
    const c = this.ctx,
      h = b.h || 20;
    this.poly(
      [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w - 8, b.y + h],
        [b.x + 8, b.y + h],
      ],
      "#263d49",
      "#506b77",
    );
    c.fillStyle = "#0b202c";
    c.fillRect(b.x + 8, b.y + 7, b.w - 16, Math.max(3, h - 10));
    this.line(
      [
        [b.x + 4, b.y],
        [b.x + b.w - 4, b.y],
      ],
      "#9dc4cc",
      2,
    );
    for (let x = b.x + 15; x < b.x + b.w - 8; x += 27)
      this.line(
        [
          [x, b.y + h - 2],
          [x + 13, b.y + 7],
        ],
        "#536a70",
        2,
      );
    this.line(
      [
        [b.x + 17, b.y + h],
        [b.x + 42, b.y + h + 40],
        [b.x + 76, b.y + h],
      ],
      "#18323f",
      5,
    );
    this.glow(b.x + b.w / 2, b.y + h + 7, 65, "#4fd9ff", 0.07);
  }
  gate(g) {
    const c = this.ctx,
      x = g.x,
      y = g.y ?? 550,
      h = g.h || 170,
      w = g.w || 40;
    // Gate coordinates are grounded in world data, regardless of collision height.
    const top = y,
      bottom = y + h;
    const color =
      g.kind?.includes("blue") || g.id?.includes("blue")
        ? "#51cbef"
        : g.kind?.includes("gold") || g.id?.includes("gold")
          ? "#e6b951"
          : "#f46e66";
    for (const sx of [x - 7, x + w - 1]) {
      c.fillStyle = "#152c37";
      c.fillRect(sx, top - 15, 10, h + 19);
      this.line(
        [
          [sx + 2, top],
          [sx + 2, bottom],
        ],
        "#617d84",
        1,
      );
    }
    if (g.open) {
      this.line(
        [
          [x, bottom - 1],
          [x + w, bottom - 1],
        ],
        "#7ddfa3",
        3,
      );
      this.text("ACCESS GRANTED", x + w / 2, top - 22, "#8fe3b5", 10, "center");
      return;
    }
    c.save();
    c.globalAlpha = 0.75 + Math.sin(this.time * 5) * 0.12;
    const energy = c.createLinearGradient(x, 0, x + w, 0);
    energy.addColorStop(0, color + "90");
    energy.addColorStop(0.5, color + "20");
    energy.addColorStop(1, color + "90");
    c.fillStyle = energy;
    c.fillRect(x + 3, top, w - 6, h);
    for (let yy = top + 9; yy < bottom; yy += 17)
      this.line(
        [
          [x + 2, yy],
          [x + w - 2, yy + 7],
        ],
        color,
        1,
      );
    this.line(
      [
        [x + 4, top],
        [x + 4, bottom],
      ],
      color,
      2,
    );
    this.line(
      [
        [x + w - 4, top],
        [x + w - 4, bottom],
      ],
      color,
      2,
    );
    c.restore();
    this.glow(x + w / 2, bottom - h / 2, 90, color, 0.12);
    this.text(
      g.id?.includes("red")
        ? "RED / 破壊"
        : g.id?.includes("blue")
          ? "RELAY / LINK"
          : "GOLD / WIRE",
      x + w / 2,
      top - 22,
      color,
      11,
      "center",
    );
    if (g.maxHp && g.hp < g.maxHp)
      this.bar(x + w / 2, top - 12, 60, g.hp / g.maxHp, color);
  }
  relay(r) {
    const c = this.ctx,
      x = r.x + (r.w || 42) / 2,
      y = r.y + (r.h || 56) / 2,
      color = r.active ? "#72f3b2" : "#5cdbff";
    this.line(
      [
        [x, y + 24],
        [x, 540],
      ],
      "#294551",
      5,
    );
    this.line(
      [
        [x + 3, y + 26],
        [x + 3, 540],
      ],
      "#526b72",
      1,
    );
    this.poly(
      [
        [x - 22, y - 30],
        [x + 19, y - 30],
        [x + 27, y - 22],
        [x + 27, y + 24],
        [x - 22, y + 24],
      ],
      "#1c3442",
      "#6a8992",
      2,
    );
    c.fillStyle = "#071b27";
    c.fillRect(x - 14, y - 23, 31, 33);
    c.fillStyle = color;
    c.fillRect(x - 10, y - 19, 23, 2);
    this.glow(x + 1, y - 5, 40, color, 0.19);
    this.ellipse(x + 2, y - 5, 8, 8, null, color, 1.5);
    this.line(
      [
        [x - 3, y - 5],
        [x + 1, y - 1],
        [x + 8, y - 9],
      ],
      color,
      2,
    );
    this.text(
      r.active ? "LINK COMPLETE" : "DRONE → RELAY",
      x,
      y - 43,
      color,
      11,
      "center",
    );
    if (!r.active) {
      const pulse = 18 + ((this.time * 16) % 18);
      c.save();
      c.globalAlpha = 1 - (pulse - 18) / 18;
      this.ellipse(x + 1, y - 5, pulse, pulse, null, color, 1);
      c.restore();
    }
  }
  heroPose(p) {
    const index = p.character || 0,
      scale = (p.h || 68) / 100;
    const moving = Math.abs(p.vx || 0) > 15,
      jump = !p.grounded;
    const attack = (p.attackTime || 0) > 0;
    const stride = Math.sin(this.time * (index === 2 ? 20 : 16));
    const boost = p.dashTime > 0 || p.boostTime > 0;
    return {
      scale,
      angle: p.wire
        ? -0.22
        : attack || p.magnetic
          ? 0
          : boost
            ? 0.18
            : moving
              ? 0.075
              : 0,
      bob:
        moving && !jump && !attack && !p.magnetic ? -Math.abs(stride) * 2 : 0,
    };
  }
  heroPoint(p, x, y) {
    const { scale, angle, bob } = this.heroPose(p);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const px = (x * cos - (y + bob) * sin) * scale;
    const py = (x * sin + (y + bob) * cos) * scale;
    return [
      p.x + (p.facing || 1) * px,
      p.y + (p.magnetic ? -(p.h || 68) - py : py),
    ];
  }
  connections(s) {
    const c = this.ctx,
      p = s.player;
    if (s.possession) {
      const drone = (s.enemies || []).find(
        (e) => e.id === s.possession.enemyId,
      );
      if (drone) {
        c.save();
        c.setLineDash([4, 8]);
        c.lineDashOffset = -this.time * 35;
        this.line(
          [
            this.heroPoint(p, 26, -59),
            [p.x + 65, p.y - 90],
            [drone.x, drone.y - 18],
          ],
          "#5bd8ff99",
          1.5,
        );
        c.restore();
        this.text(
          `REMOTE LINK  ${Math.ceil(s.possession.remaining || 0)}s`,
          drone.x,
          drone.y - 61,
          "#8ae7ff",
          11,
          "center",
        );
        this.ellipse(p.x, p.y - 37, 36, 48, "#3ccaff10", "#64d9ff77");
      }
    }
    if (p?.wire) {
      const wire = p.wire,
        ax = wire.anchorX ?? wire.toX,
        ay = wire.anchorY ?? wire.toY;
      if (Number.isFinite(ax) && Number.isFinite(ay)) {
        this.line([this.heroPoint(p, 24, -91), [ax, ay]], "#f7bf46", 4);
        this.line([this.heroPoint(p, 24, -91), [ax, ay]], "#fff5c8", 1.2);
        this.line(
          [this.heroPoint(p, -24, -80), [ax - 5, ay + 8]],
          "#f9d775aa",
          1.5,
        );
        this.ellipse(
          ax,
          ay,
          18 + Math.sin(this.time * 30) * 3,
          18,
          null,
          "#ffe2a0",
          2,
        );
        this.glow(ax, ay, 40, "#ffc960", 0.5);
      }
    }
  }
  hero(p, s, ghost = false) {
    const c = this.ctx,
      index = p.character || 0;
    const color = ["#ff4963", "#328eff", "#ffd04d"][index];
    const shade = ["#a9264b", "#2453a2", "#bf842a"][index];
    const ink = "#152239",
      skin = "#ffd6b8",
      hair = "#162032";
    const moving = Math.abs(p.vx || 0) > 15,
      jump = !p.grounded;
    const phase = this.time * (index === 2 ? 20 : 16),
      stride = Math.sin(phase);
    const attack = (p.attackTime || 0) > 0,
      skill = (p.skillTime || 0) > 0;
    const wire = !!p.wire,
      hack = index === 1 && (skill || !!s.possession);
    const boost = p.dashTime > 0 || p.boostTime > 0;
    const pose = this.heroPose(p);
    const attackHand = [
      26 / pose.scale - 26,
      (p.magnetic ? 39 - (p.h || 68) : -39) / pose.scale,
    ];
    if (!ghost) {
      this.ellipse(
        p.x,
        p.grounded ? p.y + 3 : (s.world?.groundY || 550) + 3,
        25 * pose.scale,
        5 * pose.scale,
        "#18345250",
      );
      if (boost || p.overdrive > 0) {
        c.save();
        c.globalAlpha = 0.18;
        for (let i = 3; i > 0; i--) {
          c.save();
          c.translate(-(p.facing || 1) * i * 20, 0);
          this.hero(p, s, true);
          c.restore();
        }
        c.restore();
        this.line(
          [
            [p.x - (p.facing || 1) * 40, p.y - (p.h || 68) * 0.55],
            [p.x - (p.facing || 1) * 98, p.y - (p.h || 68) * 0.55],
          ],
          color,
          4,
        );
      }
      if (p.overdrive > 0)
        this.ellipse(
          p.x,
          p.y - (p.h || 68) / 2,
          40 * pose.scale,
          53 * pose.scale,
          null,
          "#e7a0ff",
          3,
        );
    }
    c.save();
    c.translate(p.x, p.y);
    c.scale(p.facing || 1, 1);
    if (p.magnetic) {
      c.translate(0, -(p.h || 68));
      c.scale(1, -1);
      this.line(
        [
          [-17, 0],
          [19, 0],
        ],
        "#c7ffff",
        4,
      );
    }
    if (p.invulnerable > 0 && !s.possession && p.overdrive <= 0 && !ghost)
      c.globalAlpha *= 0.88 + Math.sin(this.time * 48) * 0.1;
    // Match the simulation height after attaching magnetic feet to the collider top.
    c.scale(pose.scale, pose.scale);
    c.rotate(pose.angle);
    c.translate(0, pose.bob);
    // Large dark hair silhouettes preserve the supplied three character identities.
    const flow = Math.sin(this.time * 9) * 3 + (moving || jump ? 12 : 0);
    if (index === 0) {
      c.beginPath();
      c.moveTo(-9, -92);
      c.bezierCurveTo(-27, -108, -30 - flow, -73, -43 - flow, -68);
      c.bezierCurveTo(-22 - flow, -58, -21, -81, -7, -82);
      c.closePath();
      c.fillStyle = hair;
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 2.5;
      c.stroke();
      this.line(
        [
          [-12, -90],
          [-21, -86],
          [-32 - flow, -70],
        ],
        "#465374",
        2,
      );
      this.ellipse(-10, -92, 5, 4, color, ink, 2);
    } else if (index === 2) {
      this.poly(
        [
          [-10, -90],
          [-19, -81],
          [-22 - flow, -66],
          [-34 - flow, -55],
          [-16, -55],
          [-6, -72],
          [7, -72],
        ],
        hair,
        ink,
        2.5,
      );
      this.line(
        [
          [-12, -80],
          [-19 - flow, -64],
          [-28 - flow, -59],
        ],
        "#465374",
        2,
      );
    } else {
      this.poly(
        [
          [-11, -92],
          [-17, -82],
          [-16, -66],
          [-9, -62],
          [-4, -73],
          [11, -71],
          [12, -88],
        ],
        hair,
        ink,
        2.5,
      );
    }
    const limb = (a, b, width, fill) => this.limb(...a, ...b, width, fill, ink);
    const rearHand = wire
      ? [-24, -80]
      : hack
        ? [-6, -54]
        : attack
          ? [attackHand[0] - 3, attackHand[1] + 2]
          : moving
            ? [-20 - stride * 10, -47 + stride * 7]
            : [-15, -39];
    limb([-9, -64], [-18, -52], 4.2, index === 2 ? shade : skin);
    limb([-18, -52], rearHand, 4, shade);
    this.ellipse(...rearHand, 4, 4, ink);
    // Long clean leg shapes: RED shorts and bare thighs; BLUE pants; GOLD full suit.
    const legs = jump
      ? [
          [-15, -27, -24, -11],
          [19, -31, 8, -14],
        ]
      : moving
        ? [
            [
              -7 - stride * 14,
              -22,
              -8 + stride * 20,
              -Math.max(0, stride) * 11,
            ],
            [7 + stride * 14, -22, 8 - stride * 20, -Math.max(0, -stride) * 11],
          ]
        : [
            [-10, -21, -13, 0],
            [9, -21, 13, 0],
          ];
    for (let n = 0; n < 2; n++) {
      const [kx, ky, fx, fy] = legs[n],
        fill = n === 0 ? shade : color;
      limb([n ? 6 : -6, -42], [kx, ky], 5.2, index === 0 ? skin : fill);
      if (index === 2)
        this.line(
          [
            [n ? 10 : -10, -40],
            [kx + 3, ky],
          ],
          ink,
          3,
        );
      limb([kx, ky], [fx, fy - 5], 4.5, index === 0 ? fill : ink);
      this.ellipse(kx, ky, 5.5, 4, index === 0 ? fill : ink, ink, 1.5);
      this.poly(
        [
          [fx - 5, fy - 9],
          [fx + 4, fy - 9],
          [fx + 6, fy - 4],
          [fx + 13, fy - 3],
          [fx + 13, fy + 1],
          [fx - 5, fy + 1],
        ],
        ink,
        ink,
        2,
      );
      this.line(
        [
          [fx - 3, fy - 2],
          [fx + 10, fy - 2],
        ],
        index === 1 ? "#70efff" : color,
        2.5,
      );
    }
    if (index === 0) {
      this.poly(
        [
          [-10, -49],
          [10, -49],
          [13, -38],
          [2, -36],
          [-1, -41],
          [-12, -38],
        ],
        ink,
        ink,
        2,
      );
      this.poly(
        [
          [-8, -57],
          [9, -57],
          [10, -48],
          [-9, -48],
        ],
        skin,
        ink,
        2,
      );
    } else {
      this.poly(
        [
          [-9, -56],
          [9, -56],
          [11, -40],
          [-10, -40],
        ],
        color,
        ink,
        2.5,
      );
    }
    this.poly(
      [
        [-10, -72],
        [7, -73],
        [13, -65],
        [10, index === 0 ? -57 : -48],
        [-9, index === 0 ? -57 : -48],
        [-13, -65],
      ],
      color,
      ink,
      2.5,
    );
    this.poly(
      [
        [-10, -69],
        [-3, -65],
        [-4, index === 0 ? -58 : -49],
        [-10, index === 0 ? -58 : -48],
      ],
      shade,
    );
    if (index === 2)
      this.poly(
        [
          [-11, -68],
          [-6, -64],
          [-6, -51],
          [-10, -49],
        ],
        ink,
      );
    this.line(
      [
        [3, -69],
        [4, index === 0 ? -59 : -51],
      ],
      "#fff4d6",
      2,
    );
    this.line(
      [
        [-10, -46],
        [10, -46],
      ],
      ink,
      4,
    );
    this.poly(
      [
        [-2, -48],
        [3, -48],
        [3, -44],
        [-2, -44],
      ],
      "#d7e8ef",
    );
    limb([0, -75], [1, -70], 3, skin);
    // Oversized face, bright eye and bangs remain legible at phone scale.
    this.ellipse(0, -84, 12.5, 13, skin, ink, 2.5);
    this.poly(
      [
        [-13, -85],
        [-12, -94],
        [-5, -100],
        [5, -99],
        [12, -93],
        [13, -84],
        [7, -88],
        [4, -92],
        [0, -85],
        [-3, -92],
        [-8, -83],
      ],
      hair,
      ink,
      2,
    );
    this.line(
      [
        [-7, -94],
        [4, -97],
        [10, -92],
      ],
      "#495978",
      2,
    );
    if (index !== 0)
      this.line(
        [
          [-10, -93],
          [-3, -97],
          [7, -95],
        ],
        color,
        3,
      );
    this.ellipse(7, -83, 3.3, 3.8, "#ffffff");
    this.ellipse(8, -83, 1.7, 2.7, ink);
    this.line(
      [
        [4, -87],
        [10, -87],
      ],
      ink,
      1.5,
    );
    this.line(
      [
        [7, -76],
        [10, -77],
      ],
      "#a85062",
      1.3,
    );
    const hand = wire
      ? [24, -91]
      : attack
        ? attackHand
        : hack
          ? [26, -59]
          : moving
            ? [18 + stride * 12, -45 - stride * 8]
            : [17, -38];
    const elbow = wire
      ? [22, -77]
      : hack
        ? [17, -51]
        : attack
          ? [attackHand[0] - 7, attackHand[1] + 4]
          : [18, -54];
    limb([10, -65], elbow, 4.5, index === 2 ? color : skin);
    limb(elbow, hand, 4.2, index === 1 ? "#2453a2" : shade);
    this.ellipse(...hand, 4, 4, ink);
    if (index === 1) {
      this.poly(
        [
          [hand[0] - 7, hand[1] - 9],
          [hand[0] + 5, hand[1] - 10],
          [hand[0] + 8, hand[1] + 3],
          [hand[0] - 5, hand[1] + 4],
        ],
        ink,
        "#97f8ff",
        1.5,
      );
      this.line(
        [
          [hand[0] - 3, hand[1] - 5],
          [hand[0] + 3, hand[1] - 5],
        ],
        "#88ffff",
        2,
      );
      if (hack) {
        this.ellipse(
          hand[0] + 4,
          hand[1] - 9,
          19,
          19,
          "#48dfff20",
          "#8cffff",
          2,
        );
        this.line(
          [
            [hand[0] + 4, hand[1] - 20],
            [hand[0] + 4, hand[1] + 2],
          ],
          "#dbffff",
          1,
        );
      }
    }
    if (index === 2) {
      this.ellipse(hand[0], hand[1], 6, 5, ink, "#fff0a0", 2);
      this.ellipse(hand[0], hand[1], 2, 2, color);
    }
    if (index === 0 || (attack && !wire)) {
      c.save();
      c.translate(...hand);
      if (!attack) c.rotate(0.7);
      this.poly(
        [
          [-3, -6],
          [21, -6],
          [26, -2],
          [26, 3],
          [5, 3],
          [3, 10],
          [-2, 9],
        ],
        ink,
        ink,
        2,
      );
      this.line(
        [
          [1, -3],
          [21, -3],
        ],
        color,
        3,
      );
      if (attack)
        this.poly(
          [
            [26, -3],
            [38, -9],
            [34, -2],
            [48, 0],
            [34, 3],
            [38, 9],
            [26, 4],
          ],
          "#fff6bf",
          "#ffb64c",
          2,
        );
      c.restore();
    }
    if (index === 0 && skill) {
      this.line(
        [
          [21, -77],
          [41, -63],
          [39, -44],
        ],
        "#fff1ad",
        7,
      );
      this.line(
        [
          [21, -77],
          [41, -63],
          [39, -44],
        ],
        "#ff6673",
        3,
      );
    }
    c.restore();
    if (!ghost && s.mode === "playing") {
      this.poly(
        [
          [p.x - 4, p.y - (p.h || 68) - 14],
          [p.x + 4, p.y - (p.h || 68) - 14],
          [p.x, p.y - (p.h || 68) - 6],
        ],
        color,
        ink,
        1.5,
      );
      if (s.possession)
        this.text(
          "SAFE LINK",
          p.x,
          p.y - (p.h || 68) - 20,
          "#93f8ff",
          10,
          "center",
        );
    }
  }
  limb(x1, y1, x2, y2, width, fill, edge) {
    this.line(
      [
        [x1, y1],
        [x2, y2],
      ],
      edge,
      width * 2 + 2,
    );
    this.line(
      [
        [x1, y1],
        [x2, y2],
      ],
      fill,
      width * 2,
    );
    this.line(
      [
        [x1 - 1, y1],
        [x2 - 1, y2],
      ],
      "#c6d2d51f",
      1,
    );
  }
  leg(hx, hy, kx, ky, fx, fy, armor, light, skin, back) {
    this.limb(hx, hy, kx, ky, 4.3, skin, "#19202a");
    this.line(
      [
        [hx, hy + 4],
        [hx + (kx - hx) * 0.6, hy + (ky - hy) * 0.6],
      ],
      "#222b36",
      8,
    );
    this.line(
      [
        [hx + 3, hy + 3],
        [kx + 3, ky - 4],
      ],
      armor,
      3,
    );
    this.ellipse(kx, ky, 5, 4.5, "#263441", light, 0.7);
    this.limb(
      kx,
      ky + 3,
      fx,
      fy - 3,
      3.7,
      back ? "#1c2936" : "#30414c",
      "#0a1420",
    );
    this.line(
      [
        [kx + 1, ky + 5],
        [fx + 1, fy - 4],
      ],
      light + "99",
      1,
    );
    this.poly(
      [
        [fx - 4, fy - 7],
        [fx + 3, fy - 7],
        [fx + 5, fy - 3],
        [fx + 11, fy - 2],
        [fx + 11, fy + 1],
        [fx - 5, fy + 1],
      ],
      "#142330",
      "#08111a",
      1.1,
    );
    this.line(
      [
        [fx - 3, fy],
        [fx + 10, fy],
      ],
      "#6f8490",
      0.8,
    );
  }
  telegraph(e, s) {
    if (!(e.telegraph > 0)) return;
    const c = this.ctx,
      wave = e.attackKind === "wave",
      color = e.type === "boss" ? "#ff6875" : "#f6ae64";
    c.save();
    c.globalAlpha = 0.35 + Math.sin(this.time * 20) * 0.1;
    if (wave) {
      const radius = e.type === "boss" ? 470 : 150;
      const grad = c.createLinearGradient(0, 522, 0, 553);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, color + "a0");
      c.fillStyle = grad;
      c.fillRect(e.x - radius, 522, radius * 2, 31);
      this.line(
        [
          [e.x - radius, 549],
          [e.x + radius, 549],
        ],
        color,
        3,
      );
      for (let x = e.x - radius + 20; x < e.x + radius; x += 50)
        this.poly(
          [
            [x, 541],
            [x + 7, 531],
            [x + 14, 541],
          ],
          null,
          color,
          1.5,
        );
      this.text(
        "▲ JUMP / 衝撃波",
        e.x,
        e.y - e.h - 29,
        "#ffb7b3",
        12,
        "center",
      );
    } else if (s.player) {
      const p = s.player;
      c.setLineDash([9, 10]);
      this.line(
        [
          [e.x, e.y - e.h * 0.65],
          [p.x, p.y - 35],
        ],
        color,
        1.5,
      );
      c.setLineDash([]);
      this.ellipse(p.x, p.y - 35, 27, 27, null, color, 1);
      this.line(
        [
          [p.x - 34, p.y - 35],
          [p.x - 21, p.y - 35],
        ],
        color,
      );
      this.line(
        [
          [p.x + 21, p.y - 35],
          [p.x + 34, p.y - 35],
        ],
        color,
      );
      c.globalAlpha = 0.9;
      this.text(
        "DODGE / GOLD K・Shift",
        e.x,
        e.y - e.h - 29,
        "#ffd2d7",
        12,
        "center",
      );
    }
    c.restore();
  }
  securityRobot(e) {
    const c = this.ctx,
      ink = "#182940",
      hot = "#ff536a";
    this.ellipse(e.x, e.y + 3, 23, 5, "#18345250");
    c.save();
    c.translate(e.x, e.y);
    c.scale(e.facing || -1, 1);
    const walk =
      Math.abs(e.vx || 0) > 5 ? Math.sin(this.time * 12 + e.x) * 9 : 0;
    for (const sign of [-1, 1]) {
      const x = sign * 9,
        step = walk * sign;
      this.limb(x, -29, x + step, -15, 4.5, "#547991", ink);
      this.limb(x + step, -15, x - step, -4, 4.5, "#34516e", ink);
      this.poly(
        [
          [x - step - 7, -7],
          [x - step + 5, -7],
          [x - step + 11, -2],
          [x - step + 11, 1],
          [x - step - 7, 1],
        ],
        ink,
        ink,
        2,
      );
      this.line(
        [
          [x - step - 3, -2],
          [x - step + 8, -2],
        ],
        "#8bc4d7",
        2,
      );
    }
    this.ellipse(-15, -46, 9, 16, "#34516e", ink, 2.5);
    this.ellipse(0, -44, 21, 23, "#789aaf", ink, 3);
    this.poly(
      [
        [-15, -49],
        [15, -49],
        [13, -34],
        [0, -28],
        [-13, -34],
      ],
      "#416780",
    );
    this.ellipse(0, -43, 7, 7, ink);
    this.ellipse(0, -43, 4, 4, hot);
    this.ellipse(0, -70, 17, 15, "#b0c9d5", ink, 3);
    this.poly(
      [
        [-12, -74],
        [13, -74],
        [15, -67],
        [-12, -64],
      ],
      ink,
      ink,
      2,
    );
    this.line(
      [
        [-7, -69],
        [10, -70],
      ],
      hot,
      3,
    );
    this.line(
      [
        [-9, -79],
        [6, -80],
      ],
      "#e9fbff",
      2,
    );
    const aiming = e.telegraph > 0 || e.attackTime < 0.14;
    const hand = aiming ? [31, -49] : [25, -32];
    this.limb(16, -51, 24, -39, 5, "#8aafc4", ink);
    this.limb(24, -39, ...hand, 4.5, "#496c86", ink);
    c.save();
    c.translate(...hand);
    if (!aiming) c.rotate(0.55);
    this.poly(
      [
        [-4, -6],
        [23, -6],
        [27, -2],
        [27, 4],
        [3, 5],
        [0, 10],
        [-4, 9],
      ],
      ink,
      ink,
      2,
    );
    this.line(
      [
        [3, -2],
        [21, -2],
      ],
      hot,
      2,
    );
    c.restore();
    c.restore();
    if (e.hp < e.maxHp) this.bar(e.x, e.y - e.h - 28, 44, e.hp / e.maxHp, hot);
  }
  enemy(e, s) {
    if (e.type === "drone") return this.drone(e, s);
    if (e.type !== "boss" && e.type !== "sentinel")
      return this.securityRobot(e);
    const c = this.ctx,
      boss = e.type === "boss",
      sentinel = e.type === "sentinel";
    const scale = boss ? 2.24 : sentinel ? 1.6 : 0.85,
      color = e.controlled
        ? "#6bebff"
        : boss
          ? e.shielded
            ? "#c495ff"
            : "#ffa367"
          : sentinel
            ? "#f8c267"
            : "#f16d66";
    this.ellipse(e.x, e.y + 2, 24 * scale, 5 * scale, "#040b1480");
    if (boss) {
      this.glow(e.x, e.y - 80, 175, e.shielded ? "#ae75e9" : "#ff946b", 0.1);
      if (e.shielded) {
        c.save();
        c.globalAlpha = 0.38;
        this.ellipse(e.x, e.y - 100, 115, 119, "#ac92ff0b", "#ac92ff", 1.4);
        for (let n = 0; n < 6; n++) {
          const a = (n * TAU) / 6 + this.time * 0.15,
            x = e.x + Math.cos(a) * 112,
            y = e.y - 100 + Math.sin(a) * 117;
          this.poly(
            [
              [x, y - 7],
              [x + 6, y - 3],
              [x + 6, y + 4],
              [x, y + 8],
              [x - 6, y + 4],
              [x - 6, y - 3],
            ],
            null,
            "#c3abff",
          );
        }
        c.restore();
      }
      if (!e.shielded) {
        this.ellipse(
          e.x,
          e.y - 99,
          41 + Math.sin(this.time * 6) * 4,
          41,
          null,
          "#ffbd7955",
          2,
        );
        this.text(
          e.marked ? "CORE MARKED / 集中攻撃" : "SHIELD DOWN",
          e.x,
          e.y - e.h - 39,
          "#ffc28f",
          11,
          "center",
        );
      }
    }
    c.save();
    c.translate(e.x, e.y);
    c.scale((e.facing || -1) * scale, scale);
    const walk =
      Math.sin(this.time * 9 + e.x * 0.05) * (Math.abs(e.vx || 0) > 5 ? 7 : 1);
    if (e.stun > 0) c.rotate(Math.sin(this.time * 41) * 0.035);
    // Armoured legs: mechanical pistons, offset knee joints, weighted feet.
    for (const [side, k] of [
      [-1, -1],
      [1, 1],
    ]) {
      const x = side * 11,
        step = walk * k;
      this.limb(x, -37, x + step, -20, 5.5, "#263947", "#070f17");
      this.line(
        [
          [x - 3, -33],
          [x + step - 3, -23],
        ],
        "#77828a",
        2,
      );
      this.ellipse(x + step, -20, 6, 5.5, "#172936", "#5c7580", 1);
      this.limb(x + step, -16, x - step, -5, 5, "#304b59", "#06111a");
      this.poly(
        [
          [x + step - 6, -17],
          [x + step + 6, -17],
          [x - step + 5, -5],
          [x - step - 6, -5],
        ],
        "#253e4d",
        "#52707d",
        1,
      );
      this.poly(
        [
          [x - step - 7, -6],
          [x - step + 5, -6],
          [x - step + 11, -2],
          [x - step + 11, 2],
          [x - step - 8, 2],
        ],
        "#172e3b",
        "#516b75",
      );
      this.line(
        [
          [x - step - 5, 0],
          [x - step + 7, 0],
        ],
        "#78909a",
        1,
      );
    }
    this.poly(
      [
        [-16, -46],
        [14, -46],
        [19, -34],
        [10, -29],
        [-12, -30],
        [-19, -36],
      ],
      "#203946",
      "#070f19",
      2,
    );
    this.line(
      [
        [-12, -39],
        [12, -39],
      ],
      "#5c727b",
      2,
    );
    // Back vent unit and separately jointed arms.
    this.poly(
      [
        [-27, -72],
        [-17, -76],
        [-13, -50],
        [-24, -46],
        [-31, -52],
      ],
      "#122734",
      "#58717d",
    );
    for (let i = 0; i < 4; i++)
      this.line(
        [
          [-27, -67 + i * 4],
          [-21, -69 + i * 4],
        ],
        "#4c6c78",
        1,
      );
    this.limb(-21, -60, -29, -43, 6, "#29424f", "#0b1520");
    this.limb(-29, -43, -26, -30, 5, "#263c49", "#0b1520");
    this.poly(
      [
        [-24, -31],
        [-32, -33],
        [-35, -25],
        [-24, -23],
      ],
      "#182b39",
      "#59717c",
    );
    this.poly(
      [
        [-22, -70],
        [-14, -78],
        [12, -76],
        [25, -64],
        [18, -45],
        [7, -40],
        [-15, -44],
        [-23, -56],
      ],
      "#304754",
      "#081420",
      2,
    );
    this.poly(
      [
        [-17, -68],
        [-7, -72],
        [14, -68],
        [19, -61],
        [13, -49],
        [-8, -50],
        [-18, -58],
      ],
      "#1b303e",
      "#66828c",
      1,
    );
    this.poly(
      [
        [-15, -67],
        [-2, -69],
        [14, -64],
        [9, -60],
        [-11, -60],
      ],
      "#435b65",
    );
    this.ellipse(2, -58, boss ? 7 : 4, boss ? 7 : 4, "#081522", color, 1.5);
    this.ellipse(2, -58, boss ? 3.5 : 2, boss ? 3.5 : 2, color);
    this.line(
      [
        [-11, -52],
        [-7, -47],
      ],
      "#647e88",
      2,
    );
    this.line(
      [
        [10, -52],
        [7, -47],
      ],
      "#647e88",
      2,
    );
    // Helmet crown and recessed hostile optic.
    this.poly(
      [
        [-11, -76],
        [-13, -83],
        [-6, -91],
        [6, -91],
        [13, -83],
        [12, -73],
        [3, -69],
        [-8, -72],
      ],
      "#253c4a",
      "#071420",
      1.6,
    );
    this.poly(
      [
        [-9, -83],
        [-5, -88],
        [6, -87],
        [9, -82],
        [3, -79],
        [-8, -79],
      ],
      "#425a66",
    );
    this.poly(
      [
        [-6, -79],
        [12, -81],
        [12, -76],
        [-5, -74],
      ],
      "#07111b",
    );
    this.line(
      [
        [-3, -77],
        [10, -78],
      ],
      color,
      2,
    );
    this.glow(6, -78, 12, color, 0.35);
    this.poly(
      [
        [-3, -73],
        [8, -74],
        [5, -70],
        [-1, -70],
      ],
      "#697c84",
    );
    const aim = e.attackTime > 0 || e.telegraph > 0 || boss;
    const elbow = aim ? [31, -54] : [24, -43],
      hand = aim ? [42, -57] : [30, -31];
    this.limb(18, -62, ...elbow, 6.5, "#354f5b", "#071521");
    this.limb(...elbow, ...hand, 6, "#233d4b", "#071521");
    this.poly(
      [
        [14, -70],
        [25, -68],
        [31, -57],
        [21, -54],
        [14, -60],
      ],
      "#425e68",
      "#91a0a0",
      0.7,
    );
    this.line(
      [
        [19, -64],
        [25, -61],
      ],
      color,
      1.7,
    );
    c.save();
    c.translate(hand[0], hand[1]);
    if (!aim) c.rotate(0.65);
    this.poly(
      [
        [-5, -6],
        [21, -6],
        [26, -2],
        [26, 3],
        [8, 5],
        [3, 11],
        [-3, 9],
      ],
      "#142937",
      "#5c7884",
      1,
    );
    this.line(
      [
        [3, -3],
        [19, -3],
      ],
      "#668998",
      2,
    );
    this.line(
      [
        [10, 1],
        [25, 1],
      ],
      color,
      1,
    );
    if (e.attackTime > 0 && e.attackTime < 0.1) {
      this.glow(27, 0, 23, color, 0.5);
      this.poly(
        [
          [25, -3],
          [36, -5],
          [33, 0],
          [42, 3],
          [26, 4],
        ],
        "#ffd1a0",
      );
    }
    c.restore();
    if (boss) {
      // High silhouette, detached shoulder railguns and radiating control crown.
      for (const side of [-1, 1]) {
        this.poly(
          [
            [side * 17, -73],
            [side * 27, -95],
            [side * 38, -91],
            [side * 33, -65],
            [side * 25, -55],
          ],
          "#213440",
          "#607b8a",
        );
        this.poly(
          [
            [side * 26, -90],
            [side * 31, -88],
            [side * 28, -74],
            [side * 23, -74],
          ],
          "#645075",
          "#baa1d3",
          0.6,
        );
        this.line(
          [
            [side * 8, -89],
            [side * 15, -100],
            [side * 23, -102],
          ],
          "#987da8",
          2,
        );
        this.ellipse(side * 23, -102, 2, 2, color);
      }
      this.poly(
        [
          [-6, -90],
          [0, -105],
          [6, -90],
        ],
        "#433c55",
        "#a18bac",
        0.7,
      );
      this.line(
        [
          [-20, -44],
          [-31, -24],
        ],
        "#997a66",
        2,
      );
    }
    c.restore();
    if (e.hp < e.maxHp && !boss)
      this.bar(e.x, e.y - e.h - 35, sentinel ? 84 : 43, e.hp / e.maxHp, color);
    if (sentinel && !s.flags?.goldWire) {
      this.text("WIRE ANCHOR", e.x, e.y - e.h - 42, "#f4d78d", 11, "center");
      this.ellipse(
        e.x,
        e.y - e.h * 0.65,
        28 + Math.sin(this.time * 3) * 3,
        28,
        null,
        "#ffe39988",
        1,
      );
    }
    if (e.stun > 0) {
      this.line(
        [
          [e.x - 16, e.y - e.h - 15],
          [e.x - 9, e.y - e.h - 24],
          [e.x - 4, e.y - e.h - 14],
        ],
        "#9de8ff",
        1.5,
      );
    }
  }
  drone(e, s) {
    const c = this.ctx,
      y = e.y - (e.h || 34) / 2,
      t = this.time,
      controlled = e.controlled || s.possession?.enemyId === e.id;
    const color = controlled ? "#79e7ff" : "#ff7470";
    this.glow(e.x, y + 17, 38, controlled ? "#52d4ff" : "#ed825d", 0.2);
    this.ellipse(e.x, Math.min(550, e.y + 110), 20, 3, "#020e1c66");
    c.save();
    c.translate(e.x, y);
    c.rotate(Math.sin(t * 3 + e.x) * 0.05);
    for (const side of [-1, 1]) {
      this.line(
        [
          [side * 8, -2],
          [side * 27, -6],
        ],
        "#385563",
        5,
      );
      this.ellipse(side * 27, -5, 14, 5, "#0b1a24", "#577e8e", 1.3);
      this.ellipse(side * 27, -6, 10, 2, "#416876", "#7ab3bd", 0.7);
      this.line(
        [
          [side * 37, -6],
          [side * 17, -6],
        ],
        "#82e1ec",
        1,
      );
      this.poly(
        [
          [side * 29, 0],
          [side * 24, 0],
          [side * 27, 18 + Math.sin(t * 43) * 5],
        ],
        controlled ? "#75e8ff77" : "#78bfed66",
      );
    }
    this.poly(
      [
        [-19, -7],
        [-10, -16],
        [12, -15],
        [22, -5],
        [17, 10],
        [0, 15],
        [-16, 9],
      ],
      "#263f4f",
      "#738f9b",
      1.3,
    );
    this.poly(
      [
        [-14, -7],
        [-6, -12],
        [9, -11],
        [16, -5],
        [7, -1],
        [-9, -1],
      ],
      "#496474",
    );
    this.ellipse(2, 3, 8, 7, "#081c2b", "#546d7d", 1.5);
    this.ellipse(2, 3, 4, 4, color);
    this.ellipse(3, 2, 1.5, 1.5, "#edfffb");
    this.line(
      [
        [-10, 11],
        [-14, 19],
        [-9, 21],
      ],
      "#6a808b",
      2,
    );
    this.line(
      [
        [12, 11],
        [16, 18],
        [11, 21],
      ],
      "#6a808b",
      2,
    );
    if (controlled) {
      c.setLineDash([3, 4]);
      this.ellipse(0, 0, 48, 36, null, "#5cddff99", 1);
      c.setLineDash([]);
    }
    c.restore();
    if (!controlled && e.hackable !== false) {
      this.text("K / HACK", e.x, y - 34, "#83cee4", 10, "center");
      this.poly(
        [
          [e.x - 4, y - 29],
          [e.x + 4, y - 29],
          [e.x, y - 24],
        ],
        "#66c6e2",
      );
    }
    if (e.hp < e.maxHp) this.bar(e.x, y - 48, 48, e.hp / e.maxHp, color);
  }
  bar(x, y, width, fraction, color) {
    const c = this.ctx;
    c.fillStyle = "#071521cc";
    c.fillRect(x - width / 2 - 2, y - 2, width + 4, 7);
    c.fillStyle = "#3c475155";
    c.fillRect(x - width / 2, y, width, 3);
    c.fillStyle = color;
    c.fillRect(x - width / 2, y, width * clamp(fraction || 0, 0, 1), 3);
  }
  projectiles(s) {
    const c = this.ctx;
    for (const b of s.projectiles || []) {
      const color = b.color || (b.owner === "player" ? "#ffe3ac" : "#ff6573"),
        r = b.r || 4;
      if (b.type === "wave" || b.kind === "wave") {
        this.glow(b.x, b.y, 50, color, 0.35);
        this.poly(
          [
            [b.x - 17, b.y],
            [b.x - 12, b.y - 27],
            [b.x, b.y - 45],
            [b.x + 10, b.y - 16],
            [b.x + 20, b.y],
          ],
          color + "77",
        );
        this.line(
          [
            [b.x - 16, b.y],
            [b.x - 9, b.y - 27],
            [b.x, b.y - 44],
            [b.x + 12, b.y - 14],
          ],
          "#fff0cd",
          2,
        );
        continue;
      }
      const len = b.owner === "player" ? 19 : 13,
        speed = Math.hypot(b.vx || 0, b.vy || 0) || 1;
      const dx = (b.vx || 0) / speed,
        dy = (b.vy || 0) / speed;
      this.glow(b.x, b.y, r * 5, color, 0.34);
      this.line(
        [
          [b.x - dx * len, b.y - dy * len],
          [b.x, b.y],
        ],
        color,
        r * 1.5,
      );
      this.line(
        [
          [b.x - dx * len * 0.65, b.y - dy * len * 0.65],
          [b.x + dx * 3, b.y + dy * 3],
        ],
        "#f0fbff",
        Math.max(1, r * 0.5),
      );
    }
  }
  particles(s) {
    const c = this.ctx;
    for (const p of s.particles || []) {
      if (p.ttl <= 0) continue;
      c.save();
      c.globalAlpha = clamp(p.ttl / (p.maxTtl || p.ttl || 1), 0, 1);
      const size = p.size || 3,
        color = p.color || "#ffc782";
      if (p.type === "ring" || p.type === "shockwave") {
        const r = size + (1 - c.globalAlpha) * 45;
        this.ellipse(
          p.x,
          p.y,
          r,
          p.type === "shockwave" ? r * 0.25 : r,
          null,
          color,
          2,
        );
      } else if (p.type === "text")
        this.text(p.text || "", p.x, p.y, color, size || 14, "center");
      else if (p.type === "smoke")
        this.ellipse(p.x, p.y, size * 2, size * 1.6, color);
      else {
        this.line(
          [
            [p.x, p.y],
            [p.x - (p.vx || 0) * 0.025, p.y - (p.vy || 0) * 0.025],
          ],
          color,
          size,
        );
        if (size > 3) this.glow(p.x, p.y, size * 3, color, 0.2);
      }
      c.restore();
    }
  }
  foreground(s, cam, p) {
    const c = this.ctx,
      t = this.time;
    // Broken conduit and debris bring depth while preserving the playable plane.
    for (let i = Math.floor(cam / 320); i < Math.ceil((cam + W) / 320); i++) {
      const x = i * 320 + hash(i + 177) * 60,
        y = 596 + hash(i + 29) * 48;
      if ((s.world?.gaps || []).some((g) => x > g.x && x < g.x + g.w)) continue;
      this.poly(
        [
          [x, y],
          [x + 15, y - 6],
          [x + 28, y - 4],
          [x + 40, y + 4],
          [x + 29, y + 9],
          [x + 7, y + 7],
        ],
        "#0a1923",
        "#203440",
        1,
      );
      this.line(
        [
          [x + 80, y + 3],
          [x + 135, y + 7],
          [x + 142, y + 18],
        ],
        "#0a1823",
        5,
      );
      this.line(
        [
          [x + 81, y + 2],
          [x + 135, y + 6],
        ],
        "#354956",
        1,
      );
      if (i % 3 === 0) {
        this.ellipse(x + 77, 573, 39, 3, "#5e8b9b15");
        this.line(
          [
            [x + 51, 573],
            [x + 103, 573],
          ],
          "#7893a333",
          1,
        );
      }
    }
    if (s.sector === 3) {
      const x = 8010;
      c.save();
      c.globalAlpha = 0.55;
      this.line(
        [
          [x - 300, 595],
          [x - 150, 600],
          [x - 85, 580],
        ],
        "#5f4672",
        4,
      );
      this.line(
        [
          [x + 150, 587],
          [x + 250, 610],
          [x + 320, 605],
        ],
        "#5f4672",
        4,
      );
      c.restore();
    }
  }
  atmosphere(cam, p, s) {
    if (!(s.player?.hp < s.player?.maxHp * 0.25 && s.mode === "playing"))
      return;
    const c = this.ctx;
    const danger = c.createRadialGradient(640, 360, 350, 640, 360, 740);
    danger.addColorStop(0, "transparent");
    danger.addColorStop(1, "#ff304340");
    c.save();
    c.fillStyle = danger;
    c.globalAlpha = 0.65 + Math.sin(this.time * 4) * 0.25;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
}
