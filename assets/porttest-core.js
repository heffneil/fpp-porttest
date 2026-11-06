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

  return {
    stringRange: stringRange,
    mergeRanges: mergeRanges,
    portRanges: portRanges,
    formatChannelSet: formatChannelSet
  };
});
