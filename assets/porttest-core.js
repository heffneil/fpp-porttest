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
    return {
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

  return {
    stringRange: stringRange,
    mergeRanges: mergeRanges,
    portRanges: portRanges,
    formatChannelSet: formatChannelSet,
    summarizePort: summarizePort,
    findOverlaps: findOverlaps,
    selectionChannelSet: selectionChannelSet
  };
});
