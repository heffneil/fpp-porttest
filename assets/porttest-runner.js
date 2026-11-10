/* Port Test runner: keeps at most one of our effect files on the board, playing.
 * Start the new file, then stop and delete the old one; stop deletes the file, so
 * nothing of ours is left in the sequences list afterwards. UMD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./porttest-fseq.js'));
  } else {
    root.PortTestRunner = factory(root.PortTestFseq);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  function createRunner(opts) {
    var api = opts.api;
    var wait = opts.wait || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var active = null; // name of the effect we believe is playing

    function ignoring(promise) { return promise.then(function () {}, function () {}); }

    // FPP answers "Effect Started" even when it could not open the file; the only
    // proof is that it shows up in the running list.
    function confirmPlaying(name, attempt) {
      return api.getRunningEffects().then(function (names) {
        if (names.indexOf(name) !== -1) return;
        if (attempt >= 3) throw new Error('FPP could not play the effect file. Check the fppd log.');
        return wait(300).then(function () { return confirmPlaying(name, attempt + 1); });
      });
    }

    function remove(name) {
      return api.command(fx.stopCommand(name)).then(function () { return api.deleteSequence(name); });
    }

    // Plays `effect` ({name, bytes}) in place of whatever we were playing.
    function apply(effect) {
      if (active === effect.name) return Promise.resolve();
      return api.uploadSequence(effect.name, effect.bytes).then(function () {
        return api.command(fx.startCommand(effect.name)).then(function () {
          return confirmPlaying(effect.name, 0);
        }).catch(function (err) {
          return ignoring(api.command(fx.stopCommand(effect.name))).then(function () {
            return ignoring(api.deleteSequence(effect.name));
          }).then(function () { throw err; });
        });
      }).then(function () {
        var old = active;
        active = effect.name;
        return old ? ignoring(remove(old)) : undefined;
      });
    }

    function stop() {
      if (!active) return Promise.resolve();
      var name = active;
      return remove(name).then(function () { active = null; });
    }

    // Take over an effect that was already playing when the page loaded.
    function adopt(name) { active = name; }

    // Delete leftover files of ours that nothing is playing (a page closed mid-test
    // and the effect later stopped some other way).
    function clean() {
      return Promise.all([api.listSequences(), api.getRunningEffects()]).then(function (res) {
        var playing = res[1];
        var stale = res[0].filter(function (n) { return fx.parseEffectName(n) && playing.indexOf(n) === -1; });
        return Promise.all(stale.map(function (n) { return ignoring(api.deleteSequence(n)); }));
      });
    }

    return { apply: apply, stop: stop, adopt: adopt, clean: clean, active: function () { return active; } };
  }

  return { createRunner: createRunner };
});
