// Small, gesture-unlocked Web Audio score. No assets or network requests.
export class AudioEngine {
  constructor() {
    this.context = null;
    this.muted = false;
    this.master = null;
    this.ambience = null;
    this.drones = [];
    this.lastEvents = new Map();
    this.pulse = 0;
    this.beat = 0;
    this.lastSector = -1;
    this.active = false;
  }

  unlock() {
    try {
      if (!this.context) {
        const Context =
          globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return Promise.resolve(false);
        const ctx = (this.context = new Context());
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.22;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 4600;
        filter.Q.value = 0.3;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -17;
        limiter.knee.value = 18;
        limiter.ratio.value = 5;
        limiter.attack.value = 0.008;
        limiter.release.value = 0.2;
        this.master.connect(filter);
        filter.connect(limiter);
        limiter.connect(ctx.destination);
        this.ambience = ctx.createGain();
        this.ambience.gain.value = 0;
        this.ambience.connect(this.master);
        [55, 82.4069, 110.18].forEach((hz, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = hz;
          gain.gain.value = index === 0 ? 0.55 : 0.22;
          osc.connect(gain);
          gain.connect(this.ambience);
          osc.start();
          this.drones.push(osc);
        });
        const buffer = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * 0.5),
          ctx.sampleRate,
        );
        const samples = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < samples.length; i++) {
          // Filtered noise avoids the sharp white-noise hiss of raw samples.
          last = (last + (Math.random() * 2 - 1) * 0.16) / 1.16;
          samples[i] = last * 2;
        }
        this.noiseBuffer = buffer;
      }
      if (this.context.state === "suspended") {
        return this.context
          .resume()
          .then(() => true)
          .catch(() => false);
      }
      return Promise.resolve(this.context.state === "running");
    } catch {
      // Audio is enhancement-only, including in browsers with no Web Audio.
      return Promise.resolve(false);
    }
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.22,
        this.context.currentTime,
        0.025,
      );
    }
  }

  _tone(hz, endHz, duration, volume = 0.13, waveform = "sine", delay = 0) {
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(hz, start);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, endHz),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, volume),
      start + 0.009,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.015);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  _noise(duration, volume = 0.12, frequency = 750) {
    const ctx = this.context;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  event(event) {
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.muted ||
      !event
    )
      return;
    const type = typeof event === "string" ? event : event.type;
    const now = this.context.currentTime;
    const interval =
      { shoot: 0.085, hit: 0.07, hurt: 0.2, jump: 0.12, dash: 0.12 }[type] ??
      0.1;
    if (now - (this.lastEvents.get(type) ?? -10) < interval) return;
    this.lastEvents.set(type, now);
    const notes = [220, 329.63, 293.66];
    const root = notes[event.character ?? 0] || notes[0];
    switch (type) {
      case "shoot":
        this._tone(
          event.character === 0 ? 760 : 920,
          event.character === 0 ? 220 : 400,
          0.065,
          0.075,
          "triangle",
        );
        this._noise(0.025, 0.035, 1800);
        break;
      case "hit":
        this._tone(420, 110, 0.07, 0.09, "triangle");
        this._noise(0.035, 0.065, 1100);
        break;
      case "kill":
        this._tone(90, 32, 0.28, 0.2);
        this._noise(0.22, 0.2, 480);
        break;
      case "switch":
        this._tone(root, root, 0.16, 0.12);
        this._tone(root * 1.5, root * 1.5, 0.2, 0.1, "sine", 0.075);
        break;
      case "hack":
        [1, 1.5, 2, 3].forEach((n, i) =>
          this._tone(220 * n, 220 * n, 0.18, 0.11, "sine", i * 0.065),
        );
        break;
      case "wire":
        this._tone(180, 780, 0.21, 0.17, "triangle");
        this._noise(0.22, 0.1, 1400);
        break;
      case "jump":
        this._tone(260, 680, 0.105, 0.075, "triangle");
        break;
      case "land":
        this._tone(180, 65, 0.045, 0.055, "triangle");
        break;
      case "dash":
        this._noise(0.17, 0.13, 900);
        this._tone(95, 190, 0.16, 0.08);
        break;
      case "overdrive":
        [110, 220, 329.63, 440].forEach((n, i) =>
          this._tone(n, n * 1.004, 0.95, 0.11, "triangle", i * 0.09),
        );
        break;
      case "hurt":
        this._tone(155, 52, 0.22, 0.17, "triangle");
        this._noise(0.14, 0.14, 350);
        break;
      case "checkpoint":
        [261.63, 329.63, 392].forEach((n, i) =>
          this._tone(n, n, 0.35, 0.11, "sine", i * 0.1),
        );
        break;
      case "boss":
        this._tone(55, 41.2, 1.2, 0.2, "triangle");
        this._tone(82.4, 61.8, 1.1, 0.12, "sine", 0.15);
        break;
      case "victory":
        [261.63, 329.63, 392, 523.25, 659.25].forEach((n, i) =>
          this._tone(n, n, 0.8, 0.15, "sine", i * 0.16),
        );
        break;
      case "defeat":
        [220, 174.61, 130.81].forEach((n, i) =>
          this._tone(n, n * 0.98, 0.7, 0.13, "sine", i * 0.17),
        );
        break;
    }
  }

  update(state, dt) {
    if (!this.context || this.context.state !== "running" || !state) return;
    const playing = state.mode === "playing";
    if (playing !== this.active) {
      this.active = playing;
      this.ambience.gain.setTargetAtTime(
        playing ? 0.075 : 0,
        this.context.currentTime,
        0.5,
      );
      if (!playing) this.pulse = 0;
    }
    if (!playing || this.muted) return;
    const sector = Math.max(0, Math.min(3, state.sector || 0));
    const base = [55, 65.406, 73.416, 49][sector];
    if (sector !== this.lastSector) {
      this.lastSector = sector;
      [1, 1.5, 2.003].forEach((ratio, i) => {
        this.drones[i].frequency.setTargetAtTime(
          base * ratio,
          this.context.currentTime,
          1.2,
        );
      });
    }
    this.pulse += Math.max(0, Math.min(0.1, dt || 0));
    const step = sector === 3 ? 0.45 : 0.64;
    if (this.pulse >= step) {
      this.pulse -= step;
      const pattern = [2, 3, 4, 3, 2, 3, 4.5, 3];
      const frequency = base * pattern[this.beat++ % pattern.length];
      this._tone(frequency, frequency, 0.4, 0.028);
      if (this.beat % 4 === 0) this._tone(base, base * 0.8, 0.18, 0.04);
    }
  }
}
