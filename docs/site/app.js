/* Home Assistant Material, project page.
 * Everything runs in this browser: no request leaves the page, and every choice is kept in this
 * browser's storage under one key. Data comes from data.js, written by build_site.py. */
(function () {
  'use strict';
  var S = window.SITE;
  var KEY = 'ham-site-v1';
  var $ = function (q, el) { return (el || document).querySelector(q); };
  var $$ = function (q, el) { return Array.prototype.slice.call((el || document).querySelectorAll(q)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function icon(n, cls) { var p = S.icons[n] || S.icons.InformationOutline; return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '"></path></svg>'; }

  // ---------- Stored state ----------
  var TABS = ['home', 'run', 'deploy', 'features', 'status', 'articles', 'design', 'changes', 'tools', 'settings', 'history', 'support'];
  var DEF = {
    lang: 'en', funEn: 5, funYue: 5, emoji: true, vocab: null, school: false, lowStim: false, spotlight: false, dimsum: true,
    theme: 'system', seed: '#00639B', density: 'comfortable', textScale: 1, reduceMotion: false, contrast: false, focusRing: true, bigTargets: false,
    sounds: true, volume: 40, voice: '', schedule: { on: false, from: '20:00', to: '07:00' }, name: 'Home Assistant Material', logo: { shape: 'rounded', color: '' },
    tabs: { open: TABS.slice(), pinned: [], offered: TABS.slice() }, active: 'home', edge: 'top', paletteFull: false,
    look: {}, locks: {}, history: [], notes: [], tickets: [], otp: [], welcomed: false, welcomeStep: 0
  };
  var st = load();
  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    var s = JSON.parse(JSON.stringify(DEF));
    if (raw && typeof raw === 'object') { Object.keys(DEF).forEach(function (k) { if (k in raw) s[k] = raw[k]; }); }
    // A tab the strip has never offered opens; a tab the person closed stays closed.
    TABS.forEach(function (t) { if (s.tabs.offered.indexOf(t) < 0) { s.tabs.offered.push(t); s.tabs.open.push(t); } });
    s.tabs.open = s.tabs.open.filter(function (t) { return TABS.indexOf(t) >= 0; });
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage may be off; the page still works for this visit */ } }
  var unlocked = {};
  try { unlocked = JSON.parse(sessionStorage.getItem(KEY + '-open') || '{}'); } catch (e) { unlocked = {}; }

  // ---------- Words ----------
  var W = {
    home: ['Home', '主頁'], run: ['Run it', '點樣用'], deploy: ['Deploy Assistant', '部署助手'], status: ['Status', '狀態'], features: ['Features', '功能'], articles: ['Articles', '文章'], design: ['Design', '設計'], changes: ['Changes', '更新'],
    tools: ['Tools', '工具'], settings: ['Settings', '設定'], history: ['History', '紀錄'], support: ['Support', '支援'],
    search: ['Search', '搵嘢'], newtab: ['New tab', '新分頁'], openall: ['Open every tab', '打開晒所有分頁'], close: ['Close', '閂'], cancel: ['Cancel', '取消'], next: ['Next', '下一步'], back: ['Back', '返轉頭'],
    skip: ['Skip', '跳過'], done: ['Done', '搞掂'], reset: ['Reset', '還原'], copy: ['Copy', '複製'], export: ['Export', '匯出'], undo: ['Undo', '還原返'], clear: ['Clear', '清除'],
    notifications: ['Notifications', '通知'], access: ['Accessibility tools', '無障礙工具'], theme: ['Switch light and dark', '轉光暗'], palette: ['Search everything', '搵晒所有嘢'],
    language: ['Language', '語言'], wording: ['Your wording', '你嘅用字'], modes: ['Modes', '模式'], sound: ['Sound and voice', '聲音同讀音'], schedule: ['Schedule', '時間表'],
    appearance: ['Appearance', '外觀'], tabsSet: ['Tabs', '分頁'], identity: ['Name and logo', '名同標誌'], locks: ['Locks', '鎖'], start: ['Start again', '重新開始'], resetAll: ['Reset everything', '全部還原'],
    early: ['Early: the first part of the interface is built', '起步中：介面第一部分已經整好'],
    heroTitle: ['Home Assistant in Material Design 3', 'Material Design 3 版 Home Assistant'],
    heroText: ['The same home automation, with a calmer interface: a floating pane, a slim rail, large type and fewer, larger cards. Built from one repository, released for Docker, Raspberry Pi and virtual machines.',
      '一樣嘅智能家居，介面平和啲：浮動面板、幼身導航欄、大字、卡片少啲但大啲。全部由一個儲存庫整出嚟，有 Docker、Raspberry Pi 同虛擬機版本。'],
    runDocker: ['Run it in Docker', '用 Docker 開'], releases: ['Releases', '發佈版本'], built: ['What is built', '已經整好嘅嘢'], visit: ['This visit, live', '今次瀏覽，即時'],
    free: ['Free, with nothing to buy', '免費，冇嘢要買'],
    freeText: ['No paid tier, no adverts, no tracking. This page sends nothing anywhere and keeps your choices only in this browser.', '冇收費版、冇廣告、冇追蹤。呢頁乜都唔會傳出去，你揀嘅嘢只係留喺呢個瀏覽器。'],
    version: ['Version', '版本'], updated: ['updated', '更新於'], page: ['Project page', '項目網頁'],
    stateBuilt: ['Seen working', '見過運作'], statePartly: ['Partly built', '整咗部分'], stateWritten: ['Written, not seen running', '寫好未見過運作'], stateDesigned: ['Designed', '設計咗'], stateNa: ['Does not apply', '唔適用'],
    tryHere: ['Try it here', '喺度試吓'], inProduct: ['In the product', '喺產品入面'], readNext: ['Read next', '跟住睇'], whatItDoes: ['What it does', '做咩用'], onThisPage: ['On this page', '喺呢頁'],
    articlesEnglish: ['', '文章暫時只有英文。'], noMatch: ['Nothing matches.', '冇嘢夾到。'], badPattern: ['That pattern does not work: ', '呢個樣式用唔到：'],
    editLook: ['Edit appearance', '改外觀'], copyText: ['Copy text', '複製文字'], readAloud: ['Read aloud', '讀出嚟'], lockEl: ['Lock this element', '鎖住呢樣嘢'], unlockEl: ['Unlock this element', '解鎖呢樣嘢'],
    searchFor: ['Search everything for this', '搵晒同呢樣有關嘅嘢'], resetLook: ['Reset its appearance', '還原佢嘅外觀'], filterMenu: ['Search this menu', '搵呢個選單'],
    welcome: ['Welcome', '歡迎'], explain: ['About this setting', '關於呢個設定'], def: ['Default', '預設'], reaches: ['What it reaches', '影響範圍']
  };
  function w(k) { var p = W[k] || [k, k]; return st.lang === 'yue' ? (p[1] || p[0]) : p[0]; }
  // A label in the chosen language; in Both, the second language sits small beside it.
  function L(k) { var p = W[k] || [k, k]; if (st.lang === 'both' && p[1] && p[1] !== p[0]) return esc(p[0]) + '<span class="l2" lang="yue">' + esc(p[1]) + '</span>'; return esc(w(k)); }

  // Messages with five levels of playfulness per language. Facts never change between levels.
  var M = {
    saved: [['Saved.', 'Saved. All in place.', 'Saved, nice and tidy.', 'Saved! Exactly where you left it.', 'Saved! Safe and snug, and the house is proud of you.'],
      ['已經儲存。', '儲存咗，已經生效。', '儲存好，整整齊齊。', '儲存咗！全部喺你擺低嘅位置。', '搞掂晒！安安樂樂，成間屋都為你自豪。']],
    copied: [['Copied.', 'Copied to the clipboard.', 'Copied, ready to paste.', 'Copied! Paste away.', 'Copied! It is on the clipboard, waiting patiently.'],
      ['複製咗。', '已經複製到剪貼簿。', '複製好，可以貼。', '複製咗！貼得喇。', '複製咗！佢喺剪貼簿乖乖等緊你。']],
    emptyHistory: [['No changes yet. Changes you make on this page are listed here.', 'Nothing changed yet. Your changes will be listed here.', 'A clean slate. Change something and it shows up here.', 'Nothing here yet! Tweak a setting and it lands here.', 'Spotless! Change anything at all and it will turn up here, promise.'],
      ['未有改動。你喺呢頁改嘅嘢會列喺度。', '未有改動，改完會喺度見到。', '一張白紙。改啲嘢就會出現。', '仲未有嘢！改個設定就會見到。', '乾乾淨淨！隨便改啲嘢，佢一定會出現。']],
    emptyNotes: [['No notifications. Messages from this page appear here too.', 'No notifications yet.', 'All quiet here.', 'All quiet! Nothing to tell you yet.', 'Silence! The bell is resting.'],
      ['冇通知。呢頁嘅訊息都會喺度出現。', '暫時冇通知。', '靜晒。', '好靜！暫時冇嘢講。', '一片寧靜！個鐘喺度休息緊。']],
    locked: [['This element is locked.', 'Locked. Unlock it to change it.', 'Locked for now.', 'Locked! A PIN opens it.', 'Locked tight! Well, toy-tight.'],
      ['呢樣嘢鎖咗。', '鎖咗，解鎖先改到。', '暫時鎖住。', '鎖咗！要 PIN 先開到。', '鎖到實一實！玩具式咁實。']],
    unlocked: [['Unlocked until this page closes.', 'Unlocked until the page closes.', 'Unlocked for this visit.', 'Unlocked! Until you close the page.', 'Open sesame! Until the page closes.'],
      ['解鎖咗，直到閂咗呢頁。', '解鎖到閂頁為止。', '今次瀏覽解鎖咗。', '解鎖咗！閂頁之前都得。', '芝麻開門！閂頁之前有效。']],
    wrong: [['That PIN did not match.', 'Wrong PIN.', 'Not quite. Try again.', 'Nope! Try again.', 'Not that one! The lock is unimpressed.'],
      ['PIN 唔啱。', 'PIN 錯咗。', '差少少，再試。', '唔係呀！再嚟。', '唔係呢個！把鎖唔收貨。']],
    reset: [['Everything is back to its default.', 'Reset to defaults.', 'Back to the start.', 'Fresh start! Everything is back.', 'Factory fresh! Like the day you met.'],
      ['全部還原咗。', '還原咗預設。', '返到起點。', '重新開始！全部還原。', '好似新咁！好似第一次見面咁。']],
    vocab: [['Your wording file is in use.', 'Your wording is applied.', 'Your words, now on the page.', 'Your words are in! Have a look.', 'Your own words! The page speaks you now.'],
      ['你嘅用字檔案用緊。', '用咗你嘅用字。', '你嘅字已經上咗頁。', '你嘅字入咗！睇吓。', '你自己嘅字！呢頁識講你嘅說話喇。']]
  };
  function msg(k) {
    var m = M[k]; var en = m[0][Math.max(0, Math.min(4, st.funEn - 1))]; var yue = m[1][Math.max(0, Math.min(4, st.funYue - 1))];
    return st.lang === 'yue' ? yue : st.lang === 'both' ? en + ' ' + yue : en;
  }

  // ---------- Personal wording (same checks as the product) ----------
  var VL = { bytes: 262144, depth: 8, key: 160, value: 1000 };
  function parseVocab(text) {
    if (text.length > VL.bytes) return { ok: false, error: 'The file is larger than 256 KiB.' };
    var depth = 0, max = 0, inStr = false;
    for (var i = 0; i < text.length; i++) { var c = text[i]; if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === '{' || c === '[') { depth++; max = Math.max(max, depth); } else if (c === '}' || c === ']') depth--; }
    if (max > VL.depth) return { ok: false, error: 'The file is nested too deeply.' };
    var dup = false;
    var obj; try { obj = JSON.parse(text, function (k, v) { return v; }); } catch (e) { return { ok: false, error: 'The file is not valid JSON.' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'The file must hold one object.' };
    var fields = Object.keys(obj);
    if (fields.some(function (f) { return f !== 'schemaVersion' && f !== 'entries'; })) return { ok: false, error: 'The file has a field other than schemaVersion and entries.' };
    if (obj.schemaVersion !== 1) return { ok: false, error: 'Only schema version 1 is understood.' };
    var e = obj.entries; if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, error: 'entries must be an object.' };
    var keys = text.match(/"((?:[^"\\]|\\.)*)"\s*:/g) || []; var seen = {};
    keys.forEach(function (k) { if (seen[k]) dup = true; seen[k] = 1; });
    if (dup) return { ok: false, error: 'A key appears twice.' };
    var out = {}, n = 0, bad = null;
    Object.keys(e).forEach(function (k) {
      var v = e[k];
      if (bad) return;
      if (k === '__proto__' || k === 'prototype' || k === 'constructor') bad = 'The file has an unsafe key.';
      else if (!k.trim() || k.length > VL.key) bad = 'A key is empty or longer than 160 characters.';
      else if (typeof v !== 'string' || v.length > VL.value) bad = 'A value is not text or is longer than 1000 characters.';
      else if (/[\u0000-\u001f\u007f-\u009f]/.test(k + v)) bad = 'The file has a control character.';
      else { out[k] = v; n++; }
    });
    if (bad) return { ok: false, error: bad };
    return { ok: true, entries: out, count: n };
  }
  var replacer = null;
  function buildReplacer() {
    replacer = null; if (!st.vocab) return;
    var all = {}; Object.keys(st.vocab).forEach(function (k) { all[k] = st.vocab[k]; });
    Object.keys(st.vocab).forEach(function (k) {
      var f = k[0], U = f.toLocaleUpperCase(); if (f === U || f.toLocaleLowerCase() !== f) return;
      var cap = U + k.slice(1); if (cap in all) return; var v = st.vocab[k], l = v[0] || '';
      all[cap] = (l && l.toLocaleLowerCase() === l && l.toLocaleUpperCase() !== l) ? l.toLocaleUpperCase() + v.slice(1) : v;
    });
    var keys = Object.keys(all).sort(function (a, b) { return b.length - a.length; });
    if (!keys.length) return;
    var re = new RegExp(keys.map(function (k) { return k.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'); }).join('|'), 'g');
    var LD = /[\p{L}\p{N}]/u;
    replacer = function (t) {
      return t.replace(re, function (m, off) {
        var b = off > 0 ? t[off - 1] : '', a = t[off + m.length] || '', an = t[off + m.length + 1] || '';
        if ((b && (LD.test(b) || /[_/\\@.]/.test(b))) || (a && (LD.test(a) || /[_/\\@]/.test(a))) || (a === '.' && LD.test(an)) || (a === ':' && an === '/')) return m;
        return all[m] || m;
      });
    };
  }
  function applyVocab(root) {
    if (!replacer) return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|PRE|CODE|INPUT)$/.test(p.nodeName) || p.closest('.code,.mono,[data-novocab]')) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
    var n, list = []; while ((n = tw.nextNode())) list.push(n);
    list.forEach(function (t) { var r = replacer(t.nodeValue); if (r !== t.nodeValue) t.nodeValue = r; });
  }

  // ---------- Sound, voice, notifications ----------
  var actx = null;
  function beep(kind) {
    if (!st.sounds || st.lowStim || st.school || st.volume <= 0 || inQuiet()) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = kind === 'bad' ? 220 : kind === 'on' ? 660 : 520; g.gain.value = 0.0001; o.connect(g); g.connect(actx.destination); var t = actx.currentTime; g.gain.exponentialRampToValueAtTime(st.volume / 400, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.start(t); o.stop(t + 0.2); } catch (e) { /* no audio here */ }
  }
  function inQuiet() { return false; }
  function speak(text) {
    if (!('speechSynthesis' in window)) { toast('This browser has no voices to read aloud with.'); return; }
    var u = new SpeechSynthesisUtterance(text.slice(0, 2000)); var v = speechSynthesis.getVoices().filter(function (x) { return x.name === st.voice; })[0]; if (v) u.voice = v; else if (st.lang === 'yue') u.lang = 'zh-HK';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function toast(text, opts) {
    opts = opts || {};
    var box = $('.toasts'); var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
    var title = st.emoji && opts.emoji ? opts.emoji + ' ' : '';
    el.innerHTML = '<span class="bm grow">' + esc(text) + '</span>' + (opts.undo ? '<button class="btn text sm" data-act="undo-toast">' + L('undo') + '</button>' : '') + '<button class="ib" style="width:36px;height:36px" aria-label="' + esc(w('close')) + '">' + icon('Close', 's') + '</button>';
    void title;
    $$('button', el).forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.act === 'undo-toast' && opts.undo) opts.undo(); el.remove(); }); });
    box.appendChild(el); setTimeout(function () { el.remove(); }, opts.undo ? 6000 : 4000);
    st.notes.unshift({ t: Date.now(), text: text }); st.notes = st.notes.slice(0, 100); save(); bell();
  }
  function bell() { var b = $('#bellcount'); if (b) { var n = st.notes.filter(function (x) { return !x.read; }).length; b.textContent = n; b.hidden = !n; } }

  // ---------- History of changes ----------
  function setVal(path, value, label) {
    var parts = path.split('.'), o = st; for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    var before = o[parts[parts.length - 1]]; if (JSON.stringify(before) === JSON.stringify(value)) return;
    o[parts[parts.length - 1]] = value;
    st.history.unshift({ t: Date.now(), path: path, label: label || path, before: before, after: value }); st.history = st.history.slice(0, 200);
    save(); apply(); beep(value === true ? 'on' : 'tick');
  }
  function undoEntry(i) { var h = st.history[i]; if (!h) return; var parts = h.path.split('.'), o = st; for (var k = 0; k < parts.length - 1; k++) o = o[parts[k]]; o[parts[parts.length - 1]] = h.before; st.history.splice(i, 1); save(); apply(); render(); }

  // ---------- Applying settings to the page ----------
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    if (st.schedule.on) { var now = new Date(), m = now.getHours() * 60 + now.getMinutes(); var f = hm(st.schedule.from), t = hm(st.schedule.to); var inR = f <= t ? (m >= f && m < t) : (m >= f || m < t); if (inR) return true; }
    return st.theme === 'dark' || (st.theme === 'system' && mq.matches);
  }
  function hm(s) { var p = (s || '0:0').split(':'); return (+p[0]) * 60 + (+p[1]); }
  function apply() {
    var r = $('#app'); var c = r.classList;
    c.toggle('dark', isDark()); c.toggle('reduce', st.reduceMotion || st.lowStim); c.toggle('contrast', st.contrast); c.toggle('focusring', st.focusRing); c.toggle('bigtargets', st.bigTargets);
    c.toggle('lowstim', st.lowStim); c.toggle('spotlight', st.spotlight); c.toggle('dense', st.density === 'compact'); c.toggle('both', st.lang === 'both');
    r.style.setProperty('--ts', st.textScale);
    if (st.seed && st.seed !== '#00639B') { r.style.setProperty('--p', st.seed); r.style.setProperty('--pc', mix(st.seed, isDark() ? '#000000' : '#ffffff', 0.78)); r.style.setProperty('--on-pc', isDark() ? mix(st.seed, '#ffffff', 0.7) : mix(st.seed, '#000000', 0.45)); }
    else { ['--p', '--pc', '--on-pc'].forEach(function (v) { r.style.removeProperty(v); }); }
    document.documentElement.lang = st.lang === 'yue' ? 'yue' : 'en';
    document.title = st.name + ' · ' + w(st.active);
    buildReplacer();
  }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(A[i] + (B[i] - A[i]) * t).toString(16)).slice(-2); }).join(''); }
  function hex(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }

  // ---------- Search with patterns ----------
  // A query is plain text, or /pattern/flags. Plain text matches without case.
  function matcher(q) {
    q = (q || '').trim(); if (!q) return { ok: true, test: function () { return true; } };
    var m = q.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (m) { try { var re = new RegExp(m[1], m[2].replace(/[gy]/g, '')); return { ok: true, test: function (s) { return re.test(s); }, re: re }; } catch (e) { return { ok: false, error: e.message, test: function () { return false; } }; } }
    var low = q.toLowerCase(); return { ok: true, test: function (s) { return String(s).toLowerCase().indexOf(low) >= 0; } };
  }
  function findField(id, ph, value) {
    return '<div class="find" role="search"><span aria-hidden="true">' + icon('Magnify', 's') + '</span><input id="' + id + '" type="search" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" value="' + esc(value || '') + '" autocomplete="off">' +
      '<button class="ib" style="width:40px;height:40px" data-regex="' + id + '" aria-label="Build a pattern search for: ' + esc(ph) + '" title="Pattern workbench">' + icon('Regex', 's') + '</button></div>';
  }

  // ---------- Rendering ----------
  var q = {}; // search text per surface
  var view = { article: null, featState: 'all', featCat: 'all', filtersOpen: true, sel: {} };
  function stateTag(s) { var k = { built: 'stateBuilt', partly: 'statePartly', written: 'stateWritten', designed: 'stateDesigned', na: 'stateNa' }[s]; return '<span class="tag ' + s + '">' + L(k) + '</span>'; }
  function foot() {
    var d = S.updated ? new Date(S.updated) : null;
    var when = d ? d.toLocaleString(st.lang === 'yue' ? 'zh-HK' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }) : '';
    return '<footer class="foot bs" data-k="foot"><span>' + esc(w('page')) + ', ' + esc(w('version')) + ' ' + esc(S.version) + ' (' + esc(S.commit) + '), ' + esc(w('updated')) + ' ' + esc(when) + '</span><span class="grow"></span>' +
      '<span>Right-click anything to edit or lock it · Ctrl Shift F searches everything</span></footer>';
  }
  function h2(k, id) { return '<h2 class="hs" id="' + (id || k) + '" data-k="h-' + k + '">' + L(k) + '</h2>'; }

  var R = {};
  R.home = function () {
    var built = [['crop-workbench', 'regex-search'], ['crop-element-menu', 'context-menus'], ['crop-appearance', 'appearance-editor']].map(function (x) {
      var f = feat(x[1]); return '<article class="feat" data-k="built-' + x[1] + '"><img src="img/' + x[0] + '.webp" width="800" height="600" alt="' + esc(f.name) + ', from a running build" loading="lazy"><h3 class="tl">' + esc(f.name) + '</h3><p class="bm mu">' + esc(f.what) + '</p><div>' + stateTag(f.state) + '</div></article>';
    }).join('');
    return '<section class="hero" id="top" data-k="hero"><div class="col" style="gap:20px"><span class="status" data-k="status">' + icon('ProgressClock', 's') + L('early') + '</span><h1 data-k="hero-title">' + L('heroTitle') + '</h1>' +
      '<p class="bl mu" data-k="hero-text">' + L('heroText') + '</p><div class="chipline"><button class="btn fill lg" data-go="deploy:top">' + icon('Download', 's') + 'Get the Deploy Assistant</button><button class="btn tonal lg" data-go="run:top">' + L('runDocker') + '</button><a class="btn out lg" href="' + S.repo + '/releases">' + L('releases') + '</a></div></div>' +
      '<div><img class="shot" data-k="hero-shot" src="img/home.webp" width="1440" height="900" alt="The Home page of a running build: a slim rail, pill tabs and rounded cards"></div></section>' +
      '<section class="section" id="built">' + h2('built', 'built-h') + '<div class="grid3">' + built + '</div><div><button class="btn tonal" data-go="features:top">' + esc(S.features.length) + ' features and their state</button></div></section>' +
      '<section class="section" id="live">' + h2('visit', 'live-h') + '<p class="bm mu">Clicks and key presses on this page, every two seconds. Move over the chart to read a value. Nothing is sent anywhere.</p><canvas class="live" id="livechart" width="1000" height="160" role="img" aria-label="Live chart of activity on this page during this visit"></canvas><p class="bs mu" id="livevalue" aria-live="polite"></p></section>' +
      '<section class="section card" id="free" data-k="free" style="padding:24px"><h2 class="tl">' + L('free') + '</h2><p class="bm">' + L('freeText') + '</p></section>' + foot();
  };
  R.run = function () {
    var cmd = 'docker run -d --name homeassistant --restart unless-stopped --network host -v /path/to/config:/config ' + S.image + ':latest';
    var imgs = [['Raspberry Pi 5', 'haos_rpi5-64-<version>.img.xz'], ['Raspberry Pi 4 and 400', 'haos_rpi4-64-<version>.img.xz'], ['Raspberry Pi 3', 'haos_rpi3-64-<version>.img.xz'], ['VirtualBox', 'haos_ova-<version>.vdi.zip'], ['VMware Workstation', 'haos_ova-<version>.ova']];
    return '<div class="section" id="top"><h1 class="hl" data-k="run-title">' + L('run') + '</h1><p class="bl mu">One container for amd64 and arm64. Then open <span class="mono">http://&lt;host&gt;:8123</span>.</p>' +
      '<div class="code" data-k="run-cmd"><pre>' + esc(cmd) + '</pre><button class="ib" data-copy="' + esc(cmd) + '" aria-label="Copy the command">' + icon('ContentCopy', 's') + '</button></div>' +
      '<div class="grid2"><section class="card" data-k="run-compose" style="padding:24px"><h2 class="tl">One step, with Docker Compose</h2><p class="bm mu">Clone the repository, then run <span class="mono">host.bat</span> on Windows or <span class="mono">./host.sh</span> on Linux and macOS. It pulls the image, starts it, waits until it answers, and prints the address for this machine and for your network.</p></section>' +
      '<section class="card" data-k="run-os" style="padding:24px"><h2 class="tl">Operating system images</h2><p class="bm mu">Releases that rebuilt the product attach these files. Check each against <span class="mono">SHA256SUMS</span> from the same release. The operating system serves the interface on port 80.</p><a class="btn tonal" href="' + S.repo + '/releases">' + icon('Download', 's') + L('releases') + '</a></section></div>' +
      '<div class="scrollbox"><table class="t" data-k="run-files"><caption class="bs mu" style="text-align:left">Files attached to a release</caption><tbody>' + imgs.map(function (r) { return '<tr><td class="ll">' + esc(r[0]) + '</td><td class="mono bs">' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="bs mu">There is no installer file: the product is a container and operating system images, so this page has no download button for one.</p></div>' + foot();
  };
  function feat(id) { return S.features.filter(function (f) { return f.id === id; })[0]; }
  R.features = function () {
    var m = matcher(q.features); var counts = {}; var cats = [];
    S.features.forEach(function (f) { counts[f.state] = (counts[f.state] || 0) + 1; if (cats.indexOf(f.group) < 0) cats.push(f.group); });
    var list = S.features.filter(function (f) { return (view.featState === 'all' || f.state === view.featState) && (view.featCat === 'all' || f.group === view.featCat) && m.test(f.name + ' ' + f.what + ' ' + f.id); });
    var chip = function (k, v, label, cur) { return '<button class="chip' + (cur === v ? ' sel' : '') + '" aria-pressed="' + (cur === v) + '" data-' + k + '="' + v + '">' + label + '</button>'; };
    var filters = '<div class="chipline" role="group" aria-label="State">' + chip('fstate', 'all', 'All ' + S.features.length, view.featState) + ['built', 'partly', 'written', 'designed', 'na'].map(function (s) { return chip('fstate', s, stateTag(s) + ' ' + (counts[s] || 0), view.featState); }).join('') + '</div>' +
      '<div class="chipline" role="group" aria-label="Group">' + chip('fcat', 'all', 'Every group', view.featCat) + cats.map(function (c) { return chip('fcat', c, esc(c), view.featCat); }).join('') + '</div>';
    return '<div class="section" id="top"><h1 class="hl">' + L('features') + '</h1><p class="bl mu">Every feature this project owes, with its honest state in the product and how to try it on this page.</p>' +
      '<div class="toolbar" id="filters">' + findField('fsearch', 'Search features', q.features) + '<button class="btn text sm" data-act="toggle-filters" aria-expanded="' + view.filtersOpen + '">' + (view.filtersOpen ? 'Hide filters and counts' : 'Show filters and counts') + icon(view.filtersOpen ? 'ChevronUp' : 'ChevronDown', 's') + '</button><span class="grow"></span><button class="btn text sm" data-export="features">' + icon('Export', 's') + L('export') + '</button></div>' +
      (view.filtersOpen ? filters : '') + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      '<p class="bs mu" aria-live="polite">' + list.length + ' shown</p>' +
      (list.length ? list.map(function (f) { return '<div class="row-item" data-k="f-' + f.id + '" id="f-' + f.id + '"><div class="col grow" style="gap:6px"><div class="chipline"><span class="tm">' + esc(f.name) + '</span>' + stateTag(f.state) + '<span class="tag">' + esc(f.group) + '</span></div><span class="bm mu">' + esc(f.what) + '</span><span class="bs"><b>' + L('onThisPage') + ':</b> ' + esc(f.here) + '</span></div><button class="btn text sm" data-article="' + f.id + '">' + L('articles') + '</button></div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') +
      '</div>' + foot();
  };
  R.articles = function () {
    if (view.article) {
      var f = feat(view.article); if (!f) { view.article = null; return R.articles(); }
      var next = S.features.filter(function (x) { return x.group === f.group && x.id !== f.id; }).slice(0, 3);
      return '<article class="article" id="top" data-k="a-' + f.id + '"><button class="btn text sm" data-article="" style="align-self:flex-start">' + icon('ChevronLeft', 's') + 'All articles</button>' +
        '<h1 class="hl">' + esc(f.name) + '</h1><div class="chipline">' + stateTag(f.state) + '<span class="tag">' + esc(f.group) + '</span></div>' + (st.lang !== 'en' ? '<p class="bs mu">' + esc(W.articlesEnglish[1]) + '</p>' : '') +
        '<h2 class="tl">' + L('whatItDoes') + '</h2><p class="bl">' + esc(f.what) + '</p><h2 class="tl">' + L('tryHere') + '</h2><p class="bl">' + esc(f.here) + '</p><div><button class="btn tonal" data-go="' + f.try + '">' + L('tryHere') + icon('ChevronRight', 's') + '</button></div>' +
        '<h2 class="tl">' + L('inProduct') + '</h2><p class="bl">' + esc(f.product) + ' <a href="#status" data-go="status:top">The status page</a> has the details.</p>' +
        '<h2 class="tl">' + L('readNext') + '</h2><div class="grid3">' + next.map(function (x) { return '<button class="feat" style="text-align:left" data-article="' + x.id + '"><span class="tm" style="padding:10px 10px 0">' + esc(x.name) + '</span><span class="bs mu">' + esc(x.what.slice(0, 110)) + '…</span></button>'; }).join('') + '</div></article>' + foot();
    }
    var m = matcher(q.articles); var list = S.features.filter(function (f) { return m.test(f.name + ' ' + f.what + ' ' + f.here); });
    return '<div class="section" id="top"><h1 class="hl">' + L('articles') + '</h1><p class="bl mu">One article per feature: what it does, how to try it here, where the product stands, and what to read next. They all work offline once this page has loaded.</p>' +
      findField('asearch', 'Search articles', q.articles) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      '<div class="grid3">' + (list.length ? list.map(function (f) { return '<button class="feat" style="text-align:left" data-k="ac-' + f.id + '" data-article="' + f.id + '"><span class="chipline" style="padding:10px 10px 0"><span class="tm">' + esc(f.name) + '</span></span><span class="bs mu">' + esc(f.what.slice(0, 120)) + '…</span><span>' + stateTag(f.state) + '</span></button>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div></div>' + foot();
  };
  R.design = function () {
    var m = matcher(q.design); var total = 0;
    var out = S.canvases.map(function (c) {
      var list = c.boards.filter(function (b) { return m.test(c.title + ' ' + b.title + ' ' + b.name); }); total += list.length;
      if (!list.length) return '';
      return '<section class="section" id="cv-' + c.id + '" data-k="cv-' + c.id + '"><h2 class="tl">' + esc(c.title) + ' <span class="bs mu">' + c.boards.length + ' boards</span></h2><div class="thumbs">' + list.map(function (b) { return '<button class="thumb" data-board="' + esc(b.name) + '" data-btitle="' + esc(b.title) + '"><img src="boards/' + esc(b.name) + '.webp" alt="" loading="lazy"><span class="bs">' + esc(b.title) + '</span></button>'; }).join('') + '</div></section>';
    }).join('');
    var n = S.canvases.reduce(function (a, c) { return a + c.boards.length; }, 0);
    return '<div class="section" id="top"><h1 class="hl">' + L('design') + '</h1><p class="bl mu">' + n + ' boards on ' + S.canvases.length + ' canvases: every page, dialog and feature, on a phone and in a wide window, light and dark. A board is a proposal until it has been seen in a running build. Choose a board to see it full size.</p>' + findField('dsearch', 'Search boards', q.design) +
      '<div class="chipline">' + S.canvases.map(function (c) { return '<button class="chip" data-go="design:cv-' + c.id + '">' + esc(c.id) + '</button>'; }).join('') + '</div><p class="bs mu" aria-live="polite">' + total + ' shown</p></div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  R.status = function () {
    var m = matcher(q.status);
    var out = S.status.map(function (sec, si) {
      var rows = sec.rows.filter(function (r) { return m.test(r.join(' ')); });
      if (!rows.length) return '';
      return '<section class="section" id="st-' + si + '" data-k="st-' + si + '"><h2 class="tl">' + esc(sec.title) + '</h2><div class="scrollbox"><table class="t"><thead><tr>' + sec.head.map(function (h) { return '<th class="ll">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { var st2 = (r[1] || '').toLowerCase(); var tone = /^done|^built/.test(st2) ? 'built' : /not started|^designed/.test(st2) ? 'designed' : /partly|wired|written/.test(st2) ? 'partly' : ''; return '<tr><td class="ll">' + esc(r[0]) + '</td><td class="bs">' + (tone ? '<span class="tag ' + tone + '" style="margin-right:6px">' + esc((r[1] || '').split(/[,.;:(]/)[0].split(' ').slice(0, 3).join(' ')) + '</span>' : '') + esc(r[1] || '') + '</td>' + r.slice(2).map(function (c) { return '<td class="bs mono">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></section>';
    }).join('');
    return '<div class="section" id="top"><h1 class="hl">' + L('status') + '</h1><p class="bl mu">What exists today, stated plainly, from the repository\'s status page at version ' + esc(S.version) + '. Nothing is called done until it has been seen working in a built image.</p>' + findField('stsearch', 'Search the status', q.status) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  R.deploy = function () {
    var rel = window.DEPLOY_RELEASE || {}; var as = rel.assets || [];
    var find = function (re) { return as.filter(function (a) { return re.test(a.name); })[0]; };
    var dl = [['Windows', 'Setup.exe, updates itself', find(/Setup\.exe$/i), 'Download for Windows'], ['Linux', '.deb for Debian and Ubuntu', find(/\.deb$/i), 'Download the .deb'], ['Linux', '.zip, any distribution', find(/Linux\.zip$/i), 'Download the Linux .zip'], ['macOS', '.zip, Apple silicon and Intel', find(/macOS\.zip$/i), 'Download for macOS']];
    var cards = dl.map(function (d) { return '<div class="feat" style="padding:20px;gap:8px"><span class="tm">' + d[0] + '</span><span class="bs mu">' + d[1] + (d[2] ? ' · ' + Math.round(d[2].size / 1e6) + ' MB' : '') + '</span>' + (d[2] ? '<a class="btn fill" href="' + esc(d[2].url) + '">' + icon('Download', 's') + d[3] + '</a>' : '<span class="bs mu">Being built; the button appears when the first release is published.</span>') + '</div>'; }).join('');
    var feats = [['One click', 'Docker on this computer, an SSH host, VirtualBox or VMware. Name, free port, configuration and image are chosen for you; you get the link and it opens.'], ['Raspberry Pi cards', 'Writes the Raspberry Pi 3, 4 or 5 image to an SD card or USB drive, reads it back to check it, then waits for the Pi on your network and adds it with its link.'], ['As many instances as you like', 'Each gets its own name, port and folder. Start, stop, restart, update, logs, and live processor and memory use.'], ['Backups', 'Back up now, or every day on a schedule with a number kept. Archives for Docker and SSH, snapshots for virtual machines. Restoring keeps the current config beside it.'], ['Automatic downloads', 'Every operating system image and the container image are downloaded, checked against their SHA-256 sums and kept current, on this computer and on your SSH hosts.'], ['Everything this page has', 'Tabs, Ctrl Shift F with live controls, the pattern workbench on every search, a menu on every element, three language modes, locks, history and export.']];
    return '<div class="section" id="top"><span class="status">' + icon('Download', 's') + (rel.version ? 'Version ' + esc(rel.version) + (rel.published ? ', published ' + esc(new Date(rel.published).toLocaleDateString()) : '') : 'First release on its way') + '</span><h1 class="hl" data-k="da-title">Deploy Assistant</h1><p class="bl mu" style="max-width:780px">A desktop app that runs Home Assistant Material for you in one click, and keeps every instance and its backups in one place. Free, no account. Nothing is code-signed, so Windows and macOS warn on first start; each file is listed in SHA256SUMS of its release.</p>' +
      '<div class="grid2" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">' + cards + '</div>' + (rel.tag ? '<p class="bs mu">Files of release ' + esc(rel.tag) + '. <a href="' + S.repo + '/releases/tag/' + esc(rel.tag) + '">All files and SHA256SUMS</a>.</p>' : '') + '</div>' +
      '<section class="section" id="demo"><h2 class="hs">Try it here</h2><p class="bm mu">The real app\'s window, running in this page with nothing behind it: press anything. Deploying here only plays the steps.</p><iframe class="demo" src="deploy-assistant/index.html" title="Deploy Assistant demo" loading="lazy"></iframe></section>' +
      '<section class="section"><h2 class="hs">What it does</h2><div class="grid3">' + feats.map(function (f) { return '<div class="feat" style="padding:20px;gap:8px"><span class="tm">' + f[0] + '</span><span class="bm mu">' + f[1] + '</span></div>'; }).join('') + '</div></section>' +
      '<section class="section"><h2 class="hs">Its design</h2><div class="thumbs">' + (S.canvases.filter(function (c) { return /^1[67]-deploy/.test(c.id); }).reduce(function (a, c) { return a.concat(c.boards); }, []).map(function (b) { return '<button class="thumb" data-board="' + esc(b.name) + '" data-btitle="' + esc(b.title) + '"><img src="boards/' + esc(b.name) + '.webp" alt="" loading="lazy"><span class="bs">' + esc(b.title) + '</span></button>'; }).join('')) + '</div></section>' + foot();
  };
  function md(t) { return esc(t).split(/\n\s*\n/).map(function (p) { return '<p class="bm">' + p.replace(/\n/g, ' ') + '</p>'; }).join(''); }
  R.changes = function () {
    var m = matcher(q.changes); var list = S.changes.filter(function (c) { return m.test(c.title + ' ' + c.body); });
    return '<div class="section" id="top"><h1 class="hl">' + L('changes') + '</h1><p class="bl mu">The latest changes to the repository, newest first. Every change publishes a release.</p>' + findField('csearch', 'Search changes', q.changes) +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + (list.length ? list.map(function (c) { return '<details class="row-item" data-k="c-' + c.sha + '" style="display:block"><summary class="row" style="gap:12px;cursor:pointer;min-height:44px"><span class="tm grow">' + esc(c.title) + '</span><span class="bs mu">' + esc(c.date.slice(0, 10)) + ' · <span class="mono">' + c.sha + '</span></span></summary>' + (c.body ? '<div style="padding-top:8px">' + md(c.body) + '</div>' : '') + '</details>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };
  // Settings rows: title, explanation, default, what it reaches, control, reset.
  function srow(id, title, desc, def, reach, ctl, path) {
    return '<div class="setting" id="s-' + id + '" data-k="s-' + id + '" data-search="' + esc(title + ' ' + desc) + '"><div class="col" style="gap:2px"><span class="stitle"><span class="ll">' + esc(title) + '</span><button class="ib" style="width:32px;height:32px" data-info="' + id + '" aria-label="' + esc(w('explain')) + ': ' + esc(title) + '" aria-expanded="false">' + icon('InformationOutline', 's') + '</button></span><span class="bs mu">' + esc(desc) + '</span></div>' +
      '<div class="ctl">' + ctl + (path ? '<button class="btn text sm" data-reset="' + path + '" aria-label="' + esc(w('reset')) + ': ' + esc(title) + '">' + icon('Restore', 's') + '</button>' : '') + '</div>' +
      '<div class="more bs mu" id="i-' + id + '" hidden><b>' + L('def') + ':</b> ' + esc(def) + '. <b>' + L('reaches') + ':</b> ' + esc(reach) + '</div></div>';
  }
  function sw(path, label) { var v = get(path); return '<button class="sw' + (v ? ' on' : '') + '" role="switch" aria-checked="' + !!v + '" aria-label="' + esc(label) + '" data-toggle="' + path + '"><i></i></button>'; }
  function seg(path, opts, label) { var v = String(get(path)); return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map(function (o) { return '<button class="' + (String(o[0]) === v ? 'sel' : '') + '" aria-pressed="' + (String(o[0]) === v) + '" data-set="' + path + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function get(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, st); }
  R.settings = function () {
    var m = matcher(q.settings);
    var voices = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
    var lv = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']];
    var groups = [
      ['language', [srow('lang', 'Language mode', 'English, playful Hong Kong Cantonese, or both together.', 'English', 'Every label on this page', seg('lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], 'Language mode'), 'lang'),
        srow('funEn', 'Playfulness in English', 'From 1, fully serious, to 5, as playful as it gets.', '5', 'Toasts, empty states and dialogs', seg('funEn', lv, 'Playfulness in English'), 'funEn'),
        srow('funYue', 'Playfulness in Cantonese', 'From 1 to 5. Independent of the English level.', '5', 'Toasts, empty states and dialogs', seg('funYue', lv, 'Playfulness in Cantonese'), 'funYue'),
        srow('emoji', 'Emoji in dialogs', 'Adds one emoji to dialog titles. Never in buttons or names.', 'On', 'Dialog titles', sw('emoji', 'Emoji in dialogs'), 'emoji')]],
      ['wording', [srow('vocab', 'Your wording file', st.vocab ? Object.keys(st.vocab).length + ' entries in use. Choose another file to replace it.' : 'No file yet. A JSON file with schemaVersion 1 and entries replaces words on this page.', 'No file', 'Every label and text on this page, in this browser only',
        '<label class="btn tonal sm">' + icon('Upload', 's') + 'Choose a file<input type="file" accept="application/json,.json" id="vocabfile" hidden></label>' + (st.vocab ? '<button class="btn text sm" data-act="vocab-clear">' + L('clear') + '</button>' : ''), '') +
        '<p class="bs mu">You can also drop the file anywhere on the page. It is checked in full before anything changes: at most 256 KiB, nesting depth 8, keys up to 160 characters and values up to 1000, no duplicate or unsafe keys, no control characters. A file that fails changes nothing. Nothing about the file is sent anywhere.</p>']],
      ['modes', [srow('school', 'School mode', 'Plain wording, playfulness 1, no sounds, no surprise.', 'Off', 'Language, sound and the surprise', sw('school', 'School mode'), 'school'),
        srow('lowStim', 'Low stimulation', 'Softens colour, shortens animation and silences sounds.', 'Off', 'The whole page', sw('lowStim', 'Low stimulation'), 'lowStim'),
        srow('spotlight', 'Focus spotlight', 'Dims everything except the part that has the keyboard focus.', 'Off', 'The whole page', sw('spotlight', 'Focus spotlight'), 'spotlight'),
        srow('dimsum', 'Dim sum surprise', 'Now and then, a small dim sum card. Names only: this page loads no photos from other sites.', 'On', 'A card at the bottom of the page', sw('dimsum', 'Dim sum surprise') + '<button class="btn text sm" data-act="dimsum">Show me one now</button>', 'dimsum')]],
      ['sound', [srow('sounds', 'Action sounds', 'A short sound when you change a setting.', 'On', 'Settings and tools', sw('sounds', 'Action sounds'), 'sounds'),
        srow('volume', 'Sound volume', 'How loud action sounds are, from 0 to 100.', '40', 'Action sounds', '<input class="input" type="range" min="0" max="100" value="' + st.volume + '" data-range="volume" aria-label="Sound volume" style="min-height:0;padding:0;box-shadow:none;background:none"><span class="ll">' + st.volume + '</span>', 'volume'),
        srow('voice', 'Reading voice', 'The voice for Read aloud. Your browser provides the voices.', 'The browser\'s default', 'Read aloud', '<select class="select" data-select="voice" aria-label="Reading voice"><option value="">Browser default</option>' + voices.map(function (v) { return '<option' + (v.name === st.voice ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select><button class="btn text sm" data-act="voice-test">Try it</button>', 'voice')]],
      ['schedule', [srow('sched', 'Dark theme on a schedule', 'Uses the dark theme between two times each day while this page is open.', 'Off, 20:00 to 07:00', 'The theme', sw('schedule.on', 'Dark theme on a schedule') + '<input class="input" type="time" value="' + st.schedule.from + '" data-time="schedule.from" aria-label="From"><input class="input" type="time" value="' + st.schedule.to + '" data-time="schedule.to" aria-label="To">', 'schedule')]],
      ['appearance', [srow('theme', 'Theme', 'Light, dark, or follow your system.', 'Follow the system', 'The whole page', seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], 'Theme'), 'theme'),
        srow('seed', 'Main colour', 'The colour buttons and selections are drawn in.', '#00639B', 'The whole page', '<input type="color" value="' + st.seed + '" data-color="seed" aria-label="Main colour" style="width:48px;height:40px;border:0;background:none">', 'seed'),
        srow('density', 'Density', 'How much room rows take.', 'Comfortable', 'Lists and settings', seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Density'), 'density'),
        srow('reduceMotion', 'Reduce motion', 'Stops animations. Your system setting is followed too.', 'Off', 'The whole page', sw('reduceMotion', 'Reduce motion'), 'reduceMotion')]],
      ['access', [srow('textScale', 'Text size', 'Makes every text larger without cutting anything off.', '100%', 'The whole page', seg('textScale', [['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%']], 'Text size'), 'textScale'),
        srow('contrast', 'More contrast', 'Darker secondary text and lines.', 'Off', 'The whole page', sw('contrast', 'More contrast'), 'contrast'),
        srow('focusRing', 'Visible focus', 'A clear ring around what has the keyboard focus.', 'On', 'The whole page', sw('focusRing', 'Visible focus'), 'focusRing'),
        srow('bigTargets', 'Larger targets', 'Larger buttons for touch and pointer.', 'Off', 'Buttons', sw('bigTargets', 'Larger targets'), 'bigTargets'),
        srow('keys', 'Keyboard help', 'Ctrl Shift F searches everything. Shift F10 or the menu key opens the menu of the focused element. Escape closes.', '', 'Everywhere', '<button class="btn text sm" data-act="keys">Show the keys</button>', '')]],
      ['tabsSet', [srow('edge', 'Where the tabs sit', 'The tab strip can sit on any edge.', 'Top', 'The tab strip', seg('edge', [['top', 'Top'], ['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom']], 'Tab strip edge'), 'edge'),
        srow('openall', 'Open every tab', 'Reopens every tab you have closed.', '', 'The tab strip', '<button class="btn tonal sm" data-act="openall">' + L('openall') + '</button>', '')]],
      ['identity', [srow('name', 'Name', 'What this page calls the product, at the top and in the window title.', 'Home Assistant Material', 'The top bar and the title', '<input class="input" value="' + esc(st.name) + '" data-text="name" aria-label="Name" maxlength="60">', 'name'),
        srow('logo', 'Logo', 'The shape and colour of the mark at the top.', 'Rounded, main colour', 'The top bar', seg('logo.shape', [['rounded', 'Rounded'], ['circle', 'Circle'], ['square', 'Square'], ['leaf', 'Leaf']], 'Logo shape') + '<input type="color" value="' + (st.logo.color || '#CEE5FF') + '" data-color="logo.color" aria-label="Logo colour" style="width:48px;height:40px;border:0;background:none">', 'logo')]],
      ['locks', [Object.keys(st.locks).length ? Object.keys(st.locks).map(function (k) { var o = st.locks[k]; return '<div class="row-item" data-k="lock-' + esc(k) + '"><span class="col grow"><span class="ll">' + esc(o.label) + '</span><span class="bs mu">' + (unlocked[k] ? 'Unlocked until the page closes' : 'Locked') + ', PIN</span></span>' + (unlocked[k] ? '<button class="btn tonal sm" data-relock="' + esc(k) + '">Lock again</button>' : '<button class="btn tonal sm" data-unlock="' + esc(k) + '">Unlock</button>') + '<button class="btn text sm" data-rmlock="' + esc(k) + '">Remove</button></div>'; }).join('') : '<p class="bm mu">Nothing is locked. Right-click any element and choose Lock this element.</p>', '<p class="bs mu">A lock is a speed bump for fun, not security. Forgot a PIN? Clear this site\'s storage in your browser to remove every lock, or see Support.</p>']],
      ['start', [srow('welcome', 'Welcome again', 'Opens the short welcome from the first visit.', '', 'This visit', '<button class="btn tonal sm" data-act="welcome">Open the welcome</button>', '')]],
      ['export', [srow('exp', 'Export your settings', 'Your choices on this page as JSON, CSV, Markdown or text.', '', 'A file you save', ['json', 'csv', 'md', 'txt'].map(function (f) { return '<button class="btn text sm" data-export="settings-' + f + '">' + f.toUpperCase() + '</button>'; }).join(''), '')]],
      ['resetAll', [srow('resetall', 'Reset everything', 'Every setting, lock, history entry and ticket on this page goes back to the start.', '', 'Everything this page keeps in your browser', '<button class="btn err sm" data-act="resetall">' + L('resetAll') + '</button>', '')]]
    ];
    var anchors = { language: 'language', wording: 'wording', modes: 'modes', sound: 'sound', schedule: 'schedule', appearance: 'appearance', access: 'accessibility', tabsSet: 'tabs', identity: 'identity', locks: 'locks', start: 'start', export: 'export', resetAll: 'reset' };
    var out = groups.map(function (g) {
      var rows = g[1].filter(function (r) { var mm = r.match(/data-search="([^"]*)"/); return !q.settings || !mm || m.test(mm[1].replace(/&#39;/g, "'")); });
      if (q.settings && !rows.length) return '';
      return '<section class="section" id="' + anchors[g[0]] + '"><h2 class="tl" data-k="sh-' + g[0] + '">' + L(g[0]) + '</h2>' + rows.join('') + '</section>';
    }).join('');
    return '<div class="section" id="top"><h1 class="hl">' + L('settings') + '</h1><p class="bl mu">Every choice is kept only in this browser. Each one says what it does, its default and what it reaches; press its information button.</p>' + findField('ssearch', 'Search settings', q.settings) + '<nav class="chipline" aria-label="Setting groups">' + groups.map(function (g) { return '<button class="chip" data-go="settings:' + anchors[g[0]] + '">' + L(g[0]) + '</button>'; }).join('') + '</nav>' + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  R.history = function () {
    var m = matcher(q.history); var list = st.history.map(function (h, i) { h._i = i; return h; }).filter(function (h) { return m.test(h.label + ' ' + JSON.stringify(h.after)); });
    var nsel = Object.keys(view.sel).filter(function (k) { return view.sel[k]; }).length;
    return '<div class="section" id="top"><h1 class="hl">' + L('history') + '</h1><p class="bl mu">Every change you make on this page, newest first. Undo any of them.</p><div class="toolbar">' + findField('hsearch', 'Search history', q.history) + '<span class="grow"></span>' +
      (nsel ? '<button class="btn tonal sm" data-act="undo-sel">Undo ' + nsel + ' selected</button>' : '') + '<button class="btn text sm" data-export="history">' + icon('Export', 's') + L('export') + '</button><button class="btn text sm" data-act="clear-history">' + L('clear') + '</button></div>' +
      (list.length ? list.map(function (h) { return '<div class="row-item" data-k="hist-' + h.t + '"><input type="checkbox" aria-label="Select ' + esc(h.label) + '" data-sel="' + h.t + '"' + (view.sel[h.t] ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--p)"><span class="col grow"><span class="ll">' + esc(h.label) + '</span><span class="bs mu">' + esc(new Date(h.t).toLocaleString()) + ' · ' + esc(short(h.before)) + ' → ' + esc(short(h.after)) + '</span></span><button class="btn text sm" data-undo="' + h._i + '">' + L('undo') + '</button></div>'; }).join('') : '<p class="bm mu">' + esc(msg('emptyHistory')) + '</p>') + '</div>' + foot();
  };
  function short(v) { var s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; }
  R.support = function () {
    var presets = [['Forgot a lock PIN', 'I locked an element on this page and forgot its PIN.', 'Clearing this site\'s storage'], ['Something looks wrong', 'A part of the page looks cut off or overlaps.', 'A larger text size'], ['Question about running it', 'I want to run the container on my machine.', 'The Run it tab']];
    return '<div class="section" id="top"><h1 class="hl">' + L('support') + '</h1><p class="bl mu">Help for this page, and a place to note what went wrong. Tickets stay in this browser; copy them as text to send them on.</p>' +
      '<section class="card" data-k="pin-help" style="padding:24px"><h2 class="tl">Forgotten a lock PIN?</h2><ol class="bm" style="margin:0;padding-left:20px"><li>Open your browser\'s settings for this site.</li><li>Clear this site\'s stored data.</li><li>Every lock is gone, along with your other choices on this page. Nothing else changes.</li></ol></section>' +
      '<section class="section" id="new"><h2 class="tl">New ticket</h2><div class="chipline"><span class="bs mu">Start from:</span>' + presets.map(function (p, i) { return '<button class="chip" data-preset="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<label class="col" style="gap:4px"><span class="ll">Title <span class="bs mu">(what went wrong, in a few words)</span></span><input class="input" id="tk-title" maxlength="120"></label><span class="field-err" id="tk-title-err" role="alert"></span>' +
      '<label class="col" style="gap:4px"><span class="ll">What happened</span><textarea class="input" id="tk-what" style="font-family:inherit"></textarea></label>' +
      '<label class="col" style="gap:4px"><span class="ll">What you tried</span><input class="input" id="tk-tried"></label><div><button class="btn fill" data-act="ticket">Save the ticket</button></div></section>' +
      '<section class="section"><h2 class="tl">Your tickets</h2>' + (st.tickets.length ? st.tickets.map(function (t, i) { return '<div class="row-item" data-k="tk-' + t.t + '"><span class="col grow"><span class="ll">' + esc(t.title) + '</span><span class="bs mu">' + esc(t.what) + (t.tried ? ' · Tried: ' + esc(t.tried) : '') + '</span></span><button class="btn text sm" data-rmticket="' + i + '">Remove</button></div>'; }).join('') : '<p class="bm mu">No tickets yet.</p>') +
      '<button class="btn tonal" style="align-self:flex-start" data-act="copy-tickets">' + icon('ContentCopy', 's') + 'Copy your tickets as text</button></section></div>' + foot();
  };
  R.tools = function () {
    return '<div class="section" id="top"><h1 class="hl">' + L('tools') + '</h1><p class="bl mu">Small tools that run entirely in this browser.</p><div class="chipline">' + [['regex', 'Pattern workbench'], ['base64', 'Base64'], ['convert', 'Convert'], ['colour', 'Colour'], ['otp', 'Authenticator']].map(function (t) { return '<button class="chip" data-go="tools:' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
      '<section class="section" id="regex" data-k="t-regex"><h2 class="tl">Pattern workbench</h2><p class="bm mu">The same workbench every search on this page opens. Build a pattern, test it on your own text, read what it means.</p><div><button class="btn tonal" data-regex="">Open the workbench</button></div></section>' +
      '<section class="section" id="base64" data-k="t-b64"><h2 class="tl">Base64</h2><textarea class="input" id="b64in" placeholder="Text, or Base64 to decode" aria-label="Base64 input">Home Assistant Material</textarea><div class="chipline"><button class="btn tonal sm" data-act="b64enc">Encode</button><button class="btn tonal sm" data-act="b64dec">Decode</button>' +
      '<label class="row bm" style="gap:8px"><input type="checkbox" id="b64url"> URL-safe</label><label class="row bm" style="gap:8px"><input type="checkbox" id="b64pad" checked> Padding</label><label class="btn text sm">' + icon('Upload', 's') + 'A file<input type="file" id="b64file" hidden></label></div><pre class="wb-test" id="b64out" aria-live="polite"></pre></section>' +
      '<section class="section" id="convert" data-k="t-conv"><h2 class="tl">Convert</h2><p class="bm mu">Paste JSON (a list of objects) or CSV, then convert. Progress and errors show here.</p><textarea class="input" id="cvin" aria-label="Text to convert">[{"name": "Kitchen", "lights": 4}, {"name": "Study", "lights": 2}]</textarea><div class="chipline"><button class="btn tonal sm" data-conv="csv">To CSV</button><button class="btn tonal sm" data-conv="json">To JSON</button><button class="btn tonal sm" data-conv="yaml">To YAML</button><button class="btn tonal sm" data-conv="md">To Markdown</button></div><div id="cvstat" class="bs mu" aria-live="polite"></div><pre class="wb-test" id="cvout"></pre></section>' +
      '<section class="section" id="colour" data-k="t-col"><h2 class="tl">Colour</h2><div class="row" style="gap:16px;flex-wrap:wrap"><input type="color" id="colin" value="#00639b" aria-label="Pick a colour" style="width:64px;height:48px;border:0;background:none"><input class="input mono" id="coltext" value="#00639B" aria-label="Type a colour as hex, rgb() or hsl()"><span class="swatch" id="colsw" style="background:#00639B"></span></div><div id="colout" class="bm"></div></section>' +
      '<section class="section" id="otp" data-k="t-otp"><h2 class="tl">Authenticator</h2><p class="bm mu">Add a one-time code secret (Base32). Codes are worked out in this browser every 30 seconds. Or scan the QR code a site shows you: from an image, a pasted screenshot, or the camera. Nothing leaves this browser.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input class="input" id="otpname" placeholder="Name" aria-label="Name"><input class="input mono" id="otpsecret" placeholder="JBSWY3DPEHPK3PXP" aria-label="Secret"><button class="btn tonal sm" data-act="otpadd">Add</button></div><div class="chipline"><label class="btn tonal sm">' + icon('QrcodeScan', 's') + 'QR code from an image<input type="file" id="qrfile" accept="image/*" hidden></label><button class="btn tonal sm" data-act="qrcam">Use the camera</button><span class="bs mu">or paste a screenshot here</span></div><video id="qrvideo" class="qrvideo" hidden playsinline muted aria-label="Camera view for scanning a QR code"></video><div id="qrout" class="bs mu" aria-live="polite"></div><div id="otplist"></div></section>' + foot();
  };

  // ---------- Shell ----------
  function shell() {
    var app = $('#app');
    app.innerHTML = '<a class="skip" href="#main">Skip to the page</a><div class="shell edge-' + st.edge + '">' +
      '<header class="topbar" data-k="topbar"><a class="brand" href="#home" data-go="home:top"><span class="logo ' + st.logo.shape + '" style="' + (st.logo.color ? 'background:' + st.logo.color : '') + '" aria-hidden="true">' + esc((st.name || 'H').trim()[0] || 'H') + '</span><b>' + esc(st.name) + '</b></a>' +
      '<button class="btn tonal sm" data-act="palette" aria-label="' + esc(w('palette')) + ', Ctrl Shift F">' + icon('Magnify', 's') + '<span class="opt">' + L('search') + '</span><span class="kbd opt">Ctrl Shift F</span></button>' +
      '<button class="ib opt" data-act="theme" aria-label="' + esc(w('theme')) + '">' + icon('ThemeLightDark') + '</button>' +
      '<button class="ib" data-act="access" aria-label="' + esc(w('access')) + '">' + icon('HumanHandsup') + '</button>' +
      '<button class="ib opt" data-act="lang" aria-label="' + esc(w('language')) + ': ' + st.lang + '">' + icon('Translate') + '</button>' +
      '<button class="ib" data-act="bell" aria-label="' + esc(w('notifications')) + '" style="position:relative">' + icon('Bell') + '<span class="badge" id="bellcount" hidden>0</span></button></header>' +
      '<nav class="tabstrip" role="tablist" aria-label="Pages" aria-orientation="' + (st.edge === 'left' || st.edge === 'right' ? 'vertical' : 'horizontal') + '" data-k="tabs"></nav>' +
      '<main class="main" id="main">' + TABS.map(function (t) { return '<section class="pane" role="tabpanel" id="p-' + t + '" aria-labelledby="t-' + t + '" hidden></section>'; }).join('') + '</main></div>' +
      '<div class="toasts" aria-live="polite"></div>';
    tabstrip(); bell();
  }
  function tabstrip() {
    var nav = $('.tabstrip'); var order = st.tabs.open.slice().sort(function (a, b) { return (st.tabs.pinned.indexOf(b) >= 0) - (st.tabs.pinned.indexOf(a) >= 0); });
    nav.innerHTML = order.map(function (t) {
      var sel = t === st.active, pin = st.tabs.pinned.indexOf(t) >= 0;
      return '<button class="pt' + (sel ? ' sel' : '') + '" role="tab" id="t-' + t + '" aria-selected="' + sel + '" aria-controls="p-' + t + '" tabindex="' + (sel ? 0 : -1) + '" draggable="true" data-tab="' + t + '" data-k="tab-' + t + '">' + (pin ? icon('Pin', 'pin') : '') + L(t) +
        (pin ? '' : '<span class="x" role="button" tabindex="-1" data-closetab="' + t + '" aria-label="' + esc(w('close')) + ' ' + esc(w(t)) + '">' + icon('Close', 's') + '</span>') + '</button>';
    }).join('') + '<button class="ib" style="width:44px;height:44px;flex:none" data-act="newtab" aria-label="' + esc(w('newtab')) + '">' + icon('Plus') + '</button>';
  }
  function render() {
    if (st.tabs.open.indexOf(st.active) < 0) st.active = st.tabs.open[0] || 'home';
    if (!st.tabs.open.length) { st.tabs.open = ['home']; st.active = 'home'; }
    tabstrip();
    TABS.forEach(function (t) { var p = $('#p-' + t); p.hidden = t !== st.active; if (t === st.active) { p.innerHTML = R[t](); } else p.innerHTML = ''; });
    decorate($('#p-' + st.active)); applyVocab($('#app'));
    if (st.active === 'home') live.draw(); if (st.active === 'tools') { otpDraw(); colour(); }
    document.title = st.name + ' · ' + w(st.active);
  }
  // Appearance and locks are kept per element key (data-k).
  function decorate(root) {
    $$('[data-k]', $('#app')).forEach(function (el) {
      var k = el.dataset.k, look = st.look[k];
      if (look) { if (look.color) el.style.color = look.color; if (look.bg) el.style.background = look.bg; if (look.radius != null) el.style.borderRadius = look.radius + 'px'; if (look.size) el.style.fontSize = look.size + '%'; if (look.weight) el.style.fontWeight = look.weight; }
      var lk = st.locks[k]; var mark = el.querySelector(':scope > .lockmark');
      if (lk && !unlocked[k]) { el.classList.add('locked'); if (!mark) { el.insertAdjacentHTML('afterbegin', '<span class="lockmark" aria-label="Locked">' + icon('Lock', 's') + '</span>'); } }
      else { el.classList.remove('locked'); if (mark) mark.remove(); }
    });
    void root;
  }
  function go(target) {
    var p = String(target).split(':'), tab = p[0], anchor = p[1] || 'top';
    if (st.tabs.open.indexOf(tab) < 0) { st.tabs.open.push(tab); }
    st.active = tab; save(); render();
    setTimeout(function () { var el = document.getElementById(anchor) || $('#p-' + tab); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1500); var f = el.matches('input,button,select,textarea,a') ? el : el.querySelector('input,button,select,textarea,a'); if (f) f.focus({ preventScroll: true }); } }, 30);
  }

  // ---------- Dialogs ----------
  function dialog(title, body, opts) {
    opts = opts || {};
    closeDialog();
    var ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'ov';
    var em = st.emoji && opts.emoji ? opts.emoji + ' ' : '';
    ov.innerHTML = '<div class="dialog' + (opts.full ? ' full' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><h2 class="tl" id="dlg-t">' + esc(em) + esc(title) + '</h2>' + (opts.extra || '') + '<button class="ib" data-act="dlg-close" aria-label="' + esc(w('close')) + '">' + icon('Close') + '</button></header>' + body + '</div>';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeDialog(); });
    $('#app').appendChild(ov); lastFocus = document.activeElement; var f = ov.querySelector(opts.focus || 'input,select,textarea,button:not([data-act="dlg-close"])'); if (f) f.focus();
    applyVocab(ov);
    return ov;
  }
  var lastFocus = null;
  function closeDialog() { var o = $('#ov'); if (o) { o.remove(); if (lastFocus && lastFocus.focus) lastFocus.focus(); } }

  // Two-step confirmation: what will happen, then the name typed.
  function superConfirm(what, items, word, done) {
    dialog(what, '<ul class="bm" style="margin:0;padding-left:20px">' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '<li>This cannot be undone.</li></ul><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn tonal" id="sc1">Continue</button></div>', { emoji: '⚠️' });
    $('#sc1').addEventListener('click', function () {
      dialog('Type ' + word + ' to confirm', '<p class="bm">Step 2 of 2. Type <b class="mono">' + esc(word) + '</b> exactly.</p><input class="input" id="sc2in" aria-label="Type ' + esc(word) + '" autocomplete="off"><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn err" id="sc2" disabled>' + esc(what) + '</button></div>');
      var inp = $('#sc2in'), b = $('#sc2'); inp.addEventListener('input', function () { b.disabled = inp.value !== word; });
      b.addEventListener('click', function () { closeDialog(); done(); });
    });
  }

  // ---------- Pattern workbench ----------
  var wbTarget = null;
  var LIB = [['A word, any case', '\\bkitchen\\b', 'i'], ['Starts with', '^Home', ''], ['Digits', '\\d+', 'g'], ['An entity id', '\\b(light|switch|sensor)\\.\\w+', 'g'], ['A date', '\\d{4}-\\d{2}-\\d{2}', 'g'], ['Either word', '\\b(map|energy)\\b', 'gi']];
  var BLOCKS = [['\\b', 'Word edge'], ['\\w+', 'Letters or digits'], ['\\d', 'A digit'], ['\\s', 'Space'], ['.', 'Any character'], ['^', 'Start'], ['$', 'End'], ['( )', 'Group'], ['( )?', 'Optional group'], ['[ ]', 'Any one of'], ['|', 'Or'], ['*', 'Zero or more'], ['+', 'One or more']];
  function explainRe(p) {
    var out = [], i = 0; var D = { '\\b': 'a word edge', '\\B': 'not a word edge', '\\d': 'a digit', '\\D': 'not a digit', '\\w': 'a letter, digit or _', '\\W': 'not a letter or digit', '\\s': 'a space', '\\S': 'not a space', '.': 'any character', '^': 'the start', '$': 'the end', '|': 'or', '*': 'repeat 0 or more times', '+': 'repeat 1 or more times', '?': 'optional', '(': 'start a group', ')': 'end a group' };
    while (i < p.length) {
      var two = p.substr(i, 2); if (D[two]) { out.push([two, D[two]]); i += 2; continue; }
      if (p[i] === '\\') { out.push([two, 'the character ' + p[i + 1]]); i += 2; continue; }
      if (p[i] === '[') { var j = p.indexOf(']', i + 1); if (j < 0) j = p.length - 1; out.push([p.slice(i, j + 1), 'one of these']); i = j + 1; continue; }
      if (p[i] === '{') { var k = p.indexOf('}', i); if (k < 0) k = p.length - 1; out.push([p.slice(i, k + 1), 'repeat this many times']); i = k + 1; continue; }
      if (D[p[i]]) { out.push([p[i], D[p[i]]]); i++; continue; }
      var s = i; while (i < p.length && /[^\\.^$|*+?()[\]{}]/.test(p[i])) i++; out.push([p.slice(s, i), 'the letters ' + p.slice(s, i)]);
    }
    return out;
  }
  function workbench(targetId) {
    wbTarget = targetId || null;
    var cur = targetId && $('#' + targetId) ? $('#' + targetId).value : ''; var mm = cur.match(/^\/(.+)\/([dgimsuvy]*)$/);
    var pat = mm ? mm[1] : (cur ? cur.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') : ''), flags = mm ? mm[2] : 'i';
    var flagRow = [['g', 'Find all matches'], ['i', 'Ignore case'], ['m', 'Multi-line'], ['s', 'Dot matches line breaks'], ['u', 'Unicode'], ['y', 'Sticky']].map(function (f) { return '<button class="chip' + (flags.indexOf(f[0]) >= 0 ? ' sel' : '') + '" aria-pressed="' + (flags.indexOf(f[0]) >= 0) + '" data-flag="' + f[0] + '"><span class="mono">' + f[0] + '</span> ' + f[1] + '</button>'; }).join('');
    dialog('Pattern workbench', '<p class="bs mu">' + (targetId ? 'Opened from a search. Your pattern goes back there when you choose Use.' : 'Build and test a regular expression.') + '</p>' +
      '<label class="col" style="gap:4px"><span class="ll">Pattern</span><input class="input mono" id="wbpat" value="' + esc(pat) + '" autocomplete="off" spellcheck="false"></label><span class="field-err" id="wberr" role="alert"></span>' +
      '<div class="chipline" role="group" aria-label="Flags">' + flagRow + '</div>' +
      '<details open><summary class="ll" style="cursor:pointer;min-height:36px">Building blocks</summary><div class="chipline">' + BLOCKS.map(function (b) { return '<button class="chip" data-block="' + esc(b[0]) + '"><span class="mono">' + esc(b[0]) + '</span> ' + b[1] + '</button>'; }).join('') + '</div></details>' +
      '<details><summary class="ll" style="cursor:pointer;min-height:36px">Library</summary><div class="chipline">' + LIB.map(function (l, i) { return '<button class="chip" data-lib="' + i + '">' + l[0] + '</button>'; }).join('') + '</div></details>' +
      '<label class="col" style="gap:4px"><span class="ll">Test text</span><textarea class="input" id="wbtext">light.kitchen_counter\nswitch.kitchen\nsensor.study_temperature\nMap\nEnergy\n2026-11-10</textarea></label>' +
      '<div class="ll" id="wbcount" aria-live="polite"></div><div class="wb-test" id="wbhits"></div><div><span class="ll">How it reads</span><div id="wbexp"></div></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn text sm" data-act="wb-copy">' + icon('ContentCopy', 's') + L('copy') + '</button><span class="grow"></span><button class="btn out" data-act="dlg-close">' + L('cancel') + '</button>' + (targetId ? '<button class="btn fill" data-act="wb-use">Use this pattern</button>' : '') + '</div>', { focus: '#wbpat' });
    var fl = flags;
    function upd() {
      var p = $('#wbpat').value, t = $('#wbtext').value, err = '', re = null;
      try { re = new RegExp(p, fl.indexOf('g') < 0 ? fl + 'g' : fl); } catch (e) { err = e.message; }
      $('#wberr').textContent = err ? 'This pattern does not work: ' + err : '';
      $('#wbpat').classList.toggle('bad', !!err);
      if (re && p) { var n = 0, h = '', last = 0, m2, guard = 0; re.lastIndex = 0; while ((m2 = re.exec(t)) && guard++ < 1000) { if (m2[0] === '') { re.lastIndex++; continue; } n++; h += esc(t.slice(last, m2.index)) + '<mark class="hit">' + esc(m2[0]) + '</mark>'; last = m2.index + m2[0].length; } h += esc(t.slice(last)); $('#wbhits').innerHTML = h; $('#wbcount').textContent = n + (n === 1 ? ' match' : ' matches'); }
      else { $('#wbhits').textContent = t; $('#wbcount').textContent = p ? '' : 'Type a pattern to see matches.'; }
      $('#wbexp').innerHTML = p && !err ? explainRe(p).map(function (x) { return '<span class="tok"><span class="mono ll" style="color:var(--p)">' + esc(x[0]) + '</span><span class="bs">' + esc(x[1]) + '</span></span>'; }).join('') : '';
    }
    var ov = $('#ov');
    ov.addEventListener('input', upd);
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.flag) { var f = b.dataset.flag; fl = fl.indexOf(f) >= 0 ? fl.replace(f, '') : fl + f; b.classList.toggle('sel'); b.setAttribute('aria-pressed', fl.indexOf(f) >= 0); upd(); }
      if (b.dataset.block) { var inp = $('#wbpat'), s = inp.selectionStart || inp.value.length; inp.value = inp.value.slice(0, s) + b.dataset.block + inp.value.slice(inp.selectionEnd || s); inp.focus(); upd(); }
      if (b.dataset.lib) { var l = LIB[+b.dataset.lib]; $('#wbpat').value = l[1]; fl = l[2]; $$('[data-flag]', ov).forEach(function (c) { var on = fl.indexOf(c.dataset.flag) >= 0; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', on); }); upd(); }
      if (b.dataset.act === 'wb-copy') { copy('/' + $('#wbpat').value + '/' + fl.replace('g', '')); }
      if (b.dataset.act === 'wb-use') { var v = '/' + $('#wbpat').value + '/' + fl.replace(/[gy]/g, ''); var tid = wbTarget; closeDialog(); var tf = $('#' + tid); if (tf) { tf.value = v; tf.dispatchEvent(new Event('input', { bubbles: true })); tf.focus(); } }
    });
    upd();
  }

  // ---------- Command palette ----------
  function paletteItems() {
    var items = [];
    TABS.forEach(function (t) { items.push({ kind: 'Page', label: w(t), go: t + ':top', icon: 'TabPlus' }); });
    S.features.forEach(function (f) { items.push({ kind: 'Article', label: f.name, go: 'articles:top', article: f.id, icon: 'BookOpenVariant', sub: f.what }); });
    [['lang', 'Language mode', 'seg', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']]], ['theme', 'Theme', 'seg', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]], ['school', 'School mode', 'sw'], ['lowStim', 'Low stimulation', 'sw'], ['spotlight', 'Focus spotlight', 'sw'], ['reduceMotion', 'Reduce motion', 'sw'], ['contrast', 'More contrast', 'sw'], ['bigTargets', 'Larger targets', 'sw'], ['sounds', 'Action sounds', 'sw'], ['emoji', 'Emoji in dialogs', 'sw'], ['dimsum', 'Dim sum surprise', 'sw'],
      ['textScale', 'Text size', 'seg', [['1', '100%'], ['1.5', '150%'], ['2', '200%']]], ['edge', 'Where the tabs sit', 'seg', [['top', 'Top'], ['left', 'Left'], ['bottom', 'Bottom']]]].forEach(function (s) { items.push({ kind: 'Setting', label: s[1], go: 'settings:s-' + (s[0] === 'textScale' ? 'textScale' : s[0]), set: s }); });
    [['Open every tab', 'openall'], ['Export settings as JSON', 'exp-json'], ['Show a dim sum', 'dimsum'], ['Open the pattern workbench', 'wb'], ['Open the welcome', 'welcome'], ['Reset everything', 'resetall']].forEach(function (a) { items.push({ kind: 'Action', label: a[0], act: a[1], icon: 'ChevronRight' }); });
    return items;
  }
  var palSel = 0;
  function palette() {
    dialog(w('palette'), findField('palq', 'Search pages, settings, articles and actions', '') + '<div class="cmd-list" id="pallist" role="listbox" aria-label="Results"></div><p class="bs mu">Arrow keys move, Enter goes, Escape closes. Settings change right in the list.</p>',
      { full: st.paletteFull, extra: '<button class="ib" data-act="pal-size" aria-label="' + (st.paletteFull ? 'Smaller' : 'Full window') + '">' + icon('Fullscreen') + '</button>', focus: '#palq' });
    var items = paletteItems(); palSel = 0;
    function draw() {
      var m = matcher($('#palq').value); var list = items.filter(function (i) { return m.test(i.label + ' ' + i.kind + ' ' + (i.sub || '')); }).slice(0, 60);
      $('#pallist').innerHTML = list.length ? list.map(function (i, n) {
        var ctl = '';
        if (i.set) { ctl = i.set[2] === 'sw' ? sw(i.set[0], i.label) : seg(i.set[0], i.set[3], i.label); }
        return '<div class="cmd-row' + (n === palSel ? ' act' : '') + '" role="option" aria-selected="' + (n === palSel) + '" data-n="' + n + '"><span class="tag">' + i.kind + '</span><span class="col grow" style="min-width:0"><span class="ll">' + esc(i.label) + '</span>' + (i.sub ? '<span class="bs mu" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(i.sub) + '</span>' : '') + '</span>' + ctl + '</div>';
      }).join('') : '<p class="bm mu">' + L('noMatch') + (m.ok ? '' : ' ' + esc(m.error)) + '</p>';
      $('#pallist').__list = list;
    }
    function run(i) { if (!i) return; closeDialog(); if (i.article) { view.article = i.article; go('articles:top'); } else if (i.go) go(i.go); else action(i.act); }
    $('#palq').addEventListener('input', function () { palSel = 0; draw(); });
    $('#palq').addEventListener('keydown', function (e) { var l = $('#pallist').__list || []; if (e.key === 'ArrowDown') { palSel = Math.min(l.length - 1, palSel + 1); draw(); e.preventDefault(); } if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); draw(); e.preventDefault(); } if (e.key === 'Enter') { run(l[palSel]); e.preventDefault(); } });
    $('#pallist').addEventListener('click', function (e) { if (e.target.closest('[data-toggle],[data-set]')) { setTimeout(draw, 0); return; } var r = e.target.closest('.cmd-row'); if (r) run(($('#pallist').__list || [])[+r.dataset.n]); });
    draw();
  }

  // ---------- Element menu, appearance and locks ----------
  function elKey(t) { var el = t && t.closest ? t.closest('[data-k]') : null; return el; }
  function closePop() { $$('.popover').forEach(function (p) { p.remove(); }); }
  function menuFor(el, x, y) {
    closePop(); if (!el) return;
    var k = el.dataset.k, lk = st.locks[k], label = (el.getAttribute('aria-label') || el.textContent || k).trim().replace(/\s+/g, ' ').slice(0, 40);
    var items = [['A', 'editLook', 'FormatPaint', 'look'], ['C', 'copyText', 'ContentCopy', 'copy'], ['R', 'readAloud', 'AccountVoice', 'read'], ['L', lk ? 'unlockEl' : 'lockEl', lk ? 'LockOpenVariant' : 'LockOutline', 'lock'], ['S', 'searchFor', 'Magnify', 'search']];
    if (st.look[k]) items.push(['Z', 'resetLook', 'Restore', 'unlook']);
    var p = document.createElement('div'); p.className = 'popover'; p.setAttribute('role', 'menu'); p.setAttribute('aria-label', 'Tools for ' + label);
    p.innerHTML = '<div class="bs mu" style="padding:6px 10px">' + esc(label) + '</div>' + findField('menuq', w('filterMenu'), '') + '<div id="menuitems">' + items.map(function (i) { return '<button class="mi" role="menuitem" data-mi="' + i[3] + '" data-name="' + esc(w(i[1])) + '">' + icon(i[2], 's') + '<span class="bm">' + L(i[1]) + '</span><span class="kbd">Alt ' + i[0] + '</span></button>'; }).join('') + '</div><p class="bs mu" id="menunone" hidden style="padding:6px 10px">' + L('noMatch') + '</p>';
    $('#app').appendChild(p);
    var r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    applyVocab(p); $('#menuq').focus();
    p.__el = el; p.__label = label;
    $('#menuq').addEventListener('input', function () { var m = matcher(this.value), any = false; $$('.mi', p).forEach(function (b) { var ok = m.test(b.dataset.name); b.hidden = !ok; any = any || ok; }); $('#menunone').hidden = any; });
    p.addEventListener('keydown', function (e) {
      if (e.altKey) { var map = { a: 'look', c: 'copy', r: 'read', l: 'lock', s: 'search', z: 'unlook' }; var a = map[e.key.toLowerCase()]; if (a) { e.preventDefault(); menuAct(a, p); } }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { var bs = $$('.mi:not([hidden]),#menuq', p); var i = bs.indexOf(document.activeElement); var n = bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]; if (n) n.focus(); e.preventDefault(); }
    });
    p.addEventListener('click', function (e) { var b = e.target.closest('[data-mi]'); if (b) menuAct(b.dataset.mi, p); });
  }
  function menuAct(a, p) {
    var el = p.__el, k = el.dataset.k, label = p.__label; closePop();
    if (a === 'copy') copy(el.innerText.trim());
    if (a === 'read') speak(el.innerText.trim());
    if (a === 'search') { palette(); $('#palq').value = label.split(' ').slice(0, 3).join(' '); $('#palq').dispatchEvent(new Event('input')); }
    if (a === 'look') { if (isLocked(k)) return askUnlock(k); lookEditor(el); }
    if (a === 'unlook') { var b = st.look[k]; delete st.look[k]; st.history.unshift({ t: Date.now(), path: 'look.' + k, label: 'Appearance of ' + label, before: b, after: null }); save(); render(); }
    if (a === 'lock') { if (st.locks[k]) { if (isLocked(k)) askUnlock(k, function () { removeLock(k); }); else removeLock(k); } else lockWizard(k, label); }
  }
  function isLocked(k) { return !!(st.locks[k] && !unlocked[k]); }
  function removeLock(k) { delete st.locks[k]; delete unlocked[k]; saveOpen(); save(); render(); toast('Lock removed.'); }
  function saveOpen() { try { sessionStorage.setItem(KEY + '-open', JSON.stringify(unlocked)); } catch (e) { /* no session storage */ } }
  function lookEditor(el) {
    var k = el.dataset.k, cur = st.look[k] || {}, before = JSON.parse(JSON.stringify(cur));
    closePop(); var p = document.createElement('div'); p.className = 'popover'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Edit appearance');
    var cs = getComputedStyle(el);
    p.innerHTML = '<div class="row" style="gap:8px;padding:4px 6px"><span class="ll grow">' + L('editLook') + '</span><button class="ib" data-x aria-label="' + esc(w('close')) + '">' + icon('Close', 's') + '</button></div>' +
      '<label class="row" style="gap:10px;padding:6px 10px"><span class="bm grow">Text colour</span><input type="color" data-p="color" value="' + toHex(cur.color || cs.color) + '"></label>' +
      '<label class="row" style="gap:10px;padding:6px 10px"><span class="bm grow">Background</span><input type="color" data-p="bg" value="' + toHex(cur.bg || cs.backgroundColor) + '"></label>' +
      '<label class="col" style="gap:4px;padding:6px 10px"><span class="bm">Corners</span><input type="range" min="0" max="48" data-p="radius" value="' + (cur.radius != null ? cur.radius : parseInt(cs.borderRadius, 10) || 0) + '"></label>' +
      '<label class="col" style="gap:4px;padding:6px 10px"><span class="bm">Text size</span><input type="range" min="70" max="200" data-p="size" value="' + (cur.size || 100) + '"></label>' +
      '<label class="row" style="gap:10px;padding:6px 10px"><span class="bm grow">Weight</span><select class="select" data-p="weight"><option value="">As drawn</option><option' + (cur.weight == 400 ? ' selected' : '') + '>400</option><option' + (cur.weight == 500 ? ' selected' : '') + '>500</option><option' + (cur.weight == 700 ? ' selected' : '') + '>700</option></select></label>' +
      '<div class="row" style="gap:8px;padding:6px"><button class="btn text sm" data-reset>' + L('reset') + '</button><span class="grow"></span><button class="btn fill sm" data-x>' + L('done') + '</button></div>';
    $('#app').appendChild(p); var r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    var left = r.right + 12 + pr.width < innerWidth ? r.right + 12 : Math.max(8, r.left - pr.width - 12); p.style.left = Math.max(8, Math.min(left, innerWidth - pr.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(r.top, innerHeight - pr.height - 8)) + 'px';
    p.querySelector('input,select').focus();
    p.addEventListener('input', function (e) { var t = e.target; if (!t.dataset.p) return; cur[t.dataset.p] = t.type === 'range' ? +t.value : t.value; st.look[k] = cur; decorate(); });
    p.addEventListener('click', function (e) {
      if (e.target.closest('[data-reset]')) { cur = {}; delete st.look[k]; el.removeAttribute('style'); render(); }
      if (e.target.closest('[data-x]')) { p.remove(); if (JSON.stringify(before) !== JSON.stringify(cur)) { st.history.unshift({ t: Date.now(), path: 'look.' + k, label: 'Appearance of ' + k, before: Object.keys(before).length ? before : undefined, after: cur }); toast(msg('saved')); } save(); el.focus && el.focus(); }
    });
  }
  function toHex(c) { var m = String(c).match(/\d+/g); if (!m || m.length < 3) return '#000000'; if (String(c).indexOf('rgba') === 0 && m[3] === '0') return '#ffffff'; return '#' + m.slice(0, 3).map(function (n) { return ('0' + (+n).toString(16)).slice(-2); }).join(''); }
  async function hash(pin, salt) { var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)); return Array.from(new Uint8Array(b)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function lockWizard(k, label) {
    dialog('Lock ' + label, '<p class="bm">Step 1 of 2. Choose a PIN of 4 to 12 digits, then enter it again.</p><input class="input mono" id="pin1" inputmode="numeric" type="password" aria-label="PIN" maxlength="12"><input class="input mono" id="pin2" inputmode="numeric" type="password" aria-label="PIN again" maxlength="12"><span class="field-err" id="pinerr" role="alert"></span>' +
      '<div class="note"><span>' + icon('EmoticonHappyOutline') + '</span><span class="bm">This lock is just for fun. It is a speed bump, not security, and does not protect anything from anyone else who uses this browser. Forgot it? Clear this site\'s storage in your browser to remove every lock.</span></div>' +
      '<label class="row bm" style="gap:10px"><input type="checkbox" id="pinack" style="width:20px;height:20px"> I understand this is just for fun</label><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="pinok">Create lock</button></div>', { emoji: '🔒' });
    $('#pinok').addEventListener('click', async function () {
      var a = $('#pin1').value, b = $('#pin2').value, e = $('#pinerr');
      if (!/^\d{4,12}$/.test(a)) { e.textContent = 'Use 4 to 12 digits.'; return; } if (a !== b) { e.textContent = 'The two PINs did not match.'; return; } if (!$('#pinack').checked) { e.textContent = 'Tick the box to say you understand.'; return; }
      var salt = Math.random().toString(36).slice(2); st.locks[k] = { label: label, salt: salt, hash: await hash(a, salt), tries: 0, until: 0 }; save(); closeDialog(); render(); toast(msg('locked'), { emoji: '🔒' });
    });
  }
  var LADDER = [0, 0, 0, 5, 15, 60, 300];
  function askUnlock(k, after) {
    var lk = st.locks[k]; if (!lk) return; var entered = '';
    var order = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    dialog('Unlock ' + lk.label, '<div class="dots" id="pdots" role="img" aria-label="Digits entered"></div><div class="keypad" id="kp">' + order.map(function (d) { return '<button data-d="' + d + '" aria-label="' + d + '">' + d + '</button>'; }).join('') + '<button class="f" data-d="C">Clear</button><button data-d="0" aria-label="0">0</button><button class="f" data-d="B" aria-label="Backspace">' + icon('Backspace') + '</button></div>' +
      '<label class="col" style="gap:4px"><span class="bs mu">Or type it</span><input class="input mono" id="pintype" inputmode="numeric" type="password" aria-label="PIN" maxlength="12"></label><div class="bm" id="pinmsg" role="status"></div>' +
      '<div class="row" style="gap:8px"><button class="btn text sm" id="shuf">' + icon('Shuffle', 's') + 'Shuffle the keys</button><span class="grow"></span><button class="btn out" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="pinsub">Submit</button></div>', { focus: '#pintype', emoji: '🔑' });
    function dots() { $('#pdots').innerHTML = Array.from({ length: Math.max(4, entered.length) }).map(function (_, i) { return '<span class="' + (i < entered.length ? 'on' : '') + '"></span>'; }).join(''); }
    function wait() { var left = Math.ceil((lk.until - Date.now()) / 1000); var sub = $('#pinsub'); if (!sub) return; if (left > 0) { sub.disabled = true; $('#pinmsg').textContent = 'Too many tries. Wait ' + left + ' seconds.'; setTimeout(wait, 500); } else { sub.disabled = false; if (/Wait/.test($('#pinmsg').textContent)) $('#pinmsg').textContent = ''; } }
    dots(); wait();
    $('#kp').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var d = b.dataset.d; if (d === 'C') entered = ''; else if (d === 'B') entered = entered.slice(0, -1); else if (entered.length < 12) entered += d; $('#pintype').value = entered; dots(); });
    $('#pintype').addEventListener('input', function () { entered = this.value.replace(/\D/g, ''); dots(); });
    $('#shuf').addEventListener('click', function () { var ds = order.concat(['0']).sort(function () { return Math.random() - 0.5; }); $$('#kp [data-d]').filter(function (b) { return /\d/.test(b.dataset.d); }).forEach(function (b, i) { b.dataset.d = ds[i]; b.textContent = ds[i]; b.setAttribute('aria-label', ds[i]); }); });
    async function submit() {
      if (Date.now() < lk.until) return;
      if ((await hash(entered, lk.salt)) === lk.hash) { lk.tries = 0; unlocked[k] = 1; saveOpen(); save(); closeDialog(); render(); toast(msg('unlocked')); if (after) after(); }
      else { lk.tries++; var s = LADDER[Math.min(lk.tries, LADDER.length - 1)]; lk.until = Date.now() + s * 1000; save(); beep('bad'); $('#pinmsg').textContent = msg('wrong') + ' Tries in a row: ' + lk.tries + '. Forgot it? Clear this site\'s storage in your browser to remove every lock.'; entered = ''; $('#pintype').value = ''; dots(); wait(); }
    }
    $('#pinsub').addEventListener('click', submit); $('#pintype').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ---------- Panels ----------
  function notePanel() {
    var old = $('.panel'); if (old) { old.remove(); return; }
    st.notes.forEach(function (n) { n.read = true; }); save(); bell();
    var p = document.createElement('div'); p.className = 'panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', w('notifications'));
    function draw() {
      var m = matcher(($('#nq', p) || {}).value);
      p.innerHTML = '<div class="row" style="gap:8px"><h2 class="tl grow">' + L('notifications') + '</h2>' + (st.notes.length ? '<button class="btn text sm" data-nclear>' + L('clear') + '</button>' : '') + '<button class="ib" data-nx aria-label="' + esc(w('close')) + '">' + icon('Close', 's') + '</button></div>' + findField('nq', 'Search notifications', '') +
        (st.notes.length ? st.notes.filter(function (n) { return m.test(n.text); }).map(function (n) { return '<div class="row-item" style="margin:0"><span class="col grow"><span class="bm">' + esc(n.text) + '</span><span class="bs mu">' + new Date(n.t).toLocaleTimeString() + '</span></span></div>'; }).join('') : '<p class="bm mu">' + esc(msg('emptyNotes')) + '</p>');
    }
    draw(); $('#app').appendChild(p); applyVocab(p);
    p.addEventListener('click', function (e) { if (e.target.closest('[data-nx]')) p.remove(); if (e.target.closest('[data-nclear]')) { st.notes = []; save(); draw(); bell(); } });
    p.addEventListener('input', function (e) { if (e.target.id === 'nq') { var v = e.target.value; draw(); var f = $('#nq', p); f.value = v; f.focus(); } });
    $('[data-nx]', p).focus();
  }
  function accessPanel() {
    var old = $('.panel'); if (old) { old.remove(); return; }
    var p = document.createElement('div'); p.className = 'panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', w('access'));
    function draw() {
      p.innerHTML = '<div class="row" style="gap:8px"><h2 class="tl grow">' + L('access') + '</h2><button class="ib" data-ax aria-label="' + esc(w('close')) + '">' + icon('Close', 's') + '</button></div>' +
        [['textScale', 'Text size'], ['contrast', 'More contrast'], ['reduceMotion', 'Reduce motion'], ['focusRing', 'Visible focus'], ['bigTargets', 'Larger targets'], ['spotlight', 'Focus spotlight']].map(function (s) { return '<div class="setting"><span class="ll">' + s[1] + '</span><div class="ctl">' + (s[0] === 'textScale' ? seg('textScale', [['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%']], 'Text size') : sw(s[0], s[1])) + '</div></div>'; }).join('') +
        '<button class="btn text sm" data-axread>' + icon('AccountVoice', 's') + 'Read this page aloud</button><button class="btn text sm" data-go="settings:accessibility">All accessibility settings</button>';
    }
    draw(); $('#app').appendChild(p);
    p.addEventListener('click', function (e) { if (e.target.closest('[data-ax]')) p.remove(); if (e.target.closest('[data-axread]')) speak($('#p-' + st.active).innerText); setTimeout(draw, 0); });
    $('[data-ax]', p).focus();
  }

  // ---------- Small helpers ----------
  function copy(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast(msg('copied')); }, function () { toast('The browser did not allow copying.'); }); }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function rows2csv(rows) { var ks = Object.keys(rows[0] || {}); return [ks.join(',')].concat(rows.map(function (r) { return ks.map(function (k) { var v = r[k] == null ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); })).join('\n'); }
  function rows2md(rows) { var ks = Object.keys(rows[0] || {}); return '| ' + ks.join(' | ') + ' |\n| ' + ks.map(function () { return '---'; }).join(' | ') + ' |\n' + rows.map(function (r) { return '| ' + ks.map(function (k) { return String(typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k] == null ? '' : r[k]).replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }).join('\n'); }
  function settingsRows() { var keep = ['lang', 'funEn', 'funYue', 'emoji', 'school', 'lowStim', 'spotlight', 'dimsum', 'theme', 'seed', 'density', 'textScale', 'reduceMotion', 'contrast', 'focusRing', 'bigTargets', 'sounds', 'volume', 'voice', 'schedule', 'name', 'logo', 'edge']; return keep.map(function (k) { return { setting: k, value: st[k] }; }); }
  function exportWhat(what) {
    var stamp = new Date().toISOString().slice(0, 10);
    if (what === 'features') { var rows = S.features.map(function (f) { return { id: f.id, group: f.group, name: f.name, state: f.state, onThisPage: f.here }; }); dialog('Export features', ['json', 'csv', 'md', 'txt'].map(function (f) { return '<button class="btn tonal" data-fx="' + f + '">' + f.toUpperCase() + '</button>'; }).join(' ')); $('#ov').addEventListener('click', function (e) { var b = e.target.closest('[data-fx]'); if (!b) return; var f = b.dataset.fx; download('features-' + stamp + '.' + f, f === 'json' ? JSON.stringify(rows, null, 2) : f === 'csv' ? rows2csv(rows) : f === 'md' ? rows2md(rows) : rows.map(function (r) { return r.name + ' (' + r.state + '): ' + r.onThisPage; }).join('\n')); closeDialog(); }); return; }
    if (what === 'history') { var h = st.history.map(function (x) { return { when: new Date(x.t).toISOString(), change: x.label, before: x.before, after: x.after }; }); download('history-' + stamp + '.json', JSON.stringify(h, null, 2), 'application/json'); return; }
    var f2 = what.split('-')[1], r2 = settingsRows();
    download('settings-' + stamp + '.' + f2, f2 === 'json' ? JSON.stringify(r2, null, 2) : f2 === 'csv' ? rows2csv(r2) : f2 === 'md' ? rows2md(r2) : r2.map(function (r) { return r.setting + ': ' + JSON.stringify(r.value); }).join('\n'));
  }
  var DIM = [['Har gow', 'Shrimp in a thin, see-through wrapper, pleated by hand.'], ['Siu mai', 'Open-topped pork and shrimp dumplings, often with a dot of roe.'], ['Char siu bao', 'Soft steamed buns with sweet barbecued pork inside.'], ['Cheung fun', 'Rice noodle rolls with soy sauce poured over at the table.'], ['Lo mai gai', 'Sticky rice with chicken, steamed in a lotus leaf.'], ['Dan tat', 'Egg tarts with a wobbly custard and flaky pastry.'], ['Lo bak go', 'Turnip cake, pan-fried until the edges crisp.']];
  function dimsum(force) { if ((!st.dimsum || st.school) && !force) return; var d = DIM[Math.floor(Math.random() * DIM.length)]; toast(d[0] + ': ' + d[1] + ' (Names only: this page loads no photos from other sites.)', { emoji: '🥟' }); }
  function action(a) {
    if (a === 'openall') { var before = st.tabs.open.slice(); st.tabs.open = TABS.slice(); save(); render(); toast('Every tab is open.', { undo: function () { st.tabs.open = before; save(); render(); } }); }
    if (a === 'exp-json') exportWhat('settings-json');
    if (a === 'dimsum') dimsum(true);
    if (a === 'wb') workbench('');
    if (a === 'welcome') welcome(true);
    if (a === 'resetall') superConfirm('Reset everything', ['Every setting goes back to its default.', 'Every lock, history entry, ticket and authenticator secret on this page is removed.'], 'RESET', function () { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY + '-open'); } catch (e) { /* storage off */ } st = load(); unlocked = {}; apply(); shell(); render(); toast(msg('reset')); });
  }
  function welcome(force) {
    if (st.welcomed && !force) return;
    var steps = [['Choose a language', seg('lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], 'Language mode') + '<p class="bs mu">Every label changes at once. You can change it any time in Settings.</p>'],
      ['Choose light or dark', seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], 'Theme')],
      ['You are set', '<p class="bm">Press Ctrl Shift F to search everything. Right-click anything to edit its appearance or lock it. Every tab is open; close the ones you do not need.</p>']];
    var i = Math.min(st.welcomeStep || 0, steps.length - 1);
    function draw() {
      dialog(w('welcome') + ' · ' + (i + 1) + ' of ' + steps.length, '<h3 class="tm">' + steps[i][0] + '</h3>' + steps[i][1] + '<div class="row" style="gap:8px"><button class="btn text" id="wskip">' + L('skip') + '</button><span class="grow"></span>' + (i ? '<button class="btn text" id="wback">' + L('back') + '</button>' : '') + '<button class="btn fill" id="wnext">' + (i === steps.length - 1 ? L('done') : L('next')) + '</button></div>', { emoji: '👋' });
      $('#wnext').onclick = function () { if (i === steps.length - 1) { st.welcomed = true; st.welcomeStep = 0; save(); closeDialog(); } else { i++; st.welcomeStep = i; save(); draw(); } };
      if ($('#wback')) $('#wback').onclick = function () { i--; st.welcomeStep = i; save(); draw(); };
      $('#wskip').onclick = function () { st.welcomed = true; save(); closeDialog(); };
    }
    draw();
  }

  // ---------- Tools ----------
  function b64(enc) { var t = $('#b64in').value, url = $('#b64url').checked, pad = $('#b64pad').checked, out;
    try { if (enc) { out = btoa(unescape(encodeURIComponent(t))); if (url) out = out.replace(/\+/g, '-').replace(/\//g, '_'); if (!pad) out = out.replace(/=+$/, ''); } else { var s = t.trim().replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; out = decodeURIComponent(escape(atob(s))); } }
    catch (e) { out = 'That is not valid Base64, or it is not text. ' + e.message; }
    $('#b64out').textContent = out; }
  function convert(to) {
    var t = $('#cvin').value.trim(), stat = $('#cvstat'), outEl = $('#cvout'), rows;
    stat.textContent = 'Reading…';
    try { if (/^[[{]/.test(t)) { rows = JSON.parse(t); if (!Array.isArray(rows)) rows = [rows]; } else { var lines = t.split(/\r?\n/).filter(Boolean), head = lines.shift().split(','); rows = lines.map(function (l) { var v = l.split(','); var o = {}; head.forEach(function (h, i) { o[h.trim()] = (v[i] || '').trim(); }); return o; }); } }
    catch (e) { stat.textContent = 'Stopped: the text is neither JSON nor CSV. ' + e.message + ' Fix it above and convert again.'; outEl.textContent = ''; return; }
    stat.textContent = 'Converting ' + rows.length + ' rows…';
    var out = to === 'csv' ? rows2csv(rows) : to === 'md' ? rows2md(rows) : to === 'yaml' ? rows.map(function (r) { return Object.keys(r).map(function (k, i) { return (i ? '  ' : '- ') + k + ': ' + JSON.stringify(r[k]); }).join('\n'); }).join('\n') : JSON.stringify(rows, null, 2);
    outEl.textContent = out; stat.textContent = 'Done: ' + rows.length + ' rows.';
  }
  function colour() {
    var t = $('#coltext'); if (!t) return; var c = t.value.trim(), probe = document.createElement('span'); probe.style.color = c; if (!probe.style.color) { $('#colout').textContent = 'That is not a colour this reads. Use hex, rgb() or hsl().'; return; }
    document.body.appendChild(probe); var rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number); probe.remove();
    var hx = '#' + rgb.slice(0, 3).map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('').toUpperCase();
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, h = 0;
    if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    var lum = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; var L1 = 0.2126 * lum(rgb[0]) + 0.7152 * lum(rgb[1]) + 0.0722 * lum(rgb[2]);
    var cw = (1.05) / (L1 + 0.05), cb = (L1 + 0.05) / 0.05;
    $('#colsw').style.background = hx; $('#colin').value = hx.toLowerCase();
    $('#colout').innerHTML = '<span class="mono">' + hx + '</span> · <span class="mono">rgb(' + rgb.slice(0, 3).join(', ') + ')</span> · <span class="mono">hsl(' + Math.round(h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)</span><br>Contrast with white text ' + cw.toFixed(2) + ':1, with black text ' + cb.toFixed(2) + ':1. Body text needs 4.5:1.';
  }
  function b32(s) { var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bits = ''; s.replace(/[\s=]/g, '').toUpperCase().split('').forEach(function (c) { var v = A.indexOf(c); if (v < 0) throw new Error('not Base32'); bits += ('0000' + v.toString(2)).slice(-5); }); var out = []; for (var i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.substr(i, 8), 2)); return new Uint8Array(out); }
  async function totp(secret) { var key = await crypto.subtle.importKey('raw', b32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']); var c = Math.floor(Date.now() / 30000), buf = new ArrayBuffer(8), dv = new DataView(buf); dv.setUint32(4, c); var h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf)); var o = h[19] & 15; var n = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6; return ('00000' + n).slice(-6); }
  async function otpDraw() {
    var box = $('#otplist'); if (!box) return; if (!st.otp.length) { box.innerHTML = '<p class="bm mu">No secrets yet.</p>'; return; }
    var left = 30 - Math.floor(Date.now() / 1000) % 30, html = '';
    for (var i = 0; i < st.otp.length; i++) { var o = st.otp[i], code; try { code = await totp(o.secret); code = code.slice(0, 3) + ' ' + code.slice(3); } catch (e) { code = 'Bad secret'; } html += '<div class="row-item" data-k="otp-' + i + '"><span class="col grow"><span class="ll">' + esc(o.name) + '</span><span class="otp">' + code + '</span><span class="bs mu">' + left + ' seconds left</span></span><button class="btn text sm" data-copy="' + code.replace(' ', '') + '">' + L('copy') + '</button><button class="btn text sm" data-rmotp="' + i + '">Remove</button></div>'; }
    box.innerHTML = html;
  }
  // QR codes for the authenticator: read from an image file, a pasted image or the camera, with
  // jsQR (vendor/jsQR.js, Apache-2.0). Everything happens here; no image leaves this window.
  function otpFromText(text) {
    var t = String(text || '').trim();
    if (!/^otpauth:\/\//i.test(t)) throw new Error('That QR code is not a one-time code. It says: ' + t.slice(0, 120));
    var u = new URL(t);
    if (u.host.toLowerCase() !== 'totp') throw new Error('Only time-based codes (totp) are supported; this one is ' + u.host + '.');
    var secret = (u.searchParams.get('secret') || '').replace(/\s/g, '').toUpperCase(); b32(secret); if (!secret) throw new Error('The QR code has no secret.');
    if ((u.searchParams.get('digits') || '6') !== '6' || (u.searchParams.get('period') || '30') !== '30' || !/^(SHA1)?$/i.test(u.searchParams.get('algorithm') || '')) throw new Error('This code uses settings the authenticator does not support yet (it supports 6 digits, 30 seconds, SHA-1).');
    var label = decodeURIComponent(u.pathname.replace(/^\//, '')); var issuer = u.searchParams.get('issuer') || '';
    return { name: (issuer && label.indexOf(issuer) !== 0 ? issuer + ': ' : '') + (label || 'Code'), secret: secret };
  }
  function qrDecode(source, w, h) {
    if (!window.jsQR) throw new Error('The QR reader did not load.');
    var c = document.createElement('canvas'); var scale = Math.min(1, 1600 / Math.max(w, h)); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, c.width, c.height);
    var r = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    return r ? r.data : null;
  }
  function qrFound(text) {
    var out = $('#qrout');
    try { var o = otpFromText(text); st.otp.push(o); save(); otpDraw(); if (out) out.textContent = 'Added ' + o.name + '.'; toast('Added ' + o.name + ' to the authenticator.'); }
    catch (e) { if (out) out.textContent = e.message; toast(e.message); }
  }
  function qrFile(file) {
    var out = $('#qrout'); if (!file || !/^image\//.test(file.type)) { if (out) out.textContent = 'Choose an image: PNG, JPEG, WebP or GIF.'; return; }
    if (out) out.textContent = 'Reading the image…';
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { var text = null; try { text = qrDecode(img, img.naturalWidth, img.naturalHeight); } catch (e) { if (out) out.textContent = e.message; } URL.revokeObjectURL(url); if (text) qrFound(text); else if (out && !/load/.test(out.textContent)) out.textContent = 'No QR code found in that image. Try a sharper or closer picture.'; };
    img.onerror = function () { URL.revokeObjectURL(url); if (out) out.textContent = 'That file could not be opened as an image.'; };
    img.src = url;
  }
  var qrCam = null;
  function qrCameraStop() { if (qrCam) { qrCam.stream.getTracks().forEach(function (t) { t.stop(); }); qrCam = null; } var v = $('#qrvideo'); if (v) { v.hidden = true; v.srcObject = null; } var b = $('[data-act="qrcam"]'); if (b) b.textContent = 'Use the camera'; }
  function qrCamera() {
    var out = $('#qrout');
    if (qrCam) { qrCameraStop(); if (out) out.textContent = 'Camera off.'; return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (out) out.textContent = 'This window has no camera access. Use an image instead.'; return; }
    if (out) out.textContent = 'Asking for the camera…';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (stream) {
      var v = $('#qrvideo'); if (!v) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      qrCam = { stream: stream, last: 0 }; v.srcObject = stream; v.hidden = false; v.play();
      var b = $('[data-act="qrcam"]'); if (b) b.textContent = 'Stop the camera'; if (out) out.textContent = 'Hold the QR code in front of the camera.';
      (function tick(ts) {
        if (!qrCam) return; var vv = $('#qrvideo'); if (!vv || !document.body.contains(vv)) { qrCameraStop(); return; }
        if (vv.readyState >= 2 && ts - qrCam.last > 200) { qrCam.last = ts; var text = null; try { text = qrDecode(vv, vv.videoWidth, vv.videoHeight); } catch (e) { /* the next frame may work */ } if (text) { qrCameraStop(); qrFound(text); return; } }
        requestAnimationFrame(tick);
      })(0);
    }, function (e) { if (out) out.textContent = 'The camera was not allowed or is not there (' + e.name + '). Use an image instead.'; });
  }
  document.addEventListener('paste', function (e) {
    if (st.active !== 'tools' || !e.clipboardData) return;
    var item = Array.prototype.filter.call(e.clipboardData.items || [], function (i) { return /^image\//.test(i.type); })[0];
    if (item) { e.preventDefault(); qrFile(item.getAsFile()); }
  });
  setInterval(function () { if (st.active === 'tools') otpDraw(); }, 1000);

  // ---------- Live chart of this visit ----------
  var live = { pts: [], cur: 0, hover: -1, draw: function () {
    var c = $('#livechart'); if (!c) return; var ctx = c.getContext('2d'), W2 = c.width = c.clientWidth * (devicePixelRatio || 1), H = c.height = 160 * (devicePixelRatio || 1); var cs = getComputedStyle($('#app'));
    ctx.clearRect(0, 0, W2, H); var pts = live.pts.slice(-60); var max = Math.max(4, Math.max.apply(null, pts.concat([0]))); var step = W2 / 59;
    ctx.strokeStyle = cs.getPropertyValue('--outv'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - 1); ctx.lineTo(W2, H - 1); ctx.stroke();
    ctx.strokeStyle = cs.getPropertyValue('--p').trim() || '#00639B'; ctx.lineWidth = 3 * (devicePixelRatio || 1); ctx.lineJoin = 'round'; ctx.beginPath();
    pts.forEach(function (v, i) { var x = W2 - (pts.length - 1 - i) * step, y = H - 12 - (v / max) * (H - 30); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    if (live.hover >= 0 && pts.length) { var i = Math.round((live.hover * W2 - (W2 - (pts.length - 1) * step)) / step); i = Math.max(0, Math.min(pts.length - 1, i)); var x = W2 - (pts.length - 1 - i) * step, y = H - 12 - (pts[i] / max) * (H - 30); ctx.strokeStyle = cs.getPropertyValue('--out'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.fillStyle = cs.getPropertyValue('--p'); ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); var v = $('#livevalue'); if (v) v.textContent = pts[i] + ' actions, ' + ((pts.length - 1 - i) * 2) + ' seconds ago'; }
  } };
  document.addEventListener('pointerdown', function () { live.cur++; }, true); document.addEventListener('keydown', function () { live.cur++; }, true);
  setInterval(function () { live.pts.push(live.cur); live.cur = 0; if (live.pts.length > 120) live.pts.shift(); if (st.active === 'home') live.draw(); }, 2000);

  // ---------- Events ----------
  var longT = null;
  function wire() {
    var app = $('#app');
    app.addEventListener('click', function (e) {
      var t = e.target;
      // A locked element cannot be changed: its controls ask to unlock first.
      var lockedEl = t.closest('.locked'); if (lockedEl && t.closest('button,input,select,a,label,summary') && !t.closest('[data-tab]')) { e.preventDefault(); e.stopPropagation(); toast(msg('locked')); askUnlock(lockedEl.dataset.k); return; }
      var b = t.closest('[data-closetab]'); if (b) { e.stopPropagation(); closeTab(b.dataset.closetab); return; }
      b = t.closest('[data-tab]'); if (b) { st.active = b.dataset.tab; save(); render(); return; }
      b = t.closest('[data-go]'); if (b) { e.preventDefault(); go(b.dataset.go); return; }
      b = t.closest('[data-article]'); if (b) { view.article = b.dataset.article || null; if (st.active !== 'articles') go('articles:top'); else { render(); window.scrollTo(0, 0); } return; }
      b = t.closest('[data-regex]'); if (b) { workbench(b.dataset.regex); return; }
      b = t.closest('[data-copy]'); if (b) { copy(b.dataset.copy); return; }
      b = t.closest('[data-board]'); if (b) { dialog(b.dataset.btitle, '<img src="boards/' + esc(b.dataset.board) + '.webp" alt="' + esc(b.dataset.btitle) + '" style="width:100%;height:auto;border-radius:16px;box-shadow:0 0 0 1px var(--outv)">', { full: true }); return; }
      b = t.closest('[data-toggle]'); if (b) { setVal(b.dataset.toggle, !get(b.dataset.toggle), labelOf(b)); if (b.dataset.toggle === 'school' && st.school) { st.funEn = 1; st.funYue = 1; save(); } render(); return; }
      b = t.closest('[data-set]'); if (b) { var v = b.dataset.val; if (/^(funEn|funYue|textScale)$/.test(b.dataset.set)) v = +v; setVal(b.dataset.set, v, b.closest('[role=group]').getAttribute('aria-label')); if (b.dataset.set === 'edge') shell(); render(); return; }
      b = t.closest('[data-reset]'); if (b) { var p = b.dataset.reset, dv = p.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, DEF); setVal(p, JSON.parse(JSON.stringify(dv)), 'Reset ' + p); if (p === 'edge' || p === 'name' || p === 'logo') shell(); render(); toast(msg('saved')); return; }
      b = t.closest('[data-info]'); if (b) { var m = $('#i-' + b.dataset.info); m.hidden = !m.hidden; b.setAttribute('aria-expanded', !m.hidden); return; }
      b = t.closest('[data-undo]'); if (b) { undoEntry(+b.dataset.undo); toast(msg('saved')); return; }
      b = t.closest('[data-export]'); if (b) { exportWhat(b.dataset.export); return; }
      b = t.closest('[data-fstate]'); if (b) { view.featState = b.dataset.fstate; render(); return; }
      b = t.closest('[data-fcat]'); if (b) { view.featCat = b.dataset.fcat; render(); return; }
      b = t.closest('[data-unlock]'); if (b) { askUnlock(b.dataset.unlock); return; }
      b = t.closest('[data-relock]'); if (b) { delete unlocked[b.dataset.relock]; saveOpen(); render(); return; }
      b = t.closest('[data-rmlock]'); if (b) { var k = b.dataset.rmlock; if (isLocked(k)) askUnlock(k, function () { removeLock(k); }); else removeLock(k); return; }
      b = t.closest('[data-preset]'); if (b) { var pr = [['Forgot a lock PIN', 'I locked an element on this page and forgot its PIN.', 'Clearing this site\'s storage'], ['Something looks wrong', 'A part of the page looks cut off or overlaps.', 'A larger text size'], ['Question about running it', 'I want to run the container on my machine.', 'The Run it tab']][+b.dataset.preset]; $('#tk-title').value = pr[0]; $('#tk-what').value = pr[1]; $('#tk-tried').value = pr[2]; return; }
      b = t.closest('[data-rmticket]'); if (b) { st.tickets.splice(+b.dataset.rmticket, 1); save(); render(); return; }
      b = t.closest('[data-conv]'); if (b) { convert(b.dataset.conv); return; }
      b = t.closest('[data-rmotp]'); if (b) { st.otp.splice(+b.dataset.rmotp, 1); save(); otpDraw(); return; }
      b = t.closest('[data-act]'); if (!b) return; var a = b.dataset.act;
      if (a === 'palette') palette();
      if (a === 'theme') { setVal('theme', isDark() ? 'light' : 'dark', 'Theme'); render(); }
      if (a === 'lang') { setVal('lang', st.lang === 'en' ? 'yue' : st.lang === 'yue' ? 'both' : 'en', 'Language mode'); shell(); render(); }
      if (a === 'bell') notePanel();
      if (a === 'access') accessPanel();
      if (a === 'newtab') newTab();
      if (a === 'openall' || a === 'welcome' || a === 'dimsum') action(a);
      if (a === 'resetall') action('resetall');
      if (a === 'toggle-filters') { view.filtersOpen = !view.filtersOpen; render(); }
      if (a === 'vocab-clear') { var bv = st.vocab; st.vocab = null; st.history.unshift({ t: Date.now(), path: 'vocab', label: 'Your wording file cleared', before: bv ? '(your file)' : null, after: null }); save(); apply(); location.reload(); }
      if (a === 'voice-test') speak(st.lang === 'yue' ? '你好，呢個係你揀嘅聲。' : 'Hello. This is the voice you picked.');
      if (a === 'keys') dialog('Keyboard', '<table class="t"><tbody>' + [['Ctrl Shift F', 'Search everything'], ['Shift F10 or the menu key', 'Open the menu of the focused element'], ['Alt and a letter', 'Run a menu item'], ['Arrow keys', 'Move between tabs and results'], ['Escape', 'Close a menu, panel or dialog']].map(function (r) { return '<tr><td class="kbd">' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</tbody></table>');
      if (a === 'clear-history') superConfirm('Clear history', ['All ' + st.history.length + ' entries are removed.', 'Your current settings stay as they are.'], 'CLEAR', function () { st.history = []; save(); render(); toast(msg('saved')); });
      if (a === 'undo-sel') { var ts = Object.keys(view.sel).filter(function (x) { return view.sel[x]; }).map(Number); st.history.slice().forEach(function (h) { if (ts.indexOf(h.t) >= 0) undoEntry(st.history.indexOf(h)); }); view.sel = {}; render(); toast(msg('saved')); }
      if (a === 'ticket') { var ti = $('#tk-title').value.trim(); if (!ti) { $('#tk-title-err').textContent = 'Give the ticket a title, so you can find it later.'; $('#tk-title').focus(); return; } st.tickets.unshift({ t: Date.now(), title: ti, what: $('#tk-what').value.trim(), tried: $('#tk-tried').value.trim() }); save(); render(); toast(msg('saved')); }
      if (a === 'copy-tickets') copy(st.tickets.map(function (x) { return '# ' + x.title + '\n' + x.what + (x.tried ? '\nTried: ' + x.tried : ''); }).join('\n\n') || 'No tickets.');
      if (a === 'b64enc') b64(true); if (a === 'b64dec') b64(false);
      if (a === 'qrcam') qrCamera();
      if (a === 'otpadd') { var nm = $('#otpname').value.trim() || 'Code', sc = $('#otpsecret').value.trim(); try { b32(sc); if (!sc) throw new Error(); } catch (er) { toast('That secret is not Base32 (letters A to Z and digits 2 to 7).'); return; } st.otp.push({ name: nm, secret: sc }); save(); render(); }
    });
    app.addEventListener('input', function (e) {
      var t = e.target, id = t.id;
      var map = { stsearch: 'status', fsearch: 'features', asearch: 'articles', csearch: 'changes', ssearch: 'settings', hsearch: 'history', dsearch: 'design' };
      if (map[id]) { q[map[id]] = t.value; var pos = t.selectionStart; render(); var n = $('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* search fields */ } } return; }
      if (t.dataset.range) { st[t.dataset.range] = +t.value; save(); t.nextElementSibling.textContent = t.value; return; }
      if (t.dataset.color) { var p2 = t.dataset.color; if (p2 === 'seed') st.seed = t.value; else st.logo.color = t.value; save(); apply(); return; }
      if (id === 'coltext') colour();
      if (id === 'colin') { $('#coltext').value = t.value.toUpperCase(); colour(); }
      if (t.dataset.sel) { view.sel[t.dataset.sel] = t.checked; render(); }
    });
    app.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.range) setVal(t.dataset.range, +t.value, 'Sound volume');
      if (t.dataset.color) { setVal(t.dataset.color, t.value, t.getAttribute('aria-label')); shell(); render(); }
      if (t.dataset.select) setVal(t.dataset.select, t.value, t.getAttribute('aria-label'));
      if (t.dataset.time) setVal(t.dataset.time, t.value, t.getAttribute('aria-label'));
      if (t.dataset.text) { setVal(t.dataset.text, t.value.trim() || DEF.name, 'Name'); shell(); render(); }
      if (t.id === 'vocabfile' && t.files[0]) loadVocabFile(t.files[0]);
      if (t.id === 'b64file' && t.files[0]) { var fr = new FileReader(); fr.onload = function () { $('#b64out').textContent = String(fr.result).split(',')[1] || ''; }; fr.readAsDataURL(t.files[0]); }
      if (t.id === 'qrfile' && t.files[0]) qrFile(t.files[0]);
    });
    // Tabs: arrow keys, drag to reorder.
    app.addEventListener('keydown', function (e) {
      var tb = e.target.closest('[data-tab]'); if (tb && /Arrow(Left|Right|Up|Down)/.test(e.key)) { var tabs = $$('[data-tab]'); var i = tabs.indexOf(tb) + (/Right|Down/.test(e.key) ? 1 : -1); var n = tabs[(i + tabs.length) % tabs.length]; st.active = n.dataset.tab; save(); render(); $('#t-' + st.active).focus(); e.preventDefault(); }
      if (tb && e.key === 'Delete') closeTab(tb.dataset.tab);
    });
    var dragged = null;
    app.addEventListener('dragstart', function (e) { var tb = e.target.closest && e.target.closest('[data-tab]'); if (tb) { dragged = tb.dataset.tab; tb.classList.add('drag'); } });
    app.addEventListener('dragover', function (e) { if (dragged && e.target.closest && e.target.closest('[data-tab]')) e.preventDefault(); });
    app.addEventListener('drop', function (e) { var tb = e.target.closest && e.target.closest('[data-tab]'); if (!dragged || !tb) return; e.preventDefault(); var o = st.tabs.open; o.splice(o.indexOf(dragged), 1); o.splice(o.indexOf(tb.dataset.tab), 0, dragged); dragged = null; save(); render(); });
    app.addEventListener('dragend', function () { dragged = null; $$('.drag').forEach(function (x) { x.classList.remove('drag'); }); });
    // The element menu: right-click, Shift F10, the menu key, or a long press.
    document.addEventListener('contextmenu', function (e) { if (e.target.closest('.popover,.dialog,input,textarea')) return; var el = elKey(e.target); if (!el) return; e.preventDefault(); if (el.dataset.k.indexOf('tab-') === 0) return tabMenu(el, e.clientX, e.clientY); menuFor(el, e.clientX, e.clientY); });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); palette(); return; }
      if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { var el = elKey(document.activeElement); if (el) { e.preventDefault(); var r = el.getBoundingClientRect(); if (el.dataset.k.indexOf('tab-') === 0) tabMenu(el, r.left, r.bottom); else menuFor(el, r.left + 12, r.top + 12); } }
      if (e.key === 'Escape') { if ($('.popover')) closePop(); else if ($('#ov')) closeDialog(); else if ($('.panel')) $('.panel').remove(); }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.popover')) closePop();
      if (e.pointerType !== 'touch') return; var el = elKey(e.target); if (!el) return; var x = e.clientX, y = e.clientY;
      longT = setTimeout(function () { if (navigator.vibrate) navigator.vibrate(15); if (el.dataset.k.indexOf('tab-') === 0) tabMenu(el, x, y); else menuFor(el, x, y); }, 600);
    });
    ['pointerup', 'pointercancel'].forEach(function (n) { document.addEventListener(n, function () { clearTimeout(longT); }); });
    document.addEventListener('pointermove', function (e) { if (longT && (Math.abs(e.movementX) + Math.abs(e.movementY) > 10)) clearTimeout(longT); var c = e.target.id === 'livechart' ? e.target : null; if (c) { var r = c.getBoundingClientRect(); live.hover = (e.clientX - r.left) / r.width; live.draw(); } });
    document.addEventListener('click', function (e) { var b = e.target.closest('#ov [data-act="dlg-close"]'); if (b) closeDialog(); var tg = e.target.closest('#ov [data-toggle], #ov [data-set], .panel [data-toggle], .panel [data-set]'); if (tg) { if (tg.dataset.toggle) setVal(tg.dataset.toggle, !get(tg.dataset.toggle), labelOf(tg)); else { var v = tg.dataset.val; if (/^(textScale)$/.test(tg.dataset.set)) v = +v; setVal(tg.dataset.set, v, tg.closest('[role=group]').getAttribute('aria-label')); if (tg.dataset.set === 'edge') shell(); } render(); if (tg.closest('#ov')) { $$('[data-set="' + tg.dataset.set + '"]', $('#ov')).forEach(function (s) { var on = s.dataset.val === String(get(tg.dataset.set)); s.classList.toggle('sel', on); s.setAttribute('aria-pressed', on); }); } } });
    document.addEventListener('click', function (e) { var g = e.target.closest('.panel [data-go]'); if (g) { $('.panel').remove(); go(g.dataset.go); } });
    // Drop a wording file anywhere on the page.
    var dz = null;
    document.addEventListener('dragover', function (e) { if (dragged) return; if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); if (!dz) { dz = document.createElement('div'); dz.className = 'dropzone'; dz.textContent = 'Drop your wording file to use it'; $('#app').appendChild(dz); } } });
    document.addEventListener('dragleave', function (e) { if (dz && !e.relatedTarget) { dz.remove(); dz = null; } });
    document.addEventListener('drop', function (e) { if (dragged) return; if (dz) { dz.remove(); dz = null; } var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); loadVocabFile(f); } });
    mq.addEventListener && mq.addEventListener('change', function () { apply(); });
    setInterval(function () { if (st.schedule.on) apply(); }, 60000);
  }
  function labelOf(b) { return b.getAttribute('aria-label') || b.dataset.toggle; }
  function closeTab(t) {
    if (st.tabs.pinned.indexOf(t) >= 0) return; if (isLocked('tab-' + t)) { askUnlock('tab-' + t); return; }
    var before = st.tabs.open.slice(); st.tabs.open = st.tabs.open.filter(function (x) { return x !== t; }); if (st.active === t) st.active = st.tabs.open[Math.max(0, before.indexOf(t) - 1)] || 'home';
    save(); render(); toast(w(t) + ' closed. New tab reopens it.', { undo: function () { st.tabs.open = before; save(); render(); } });
  }
  function tabMenu(el, x, y) {
    var t = el.dataset.k.slice(4), pin = st.tabs.pinned.indexOf(t) >= 0; closePop();
    var p = document.createElement('div'); p.className = 'popover'; p.setAttribute('role', 'menu');
    var items = [['pin', pin ? 'Unpin' : 'Pin', 'Pin', 'P'], ['left', 'Move left', 'ChevronLeft', '←'], ['right', 'Move right', 'ChevronRight', '→'], ['close', 'Close', 'Close', 'Del'], ['others', 'Close the others', 'Close', ''], ['lock', st.locks['tab-' + t] ? 'Unlock this tab' : 'Lock this tab', 'LockOutline', 'L'], ['look', 'Edit appearance', 'FormatPaint', 'A']];
    p.innerHTML = findField('tmq', 'Search this menu', '') + items.map(function (i) { return '<button class="mi" role="menuitem" data-tm="' + i[0] + '" data-name="' + i[1] + '">' + icon(i[2], 's') + '<span class="bm">' + i[1] + '</span>' + (i[3] ? '<span class="kbd">' + i[3] + '</span>' : '') + '</button>'; }).join('');
    $('#app').appendChild(p); var r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px'; $('#tmq').focus();
    $('#tmq').addEventListener('input', function () { var m = matcher(this.value); $$('.mi', p).forEach(function (b) { b.hidden = !m.test(b.dataset.name); }); });
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tm]'); if (!b) return; var a = b.dataset.tm, o = st.tabs.open, i = o.indexOf(t); closePop();
      if (a === 'pin') { if (pin) st.tabs.pinned = st.tabs.pinned.filter(function (x) { return x !== t; }); else st.tabs.pinned.push(t); }
      if (a === 'left' && i > 0) { o.splice(i, 1); o.splice(i - 1, 0, t); }
      if (a === 'right' && i < o.length - 1) { o.splice(i, 1); o.splice(i + 1, 0, t); }
      if (a === 'close') return closeTab(t);
      if (a === 'others') { var before = o.slice(); st.tabs.open = o.filter(function (x) { return x === t || st.tabs.pinned.indexOf(x) >= 0; }); st.active = t; save(); render(); toast('Other tabs closed.', { undo: function () { st.tabs.open = before; save(); render(); } }); return; }
      if (a === 'lock') { if (st.locks['tab-' + t]) removeLock('tab-' + t); else lockWizard('tab-' + t, w(t) + ' tab'); return; }
      if (a === 'look') { lookEditor(el); return; }
      save(); render();
    });
  }
  function newTab() {
    var closed = TABS.filter(function (t) { return st.tabs.open.indexOf(t) < 0; });
    dialog(w('newtab'), findField('ntq', 'Search pages, settings and tools', '') + '<div id="ntl" class="cmd-list"></div><div class="row"><span class="grow"></span><button class="btn tonal" data-act="openall">' + L('openall') + '</button></div>', { focus: '#ntq' });
    var entries = TABS.map(function (t) { return { label: w(t), go: t + ':top', closed: closed.indexOf(t) >= 0 }; })
      .concat([['Settings, Language', 'settings:language'], ['Settings, Your wording', 'settings:wording'], ['Settings, Appearance', 'settings:appearance'], ['Settings, Locks', 'settings:locks'], ['Tools, Pattern workbench', 'tools:regex'], ['Tools, Base64', 'tools:base64'], ['Tools, Convert', 'tools:convert'], ['Tools, Colour', 'tools:colour'], ['Tools, Authenticator', 'tools:otp']].map(function (x) { return { label: x[0], go: x[1] }; }));
    function draw() { var m = matcher($('#ntq').value); $('#ntl').innerHTML = entries.filter(function (x) { return m.test(x.label); }).map(function (x) { return '<button class="cmd-row" data-ntgo="' + x.go + '"><span class="ll grow" style="text-align:left">' + esc(x.label) + '</span>' + (x.closed ? '<span class="tag a">Closed</span>' : '') + '</button>'; }).join('') || '<p class="bm mu">' + L('noMatch') + '</p>'; }
    $('#ntq').addEventListener('input', draw); $('#ntl').addEventListener('click', function (e) { var b = e.target.closest('[data-ntgo]'); if (b) { closeDialog(); go(b.dataset.ntgo); } });
    $('#ov').addEventListener('click', function (e) { if (e.target.closest('[data-act="openall"]')) { closeDialog(); action('openall'); } });
    draw();
  }
  function loadVocabFile(file) {
    if (file.size > VL.bytes) { toast('That file is larger than 256 KiB. Nothing changed.'); beep('bad'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var text = String(fr.result); var r = parseVocab(text);
      if (!r.ok) { toast(r.error + ' Nothing changed.'); beep('bad'); return; }
      var before = st.vocab; st.vocab = r.entries; st.history.unshift({ t: Date.now(), path: 'vocab', label: 'Your wording file (' + r.count + ' entries)', before: before ? '(your file)' : null, after: '(your file)' }); save(); apply(); shell(); render();
      var c = document.createElement('div'); c.className = 'celebrate'; c.setAttribute('role', 'status'); c.innerHTML = '<div class="hl">' + esc(msg('vocab')) + '</div><p class="bm">' + r.count + ' words in use, only in this browser.</p>'; $('#app').appendChild(c); setTimeout(function () { c.remove(); }, 3000); beep('on');
    };
    fr.onerror = function () { toast('The file could not be read. Nothing changed.'); };
    fr.readAsText(file);
  }

  // ---------- Start ----------
  apply(); shell(); render(); wire();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = function () { if (st.active === 'settings') render(); };
  if (!st.welcomed) setTimeout(function () { welcome(false); }, 300);
  setTimeout(function () { if (Math.random() < 0.25) dimsum(false); }, 45000);
  if (location.hash && location.hash.length > 1) { var h = location.hash.slice(1); if (TABS.indexOf(h) >= 0) go(h + ':top'); }
})();
