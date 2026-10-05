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
  { sky: "#111c2b", haze: "#644e57", light: "#f5a574", accent: "#fc625f" },
  { sky: "#071526", haze: "#1c5265", light: "#65d5ff", accent: "#4fd9ff" },
  { sky: "#181c28", haze: "#6e5741", light: "#ffd38a", accent: "#f3bf58" },
  { sky: "#120f22", haze: "#54445b", light: "#e9a0f1", accent: "#bd9bff" },
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
    this.grain = this.makeGrain();
  }
  makeGrain() {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 160;
    const g = tile.getContext("2d");
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = i % 2 ? "rgba(165,195,210,.075)" : "rgba(0,0,0,.15)";
      g.fillRect(hash(i) * 160, hash(i + 498) * 160, 1, 1);
    }
    return this.ctx.createPattern(tile, "repeat");
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
    const cam = state.camera?.x || 0,
      sector = clamp(state.sector || 0, 0, 3),
      palette = PALETTES[sector];
    c.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0);
    c.globalAlpha = 1;
    c.lineCap = "round";
    c.lineJoin = "round";
    this.background(cam, sector, palette);
    c.save();
    const shake = Math.min(state.shake || 0, 12);
    c.translate(
      -cam + Math.sin(this.time * 81) * shake,
      Math.cos(this.time * 67) * shake * 0.55,
    );
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
  background(cam, sector, p) {
    const c = this.ctx,
      t = this.time;
    const sky = c.createLinearGradient(0, 0, 0, 590);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(0.69, p.haze);
    sky.addColorStop(1, "#172735");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    this.glow(780 - ((cam * 0.025) % 220), 230, 370, p.light, 0.13);
    // A pale sun behind drifting ash and a fractured orbital ring.
    const sunX = 935 - cam * 0.018;
    this.ellipse(sunX, 170, 61, 61, "#dadcc7");
    this.glow(sunX, 170, 118, p.light, 0.18);
    c.fillStyle = p.sky;
    c.globalAlpha = 0.69;
    c.fillRect(sunX - 68, 150, 137, 15);
    c.fillRect(sunX - 64, 183, 125, 7);
    c.globalAlpha = 1;
    c.save();
    c.globalAlpha = 0.13;
    this.line(
      [
        [130 - cam * 0.01, -20],
        [910, 225],
        [1420, 360],
      ],
      "#c6e6e6",
      17,
    );
    this.line(
      [
        [130 - cam * 0.01, -20],
        [910, 225],
        [1420, 360],
      ],
      "#e5f5f3",
      1,
    );
    c.restore();
    for (let layer = 0; layer < 3; layer++) {
      const factor = 0.07 + layer * 0.075,
        base = 440 + layer * 30;
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i],
          bx = b.x - cam * factor - 180;
        if (bx + b.w < -40 || bx > W + 40) continue;
        const bh = b.h * (0.68 + layer * 0.22),
          top = base - bh;
        c.fillStyle = ["#293342", "#1c2e3c", "#142532"][layer];
        this.poly(
          [
            [bx, base],
            [bx, top + 12],
            [bx + b.w * 0.18, top + 12],
            [bx + b.w * 0.18, top],
            [bx + b.w * 0.59, top],
            [bx + b.w * 0.69, top + (b.damage > 0.55 ? 42 : 0)],
            [bx + b.w, top + 15],
            [bx + b.w, base],
          ],
          c.fillStyle,
        );
        c.fillStyle = ["#61717a", "#42606c", "#355364"][layer];
        c.globalAlpha = 0.24;
        c.fillRect(bx + 3, top + 19, 2, bh - 19);
        c.fillRect(bx + b.w * 0.71, top + 44, 2, bh - 44);
        c.globalAlpha = 1;
        if (i % 5 === 0) {
          this.line(
            [
              [bx + b.w * 0.4, top],
              [bx + b.w * 0.4, top - 39],
            ],
            "#344452",
            2,
          );
          this.glow(bx + b.w * 0.4, top - 40, 7, "#fa735d", 0.65);
        }
        for (let row = 1; row < Math.floor(bh / 26); row++)
          for (let col = 1; col < Math.floor(b.w / 13); col++) {
            if (hash(i * 12 + row * 9 + col) > 0.69) {
              c.fillStyle = hash(i + row * 3) > 0.8 ? "#c89468" : "#55757c";
              c.globalAlpha = 0.28 + layer * 0.1;
              c.fillRect(bx + col * 13, top + row * 26, 3, 7);
            }
          }
        c.globalAlpha = 1;
      }
    }
    // Receding elevated transit line and broken structural ribs.
    const off = -(cam * 0.3) % 500;
    for (let x = off - 500; x < W + 500; x += 500) {
      this.poly(
        [
          [x, 349],
          [x + 490, 337],
          [x + 490, 362],
          [x, 373],
        ],
        "#122530",
      );
      this.line(
        [
          [x, 350],
          [x + 490, 338],
        ],
        "#547381",
        2,
      );
      this.poly(
        [
          [x + 70, 367],
          [x + 111, 366],
          [x + 124, 531],
          [x + 55, 531],
        ],
        "#152b37",
      );
      this.line(
        [
          [x + 92, 387],
          [x + 166, 364],
          [x + 420, 361],
        ],
        "#203e4a",
        8,
      );
      this.line(
        [
          [x + 355, 347],
          [x + 346, 300],
          [x + 370, 311],
        ],
        "#233b47",
        4,
      );
    }
    const fog = c.createLinearGradient(0, 300, 0, 550);
    fog.addColorStop(0, "transparent");
    fog.addColorStop(1, "#45627755");
    c.fillStyle = fog;
    c.fillRect(0, 300, W, 250);
    // Slow clouds, exhaust trails, searchlights.
    for (let i = 0; i < 5; i++) {
      const x = ((((i * 307 - cam * 0.11 + t * 3) % 1600) + 1600) % 1600) - 160;
      c.save();
      c.globalAlpha = 0.045;
      this.ellipse(x, 220 + i * 35, 195, 10 + i * 3, "#d5d9dc");
      c.restore();
    }
    c.save();
    c.globalCompositeOperation = "screen";
    c.globalAlpha = 0.035;
    this.poly(
      [
        [260 - cam * 0.15, 493],
        [630 - cam * 0.15, 90],
        [760 - cam * 0.15, 90],
      ],
      "#b7e2ff",
    );
    this.poly(
      [
        [1020 - cam * 0.06, 510],
        [770 - cam * 0.06, 95],
        [870 - cam * 0.06, 95],
      ],
      p.light,
    );
    c.restore();
    if (sector === 1 || sector === 3) this.facility(cam, sector, p);
  }
  facility(cam, sector, p) {
    const c = this.ctx,
      offset = -(cam * 0.48) % 410;
    const roof = c.createLinearGradient(0, 0, 0, 180);
    roof.addColorStop(0, "#07121bea");
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
        "#0c1b27",
      );
      this.line(
        [
          [x + 15, 0],
          [x + 74, 141],
          [x + 74, 525],
        ],
        "#2f4957",
        3,
      );
      this.poly(
        [
          [x + 60, 73],
          [x + 363, 73],
          [x + 377, 94],
          [x + 68, 94],
        ],
        "#142a36",
        "#35505b",
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
    const g = c.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, "#263846");
    g.addColorStop(0.15, "#192935");
    g.addColorStop(1, "#07131e");
    c.fillStyle = g;
    c.fillRect(x1, y, x2 - x1, H - y);
    c.fillStyle = "#3b5563";
    c.fillRect(x1, y, x2 - x1, 5);
    c.fillStyle = "#091820";
    c.fillRect(x1, y + 6, x2 - x1, 6);
    this.line(
      [
        [x1, y],
        [x2, y],
      ],
      "#8ca7ac",
      1,
    );
    c.save();
    c.beginPath();
    c.rect(x1, y, x2 - x1, H - y);
    c.clip();
    for (let x = Math.floor(x1 / 160) * 160; x < x2 + 160; x += 160) {
      this.line(
        [
          [x, y + 17],
          [x + 25, H],
        ],
        "#0a1923",
        2,
      );
      this.line(
        [
          [x + 2, y + 17],
          [x + 27, H],
        ],
        "#314551",
        0.7,
      );
      this.poly(
        [
          [x + 16, y + 21],
          [x + 132, y + 21],
          [x + 140, y + 64],
          [x + 22, y + 64],
        ],
        "#1a2d3a",
        "#2b414f",
      );
      this.line(
        [
          [x + 30, y + 29],
          [x + 117, y + 29],
        ],
        "#48606b",
        1,
      );
      c.fillStyle = "#c09e62";
      for (let k = 0; k < 3; k++)
        this.poly(
          [
            [x + 20 + k * 12, y + 8],
            [x + 26 + k * 12, y + 8],
            [x + 21 + k * 12, y + 12],
            [x + 15 + k * 12, y + 12],
          ],
          "#947d50",
        );
      c.fillStyle = "#66828d";
      c.fillRect(x + 23, y + 23, 2, 2);
      c.fillRect(x + 129, y + 59, 2, 2);
      if (hash(x) > 0.5)
        this.line(
          [
            [x + 95, y + 92],
            [x + 81, y + 112],
            [x + 110, y + 124],
            [x + 99, y + 161],
          ],
          "#0a1620",
          1.5,
        );
    }
    this.line(
      [
        [x1, y + 82],
        [x2, y + 82],
      ],
      "#344957",
      1,
    );
    this.line(
      [
        [x1, y + 84],
        [x2, y + 84],
      ],
      "#091a25",
      3,
    );
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
            [p.x + 12, p.y - 46],
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
        this.line(
          [
            [p.x + 13 * p.facing, p.y - 44],
            [ax, ay],
          ],
          "#f7bf46",
          4,
        );
        this.line(
          [
            [p.x + 13 * p.facing, p.y - 44],
            [ax, ay],
          ],
          "#fff5c8",
          1.2,
        );
        this.line(
          [
            [p.x - 8 * p.facing, p.y - 33],
            [ax - 5, ay + 8],
          ],
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
      index = p.character || 0,
      color =
        CHARACTERS[index]?.color || ["#ff626b", "#48cfff", "#efbf5a"][index];
    const moving = Math.abs(p.vx || 0) > 15,
      running = Math.sin(this.time * (index === 2 ? 19 : 15)),
      jump = !p.grounded;
    const attack = (p.attackTime || 0) > 0,
      skill = (p.skillTime || 0) > 0,
      boost = p.dashTime > 0 || p.boostTime > 0;
    if (!ghost) {
      this.ellipse(p.x, (s.world?.groundY || 550) + 2, 24, 5, "#020a1390");
      if (boost || p.overdrive > 0) {
        c.save();
        c.globalAlpha = boost ? 0.14 : 0.06;
        for (let i = 1; i <= 3; i++) {
          c.save();
          c.translate(-p.facing * i * 16, 0);
          this.hero(p, s, true);
          c.restore();
        }
        c.restore();
        this.glow(p.x, p.y - 38, 75, color, 0.18);
        this.poly(
          [
            [p.x - 8 * p.facing, p.y - 38],
            [p.x - 70 * p.facing, p.y - 23],
            [p.x - 40 * p.facing, p.y - 38],
            [p.x - 95 * p.facing, p.y - 44],
            [p.x - 10 * p.facing, p.y - 49],
          ],
          color + "88",
        );
      }
      if (p.overdrive > 0) {
        this.ellipse(p.x, p.y - 38, 41, 52, null, "#ba9aff80", 2);
        this.glow(p.x, p.y - 38, 80, "#b787ff", 0.22);
      }
    }
    c.save();
    c.translate(
      p.x,
      p.y +
        (moving && !jump
          ? Math.abs(running) * 1.3
          : Math.sin(this.time * 2.8) * 0.5),
    );
    c.scale(p.facing || 1, 1);
    if (p.magnetic) {
      c.translate(0, -(p.h || 68));
      c.scale(1, -1);
      this.glow(0, 0, 23, "#58d8ff", 0.4);
      this.line(
        [
          [-14, 0],
          [17, 0],
        ],
        "#a2f5ff",
        2,
      );
    }
    if (p.invulnerable > 0 && !s.possession && p.overdrive <= 0 && !ghost)
      c.globalAlpha *= 0.7 + Math.sin(this.time * 48) * 0.2;
    if (boost) c.rotate(0.17);
    else if (moving) c.rotate(0.055);
    else if (p.wire) c.rotate(-0.27);
    const armour = ["#a82f3d", "#185477", "#ad7b2c"][index],
      light = ["#e95a63", "#3eabd2", "#e0b859"][index],
      dark = "#101e2a",
      skin = "#d7ae96",
      skinShadow = "#a97d70";
    // Hair silhouette has a distinct profile for each sister, including animated ponytails.
    if (index > 0) {
      const hair = index === 1 ? "#14283f" : "#9e6d2c",
        hi = index === 1 ? "#3c627b" : "#e2b75e";
      c.beginPath();
      c.moveTo(-5, -79);
      c.bezierCurveTo(
        -21,
        -91,
        -27 - Math.abs(p.vx || 0) * 0.025,
        -76 + running * 3,
        -36,
        -66 + Math.sin(this.time * 9) * 4,
      );
      c.bezierCurveTo(-24, -69, -12, -60, -7, -74);
      c.fillStyle = hair;
      c.fill();
      this.line(
        [
          [-7, -79],
          [-18, -79 + running],
          [-31, -69 + running * 3],
        ],
        hi,
        1.1,
      );
      this.ellipse(-8, -78, 3, 3, light, dark);
    }
    // Rear arm, shoulder pauldron and compact propulsion pack.
    this.poly(
      [
        [-11, -63],
        [-19, -58],
        [-17, -39],
        [-11, -37],
        [-7, -53],
      ],
      "#263444",
      "#09131c",
      1.5,
    );
    this.line(
      [
        [-17, -53],
        [-18, -44],
      ],
      color,
      1.2,
    );
    const backHandX =
      index === 2 && skill ? -31 : moving ? -17 - running * 6 : -14;
    this.limb(-11, -60, -20, -46, 5, armour, dark);
    this.limb(-20, -46, backHandX, -32, 4, "#243342", dark);
    this.ellipse(backHandX, -31, 3.5, 4, dark, "#50606b");
    // Back leg, front leg: separate anatomical joints and strapped thigh armour.
    const step = moving ? running * 13 : 0;
    this.leg(
      -5,
      -33,
      -6 - step * 0.75,
      jump ? -19 : -17,
      -5 + step,
      jump ? -7 : -1,
      armour,
      light,
      skinShadow,
      true,
    );
    this.leg(
      6,
      -32,
      8 + step * 0.73,
      jump ? -23 : -17,
      8 - step,
      jump ? -13 : 0,
      armour,
      light,
      skin,
      false,
    );
    // Waist, fitted cropped torso and shoulder straps — human silhouette remains visible.
    this.poly(
      [
        [-9, -48],
        [-8, -39],
        [-11, -33],
        [-2, -29],
        [11, -33],
        [8, -43],
        [10, -50],
      ],
      skin,
      "#392d31",
      1,
    );
    this.poly(
      [
        [-12, -63],
        [-5, -67],
        [5, -66],
        [13, -59],
        [11, -51],
        [6, -45],
        [-8, -46],
        [-13, -55],
      ],
      armour,
      "#080f18",
      1.6,
    );
    this.poly(
      [
        [-7, -61],
        [0, -59],
        [9, -60],
        [9, -53],
        [5, -49],
        [-6, -50],
      ],
      index === 1 ? "#203d52" : "#28313b",
      "#0e1822",
    );
    this.line(
      [
        [-8, -62],
        [-8, -52],
        [-5, -48],
      ],
      light,
      1.3,
    );
    this.line(
      [
        [10, -59],
        [9, -53],
        [6, -49],
      ],
      light,
      1.2,
    );
    this.line(
      [
        [-1, -60],
        [0, -49],
      ],
      "#0b141e",
      1.3,
    );
    this.ellipse(0, -62, 2, 2, color);
    this.poly(
      [
        [-10, -36],
        [10, -37],
        [12, -30],
        [0, -29],
        [-12, -30],
      ],
      "#19202a",
      "#080f17",
    );
    this.line(
      [
        [-10, -35],
        [11, -35],
      ],
      "#7c7270",
      1.3,
    );
    c.fillStyle = "#b8a792";
    c.fillRect(-1, -36, 4, 3);
    this.poly(
      [
        [-11, -31],
        [-1, -30],
        [-2, -24],
        [-10, -24],
      ],
      index === 2 ? armour : "#1d242e",
      "#0c1420",
    );
    this.poly(
      [
        [0, -30],
        [12, -31],
        [13, -24],
        [3, -23],
      ],
      index === 2 ? armour : "#1d242e",
      "#0c1420",
    );
    // Neck and expressive face; goggles/visor stay readable at play size.
    this.poly(
      [
        [-3, -72],
        [5, -72],
        [5, -65],
        [0, -62],
        [-4, -66],
      ],
      skinShadow,
      "#2d2529",
    );
    this.poly(
      [
        [-8, -80],
        [-3, -85],
        [6, -83],
        [9, -77],
        [9, -74],
        [12, -72],
        [9, -70],
        [7, -66],
        [1, -65],
        [-5, -70],
      ],
      skin,
      "#392c32",
      1,
    );
    this.poly(
      [
        [6, -75],
        [9, -75],
        [11, -72],
        [8, -72],
      ],
      "#edc6a8",
    );
    this.line(
      [
        [4, -68],
        [8, -69],
      ],
      "#743d3c",
      0.8,
    );
    this.line(
      [
        [5, -69],
        [7, -69],
      ],
      "#f7d9bd",
      0.65,
    );
    if (index === 0) {
      this.poly(
        [
          [-8, -72],
          [-13, -77],
          [-11, -83],
          [-15, -84],
          [-7, -87],
          [-8, -93],
          [-1, -88],
          [6, -93],
          [7, -87],
          [13, -85],
          [9, -82],
          [10, -78],
          [3, -79],
          [-1, -84],
          [-4, -75],
        ],
        "#7d2433",
        "#211925",
        1,
      );
      this.line(
        [
          [-10, -81],
          [-4, -86],
          [0, -85],
        ],
        "#dd6570",
        1,
      );
      this.line(
        [
          [0, -86],
          [6, -87],
          [9, -84],
        ],
        "#d76769",
        1,
      );
      this.poly(
        [
          [-3, -77],
          [8, -78],
          [10, -74],
          [3, -72],
          [-3, -73],
        ],
        "#581e2a",
        "#f26569",
        1,
      );
      this.line(
        [
          [2, -76],
          [7, -76],
        ],
        "#ffd2bd",
        1,
      );
      this.line(
        [
          [-7, -77],
          [-3, -76],
        ],
        "#2b2330",
        2,
      );
    } else {
      const hair = index === 1 ? "#15253c" : "#916425",
        hi = index === 1 ? "#427693" : "#e4bf67";
      this.poly(
        [
          [-9, -72],
          [-11, -79],
          [-7, -85],
          [1, -88],
          [7, -86],
          [11, -81],
          [7, -79],
          [2, -82],
          [-3, -74],
          [-5, -69],
        ],
        hair,
        "#1b2030",
      );
      this.line(
        [
          [-7, -80],
          [-2, -85],
          [5, -84],
        ],
        hi,
        1.2,
      );
      this.line(
        [
          [-5, -77],
          [-1, -81],
        ],
        hi,
        0.7,
      );
      this.poly(
        [
          [-2, -77],
          [10, -77],
          [9, -73],
          [0, -72],
        ],
        index === 1 ? "#123c5b" : "#664d27",
        light,
        1.2,
      );
      this.line(
        [
          [3, -76],
          [8, -76],
        ],
        index === 1 ? "#b9f4ff" : "#fff0b5",
        1.3,
      );
    }
    // Foreground arm is aimed, operating a terminal, or presenting wire gauntlets.
    const shoulder = [9, -60];
    const hand =
      index === 1 && (skill || s.possession)
        ? [24, -49]
        : attack
          ? [35, -56]
          : index === 2 && (skill || p.wire)
            ? [32, -66]
            : [20 + (moving ? running * 4 : 0), -34];
    const elbow = attack
      ? [22, -52]
      : index === 2 && (skill || p.wire)
        ? [21, -56]
        : [15, -45];
    this.limb(...shoulder, ...elbow, 5, index === 1 ? skin : armour, dark);
    this.limb(...elbow, ...hand, 4.2, "#253341", "#0b1420");
    if (index !== 1)
      this.poly(
        [
          [5, -63],
          [12, -63],
          [17, -58],
          [13, -54],
          [7, -56],
        ],
        armour,
        light,
        0.8,
      );
    else this.ellipse(10, -59, 4.5, 5.5, skin, "#3b3b42");
    this.ellipse(hand[0], hand[1], 3.5, 3.5, "#1b2631", "#71858d", 0.8);
    if (index === 0) {
      c.save();
      c.translate(hand[0], hand[1]);
      if (!attack) c.rotate(0.7);
      this.poly(
        [
          [-3, -4],
          [19, -4],
          [22, -1],
          [22, 3],
          [6, 3],
          [4, 9],
          [-1, 8],
        ],
        "#273342",
        "#0a121b",
        1.5,
      );
      c.fillStyle = "#a83f4e";
      c.fillRect(1, -3, 13, 3);
      c.fillStyle = "#79919c";
      c.fillRect(16, -3, 5, 2);
      this.line(
        [
          [3, -6],
          [9, -6],
        ],
        "#151e28",
        2,
      );
      if (attack) {
        this.glow(24, 0, 30, "#ffaf61", 0.7);
        this.poly(
          [
            [22, -3],
            [34, -8],
            [29, -2],
            [42, 0],
            [29, 3],
            [32, 8],
            [22, 4],
          ],
          "#ffdca0",
        );
      }
      c.restore();
    } else if (index === 1) {
      c.save();
      c.translate(hand[0] + 3, hand[1] - 3);
      c.rotate(-0.35);
      c.fillStyle = "#183443";
      c.fillRect(-5, -10, 14, 21);
      c.strokeStyle = "#76b5c6";
      c.lineWidth = 1;
      c.strokeRect(-5, -10, 14, 21);
      c.fillStyle = "#23748f";
      c.fillRect(-3, -8, 10, 16);
      for (let k = 0; k < 4; k++)
        this.line(
          [
            [-1, -5 + k * 3],
            [5 - (k % 2) * 3, -5 + k * 3],
          ],
          "#8febff",
          0.7,
        );
      c.restore();
      c.beginPath();
      c.moveTo(hand[0] + 2, hand[1] + 3);
      c.bezierCurveTo(23, -17, -18, -20, -13, -43);
      c.strokeStyle = "#4488a3";
      c.lineWidth = 1;
      c.stroke();
      if (attack) {
        this.glow(hand[0] + 12, hand[1], 18, "#65ddff", 0.55);
        this.line(
          [
            [hand[0] + 4, hand[1]],
            [hand[0] + 19, hand[1] - 5],
          ],
          "#c7f7ff",
          2,
        );
      }
    } else {
      this.ellipse(hand[0], hand[1], 5, 4, "#70582a", "#f5d886");
      this.ellipse(backHandX, -31, 5, 4, "#70582a", "#e3bb62");
      this.line(
        [
          [hand[0], hand[1]],
          [hand[0] + 7, hand[1] - 2],
        ],
        "#f1d182",
        2,
      );
      if (attack) {
        c.beginPath();
        c.moveTo(hand[0] + 3, hand[1]);
        c.quadraticCurveTo(50, -66, 69, -36);
        c.strokeStyle = "#ffe49a";
        c.lineWidth = 2;
        c.stroke();
      }
    }
    c.restore();
    if (!ghost && s.mode === "playing") {
      // Small colored marker locates the selected character without obscuring the art.
      this.poly(
        [
          [p.x - 4, p.y - 109],
          [p.x + 4, p.y - 109],
          [p.x, p.y - 103],
        ],
        color,
      );
      if (s.possession)
        this.text("SAFE LINK", p.x, p.y - 116, "#74dcfa", 9, "center");
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
  enemy(e, s) {
    if (e.type === "drone") return this.drone(e, s);
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
    const c = this.ctx,
      t = this.time;
    for (let i = 0; i < this.stars.length; i++) {
      const m = this.stars[i],
        x =
          (((m.x - cam * (0.06 + (i % 3) * 0.08) + t * (i % 2 ? 9 : -5)) % W) +
            W) %
          W,
        y = (m.y + t * (i % 2 ? -6 : 4) + 720 * 100) % 610;
      c.globalAlpha = 0.16 + Math.sin(t * 1.3 + i) * 0.1;
      c.fillStyle = i % 3 ? "#9cbbcc" : p.light;
      c.fillRect(x, y, m.r || 1, (m.r || 1) * 2.5);
    }
    c.globalAlpha = 1;
    const v = c.createRadialGradient(640, 365, 160, 640, 365, 770);
    v.addColorStop(0, "transparent");
    v.addColorStop(0.65, "#050c1310");
    v.addColorStop(1, "#020711cc");
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    const lower = c.createLinearGradient(0, 604, 0, H);
    lower.addColorStop(0, "transparent");
    lower.addColorStop(1, "#030b14c0");
    c.fillStyle = lower;
    c.fillRect(0, 604, W, 116);
    c.fillStyle = this.grain;
    c.fillRect(0, 0, W, H);
    if (s.player?.hp < s.player?.maxHp * 0.25 && s.mode === "playing") {
      const danger = c.createRadialGradient(640, 360, 350, 640, 360, 740);
      danger.addColorStop(0, "transparent");
      danger.addColorStop(1, "#ff304340");
      c.fillStyle = danger;
      c.globalAlpha = 0.65 + Math.sin(t * 4) * 0.25;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }
}
