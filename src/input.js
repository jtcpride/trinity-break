const KEY_ACTIONS = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  Space: "jump",
  KeyJ: "attack",
  KeyK: "skill",
  KeyL: "dash",
  ShiftLeft: "dash",
  ShiftRight: "dash",
  KeyR: "overdrive",
  KeyQ: "cycle",
};
export class Input {
  constructor(root, { onPause = () => {}, onGesture = () => {} } = {}) {
    this.held = new Map();
    this.pulses = new Set();
    this.switchTo = null;
    this.enabled = false;
    this.root = root;
    this.down = (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        if (!e.repeat) onPause();
        return;
      }
      if (!this.enabled || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
        return;
      if (KEY_ACTIONS[e.code] || /^Digit[123]$/.test(e.code)) {
        e.preventDefault();
        onGesture();
        if (e.repeat) return;
        if (e.code.startsWith("Digit"))
          this.switchTo = Number(e.code.at(-1)) - 1;
        else this.press(KEY_ACTIONS[e.code], e.code);
      }
    };
    this.up = (e) => {
      if (KEY_ACTIONS[e.code]) this.release(KEY_ACTIONS[e.code], e.code);
    };
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", () => this.reset());
    root.querySelectorAll("[data-action]").forEach((button) => {
      const action = button.dataset.action;
      button.addEventListener("pointerdown", (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        onGesture();
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          /* Synthetic QA or unsupported capture; pointerup still releases. */
        }
        this.press(action, "pointer" + e.pointerId);
        button.classList.add("pressed");
      });
      const end = (e) => {
        this.release(action, "pointer" + e.pointerId);
        button.classList.remove("pressed");
      };
      button.addEventListener("pointerup", end);
      button.addEventListener("pointercancel", end);
      button.addEventListener("lostpointercapture", end);
      button.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    root.querySelectorAll("[data-character]").forEach((button) =>
      button.addEventListener("click", () => {
        if (this.enabled) {
          onGesture();
          this.switchTo = Number(button.dataset.character);
        }
      }),
    );
  }
  press(action, source) {
    if (!this.held.has(action)) this.held.set(action, new Set());
    const set = this.held.get(action);
    if (!set.size) this.pulses.add(action);
    set.add(source);
  }
  release(action, source) {
    this.held.get(action)?.delete(source);
  }
  isHeld(action) {
    return (this.held.get(action)?.size || 0) > 0;
  }
  sample() {
    const frame = {
      left: this.isHeld("left"),
      right: this.isHeld("right"),
      up: this.isHeld("up"),
      down: this.isHeld("down"),
      attack: this.isHeld("attack"),
      dashHeld: this.isHeld("dash"),
      jump: this.pulses.has("jump"),
      skill: this.pulses.has("skill"),
      dash: this.pulses.has("dash"),
      overdrive: this.pulses.has("overdrive"),
      cycle: this.pulses.has("cycle"),
      switchTo: this.switchTo,
    };
    this.pulses.clear();
    this.switchTo = null;
    return this.enabled ? frame : {};
  }
  reset() {
    this.held.clear();
    this.pulses.clear();
    this.switchTo = null;
    this.root
      .querySelectorAll(".pressed")
      .forEach((el) => el.classList.remove("pressed"));
  }
}
