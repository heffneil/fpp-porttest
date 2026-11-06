/* Port Test core: pure channel math, no DOM. UMD: module.exports in Node,
 * window.PortTestCore in the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PortTestCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Channels per node, from a colour order such as "RGB" or "RGBW".
  function channelsPerNode(colorOrder) {
    var n = typeof colorOrder === 'string' ? colorOrder.length : 0;
    return n > 0 ? n : 3;
  }

  // [first, last] channel (1-based, inclusive) a virtual string drives, or null
  // when it has no pixels. A groupCount above 1 shares one node across that
  // many pixels, rounding up.
  function stringRange(vs) {
    var pixels = Math.floor(Number(vs && vs.pixelCount));
    if (!(pixels > 0)) return null;
    var start = Math.floor(Number(vs.startChannel));
    var group = Math.floor(Number(vs.groupCount));
    var nodes = group > 1 ? Math.ceil(pixels / group) : pixels;
    return [start, start + nodes * channelsPerNode(vs.colorOrder) - 1];
  }

  // Sort and merge overlapping or touching ranges.
  function mergeRanges(ranges) {
    var sorted = ranges.map(function (r) { return [r[0], r[1]]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [];
    sorted.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r[0] <= last[1] + 1) {
        if (r[1] > last[1]) last[1] = r[1];
      } else {
        out.push(r);
      }
    });
    return out;
  }

  // A port's channel ranges, merged. Strings with no pixels are skipped.
  function portRanges(port) {
    var ranges = [];
    ((port && port.virtualStrings) || []).forEach(function (vs) {
      var r = stringRange(vs);
      if (r) ranges.push(r);
    });
    return mergeRanges(ranges);
  }

  // FPP channel-set text. Semicolons only: commas are not verified on 10.3.
  function formatChannelSet(ranges) {
    return ranges.map(function (r) { return r[0] + '-' + r[1]; }).join(';');
  }

  // What the page shows for one port. description is the first non-empty string
  // description, returned as-is: rendering it safely is the UI's job.
  function summarizePort(port) {
    var ranges = portRanges(port);
    var strings = (port && port.virtualStrings) || [];
    var pixels = 0;
    var description = '';
    strings.forEach(function (vs) {
      if (stringRange(vs)) pixels += Math.floor(Number(vs.pixelCount));
      if (!description && typeof vs.description === 'string' && vs.description !== '') {
        description = vs.description;
      }
    });
    var number = Math.floor(Number(port && port.portNumber));
    // The lowest-start string with pixels: where a port-number test lights up.
    var first = null;
    strings.forEach(function (vs) {
      var r = stringRange(vs);
      if (r && (!first || r[0] < first.range[0])) first = { range: r, cpn: channelsPerNode(vs.colorOrder) };
    });
    return {
      firstStart: first ? first.range[0] : null,
      firstEnd: first ? first.range[1] : null,
      channelsPerNode: first ? first.cpn : 3,
      portNumber: number,
      label: String(number + 1),
      protocol: (port && typeof port.protocol === 'string') ? port.protocol : '',
      description: description,
      startChannel: ranges.length ? ranges[0][0] : null,
      endChannel: ranges.length ? ranges[ranges.length - 1][1] : null,
      pixelCount: pixels,
      ranges: ranges,
      hasPixels: ranges.length > 0
    };
  }

  // For each port, the other ports that share any channel with it. Ports with
  // no pixels never appear.
  function findOverlaps(summaries) {
    var out = {};
    for (var i = 0; i < summaries.length; i++) {
      for (var j = i + 1; j < summaries.length; j++) {
        var a = summaries[i], b = summaries[j];
        if (!a.hasPixels || !b.hasPixels) continue;
        if (rangesIntersect(a.ranges, b.ranges)) {
          (out[a.portNumber] = out[a.portNumber] || []).push(b.portNumber);
          (out[b.portNumber] = out[b.portNumber] || []).push(a.portNumber);
        }
      }
    }
    return out;
  }

  function rangesIntersect(xs, ys) {
    for (var i = 0; i < xs.length; i++) {
      for (var j = 0; j < ys.length; j++) {
        if (xs[i][0] <= ys[j][1] && ys[j][0] <= xs[i][1]) return true;
      }
    }
    return false;
  }

  // The channel set for the ticked ports: their ranges, merged.
  function selectionChannelSet(summaries, selected) {
    var chosen = {};
    selected.forEach(function (n) { chosen[n] = true; });
    var ranges = [];
    summaries.forEach(function (s) {
      if (chosen[s.portNumber]) ranges = ranges.concat(s.ranges);
    });
    return formatChannelSet(mergeRanges(ranges));
  }

  // Port N lights its first N pixels (capped at its first string), so counting
  // the lit pixels at the start of a port tells you its number.
  function portNumberRanges(sum) {
    if (!sum.hasPixels) return [];
    var end = Math.min(sum.firstStart + (sum.portNumber + 1) * sum.channelsPerNode - 1, sum.firstEnd);
    return [[sum.firstStart, end]];
  }

  function portNumberChannelSet(summaries, selected) {
    var chosen = {};
    selected.forEach(function (n) { chosen[n] = true; });
    var ranges = [];
    summaries.forEach(function (sum) {
      if (chosen[sum.portNumber]) ranges = ranges.concat(portNumberRanges(sum));
    });
    return formatChannelSet(mergeRanges(ranges));
  }

  var PATTERNS = { solid: 'RGB Single Color', portnumber: 'RGB Single Color', chase: 'RGB Chase', cycle: 'RGB Cycle' };
  var CHASE_TYPES = [
    'R-G-B', 'R-G-B-All', 'R-G-B-None', 'R-G-B-All-None',
    'R-G-B-W', 'R-G-B-W-All', 'R-G-B-W-None', 'R-G-B-W-All-None'
  ];
  var DEFAULT_COLOR = '#404040';
  var DEFAULT_INTERVAL_MS = 1000;

  // The Test Start command body for POST /api/command. Only the channel-based
  // effects are ever built: Output Specific cannot be limited to ports.
  function buildTestStart(opts) {
    var ms = Math.floor(Number(opts.intervalMs));
    if (!(ms >= 0)) ms = DEFAULT_INTERVAL_MS;
    ms = Math.min(10000, Math.max(100, ms));
    return {
      command: 'Test Start',
      multisyncCommand: false,
      multisyncHosts: '',
      args: [String(ms), PATTERNS[opts.pattern], String(opts.channelSet), String(opts.value)]
    };
  }

  function buildTestStop() {
    return { command: 'Test Stop', multisyncCommand: false, multisyncHosts: '', args: [] };
  }

  // Parse FPP channel-set text ("1-3;7;9-10"; commas accepted too) into ranges.
  // Empty or malformed tokens are ignored.
  function parseChannelSet(str) {
    var out = [];
    String(str === undefined || str === null ? '' : str).split(/[;,]/).forEach(function (tok) {
      var m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(tok);
      if (!m) return;
      var a = parseInt(m[1], 10);
      var b = m[2] === undefined ? a : parseInt(m[2], 10);
      if (b >= a) out.push([a, b]);
    });
    return out;
  }

  // 'RGBChase-RGBWAN' -> 'R-G-B-W-All-None'. Unknown input gives 'R-G-B'.
  var SUFFIX_TO_TYPE = {
    RGB: 'R-G-B', RGBA: 'R-G-B-All', RGBN: 'R-G-B-None', RGBAN: 'R-G-B-All-None',
    RGBW: 'R-G-B-W', RGBWA: 'R-G-B-W-All', RGBWN: 'R-G-B-W-None', RGBWAN: 'R-G-B-W-All-None'
  };
  function chaseTypeFromSubMode(subMode) {
    var suffix = String(subMode === undefined || subMode === null ? '' : subMode).split('-').pop();
    return Object.prototype.hasOwnProperty.call(SUFFIX_TO_TYPE, suffix) ? SUFFIX_TO_TYPE[suffix] : 'R-G-B';
  }

  function covers(testRanges, r) {
    for (var i = 0; i < testRanges.length; i++) {
      if (testRanges[i][0] <= r[0] && r[1] <= testRanges[i][1]) return true;
    }
    return false;
  }

  function hex2(n) {
    n = Math.max(0, Math.min(255, Math.floor(Number(n)) || 0));
    return (n < 16 ? '0' : '') + n.toString(16);
  }

  // Decide whether the running test (the whole GET /api/fppd/testing body) is
  // one this page could have started over some of these ports.
  function recognise(summaries, testingBody) {
    var cfg = testingBody && typeof testingBody === 'object' ? testingBody.config : null;
    if (!cfg || typeof cfg !== 'object') return { kind: 'other', reason: 'No test status was returned.' };
    if (!cfg.enabled) return { kind: 'none' };

    var pattern = cfg.mode === 'RGBFill' ? 'solid' : cfg.mode === 'RGBChase' ? 'chase'
      : cfg.mode === 'RGBCycle' ? 'cycle' : null;
    if (!pattern) return { kind: 'other', reason: 'A different kind of test is running (' + String(cfg.mode) + ').' };
    if (typeof cfg.channelSet !== 'string' || cfg.channelSet === '') {
      return { kind: 'other', reason: 'A test is running that is not limited to a channel range.' };
    }

    var testRanges = mergeRanges(parseChannelSet(cfg.channelSet));
    if (!testRanges.length) return { kind: 'other', reason: 'The running test has no readable channel range.' };

    // Which ports does the test cover, taking each port's lit ranges from `rangesOf`?
    function match(rangesOf) {
      var ports = [];
      var union = [];
      summaries.forEach(function (sum) {
        var rs = rangesOf(sum);
        if (!rs.length) return;
        if (rs.every(function (r) { return covers(testRanges, r); })) {
          ports.push(sum.portNumber);
          union = union.concat(rs);
        }
      });
      if (ports.length && formatChannelSet(mergeRanges(union)) === formatChannelSet(testRanges)) return ports;
      return null;
    }

    var ports = match(function (sum) { return sum.ranges; });
    if (!ports && pattern === 'solid') {
      ports = match(portNumberRanges);
      if (ports) pattern = 'portnumber';
    }
    if (!ports) {
      return { kind: 'other', reason: 'The running test does not match whole ports or port numbers.' };
    }

    var value = pattern !== 'chase' && pattern !== 'cycle'
      ? '#' + hex2(cfg.color1) + hex2(cfg.color2) + hex2(cfg.color3)
      : chaseTypeFromSubMode(cfg.subMode);
    return { kind: 'ours', ports: ports, pattern: pattern, value: value };
  }

  return {
    PATTERNS: PATTERNS,
    CHASE_TYPES: CHASE_TYPES,
    DEFAULT_COLOR: DEFAULT_COLOR,
    DEFAULT_INTERVAL_MS: DEFAULT_INTERVAL_MS,
    buildTestStart: buildTestStart,
    buildTestStop: buildTestStop,
    parseChannelSet: parseChannelSet,
    chaseTypeFromSubMode: chaseTypeFromSubMode,
    recognise: recognise,
    stringRange: stringRange,
    mergeRanges: mergeRanges,
    portRanges: portRanges,
    formatChannelSet: formatChannelSet,
    summarizePort: summarizePort,
    findOverlaps: findOverlaps,
    selectionChannelSet: selectionChannelSet,
    portNumberChannelSet: portNumberChannelSet
  };
});
