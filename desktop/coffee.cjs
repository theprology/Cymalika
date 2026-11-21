class CoffeeAwake {
  constructor(blocker) {
    this.blocker = blocker;
    this.id = null;
  }
  get enabled() {
    return this.id !== null && this.blocker.isStarted(this.id);
  }
  setEnabled(enabled) {
    if (typeof enabled !== "boolean")
      throw Error("Coffee needs an on/off value.");
    if (enabled && !this.enabled)
      this.id = this.blocker.start("prevent-display-sleep");
    if (!enabled) this.stop();
    return { enabled: this.enabled };
  }
  stop() {
    if (this.id !== null) this.blocker.stop(this.id);
    this.id = null;
  }
}
module.exports = { CoffeeAwake };
