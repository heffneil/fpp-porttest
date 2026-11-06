'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdater } = require('../assets/porttest-updater.js');

// Fake timers and sends the test resolves by hand.
function rig() {
  const timers = [];
  const sends = [];
  const errors = [];
  const updater = createUpdater({
    send: (selection) => new Promise((resolve, reject) => sends.push({ selection, resolve, reject })),
    onError: (err) => errors.push(err),
    delayMs: 300,
    setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
    clearTimer: (id) => { if (timers[id]) timers[id].live = false; },
  });
  const fire = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); });
  const tick = () => new Promise((r) => setImmediate(r));
  return { updater, sends, errors, fire, tick, timers };
}

test('five requests inside the delay send once, with the fifth selection', async () => {
  const r = rig();
  [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5]].forEach((s) => r.updater.request(s));
  assert.equal(r.sends.length, 0);
  r.fire();
  assert.equal(r.sends.length, 1);
  assert.deepEqual(r.sends[0].selection, [1, 2, 3, 4, 5]);
});

test('a request during an in-flight send does not overlap', async () => {
  const r = rig();
  r.updater.request([1]);
  r.fire();
  assert.equal(r.sends.length, 1);
  r.updater.request([1, 2]);
  r.updater.request([1, 2, 3]);
  r.fire();
  assert.equal(r.sends.length, 1, 'no second send while the first is in flight');
  r.sends[0].resolve();
  await r.tick();
  assert.equal(r.sends.length, 2);
  assert.deepEqual(r.sends[1].selection, [1, 2, 3]);
  r.sends[1].resolve();
  await r.tick();
  r.fire();
  assert.equal(r.sends.length, 2, 'nothing further is sent');
});

test('a rejected send calls onError with that error and does not block the next request', async () => {
  const r = rig();
  r.updater.request([1]);
  r.fire();
  const boom = new Error('boom');
  r.sends[0].reject(boom);
  await r.tick();
  assert.deepEqual(r.errors, [boom]);
  r.updater.request([2]);
  r.fire();
  assert.equal(r.sends.length, 2);
  assert.deepEqual(r.sends[1].selection, [2]);
});

test('a request after the quiet delay sends again', async () => {
  const r = rig();
  r.updater.request([1]);
  assert.equal(r.timers[0].ms, 300);
  r.fire();
  r.sends[0].resolve();
  await r.tick();
  r.updater.request([2]);
  r.fire();
  assert.equal(r.sends.length, 2);
  assert.deepEqual(r.sends[1].selection, [2]);
});
