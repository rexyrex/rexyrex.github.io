/* /apps/exif/ — the metadata inspector.
   A simulation of the app's editor on a sample photo: edit the text
   fields, the capture date and the keywords, review the change list
   before saving (as the app does), or clear every tag. Dependency-free;
   no timers run unless a visitor acts. */
(function () {
  'use strict';

  var root = document.getElementById('ix');
  if (!root) return;

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var ui = {
    save: $('ix-save'),
    saveCount: $('ix-save-count'),
    clear: $('ix-clear'),
    reset: $('ix-reset'),
    dialog: $('ix-dialog'),
    dialogTitle: $('ix-dialog-title'),
    dialogBody: $('ix-dialog-body'),
    cancel: $('ix-cancel'),
    confirm: $('ix-confirm'),
    receipt: $('ix-receipt'),
    status: $('ix-status'),
    count: $('ix-count'),
    countWord: $('ix-count-word'),
    chips: $('ix-chips'),
    kwInput: $('f-kw'),
    kwAdd: $('ix-kw-add'),
    map: $('ix-map'),
    mapCoord: root.querySelector('.ix-map-coord'),
    date: $('f-date'),
    time: $('f-time')
  };

  // Same order and labels as the app's change list (metadata_edit_plan.dart).
  var textFields = [
    { key: 'description', label: 'Description' },
    { key: 'copyright', label: 'Copyright' },
    { key: 'artist', label: 'Creator' },
    { key: 'title', label: 'Title' },
    { key: 'subject', label: 'Subject' },
    { key: 'comment', label: 'Comment' }
  ].map(function (f) { f.el = $('f-' + f.key); f.row = f.el.closest('.ix-row'); return f; });

  var rows = Array.prototype.slice.call(root.querySelectorAll('.ix-row'));
  textFields.forEach(function (f) { f.el.setAttribute('data-ph', f.el.placeholder); });
  // a dash for the date row once it has been cleared (date inputs can't show placeholders)
  (function () {
    var gone = document.createElement('span');
    gone.className = 'ix-gone';
    gone.textContent = '--';
    ui.date.parentNode.appendChild(gone);
  })();
  var kwRow = root.querySelector('.ix-kw');
  var dateRow = ui.date.closest('.ix-row');
  var mapCoordText = ui.mapCoord.textContent;

  // Snapshot of the sample as shipped in the HTML.
  rows.forEach(function (row) {
    if (!row.classList.contains('is-edit')) {
      var val = row.querySelector('.ix-val');
      val.setAttribute('data-orig', val.innerHTML);
    }
  });

  function readKeywords() {
    return Array.prototype.map.call(ui.chips.querySelectorAll('.chip'), function (c) {
      return (c.getAttribute('data-kw') || c.textContent).trim();
    });
  }

  function snapshot() {
    var s = { text: {}, keywords: keywords.slice(), date: ui.date.value, time: ui.time.value };
    textFields.forEach(function (f) { s.text[f.key] = f.el.value; });
    return s;
  }

  var keywords = readKeywords();
  var initial = snapshot();
  var saved = clone(initial);
  var wiped = false;
  var busy = false;
  var timers = [];
  var announceTimer = 0;
  var lastCount = null;

  function clone(s) {
    return { text: Object.assign({}, s.text), keywords: s.keywords.slice(), date: s.date, time: s.time };
  }

  /* ---------- keywords ---------- */

  function renderChips() {
    ui.chips.textContent = '';
    keywords.forEach(function (kw, i) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.setAttribute('data-kw', kw);
      chip.appendChild(document.createTextNode(kw));
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.setAttribute('aria-label', 'Remove keyword ' + kw);
      x.textContent = '×';
      x.disabled = wiped;
      x.addEventListener('click', function () {
        keywords.splice(i, 1);
        renderChips();
        var next = ui.chips.querySelectorAll('.chip-x')[i] || ui.chips.querySelectorAll('.chip-x')[i - 1] || ui.kwInput;
        next.focus();
        update(true);
      });
      chip.appendChild(x);
      ui.chips.appendChild(chip);
    });
  }

  function addKeyword() {
    if (wiped) return;
    var v = ui.kwInput.value.replace(/[;,]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!v) return;
    if (keywords.some(function (k) { return k.toLowerCase() === v.toLowerCase(); })) {
      say('“' + v + '” is already a keyword.');
      return;
    }
    keywords.push(v);
    ui.kwInput.value = '';
    renderChips();
    update(true);
  }

  ui.kwInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword();
    }
  });
  ui.kwAdd.addEventListener('click', addKeyword);

  /* ---------- state ---------- */

  function fmtDate(date, time) {
    if (!date) return '(cleared)';
    var p = date.split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0] + '  ' + (time || '00:00').slice(0, 5);
  }

  function changes() {
    var list = [];
    textFields.forEach(function (f) {
      var changed = f.el.value !== saved.text[f.key];
      f.row.classList.toggle('is-changed', changed && !wiped);
      if (changed) list.push({ label: f.label, value: f.el.value || '(cleared)', row: f.row });
    });
    var kwChanged = keywords.join(';') !== saved.keywords.join(';');
    kwRow.classList.toggle('is-changed', kwChanged && !wiped);
    if (kwChanged) list.push({ label: 'Keywords', value: keywords.join(', ') || '(cleared)', row: kwRow });
    var dateChanged = ui.date.value !== saved.date || ui.time.value !== saved.time;
    dateRow.classList.toggle('is-changed', dateChanged && !wiped);
    if (dateChanged) list.push({ label: 'Capture Date', value: fmtDate(ui.date.value, ui.time.value), row: dateRow });
    return wiped ? [] : list;
  }

  function tagCount() {
    var n = 0;
    rows.forEach(function (row) {
      if (row.classList.contains('is-gone')) return;
      var tags = row.getAttribute('data-tags').split(' ').length;
      var field = row.getAttribute('data-field');
      if (!field) n += tags;
      else if (field === 'keywords') n += keywords.length ? 1 : 0;
      else if (field === 'date') n += ui.date.value ? 1 : 0;
      else n += $('f-' + field).value.trim() ? 1 : 0;
    });
    return n;
  }

  function renderCount() {
    var n = tagCount();
    ui.count.textContent = String(n);
    ui.countWord.textContent = n === 1 ? 'tag' : 'tags';
    if (lastCount !== null && n !== lastCount && !reduceMotion.matches) {
      ui.count.classList.remove('tick');
      void ui.count.offsetWidth;
      ui.count.classList.add('tick');
      clearTimeout(renderCount.t);
      renderCount.t = setTimeout(function () { ui.count.classList.remove('tick'); }, 320);
    }
    lastCount = n;
    return n;
  }

  function say(msg) {
    ui.status.textContent = msg;
  }

  function update(fromEdit) {
    var list = changes();
    var n = renderCount();
    ui.save.disabled = busy || wiped || list.length === 0;
    ui.saveCount.hidden = list.length === 0;
    ui.saveCount.textContent = String(list.length);
    ui.save.setAttribute('aria-label', list.length ? 'Save ' + list.length + (list.length === 1 ? ' change' : ' changes') : 'Save');
    ui.clear.disabled = busy || wiped || n === 0;
    ui.reset.disabled = busy;
    if (fromEdit) {
      hide(ui.receipt);
      clearTimeout(announceTimer);
      announceTimer = setTimeout(function () {
        say(list.length ? list.length + (list.length === 1 ? ' change' : ' changes') + ' ready to save. ' + n + ' tags in the file.' : 'No unsaved changes. ' + n + ' tags in the file.');
      }, 650);
    }
    return list;
  }

  textFields.forEach(function (f) { f.el.addEventListener('input', function () { update(true); }); });
  ui.date.addEventListener('input', function () { update(true); });
  ui.time.addEventListener('input', function () { update(true); });

  /* ---------- dialog ---------- */

  var pending = null;

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function openDialog(kind) {
    hide(ui.receipt);
    pending = kind;
    ui.dialog.classList.toggle('is-danger', kind === 'clear');
    ui.dialogBody.textContent = '';
    if (kind === 'save') {
      var list = update(false);
      if (!list.length) return;
      ui.dialogTitle.textContent = 'Save changes?';
      var p = document.createElement('p');
      p.textContent = 'The following fields will be updated:';
      var dl = document.createElement('dl');
      dl.className = 'ix-changes';
      list.forEach(function (c) {
        var dt = document.createElement('dt');
        dt.textContent = c.label;
        var dd = document.createElement('dd');
        dd.textContent = c.value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      ui.dialogBody.appendChild(p);
      ui.dialogBody.appendChild(dl);
      ui.confirm.textContent = 'Save';
      ui.confirm.className = 'xb xb-primary';
    } else {
      ui.dialogTitle.textContent = 'Clear all metadata';
      var p2 = document.createElement('p');
      p2.textContent = 'This will remove all metadata from the photo including EXIF, GPS, and camera data. This cannot be undone.';
      var small = document.createElement('small');
      small.textContent = 'Here, Reset sample brings it back.';
      ui.dialogBody.appendChild(p2);
      ui.dialogBody.appendChild(small);
      ui.confirm.textContent = 'Clear';
      ui.confirm.className = 'xb xb-danger-solid';
    }
    show(ui.dialog);
    (kind === 'clear' ? ui.cancel : ui.confirm).focus();
  }

  function closeDialog(returnFocus) {
    if (ui.dialog.hidden) return;
    hide(ui.dialog);
    var kind = pending;
    pending = null;
    if (returnFocus) (kind === 'clear' ? ui.clear : ui.save).focus();
  }

  ui.cancel.addEventListener('click', function () { closeDialog(true); say('Nothing changed.'); });
  ui.confirm.addEventListener('click', function () {
    var kind = pending;
    closeDialog(false);
    if (kind === 'save') doSave();
    else if (kind === 'clear') doClear();
  });
  ui.dialog.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(true); }
  });

  ui.save.addEventListener('click', function () { openDialog('save'); });
  ui.clear.addEventListener('click', function () { openDialog('clear'); });
  ui.reset.addEventListener('click', doReset);

  /* ---------- save ---------- */

  function doSave() {
    var list = update(false);
    if (!list.length) return;
    list.forEach(function (c) { flash(c.row, 'is-written', 1150); });
    saved = snapshot();
    update(false);
    receipt('saved', 'Metadata updated', [
      ['Your edits were written to the EXIF header', list.map(function (c) { return c.label; }).join(', ')]
    ], 'In the app, a supported gallery photo is updated in place once you allow it; otherwise you get an edited copy.');
    say('Metadata updated: ' + list.length + (list.length === 1 ? ' field' : ' fields') + ' written. ' + tagCount() + ' tags in the file.');
    ui.save.focus();
  }

  function flash(row, cls, ms) {
    if (reduceMotion.matches) return;
    row.classList.remove(cls);
    void row.offsetWidth;
    row.classList.add(cls);
    timers.push(setTimeout(function () { row.classList.remove(cls); }, ms));
  }

  /* ---------- clear all ---------- */

  function hasValue(row) {
    var field = row.getAttribute('data-field');
    if (!field) return true;
    if (field === 'keywords') return keywords.length > 0;
    if (field === 'date') return !!ui.date.value;
    return !!$('f-' + field).value.trim();
  }

  function blank(row) {
    var field = row.getAttribute('data-field');
    if (!field) {
      row.querySelector('.ix-val').textContent = '--';
    } else if (field === 'keywords') {
      keywords = [];
      renderChips();
    } else if (field === 'date') {
      ui.date.value = '';
      ui.time.value = '';
    } else {
      var input = $('f-' + field);
      input.value = '';
      input.placeholder = '--';
    }
    row.classList.add('is-gone');
    if (row.closest('.ix-gps')) wipeMap();
  }

  function lockInputs(locked) {
    root.querySelectorAll('.ix-in, .chip-x, .kw-btn').forEach(function (el) { el.disabled = locked; });
  }

  function wipeMap() {
    if (ui.map.classList.contains('is-wiped')) return;
    ui.map.classList.add('is-wiped');
    ui.mapCoord.textContent = ui.mapCoord.getAttribute('data-gone');
  }

  function doClear() {
    if (busy || wiped) return;
    busy = true;
    hide(ui.receipt);
    clearTimers();
    update(false);
    say('Clearing all metadata…');
    var still = reduceMotion.matches;
    var targets = rows.filter(hasValue);
    // empty fields are removed too; they just have nothing to strike
    rows.filter(function (r) { return !hasValue(r); }).forEach(function (r) { r.classList.add('is-gone'); });
    lockInputs(true);
    if (!still) root.classList.add('is-safelight');

    var step = still ? 0 : 72;
    var strike = still ? 0 : 230;
    targets.forEach(function (row, i) {
      timers.push(setTimeout(function () {
        if (still) { blank(row); renderCount(); return; }
        row.classList.add('is-striking');
        timers.push(setTimeout(function () {
          blank(row);
          row.classList.remove('is-striking');
          renderCount();
        }, strike));
      }, 120 + i * step));
    });

    timers.push(setTimeout(function () {
      root.classList.remove('is-safelight');
      wiped = true;
      busy = false;
      wipeMap();
      update(false);
      receipt('clean', 'Metadata cleaned', [
        ['Location stripped', 'GPS coordinates removed (latitude, longitude, altitude)'],
        ['Device IDs cleared', 'Serial number and lens signatures purged'],
        ['All metadata removed', '']
      ], 'Same picture: a JPEG is rewritten without its metadata, not re-encoded, and keeps its orientation and colour profile.');
      say('All metadata cleared. 0 tags left in the file.');
      ui.reset.focus();
    }, 120 + targets.length * step + strike + (still ? 0 : 260)));
  }

  function receipt(kind, title, items, note) {
    ui.receipt.className = 'ix-receipt ' + (kind === 'clean' ? 'is-clean' : 'is-saved');
    ui.receipt.textContent = '';
    var t = document.createElement('p');
    t.className = 'r-title';
    t.textContent = title;
    var ul = document.createElement('ul');
    items.forEach(function (it) {
      var li = document.createElement('li');
      var wrap = document.createElement('div');
      var b = document.createElement('b');
      b.textContent = it[0];
      wrap.appendChild(b);
      if (it[1]) {
        var s = document.createElement('span');
        s.textContent = (kind === 'saved' ? ': ' : '. ') + it[1];
        wrap.appendChild(s);
      }
      li.appendChild(wrap);
      ul.appendChild(li);
    });
    var n = document.createElement('p');
    n.className = 'r-note';
    n.textContent = note;
    ui.receipt.appendChild(t);
    ui.receipt.appendChild(ul);
    ui.receipt.appendChild(n);
    show(ui.receipt);
  }

  /* ---------- reset ---------- */

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function doReset() {
    clearTimers();
    busy = false;
    wiped = false;
    closeDialog(false);
    hide(ui.receipt);
    root.classList.remove('is-safelight');
    rows.forEach(function (row) {
      row.classList.remove('is-gone', 'is-striking', 'is-changed', 'is-written');
      var val = row.querySelector('.ix-val');
      if (val.hasAttribute('data-orig')) val.innerHTML = val.getAttribute('data-orig');
      flash(row, 'is-restored', 950);
    });
    textFields.forEach(function (f) {
      f.el.value = initial.text[f.key];
      f.el.placeholder = f.el.getAttribute('data-ph');
    });
    ui.date.value = initial.date;
    ui.time.value = initial.time;
    ui.kwInput.value = '';
    keywords = initial.keywords.slice();
    renderChips();
    lockInputs(false);
    ui.map.classList.remove('is-wiped');
    ui.mapCoord.textContent = mapCoordText;
    saved = clone(initial);
    update(false);
    say('Sample restored: ' + tagCount() + ' tags in the file.');
  }

  /* ---------- start ---------- */

  renderChips();
  update(false);
  say(tagCount() + ' tags in this file. Edit a field, or clear them all.');

  // One pulse of the map pin when the inspector first comes into view.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          root.classList.add('is-seen');
          io.disconnect();
        }
      });
    }, { threshold: 0.35 });
    io.observe(ui.map);
  }
})();
