import {
  createWorld,
  createEnemies,
  SECTORS,
  GROUND_Y,
  WORLD_WIDTH,
} from "./world.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) =>
  Math.hypot(a.x - b.x, a.y - (a.h || 0) / 2 - (b.y - (b.h || 0) / 2));
const COLORS = ["#ff5569", "#58cfff", "#ffce65"];

/** All positions use centre-x / feet-y. Rendering never mutates this simulation. */
export class Game {
  constructor({ difficulty = "standard", onEvent = () => {} } = {}) {
    this.difficulty = difficulty;
    this.onEvent = onEvent;
    this.serial = 0;
    this.state = this.makeState("title");
  }

  makeState(mode = "playing") {
    const world = createWorld();
    const enemies = createEnemies().map((e, i) => ({
      id: `enemy-${i}`,
      w: 38,
      h: 66,
      facing: -1,
      vx: 0,
      vy: 0,
      hp: 65,
      maxHp: 65,
      attackTime: 1 + i * 0.12,
      stun: 0,
      controlled: false,
      shielded: false,
      phase: 0,
      telegraph: 0,
      ...e,
      spawnX: e.x,
      spawnY: e.y,
      alive: true,
    }));
    for (const gate of world.gates) {
      gate.maxHp = gate.kind === "red" ? 150 : 1;
      gate.hp = gate.maxHp;
    }
    const boss = enemies.find((e) => e.type === "boss") || null;
    if (boss) {
      boss.shielded = true;
      boss.vulnerable = 0;
      boss.attackTime = 2;
    }
    return {
      mode,
      time: 0,
      player: {
        x: 150,
        y: GROUND_Y,
        vx: 0,
        vy: 0,
        w: 32,
        h: 68,
        facing: 1,
        grounded: true,
        hp: 100,
        maxHp: 100,
        character: 0,
        invulnerable: 0,
        dashTime: 0,
        attackTime: 0,
        skillTime: 0,
        overdrive: 0,
        boostTime: 0,
        sprint: 0,
        wire: null,
        shootCooldown: 0,
        meleeCooldown: 0,
        dashCooldown: 0,
        coyote: 0.12,
        jumpBuffer: 0,
        jumpCutAvailable: false,
        safeX: 150,
        safeY: GROUND_Y,
      },
      camera: { x: 0, y: 0 },
      enemies,
      projectiles: [],
      particles: [],
      sector: 0,
      checkpoint: 0,
      energy: 35,
      skillCooldown: [0, 0, 0],
      banner: {
        title: "01 // BREAK IN",
        text: "REDで前進。Jで射撃、Kで近接ブレイク。",
        ttl: 5,
      },
      objective: "REDで装甲隔壁を破壊する",
      hint: "← → / A D 移動 · SPACE ジャンプ · J 攻撃 · K 固有能力",
      stats: { kills: 0, switches: 0, hacks: 0, wires: 0, deaths: 0, time: 0 },
      flags: {
        redGate: false,
        blueGate: false,
        goldWire: false,
        bossDefeated: false,
      },
      possession: null,
      boss,
      shake: 0,
      flash: 0,
      world,
      switchCooldown: 0,
      victoryTimer: 0,
      bossStarted: false,
    };
  }

  start() {
    this.state = this.makeState("playing");
    this.emit("checkpoint");
  }
  pause(value = true) {
    if (value && this.state.mode === "playing") this.state.mode = "paused";
    else if (!value && this.state.mode === "paused")
      this.state.mode = "playing";
  }

  retry() {
    const old = this.state;
    const next = this.makeState("playing");
    next.flags = { ...old.flags, bossDefeated: false };
    next.stats = { ...old.stats };
    next.time = old.time;
    next.checkpoint = old.checkpoint;
    next.sector = old.checkpoint;
    const x = SECTORS[old.checkpoint]?.checkpointX || 150;
    Object.assign(next.player, {
      x,
      safeX: x,
      character: old.player.character,
    });
    next.camera.x = clamp(x - 350, 0, WORLD_WIDTH - 1280);
    next.energy = Math.max(60, old.energy);
    next.banner = {
      title: "RECONNECT",
      text: "チェックポイントから再出撃。HP回復。",
      ttl: 3,
    };
    this.state = next;
    this.syncGates();
    this.updateGuidance();
    this.emit("checkpoint");
  }

  emit(type, extra = {}) {
    try {
      this.onEvent({ type, character: this.state.player.character, ...extra });
    } catch (_) {
      /* Audio must not interrupt play. */
    }
  }
  banner(title, text, ttl = 3) {
    this.state.banner = { title, text, ttl };
  }

