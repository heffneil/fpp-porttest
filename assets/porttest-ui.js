/* Port Test UI. Bootstrap classes only, no colours of its own. Every string that
 * comes from the board (descriptions especially) is set with textContent, never
 * innerHTML. Needs PortTestCore loaded first. */
(function (root) {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function alertBox(kind, text) {
    var box = el('div', 'alert alert-' + kind, text);
    box.setAttribute('role', 'alert');
    return box;
  }

  function init(rootEl, opts) {
    var core = root.PortTestCore;
    rootEl.textContent = '';
    rootEl.appendChild(el('p', 'text-body-secondary', 'Loading ports...'));

    return opts.api.getOutput(opts.configFile).then(function (output) {
      rootEl.textContent = '';
      if (!output || !output.ports.length) {
        rootEl.appendChild(alertBox('info', 'No pixel string output is configured on this board.'));
        return { getSelection: function () { return []; } };
      }
      return build(rootEl, output.ports, core);
    }, function (err) {
      rootEl.textContent = '';
      rootEl.appendChild(alertBox('danger', 'Could not load the pixel string outputs: ' + (err && err.message ? err.message : String(err))));
      return { getSelection: function () { return []; } };
    });
  }

  function build(rootEl, ports, core) {
    var summaries = ports.map(core.summarizePort)
      .sort(function (a, b) { return a.portNumber - b.portNumber; });
    var overlaps = core.findOverlaps(summaries);

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

    function enabledRows() { return rows.filter(function (r) { return !r.box.disabled; }); }

    function sync() {
      var enabled = enabledRows();
      var ticked = enabled.filter(function (r) { return r.box.checked; }).length;
      rows.forEach(function (r) { r.tr.classList.toggle('table-success', r.box.checked); });
      all.checked = enabled.length > 0 && ticked === enabled.length;
      all.indeterminate = ticked > 0 && ticked < enabled.length;
      all.disabled = enabled.length === 0;
    }

    rows.forEach(function (r) {
      r.box.addEventListener('change', sync);
      r.tr.addEventListener('click', function (ev) {
        if (ev.target === r.box || r.box.disabled) return;
        r.box.checked = !r.box.checked;
        sync();
      });
    });
    all.addEventListener('change', function () {
      var on = all.checked;
      enabledRows().forEach(function (r) { r.box.checked = on; });
      sync();
    });

    var wrap = el('div', 'table-responsive');
    wrap.appendChild(table);
    rootEl.appendChild(wrap);
    sync();

    return {
      getSelection: function () {
        return rows.filter(function (r) { return r.box.checked; })
          .map(function (r) { return r.summary.portNumber; });
      }
    };
  }

  root.PortTestUI = { init: init };
})(typeof self !== 'undefined' ? self : this);
