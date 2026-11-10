/* Port Test UI. Bootstrap classes only, no colours of its own. Every string that
 * comes from the board (descriptions especially) is set with textContent, never
 * innerHTML. Needs PortTestCore, PortTestUpdater, PortTestFseq and PortTestRunner
 * loaded first.
 *
 * A test started here stays lit until it is turned off: nothing here stops a
 * test on page close or unload. */
(function (root) {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function show(node, on) {
    node.hidden = !on;
    node.classList.toggle('d-none', !on);
  }

  function alertBox(kind, text) {
    var box = el('div', 'alert alert-' + kind, text);
    box.setAttribute('role', 'alert');
    return box;
  }

  function messageOf(err) {
    return err && err.message ? err.message : String(err);
  }

  function init(rootEl, opts) {
    rootEl.textContent = '';
    rootEl.appendChild(el('p', 'text-body-secondary', 'Loading ports...'));

    return opts.api.getOutput(opts.configFile).then(function (output) {
      rootEl.textContent = '';
      if (!output || !output.ports.length) {
        rootEl.appendChild(alertBox('info', 'No pixel string output is configured on this board.'));
        return { getSelection: function () { return []; } };
      }
      return build(rootEl, output.ports, opts.api, output.subType);
    }, function (err) {
      rootEl.textContent = '';
      rootEl.appendChild(alertBox('danger', 'Could not load the pixel string outputs: ' + messageOf(err)));
      return { getSelection: function () { return []; } };
    });
  }

  function build(rootEl, ports, api, subType) {
    var core = root.PortTestCore;
    var fx = root.PortTestFseq;
    var runner = root.PortTestRunner.createRunner({ api: api });
    var summaries = ports.map(core.summarizePort)
      .sort(function (a, b) { return a.portNumber - b.portNumber; });
    var overlaps = core.findOverlaps(summaries);

    // ---- state ------------------------------------------------------------
    var testingPorts = null; // portNumbers the board was last told to light, or null
    var lit = false;         // we may have left a test running, so Off must send a Stop

    // ---- controls ---------------------------------------------------------
    var controls = el('div', 'd-flex flex-wrap align-items-center gap-2 mb-2');
    var patternLabel = el('label', 'fw-semibold', 'Testing:');
    patternLabel.htmlFor = 'ptPattern';
    var pattern = el('select', 'form-select w-auto');
    pattern.id = 'ptPattern';
    // FPP's own Testing dropdown first, in its order; then the plain channel tests.
    var patternChoices = [['off', 'Off']]
      .concat(fx.KINDS.map(function (k) { return [k.id, k.label]; }))
      .concat([['solid', 'Solid color'], ['chase', 'RGB Chase'], ['cycle', 'RGB Cycle']]);
    patternChoices.forEach(function (o) {
      var opt = el('option', '', o[1]);
      opt.value = o[0];
      pattern.appendChild(opt);
    });
    var color = el('input', 'form-control form-control-color');
    color.type = 'color';
    color.id = 'ptColor';
    color.value = core.DEFAULT_COLOR;
    color.setAttribute('aria-label', 'Test color');
    var chaseType = el('select', 'form-select w-auto');
    chaseType.id = 'ptChaseType';
    chaseType.setAttribute('aria-label', 'Chase type');
    core.CHASE_TYPES.forEach(function (t) {
      var opt = el('option', '', t);
      opt.value = t;
      chaseType.appendChild(opt);
    });
    var status = el('span', 'fw-semibold');
    status.id = 'ptStatus';
    controls.appendChild(patternLabel);
    controls.appendChild(pattern);
    controls.appendChild(color);
    controls.appendChild(chaseType);
    controls.appendChild(status);

    var limitLabel = el('label', 'ms-auto text-body-secondary', 'Ports shown:');
    limitLabel.htmlFor = 'ptLimit';
    var limit = el('input', 'form-control form-control-sm');
    limit.id = 'ptLimit';
    limit.type = 'number';
    limit.min = '1';
    limit.max = String(summaries.length);
    limit.style.width = '5rem';
    limit.title = 'Show ports 1 to this number. Some capes have fewer ports than the driver lists.';
    var limitDefault = core.defaultPortLimit(subType, summaries.length);
    var saved = null;
    try { saved = parseInt(localStorage.getItem('porttest.limit'), 10); } catch (e) { saved = null; }
    limit.value = String(saved >= 1 && saved <= summaries.length ? saved : limitDefault);
    controls.appendChild(limitLabel);
    controls.appendChild(limit);

    var hint = el('div', 'text-body-secondary mb-2');
    hint.id = 'ptHint';

    var notice = el('div', 'alert alert-warning d-flex flex-wrap align-items-center gap-2');
    notice.id = 'ptNotice';
    notice.setAttribute('role', 'alert');
    notice.appendChild(el('span', '', 'A different test is running.'));
    var noticeStop = el('button', 'btn btn-sm btn-outline-secondary', 'Stop it');
    noticeStop.type = 'button';
    noticeStop.id = 'ptNoticeStop';
    notice.appendChild(noticeStop);
    show(notice, false);

    var error = alertBox('danger', '');
    error.id = 'ptError';
    show(error, false);

    // ---- table ------------------------------------------------------------
    var table = el('table', 'table table-sm align-middle');
    var head = el('tr');
    var allCell = el('th', 'py-1');
    var all = el('input', 'form-check-input fs-5 m-0');
    all.type = 'checkbox';
    all.id = 'ptAll';
    all.style.width = all.style.height = '1.25rem';
    all.setAttribute('aria-label', 'Select all ports');
    allCell.appendChild(all);
    head.appendChild(allCell);
    ['Port', 'Protocol', 'Description', 'Start channel', 'Pixels', 'End channel'].forEach(function (h) {
      head.appendChild(el('th', 'py-1', h));
    });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    var tbody = el('tbody');
    var rows = summaries.map(function (s) {
      var tr = el('tr', s.hasPixels ? '' : 'text-body-secondary');
            if (s.hasPixels) tr.style.cursor = 'pointer';

      var boxCell = el('td', 'py-1');
      var box = el('input', 'form-check-input fs-5 m-0');
      box.type = 'checkbox';
      box.style.width = box.style.height = '1.25rem';
      box.disabled = !s.hasPixels;
      box.setAttribute('aria-label', 'Port ' + s.label);
      boxCell.appendChild(box);
      tr.appendChild(boxCell);

      tr.appendChild(el('td', 'py-1', s.label));
      tr.appendChild(el('td', 'py-1', s.protocol));

      var desc = el('td', 'py-1');
      desc.appendChild(document.createTextNode(s.description));
      if (!s.hasPixels) {
        desc.appendChild(el('div', 'small', 'Set a pixel count on the Pixel Strings page'));
      }
      (overlaps[s.portNumber] || []).forEach(function (other) {
        desc.appendChild(document.createTextNode(' '));
        desc.appendChild(el('span', 'badge text-bg-warning', 'also lights port ' + (other + 1)));
      });
      tr.appendChild(desc);

      tr.appendChild(el('td', 'py-1', s.hasPixels ? String(s.startChannel) : '-'));
      tr.appendChild(el('td', 'py-1', String(s.pixelCount)));
      tr.appendChild(el('td', 'py-1', s.hasPixels ? String(s.endChannel) : '-'));

      tbody.appendChild(tr);
      return { summary: s, tr: tr, box: box };
    });
    table.appendChild(tbody);

    var wrap = el('div', 'table-responsive');
    // Explicit, not just the class: FPP's Bootstrap build may not ship the rule,
    // and a phone-width screen must scroll the table, not the page.
    wrap.style.overflowX = 'auto';
    wrap.appendChild(table);
    rootEl.appendChild(controls);
    rootEl.appendChild(hint);
    rootEl.appendChild(notice);
    rootEl.appendChild(error);
    rootEl.appendChild(wrap);

    // ---- helpers ----------------------------------------------------------
    function limitValue() {
      var n = parseInt(limit.value, 10);
      return n >= 1 ? Math.min(n, summaries.length) : summaries.length;
    }
    function isShown(r) { return r.summary.portNumber < limitValue(); }
    function enabledRows() { return rows.filter(function (r) { return isShown(r) && !r.box.disabled; }); }

    function getSelection() {
      return rows.filter(function (r) { return isShown(r) && r.box.checked; })
        .map(function (r) { return r.summary.portNumber; });
    }

    function currentValue() {
      return pattern.value === 'chase' || pattern.value === 'cycle' ? chaseType.value : color.value;
    }

    // Port Number, Pixel Count and the fades play as an effect file; Solid, Chase
    // and Cycle use FPP's channel test.
    function isEffectPattern(v) {
      return fx.KINDS.some(function (k) { return k.id === v; });
    }

    function showError(text) {
      error.textContent = text;
      show(error, text !== '');
    }

    // Everything on screen that depends on the boxes, the pattern or the
    // board's state. Never sends anything.
    function render() {
      rows.forEach(function (r) {
        var shown = isShown(r);
        r.tr.hidden = !shown;
        r.tr.classList.toggle('d-none', !shown);
        if (!shown) r.box.checked = false;
      });
      var enabled = enabledRows();
      var ticked = enabled.filter(function (r) { return r.box.checked; }).length;
      all.checked = enabled.length > 0 && ticked === enabled.length;
      all.indeterminate = ticked > 0 && ticked < enabled.length;
      all.disabled = enabled.length === 0;

      rows.forEach(function (r) {
        var on = !!testingPorts && testingPorts.indexOf(r.summary.portNumber) !== -1;
        r.tr.classList.toggle('table-success', on);
      });

      status.textContent = testingPorts
        ? 'Testing ' + testingPorts.length + ' of ' + limitValue() + ' ports'
        : '';

      show(color, pattern.value === 'solid');
      show(chaseType, pattern.value === 'chase' || pattern.value === 'cycle');

      var needTick = pattern.value !== 'off' && ticked === 0;
      hint.textContent = needTick ? 'Tick at least one port' : '';
    }

    // ---- talking to the board ---------------------------------------------
    var lastOp = 'start';

    function stopChannelTest() {
      if (!lit) return Promise.resolve();
      return api.command(core.buildTestStop()).then(function () { lit = false; });
    }

    function send(selection) {
      if (pattern.value === 'off' || selection.length === 0) {
        if (!lit && !runner.active()) return Promise.resolve();
        lastOp = 'stop';
        return runner.stop().then(stopChannelTest).then(function () {
          testingPorts = null;
          render();
        });
      }
      lastOp = 'start';
      showError('');
      if (isEffectPattern(pattern.value)) {
        // FPP runs one channel test at a time and it would sit under the effect.
        return stopChannelTest().then(function () {
          return runner.apply(fx.buildEffect(summaries, selection, pattern.value));
        }).then(function () {
          testingPorts = selection;
          show(notice, false);
          render();
        });
      }
      return runner.stop().then(function () {
        lit = true; // even a failed start may have left something running
        var body = core.buildTestStart({
          pattern: pattern.value,
          channelSet: core.selectionChannelSet(summaries, selection),
          value: currentValue()
        });
        return api.command(body);
      }).then(function () {
        testingPorts = selection;
        show(notice, false);
        render();
      });
    }

    function onError(err) {
      showError((lastOp === 'stop' ? 'Test Stop failed: ' : 'Test Start failed: ') + messageOf(err));
      if (lastOp === 'start') testingPorts = null;
      render();
    }

    var updater = root.PortTestUpdater.createUpdater({ send: send, onError: onError, delayMs: 300 });

    function userChanged() {
      render();
      updater.request(getSelection());
    }

    // ---- wiring -----------------------------------------------------------
    rows.forEach(function (r) {
      r.box.addEventListener('change', userChanged);
      r.tr.addEventListener('click', function (ev) {
        if (ev.target === r.box || r.box.disabled) return;
        r.box.checked = !r.box.checked;
        userChanged();
      });
    });
    all.addEventListener('change', function () {
      var on = all.checked;
      enabledRows().forEach(function (r) { r.box.checked = on; });
      userChanged();
    });
    limit.addEventListener('change', function () {
      try { localStorage.setItem('porttest.limit', String(limitValue())); } catch (e) { /* not saved */ }
      userChanged();
    });
    pattern.addEventListener('change', userChanged);
    color.addEventListener('input', userChanged);
    chaseType.addEventListener('change', userChanged);

    noticeStop.addEventListener('click', function () {
      showError('');
      api.command(core.buildTestStop()).then(function () {
        lit = false;
        show(notice, false);
      }, function (err) {
        showError('Test Stop failed: ' + messageOf(err));
      });
    });

    render();

    // ---- pick up a test that is already running ---------------------------
    var handle = { getSelection: getSelection };
    function ticked(ports) {
      rows.forEach(function (r) { r.box.checked = ports.indexOf(r.summary.portNumber) !== -1; });
      testingPorts = ports;
    }

    return Promise.all([
      api.getTesting().catch(function () { return null; }),
      api.getRunningEffects().catch(function () { return []; })
    ]).then(function (res) {
      // An effect of ours, named for its pattern and ports, is the whole state.
      var mine = null;
      res[1].forEach(function (name) {
        var parsed = mine ? null : fx.parseEffectName(name);
        var known = parsed && parsed.ports.every(function (n) {
          return summaries.some(function (s) { return s.portNumber === n; });
        });
        if (known) mine = { name: name, parsed: parsed };
      });
      if (mine) {
        runner.adopt(mine.name);
        pattern.value = mine.parsed.kind;
        ticked(mine.parsed.ports);
        render();
      } else {
        var found = res[0] ? core.recognise(summaries, res[0]) : { kind: 'none' };
        if (found.kind === 'ours') {
          pattern.value = found.pattern;
          if (found.pattern === 'solid') color.value = found.value;
          else chaseType.value = found.value;
          ticked(found.ports);
          lit = true;
          render();
        } else if (found.kind === 'other') {
          show(notice, true);
        }
      }
      runner.clean().catch(function () { /* leftover files are only clutter */ });
      return handle;
    });
  }

  root.PortTestUI = { init: init };
})(typeof self !== 'undefined' ? self : this);
