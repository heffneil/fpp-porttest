'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizePort } = require('../assets/porttest-core.js');
const fx = require('../assets/porttest-fseq.js');

const vs = (start1, px, extra) =>
  Object.assign({ startChannel: start1 - 1, pixelCount: px, groupCount: 0, colorOrder: 'RGB', description: '' }, extra);
const port = (n, strings) => summarizePort({ portNumber: n, protocol: 'ws281x', virtualStrings: strings });

// Reads a built file back the way FPP does: an uncompressed v2 FSEQ with sparse ranges.
function decode(bytes) {
  const u16 = (o) => bytes[o] | (bytes[o + 1] << 8);
  const u24 = (o) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
  const u32 = (o) => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
  const out = {
    magic: String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]),
    dataOffset: u16(4), minor: bytes[6], major: bytes[7], headerLen: u16(8),
    channelCount: u32(10), frames: u32(14), stepMs: bytes[18],
    compression: bytes[20] & 0x0f, blocks: ((bytes[20] >> 4) << 8) | bytes[21],
    rangeCount: bytes[22], ranges: [],
  };
  let within = 0;
  for (let i = 0; i < out.rangeCount; i++) {
    const start0 = u24(32 + i * 6);
    const length = u24(35 + i * 6);
    out.ranges.push({ start0, length, within });
    within += length;
  }
  // value of channel `ch` (1-based) in frame `f`, or undefined when no range holds it
  out.at = (f, ch) => {
    for (const r of out.ranges) {
      if (ch - 1 >= r.start0 && ch - 1 < r.start0 + r.length) {
        return bytes[out.dataOffset + f * out.channelCount + r.within + (ch - 1 - r.start0)];
      }
    }
    return undefined;
  };
  out.pixel = (f, ch) => [out.at(f, ch), out.at(f, ch + 1), out.at(f, ch + 2)];
  return out;
}
const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255], WHITE = [255, 255, 255], DARK = [0, 0, 0];

test('the file is an uncompressed v2 FSEQ with the header FPP expects', () => {
  const e = fx.buildEffect([port(0, [vs(1, 10)])], [0], 'portnumber');
  const d = decode(e.bytes);
  assert.equal(d.magic, 'PSEQ');
  assert.equal(d.major, 2);
  assert.equal(d.minor, 0);
  assert.equal(d.compression, 0);
  assert.equal(d.blocks, 0);
  assert.equal(d.rangeCount, 1);
  assert.equal(d.dataOffset, 32 + 6, 'channel data follows the header and the range table');
  assert.equal(d.headerLen, d.dataOffset, 'FPP reads the standard header length as the end of the range table');
  assert.equal(d.channelCount, 30);
  assert.equal(e.bytes.length, d.dataOffset + d.channelCount * d.frames);
  assert.equal(d.frames, e.frames);
  assert.equal(d.stepMs, e.stepMs);
});

test('sparse range starts are 0-based: channel 59683 is stored as 59682', () => {
  const e = fx.buildEffect([port(14, [vs(59683, 600)])], [14], 'portnumber');
  const d = decode(e.bytes);
  assert.equal(d.ranges[0].start0, 59682);
  assert.equal(d.ranges[0].length, 1800);
});

test('Port Number: port N lights its first N pixels white, the rest cycle R, G, B every 4 seconds', () => {
  const sums = [port(2, [vs(1, 20)])];
  const e = fx.buildEffect(sums, [2], 'portnumber');
  const d = decode(e.bytes);
  assert.equal(d.frames * d.stepMs, 12000, 'three colours of 4 seconds each');
  for (let f = 0; f < d.frames; f++) {
    for (let px = 0; px < 3; px++) assert.deepEqual(d.pixel(f, 1 + px * 3), WHITE, `frame ${f} pixel ${px}`);
  }
  const colourAt = (ms) => d.pixel(Math.floor(ms / d.stepMs), 1 + 3 * 3);
  assert.deepEqual(colourAt(0), RED);
  assert.deepEqual(colourAt(3900), RED);
  assert.deepEqual(colourAt(4000), GREEN);
  assert.deepEqual(colourAt(8000), BLUE);
  assert.deepEqual(colourAt(11900), BLUE);
  assert.deepEqual(d.pixel(0, 1 + 19 * 3), RED, 'the last pixel cycles too');
});

