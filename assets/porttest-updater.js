/* Port Test updater: debounces selection changes and keeps at most one send in
 * flight, so rapid ticking never overlaps requests to the board. UMD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PortTestUpdater = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createUpdater(opts) {
    var delayMs = opts.delayMs === undefined ? 300 : opts.delayMs;
    var setTimer = opts.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimer || function (id) { clearTimeout(id); };
    var timer = null;
    var inFlight = false;
    var pending = null; // only ever the latest selection

    function flush() {
      timer = null;
      if (inFlight || pending === null) return;
      var selection = pending;
      pending = null;
      inFlight = true;
      var done = function () {
        inFlight = false;
        // Something was asked for while we were busy: send the latest now.
        if (pending !== null) {
          if (timer !== null) { clearTimer(timer); timer = null; }
          flush();
        }
      };
      var p;
      try {
        p = Promise.resolve(opts.send(selection));
      } catch (err) {
        p = Promise.reject(err);
      }
      p.then(done, function (err) {
        try { opts.onError(err); } finally { done(); }
      });
    }

    return {
      request: function (selection) {
        pending = selection;
        if (timer !== null) clearTimer(timer);
        timer = setTimer(flush, delayMs);
      }
    };
  }

  return { createUpdater: createUpdater };
});