  burst(x, y, color, count = 12, force = 190) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const ttl = 0.25 + Math.random() * 0.4;
      this.state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * force * Math.random(),
        vy: Math.sin(angle) * force * Math.random(),
        ttl,
        maxTtl: ttl,
        color,
        size: 2 + Math.random() * 4,
        type: "spark",
      });
    }
    if (this.state.particles.length > 260)
      this.state.particles.splice(0, this.state.particles.length - 260);
  }

  update(dt, input = {}) {
    const s = this.state;
    if (s.mode !== "playing") return;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.033);
    if (!dt) return;
    s.time += dt;
    s.stats.time = s.time;
    s.shake = Math.max(0, s.shake - dt * 20);
    s.flash = Math.max(0, s.flash - dt * 2);
    s.banner.ttl = Math.max(0, s.banner.ttl - dt);
    s.switchCooldown = Math.max(0, s.switchCooldown - dt);
    const p = s.player;
    for (const key of [
      "invulnerable",
      "dashTime",
      "attackTime",
      "skillTime",
      "overdrive",
      "boostTime",
      "shootCooldown",
      "meleeCooldown",
      "dashCooldown",
      "jumpBuffer",
    ])
      p[key] = p[key] <= dt + 1e-9 ? 0 : p[key] - dt;
    for (let i = 0; i < 3; i++)
      s.skillCooldown[i] = Math.max(
        0,
        s.skillCooldown[i] - dt * (p.overdrive > 0 ? 3 : 1),
      );

    const selected = Number.isInteger(input.switchTo)
      ? input.switchTo
      : input.cycle
        ? (p.character + 1) % 3
        : null;
    if (
      selected !== null &&
      selected >= 0 &&
      selected <= 2 &&
      selected !== p.character &&
      s.switchCooldown === 0
    ) {
      this.releasePossession();
      p.character = selected;
      p.sprint = 0;
      s.stats.switches++;
      s.switchCooldown = 0.1;
      p.invulnerable = Math.max(p.invulnerable, 0.18);
      this.burst(p.x, p.y - 35, COLORS[selected], 14, 130);
      this.emit("switch");
    }
    if (input.overdrive && s.energy >= 99.9 && p.overdrive <= 0) {
      s.energy = 0;
      p.overdrive = 7;
      p.invulnerable = Math.max(p.invulnerable, 7);
      s.flash = 0.45;
      s.shake = 8;
      this.banner(
        "ARMAROID // ONLINE",
        "7秒間、無敵・火力増幅・スキル高速再充填。",
        3,
      );
      this.emit("overdrive");
    }

    if (s.possession) {
      if (input.skill) this.releasePossession();
      else this.updatePossession(dt, input);
    } else {
      if (input.skill) this.useSkill();
      if (!s.possession) this.updatePlayer(dt, input);
    }
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups();
    this.updateParticles(dt);
    this.syncGates();
    this.updateProgress();
    this.updateGuidance();

    const focus = s.possession
      ? s.enemies.find((e) => e.id === s.possession.enemyId) || p
      : p;
    const target = clamp(focus.x - 420, 0, Math.max(0, s.world.width - 1280));
    s.camera.x += (target - s.camera.x) * (1 - Math.exp(-dt * 7));
    if (s.flags.bossDefeated) {
      s.victoryTimer += dt;
      if (s.victoryTimer > 2.2) {
        s.mode = "victory";
        this.emit("victory");
      }
    }
  }

  updatePlayer(dt, input) {
    const s = this.state,
      p = s.player;
    const wasGrounded = p.grounded;
    if (p.wire) {
      const wire = p.wire;
      wire.progress = Math.min(1, wire.progress + dt / wire.duration);
      const t = wire.progress,
        ease = t * t * (3 - 2 * t);
      p.x = wire.fromX + (wire.toX - wire.fromX) * ease;
      p.y =
        wire.fromY +
        (wire.toY - wire.fromY) * ease -
        Math.sin(t * Math.PI) * 245;
      p.vx = 0;
      p.vy = 0;
      p.grounded = false;
      if (t >= 1) {
        p.grounded = true;
        p.y = wire.toY;
        p.safeX = p.x;
        p.safeY = p.y;
        const anchor = s.enemies.find((enemy) => enemy.id === wire.targetId);
        if (anchor?.type === "boss" && anchor.hp > 0)
          p.facing = anchor.x < p.x ? -1 : 1;
        if (wire.gap) {
          s.flags.goldWire = true;
          this.banner(
            "WIRE CROSS // CLEAR",
            "巨大機の重量を利用して突破。GOLDは戦闘を回避して走り抜けられる。",
          );
        }
        p.wire = null;
      }
      if (input.attack) this.playerAttack();
      return;
    }
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (move) p.facing = move;
    if (input.jump) p.jumpBuffer = 0.14;
    if (p.grounded) p.coyote = 0.12;
    else p.coyote = Math.max(0, p.coyote - dt);
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = -720;
      p.jumpCutAvailable = true;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      this.burst(p.x, p.y, COLORS[p.character], 6, 90);
      this.emit("jump");
    }
    // Release trims the rising jump once. Legacy replay frames omit jumpHeld
    // and retain their full jump arc; only an explicit release cuts height.
    if (p.jumpCutAvailable && input.jumpHeld === false && p.vy < 0) {
      p.vy = Math.max(p.vy, -280);
      p.jumpCutAvailable = false;
    }
    if (input.dash && p.dashCooldown <= 0) {
      p.dashTime = p.character === 0 ? 0.2 : 0.24;
      p.dashCooldown =
        p.character === 0 ? 0.25 : p.character === 2 ? 0.38 : 0.6;
      p.invulnerable = Math.max(p.invulnerable, 0.22);
      if (p.character === 0) {
        p.boostTime = 0.24;
        p.vy = Math.min(p.vy, -70);
      }
      this.burst(p.x - p.facing * 15, p.y - 30, COLORS[p.character], 8, 150);
      this.emit("dash");
    }
    if (p.character === 2 && input.dashHeld && move)
      p.sprint = Math.min(1, p.sprint + dt * 1.4);
    else p.sprint = Math.max(0, p.sprint - dt * 3);
    const speed =
      p.character === 2 ? 330 + 240 * p.sprint : p.character === 0 ? 300 : 290;
    if (p.dashTime > 0) p.vx = p.facing * (p.character === 0 ? 760 : 660);
    // Arcade movement responds on this frame, equally on ground and in air.
    // GOLD's sprint still builds speed, while dash keeps its committed burst.
    else p.vx = move * speed;
    const previousX = p.x,
      previousY = p.y;
    p.x = clamp(p.x + p.vx * dt, p.w / 2, s.world.width - p.w / 2);
    this.collideGates(previousX);
    const platforms = s.world.platforms || [];
    const magneticCeiling =
      p.character === 1 &&
      input.up &&
      !input.jump &&
      platforms.find((platform) => {
        const underside = platform.y + platform.h;
        return (
          p.x + 12 > platform.x &&
          p.x - 12 < platform.x + platform.w &&
          Math.abs(p.y - p.h - underside) < 42 &&
          p.y - p.h >= underside - 6
        );
      });
    if (magneticCeiling) {
      p.y = magneticCeiling.y + magneticCeiling.h + p.h;
      p.vy = 0;
      p.grounded = false;
      p.magnetic = true;
      if (input.attack) this.playerAttack();
      return;
    }
    p.magnetic = false;
    p.vy = Math.min(1150, p.vy + 1900 * dt);
    p.y += p.vy * dt;
    p.grounded = false;
    if (p.vy >= 0) {
      for (const platform of platforms) {
        if (
          p.x + p.w / 2 > platform.x &&
          p.x - p.w / 2 < platform.x + platform.w &&
          previousY <= platform.y + 2 &&
          p.y >= platform.y
        ) {
          p.y = platform.y;
          p.vy = 0;
          p.grounded = true;
          break;
        }
      }
      if (
        !p.grounded &&
        previousY <= GROUND_Y + 2 &&
        p.y >= GROUND_Y &&
        !this.overGap(p.x)
      ) {
        p.y = GROUND_Y;
        p.vy = 0;
        p.grounded = true;
      }
    }
    // Ceiling ledges have physical undersides; BLUE can hold W / up to stay attached.
    if (p.vy < 0) {
      for (const platform of platforms) {
        const underside = platform.y + platform.h;
        if (
          p.x + 12 > platform.x &&
          p.x - 12 < platform.x + platform.w &&
          previousY - p.h >= underside &&
          p.y - p.h < underside
        ) {
          p.y = underside + p.h;
          p.vy = 0;
          p.magnetic = p.character === 1 && !!input.up;
        }
      }
    } else p.magnetic = false;
    if (p.grounded || p.vy >= 0) p.jumpCutAvailable = false;
    if (p.grounded && !this.overGap(p.x, 55) && !this.closedGateNear(p.x)) {
      p.safeX = p.x;
      p.safeY = p.y;
    }
    if (p.y > 830) this.rescueFall();
    else if (!wasGrounded && p.grounded) this.emit("land");
    if (input.attack) this.playerAttack();
  }

  overGap(x, margin = 0) {
    return this.state.world.gaps.some(
      (g) => x > g.x - margin && x < g.x + g.w + margin,
    );
  }
  closedGateNear(x) {
    return this.state.world.gates.some(
      (g) => !g.open && Math.abs(x - g.x) < 65,
    );
  }
  collideGates(previousX) {
    const p = this.state.player;
    for (const gate of this.state.world.gates) {
      if (gate.open) continue;
      const left = gate.x - p.w / 2,
        right = gate.x + gate.w + p.w / 2;
      if (p.x > left && p.x < right) {
        p.x = previousX <= gate.x ? left : right;
        p.vx = 0;
      }
    }
  }
  rescueFall() {
    const p = this.state.player;
    p.x = p.safeX;
    p.y = p.safeY;
    p.vx = 0;
    p.vy = 0;
    p.grounded = true;
    p.hp = Math.max(1, p.hp - (this.difficulty === "assist" ? 8 : 15));
    p.invulnerable = 1.5;
    p.wire = null;
    this.banner(
      "SAFETY TETHER",
      "落下を緊急回収。GOLDのKで巨大機にワイヤーを掛けよう。",
      3,
    );
    this.emit("hurt");
    this.state.shake = 6;
  }

  playerAttack() {
    const s = this.state,
      p = s.player;
    if (p.shootCooldown > 0) return;
    p.shootCooldown =
      (p.character === 0 ? 0.145 : 0.22) * (p.overdrive > 0 ? 0.58 : 1);
    p.attackTime = 0.15;
    const damage =
      (p.character === 0 ? 17 : p.character === 1 ? 8 : 10) *
      (p.overdrive > 0 ? 1.65 : 1);
    this.shoot(
      p.x + p.facing * 26,
      p.y - 39,
      p.facing * 1040,
      0,
      "player",
      damage,
      COLORS[p.character],
      { character: p.character },
    );
    if (p.character === 0 && p.meleeCooldown <= 0) {
      const target = s.enemies.find(
        (e) =>
          e.hp > 0 &&
          !e.controlled &&
          Math.abs(e.x - p.x) < (e.w || 40) / 2 + 75 &&
          Math.abs(e.y - p.y) < 100 &&
          (e.x - p.x) * p.facing > -12,
      );
      if (target) {
        this.damageEnemy(target, 32 * (p.overdrive > 0 ? 1.6 : 1));
        p.meleeCooldown = 0.4;
        p.skillTime = 0.16;
      }
    }
    this.emit("shoot");
  }

  useSkill() {
    const s = this.state,
      p = s.player,
      c = p.character;
    if (p.wire || s.skillCooldown[c] > 0) return;
    if (c === 0) {
      s.skillCooldown[c] = 1.05;
      p.skillTime = 0.35;
      p.invulnerable = Math.max(p.invulnerable, 0.28);
      let hit = false;
      for (const enemy of s.enemies) {
        if (
          enemy.hp > 0 &&
          !enemy.controlled &&
          Math.abs(enemy.x - p.x) < enemy.w / 2 + 145 &&
          Math.abs(enemy.y - p.y) < 150 &&
          (enemy.x - p.x) * p.facing > -45
        ) {
          this.damageEnemy(enemy, 78 * (p.overdrive > 0 ? 1.5 : 1));
          enemy.stun = 0.45;
          hit = true;
        }
      }
      for (const gate of s.world.gates) {
        if (!gate.open && gate.kind === "red" && Math.abs(gate.x - p.x) < 165) {
          this.damageGate(gate, 82, 0);
          hit = true;
        }
      }
      this.burst(p.x + p.facing * 65, p.y - 40, COLORS[0], 22, 240);
      this.shoot(
        p.x + p.facing * 30,
        p.y - 40,
        p.facing * 950,
        0,
        "player",
        30,
        COLORS[0],
        { character: 0, r: 9 },
      );
      if (hit) s.shake = 5;
      this.emit("hit");
    } else if (c === 1) {
      const boss = s.boss;
      if (boss && boss.hp > 0 && Math.abs(boss.x - p.x) <= 650) {
        boss.shielded = false;
        boss.vulnerable = 10;
        boss.stun = 0.8;
        s.skillCooldown[1] = 4.5;
        p.skillTime = 0.65;
        s.stats.hacks++;
        s.energy = Math.min(100, s.energy + 12);
        this.burst(boss.x, boss.y - boss.h / 2, COLORS[1], 32, 270);
        this.banner(
          "SHIELD // OFFLINE",
          "10秒間コア露出。GOLDで背後へ、REDで大ダメージ！",
          3,
        );
        this.emit("hack");
        return;
      }
      const drone = s.enemies
        .filter((e) => e.type === "drone" && e.hp > 0 && distance(e, p) < 420)
        .sort((a, b) => distance(a, p) - distance(b, p))[0];
      if (!drone) {
        this.banner(
          "LINK // OUT OF RANGE",
          "ドローンから420以内、またはボスから650以内でK。",
          2,
        );
        return;
      }
      s.possession = {
        enemyId: drone.id,
        remaining: 8,
        originX: p.x,
        originY: p.y,
      };
      drone.controlled = true;
      drone.vx = 0;
      drone.vy = 0;
      drone.shootCooldown = 0;
      p.vx = 0;
      p.vy = 0;
      s.stats.hacks++;
      p.skillTime = 0.5;
      this.banner(
        "DRONE // LINKED",
        "8秒間操縦：方向キーで飛行・Jで端末へ射撃・Kで解除。",
        4,
      );
      this.burst(drone.x, drone.y - 20, COLORS[1], 20);
      this.emit("hack");
    } else {
      const targets = s.enemies.filter(
        (e) =>
          e.hp > 0 &&
          (e.type === "sentinel" || e.type === "boss") &&
          Math.abs(e.x - p.x) <= 1000,
      );
      const target = targets.sort(
        (a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x),
      )[0];
      if (!target) {
        this.banner(
          "WIRE // NO ANCHOR",
          "巨大機から1000以内でK。敵の重量を足場にする。",
          2,
        );
        return;
      }
      const isBoss = target.type === "boss";
      const gap = !isBoss && target.x > 5300 && target.x < 5900;
      const toX = isBoss
        ? target.x + (p.x <= target.x ? 190 : -190)
        : target.x + 35;
      p.wire = {
        fromX: p.x,
        fromY: p.y,
        toX,
        toY: GROUND_Y,
        anchorX: target.x,
        anchorY: target.y - target.h * 0.7,
        progress: 0,
        duration: 0.88,
        gap,
        targetId: target.id,
      };
      p.invulnerable = Math.max(p.invulnerable, 1.25);
      p.skillTime = 1;
      p.facing = toX > p.x ? 1 : -1;
      s.skillCooldown[2] = 1.8;
      s.stats.wires++;
      s.energy = Math.min(100, s.energy + 8);
      if (isBoss) {
        target.marked = 7;
        if (!target.shielded)
          target.vulnerable = Math.max(target.vulnerable, 8);
        target.stun = 0.45;
        this.banner(
          "CORE // MARKED",
          "ワイヤーで背後へ回避。露出中のコアに攻撃すると増幅ダメージ。",
          2.5,
        );
      }
      this.burst(p.x, p.y - 30, COLORS[2], 14);
      this.emit("wire");
    }
  }

  updatePossession(dt, input) {
    const s = this.state,
      control = s.possession;
    const drone = s.enemies.find((e) => e.id === control.enemyId);
    if (!drone || drone.hp <= 0) {
      this.releasePossession();
      return;
    }
    control.remaining -= dt;
    if (control.remaining <= 1e-9) {
      this.releasePossession();
      this.banner(
        "LINK // ENDED",
        "BLUEへ帰還。ドローンへ近づきKで再接続できる。",
        2,
      );
      return;
    }
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const scale = dx && dy ? Math.SQRT1_2 : 1;
    drone.vx = dx * 420 * scale;
    drone.vy = dy * 330 * scale;
    drone.x = clamp(
      drone.x + drone.vx * dt,
      control.originX - 750,
      control.originX + 1150,
    );
    drone.x = clamp(drone.x, 1950, 3340);
    drone.y = clamp(drone.y + drone.vy * dt, 185, GROUND_Y - 25);
    if (dx) drone.facing = dx;
    drone.shootCooldown = Math.max(0, drone.shootCooldown - dt);
    if (input.attack && drone.shootCooldown <= 0) {
      drone.shootCooldown = 0.18;
      drone.attackTime = 0.12;
      const relay = s.world.relays.find(
        (r) => !r.active && Math.abs(r.x - drone.x) < 760,
      );
      let aimX = drone.x + drone.facing * 700,
        aimY = drone.y - drone.h / 2;
      if (relay) {
        aimX = relay.x + relay.w / 2;
        aimY = relay.y + relay.h / 2;
      } else {
        const target = s.enemies.find(
          (e) => e.hp > 0 && !e.controlled && Math.abs(e.x - drone.x) < 700,
        );
        if (target) {
          aimX = target.x;
          aimY = target.y - target.h / 2;
        }
      }
      const sx = drone.x,
        sy = drone.y - drone.h / 2;
      const angle = Math.atan2(aimY - sy, aimX - sx);
      this.shoot(
        sx,
        sy,
        Math.cos(angle) * 800,
        Math.sin(angle) * 800,
        "player",
        14,
        COLORS[1],
        { hacked: true, character: 1 },
      );
      this.emit("shoot");
    }
  }

  releasePossession() {
    const s = this.state;
    if (!s.possession) return;
    const drone = s.enemies.find((e) => e.id === s.possession.enemyId);
    if (drone) {
      drone.controlled = false;
      drone.attackTime = 2;
      drone.stun = 1.5;
      // A failed attempt must always be immediately recoverable from the operator's location.
      if (!s.flags.blueGate) {
        drone.x = 2470;
        drone.y = 380;
        drone.spawnX = 2470;
        drone.spawnY = 380;
      } else {
        drone.spawnX = drone.x;
        drone.spawnY = drone.y;
      }
    }
    s.player.invulnerable = Math.max(s.player.invulnerable, 1);
    s.possession = null;
    s.skillCooldown[1] = 0.4;
  }

  shoot(x, y, vx, vy, owner, damage, color, extra = {}) {
    this.state.projectiles.push({
      id: ++this.serial,
      x,
      y,
      vx,
      vy,
      owner,
      damage,
      color,
      ttl: 2.1,
      r: 4,
      ...extra,
    });
  }

  updateEnemies(dt) {
    const s = this.state,
      p = s.player;
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      e.stun = Math.max(0, e.stun - dt);
      e.hitTime = Math.max(0, (e.hitTime || 0) - dt);
      if (e.controlled) continue;
      if (e.type === "boss") {
        this.updateBoss(e, dt);
        continue;
      }
      if (Math.abs(e.x - p.x) > 1050 || e.stun > 0 || s.flags.bossDefeated)
        continue;
      // Let the opening instructions breathe; patrols engage when the player approaches.
      if (!e.engaged && Math.abs(e.x - p.x) > 500) continue;
      e.engaged = true;
      e.facing = p.x < e.x ? -1 : 1;
      if (e.type === "drone")
        e.y = e.spawnY + Math.sin(s.time * 2.5 + e.spawnX) * 17;
      else if (e.type === "trooper" && Math.abs(e.x - p.x) > 300) {
        const candidate = e.x + e.facing * 36 * dt;
        if (
          !this.overGap(candidate, 30) &&
          !s.world.gates.some(
            (g) =>
              !g.open && candidate > g.x - 40 && candidate < g.x + g.w + 40,
          )
        )
          e.x = candidate;
      }
      e.attackTime -= dt;
      if (e.type === "sentinel") {
        if (e.attackTime < 0.7 && e.attackTime > 0) {
          e.telegraph = e.attackTime;
          e.attackKind = "wave";
        }
        if (e.attackTime <= 0 && Math.abs(e.x - p.x) < 820) {
          this.shoot(
            e.x + e.facing * 50,
            GROUND_Y - 18,
            e.facing * 330,
            0,
            "enemy",
            12,
            "#ff8a56",
            { r: 15, ttl: 2.3, kind: "wave" },
          );
          e.attackTime = 3.2;
          e.telegraph = 0;
        }
      } else if (e.attackTime <= 0 && Math.abs(e.x - p.x) < 780) {
        const sy = e.y - e.h * 0.6;
        const angle = Math.atan2(p.y - 38 - sy, p.x - e.x);
        const speed = e.type === "drone" ? 310 : 360;
        this.shoot(
          e.x + e.facing * 22,
          sy,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          "enemy",
          e.type === "drone" ? 7 : 9,
          "#ff7e91",
          { r: 5, ttl: 2.4 },
        );
        e.attackTime = e.type === "drone" ? 2.1 : 1.8;
      }
    }
  }

  updateBoss(boss, dt) {
    const s = this.state,
      p = s.player;
    boss.marked = Math.max(0, (boss.marked || 0) - dt);
    boss.vulnerable = Math.max(0, (boss.vulnerable || 0) - dt);
    boss.shielded = boss.vulnerable <= 0;
    if (Math.abs(boss.x - p.x) > 1100) return;
    if (!s.bossStarted) {
      s.bossStarted = true;
      this.banner(
        "WARDEN // ENCOUNTER",
        "BLUEのKでシールド解除 → GOLDで背後へ → REDで破壊。",
        5,
      );
      this.emit("boss");
    }
    boss.facing = p.x < boss.x ? -1 : 1;
    const nextPhase = boss.hp / boss.maxHp < 0.5 ? 2 : 1;
    if (nextPhase === 2 && boss.phase !== 2) {
      this.banner(
        "WARDEN // OVERLOAD",
        "第2形態：衝撃波が加速、拡散弾が5連に。光る床は跳躍、照準はワイヤーで回避。",
        4,
      );
      this.emit("boss");
    }
    boss.phase = nextPhase;
    if (boss.stun > 0) return;
    boss.attackTime -= dt;
    if (boss.attackTime <= 0.95 && !boss.telegraph) {
      boss.attackKind = (boss.attackCount || 0) % 2 === 0 ? "wave" : "volley";
      boss.telegraph = Math.max(0.01, boss.attackTime);
    } else if (boss.telegraph > 0)
      boss.telegraph = Math.max(0.001, boss.attackTime);
    if (boss.attackTime <= 0) {
      if (boss.attackKind === "wave") {
        for (const direction of [-1, 1])
          this.shoot(
            boss.x + direction * 65,
            GROUND_Y - 16,
            direction * (boss.phase === 2 ? 500 : 430),
            0,
            "enemy",
            15,
            "#ff774f",
            { r: 18, ttl: 2.8, kind: "wave" },
          );
        s.shake = 7;
        this.burst(boss.x, GROUND_Y, "#ff9b60", 24, 240);
      } else {
        const sx = boss.x,
          sy = boss.y - boss.h * 0.65;
        const angle = Math.atan2(p.y - 40 - sy, p.x - sx);
        const spread =
          boss.phase === 2 ? [-0.22, -0.11, 0, 0.11, 0.22] : [-0.13, 0, 0.13];
        for (const offset of spread)
          this.shoot(
            sx,
            sy,
            Math.cos(angle + offset) * 440,
            Math.sin(angle + offset) * 440,
            "enemy",
            11,
            "#e98cff",
            { r: 7, ttl: 2.8 },
          );
      }
      boss.attackCount = (boss.attackCount || 0) + 1;
      boss.attackTime = boss.phase === 2 ? 2 : 2.6;
      boss.telegraph = 0;
    }
  }

  updateProjectiles(dt) {
    const s = this.state,
      p = s.player;
    for (const shot of s.projectiles) {
      shot.ttl -= dt;
      const oldX = shot.x,
        oldY = shot.y;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.ttl <= 0) continue;
      const inRect = (left, top, w, h) => {
        const steps = Math.max(
          1,
          Math.ceil(Math.hypot(shot.x - oldX, shot.y - oldY) / 12),
        );
        for (let i = 0; i <= steps; i++) {
          const x = oldX + ((shot.x - oldX) * i) / steps,
            y = oldY + ((shot.y - oldY) * i) / steps;
          if (
            x + shot.r > left &&
            x - shot.r < left + w &&
            y + shot.r > top &&
            y - shot.r < top + h
          )
            return true;
        }
        return false;
      };
      if (shot.owner === "player") {
        if (shot.hacked) {
          for (const relay of s.world.relays) {
            if (!relay.active && inRect(relay.x, relay.y, relay.w, relay.h)) {
              relay.hits = (relay.hits || 0) + 1;
              shot.ttl = 0;
              this.burst(
                relay.x + relay.w / 2,
                relay.y + relay.h / 2,
                COLORS[1],
                8,
              );
              if (relay.hits >= 3) {
                relay.active = true;
                s.flags.blueGate = true;
                s.energy = Math.min(100, s.energy + 22);
                this.banner(
                  "RELAY // CONNECTED",
                  "隔壁解除。KでBLUEに戻り、東の搬送路へ。",
                  4,
                );
                this.emit("hack");
              }
              break;
            }
          }
        }
        if (shot.ttl <= 0) continue;
        for (const gate of s.world.gates) {
          if (!gate.open && inRect(gate.x, gate.y, gate.w, gate.h)) {
            this.damageGate(gate, shot.damage, shot.character);
            shot.ttl = 0;
            break;
          }
        }
        if (shot.ttl <= 0) continue;
        for (const enemy of s.enemies) {
          if (
            enemy.hp > 0 &&
            !enemy.controlled &&
            inRect(enemy.x - enemy.w / 2, enemy.y - enemy.h, enemy.w, enemy.h)
          ) {
            this.damageEnemy(enemy, shot.damage);
            shot.ttl = 0;
            break;
          }
        }
      } else if (inRect(p.x - p.w / 2, p.y - p.h, p.w, p.h)) {
        this.hurtPlayer(shot.damage);
        shot.ttl = 0;
      } else {
        for (const gate of s.world.gates) {
          if (!gate.open && inRect(gate.x, gate.y, gate.w, gate.h)) {
            shot.ttl = 0;
            break;
          }
        }
      }
    }
    s.projectiles = s.projectiles.filter(
      (shot) =>
        shot.ttl > 0 &&
        shot.y > -120 &&
        shot.y < 850 &&
        shot.x > -200 &&
        shot.x < WORLD_WIDTH + 200,
    );
  }

  damageGate(gate, amount, character) {
    if (gate.kind !== "red" || character !== 0 || gate.open) return;
    gate.hp = Math.max(0, gate.hp - amount);
    this.burst(gate.x, GROUND_Y - 45, COLORS[0], 6);
    if (gate.hp <= 0) {
      this.state.flags.redGate = true;
      gate.open = true;
      this.state.energy = Math.min(100, this.state.energy + 20);
      this.state.shake = 8;
      this.banner(
        "ARMOR // BROKEN",
        "REDの火力で隔壁破壊。次はBLUEの遠隔ハッキング。",
        4,
      );
      this.burst(gate.x, GROUND_Y - 85, COLORS[0], 30, 280);
      this.emit("kill");
    }
  }

  damageEnemy(enemy, amount) {
    const s = this.state;
    if (enemy.hp <= 0 || enemy.controlled) return;
    if (enemy.type === "boss") {
      if (enemy.shielded) amount *= 0.035;
      else if (enemy.marked > 0) amount *= 1.45;
    }
    enemy.hp = Math.max(0, enemy.hp - amount);
    // Tutorial link target remains available even if the player shoots before reading the prompt.
    if (enemy.id === "blue-drone" && !s.flags.blueGate)
      enemy.hp = Math.max(1, enemy.hp);
    // The carrier is the bridge anchor and cannot be accidentally removed before traversal.
    if (enemy.id === "gold-sentinel" && !s.flags.goldWire)
      enemy.hp = Math.max(1, enemy.hp);
    enemy.hitTime = 0.12;
    s.energy = Math.min(100, s.energy + (enemy.shielded ? 0.1 : 1.3));
    this.burst(
      enemy.x,
      enemy.y - enemy.h * 0.55,
      enemy.shielded ? COLORS[1] : COLORS[s.player.character],
      enemy.type === "boss" ? 5 : 3,
      120,
    );
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.telegraph = 0;
      s.stats.kills++;
      s.energy = Math.min(100, s.energy + 12);
      this.burst(enemy.x, enemy.y - enemy.h / 2, "#ffe2b2", 24, 270);
      this.emit("kill");
      if (enemy.type === "boss") {
        s.flags.bossDefeated = true;
        s.shake = 16;
        s.flash = 0.8;
        s.projectiles = s.projectiles.filter((shot) => shot.owner === "player");
        s.player.invulnerable = 5;
        this.banner(
          "WARDEN // DESTROYED",
          "通信塔奪還。三人で切り拓いた脱出ルートへ。",
          5,
        );
      }
    } else this.emit("hit");
  }

  hurtPlayer(amount) {
    const s = this.state,
      p = s.player;
    if (
      p.invulnerable > 0 ||
      p.overdrive > 0 ||
      s.possession ||
      s.flags.bossDefeated ||
      s.mode !== "playing"
    )
      return;
    p.hp = Math.max(
      0,
      p.hp - amount * (this.difficulty === "assist" ? 0.55 : 1),
    );
    p.invulnerable = 0.85;
    s.shake = 6;
    s.flash = 0.15;
    this.burst(p.x, p.y - 38, "#ff5578", 12);
    this.emit("hurt");
    if (p.hp <= 0) {
      s.mode = "dead";
      s.stats.deaths++;
      this.releasePossession();
      this.emit("defeat");
    }
  }

  updatePickups() {
    const s = this.state,
      p = s.player;
    for (const pickup of s.world.pickups) {
      if (
        pickup.collected ||
        Math.hypot(p.x - pickup.x, p.y - 30 - pickup.y) > 62
      )
        continue;
      pickup.collected = true;
      if (
        pickup.kind === "health" ||
        pickup.kind === "hp" ||
        pickup.kind === "repair"
      )
        p.hp = Math.min(p.maxHp, p.hp + 30);
      else s.energy = Math.min(100, s.energy + 28);
      this.burst(pickup.x, pickup.y, "#86ffc2", 15);
      this.emit("checkpoint");
    }
  }

  updateParticles(dt) {
    for (const particle of this.state.particles) {
      particle.ttl -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 180 * dt;
    }
    this.state.particles = this.state.particles.filter(
      (particle) => particle.ttl > 0,
    );
  }

  syncGates() {
    const s = this.state;
    for (const gate of s.world.gates) {
      if (gate.kind === "red") gate.open = s.flags.redGate;
      if (gate.kind === "blue") gate.open = s.flags.blueGate;
      if (gate.kind === "gold") gate.open = s.flags.goldWire;
      if (gate.kind === "exit" || gate.kind === "boss")
        gate.open = s.flags.bossDefeated;
    }
    if (s.flags.blueGate)
      for (const relay of s.world.relays) relay.active = true;
  }

  updateProgress() {
    const s = this.state,
      p = s.player;
    const sector = Math.max(
      0,
      SECTORS.findIndex((sec) => p.x >= sec.start && p.x < sec.end),
    );
    s.sector = sector;
    if (sector > s.checkpoint && p.grounded && !p.wire) {
      s.checkpoint = sector;
      p.hp = p.maxHp;
      s.energy = Math.max(s.energy, sector === 3 ? 100 : 60);
      const current = SECTORS[sector];
      this.banner(
        current?.name || `SECTOR ${sector + 1}`,
        sector === 3
          ? "HP全回復。ARMAROID充填完了。Rで7秒間の無敵モード。"
          : "チェックポイント更新・HP全回復。",
        3.8,
      );
      this.emit("checkpoint");
    }
  }

  updateGuidance() {
    const s = this.state,
      p = s.player;
    if (s.flags.bossDefeated) {
      s.objective = "MISSION COMPLETE — 脱出ルート確保";
      s.hint = "三つの力が、一つの道を開いた。";
      return;
    }
    if (s.possession) {
      s.objective = s.flags.blueGate
        ? "リレー接続完了 — KでBLUEへ帰還"
        : "ドローンで右へ飛行し、青いリレーへJで射撃";
      s.hint = `遠隔操縦 残り ${s.possession.remaining.toFixed(1)}秒 · 方向キーで上下左右 · J射撃 · K解除`;
      return;
    }
    if (s.sector === 0) {
      s.objective = s.flags.redGate
        ? "東の通信区画へ進む"
        : "REDの射撃 / 近接で赤い装甲隔壁を破壊する";
      s.hint =
        "1 RED · J連射 / 近距離で格闘 · Kブレイク · Shift連打でブースト推進";
    } else if (s.sector === 1) {
      s.objective = s.flags.blueGate
        ? "青い隔壁を通って搬送路へ"
        : "BLUEでドローンを乗っ取り、上空のリレーを撃つ";
      s.hint =
        "2 BLUE · ドローンに近づきK → 右へ飛行 → Jでリレー自動照準 · Kで帰還";
    } else if (s.sector === 2) {
      s.objective = s.flags.goldWire
        ? "搬送隔壁を抜けて制御塔へ"
        : "GOLDのKで対岸の巨大機にワイヤーを掛けて跳ぶ";
      s.hint =
        "3 GOLD · 対岸の巨大機へ1000以内でK · Shiftを押しながら走ると加速";
    } else {
      s.objective = s.boss?.shielded
        ? "BLUEのKでWARDENのシールドを解除する"
        : "コア露出中 — GOLDで背後へ、REDで集中攻撃";
      s.hint =
        "BLUE K ハック → GOLD K 回避＆弱点マーキング → RED J / K · R ARMAROID";
      if (p.x < 7300)
        s.hint =
          "制御塔へ進め。RでARMAROID起動：7秒間無敵。ボスの衝撃波はジャンプで回避。";
    }
  }

  getSnapshot() {
    const s = this.state;
    return JSON.parse(
      JSON.stringify({
        mode: s.mode,
        time: s.time,
        difficulty: this.difficulty,
        sector: s.sector,
        checkpoint: s.checkpoint,
        player: s.player,
        energy: s.energy,
        skillCooldown: s.skillCooldown,
        flags: s.flags,
        possession: s.possession,
        boss: s.boss,
        enemies: s.enemies,
        projectiles: s.projectiles,
        gates: s.world.gates,
        relays: s.world.relays,
        pickups: s.world.pickups,
        objective: s.objective,
        hint: s.hint,
        stats: s.stats,
        camera: s.camera,
      }),
    );
  }
}
