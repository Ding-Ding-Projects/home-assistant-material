  // ==========================================================================================
  // Accommodations, narrator, scheduled settings, logo, exports, bulk actions, record history,
  // clear buttons, the live chart and the dim sum surprise. Built into app.js by build-renderer.js.
  // ==========================================================================================

  // ---------- ADHD modes: off by default, independent, interface accommodations only ----------
  var ADHD = [
    ['focus', 'Focus', 'Brings the part you are working in forward and pushes the rest back.'],
    ['time', 'Time awareness', 'Shows the clock and how long this window has been open, and how long each deploy has taken.'],
    ['one', 'One thing at a time', 'Keeps one next step, written by you, in view under the tabs until you mark it done.'],
    ['momentum', 'Momentum', 'A gentle note when something has waited a while, and a count of what you finished today.']
  ];
  var opened = Date.now();
  function adhd(k) { return !!(st.adhd || {})[k]; }
  function adhdBar() {
    var out = '';
    if (adhd('time')) out += '<span class="tag" data-k="clock" id="clock">' + icon('ClockOutline', 's') + clockText() + '</span>';
    if (adhd('one')) out += st.nextStep ? '<span class="tag p" data-k="nextstep">' + icon('ArrowRightBold', 's') + 'Next: ' + esc(st.nextStep) + ' <button class="btn text sm" data-act="nextdone" style="min-height:28px">Done</button></span>' : '<button class="btn text sm" data-act="nextset">' + icon('ArrowRightBold', 's') + 'Choose your next step</button>';
    if (adhd('momentum') && (st.doneToday || {}).day === new Date().toDateString() && st.doneToday.n) out += '<span class="tag g">' + icon('Check', 's') + st.doneToday.n + ' done today</span>';
    return out ? '<div class="adhdbar" role="status">' + out + '</div>' : '';
  }
  function clockText() { var m = Math.floor((Date.now() - opened) / 60000); return new Date().toLocaleTimeString(st.lang === 'yue' ? 'zh-HK' : undefined, { hour: '2-digit', minute: '2-digit' }) + ' · open ' + (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'); }
  function finishedOne() { var d = new Date().toDateString(); st.doneToday = st.doneToday && st.doneToday.day === d ? st.doneToday : { day: d, n: 0 }; st.doneToday.n++; save(); }
  var nudged = {};
  function momentum() {
    if (!adhd('momentum')) return;
    D.instances.forEach(function (i) {
      if ((i.state === 'failed' || i.state === 'stopped') && !nudged[i.id]) { nudged[i.id] = 1; toast(i.name + ' has been ' + w(i.state).toLowerCase() + ' for a while. Start it, look at its logs, or leave it; all fine.', { emoji: '🌱' }); }
    });
  }
  setInterval(function () { var c = $('#clock'); if (c) c.innerHTML = icon('ClockOutline', 's') + clockText(); }, 30000);
  setInterval(momentum, 10 * 60000);

  // ---------- Narrator: speaks app events, off by default, one line at a time ----------
  var nq = [], nbusy = false, nlast = {};
  function voicesFor(lang) { return ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(function (v) { return lang === 'yue' ? /^(yue|zh-HK)/i.test(v.lang) : /^en/i.test(v.lang); }); }
  function narrate(cat, en, yue, urgent) {
    var n = st.narrator || {}; if (!n.on || st.lowStim || !('speechSynthesis' in window)) return;
    if (!urgent && nlast[cat] && Date.now() - nlast[cat] < 20000) return;
    nlast[cat] = Date.now();
    var lines = n.lang === 'yue' && !st.school ? [['yue', yue]] : n.lang === 'both' && !st.school ? [['en', en], ['yue', yue]] : [['en', en]];
    nq = nq.filter(function (x) { return x.cat !== cat; });
    lines.forEach(function (l) { nq.push({ cat: cat, lang: l[0], text: l[1] }); });
    nnext();
  }
  function nnext() {
    if (nbusy || !nq.length) return; var x = nq.shift(), n = st.narrator || {}; nbusy = true;
    var u = new SpeechSynthesisUtterance(x.text); var id = x.lang === 'yue' ? n.voiceYue : n.voiceEn;
    var v = voicesFor(x.lang).filter(function (y) { return y.voiceURI === id; })[0]; if (v) u.voice = v; u.lang = x.lang === 'yue' ? 'zh-HK' : 'en';
    u.rate = Math.max(0.5, Math.min(2, n.rate || 1)); u.pitch = Math.max(0, Math.min(2, n.pitch == null ? 1 : n.pitch)); u.volume = Math.max(0, Math.min(1, (st.volume || 40) / 40));
    u.onend = u.onerror = function () { nbusy = false; nnext(); };
    speechSynthesis.speak(u);
  }
  function voiceStatus(lang) {
    var n = st.narrator || {}, id = lang === 'yue' ? n.voiceYue : n.voiceEn, list = voicesFor(lang);
    if (!('speechSynthesis' in window)) return 'This computer has no speech synthesis.';
    if (!list.length) return 'No voice on this computer reads ' + (lang === 'yue' ? 'Cantonese' : 'English') + ' yet. The list fills in when the system finishes loading voices.';
    if (!id) return 'Chosen automatically: ' + list[0].name + (list[0].localService ? '' : ' (needs the internet)') + '.';
    var v = list.filter(function (x) { return x.voiceURI === id; })[0];
    return v ? 'Speaking with ' + v.name + (v.localService ? '' : '. It needs the internet and goes quiet offline') + '.' : 'The chosen voice is not installed on this computer; the narrator uses ' + list[0].name + ' until it is. Your choice is kept.';
  }
  function voicePicker(lang) {
    var n = st.narrator || {}, id = lang === 'yue' ? n.voiceYue : n.voiceEn;
    return '<select class="select" data-nvoice="' + lang + '" aria-label="' + (lang === 'yue' ? 'Cantonese' : 'English') + ' narrator voice"><option value="">Choose automatically</option>' + voicesFor(lang).map(function (v) { return '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === id ? ' selected' : '') + '>' + esc(v.name) + ' (' + esc(v.lang) + ')</option>'; }).join('') + '</select>';
  }

  // ---------- Scheduled settings: rules by day and time, or by a Home Assistant switch ----------
  var SCHED_KEYS = [['theme', 'Theme', [['light', 'Light'], ['dark', 'Dark']]], ['lang', 'Language', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']]], ['density', 'Density', [['comfortable', 'Comfortable'], ['compact', 'Compact']]], ['reduceMotion', 'Reduce motion', [['true', 'On'], ['false', 'Off']]], ['seed', 'Main colour', null]];
  var haStates = {}, overlay = {}, base = {};
  function ruleMatches(r, now) {
    if (!r.on) return false;
    var day = now.toISOString ? now : new Date(now); var ymd = day.getFullYear() + '-' + ('0' + (day.getMonth() + 1)).slice(-2) + '-' + ('0' + day.getDate()).slice(-2);
    if (r.startDate && ymd < r.startDate) return false; if (r.endDate && ymd > r.endDate) return false;
    if (r.source === 'ha') return haStates[r.id] === 'on';
    if (r.days && r.days.length && r.days.indexOf(day.getDay()) < 0) return false;
    var m = day.getHours() * 60 + day.getMinutes(), hm = function (s) { var p = String(s || '0:0').split(':'); return +p[0] * 60 + +p[1]; }, f = hm(r.from), t = hm(r.to);
    return f === t ? true : f < t ? m >= f && m < t : m >= f || m < t;
  }
  // Later rules in the list win. The base settings are what is saved; overrides live only in memory.
  function runRules() {
    var now = new Date(), want = {};
    (st.rules || []).forEach(function (r) { if (ruleMatches(r, now)) Object.keys(r.set || {}).forEach(function (k) { want[k] = r.set[k]; }); });
    Object.keys(overlay).forEach(function (k) { if (!(k in want)) { if (st[k] === overlay[k]) st[k] = base[k]; delete overlay[k]; delete base[k]; } });
    Object.keys(want).forEach(function (k) { var v = want[k] === 'true' ? true : want[k] === 'false' ? false : want[k]; if (!(k in overlay)) base[k] = st[k]; overlay[k] = v; st[k] = v; });
    apply();
  }
  // A setting you change while a rule holds it becomes your new base value.
  window.HAM_BASE = function () { Object.keys(overlay).forEach(function (k) { if (st[k] !== overlay[k]) { delete overlay[k]; delete base[k]; } }); return base; };
  async function pollHa() {
    var rs = (st.rules || []).filter(function (r) { return r.on && r.source === 'ha' && r.entity; }); if (!rs.length || DEMO) return;
    for (var i = 0; i < rs.length; i++) { var r = rs[i]; try { haStates[r.id] = await API.haState(r.entity); r.err = ''; } catch (e) { if (r.err !== e.message) toast('Rule ' + (r.label || r.entity) + ': ' + e.message + ' The base settings stay as they are.'); r.err = e.message; haStates[r.id] = null; } }
    runRules();
  }
  setInterval(runRules, 30000); setInterval(pollHa, 60000);
  function ruleDialog(r) {
    var isNew = !r; r = r ? JSON.parse(JSON.stringify(r)) : { id: 'r' + Date.now().toString(36), label: '', on: true, source: 'time', days: [], from: '20:00', to: '07:00', startDate: '', endDate: '', entity: '', set: { theme: 'dark' } };
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function draw() {
      dialog(isNew ? 'New schedule rule' : 'Edit ' + (r.label || 'rule'),
        '<label class="col" style="gap:4px"><span class="ll">Name</span><input class="input" id="rl-label" value="' + esc(r.label) + '" placeholder="Evenings" maxlength="60"></label>' +
        '<div class="seg" role="group" aria-label="When it applies"><button class="' + (r.source === 'time' ? 'sel' : '') + '" data-rsrc="time" aria-pressed="' + (r.source === 'time') + '">Days and times</button><button class="' + (r.source === 'ha' ? 'sel' : '') + '" data-rsrc="ha" aria-pressed="' + (r.source === 'ha') + '">A Home Assistant switch</button></div>' +
        (r.source === 'time' ? '<div class="grid2"><label class="col" style="gap:4px"><span class="ll">From</span><input class="input" type="time" id="rl-from" value="' + esc(r.from) + '"></label><label class="col" style="gap:4px"><span class="ll">To</span><input class="input" type="time" id="rl-to" value="' + esc(r.to) + '"></label></div>' +
          '<div class="chipline" role="group" aria-label="Days"><button class="chip' + (!r.days.length ? ' sel' : '') + '" data-rday="all" aria-pressed="' + !r.days.length + '">Every day</button>' + DAYS.map(function (d, i) { var on = r.days.indexOf(i) >= 0; return '<button class="chip' + (on ? ' sel' : '') + '" data-rday="' + i + '" aria-pressed="' + on + '">' + d + '</button>'; }).join('') + '</div>' +
          '<p class="bs mu">Times are in this computer\'s time zone (' + esc(Intl.DateTimeFormat().resolvedOptions().timeZone) + ') and follow daylight saving. A window that ends before it starts runs past midnight; equal times mean all day.</p>'
          : '<label class="col" style="gap:4px"><span class="ll">Entity</span><input class="input mono" id="rl-entity" value="' + esc(r.entity) + '" placeholder="input_boolean.evening"></label><p class="bs mu">When the entity is on, this rule applies; off leaves your base settings. It is read every minute through the connection set in Settings, Schedule.</p>') +
        '<div class="grid2"><label class="col" style="gap:4px"><span class="ll">Starts on (optional)</span><input class="input" type="date" id="rl-sd" value="' + esc(r.startDate) + '"></label><label class="col" style="gap:4px"><span class="ll">Ends on (optional)</span><input class="input" type="date" id="rl-ed" value="' + esc(r.endDate) + '"></label></div>' +
        '<h3 class="tm">What it sets</h3>' + SCHED_KEYS.map(function (k) { var v = r.set[k[0]]; return '<div class="setting"><span class="ll">' + k[1] + '</span><div class="ctl">' + (k[2] ? '<select class="select" data-rset="' + k[0] + '" aria-label="' + k[1] + '"><option value="">Leave as it is</option>' + k[2].map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' : '<label class="row bm" style="gap:8px"><input type="checkbox" data-rsetuse="' + k[0] + '"' + (v ? ' checked' : '') + '> Set</label><input type="color" data-rset="' + k[0] + '" value="' + (v || '#00639B') + '" aria-label="' + k[1] + '" style="width:48px;height:40px;border:0;background:none">') + '</div></div>'; }).join('') +
        '<span class="field-err" id="rl-err" role="alert"></span><div class="row" style="gap:8px">' + (isNew ? '' : '<button class="btn text" id="rl-del">' + icon('DeleteOutline', 's') + 'Delete</button>') + '<span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="rl-save">Save</button></div>', { emoji: '🗓️' });
      var ov = $('#ov');
      var keep = function () { var g = function (id) { var e = $('#' + id); return e ? e.value : undefined; }; if (g('rl-label') != null) r.label = g('rl-label').trim(); if (g('rl-from')) r.from = g('rl-from'); if (g('rl-to')) r.to = g('rl-to'); if (g('rl-entity') != null) r.entity = g('rl-entity').trim(); r.startDate = g('rl-sd') || ''; r.endDate = g('rl-ed') || ''; $$('[data-rset]', ov).forEach(function (e) { var k = e.dataset.rset; if (e.type === 'color') { var use = $('[data-rsetuse="' + k + '"]', ov); if (use && use.checked) r.set[k] = e.value; else delete r.set[k]; } else if (e.value) r.set[k] = e.value; else delete r.set[k]; }); };
      ov.addEventListener('click', function (e) {
        var b = e.target.closest('[data-rsrc]'); if (b) { keep(); r.source = b.dataset.rsrc; draw(); return; }
        b = e.target.closest('[data-rday]'); if (b) { keep(); if (b.dataset.rday === 'all') r.days = []; else { var d = +b.dataset.rday, i = r.days.indexOf(d); if (i >= 0) r.days.splice(i, 1); else r.days.push(d); } draw(); return; }
      });
      $('#rl-save').onclick = function () {
        keep();
        if (!r.label) { $('#rl-err').textContent = 'Give the rule a name, so you can find it later.'; $('#rl-label').focus(); return; }
        if (r.source === 'ha' && !/^(binary_sensor|input_boolean)\.[a-z0-9_]{1,80}$/.test(r.entity)) { $('#rl-err').textContent = 'The entity must be a binary_sensor or input_boolean, such as input_boolean.evening.'; return; }
        if (r.startDate && r.endDate && r.endDate < r.startDate) { $('#rl-err').textContent = 'The end date is before the start date.'; return; }
        if (!Object.keys(r.set).length) { $('#rl-err').textContent = 'Choose at least one thing the rule sets.'; return; }
        var list = (st.rules || []).slice(), i = list.map(function (x) { return x.id; }).indexOf(r.id); if (i >= 0) list[i] = r; else list.push(r);
        setVal('rules', list, (isNew ? 'Schedule rule added: ' : 'Schedule rule changed: ') + r.label); closeDialog(); runRules(); pollHa(); render();
      };
      if ($('#rl-del')) $('#rl-del').onclick = function () { setVal('rules', (st.rules || []).filter(function (x) { return x.id !== r.id; }), 'Schedule rule deleted: ' + r.label); closeDialog(); runRules(); render(); };
    }
    draw();
  }
  function rulesList() {
    var rs = st.rules || [];
    return (rs.length ? rs.map(function (r, i) { var on = ruleMatches(r, new Date()); return '<div class="row-item" data-k="rule-' + r.id + '"><span class="col grow"><span class="ll">' + (i + 1) + '. ' + esc(r.label) + ' ' + (on ? '<span class="tag g">In effect</span>' : '') + (r.err ? '<span class="tag a">' + esc(r.err) + '</span>' : '') + '</span><span class="bs mu">' + (r.source === 'ha' ? 'When ' + esc(r.entity) + ' is on' : (r.days.length ? r.days.map(function (d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]; }).join(', ') : 'Every day') + ', ' + esc(r.from) + ' to ' + esc(r.to)) + (r.startDate || r.endDate ? ', ' + esc(r.startDate || '…') + ' to ' + esc(r.endDate || '…') : '') + ' · sets ' + esc(Object.keys(r.set).join(', ')) + '</span></span>' + sw2r(r) + '<button class="btn text sm" data-rule="' + r.id + '">Edit</button></div>'; }).join('') : '<p class="bm mu">No rules yet. A rule changes the theme, language, density, motion or colour for a time window or while a Home Assistant switch is on, then puts your own settings back.</p>') +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn tonal sm" data-act="ruleadd">' + icon('Plus', 's') + 'Add a rule</button><span class="bs mu">Later rules win when two apply at once.</span></div>';
  }
  function sw2r(r) { return '<button class="sw' + (r.on ? ' on' : '') + '" role="switch" aria-checked="' + !!r.on + '" aria-label="Rule ' + esc(r.label) + ' on" data-ruleon="' + r.id + '"><i></i></button>'; }
  async function haDialog() {
    var info = DEMO ? { base: '', saved: false } : await API.haInfo();
    dialog('Home Assistant connection', '<p class="bm mu">Used only by schedule rules that follow a Home Assistant switch. The token is a long-lived access token from your Home Assistant profile; it is kept encrypted with your system keychain and never shown again.</p><label class="col" style="gap:4px"><span class="ll">Address</span><input class="input mono" id="ha-base" value="' + esc(info.base) + '" placeholder="https://homeassistant.local:8123"></label><label class="col" style="gap:4px"><span class="ll">Token</span><input class="input" type="password" id="ha-tok" value="' + (info.saved ? '(saved)' : '') + '" autocomplete="off"></label><span class="field-err" id="ha-err" role="alert"></span><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="ha-save">Save</button></div>', { emoji: '🏠' });
    $('#ha-save').onclick = async function () { if (DEMO) { closeDialog(); toast('In the app this saves the connection.'); return; } try { await API.haSave({ base: $('#ha-base').value.trim(), token: $('#ha-tok').value }); closeDialog(); toast(msg('saved')); pollHa(); } catch (e) { $('#ha-err').textContent = e.message; } };
  }

  // ---------- Logo: presets, or your own picture made into the mark (all on this computer) ----------
  var LOGOS = [['RocketLaunch', 'Rocket'], ['HomeAutomation', 'House'], ['ServerNetwork', 'Server'], ['Chip', 'Board'], ['Docker', 'Whale']];
  function logoMark() { var l = st.logo || {}; return l.image ? '<img src="' + esc(l.image) + '" alt="" width="24" height="24" style="width:24px;height:24px;border-radius:inherit;object-fit:cover">' : icon(l.preset || 'RocketLaunch', 's'); }
  function logoDialog() {
    var l = st.logo || {}, src = null, opt = { fit: 'cover', zoom: 100, x: 50, y: 50, bg: '#ffffff' };
    function draw() {
      dialog('Logo', '<div class="chipline" role="group" aria-label="Preset logos">' + LOGOS.map(function (p) { return '<button class="chip' + (!l.image && (l.preset || 'RocketLaunch') === p[0] ? ' sel' : '') + '" data-logop="' + p[0] + '">' + icon(p[0], 's') + p[1] + '</button>'; }).join('') + '</div>' +
        '<label class="btn tonal sm" style="align-self:flex-start">' + icon('Upload', 's') + 'Your own picture<input type="file" id="logofile" accept="image/png,image/jpeg,image/webp" hidden></label><span class="bs mu" id="logostat">PNG, JPEG or WebP, up to 4 MB. It stays on this computer and is made into a small square mark.</span>' +
        '<div id="logoedit" ' + (src ? '' : 'hidden') + '><div class="row" style="gap:16px;flex-wrap:wrap;align-items:flex-start"><canvas id="logoprev" width="128" height="128" style="width:128px;height:128px;border-radius:28px;box-shadow:0 0 0 1px var(--outv)" aria-label="Preview of the logo"></canvas><div class="col grow" style="gap:8px">' +
        '<div class="seg" role="group" aria-label="Fit">' + [['cover', 'Fill'], ['contain', 'Fit inside']].map(function (f) { return '<button data-logofit="' + f[0] + '" class="' + (opt.fit === f[0] ? 'sel' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        [['zoom', 'Zoom', 50, 300], ['x', 'Across', 0, 100], ['y', 'Down', 0, 100]].map(function (r) { return '<label class="row bm" style="gap:8px"><span style="min-width:64px">' + r[1] + '</span><input type="range" data-logor="' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" value="' + opt[r[0]] + '" aria-label="' + r[1] + '"><input class="input" style="width:80px" type="number" data-logon="' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" value="' + opt[r[0]] + '" aria-label="' + r[1] + ', number"></label>'; }).join('') +
        '<label class="row bm" style="gap:8px">Background <input type="color" id="logobg" value="' + opt.bg + '" aria-label="Background colour"></label></div></div></div>' +
        '<div class="row" style="gap:8px"><button class="btn text" id="logoreset">' + L('reset') + '</button><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="logook">Use it</button></div>', { emoji: '🎨' });
      var ov = $('#ov');
      ov.addEventListener('click', function (e) { var b = e.target.closest('[data-logop]'); if (b) { setVal('logo', Object.assign({}, st.logo, { preset: b.dataset.logop, image: '' }), 'Logo'); l = st.logo; src = null; shell(); render(); draw(); } b = e.target.closest('[data-logofit]'); if (b) { opt.fit = b.dataset.logofit; draw(); paint(); } });
      ov.addEventListener('input', function (e) { var t = e.target; if (t.dataset.logor || t.dataset.logon) { var k = t.dataset.logor || t.dataset.logon; opt[k] = Math.max(+t.min, Math.min(+t.max, +t.value || 0)); $$('[data-logor="' + k + '"],[data-logon="' + k + '"]', ov).forEach(function (x) { if (x !== t) x.value = opt[k]; }); paint(); } if (t.id === 'logobg') { opt.bg = t.value; paint(); } });
      $('#logofile').onchange = function () { readLogo(this.files[0]); };
      $('#logoreset').onclick = function () { setVal('logo', JSON.parse(JSON.stringify(DEF.logo)), 'Logo reset'); closeDialog(); shell(); render(); };
      $('#logook').onclick = function () { if (src) { var c = $('#logoprev'); setVal('logo', Object.assign({}, st.logo, { image: c.toDataURL('image/png') }), 'Logo: your own picture'); } closeDialog(); shell(); render(); };
      if (src) paint();
    }
    function readLogo(f) {
      var stt = $('#logostat'); if (!f) return; if (f.size > 4 * 1024 * 1024) { stt.textContent = 'That picture is larger than 4 MB. Nothing changed.'; return; }
      var fr = new FileReader(); fr.onload = function () {
        var b = new Uint8Array(fr.result), hex = Array.prototype.map.call(b.slice(0, 12), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        var kind = /^89504e47/.test(hex) ? 'image/png' : /^ffd8ff/.test(hex) ? 'image/jpeg' : /^52494646.{8}57454250/.test(hex) ? 'image/webp' : '';
        if (!kind) { stt.textContent = 'That file is not a PNG, JPEG or WebP picture, whatever its name says. Nothing changed.'; return; }
        var img = new Image(), url = URL.createObjectURL(new Blob([b], { type: kind }));
        img.onload = function () { URL.revokeObjectURL(url); if (img.naturalWidth > 8000 || img.naturalHeight > 8000) { stt.textContent = 'That picture is larger than 8000 pixels on a side. Nothing changed.'; return; } src = img; draw(); };
        img.onerror = function () { URL.revokeObjectURL(url); stt.textContent = 'That picture could not be opened. Nothing changed.'; };
        img.src = url;
      }; fr.readAsArrayBuffer(f);
    }
    function paint() {
      var c = $('#logoprev'); if (!c || !src) return; var x = c.getContext('2d'); x.fillStyle = opt.bg; x.fillRect(0, 0, 128, 128);
      var s = (opt.fit === 'cover' ? Math.max(128 / src.naturalWidth, 128 / src.naturalHeight) : Math.min(128 / src.naturalWidth, 128 / src.naturalHeight)) * opt.zoom / 100;
      var w2 = src.naturalWidth * s, h2 = src.naturalHeight * s; x.drawImage(src, (128 - w2) * opt.x / 100, (128 - h2) * opt.y / 100, w2, h2);
    }
    draw();
  }

  // ---------- Export in every text format, saved or opened in VS Code ----------
  var FORMATS = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'md', 'html', 'sql', 'txt'];
  function flat(v) { return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  function fmtRows(rows, f, name) {
    var ks = Object.keys(rows[0] || {}), q2 = function (s) { return JSON.stringify(s); };
    if (f === 'json') return JSON.stringify(rows, null, 2);
    if (f === 'jsonl') return rows.map(function (r) { return JSON.stringify(r); }).join('\n');
    if (f === 'yaml') return rows.map(function (r) { return ks.map(function (k, i) { return (i ? '  ' : '- ') + k + ': ' + q2(flat(r[k])); }).join('\n'); }).join('\n') || '[]';
    if (f === 'toml') return rows.map(function (r) { return '[[' + name + ']]\n' + ks.map(function (k) { return k.replace(/[^\w-]/g, '_') + ' = ' + q2(flat(r[k])); }).join('\n'); }).join('\n\n');
    if (f === 'xml') { var x = function (s) { return flat(s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }; return '<?xml version="1.0" encoding="UTF-8"?>\n<' + name + '>\n' + rows.map(function (r) { return '  <item>' + ks.map(function (k) { var t = k.replace(/[^\w-]/g, '_'); return '<' + t + '>' + x(r[k]) + '</' + t + '>'; }).join('') + '</item>'; }).join('\n') + '\n</' + name + '>'; }
    if (f === 'csv') return rows2csv(rows.map(function (r) { var o = {}; ks.forEach(function (k) { o[k] = flat(r[k]); }); return o; }));
    if (f === 'tsv') return [ks.join('\t')].concat(rows.map(function (r) { return ks.map(function (k) { return flat(r[k]).replace(/[\t\n]/g, ' '); }).join('\t'); })).join('\n');
    if (f === 'md') return rows2md(rows.map(function (r) { var o = {}; ks.forEach(function (k) { o[k] = flat(r[k]); }); return o; }));
    if (f === 'html') return '<!DOCTYPE html>\n<meta charset="utf-8"><title>' + esc(name) + '</title>\n<table>\n<tr>' + ks.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr>\n' + rows.map(function (r) { return '<tr>' + ks.map(function (k) { return '<td>' + esc(flat(r[k])) + '</td>'; }).join('') + '</tr>'; }).join('\n') + '\n</table>';
    if (f === 'sql') return 'CREATE TABLE ' + name + ' (' + ks.map(function (k) { return '"' + k + '" TEXT'; }).join(', ') + ');\n' + rows.map(function (r) { return 'INSERT INTO ' + name + ' VALUES (' + ks.map(function (k) { return "'" + flat(r[k]).replace(/'/g, "''") + "'"; }).join(', ') + ');'; }).join('\n');
    return rows.map(function (r) { return ks.map(function (k) { return k + ': ' + flat(r[k]); }).join('; '); }).join('\n');
  }
  function exportDialog(title, name, rows) {
    var f = 'json', stamp = new Date().toISOString().slice(0, 10);
    function draw() {
      dialog(title, '<p class="bm mu">' + rows.length + ' rows. Passwords, keys and your wording file are never included.</p><div class="chipline" role="group" aria-label="Format">' + FORMATS.map(function (x) { return '<button class="chip' + (x === f ? ' sel' : '') + '" data-xf="' + x + '" aria-pressed="' + (x === f) + '">' + x.toUpperCase() + '</button>'; }).join('') + '</div><pre class="wb-test" style="max-height:220px;overflow:auto" tabindex="0">' + esc(fmtRows(rows.slice(0, 5), f, name)) + (rows.length > 5 ? '\n…' : '') + '</pre>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap"><span class="grow"></span><button class="btn text" id="xcopy">' + icon('ContentCopy', 's') + L('copy') + '</button><button class="btn tonal" id="xcode">' + icon('CodeBraces', 's') + 'Open in VS Code</button><button class="btn text" id="xzip">' + icon('FolderZipOutline', 's') + 'ZIP of every format</button><button class="btn fill" id="xsave">' + icon('Export', 's') + 'Save</button></div>', { emoji: '📦' });
      $('#ov').addEventListener('click', function (e) { var b = e.target.closest('[data-xf]'); if (b) { f = b.dataset.xf; draw(); } });
      var text = function () { return fmtRows(rows, f, name); }, file = name + '-' + stamp + '.' + f;
      $('#xcopy').onclick = function () { copy(text()); };
      $('#xsave').onclick = function () { saveText(file, text()); closeDialog(); };
      $('#xzip').onclick = function () { zipAll(name, rows); closeDialog(); };
      $('#xcode').onclick = function () { if (DEMO) { toast('In the app this opens ' + file + ' in VS Code.'); return; } API.exportOpen(file, text()).then(function (r) { toast(r); closeDialog(); }, function (er) { toast(er.message); }); };
    }
    draw();
  }

  // ---------- Record history: every change to instances, hosts and the schedule ----------
  var hview = { action: 'all', from: '', to: '', sel: {} };
  async function historyPanel() {
    var list = []; try { list = await API.history(); } catch (e) { toast(e.message); }
    var draw = function () {
      var acts = []; list.forEach(function (r) { if (acts.indexOf(r.action) < 0) acts.push(r.action); });
      var m = matcher(q.rhist), rows = list.slice().reverse().filter(function (r) { var d = r.at.slice(0, 10); return (hview.action === 'all' || r.action === hview.action) && (!hview.from || d >= hview.from) && (!hview.to || d <= hview.to) && m.test(r.action + ' ' + r.text); });
      var box = $('#rhist'); if (!box) return;
      box.innerHTML = '<div class="toolbar">' + findField('rhsearch', 'Search the record history', q.rhist) + '<select class="select" data-rhact aria-label="Filter by action"><option value="all">Every action</option>' + acts.map(function (a) { return '<option' + (a === hview.action ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select><label class="row bs" style="gap:6px">From <input class="input" type="date" data-rhfrom value="' + esc(hview.from) + '"></label><label class="row bs" style="gap:6px">To <input class="input" type="date" data-rhto value="' + esc(hview.to) + '"></label><button class="btn text sm" data-act="rhexport">' + icon('Export', 's') + L('export') + '</button></div>' +
        '<p class="bs mu" aria-live="polite">' + rows.length + ' of ' + list.length + ' revisions</p>' + (rows.length ? rows.slice(0, 200).map(function (r) { return '<div class="row-item" data-k="rev-' + r.rev + '"><span class="tag">' + esc(r.action) + '</span><span class="col grow"><span class="ll">' + esc(r.text || r.action) + '</span><span class="bs mu">Revision ' + r.rev + ' · ' + esc(when(r.at)) + ' · ' + r.records.instances.length + ' instances, ' + r.records.hosts.length + ' hosts</span></span><button class="btn text sm" data-restorerev="' + r.rev + '">Restore</button></div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>');
      box.dataset.list = '1';
    };
    historyPanel.draw = draw; historyPanel.list = function () { return list; }; draw();
  }

  // ---------- Clear buttons on every editable text box ----------
  function clearables(root) {
    $$('input[type=text],input[type=search],input[type=password],input[type=url],input:not([type]),textarea', root || $('#app')).forEach(function (inp) {
      if (inp.dataset.clr || inp.readOnly || inp.disabled || inp.closest('.clrwrap')) return; inp.dataset.clr = '1';
      var w2 = document.createElement('span'); w2.className = 'clrwrap' + (inp.tagName === 'TEXTAREA' ? ' ta' : ''); inp.parentNode.insertBefore(w2, inp); w2.appendChild(inp);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'clr'; b.tabIndex = 0; b.setAttribute('aria-label', 'Clear ' + (inp.getAttribute('aria-label') || inp.placeholder || 'this field')); b.innerHTML = icon('CloseCircle', 's');
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.focus(); });
      w2.appendChild(b);
    });
  }
  new MutationObserver(function () { clearables(document.body); }).observe(document.body, { childList: true, subtree: true });

  // ---------- Live chart (Liveline style): one smooth line, a live dot, crosshair by mouse or keys ----------
  var lc = { id: '', shown: [], hover: -1, raf: 0 };
  function liveChart() {
    var list = D.instances.filter(function (i) { return i.state === 'running'; });
    if (!lc.id || !list.some(function (i) { return i.id === lc.id; })) lc.id = (list[0] || {}).id || '';
    return '<div class="lchart card" data-k="livechart" style="padding:16px"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="ll grow">Processor use, live</span><select class="select" data-lcinst aria-label="Instance for the live chart">' + (list.length ? list.map(function (i) { return '<option value="' + i.id + '"' + (i.id === lc.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') : '<option>No running instance</option>') + '</select><span class="lcbadge" id="lcbadge">–</span></div>' +
      '<canvas id="lc" height="140" tabindex="0" role="img" aria-label="Processor use of the chosen instance over the last five minutes. Arrow keys move the crosshair." style="width:100%;height:140px;display:block;margin-top:8px"></canvas><span class="bs mu" id="lcsum" aria-live="polite"></span></div>';
  }
  function lcFrame() {
    cancelAnimationFrame(lc.raf); var c = $('#lc'); if (!c) return;
    var pts = (stats[lc.id] || []).slice(-60), dpr = devicePixelRatio || 1, W2 = c.clientWidth * dpr, H = 140 * dpr; if (c.width !== W2) c.width = W2; c.height = H;
    if (lc.shown.length !== pts.length) lc.shown = pts.slice();
    var calm = st.reduceMotion || st.lowStim || matchMedia('(prefers-reduced-motion: reduce)').matches;
    lc.shown = lc.shown.map(function (v, i) { return calm ? pts[i] : v + (pts[i] - v) * 0.08; });
    var x = c.getContext('2d'), cs = getComputedStyle($('#app')), col = cs.getPropertyValue('--p').trim() || '#00639B';
    x.clearRect(0, 0, W2, H); var max = Math.max(5, Math.max.apply(null, pts.concat([0])) * 1.2), span = Math.max(1, Math.min(59, pts.length - 1)), step = W2 / span;
    x.strokeStyle = cs.getPropertyValue('--outv'); x.lineWidth = 1; for (var g = 1; g < 4; g++) { x.beginPath(); x.moveTo(0, H * g / 4); x.lineTo(W2, H * g / 4); x.stroke(); }
    if (!pts.length) { x.fillStyle = cs.getPropertyValue('--onv'); x.font = 13 * dpr + 'px sans-serif'; x.fillText(lc.id ? 'Waiting for the first reading…' : 'Start an instance to see it here.', 12 * dpr, H / 2); lc.raf = requestAnimationFrame(lcFrame); return; }
    var X = function (i) { return W2 - (lc.shown.length - 1 - i) * step; }, Y = function (v) { return H - 8 * dpr - (v / max) * (H - 24 * dpr); };
    var grad = x.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, col + '55'); grad.addColorStop(1, col + '00');
    x.beginPath(); lc.shown.forEach(function (v, i) { if (i) x.lineTo(X(i), Y(v)); else x.moveTo(X(i), Y(v)); }); x.lineTo(X(lc.shown.length - 1), H); x.lineTo(X(0), H); x.closePath(); x.fillStyle = grad; x.fill();
    x.beginPath(); lc.shown.forEach(function (v, i) { if (i) x.lineTo(X(i), Y(v)); else x.moveTo(X(i), Y(v)); }); x.strokeStyle = col; x.lineWidth = 2.5 * dpr; x.lineJoin = 'round'; x.stroke();
    var last = lc.shown[lc.shown.length - 1], pulse = calm ? 0 : (Math.sin(Date.now() / 300) + 1) * 3 * dpr;
    x.fillStyle = col + '44'; x.beginPath(); x.arc(X(lc.shown.length - 1), Y(last), 6 * dpr + pulse, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(X(lc.shown.length - 1), Y(last), 4 * dpr, 0, 7); x.fill();
    var trend = pts.length > 3 ? pts[pts.length - 1] - pts[pts.length - 4] : 0; var b = $('#lcbadge'); if (b) b.textContent = pts[pts.length - 1].toFixed(1) + '% ' + (trend > 0.5 ? '↑' : trend < -0.5 ? '↓' : '→');
    if (lc.hover >= 0) { var i = Math.max(0, Math.min(pts.length - 1, lc.hover)); x.strokeStyle = cs.getPropertyValue('--out'); x.lineWidth = 1; x.beginPath(); x.moveTo(X(i), 0); x.lineTo(X(i), H); x.stroke(); var s2 = $('#lcsum'); if (s2) s2.textContent = pts[i].toFixed(1) + '% processor use, ' + ((pts.length - 1 - i) * 5) + ' seconds ago'; }
    else { var s3 = $('#lcsum'); if (s3) s3.textContent = 'Now ' + pts[pts.length - 1].toFixed(1) + '%, ' + (trend > 0.5 ? 'rising' : trend < -0.5 ? 'falling' : 'steady') + '.'; }
    lc.raf = requestAnimationFrame(lcFrame);
  }
  document.addEventListener('pointermove', function (e) { var c = e.target.id === 'lc' ? e.target : null; if (!c) { if (lc.hover >= 0 && document.activeElement.id !== 'lc') lc.hover = -1; return; } var r = c.getBoundingClientRect(), n = (stats[lc.id] || []).slice(-60).length; lc.hover = Math.round(n - 1 - (r.right - e.clientX) / (r.width / Math.max(1, Math.min(59, n - 1)))); });
  document.addEventListener('keydown', function (e) { if (e.target.id !== 'lc') return; var n = (stats[lc.id] || []).slice(-60).length; if (e.key === 'ArrowLeft') { lc.hover = lc.hover < 0 ? n - 1 : Math.max(0, lc.hover - 1); e.preventDefault(); } if (e.key === 'ArrowRight') { lc.hover = lc.hover < 0 ? n - 1 : Math.min(n - 1, lc.hover + 1); e.preventDefault(); } if (e.key === 'Escape') lc.hover = -1; });

  // ---------- Dim sum surprise: one draw per start, never on the first run; the switch stays on ----------
  function dimsum(force) {
    if (st.school && !force) return;
    var show = function (d) {
      var name = st.lang === 'yue' ? d.zh + ' · ' + d.en : d.en + ' · ' + d.zh, alt = st.lang === 'yue' ? (d.altYue || d.zh) : (d.altEn || d.en);
      var box = document.createElement('div'); box.className = 'dimcard'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
      box.innerHTML = (d.image ? '<img src="' + d.image + '" alt="' + esc(alt) + '" width="96" height="96">' : '') + '<span class="col" style="gap:2px"><span class="bs mu">' + (st.funEn >= 4 && st.lang !== 'yue' ? 'Yum cha break!' : st.lang === 'yue' ? '飲茶時間！' : 'Dim sum') + '</span><span class="ll">' + esc(name) + '</span></span><button class="ib" aria-label="' + esc(w('close')) + '">' + icon('Close', 's') + '</button>';
      box.querySelector('button').onclick = function () { box.remove(); }; $('#app').appendChild(box); setTimeout(function () { box.remove(); }, 9000);
    };
    if (DEMO || !API.dimsum) { var DIMS = [['Classic Har Gow', '蝦餃'], ['Siu Mai', '燒賣'], ['Char Siu Bao', '叉燒包'], ['Egg Tart', '蛋撻']]; var p = DIMS[Math.floor(Math.random() * DIMS.length)]; show({ en: p[0], zh: p[1] }); return; }
    API.dimsum().then(show, function (e) { if (force) toast('No dim sum photo could be fetched right now: ' + e.message); });
  }
  function dimsumTroll() {
    var b = $('[data-dimtroll]'); if (b) { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); setTimeout(function () { b.classList.add('on'); b.setAttribute('aria-checked', 'true'); }, 450); }
    toast(st.lang === 'yue' ? '點心驚喜熄唔到㗎，佢返咗嚟喇。' : st.funEn >= 3 ? 'Nice try. The dim sum surprise cannot be turned off; it slid back on.' : 'The dim sum surprise cannot be turned off.', { emoji: '🥟' });
  }

