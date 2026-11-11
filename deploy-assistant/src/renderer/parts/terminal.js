  // ==========================================================================================
  // A small terminal: every running job (deploys, Pi cards, Minecraft, Chocolatey, Ollama pulls)
  // shows its real output here as it happens, coloured, followed to the end unless you scroll up,
  // with copy, wrap, search and full-window views. It shows only real lines; the app's own step
  // markers are drawn as "ham ›" prompts so they never pass for commands that were not run.
  // ==========================================================================================
  var terms = {};
  var ANSI = { 30: 'k', 31: 'r', 32: 'g', 33: 'y', 34: 'b', 35: 'm', 36: 'c', 37: 'w', 90: 'k', 91: 'r', 92: 'g', 93: 'y', 94: 'b', 95: 'm', 96: 'c', 97: 'w' };
  function termLine(l) {
    var raw = String(l), cls = '';
    if (/^(ham ›|\$ |> )/.test(raw)) cls = 'cmd';
    else if (/\b(error|failed|fatal|exception|denied|refused|cannot|could not)\b/i.test(raw)) cls = 'err';
    else if (/\b(warn|warning)\b/i.test(raw)) cls = 'warn';
    else if (/(✓|\bdone\b|\bready\b|\bpulled\b|\bstarted\b|\bcreated\b|\bsuccess|Done \()/i.test(raw)) cls = 'ok';
    var html = '', open = false, re = /\u001b\[([\d;]*)m/g, last = 0, m;
    while ((m = re.exec(raw))) { html += esc(raw.slice(last, m.index)); last = re.lastIndex; if (open) { html += '</span>'; open = false; } var c = (m[1] || '0').split(';').map(Number).filter(function (n) { return ANSI[n]; })[0]; if (c) { html += '<span class="a-' + ANSI[c] + '">'; open = true; } }
    html += esc(raw.slice(last)) + (open ? '</span>' : '');
    html = html.replace(/^(ham ›)/, '<span class="prompt">$1</span>').replace(/^(\$|&gt;) /, '<span class="prompt">$1</span> ');
    return '<div class="tl-' + (cls || 'n') + '">' + (html || '&nbsp;') + '</div>';
  }
  function termHtml(id, title, lines, o) {
    o = o || {}; var t = terms[id] = terms[id] || { follow: true, wrap: true, q: '', big: false };
    var m = matcher(t.q), shown = lines.filter(function (l) { return m.test(String(l).replace(/\u001b\[[\d;]*m/g, '')); }).slice(-(o.max || 600));
    return '<div class="term' + (t.big ? ' big' : '') + (t.wrap ? '' : ' nowrap') + '" data-term="' + esc(id) + '" data-k="term-' + esc(id) + '"><div class="termbar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="termtitle mono ell">' + esc(title) + '</span>' +
      (o.running ? '<span class="termlive" aria-label="Running">●</span>' : '') +
      '<span class="grow"></span><input class="termfind" data-termq="' + esc(id) + '" value="' + esc(t.q) + '" placeholder="Filter" aria-label="Filter these lines (a pattern)">' +
      '<button class="tb" data-termdo="follow" aria-pressed="' + t.follow + '" title="Follow new lines">' + icon(t.follow ? 'ArrowCollapseDown' : 'Pause', 's') + '</button><button class="tb" data-termdo="wrap" aria-pressed="' + t.wrap + '" title="Wrap long lines">' + icon('WrapDisabled', 's') + '</button><button class="tb" data-termdo="copy" title="Copy every line">' + icon('ContentCopy', 's') + '</button><button class="tb" data-termdo="big" title="' + (t.big ? 'Back to its place' : 'Fill the window') + '">' + icon(t.big ? 'FullscreenExit' : 'Fullscreen', 's') + '</button></div>' +
      '<div class="termbody" tabindex="0" role="log" aria-live="off" aria-label="' + esc(title) + ', ' + lines.length + ' lines">' + (shown.length ? shown.map(termLine).join('') : '<div class="tl-n mu">' + esc(o.empty || 'Waiting for output…') + '</div>') + (o.running ? '<div class="tl-n"><span class="prompt">' + esc(o.prompt || '$') + '</span> <span class="caret"></span></div>' : '') + '</div>' +
      (o.input ? '<div class="terminput"><span class="prompt">' + esc(o.prompt || '>') + '</span><input class="mono" id="' + esc(o.input) + '" placeholder="' + esc(o.placeholder || '') + '" aria-label="' + esc(o.inputLabel || 'Command') + '" autocomplete="off" spellcheck="false"></div>' : '') + '</div>';
  }
  // Appends one line to a terminal on screen without redrawing the page.
  function termPush(id, line) {
    var el = document.querySelector('[data-term="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] .termbody'); if (!el) return false;
    var t = terms[id] || {}; if (!matcher(t.q || '').test(String(line))) return true;
    var caret = el.lastElementChild && el.lastElementChild.querySelector('.caret') ? el.lastElementChild : null;
    var div = document.createElement('div'); div.innerHTML = termLine(line); var node = div.firstChild;
    if (caret) el.insertBefore(node, caret); else el.appendChild(node);
    while (el.childElementCount > 800) el.removeChild(el.firstElementChild);
    if (t.follow !== false) el.scrollTop = el.scrollHeight;
    return true;
  }
  function termsFollow() { $$('[data-term]').forEach(function (b) { var t = terms[b.dataset.term] || {}; var body = b.querySelector('.termbody'); if (body && t.follow !== false) body.scrollTop = body.scrollHeight; }); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-termdo]'); if (!b) return;
    var box = b.closest('[data-term]'), id = box.dataset.term, t = terms[id] = terms[id] || { follow: true, wrap: true, q: '' }, d = b.dataset.termdo;
    if (d === 'copy') { copy(Array.prototype.map.call(box.querySelectorAll('.termbody > div'), function (x) { return x.textContent; }).join('\n')); return; }
    t[d] = !t[d]; render(); if (d === 'big' && t.big) { var bb = $('[data-term="' + id + '"] .termbody'); if (bb) bb.focus(); }
  });
  document.addEventListener('input', function (e) { var id = e.target.dataset && e.target.dataset.termq; if (id == null) return; (terms[id] = terms[id] || { follow: true, wrap: true }).q = e.target.value; render(); var f = document.querySelector('[data-termq="' + id + '"]'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } });
  document.addEventListener('scroll', function (e) { var body = e.target; if (!body.classList || !body.classList.contains('termbody')) return; var id = body.parentNode.dataset.term, t = terms[id]; if (!t) return; var atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 24; if (t.follow !== atEnd) { t.follow = atEnd; var btn = body.parentNode.querySelector('[data-termdo="follow"]'); if (btn) { btn.setAttribute('aria-pressed', atEnd); btn.innerHTML = icon(atEnd ? 'ArrowCollapseDown' : 'Pause', 's'); } } }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var big = Object.keys(terms).filter(function (k) { return terms[k].big; }); if (big.length) { big.forEach(function (k) { terms[k].big = false; }); render(); } } });

  // A page header shared by every tab: an icon tile, the title, one line, and a few live facts.
  function pageHead(ic, title, sub, facts, actions) {
    return '<header class="phead" id="top" data-k="phead"><span class="ptile" aria-hidden="true">' + icon(ic) + '</span><div class="col grow" style="gap:4px;min-width:0"><h1 class="hs">' + esc(title) + '</h1>' + (sub ? '<p class="bm mu">' + sub + '</p>' : '') + (facts && facts.length ? '<div class="pfacts">' + facts.map(function (f) { return '<span class="pfact"><b>' + esc(String(f[0])) + '</b><span>' + esc(f[1]) + '</span></span>'; }).join('') + '</div>' : '') + '</div>' + (actions || '') + '</header>';
  }

