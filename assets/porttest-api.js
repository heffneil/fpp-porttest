/* Port Test API: thin wrappers over FPP's HTTP API. UMD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PortTestApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
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
    // {ports: [...]}, or null when there is none.
    function getOutput(configFile) {
      return getJson('/api/channel/output/' + encodeURIComponent(configFile)).then(function (cfg) {
        var outputs = cfg && Array.isArray(cfg.channelOutputs) ? cfg.channelOutputs : [];
        for (var i = 0; i < outputs.length; i++) {
          var o = outputs[i];
          if (o && typeof o === 'object' && o.enabled) {
            return { ports: Array.isArray(o.outputs) ? o.outputs : [], subType: typeof o.subType === 'string' ? o.subType : '' };
          }
        }
        return null;
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

    return { getOutput: getOutput, getTesting: getTesting, command: command };
  }

  return { createApi: createApi };
});
