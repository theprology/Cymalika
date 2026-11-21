const assert = require("node:assert/strict");
const { CoffeeAwake } = require("./coffee.cjs");
const active = new Set();
let next = 0;
const calls = [];
const coffee = new CoffeeAwake({
  start(type) {
    calls.push(type);
    active.add(next);
    return next++;
  },
  isStarted(id) {
    return active.has(id);
  },
  stop(id) {
    active.delete(id);
  },
});
assert(!coffee.enabled);
assert.throws(() => coffee.setEnabled("true"));
coffee.setEnabled(true);
coffee.setEnabled(true);
assert(coffee.enabled);
assert.equal(active.size, 1);
assert.deepEqual(calls, ["prevent-display-sleep"]);
coffee.setEnabled(false);
assert(!coffee.enabled);
assert.equal(active.size, 0);
coffee.setEnabled(true);
coffee.stop();
coffee.stop();
assert.equal(active.size, 0);
const broken = new CoffeeAwake({
  start() {
    throw Error("unavailable");
  },
  isStarted() {
    return false;
  },
  stop() {},
});
assert.throws(() => broken.setEnabled(true));
assert(!broken.enabled);
console.log(
  "PASS: Electron coffee blocker starts once, releases on stop, rejects invalid requests and handles startup failure.",
);
