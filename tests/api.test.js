'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../assets/porttest-api.js');

const reply = (status, body, type) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => type || 'text/plain' },
  text: () => Promise.resolve(body),
  json: () => Promise.resolve(JSON.parse(body)),
});
const rig = (response) => {
  const calls = [];
  const api = createApi((url, init) => { calls.push({ url, init }); return Promise.resolve(response); });
  return { api, calls };
};

test('getOutput returns the first enabled output as {ports}', async () => {
  const cfg = { channelOutputs: [{ enabled: 0, outputs: [{ portNumber: 9 }] }, { enabled: 1, subType: 'K32A-B', outputs: [{ portNumber: 0 }] }] };
  const { api, calls } = rig(reply(200, JSON.stringify(cfg), 'application/json'));
  assert.deepEqual(await api.getOutput('co-bbbStrings'), { ports: [{ portNumber: 0 }], subType: 'K32A-B', otherEnabled: 0 });
  assert.equal(calls[0].url, '/api/channel/output/co-bbbStrings');
});

test('getOutput counts further enabled outputs it does not list', async () => {
  const cfg = { channelOutputs: [
    { enabled: 1, subType: 'A', outputs: [{ portNumber: 0 }] },
    { enabled: 0, outputs: [{ portNumber: 1 }] },
    { enabled: 1, subType: 'B', outputs: [{ portNumber: 0 }] },
    { enabled: 1, subType: 'C', outputs: [] }
  ] };
  const out = await rig(reply(200, JSON.stringify(cfg), 'application/json')).api.getOutput('x');
  assert.equal(out.subType, 'A');
  assert.equal(out.otherEnabled, 2);
});

test('GETs carry no Content-Type header (FPP 404s them)', async () => {
  const { api, calls } = rig(reply(200, '{"channelOutputs":[]}'));
  await api.getOutput('co-bbbStrings');
  const headers = (calls[0].init && calls[0].init.headers) || {};
  assert.equal(Object.keys(headers).some((h) => h.toLowerCase() === 'content-type'), false);
});

test('getOutput gives null when nothing is enabled', async () => {
  assert.equal(await rig(reply(200, '{"channelOutputs":[{"enabled":0,"outputs":[]}]}')).api.getOutput('x'), null);
  assert.equal(await rig(reply(200, '{"channelOutputs":[]}')).api.getOutput('x'), null);
  assert.equal(await rig(reply(200, '{}')).api.getOutput('x'), null);
});

test('getOutput rejects on a non-2xx response or invalid JSON', async () => {
  await assert.rejects(rig(reply(500, 'boom')).api.getOutput('x'), Error);
  await assert.rejects(rig(reply(200, '<html>')).api.getOutput('x'), Error);
});

test('getTesting returns the whole body', async () => {
  const { api, calls } = rig(reply(200, '{"Status":"OK","config":{"enabled":0}}'));
  assert.deepEqual(await api.getTesting(), { Status: 'OK', config: { enabled: 0 } });
  assert.equal(calls[0].url, '/api/fppd/testing');
});

test('command POSTs the body as JSON', async () => {
  const { api, calls } = rig(reply(200, 'Test Started'));
  const body = { command: 'Test Stop', multisyncCommand: false, multisyncHosts: '', args: [] };
  await api.command(body);
  assert.equal(calls[0].url, '/api/command');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify(body));
});

test('command accepts a plain-text 200 (what FPP actually sends)', async () => {
  await assert.doesNotReject(rig(reply(200, 'Test Started')).api.command({}));
  await assert.doesNotReject(rig(reply(200, '')).api.command({}));
});

test('command rejects a non-2xx with the response text', async () => {
  await assert.rejects(rig(reply(500, 'Invalid channel set')).api.command({}), /Invalid channel set/);
  await assert.rejects(rig(reply(404, '')).api.command({}), /404/);
});

test('command rejects a JSON {Status:"Error"}', async () => {
  await assert.rejects(rig(reply(200, '{"Status":"Error","Message":"nope"}')).api.command({}), /nope/);
});

test('getRunningEffects returns the names of the effects fppd is playing', async () => {
  const { api, calls } = rig(reply(200, '{"Status":"OK","runningEffects":[{"id":0,"name":"porttest_pn_5"},{"id":2,"name":"x"}]}'));
  assert.deepEqual(await api.getRunningEffects(), ['porttest_pn_5', 'x']);
  assert.equal(calls[0].url, '/api/fppd/effects');
  assert.deepEqual(await rig(reply(200, '{"Status":"OK"}')).api.getRunningEffects(), []);
});

test('listSequences returns the sequence names', async () => {
  const { api, calls } = rig(reply(200, '["a","porttest_pn_5"]'));
  assert.deepEqual(await api.listSequences(), ['a', 'porttest_pn_5']);
  assert.equal(calls[0].url, '/api/sequence');
  assert.deepEqual(await rig(reply(200, '{"x":1}')).api.listSequences(), []);
});

test('uploadSequence POSTs the raw bytes to sequences/<name>.fseq', async () => {
  const { api, calls } = rig(reply(200, '{"status":"OK"}'));
  const bytes = new Uint8Array([1, 2, 3]);
  await api.uploadSequence('porttest_pn_5', bytes);
  assert.equal(calls[0].url, '/api/file/sequences/porttest_pn_5.fseq');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, bytes);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/octet-stream');
});

test('uploadSequence rejects when FPP says it did not write the file', async () => {
  await assert.rejects(rig(reply(500, 'disk full')).api.uploadSequence('n', new Uint8Array(1)), /disk full/);
  await assert.rejects(rig(reply(200, '{"status":"Invalid Directory"}')).api.uploadSequence('n', new Uint8Array(1)), /Invalid Directory/);
});

test('deleteSequence DELETEs sequences/<name>.fseq', async () => {
  const { api, calls } = rig(reply(200, '{"status":"OK"}'));
  await api.deleteSequence('porttest_pn_5');
  assert.equal(calls[0].url, '/api/file/sequences/porttest_pn_5.fseq');
  assert.equal(calls[0].init.method, 'DELETE');
});

const bin = (bytes) => Object.assign(reply(200, ''), { arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) });

test('isOurSequence reads the file and checks it carries our marker', async () => {
  const fx = require('../assets/porttest-fseq.js');
  const { summarizePort } = require('../assets/porttest-core.js');
  const sum = summarizePort({ portNumber: 0, virtualStrings: [{ startChannel: 0, pixelCount: 2, groupCount: 0, colorOrder: 'RGB' }] });
  const ours = fx.buildEffect([sum], [0], 'portnumber').bytes;
  const a = rig(bin(Array.from(ours)));
  assert.equal(await a.api.isOurSequence('porttest_pn_1'), true);
  assert.equal(a.calls[0].url, '/api/file/sequences/porttest_pn_1.fseq');
  assert.equal(await rig(bin(new Array(64).fill(0))).api.isOurSequence('x'), false);
  assert.equal(await rig(reply(404, 'nope')).api.isOurSequence('x'), false);
});

test('log POSTs one event to the plugin log page and never rejects', async () => {
  const a = rig(reply(200, 'ok'));
  await a.api.log('test_start', 'Port Number, ports 1,2');
  assert.match(a.calls[0].url, /^\/plugin\.php\?plugin=fpp-porttest&page=log\.php&nopage=1$/);
  assert.equal(a.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(a.calls[0].init.body), { event: 'test_start', detail: 'Port Number, ports 1,2' });
  const failing = createApi(() => Promise.reject(new Error('offline')));
  await assert.doesNotReject(failing.log('x', 'y'));
});
