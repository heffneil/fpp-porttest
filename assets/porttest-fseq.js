/* Port Test effect files: builds FPP's own Testing patterns (Port Number, Pixel
 * Count, the fades) as a sparse FSEQ that holds only the ticked ports' channels.
 * FPP plays it as an effect, in a loop, until it is stopped. Pure: no DOM, no
 * network. UMD: module.exports in Node, window.PortTestFseq in the browser.
 *
 * Patterns follow FPP's src/channeloutput/stringtesters/. They are written in
 * channel (input) order, before the string's colour order is applied, so red is
 * always the first channel of a node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PortTestFseq = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // FPP's Testing dropdown, in its order. `code` is what the effect name carries.
  var KINDS = [
    { id: 'portnumber', code: 'pn', label: 'Port Number' },
    { id: 'pixelcount_port', code: 'pcp', label: 'Pixel Count by Port' },
    { id: 'pixelcount_string', code: 'pcs', label: 'Pixel Count by String' },
    { id: 'fade_red', code: 'rf', label: 'Red Fade' },
    { id: 'fade_green', code: 'gf', label: 'Green Fade' },
    { id: 'fade_blue', code: 'bf', label: 'Blue Fade' },
    { id: 'fade_white', code: 'wf', label: 'White Fade' }
  ];

  function kindById(id) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i];
    return null;
  }
  function kindByCode(code) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].code === code) return KINDS[i];
    return null;
  }

  var NAME_PREFIX = 'porttest_';

  // porttest_pn_5_8 : pattern code, then the ports (1-based, ascending).
  function effectName(kindId, portNumbers) {
    var kind = kindById(kindId);
    if (!kind) throw new Error('Unknown pattern: ' + kindId);
    var seen = {};
    var labels = [];
    portNumbers.forEach(function (n) {
      if (!seen[n]) { seen[n] = true; labels.push(n + 1); }
    });
    labels.sort(function (a, b) { return a - b; });
    return NAME_PREFIX + kind.code + '_' + labels.join('_');
  }

  // The reverse of effectName: {kind, ports (0-based)} or null for any other name.
  function parseEffectName(name) {
    var m = /^porttest_([a-z]+)_(\d+(?:_\d+)*)$/.exec(typeof name === 'string' ? name : '');
    if (!m) return null;
    var kind = kindByCode(m[1]);
    if (!kind) return null;
    var ports = [];
    var parts = m[2].split('_');
    for (var i = 0; i < parts.length; i++) {
      var n = parseInt(parts[i], 10);
      if (!(n >= 1) || (ports.length && n - 1 <= ports[ports.length - 1])) return null;
      ports.push(n - 1);
    }
    return { kind: kind.id, ports: ports };
  }

  // ---- patterns -------------------------------------------------------------

  var RGB = { R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255] };

  // The 3 colours of a Pixel Count block, in the order FPP steps through them.
  var COUNT_COLOURS = ['G', 'R', 'B'];

  // Pixel Count: a still pattern. Blocks of ten pixels in green, red, blue; the
  // 50th pixel is white and the next block moves on to the next colour. `byString`
  // starts the count again on every string, otherwise it runs through the port.
  function assignCountColours(nodes, byString) {
    var offset = 0;
    var cur = 1;
    var lastString = null;
    nodes.forEach(function (node) {
      if (byString && node.stringIndex !== lastString) { offset = 0; cur = 1; }
      lastString = node.stringIndex;
      if (cur === 50) {
        node.colour = 'W';
        offset = (offset + 1) % 3;
        cur = 1;
      } else {
        node.colour = COUNT_COLOURS[offset];
        if (cur % 10 === 0) offset = (offset + 1) % 3;
        cur++;
      }
    });
  }

  // A fade level, 1..255 and back, over one cycle (FPP's formula).
  function fadeLevel(frame, frames) {
    var p = frame / frames;
    var v = p < 0.5 ? p * 508 + 1 : 255 - (p - 0.5) * 508;
    return Math.max(0, Math.min(255, Math.floor(v)));
  }

  // Writes one node's channels for one frame at out[at ...].
  function writeNode(out, at, node, kind, frame, frames) {
    var cpn = node.channelsPerNode;
    var i;
    if (kind.id === 'portnumber') {
      if (node.indexInPort <= node.portNumber) {
        for (i = 0; i < cpn; i++) out[at + i] = 255;
      } else {
        var rgb = RGB[['R', 'G', 'B'][Math.floor(frame / 8) % 3]];
        for (i = 0; i < Math.min(cpn, 3); i++) out[at + i] = rgb[i];
      }
    } else if (kind.id === 'pixelcount_port' || kind.id === 'pixelcount_string') {
      if (node.colour === 'W') {
        for (i = 0; i < cpn; i++) out[at + i] = 255;
      } else {
        var c = RGB[node.colour];
        for (i = 0; i < Math.min(cpn, 3); i++) out[at + i] = c[i];
      }
    } else {
      var level = fadeLevel(frame, frames);
      if (kind.id === 'fade_white') {
        if (cpn === 4) out[at + 3] = level;
        else for (i = 0; i < cpn; i++) out[at + i] = level;
      } else {
        out[at + { fade_red: 0, fade_green: 1, fade_blue: 2 }[kind.id]] = level;
      }
    }
  }

  // Frames and the time between them for each pattern.
  function timing(kind) {
    if (kind.id === 'portnumber') return { frames: 24, stepMs: 250 };   // 3 colours x 2 s; the step time is one byte, so at most 255
    if (kind.id.indexOf('fade_') === 0) return { frames: 20, stepMs: 100 }; // one 2 s fade
    return { frames: 2, stepMs: 250 };                                  // still
  }

  var MAX_RANGES = 255; // the FSEQ header holds the range count in one byte
  var HEADER = 32;

  // The effect for the ticked ports: {name, bytes, frames, stepMs, channelCount, ranges}.
  // `summaries` come from PortTestCore.summarizePort; `portNumbers` are 0-based.
  function buildEffect(summaries, portNumbers, kindId) {
    var kind = kindById(kindId);
    if (!kind) throw new Error('Unknown pattern: ' + kindId);

    var chosen = {};
    portNumbers.forEach(function (n) { chosen[n] = true; });

    var nodes = [];
    summaries.forEach(function (sum) {
      if (!chosen[sum.portNumber]) return;
      var portNodes = [];
      var indexInPort = 0;
      (sum.strings || []).forEach(function (str, stringIndex) {
        for (var i = 0; i < str.nodes; i++) {
          portNodes.push({
            at0: str.start - 1 + i * str.channelsPerNode,
            channelsPerNode: str.channelsPerNode,
            portNumber: sum.portNumber,
            indexInPort: indexInPort++,
            stringIndex: stringIndex
          });
        }
      });
      if (kind.id === 'pixelcount_port') assignCountColours(portNodes, false);
      if (kind.id === 'pixelcount_string') assignCountColours(portNodes, true);
      nodes = nodes.concat(portNodes);
    });
    if (!nodes.length) throw new Error('The ticked ports have no pixels to light.');

    // The ports that have pixels: what the effect name records, even if one of
    // them loses every shared pixel to an earlier port below.
    var shown = [];
    nodes.forEach(function (node) {
      if (shown.indexOf(node.portNumber) === -1) shown.push(node.portNumber);
    });

    // Channel order, and where ports share channels the first one keeps them.
    nodes.sort(function (a, b) { return a.at0 - b.at0; });
    var kept = [];
    var end = -1;
    nodes.forEach(function (node) {
      if (node.at0 < end) return;
      kept.push(node);
      end = node.at0 + node.channelsPerNode;
    });

    // Runs of touching nodes become one range of the file.
    var ranges = [];
    kept.forEach(function (node) {
      var last = ranges[ranges.length - 1];
      if (last && last.start0 + last.length === node.at0) {
        last.length += node.channelsPerNode;
        last.nodes.push(node);
      } else {
        ranges.push({ start0: node.at0, length: node.channelsPerNode, nodes: [node] });
      }
    });
    if (ranges.length > MAX_RANGES) {
      throw new Error('Too many separate channel ranges (' + ranges.length + ', at most ' + MAX_RANGES + '). Tick fewer ports.');
    }

    var channelCount = 0;
    ranges.forEach(function (r) {
      if (r.start0 > 0xFFFFFF || r.length > 0xFFFFFF) throw new Error('A channel range is too large for an effect file.');
      channelCount += r.length;
    });

    var t = timing(kind);
    var offset = HEADER + 6 * ranges.length;
    var bytes = new Uint8Array(offset + channelCount * t.frames);

    bytes.set([0x50, 0x53, 0x45, 0x51], 0);              // 'PSEQ'
    bytes[4] = offset & 0xFF; bytes[5] = offset >> 8;     // where the channel data starts
    bytes[6] = 0; bytes[7] = 2;                           // version 2.0
    bytes[8] = offset & 0xFF; bytes[9] = offset >> 8;     // header length: to the end of the range table
    put32(bytes, 10, channelCount);
    put32(bytes, 14, t.frames);
    bytes[18] = t.stepMs;
    // 19 reserved, 20-21 compression none, 23 reserved: all zero
    bytes[22] = ranges.length;
    for (var i = 0; i < 8; i++) bytes[24 + i] = 'PORTTEST'.charCodeAt(i);
    ranges.forEach(function (r, n) {
      var o = HEADER + 6 * n;
      bytes[o] = r.start0 & 0xFF; bytes[o + 1] = (r.start0 >> 8) & 0xFF; bytes[o + 2] = (r.start0 >> 16) & 0xFF;
      bytes[o + 3] = r.length & 0xFF; bytes[o + 4] = (r.length >> 8) & 0xFF; bytes[o + 5] = (r.length >> 16) & 0xFF;
    });

    for (var f = 0; f < t.frames; f++) {
      var at = offset + f * channelCount;
      ranges.forEach(function (r) {
        r.nodes.forEach(function (node) {
          writeNode(bytes, at, node, kind, f, t.frames);
          at += node.channelsPerNode;
        });
      });
    }

    return {
      name: effectName(kind.id, shown),
      bytes: bytes,
      frames: t.frames,
      stepMs: t.stepMs,
      channelCount: channelCount,
      ranges: ranges.map(function (r) { return { start0: r.start0, length: r.length }; })
    };
  }

  // The command bodies for POST /api/command. FPP adds .fseq to the name itself.
  function startCommand(name) {
    return { command: 'FSEQ Effect Start', multisyncCommand: false, multisyncHosts: '', args: [name, 'true', 'true'] };
  }
  function stopCommand(name) {
    return { command: 'Effect Stop', multisyncCommand: false, multisyncHosts: '', args: [name] };
  }

  function put32(bytes, at, n) {
    bytes[at] = n & 0xFF; bytes[at + 1] = (n >>> 8) & 0xFF; bytes[at + 2] = (n >>> 16) & 0xFF; bytes[at + 3] = (n >>> 24) & 0xFF;
  }

  return {
    KINDS: KINDS,
    buildEffect: buildEffect,
    effectName: effectName,
    parseEffectName: parseEffectName,
    startCommand: startCommand,
    stopCommand: stopCommand
  };
});
