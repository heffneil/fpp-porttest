/* Port Test UI. Bootstrap classes only, no colours of its own. Every string that
 * comes from the board (descriptions especially) is set with textContent, never
 * innerHTML. Needs PortTestCore and PortTestUpdater loaded first.
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
      return build(rootEl, output.ports, opts.api);
    }, function (err) {
      rootEl.textContent = '';
      rootEl.appendChild(alertBox('danger', 'Could not load the pixel string outputs: ' + messageOf(err)));
      return { getSelection: function () { return []; } };
    });
  }

  function build(rootEl, ports, api) {
    var core = root.PortTestCore;
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
    [['off', 'Off'], ['solid', 'Solid color'], ['chase', 'RGB Chase'], ['cycle', 'RGB Cycle']].forEach(function (o) {
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
    var allCell = el('th', 'py-2');
    var all = el('input', 'form-check-input fs-4 m-0');
    all.type = 'checkbox';
    all.id = 'ptAll';
    all.setAttribute('aria-label', 'Select all ports');
    allCell.appendChild(all);
    head.appendChild(allCell);
    ['Port', 'Protocol', 'Description', 'Start channel', 'Pixels', 'End channel'].forEach(function (h) {
      head.appendChild(el('th', 'py-2', h));
    });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    var tbody = el('tbody');
    var rows = summaries.map(function (s) {
      var tr = el('tr', s.hasPixels ? '' : 'text-body-secondary');
      tr.style.height = '2.75rem';
      if (s.hasPixels) tr.style.cursor = 'pointer';

      var boxCell = el('td', 'py-2');
      var box = el('input', 'form-check-input fs-4 m-0');
      box.type = 'checkbox';
      box.disabled = !s.hasPixels;
      box.setAttribute('aria-label', 'Port ' + s.label);
      boxCell.appendChild(box);
      tr.appendChild(boxCell);

      tr.appendChild(el('td', 'py-2', s.label));
      tr.appendChild(el('td', 'py-2', s.protocol));

      var desc = el('td', 'py-2');
      desc.appendChild(document.createTextNode(s.description));
      if (!s.hasPixels) {
        desc.appendChild(el('div', 'small', 'Set a pixel count on the Pixel Strings page'));
      }
      (overlaps[s.portNumber] || []).forEach(function (other) {
        desc.appendChild(document.createTextNode(' '));
        desc.appendChild(el('span', 'badge text-bg-warning', 'also lights port ' + (other + 1)));
      });
      tr.appendChild(desc);

      tr.appendChild(el('td', 'py-2', s.hasPixels ? String(s.startChannel) : '-'));
      tr.appendChild(el('td', 'py-2', String(s.pixelCount)));
      tr.appendChild(el('td', 'py-2', s.hasPixels ? String(s.endChannel) : '-'));

      tbody.appendChild(tr);
      return { summary: s, tr: tr, box: box };
    });
    table.appendChild(tbody);

    var wrap = el('div', 'table-responsive');
    wrap.appendChild(table);
    rootEl.appendChild(controls);
    rootEl.appendChild(hint);
    rootEl.appendChild(notice);
    rootEl.appendChild(error);
    rootEl.appendChild(wrap);

    // ---- helpers ----------------------------------------------------------
    function enabledRows() { return rows.filter(function (r) { return !r.box.disabled; }); }

    function getSelection() {
      return rows.filter(function (r) { return r.box.checked; })
        .map(function (r) { return r.summary.portNumber; });
    }

    function currentValue() {
      return pattern.value === 'solid' ? color.value : chaseType.value;
    }

    function showError(text) {
      error.textContent = text;
      show(error, text !== '');
    }

    // Everything on screen that depends on the boxes, the pattern or the
    // board's state. Never sends anything.
    function render() {
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
        ? 'Testing ' + testingPorts.length + ' of ' + summaries.length + ' ports'
        : '';

      show(color, pattern.value === 'solid');
      show(chaseType, pattern.value === 'chase' || pattern.value === 'cycle');

      var needTick = pattern.value !== 'off' && ticked === 0;
      hint.textContent = needTick ? 'Tick at least one port' : '';
    }

    // ---- talking to the board ---------------------------------------------
    var lastOp = 'start';

    function send(selection) {
      if (pattern.value === 'off' || selection.length === 0) {
        if (!lit) return Promise.resolve();
        lastOp = 'stop';
        return api.command(core.buildTestStop()).then(function () {
          lit = false;
          testingPorts = null;
          render();
        });
      }
      lastOp = 'start';
      showError('');
      lit = true; // even a failed start may have left something running
      var body = core.buildTestStart({
        pattern: pattern.value,
        channelSet: core.selectionChannelSet(summaries, selection),
        value: currentValue()
      });
      return api.command(body).then(function () {
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
    return api.getTesting().then(function (body) {
      var found = core.recognise(summaries, body);
      if (found.kind === 'ours') {
        rows.forEach(function (r) { r.box.checked = found.ports.indexOf(r.summary.portNumber) !== -1; });
        pattern.value = found.pattern;
        if (found.pattern === 'solid') color.value = found.value;
        else chaseType.value = found.value;
        testingPorts = found.ports;
        lit = true;
        render();
      } else if (found.kind === 'other') {
        show(notice, true);
      }
      return handle;
    }, function () {
      return handle; // can't tell what is running; the page still works
    });
  }

  root.PortTestUI = { init: init };
})(typeof self !== 'undefined' ? self : this);