test('Port Number counts pixels across a port\'s strings in config order, and caps at the port', () => {
  const sums = [port(4, [vs(301, 3), vs(1, 100)])]; // N = 5: 3 on the first string, 2 on the second
  const d = decode(fx.buildEffect(sums, [4], 'portnumber').bytes);
  assert.deepEqual(d.pixel(0, 301 + 2 * 3), WHITE);
  assert.deepEqual(d.pixel(0, 1), WHITE);
  assert.deepEqual(d.pixel(0, 4), WHITE);
  assert.deepEqual(d.pixel(0, 7), RED);
  const tiny = decode(fx.buildEffect([port(40, [vs(1, 3)])], [40], 'portnumber').bytes);
  assert.deepEqual(tiny.pixel(0, 7), WHITE, 'port 41 on a 3-pixel port: all of it white, nothing out of range');
  assert.equal(tiny.channelCount, 9);
});

test('Port Number on an RGBW string lights every channel of a white pixel and leaves W dark on the colours', () => {
  const sums = [port(0, [vs(1, 4, { colorOrder: 'RGBW' })])];
  const d = decode(fx.buildEffect(sums, [0], 'portnumber').bytes);
  assert.deepEqual([1, 2, 3, 4].map((c) => d.at(0, c)), [255, 255, 255, 255]);
  assert.deepEqual([5, 6, 7, 8].map((c) => d.at(0, c)), [255, 0, 0, 0]);
});

test('Pixel Count by Port: blocks of ten (green, red, blue), every 50th pixel white, counting across strings', () => {
  const sums = [port(0, [vs(1, 60), vs(181, 60)])];
  const d = decode(fx.buildEffect(sums, [0], 'pixelcount_port').bytes);
  const px = (i) => d.pixel(0, i < 60 ? 1 + i * 3 : 181 + (i - 60) * 3);
  assert.deepEqual(px(0), GREEN);
  assert.deepEqual(px(9), GREEN);
  assert.deepEqual(px(10), RED);
  assert.deepEqual(px(20), BLUE);
  assert.deepEqual(px(30), GREEN);
  assert.deepEqual(px(40), RED);
  assert.deepEqual(px(48), RED);
  assert.deepEqual(px(49), WHITE, 'the 50th pixel');
  assert.deepEqual(px(50), BLUE, 'the colour after a white pixel moves on');
  assert.deepEqual(px(59), BLUE);
  assert.deepEqual(px(60), GREEN, 'it carries on across the string boundary');
  assert.deepEqual(px(69), GREEN);
  assert.deepEqual(px(70), RED);
  assert.deepEqual(px(99), WHITE, 'the 100th pixel');
});

test('Pixel Count by String: the count starts again on every string', () => {
  const sums = [port(0, [vs(1, 60), vs(181, 60)])];
  const d = decode(fx.buildEffect(sums, [0], 'pixelcount_string').bytes);
  assert.deepEqual(d.pixel(0, 181), GREEN, 'first pixel of the second string');
  assert.deepEqual(d.pixel(0, 181 + 49 * 3), WHITE);
  assert.deepEqual(d.pixel(0, 181 + 10 * 3), RED);
});

test('Pixel Count patterns hold still: every frame is identical', () => {
  const d = decode(fx.buildEffect([port(0, [vs(1, 60)])], [0], 'pixelcount_port').bytes);
  assert.ok(d.frames >= 2);
  for (let f = 1; f < d.frames; f++) {
    for (let c = 1; c <= 180; c++) assert.equal(d.at(f, c), d.at(0, c));
  }
});

test('Red, Green and Blue Fade drive one colour channel up and down over 2 seconds', () => {
  const sums = [port(0, [vs(1, 5)])];
  [['fade_red', 0], ['fade_green', 1], ['fade_blue', 2]].forEach(([kind, ch]) => {
    const d = decode(fx.buildEffect(sums, [0], kind).bytes);
    assert.equal(d.frames * d.stepMs, 2000, kind);
    const at = (f) => d.pixel(f, 1);
    const lvl = (f) => at(f)[ch];
    assert.equal(lvl(0), 1, kind);
    assert.equal(lvl(9), 229, kind); // 0.45 * 508 + 1
    assert.equal(lvl(10), 255, kind);
    assert.equal(lvl(19), 26, kind); // 255 - 0.45 * 508
    for (let f = 0; f < d.frames; f++) {
      at(f).forEach((v, i) => { if (i !== ch) assert.equal(v, 0, `${kind} frame ${f} channel ${i}`); });
    }
  });
});

