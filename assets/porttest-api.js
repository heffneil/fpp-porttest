/* Port Test API: thin wrappers over FPP's HTTP API. UMD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./porttest-fseq.js'));
  } else {
    root.PortTestApi = factory(root.PortTestFseq);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  function createApi(fetchFn) {
    var doFetch = fetchFn || function (url, init) { return fetch(url, init); };

    // GET only, and no Content-Type header: FPP answers a GET that carries one
    // with a 404.
    function getJson(url) {
      return doFetch(url).then(function (resp) {
        if (!resp.ok) throw new Error('FPP answered ' + resp.status + ' for ' + url);
        return resp.text();
      }).then(function (text) {
        try { return JSON.parse(text); } catch (e) { throw new Error('FPP sent something that is not JSON for ' + url); }
      });
    }

    // The first enabled output of the board's pixel-string config, as
    // {ports: [...], subType, otherEnabled}, or null when there is none.
    // otherEnabled counts further enabled outputs, which are not listed: port
    // numbers can repeat across outputs, so merging them would be ambiguous.
    function getOutput(configFile) {
      return getJson('/api/channel/output/' + encodeURIComponent(configFile)).then(function (cfg) {
        var outputs = cfg && Array.isArray(cfg.channelOutputs) ? cfg.channelOutputs : [];
        var first = null;
        var others = 0;
        for (var i = 0; i < outputs.length; i++) {
          var o = outputs[i];
          if (!o || typeof o !== 'object' || !o.enabled) continue;
          if (first) { others++; continue; }
          first = { ports: Array.isArray(o.outputs) ? o.outputs : [], subType: typeof o.subType === 'string' ? o.subType : '' };
        }
        if (first) first.otherEnabled = others;
        return first;
      });
    }

    // The whole GET /api/fppd/testing body: {Status, config}.
    function getTesting() {
      return getJson('/api/fppd/testing');
    }

    // POST /api/command. FPP answers with text/plain (HTTP 200 on success, 500
    // with the message on error), so any 2xx is success; a JSON body that says
    // Status: Error is treated as a failure too.
    function command(body) {
      return doFetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (resp) {
        return resp.text().then(function (text) {
          if (!resp.ok) {
            throw new Error(text ? text : 'FPP answered ' + resp.status);
          }
          var parsed = null;
          try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
          if (parsed && typeof parsed === 'object' && String(parsed.Status).toLowerCase() === 'error') {
            throw new Error(parsed.Message ? String(parsed.Message) : 'FPP reported an error');
          }
        });
      });
    }

    // Names of the effects fppd is playing right now.
    function getRunningEffects() {
      return getJson('/api/fppd/effects').then(function (body) {
        var list = body && Array.isArray(body.runningEffects) ? body.runningEffects : [];
        return list.map(function (e) { return e && e.name; }).filter(function (n) { return typeof n === 'string'; });
      });
    }

    // Names (no extension) of the sequences on the board.
    function listSequences() {
      return getJson('/api/sequence').then(function (body) { return Array.isArray(body) ? body : []; });
    }

    // FPP answers a file write with JSON {status: 'OK', ...}; anything else is a failure.
    function fileResult(resp) {
      return resp.text().then(function (text) {
        if (!resp.ok) throw new Error(text ? text : 'FPP answered ' + resp.status);
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        if (parsed && typeof parsed === 'object' && parsed.status && parsed.status !== 'OK') {
          throw new Error(String(parsed.status));
        }
      });
    }

    // Is this sequence a file Port Test wrote? Reads it and checks the header
    // marker; a file that cannot be read is treated as not ours.
    function isOurSequence(name) {
      return doFetch('/api/file/sequences/' + encodeURIComponent(name) + '.fseq').then(function (resp) {
        if (!resp.ok) return false;
        return resp.arrayBuffer().then(function (buf) {
          return fx.isOurFile(new Uint8Array(buf, 0, Math.min(32, buf.byteLength)));
        });
      }).catch(function () { return false; });
    }

    // One line in the plugin's runtime log (see log.php). Never rejects: a log
    // that cannot be written must not get in the way of a test.
    function log(event, detail) {
      try {
        return doFetch('/plugin.php?plugin=fpp-porttest&page=log.php&nopage=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: String(event), detail: detail === undefined ? '' : String(detail) })
        }).then(function () {}, function () {});
      } catch (e) {
        return Promise.resolve();
      }
    }

    function uploadSequence(name, bytes) {
      return doFetch('/api/file/sequences/' + encodeURIComponent(name) + '.fseq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes
      }).then(fileResult);
    }

    function deleteSequence(name) {
      return doFetch('/api/file/sequences/' + encodeURIComponent(name) + '.fseq', { method: 'DELETE' }).then(fileResult);
    }

    return {
      isOurSequence: isOurSequence, log: log,
      getOutput: getOutput, getTesting: getTesting, command: command,
      getRunningEffects: getRunningEffects, listSequences: listSequences,
      uploadSequence: uploadSequence, deleteSequence: deleteSequence
    };
  }

  return { createApi: createApi };
});