test('White Fade drives every channel of an RGB pixel, and only W on an RGBW pixel', () => {
  const rgb = decode(fx.buildEffect([port(0, [vs(1, 5)])], [0], 'fade_white').bytes);
  assert.deepEqual(rgb.pixel(10, 1), WHITE);
  assert.deepEqual(rgb.pixel(0, 1), [1, 1, 1]);
  const rgbw = decode(fx.buildEffect([port(0, [vs(1, 5, { colorOrder: 'RGBW' })])], [0], 'fade_white').bytes);
  assert.deepEqual([1, 2, 3, 4].map((c) => rgbw.at(10, c)), [0, 0, 0, 255]);
});

test('only ticked ports are in the file, and adjacent strings share one range', () => {
  const sums = [port(0, [vs(1, 100)]), port(1, [vs(301, 100)]), port(2, [vs(601, 100)])];
  const d = decode(fx.buildEffect(sums, [0, 1], 'pixelcount_port').bytes);
  assert.equal(d.rangeCount, 1);
  assert.deepEqual(d.ranges[0], { start0: 0, length: 600, within: 0 });
  assert.equal(d.at(0, 601), undefined, 'port 3 is not in the file');
});

test('ports that share channels give non-overlapping ranges, the first port keeping the shared pixels', () => {
  const sums = [port(0, [vs(1, 100)]), port(1, [vs(151, 100)])]; // port 2 starts inside port 1
  const d = decode(fx.buildEffect(sums, [0, 1], 'pixelcount_port').bytes);
  let end = -1;
  d.ranges.forEach((r) => { assert.ok(r.start0 >= end, 'ascending and not overlapping'); end = r.start0 + r.length; });
  assert.equal(d.channelCount, d.ranges.reduce((n, r) => n + r.length, 0));
});

test('a grouped string is one node per group', () => {
  const d = decode(fx.buildEffect([port(0, [vs(1, 10, { groupCount: 2 })])], [0], 'pixelcount_port').bytes);
  assert.equal(d.channelCount, 15, '5 nodes of 3 channels');
});

test('ports with no pixels are skipped, and nothing to light is an error', () => {
  const sums = [port(0, []), port(1, [vs(1, 10)])];
  const d = decode(fx.buildEffect(sums, [0, 1], 'portnumber').bytes);
  assert.equal(d.channelCount, 30);
  assert.throws(() => fx.buildEffect(sums, [0], 'portnumber'), /no pixels/i);
  assert.throws(() => fx.buildEffect(sums, [], 'portnumber'), /no pixels/i);
});

test('more than 255 separate channel ranges is refused, not truncated', () => {
  const strings = [];
  for (let i = 0; i < 300; i++) strings.push(vs(1 + i * 10, 1)); // 300 islands
  assert.throws(() => fx.buildEffect([port(0, strings)], [0], 'portnumber'), /too many separate/i);
});

test('an unknown pattern is refused', () => {
  assert.throws(() => fx.buildEffect([port(0, [vs(1, 10)])], [0], 'sparkle'), /unknown pattern/i);
});

test('the pattern list is FPP\'s Testing dropdown, in its order', () => {
  assert.deepEqual(fx.KINDS.map((k) => k.label), [
    'Port Number', 'Pixel Count by Port', 'Pixel Count by String',
    'Red Fade', 'Green Fade', 'Blue Fade', 'White Fade',
  ]);
  assert.deepEqual(fx.KINDS.map((k) => k.id), [
    'portnumber', 'pixelcount_port', 'pixelcount_string', 'fade_red', 'fade_green', 'fade_blue', 'fade_white',
  ]);
});

test('effect names carry the pattern and the ports (1-based) so a reload can read them back', () => {
  assert.equal(fx.effectName('portnumber', [4, 7]), 'porttest_pn_5_8');
  assert.deepEqual(fx.parseEffectName('porttest_pn_5_8'), { kind: 'portnumber', ports: [4, 7] });
  fx.KINDS.forEach((k) => {
    assert.deepEqual(fx.parseEffectName(fx.effectName(k.id, [0, 31])), { kind: k.id, ports: [0, 31] }, k.id);
  });
  assert.equal(fx.effectName('portnumber', [7, 4]), 'porttest_pn_5_8', 'order does not matter');
  ['', 'porttest', 'porttest_zz_1', 'porttest_pn_', 'porttest_pn_0', 'porttest_pn_x', 'other_pn_1', 'porttest_pn_1_1'].forEach((n) => {
    assert.equal(fx.parseEffectName(n), null, JSON.stringify(n));
  });
  assert.equal(fx.parseEffectName(undefined), null);
});

test('buildEffect names the file after the pattern and ports', () => {
  const e = fx.buildEffect([port(4, [vs(1, 10)])], [4], 'fade_red');
  assert.equal(e.name, 'porttest_rf_5');
});
