// Written by build-renderer.js. Edit parts/head.js, parts/tail.js or docs/site/app.js instead.
/* Home Assistant Material Deploy Assistant: the window's page.
 * Built by build-renderer.js from this file, shared parts of the project page (docs/site/app.js)
 * and tail.js. In the app, window.ham talks to the computer; on the project page, mock.js stands
 * in for it and nothing is deployed. */
(function () {
  'use strict';
  var S = { icons: window.HAM_ICONS };
  var API = window.ham;
  var DEMO = !API.desktop;
  var KEY = 'ham-deploy-v1';
  var $ = function (q, el) { return (el || document).querySelector(q); };
  var $$ = function (q, el) { return Array.prototype.slice.call((el || document).querySelectorAll(q)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function icon(n, cls) { var p = S.icons[n] || S.icons.InformationOutline; return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '"></path></svg>'; }

  // ---------- Stored choices (this window only; instances live in the app's data folder) ----------
  var TABS = ['deploy', 'instances', 'backups', 'downloads', 'hosts', 'activity', 'settings', 'help'];
  var DEF = {
    lang: 'en', funEn: 5, funYue: 5, emoji: true, vocab: null, school: false, lowStim: false, spotlight: false,
    theme: 'system', seed: '#00639B', density: 'comfortable', textScale: 1, reduceMotion: false, contrast: false, focusRing: true, bigTargets: false,
    sounds: true, volume: 40, voice: '', schedule: { on: false, from: '20:00', to: '07:00' }, name: 'Deploy Assistant', logo: { shape: 'rounded', color: '' },
    tabs: { open: TABS.slice(), pinned: [], offered: TABS.slice() }, active: 'deploy', edge: 'top', paletteFull: false, openAfter: true, defaultTarget: 'docker',
    look: {}, locks: {}, history: [], notes: [], welcomed: false, welcomeStep: 0, view: 'cards'
  };
  var st = load();
  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    var s = JSON.parse(JSON.stringify(DEF));
    if (raw && typeof raw === 'object') { Object.keys(DEF).forEach(function (k) { if (k in raw) s[k] = raw[k]; }); }
    TABS.forEach(function (t) { if (s.tabs.offered.indexOf(t) < 0) { s.tabs.offered.push(t); s.tabs.open.push(t); } });
    s.tabs.open = s.tabs.open.filter(function (t) { return TABS.indexOf(t) >= 0; });
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage may be off */ } }
  var unlocked = {};
  try { unlocked = JSON.parse(sessionStorage.getItem(KEY + '-open') || '{}'); } catch (e) { unlocked = {}; }

  // ---------- Words ----------
  var W = {
    deploy: ['Deploy', '部署'], instances: ['Instances', '實例'], backups: ['Backups', '備份'], hosts: ['SSH hosts', 'SSH 主機'], activity: ['Activity', '活動'], settings: ['Settings', '設定'], help: ['Help', '說明'],
    search: ['Search', '搵嘢'], newtab: ['New tab', '新分頁'], openall: ['Open every tab', '打開晒所有分頁'], close: ['Close', '閂'], cancel: ['Cancel', '取消'], next: ['Next', '下一步'], back: ['Back', '返轉頭'],
    skip: ['Skip', '跳過'], done: ['Done', '搞掂'], reset: ['Reset', '還原'], copy: ['Copy', '複製'], export: ['Export', '匯出'], undo: ['Undo', '還原返'], clear: ['Clear', '清除'],
    notifications: ['Notifications', '通知'], access: ['Accessibility tools', '無障礙工具'], theme: ['Switch light and dark', '轉光暗'], palette: ['Search everything', '搵晒所有嘢'],
    language: ['Language', '語言'], wording: ['Your wording', '你嘅用字'], appearance: ['Appearance', '外觀'], tabsSet: ['Tabs', '分頁'], locks: ['Locks', '鎖'], resetAll: ['Reset everything', '全部還原'],
    heroTitle: ['Home Assistant Material, running in one click', '一㩒就開到 Home Assistant Material'],
    heroText: ['Pick where it runs. Everything is written for you, a free port is chosen, the image is downloaded and checked, and you get the link to open it.', '揀個地方行。設定幫你寫好、自動揀個空 port、下載同核對映像，搞掂之後俾條連結你打開。'],
    deployNow: ['Deploy now', '即刻部署'], options: ['Options', '選項'], open: ['Open', '打開'], start: ['Start', '開始'], stop: ['Stop', '停止'], restart: ['Restart', '重新開始'], backupNow: ['Back up now', '即刻備份'],
    restore: ['Restore', '還原備份'], remove: ['Remove', '移除'], update: ['Update', '更新'], logs: ['Logs', '紀錄'], ready: ['Ready', '準備好'], noMatch: ['Nothing matches.', '冇嘢夾到。'], badPattern: ['That pattern does not work: ', '呢個樣式用唔到：'],
    editLook: ['Edit appearance', '改外觀'], copyText: ['Copy text', '複製文字'], readAloud: ['Read aloud', '讀出嚟'], lockEl: ['Lock this element', '鎖住呢樣嘢'], unlockEl: ['Unlock this element', '解鎖呢樣嘢'],
    searchFor: ['Search everything for this', '搵晒同呢樣有關嘢'], resetLook: ['Reset its appearance', '還原佢嘅外觀'], filterMenu: ['Search this menu', '搵呢個選單'],
    welcome: ['Welcome', '歡迎'], explain: ['About this setting', '關於呢個設定'], def: ['Default', '預設'], reaches: ['What it reaches', '影響範圍'],
    docker: ['Docker on this computer', '呢部電腦嘅 Docker'], pi: ['Raspberry Pi', 'Raspberry Pi'], downloads: ['Downloads', '下載'], ssh: ['SSH host', 'SSH 主機'], virtualbox: ['VirtualBox', 'VirtualBox'], vmware: ['VMware', 'VMware'],
    running: ['Running', '運行緊'], stopped: ['Stopped', '停咗'], starting: ['Starting', '開緊'], deploying: ['Deploying', '部署緊'], failed: ['Failed', '失敗'], missing: ['Missing', '搵唔到'], unreachable: ['Unreachable', '連唔到']
  };
  function w(k) { var p = W[k] || [k, k]; return st.lang === 'yue' ? (p[1] || p[0]) : p[0]; }
  function L(k) { var p = W[k] || [k, k]; if (st.lang === 'both' && p[1] && p[1] !== p[0]) return esc(p[0]) + '<span class="l2" lang="yue">' + esc(p[1]) + '</span>'; return esc(w(k)); }
  var M = {
    saved: [['Saved.', 'Saved. All in place.', 'Saved, nice and tidy.', 'Saved! Exactly where you left it.', 'Saved! Safe and snug, and the house is proud of you.'], ['已經儲存。', '儲存咗，已經生效。', '儲存好，整整齊齊。', '儲存咗！全部喺你擺低嘅位置。', '搞掂晒！安安樂樂，成間屋都為你自豪。']],
    copied: [['Copied.', 'Copied to the clipboard.', 'Copied, ready to paste.', 'Copied! Paste away.', 'Copied! It is on the clipboard, waiting patiently.'], ['複製咗。', '已經複製到剪貼簿。', '複製好，可以貼。', '複製咗！貼得喇。', '複製咗！佢喺剪貼簿乖乖等緊你。']],
    emptyHistory: [['No changes yet.', 'Nothing changed yet.', 'A clean slate.', 'Nothing here yet!', 'Spotless! Change anything and it turns up here.'], ['未有改動。', '未有改動。', '一張白紙。', '仲未有嘢！', '乾乾淨淨！改啲嘢就會出現。']],
    emptyNotes: [['No notifications.', 'No notifications yet.', 'All quiet here.', 'All quiet! Nothing to tell you yet.', 'Silence! The bell is resting.'], ['冇通知。', '暫時冇通知。', '靜晒。', '好靜！暫時冇嘢講。', '一片寧靜！個鐘喺度休息緊。']],
    locked: [['This element is locked.', 'Locked. Unlock it to change it.', 'Locked for now.', 'Locked! A PIN opens it.', 'Locked tight! Well, toy-tight.'], ['呢樣嘢鎖咗。', '鎖咗，解鎖先改到。', '暫時鎖住。', '鎖咗！要 PIN 先開到。', '鎖到實一實！玩具式咁實。']],
    unlocked: [['Unlocked until the window closes.', 'Unlocked until the window closes.', 'Unlocked for now.', 'Unlocked! Until you close the window.', 'Open sesame! Until the window closes.'], ['解鎖咗，直到閂咗視窗。', '解鎖到閂視窗為止。', '暫時解鎖咗。', '解鎖咗！閂視窗之前都得。', '芝麻開門！閂視窗之前有效。']],
    wrong: [['That PIN did not match.', 'Wrong PIN.', 'Not quite. Try again.', 'Nope! Try again.', 'Not that one! The lock is unimpressed.'], ['PIN 唔啱。', 'PIN 錯咗。', '差少少，再試。', '唔係呀！再嚟。', '唔係呢個！把鎖唔收貨。']],
    reset: [['Everything is back to its default.', 'Reset to defaults.', 'Back to the start.', 'Fresh start! Everything is back.', 'Factory fresh!'], ['全部還原咗。', '還原咗預設。', '返到起點。', '重新開始！全部還原。', '好似新咁！']],
    vocab: [['Your wording file is in use.', 'Your wording is applied.', 'Your words, now in the window.', 'Your words are in! Have a look.', 'Your own words! The window speaks you now.'], ['你嘅用字檔案用緊。', '用咗你嘅用字。', '你嘅字已經上咗。', '你嘅字入咗！睇吓。', '你自己嘅字！個視窗識講你嘅說話喇。']],
    deployed: [['Deployed. Home Assistant is ready.', 'Deployed and ready to open.', 'Done! Ready to open.', 'Up and running! Open it whenever you like.', 'It lives! Your new home is up and waving hello.'], ['部署好，Home Assistant 準備好。', '部署好，可以打開。', '搞掂！可以打開。', '開好喇！幾時想開都得。', '佢醒咗！你個新屋企喺度同你揮手。']],
    failedMsg: [['The deployment stopped.', 'The deployment stopped. See why below.', 'That did not work. The reason is below.', 'Hiccup! The reason is just below.', 'Oops! Something tripped. The reason is right below.'], ['部署停咗。', '部署停咗，原因喺下面。', '唔成功，原因喺下面。', '出咗少少事！原因喺下面。', '哎呀！有嘢絆倒咗，原因就喺下面。']],
    backedUp: [['Backup made.', 'Backup made.', 'Backed up, safe and sound.', 'Backed up! Tucked away safely.', 'Backed up! Snug as a dumpling in a steamer.'], ['備份好。', '備份好。', '備份好，安全穩陣。', '備份好！收埋好喇。', '備份好！好似蒸籠入面嘅點心咁穩陣。']]
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



  // ---------- What the computer reports ----------
  var D = { instances: [], hosts: [], schedule: { on: false, time: '03:00', keep: 7, consistent: true } };
  var checks = {}; // target -> result of its check
  var progress = {}; // instance id -> { steps: [], fraction, log: [] , done, ok, error }
  var activity = []; // every log line and action, newest last
  var stats = {}; // instance id -> recent CPU values
  var about = {};
  var q = {};
  var view = { filterTarget: 'all', filterState: 'all', sort: 'name', sel: {}, open: {}, logFor: 'all' };
  var STEPS = { pi: ['image', 'write', 'verify', 'insert'], docker: ['config', 'pull', 'start', 'wait'], ssh: ['config', 'pull', 'start', 'wait'], virtualbox: ['image', 'config', 'start', 'wait'], vmware: ['image', 'config', 'start', 'wait'] };
  var STEPNAME = { write: 'Write the card', verify: 'Check what was written', insert: 'Start the Pi and wait for it', image: 'Download and check the image', config: 'Write the configuration', pull: 'Download the image', start: 'Start it', wait: 'Wait until it answers' };
  var TICON = { pi: 'Chip', docker: 'Docker', ssh: 'ServerNetwork', virtualbox: 'Monitor', vmware: 'Laptop' };
  var TDESC = {
    docker: 'Runs in Docker on this computer. Needs Docker Desktop or Docker Engine. Opens at http://localhost on its own port.',
    ssh: 'Runs in Docker on another Linux computer you reach over SSH, such as a Raspberry Pi or a server. Backups come back to this computer.',
    virtualbox: 'A virtual machine with the Home Assistant Material operating system, add-ons included. Opens at http://localhost on its own port.',
    vmware: 'A VMware Workstation or Fusion virtual machine with the operating system. Opens at the address VMware gives it.',
    pi: 'Writes the operating system to an SD card or USB drive for a Raspberry Pi 3, 4 or 5, checks it, then waits for the Pi to answer on your network.'
  };
  var dls = [];
  var PIM = [['rpi5', 'Raspberry Pi 5'], ['rpi4', 'Raspberry Pi 4 and 400'], ['rpi3', 'Raspberry Pi 3']];
  function stateTag(s) { var tone = { running: 'g', starting: 'p', deploying: 'p', stopped: '', failed: 'err', missing: 'a', unreachable: 'a' }[s] || ''; return '<span class="tag ' + tone + '"' + (tone === 'err' ? ' style="background:var(--errc);color:var(--on-errc)"' : '') + '>' + L(s || 'stopped') + '</span>'; }
  function addActivity(id, line, kind) { activity.push({ t: Date.now(), id: id, line: line, kind: kind || 'log' }); if (activity.length > 3000) activity.splice(0, 500); }
  function instName(id) { var i = D.instances.filter(function (x) { return x.id === id; })[0]; return i ? i.name : id; }
  function fmtSize(n) { return n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round((n || 0) / 1e3) + ' KB'; }
  function when(iso) { try { return new Date(iso).toLocaleString(st.lang === 'yue' ? 'zh-HK' : undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } }
  function findField(id, ph, value) {
    return '<div class="find" role="search"><span aria-hidden="true">' + icon('Magnify', 's') + '</span><input id="' + id + '" type="search" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" value="' + esc(value || '') + '" autocomplete="off">' +
      '<button class="ib" style="width:40px;height:40px" data-regex="' + id + '" aria-label="Build a pattern search for: ' + esc(ph) + '" title="Pattern workbench">' + icon('Regex', 's') + '</button></div>';
  }
  function foot() {
    return '<footer class="foot bs" data-k="foot"><span>Deploy Assistant ' + esc(about.version || '') + (DEMO ? ' · demo on the project page: nothing is deployed from here' : ' · data in ' + esc(about.data || '')) + '</span><span class="grow"></span><span>Ctrl Shift F searches everything · right-click anything for its tools</span></footer>';
  }

  // ---------- Tabs ----------
  var R = {};
  R.deploy = function () {
    var cards = ['docker', 'ssh', 'virtualbox', 'vmware'].map(function (t) {
      var c = checks[t]; var chip = !c ? '<span class="tag">Checking…</span>' : c.ok ? '<span class="tag g">' + icon('Check', 's') + ' Ready</span>' : '<span class="tag a">' + icon('Alert', 's') + ' Needs setup</span>';
      var host = t === 'ssh' ? '<label class="col" style="gap:4px"><span class="bs mu">Host</span><select class="select" id="sshhost" aria-label="SSH host">' + (D.hosts.length ? D.hosts.map(function (h) { return '<option value="' + h.id + '">' + esc(h.name) + ' (' + esc(h.user) + '@' + esc(h.address) + ')</option>'; }).join('') : '<option value="">No host yet</option>') + '</select></label>' : '';
      return '<article class="tcard" data-k="target-' + t + '" id="target-' + t + '"><div class="row" style="gap:12px"><span class="sq big">' + icon(TICON[t]) + '</span><div class="col grow" style="gap:4px"><h2 class="tl">' + L(t) + '</h2>' + chip + '</div></div>' +
        '<p class="bm mu">' + esc(TDESC[t]) + '</p>' + (c && !c.ok ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">' + esc(c.detail) + ' ' + esc(c.fix || '') + (c.link ? ' <a href="' + esc(c.link) + '" data-ext="' + esc(c.link) + '">How to install</a>' : '') + '</span></div>' : c ? '<p class="bs mu">' + esc(c.detail) + '</p>' : '') + host +
        '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto"><button class="btn fill lg grow" data-oneclick="' + t + '"' + (t === 'ssh' && !D.hosts.length ? ' data-needhost="1"' : '') + '>' + icon('RocketLaunch', 's') + L('deployNow') + '</button><button class="btn out" data-options="' + t + '">' + icon('Tune', 's') + L('options') + '</button><button class="ib" data-recheck="' + t + '" aria-label="Check ' + esc(w(t)) + ' again">' + icon('Refresh', 's') + '</button></div></article>';
    }).join('');
    cards += '<article class="tcard" data-k="target-pi" id="target-pi"><div class="row" style="gap:12px"><span class="sq big">' + icon('Chip') + '</span><div class="col grow" style="gap:4px"><h2 class="tl">' + L('pi') + '</h2><span class="tag g">' + icon('Check', 's') + ' Ready</span></div></div><p class="bm mu">' + esc(TDESC.pi) + '</p>' +
      '<label class="col" style="gap:4px"><span class="bs mu">Model</span><select class="select" id="pimodel" aria-label="Raspberry Pi model">' + PIM.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto"><button class="btn fill lg grow" data-act="pi">' + icon('Harddisk', 's') + 'Write a card</button></div></article>';
    var running = Object.keys(progress).filter(function (id) { return D.instances.some(function (i) { return i.id === id; }) || !progress[id].done; });
    return '<section class="dhero" id="top" data-k="deploy-hero"><div class="col" style="gap:12px"><span class="status">' + icon('RocketLaunch', 's') + (DEMO ? 'Demo: try every button; nothing is deployed from this page' : D.instances.length + ' instances on this computer\'s list') + '</span><h1 class="dl" data-k="deploy-title">' + L('heroTitle') + '</h1><p class="bl mu" style="max-width:760px">' + L('heroText') + '</p></div></section>' +
      (running.length ? '<section class="section"><h2 class="tl">Deployments</h2>' + running.map(progressCard).join('') + '</section>' : '') +
      '<section class="grid4" aria-label="Where to run it">' + cards + '</section>' +
      '<section class="section card" style="padding:20px" data-k="deploy-what"><h2 class="tm">What one click does</h2><ol class="bm" style="margin:0;padding-left:20px"><li>Checks that the target is ready, and says how to fix it if not.</li><li>Picks a name and a free port, so instances never collide. There is no limit on how many.</li><li>Writes every configuration file: a Compose file for Docker, or a virtual machine for VirtualBox and VMware.</li><li>Downloads the image and checks its SHA-256 sum where the release publishes one.</li><li>Starts it, waits until Home Assistant answers, then gives you the link and opens it.</li></ol></section>' + foot();
  };
  function progressCard(id) {
    var p = progress[id]; var inst = D.instances.filter(function (x) { return x.id === id; })[0] || { name: id, target: 'docker' };
    var list = STEPS[inst.target] || STEPS.docker; var idx = list.indexOf(p.step);
    var rows = list.map(function (k, i) {
      var state = p.done && p.ok ? 'done' : i < idx ? 'done' : i === idx ? (p.done && !p.ok ? 'bad' : 'now') : 'todo';
      var mark = state === 'done' ? '<span class="sq ok">' + icon('Check', 's') + '</span>' : state === 'now' ? '<span class="sq now"><span class="spin" aria-hidden="true"></span></span>' : state === 'bad' ? '<span class="sq bad">' + icon('Alert', 's') + '</span>' : '<span class="sq todo">' + (i + 1) + '</span>';
      return '<li class="row" style="gap:12px">' + mark + '<span class="col grow"><span class="ll' + (state === 'todo' ? ' mu' : '') + '">' + esc(STEPNAME[k]) + '</span>' + (state === 'now' && p.text ? '<span class="bs mu">' + esc(p.text) + '</span>' : '') +
        (state === 'now' && p.fraction ? '<span class="pbar" role="progressbar" aria-valuenow="' + Math.round(p.fraction * 100) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.round(p.fraction * 100) + '%"></i></span>' : '') + '</span></li>';
    }).join('');
    var done = p.done ? (p.ok ? '<div class="readybox" data-k="ready-' + id + '"><span class="tl">' + esc(msg('deployed')) + '</span><a class="mono bl" href="' + esc(inst.url) + '" data-ext="' + esc(inst.url) + '">' + esc(inst.url) + '</a>' + (inst.lanUrl ? '<span class="bs">Other devices: <a class="mono" href="' + esc(inst.lanUrl) + '" data-ext="' + esc(inst.lanUrl) + '">' + esc(inst.lanUrl) + '</a></span>' : '') + '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn fill" data-ext="' + esc(inst.url) + '">' + icon('OpenInNew', 's') + 'Open Home Assistant</button><button class="btn tonal" data-copy="' + esc(inst.url) + '">' + icon('ContentCopy', 's') + L('copy') + '</button><button class="btn text" data-dismiss="' + id + '">' + L('done') + '</button></div></div>'
      : '<div class="note" style="background:var(--errc);color:var(--on-errc)"><span>' + icon('AlertCircle') + '</span><span class="bm"><b>' + esc(msg('failedMsg')) + '</b> ' + esc(p.error || '') + '</span></div><div class="row" style="gap:8px"><button class="btn tonal sm" data-retry="' + id + '">Try again</button><button class="btn text sm" data-dismiss="' + id + '">' + L('close') + '</button></div>') : '';
    var log = p.log.slice(-200).map(esc).join('\n');
    return '<article class="pcard" data-k="progress-' + id + '"><div class="row" style="gap:10px"><span class="sq">' + icon(TICON[inst.target] || 'Docker') + '</span><h3 class="tm grow">' + esc(inst.name) + ' · ' + L(inst.target) + '</h3>' + (p.done ? '' : '<span class="tag p">' + L('deploying') + '</span>') + '</div><ol class="col steps" style="gap:10px;margin:0;padding:0;list-style:none">' + rows + '</ol>' + done +
      '<details' + (p.done && !p.ok ? ' open' : '') + '><summary class="ll" style="cursor:pointer;min-height:40px">Details (' + p.log.length + ' lines)</summary><pre class="logbox" tabindex="0">' + log + '</pre></details></article>';
  }
  function instMatches(i, m) { return m.test([i.name, i.target, w(i.target), i.url, i.state, i.tag, i.notes].join(' ')); }
  R.instances = function () {
    var m = matcher(q.instances);
    var list = D.instances.filter(function (i) { return (view.filterTarget === 'all' || i.target === view.filterTarget) && (view.filterState === 'all' || i.state === view.filterState) && instMatches(i, m); });
    list.sort(function (a, b) { return view.sort === 'newest' ? String(b.created).localeCompare(a.created) : view.sort === 'state' ? String(a.state).localeCompare(b.state) : a.name.localeCompare(b.name); });
    var chip = function (k, v, label, cur) { return '<button class="chip' + (cur === v ? ' sel' : '') + '" aria-pressed="' + (cur === v) + '" data-' + k + '="' + v + '">' + label + '</button>'; };
    var counts = {}; D.instances.forEach(function (i) { counts[i.state] = (counts[i.state] || 0) + 1; });
    var nsel = Object.keys(view.sel).filter(function (k) { return view.sel[k]; }).length;
    return '<div class="section" id="top"><div class="row" style="gap:12px;flex-wrap:wrap"><h1 class="hl grow">' + L('instances') + '</h1><button class="btn fill" data-go="deploy:top">' + icon('Plus', 's') + 'New instance</button></div>' +
      '<div class="stats">' + [['All', D.instances.length], [w('running'), counts.running || 0], [w('stopped'), counts.stopped || 0], [w('failed'), counts.failed || 0], ['Backups', D.instances.reduce(function (n, i) { return n + (i.backups || []).length; }, 0)]].map(function (s) { return '<div class="stat"><span class="hs">' + s[1] + '</span><span class="bs mu">' + esc(s[0]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="toolbar">' + findField('isearch', 'Search instances', q.instances) + '<select class="select" data-isort aria-label="Sort">' + [['name', 'By name'], ['newest', 'Newest first'], ['state', 'By state']].map(function (o) { return '<option value="' + o[0] + '"' + (view.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="grow"></span><button class="btn text sm" data-act="refresh">' + icon('Refresh', 's') + 'Refresh</button><button class="btn text sm" data-act="export-instances">' + icon('Export', 's') + L('export') + '</button></div>' +
      '<div class="chipline" role="group" aria-label="Target">' + chip('ft', 'all', 'Every target', view.filterTarget) + ['docker', 'ssh', 'virtualbox', 'vmware'].map(function (t) { return chip('ft', t, L(t), view.filterTarget); }).join('') + '</div>' +
      '<div class="chipline" role="group" aria-label="State">' + chip('fs', 'all', 'Any state', view.filterState) + ['running', 'stopped', 'deploying', 'failed', 'unreachable'].map(function (s) { return chip('fs', s, L(s), view.filterState); }).join('') + '</div>' +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      (nsel ? '<div class="selbar" role="region" aria-label="Selected instances"><span class="ll grow">' + nsel + ' selected</span><button class="btn tonal sm" data-bulk="start">' + L('start') + '</button><button class="btn tonal sm" data-bulk="stop">' + L('stop') + '</button><button class="btn tonal sm" data-bulk="backup">' + L('backupNow') + '</button><button class="btn text sm" data-bulk="clear">' + L('clear') + '</button></div>' : '') +
      (D.instances.length ? (list.length ? '<div class="igrid">' + list.map(instCard).join('') + '</div>' : '<p class="bm mu">' + L('noMatch') + '</p>') :
        '<div class="empty"><span class="sq big">' + icon('RocketLaunch') + '</span><h2 class="tl">No instances yet</h2><p class="bm mu">Deploy one in one click. Each gets its own name, port and backups.</p><button class="btn fill" data-go="deploy:top">' + L('deploy') + '</button></div>') + '</div>' + foot();
  };
  function spark(id) {
    var v = (stats[id] || []).slice(-30); if (v.length < 2) return '';
    var max = Math.max(5, Math.max.apply(null, v)); var pts = v.map(function (x, i) { return (i * (120 / 29)).toFixed(1) + ',' + (30 - (x / max) * 28).toFixed(1); }).join(' ');
    return '<svg class="spark" viewBox="0 0 120 32" role="img" aria-label="Processor use, last ' + v.length + ' readings, now ' + v[v.length - 1].toFixed(1) + '%"><polyline points="' + pts + '" fill="none" stroke="var(--p)" stroke-width="2" stroke-linejoin="round"></polyline></svg>';
  }
  function instCard(i) {
    var busy = progress[i.id] && !progress[i.id].done; var run = i.state === 'running';
    var host = i.hostId ? (D.hosts.filter(function (h) { return h.id === i.hostId; })[0] || {}).address : '';
    return '<article class="icard" data-k="inst-' + i.id + '" id="inst-' + i.id + '"><div class="row" style="gap:10px"><input type="checkbox" aria-label="Select ' + esc(i.name) + '" data-isel="' + i.id + '"' + (view.sel[i.id] ? ' checked' : '') + '><span class="sq">' + icon(TICON[i.target]) + '</span><span class="col grow" style="min-width:0"><span class="tm ell">' + esc(i.name) + '</span><span class="bs mu ell">' + L(i.target) + (host ? ' · ' + esc(host) : '') + ' · ' + esc(i.tag || '') + '</span></span>' + stateTag(i.state) + '<button class="ib" data-imenu="' + i.id + '" aria-label="More for ' + esc(i.name) + '">' + icon('DotsVertical', 's') + '</button></div>' +
      (i.url ? '<div class="row" style="gap:6px"><a class="mono bm ell grow" href="' + esc(i.url) + '" data-ext="' + esc(i.url) + '">' + esc(i.url) + '</a><button class="ib" data-copy="' + esc(i.url) + '" aria-label="Copy the link of ' + esc(i.name) + '">' + icon('ContentCopy', 's') + '</button></div>' : '<span class="bs mu">' + (i.state === 'failed' ? esc(i.lastError || 'Deployment failed.') : 'No link yet.') + '</span>') +
      (run && i.stats ? '<div class="row" style="gap:12px"><span class="bs mu">CPU ' + i.stats.cpu.toFixed(1) + '% · memory ' + esc(i.stats.mem) + '</span><span class="grow"></span>' + spark(i.id) + '</div>' : '') +
      '<div class="row" style="gap:6px;flex-wrap:wrap">' + (i.target === 'pi' && i.state !== 'deploying' ? (i.url ? '<button class="btn fill sm" data-ext="' + esc(i.url) + '">' + icon('OpenInNew', 's') + L('open') + '</button>' : '') + '<span class="bs mu">Backups and updates: inside Home Assistant on the Pi, under Settings, System.</span>' : i.state === 'deploying' ? '<button class="btn tonal sm" data-go="deploy:top">' + icon('ProgressClock', 's') + 'Show the progress</button>' : run ? '<button class="btn fill sm" data-ext="' + esc(i.url) + '">' + icon('OpenInNew', 's') + L('open') + '</button><button class="btn tonal sm" data-a="stop" data-id="' + i.id + '"' + (busy ? ' disabled' : '') + '>' + L('stop') + '</button>' : i.state === 'failed' ? '<button class="btn fill sm" data-retry="' + i.id + '">Try again</button>' : '<button class="btn fill sm" data-a="start" data-id="' + i.id + '"' + (busy ? ' disabled' : '') + '>' + L('start') + '</button>') +
      (i.target === 'pi' ? '' : '<button class="btn tonal sm" data-a="backup" data-id="' + i.id + '"' + (busy ? ' disabled' : '') + '>' + icon('BackupRestore', 's') + L('backupNow') + '</button>') + '</div>' +
      '<details' + (view.open[i.id] ? ' open' : '') + ' data-iopen="' + i.id + '"><summary class="ll" style="cursor:pointer;min-height:40px">' + (i.backups || []).length + ' backups · details</summary>' +
      '<dl class="kv bs"><dt>Created</dt><dd>' + esc(when(i.created)) + '</dd><dt>Port</dt><dd>' + (i.port || 'set by VMware') + '</dd><dt>Data</dt><dd class="mono">' + esc(i.dir || '') + '</dd>' + (i.lanUrl ? '<dt>Other devices</dt><dd class="mono">' + esc(i.lanUrl) + '</dd>' : '') + '</dl>' +
      ((i.backups || []).slice(0, 5).map(function (b) { return '<div class="row" style="gap:8px"><span class="bs grow">' + esc(when(b.at)) + (b.note ? ' · ' + esc(b.note) : '') + (b.size ? ' · ' + fmtSize(b.size) : b.kind === 'snapshot' ? ' · snapshot' : '') + '</span><button class="btn text sm" data-restore="' + i.id + ':' + b.id + '">' + L('restore') + '</button></div>'; }).join('') || '<p class="bs mu">No backups yet.</p>') + '</details></article>';
  }
  R.backups = function () {
    var m = matcher(q.backups); var rows = [];
    D.instances.forEach(function (i) { (i.backups || []).forEach(function (b) { if (m.test(i.name + ' ' + (b.note || '') + ' ' + b.at)) rows.push([i, b]); }); });
    rows.sort(function (a, b) { return String(b[1].at).localeCompare(a[1].at); });
    var s = D.schedule;
    return '<div class="section" id="top"><h1 class="hl">' + L('backups') + '</h1><p class="bl mu">Docker and SSH instances are backed up as an archive of their config folder on this computer; virtual machines as snapshots. Restoring keeps the current config beside it, so nothing is lost.</p>' +
      '<section class="card col" id="schedule" data-k="schedule" style="padding:20px;gap:12px"><h2 class="tm">Every day, on a schedule</h2><div class="row" style="gap:12px;flex-wrap:wrap"><button class="sw' + (s.on ? ' on' : '') + '" role="switch" aria-checked="' + !!s.on + '" aria-label="Daily backups" data-sched="on"><i></i></button><span class="bm">Back up every instance at</span><input class="input" type="time" value="' + esc(s.time) + '" data-schedtime aria-label="Time of day"><span class="bm">and keep the newest</span><input class="input" type="number" min="1" max="365" value="' + s.keep + '" data-schedkeep aria-label="How many scheduled backups to keep" style="width:90px"></div>' +
      '<label class="row bm" style="gap:10px"><input type="checkbox" data-schedcons' + (s.consistent ? ' checked' : '') + '> Stop the container for a moment while backing up, so the database is consistent</label><p class="bs mu">Instances whose own backups are turned off are skipped. The app must be open at the time.</p></section>' +
      '<div class="toolbar">' + findField('bsearch', 'Search backups', q.backups) + '<span class="grow"></span><button class="btn tonal sm" data-act="backup-all">' + icon('BackupRestore', 's') + 'Back up every instance now</button></div>' +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      (rows.length ? '<div class="scrollbox"><table class="t"><thead><tr><th>Instance</th><th>Made</th><th>Kind</th><th>Size</th><th></th></tr></thead><tbody>' + rows.map(function (r) { return '<tr data-k="bk-' + r[1].id + '"><td class="ll">' + esc(r[0].name) + '</td><td class="bs">' + esc(when(r[1].at)) + (r[1].note ? ' · ' + esc(r[1].note) : '') + '</td><td class="bs">' + (r[1].kind === 'snapshot' ? 'Snapshot' : 'Archive') + '</td><td class="bs">' + (r[1].size ? fmtSize(r[1].size) : '') + '</td><td><button class="btn text sm" data-restore="' + r[0].id + ':' + r[1].id + '">' + L('restore') + '</button><button class="btn text sm" data-delbackup="' + r[0].id + ':' + r[1].id + '">' + L('remove') + '</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="bm mu">No backups yet. Use Back up now on an instance, or turn on the schedule.</p>') + '</div>' + foot();
  };
  R.downloads = function () {
    var m = matcher(q.downloads); var list = dls.filter(function (d) { return m.test(d.label + ' ' + (d.release || '') + ' ' + d.state); });
    var tone = { ready: 'g', downloading: 'p', checking: 'p', failed: 'err', none: 'a', skipped: 'a', waiting: '' };
    var word = { ready: 'Ready', downloading: 'Downloading', checking: 'Checking', failed: 'Failed', none: 'Not released yet', skipped: 'Skipped', waiting: 'Waiting' };
    return '<div class="section" id="top"><div class="row" style="gap:12px;flex-wrap:wrap"><h1 class="hl grow">' + L('downloads') + '</h1><button class="btn fill" data-act="dlall">' + icon('CloudDownload', 's') + 'Download everything now</button></div>' +
      '<p class="bl mu">Every operating system image and the container image are downloaded automatically, checked against their SHA-256 sums, and kept current, so deploying and writing a card start at once. Older versions are deleted when a newer one is ready.</p>' +
      '<div class="setting" id="s-auto" data-k="s-auto"><div class="col"><span class="ll">Download automatically</span><span class="bs mu">When the app starts and every six hours. SSH hosts pull the container image too.</span></div><div class="ctl"><button class="sw' + (D.autoDownload !== false ? ' on' : '') + '" role="switch" aria-checked="' + (D.autoDownload !== false) + '" aria-label="Download automatically" data-act="autodl"><i></i></button></div></div>' +
      findField('dsearch', 'Search downloads', q.downloads) +
      (list.length ? list.map(function (d) { var t = tone[d.state] || ''; return '<div class="row-item" data-k="dl-' + d.id + '"><span class="sq">' + icon(d.kind === 'container' ? 'Docker' : /rpi/.test(d.id) ? 'Chip' : d.id === 'vmware' ? 'Laptop' : 'Monitor') + '</span><span class="col grow" style="gap:4px"><span class="ll">' + esc(d.label) + '</span><span class="bs mu">' + esc([d.release, d.name, d.size ? fmtSize(d.size) : '', d.detail, d.at ? 'checked ' + when(d.at) : ''].filter(Boolean).join(' · ')) + '</span>' +
        (d.state === 'downloading' && d.fraction ? '<span class="pbar" role="progressbar" aria-valuenow="' + Math.round(d.fraction * 100) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.round(d.fraction * 100) + '%"></i></span>' : '') + (d.error ? '<span class="bs" style="color:var(--err)">' + esc(d.error) + '</span>' : '') + '</span><span class="tag ' + t + '"' + (t === 'err' ? ' style="background:var(--errc);color:var(--on-errc)"' : '') + '>' + word[d.state] + '</span></div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };
  async function piDialog() {
    var model = ($('#pimodel') || {}).value || 'rpi5';
    dialog('Write a Raspberry Pi card', '<p class="bm mu">The card or drive is erased completely. Only removable drives of 512 GB or less are listed; your system drive never is.</p>' +
      '<label class="col" style="gap:4px"><span class="ll">Model</span><select class="select" id="pim">' + PIM.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === model ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="row" style="gap:8px"><span class="ll grow">Card or drive</span><button class="btn text sm" id="pirefresh">' + icon('Refresh', 's') + 'Look again</button></div><div id="pidrives" class="col" style="gap:6px"><p class="bs mu">Looking for drives…</p></div>' +
      '<label class="col" style="gap:4px"><span class="ll">Name in this app</span><input class="input" id="piname" value="Raspberry Pi ' + (D.instances.filter(function (i) { return i.target === 'pi'; }).length + 1) + '" maxlength="60"></label><span class="field-err" id="pierr" role="alert"></span>' +
      '<div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="pigo">' + icon('Harddisk', 's') + 'Write</button></div>', { emoji: '🍓' });
    var drives = [];
    async function look() { $('#pidrives').innerHTML = '<p class="bs mu">Looking for drives…</p>'; try { drives = await API.drives(); } catch (e) { $('#pidrives').innerHTML = '<p class="field-err">' + esc(e.message) + '</p>'; return; } $('#pidrives').innerHTML = drives.length ? drives.map(function (d, n) { return '<label class="row-item" style="margin:0;cursor:pointer"><input type="radio" name="pidrive" value="' + n + '"' + (n === 0 ? ' checked' : '') + ' style="width:20px;height:20px"><span class="col grow"><span class="ll">' + esc(d.name) + '</span><span class="bs mu mono">' + esc(d.id) + ' · ' + fmtSize(d.size) + ' · ' + esc(d.bus) + '</span></span></label>'; }).join('') : '<p class="bm mu">No card or USB drive found. Put one in, then Look again.</p>'; }
    $('#pirefresh').onclick = look; look();
    $('#pigo').onclick = function () {
      var sel = $('input[name=pidrive]:checked'); if (!sel) { $('#pierr').textContent = 'Choose the card or drive to write.'; return; }
      var d = drives[+sel.value], m = $('#pim').value, nm = $('#piname').value.trim();
      superConfirm('Erase and write ' + d.name, ['Everything on ' + d.name + ' (' + fmtSize(d.size) + ', ' + d.id + ') is erased.', 'The ' + PIM.filter(function (x) { return x[0] === m; })[0][1] + ' image is written and read back to check it.', 'Your system asks for administrator permission to write the drive.'], 'ERASE', async function () {
        try { var id = await API.writePi({ model: m, drive: d, name: nm }); progress[id] = { step: 'image', text: 'Starting', fraction: 0, log: [], done: false }; await reload(); go('deploy:top'); } catch (e) { toast(e.message); }
      });
    };
  }
  R.hosts = function () {
    var m = matcher(q.hosts); var list = D.hosts.filter(function (h) { return m.test(h.name + ' ' + h.address + ' ' + h.user); });
    return '<div class="section" id="top"><div class="row" style="gap:12px;flex-wrap:wrap"><h1 class="hl grow">' + L('hosts') + '</h1><button class="btn fill" data-act="addhost">' + icon('Plus', 's') + 'Add a host</button></div><p class="bl mu">Linux computers with Docker that you reach over SSH. Passwords are encrypted with your system\'s keychain; a key file or the SSH agent is better.</p>' +
      findField('hsearch', 'Search hosts', q.hosts) + (list.length ? list.map(function (h) { var n = D.instances.filter(function (i) { return i.hostId === h.id; }).length; return '<div class="row-item" data-k="host-' + h.id + '"><span class="sq">' + icon('ServerNetwork') + '</span><span class="col grow"><span class="ll">' + esc(h.name) + '</span><span class="bs mu mono">' + esc(h.user) + '@' + esc(h.address) + ':' + h.port + ' · ' + (h.keyFile ? 'key ' + esc(h.keyFile) : h.password ? 'password saved' : 'SSH agent') + ' · ' + n + ' instances</span></span><button class="btn text sm" data-testhost="' + h.id + '">Test</button><button class="btn text sm" data-edithost="' + h.id + '">Edit</button><button class="btn text sm" data-rmhost="' + h.id + '">' + L('remove') + '</button></div>'; }).join('') : '<p class="bm mu">No hosts yet.</p>') + '</div>' + foot();
  };
  R.activity = function () {
    var m = matcher(q.activity);
    var list = activity.filter(function (a) { return (view.logFor === 'all' || a.id === view.logFor) && m.test(a.line); }).slice(-400);
    return '<div class="section" id="top"><h1 class="hl">' + L('activity') + '</h1><p class="bl mu">Everything the app did, as it happened, and the changes you made to its settings.</p><div class="toolbar">' + findField('asearch', 'Search activity', q.activity) +
      '<select class="select" data-logfor aria-label="Instance"><option value="all">Every instance</option>' + D.instances.map(function (i) { return '<option value="' + i.id + '"' + (view.logFor === i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</select><span class="grow"></span><button class="btn text sm" data-act="export-activity">' + icon('Export', 's') + L('export') + '</button></div>' +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      '<pre class="logbox tall" tabindex="0" aria-label="Activity log">' + (list.length ? list.map(function (a) { return esc(new Date(a.t).toLocaleTimeString() + '  ' + instName(a.id) + '  ' + a.line); }).join('\n') : 'Nothing yet.') + '</pre>' +
      '<h2 class="tl" id="history">Changes to settings</h2>' + (st.history.length ? st.history.slice(0, 50).map(function (h, i) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(h.label) + '</span><span class="bs mu">' + esc(new Date(h.t).toLocaleString()) + '</span></span><button class="btn text sm" data-undo="' + i + '">' + L('undo') + '</button></div>'; }).join('') : '<p class="bm mu">' + esc(msg('emptyHistory')) + '</p>') + '</div>' + foot();
  };
  function srow(id, title, desc, def, reach, ctl, path) {
    return '<div class="setting" id="s-' + id + '" data-k="s-' + id + '" data-search="' + esc(title + ' ' + desc) + '"><div class="col" style="gap:2px"><span class="stitle"><span class="ll">' + esc(title) + '</span><button class="ib" style="width:32px;height:32px" data-info="' + id + '" aria-label="' + esc(w('explain')) + ': ' + esc(title) + '" aria-expanded="false">' + icon('InformationOutline', 's') + '</button></span><span class="bs mu">' + esc(desc) + '</span></div>' +
      '<div class="ctl">' + ctl + (path ? '<button class="btn text sm" data-reset="' + path + '" aria-label="' + esc(w('reset')) + ': ' + esc(title) + '">' + icon('Restore', 's') + '</button>' : '') + '</div><div class="more bs mu" id="i-' + id + '" hidden><b>' + L('def') + ':</b> ' + esc(def) + '. <b>' + L('reaches') + ':</b> ' + esc(reach) + '</div></div>';
  }
  function get(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, st); }
  function sw(path, label) { var v = get(path); return '<button class="sw' + (v ? ' on' : '') + '" role="switch" aria-checked="' + !!v + '" aria-label="' + esc(label) + '" data-toggle="' + path + '"><i></i></button>'; }
  function seg(path, opts, label) { var v = String(get(path)); return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map(function (o) { return '<button class="' + (String(o[0]) === v ? 'sel' : '') + '" aria-pressed="' + (String(o[0]) === v) + '" data-set="' + path + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  R.settings = function () {
    var m = matcher(q.settings); var lv = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']];
    var groups = [
      ['deploy', 'deploying', [srow('defaultTarget', 'Target for Ctrl Shift D', 'Where a keyboard one-click deploy goes.', 'Docker on this computer', 'Ctrl Shift D', seg('defaultTarget', [['docker', 'Docker'], ['ssh', 'SSH'], ['virtualbox', 'VirtualBox'], ['vmware', 'VMware']], 'Default target'), 'defaultTarget'),
        srow('openAfter', 'Open Home Assistant when it is ready', 'Opens the new instance in your browser as soon as it answers.', 'On', 'Every deployment', sw('openAfter', 'Open when ready'), 'openAfter'),
        srow('data', 'Data folder', 'Where configurations, backups and downloaded images are kept.', '', 'Everything this app writes', '<button class="btn text sm" data-act="openfolder">' + icon('FolderOpen', 's') + 'Open the folder</button>', '')]],
      ['language', 'language', [srow('lang', 'Language mode', 'English, playful Hong Kong Cantonese, or both together.', 'English', 'Every label', seg('lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], 'Language mode'), 'lang'),
        srow('funEn', 'Playfulness in English', 'From 1, fully serious, to 5, as playful as it gets.', '5', 'Messages', seg('funEn', lv, 'Playfulness in English'), 'funEn'),
        srow('funYue', 'Playfulness in Cantonese', 'From 1 to 5, separate from English.', '5', 'Messages', seg('funYue', lv, 'Playfulness in Cantonese'), 'funYue'),
        srow('emoji', 'Emoji in dialogs', 'One emoji in dialog titles, never in buttons or names.', 'On', 'Dialog titles', sw('emoji', 'Emoji in dialogs'), 'emoji'),
        srow('vocab', 'Your wording file', st.vocab ? Object.keys(st.vocab).length + ' entries in use.' : 'A JSON file with schemaVersion 1 and entries replaces words in this window. You can also drop it on the window.', 'No file', 'Every label', '<label class="btn tonal sm">' + icon('Upload', 's') + 'Choose a file<input type="file" accept="application/json,.json" id="vocabfile" hidden></label>' + (st.vocab ? '<button class="btn text sm" data-act="vocab-clear">' + L('clear') + '</button>' : ''), '')]],
      ['appearance', 'appearance', [srow('theme', 'Theme', 'Light, dark, or follow the system.', 'System', 'The window', seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], 'Theme'), 'theme'),
        srow('seed', 'Main colour', 'The colour of buttons and selections.', '#00639B', 'The window', '<input type="color" value="' + st.seed + '" data-color="seed" aria-label="Main colour" style="width:48px;height:40px;border:0;background:none">', 'seed'),
        srow('density', 'Density', 'How much room rows take.', 'Comfortable', 'Lists', seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Density'), 'density'),
        srow('textScale', 'Text size', 'Larger text, nothing cut off.', '100%', 'The window', seg('textScale', [['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%']], 'Text size'), 'textScale'),
        srow('reduceMotion', 'Reduce motion', 'Stops animations; your system setting is followed too.', 'Off', 'The window', sw('reduceMotion', 'Reduce motion'), 'reduceMotion'),
        srow('contrast', 'More contrast', 'Darker secondary text and lines.', 'Off', 'The window', sw('contrast', 'More contrast'), 'contrast'),
        srow('lowStim', 'Low stimulation', 'Softer colour, no animation, no sounds.', 'Off', 'The window', sw('lowStim', 'Low stimulation'), 'lowStim'),
        srow('spotlight', 'Focus spotlight', 'Dims everything but the part with the keyboard focus.', 'Off', 'The window', sw('spotlight', 'Focus spotlight'), 'spotlight'),
        srow('sounds', 'Action sounds', 'A short sound when something finishes.', 'On', 'Deploys, backups, settings', sw('sounds', 'Action sounds'), 'sounds')]],
      ['tabsSet', 'tabs', [srow('edge', 'Where the tabs sit', 'Any edge of the window.', 'Top', 'The tab strip', seg('edge', [['top', 'Top'], ['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom']], 'Tab strip edge'), 'edge'),
        srow('openall', 'Open every tab', 'Reopens tabs you closed.', '', 'The tab strip', '<button class="btn tonal sm" data-act="openall">' + L('openall') + '</button>', '')]],
      ['locks', 'locks', [Object.keys(st.locks).length ? Object.keys(st.locks).map(function (k) { var o = st.locks[k]; return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(o.label) + '</span><span class="bs mu">' + (unlocked[k] ? 'Unlocked until the window closes' : 'Locked') + '</span></span><button class="btn text sm" data-rmlock="' + esc(k) + '">Remove</button></div>'; }).join('') : '<p class="bm mu">Nothing is locked. Right-click any card, for example an instance, and choose Lock this element, so it cannot be stopped or removed by accident.</p>', '<p class="bs mu">A lock is a speed bump for fun, not security.</p>']],
      ['resetAll', 'reset', [srow('welcome', 'Welcome again', 'The first-run setup: language, the check of every target, and your default.', '', 'This window', '<button class="btn tonal sm" data-act="welcome">Open it</button>', ''),
        srow('expset', 'Export your settings', 'This window\'s choices as JSON.', '', 'A file you save', '<button class="btn text sm" data-act="export-settings">JSON</button>', ''),
        srow('resetall', 'Reset everything in this window', 'Settings, locks and history of this window go back to the start. Instances and backups are not touched.', '', 'This window only', '<button class="btn err sm" data-act="resetall">' + L('resetAll') + '</button>', '')]]
    ];
    var out = groups.map(function (g) { var rows = g[2].filter(function (r) { var mm = r.match(/data-search="([^"]*)"/); return !q.settings || !mm || m.test(mm[1]); }); if (q.settings && !rows.length) return ''; return '<section class="section" id="' + g[1] + '"><h2 class="tl">' + (W[g[0]] ? L(g[0]) : 'Deploying') + '</h2>' + rows.join('') + '</section>'; }).join('');
    return '<div class="section" id="top"><h1 class="hl">' + L('settings') + '</h1>' + findField('ssearch', 'Search settings', q.settings) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  var HELP = [
    ['oneclick', 'One click', 'Deploy now uses the defaults: the next free name and port, the latest image, two processors and 4 GB for a virtual machine, and daily backups on. Options lets you change any of them first. Ctrl Shift D deploys to your default target.'],
    ['docker', 'Docker on this computer', 'Needs Docker Desktop (Windows, macOS) or Docker Engine (Linux), running. The app writes compose.yaml and a config folder in its data folder, then runs docker compose. Each instance publishes its own port, so you can run as many as your computer can hold. Other devices on your network can open the second link shown.'],
    ['ssh', 'SSH host', 'Any Linux computer with Docker Engine and Compose, such as a Raspberry Pi 4 or 5 or a server. Add it under SSH hosts with a key file, the SSH agent, or a password. The app writes the files in ~/home-assistant-material/<name> on the host. If the link does not open, a firewall on the host may block the port.'],
    ['virtualbox', 'VirtualBox', 'Needs VirtualBox 7. The app downloads the operating system image from the latest release that has one, checks its SHA-256 sum, makes a virtual machine with EFI, and forwards a free port on this computer to it. The first start takes several minutes while the system sets itself up.'],
    ['vmware', 'VMware', 'Needs VMware Workstation Pro or Fusion with OVF Tool. The app imports the .ova image into a new machine on VMware\'s NAT network and gives you the address the machine reports. If no address appears, open the machine in VMware to see its console.'],
    ['backups', 'Backups and restoring', 'Docker and SSH backups are .tar.gz archives of the config folder, kept on this computer. Virtual machines are backed up as snapshots. Restoring moves the current config aside (named config.before-restore-<time>) before unpacking, so you can always go back. Restoring and removing ask twice.'],
    ['update', 'Updating', 'Update downloads the newest image for the instance\'s tag and recreates the container; the config folder stays. Virtual machines update from Settings inside Home Assistant.'],
    ['links', 'Links and ports', 'Docker and VirtualBox instances open at http://localhost:<port>. SSH instances open at the host\'s address and port. The app starts at port 8123 and moves up to the next free one.'],
    ['keys', 'Keyboard', 'Ctrl Shift F searches everything. Ctrl Shift D deploys in one click. Shift F10 or the menu key opens the tools of the focused card. Arrow keys move between tabs. Escape closes.'],
    ['privacy', 'What leaves your computer', 'Only what a deployment needs: the image download from GitHub Container Registry or the release, the SSH connection you set up, and nothing else. No analytics, no account, nothing to buy.']
  ];
  HELP.splice(5, 0, ['pi', 'Raspberry Pi card', 'Choose the model, put an SD card or USB drive of 32 GB or more in this computer, and press Write. The drive is erased, the image is written and read back to check it; your system asks for administrator permission for that step only. Put the card in the Pi, connect the network cable and power it on: the app waits for it at homeassistant.local and adds it to Instances with its link. Pi 4 and 5 also start from a USB drive.'], ['downloads', 'Automatic downloads', 'The app keeps every operating system image and the container image downloaded and current: on start and every six hours. Each image is checked against SHA256SUMS of its release. Turn it off on the Downloads tab.']);
  R.help = function () {
    var m = matcher(q.help); var list = HELP.filter(function (h) { return m.test(h[1] + ' ' + h[2]); });
    return '<div class="section" id="top"><h1 class="hl">' + L('help') + '</h1><p class="bl mu">Every article works offline.</p>' + findField('hpsearch', 'Search help', q.help) + (list.length ? list.map(function (h) { return '<article class="card col" id="h-' + h[0] + '" data-k="help-' + h[0] + '" style="padding:20px;gap:8px"><h2 class="tm">' + esc(h[1]) + '</h2><p class="bm">' + esc(h[2]) + '</p></article>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };

  // ---------- Shell ----------
  function shell() {
    var app = $('#app');
    var winBtns = DEMO ? '' : '<span class="winctl"><button class="ib" data-win="min" aria-label="Minimize">' + icon('WindowMinimize', 's') + '</button><button class="ib" data-win="max" aria-label="Maximize">' + icon('WindowMaximize', 's') + '</button><button class="ib wclose" data-win="close" aria-label="Close the window">' + icon('Close', 's') + '</button></span>';
    app.innerHTML = '<a class="skip" href="#main">Skip to the page</a><div class="shell edge-' + st.edge + '">' +
      '<header class="topbar drag" data-k="topbar"><span class="brand"><span class="logo ' + st.logo.shape + '" aria-hidden="true">' + icon('RocketLaunch', 's') + '</span><b>' + esc(st.name) + '</b>' + (DEMO ? '<span class="tag a">Demo</span>' : '') + '</span>' +
      '<button class="btn tonal sm nodrag" data-act="palette" aria-label="' + esc(w('palette')) + ', Ctrl Shift F">' + icon('Magnify', 's') + '<span class="opt">' + L('search') + '</span><span class="kbd opt">Ctrl Shift F</span></button>' +
      '<button class="ib nodrag opt" data-act="theme" aria-label="' + esc(w('theme')) + '">' + icon('ThemeLightDark') + '</button><button class="ib nodrag" data-act="access" aria-label="' + esc(w('access')) + '">' + icon('HumanHandsup') + '</button>' +
      '<button class="ib nodrag" data-act="bell" aria-label="' + esc(w('notifications')) + '" style="position:relative">' + icon('Bell') + '<span class="badge" id="bellcount" hidden>0</span></button>' + winBtns + '</header>' +
      '<nav class="tabstrip" role="tablist" aria-label="Pages" data-k="tabs"></nav><main class="main" id="main">' + TABS.map(function (t) { return '<section class="pane" role="tabpanel" id="p-' + t + '" aria-labelledby="t-' + t + '" hidden></section>'; }).join('') + '</main></div><div class="toasts" aria-live="polite"></div>';
    tabstrip(); bell();
  }
  function tabstrip() {
    var nav = $('.tabstrip'); var order = st.tabs.open.slice().sort(function (a, b) { return (st.tabs.pinned.indexOf(b) >= 0) - (st.tabs.pinned.indexOf(a) >= 0); });
    var badge = { instances: D.instances.length, hosts: D.hosts.length };
    nav.innerHTML = order.map(function (t) {
      var sel = t === st.active, pin = st.tabs.pinned.indexOf(t) >= 0;
      return '<button class="pt' + (sel ? ' sel' : '') + '" role="tab" id="t-' + t + '" aria-selected="' + sel + '" aria-controls="p-' + t + '" tabindex="' + (sel ? 0 : -1) + '" draggable="true" data-tab="' + t + '" data-k="tab-' + t + '">' + (pin ? icon('Pin', 'pin') : '') + L(t) + (badge[t] ? '<span class="count">' + badge[t] + '</span>' : '') +
        (pin ? '' : '<span class="x" role="button" tabindex="-1" data-closetab="' + t + '" aria-label="' + esc(w('close')) + ' ' + esc(w(t)) + '">' + icon('Close', 's') + '</span>') + '</button>';
    }).join('') + '<button class="ib" style="width:44px;height:44px;flex:none" data-act="newtab" aria-label="' + esc(w('newtab')) + '">' + icon('Plus') + '</button>';
  }
  var keepFocus = null;
  function render() {
    if (st.tabs.open.indexOf(st.active) < 0) st.active = st.tabs.open[0] || 'deploy';
    if (!st.tabs.open.length) { st.tabs.open = ['deploy']; st.active = 'deploy'; }
    var a = document.activeElement, fid = a && a.id, pos = a && a.selectionStart, scroll = window.scrollY;
    var openDetails = $$('#p-' + st.active + ' details[open]').map(function (d) { return d.closest('[data-k]') ? d.closest('[data-k]').dataset.k : ''; });
    tabstrip();
    TABS.forEach(function (t) { var p = $('#p-' + t); p.hidden = t !== st.active; p.innerHTML = t === st.active ? R[t]() : ''; });
    openDetails.forEach(function (k) { var d = $('[data-k="' + k + '"] details'); if (d) d.open = true; });
    decorate(); applyVocab($('#app'));
    if (fid && $('#' + fid)) { var n = $('#' + fid); n.focus({ preventScroll: true }); try { if (pos != null) n.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } }
    window.scrollTo(0, scroll);
    $$('.logbox').forEach(function (l) { l.scrollTop = l.scrollHeight; });
    document.title = st.name + ' · ' + w(st.active);
  }
  var renderQueued = false;
  function soon() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(function () { renderQueued = false; if (!$('.popover') && !($('#ov') && $('#ov').dataset.keep)) render(); else render(); }); }
  function decorate() {
    $$('[data-k]', $('#app')).forEach(function (el) {
      var k = el.dataset.k, look = st.look[k];
      if (look) { if (look.color) el.style.color = look.color; if (look.bg) el.style.background = look.bg; if (look.radius != null) el.style.borderRadius = look.radius + 'px'; if (look.size) el.style.fontSize = look.size + '%'; if (look.weight) el.style.fontWeight = look.weight; }
      var lk = st.locks[k]; var mark = el.querySelector(':scope > .lockmark');
      if (lk && !unlocked[k]) { el.classList.add('locked'); if (!mark) el.insertAdjacentHTML('afterbegin', '<span class="lockmark" aria-label="Locked">' + icon('Lock', 's') + '</span>'); } else { el.classList.remove('locked'); if (mark) mark.remove(); }
    });
  }
  function go(target) {
    var p = String(target).split(':'), tab = p[0], anchor = p[1] || 'top';
    if (st.tabs.open.indexOf(tab) < 0) st.tabs.open.push(tab);
    st.active = tab; save(); render();
    setTimeout(function () { var el = document.getElementById(anchor) || $('#p-' + tab); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1500); } }, 30);
  }

  // ---------- Deploying ----------
  async function oneClick(target, overrides) {
    if (target === 'ssh' && !D.hosts.length) { hostDialog(null, function () { oneClick('ssh', overrides); }); return; }
    if (checks[target] && !checks[target].ok) { toast(w(target) + ': ' + checks[target].detail + ' ' + (checks[target].fix || '')); go('deploy:target-' + target); return; }
    var hostId = target === 'ssh' ? (($('#sshhost') || {}).value || (D.hosts[0] || {}).id) : '';
    try {
      var id = await API.deploy(Object.assign({ target: target, hostId: hostId }, overrides || {}));
      progress[id] = { step: (STEPS[target] || [])[0], text: 'Starting', fraction: 0, log: [], done: false };
      addActivity(id, 'Deploy started (' + w(target) + ')', 'action'); beep('on');
      st.active = 'deploy'; save(); await reload(); render();
    } catch (e) { toast(e.message); beep('bad'); }
  }
  async function optionsDialog(target) {
    var d; try { d = await API.defaults(target, target === 'ssh' ? (D.hosts[0] || {}).id : ''); } catch (e) { toast(e.message); return; }
    var vm = target === 'virtualbox' || target === 'vmware';
    var f = function (id, label, value, type, hint, extra) { return '<label class="col" style="gap:4px"><span class="ll">' + label + '</span><input class="input" id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value) + '"' + (extra || '') + '>' + (hint ? '<span class="bs mu">' + hint + '</span>' : '') + '</label>'; };
    dialog('Deploy to ' + w(target), '<p class="bm mu">Everything is filled in; change what you like, then Deploy.</p><div class="grid2">' + f('o-name', 'Name', d.name, 'text', 'Shown in this app; the container and folder use a safe form of it.', ' maxlength="60"') +
      (target === 'vmware' ? '' : f('o-port', 'Port', d.port, 'number', target === 'ssh' ? 'On the host.' : 'Free on this computer right now.', ' min="1" max="65535"')) +
      (target === 'ssh' ? '<label class="col" style="gap:4px"><span class="ll">Host</span><select class="select" id="o-host">' + D.hosts.map(function (h) { return '<option value="' + h.id + '">' + esc(h.name) + '</option>'; }).join('') + '</select></label>' : '') +
      (vm ? f('o-cpus', 'Processors', d.cpus, 'number', '', ' min="1" max="32"') + f('o-mem', 'Memory in MB', d.memoryMb, 'number', '2048 or more; 4096 is comfortable.', ' min="1024" step="512"') + (target === 'virtualbox' ? f('o-disk', 'Disk size in GB (0 keeps the image size)', d.diskGb, 'number', '', ' min="0"') : '') :
        f('o-tag', 'Image tag', d.tag, 'text', 'latest, or a release such as 2026.11.1.64.') + f('o-tz', 'Time zone', d.timezone) + f('o-memlimit', 'Memory limit (optional)', d.memoryLimit, 'text', 'For example 2g. Empty means no limit.')) +
      '</div><label class="row bm" style="gap:10px"><input type="checkbox" id="o-backups" checked> Include it in the daily backups</label><span class="field-err" id="o-err" role="alert"></span>' +
      '<div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="o-go">' + icon('RocketLaunch', 's') + L('deploy') + '</button></div>', { emoji: '🚀' });
    $('#o-go').addEventListener('click', function () {
      var v = function (id) { var e = $('#' + id); return e ? e.value.trim() : ''; };
      var port = Number(v('o-port'));
      if (target !== 'vmware' && (!Number.isInteger(port) || port < 1 || port > 65535)) { $('#o-err').textContent = 'The port must be a whole number from 1 to 65535.'; return; }
      if (!v('o-name')) { $('#o-err').textContent = 'Give the instance a name.'; return; }
      var o = { name: v('o-name'), port: port || 0, tag: v('o-tag'), timezone: v('o-tz'), memoryLimit: v('o-memlimit'), cpus: Number(v('o-cpus')) || '', memoryMb: Number(v('o-mem')) || '', diskGb: Number(v('o-disk')) || '', backupsOn: $('#o-backups').checked, hostId: v('o-host') };
      closeDialog(); oneClick(target, o);
    });
  }
  function hostDialog(h, after) {
    h = h || {};
    dialog(h.id ? 'Edit ' + h.name : 'Add an SSH host', '<div class="grid2"><label class="col" style="gap:4px"><span class="ll">Name</span><input class="input" id="h-name" value="' + esc(h.name || '') + '" placeholder="Living room Pi"></label><label class="col" style="gap:4px"><span class="ll">Address</span><input class="input mono" id="h-addr" value="' + esc(h.address || '') + '" placeholder="192.168.1.20"></label>' +
      '<label class="col" style="gap:4px"><span class="ll">User</span><input class="input mono" id="h-user" value="' + esc(h.user || '') + '" placeholder="pi"></label><label class="col" style="gap:4px"><span class="ll">SSH port</span><input class="input" id="h-port" type="number" value="' + (h.port || 22) + '"></label></div>' +
      '<label class="col" style="gap:4px"><span class="ll">Private key file (best)</span><span class="row" style="gap:8px"><input class="input mono grow" id="h-key" value="' + esc(h.keyFile || '') + '" placeholder="Empty: use the SSH agent">' + (DEMO ? '' : '<button class="btn tonal sm" id="h-pick">Choose</button>') + '</span></label>' +
      '<div class="grid2"><label class="col" style="gap:4px"><span class="ll">Key passphrase</span><input class="input" id="h-pass2" type="password" value="' + esc(h.passphrase || '') + '"></label><label class="col" style="gap:4px"><span class="ll">Or a password</span><input class="input" id="h-pass" type="password" value="' + esc(h.password || '') + '"></label></div>' +
      '<p class="bs mu">Passwords are encrypted with your system\'s keychain and never shown again. The host needs Docker Engine with Compose, and the user must be allowed to run docker.</p><div class="bm" id="h-res" role="status"></div>' +
      '<div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn tonal" id="h-test">Save and test</button><button class="btn fill" id="h-save">Save</button></div>', { emoji: '🖥️' });
    var collect = function () { return { id: h.id, name: $('#h-name').value.trim(), address: $('#h-addr').value.trim(), user: $('#h-user').value.trim(), port: Number($('#h-port').value) || 22, keyFile: $('#h-key').value.trim(), passphrase: $('#h-pass2').value, password: $('#h-pass').value }; };
    if ($('#h-pick')) $('#h-pick').onclick = async function () { var k = await API.pickKey(); if (k) $('#h-key').value = k; };
    $('#h-test').onclick = async function () { $('#h-res').textContent = 'Connecting…'; try { var r = await API.testHost(collect()); $('#h-res').textContent = (r.ok ? '✓ ' : '') + r.detail + (r.fix ? ' ' + r.fix : ''); await reload(); } catch (e) { $('#h-res').textContent = e.message; } };
    $('#h-save').onclick = async function () { try { await API.saveHost(collect()); closeDialog(); await reload(); render(); toast(msg('saved')); if (after) after(); } catch (e) { $('#h-res').textContent = e.message; } };
  }
  function instMenu(id, x, y) {
    var i = D.instances.filter(function (z) { return z.id === id; })[0]; if (!i) return;
    closePop(); var p = document.createElement('div'); p.className = 'popover'; p.setAttribute('role', 'menu'); p.setAttribute('aria-label', 'More for ' + i.name);
    var items = [['restart', 'Restart', 'Restart', 'R'], ['update', 'Update the image', 'Update', 'U'], ['logs', 'Show its logs', 'ConsoleLine', 'G'], ['rename', 'Rename or add a note', 'Pencil', 'N'], ['folder', 'Open its folder', 'FolderOpen', 'F'], ['remove', 'Remove', 'DeleteOutline', 'Del']];
    p.innerHTML = findField('imq', w('filterMenu'), '') + items.map(function (t) { return '<button class="mi" role="menuitem" data-ima="' + t[0] + '" data-name="' + t[1] + '">' + icon(t[2], 's') + '<span class="bm">' + t[1] + '</span><span class="kbd">' + t[3] + '</span></button>'; }).join('');
    $('#app').appendChild(p); var r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px'; $('#imq').focus();
    $('#imq').addEventListener('input', function () { var m = matcher(this.value); $$('.mi', p).forEach(function (b) { b.hidden = !m.test(b.dataset.name); }); });
    p.addEventListener('keydown', function (e) { var map = { r: 'restart', u: 'update', g: 'logs', n: 'rename', f: 'folder', delete: 'remove' }; if (e.target.id !== 'imq' || e.altKey) { var a = map[e.key.toLowerCase()]; if (a) { e.preventDefault(); act(a); } } });
    p.addEventListener('click', function (e) { var b = e.target.closest('[data-ima]'); if (b) act(b.dataset.ima); });
    function act(a) {
      closePop();
      if (isLocked('inst-' + id) && /restart|update|remove/.test(a)) { askUnlock('inst-' + id); return; }
      if (a === 'restart' || a === 'update') doAction(id, a);
      if (a === 'logs') { view.logFor = id; doAction(id, 'logs'); go('activity:top'); }
      if (a === 'folder') API.openFolder(id).catch(function (er) { toast(er.message); });
      if (a === 'rename') { dialog('Rename ' + i.name, '<label class="col" style="gap:4px"><span class="ll">Name</span><input class="input" id="rn" value="' + esc(i.name) + '" maxlength="60"></label><label class="col" style="gap:4px"><span class="ll">Note</span><textarea class="input" id="rnn" style="font-family:inherit;min-height:80px">' + esc(i.notes || '') + '</textarea></label><div class="row"><span class="grow"></span><button class="btn fill" id="rnok">Save</button></div>'); $('#rnok').onclick = async function () { await API.update(id, { name: $('#rn').value.trim() || i.name, notes: $('#rnn').value }); closeDialog(); await reload(); render(); toast(msg('saved')); }; }
      if (a === 'remove') superConfirm('Remove ' + i.name, ['The ' + (i.target === 'virtualbox' || i.target === 'vmware' ? 'virtual machine is deleted' : 'container is removed') + '.', 'Its configuration and data are deleted' + (i.target === 'ssh' ? ' on the host' : '') + '.', 'Backups on this computer stay in the backups folder.'], i.slug.toUpperCase(), function () { doAction(id, 'remove'); });
    }
  }
  async function doAction(id, a, arg) {
    if (isLocked('inst-' + id) && /stop|remove|restore/.test(a)) { askUnlock('inst-' + id); return; }
    progress[id] = progress[id] && !progress[id].done ? progress[id] : (a === 'deploy' ? { step: 'config', log: [], done: false } : progress[id]);
    addActivity(id, a.charAt(0).toUpperCase() + a.slice(1) + ' started', 'action');
    try { await API.action(id, a, arg); } catch (e) { toast(e.message); }
  }

  // ---------- Command palette ----------
  function paletteItems() {
    var items = [];
    TABS.forEach(function (t) { items.push({ kind: 'Page', label: w(t), go: t + ':top' }); });
    items.push({ kind: 'Deploy', label: 'Write a Raspberry Pi card', act: 'pi' }); items.push({ kind: 'Action', label: 'Download everything now', act: 'dlall' });
    ['docker', 'ssh', 'virtualbox', 'vmware'].forEach(function (t) { items.push({ kind: 'Deploy', label: 'Deploy in one click: ' + w(t), act: 'deploy-' + t }); items.push({ kind: 'Deploy', label: 'Deploy with options: ' + w(t), act: 'options-' + t }); });
    D.instances.forEach(function (i) { items.push({ kind: 'Instance', label: i.name, sub: (i.url || '') + ' · ' + w(i.state), go: 'instances:inst-' + i.id }); if (i.url) items.push({ kind: 'Open', label: 'Open ' + i.name, act: 'open-' + i.id }); items.push({ kind: 'Backup', label: 'Back up ' + i.name, act: 'backup-' + i.id }); });
    D.hosts.forEach(function (h) { items.push({ kind: 'Host', label: h.name, sub: h.user + '@' + h.address, go: 'hosts:host-' + h.id }); });
    HELP.forEach(function (h) { items.push({ kind: 'Help', label: h[1], sub: h[2], go: 'help:h-' + h[0] }); });
    [['lang', 'Language mode', 'seg', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']]], ['theme', 'Theme', 'seg', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]], ['openAfter', 'Open Home Assistant when ready', 'sw'], ['reduceMotion', 'Reduce motion', 'sw'], ['contrast', 'More contrast', 'sw'], ['lowStim', 'Low stimulation', 'sw'], ['sounds', 'Action sounds', 'sw'],
      ['textScale', 'Text size', 'seg', [['1', '100%'], ['1.5', '150%'], ['2', '200%']]], ['edge', 'Where the tabs sit', 'seg', [['top', 'Top'], ['left', 'Left'], ['bottom', 'Bottom']]]].forEach(function (s) { items.push({ kind: 'Setting', label: s[1], go: 'settings:s-' + s[0], set: s }); });
    [['Add an SSH host', 'addhost'], ['Back up every instance now', 'backup-all'], ['Refresh every instance', 'refresh'], ['Export the list of instances', 'export-instances'], ['Open the pattern workbench', 'wb'], ['Open every tab', 'openall'], ['Open the welcome', 'welcome']].forEach(function (a) { items.push({ kind: 'Action', label: a[0], act: a[1] }); });
    return items;
  }
  var palSel = 0;
  function palette() {
    dialog(w('palette'), findField('palq', 'Search instances, deploys, settings, help and actions', '') + '<div class="cmd-list" id="pallist" role="listbox" aria-label="Results"></div><p class="bs mu">Arrow keys move, Enter goes, Escape closes. Settings change right in the list.</p>',
      { full: st.paletteFull, extra: '<button class="ib" data-act="pal-size" aria-label="' + (st.paletteFull ? 'Smaller' : 'Full window') + '">' + icon('Fullscreen') + '</button>', focus: '#palq' });
    var items = paletteItems(); palSel = 0;
    function draw() {
      var m = matcher($('#palq').value); var list = items.filter(function (i) { return m.test(i.label + ' ' + i.kind + ' ' + (i.sub || '')); }).slice(0, 80);
      $('#pallist').innerHTML = list.length ? list.map(function (i, n) { var ctl = i.set ? (i.set[2] === 'sw' ? sw(i.set[0], i.label) : seg(i.set[0], i.set[3], i.label)) : ''; return '<div class="cmd-row' + (n === palSel ? ' act' : '') + '" role="option" aria-selected="' + (n === palSel) + '" data-n="' + n + '"><span class="tag">' + i.kind + '</span><span class="col grow" style="min-width:0"><span class="ll">' + esc(i.label) + '</span>' + (i.sub ? '<span class="bs mu ell">' + esc(i.sub) + '</span>' : '') + '</span>' + ctl + '</div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + (m.ok ? '' : ' ' + esc(m.error)) + '</p>';
      $('#pallist').__list = list;
    }
    function run(i) { if (!i) return; closeDialog(); if (i.go) go(i.go); else action(i.act); }
    $('#palq').addEventListener('input', function () { palSel = 0; draw(); });
    $('#palq').addEventListener('keydown', function (e) { var l = $('#pallist').__list || []; if (e.key === 'ArrowDown') { palSel = Math.min(l.length - 1, palSel + 1); draw(); e.preventDefault(); } if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); draw(); e.preventDefault(); } if (e.key === 'Enter') { run(l[palSel]); e.preventDefault(); } });
    $('#pallist').addEventListener('click', function (e) { if (e.target.closest('[data-toggle],[data-set]')) { setTimeout(draw, 0); return; } var r = e.target.closest('.cmd-row'); if (r) run(($('#pallist').__list || [])[+r.dataset.n]); });
    draw();
  }

  // ---------- Helpers ----------
  function copy(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast(msg('copied')); }, function () { toast('Copying was not allowed.'); }); }
  function rows2csv(rows) { var ks = Object.keys(rows[0] || {}); return [ks.join(',')].concat(rows.map(function (r) { return ks.map(function (k) { var v = r[k] == null ? '' : String(r[k]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); })).join('\n'); }
  function rows2md(rows) { var ks = Object.keys(rows[0] || {}); return '| ' + ks.join(' | ') + ' |\n| ' + ks.map(function () { return '---'; }).join(' | ') + ' |\n' + rows.map(function (r) { return '| ' + ks.map(function (k) { return String(r[k] == null ? '' : r[k]).replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }).join('\n'); }
  async function saveText(name, text) { if (DEMO) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text])); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return; } var f = await API.saveFile(name, text); if (f) toast('Saved to ' + f); }
  async function action(a) {
    if (/^deploy-/.test(a)) return oneClick(a.slice(7));
    if (/^options-/.test(a)) return optionsDialog(a.slice(8));
    if (/^open-/.test(a)) { var i = D.instances.filter(function (x) { return x.id === a.slice(5); })[0]; if (i && i.url) openUrl(i.url); return; }
    if (/^backup-/.test(a) && a !== 'backup-all') return doAction(a.slice(7), 'backup');
    if (a === 'backup-all') { D.instances.forEach(function (i) { if (i.state !== 'failed') doAction(i.id, 'backup', 'Manual, every instance'); }); return; }
    if (a === 'addhost') return hostDialog(null);
    if (a === 'pi') return piDialog();
    if (a === 'dlall') { API.downloadAll(); toast('Downloading everything that is missing or out of date.'); return; }
    if (a === 'refresh') { await API.refresh(); await reload(); render(); return; }
    if (a === 'wb') return workbench('');
    if (a === 'welcome') return welcome(true);
    if (a === 'openall') { var before = st.tabs.open.slice(); st.tabs.open = TABS.slice(); save(); render(); toast('Every tab is open.', { undo: function () { st.tabs.open = before; save(); render(); } }); return; }
    if (a === 'export-instances') { var rows = await API.exportList(); dialog('Export the list of instances', ['json', 'csv', 'md', 'txt'].map(function (f) { return '<button class="btn tonal" data-fx="' + f + '">' + f.toUpperCase() + '</button>'; }).join(' ')); $('#ov').addEventListener('click', function (e) { var b = e.target.closest('[data-fx]'); if (!b) return; var f = b.dataset.fx; closeDialog(); saveText('instances.' + f, f === 'json' ? JSON.stringify(rows, null, 2) : f === 'csv' ? rows2csv(rows) : f === 'md' ? rows2md(rows) : rows.map(function (r) { return r.name + ': ' + r.address + ' (' + r.state + ')'; }).join('\n')); }); return; }
    if (a === 'export-activity') return saveText('activity.txt', activity.map(function (x) { return new Date(x.t).toISOString() + '  ' + instName(x.id) + '  ' + x.line; }).join('\n'));
    if (a === 'export-settings') return saveText('deploy-assistant-settings.json', JSON.stringify(st, null, 2));
    if (a === 'resetall') superConfirm('Reset everything in this window', ['Settings, locks and history of this window go back to the start.', 'Instances, hosts and backups are not touched.'], 'RESET', function () { try { localStorage.removeItem(KEY); } catch (e) { /* off */ } st = load(); apply(); shell(); render(); toast(msg('reset')); });
  }
  function openUrl(u) { if (DEMO) { toast('In the app this opens ' + u + ' in your browser.'); return; } API.open(u).catch(function (e) { toast(e.message); }); }
  function welcome(force) {
    if (st.welcomed && !force) return;
    var i = Math.min(st.welcomeStep || 0, 3);
    function draw() {
      var body;
      if (i === 0) body = '<h3 class="tm">Choose a language</h3>' + seg('lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], 'Language mode');
      else if (i === 1) body = '<h3 class="tm">What this computer can run</h3>' + ['docker', 'ssh', 'virtualbox', 'vmware'].map(function (t) { var c = checks[t]; return '<div class="row-item"><span class="sq">' + icon(TICON[t]) + '</span><span class="col grow"><span class="ll">' + L(t) + '</span><span class="bs mu">' + esc(c ? c.detail + (c.ok ? '' : ' ' + (c.fix || '')) : 'Checking…') + '</span></span>' + (c ? (c.ok ? '<span class="tag g">Ready</span>' : '<span class="tag a">Needs setup</span>') : '') + '</div>'; }).join('') + '<button class="btn text sm" id="wre">' + icon('Refresh', 's') + 'Check again</button>';
      else if (i === 2) body = '<h3 class="tm">Where should one click deploy?</h3>' + seg('defaultTarget', [['docker', 'Docker'], ['ssh', 'SSH'], ['virtualbox', 'VirtualBox'], ['vmware', 'VMware']], 'Default target') + '<p class="bs mu">Ctrl Shift D deploys there from anywhere in the app. You can still pick any target on the Deploy tab.</p>';
      else body = '<h3 class="tm">Ready</h3><p class="bm">Press Deploy now on a card. When it is ready you get the link, and the instance appears under Instances with its backups. Ctrl Shift F searches everything.</p>';
      dialog(w('welcome') + ' · ' + (i + 1) + ' of 4', body + '<div class="row" style="gap:8px"><button class="btn text" id="wskip">' + L('skip') + '</button><span class="grow"></span>' + (i ? '<button class="btn text" id="wback">' + L('back') + '</button>' : '') + '<button class="btn fill" id="wnext">' + (i === 3 ? L('done') : L('next')) + '</button></div>', { emoji: '👋' });
      $('#wnext').onclick = function () { if (i === 3) { st.welcomed = true; st.welcomeStep = 0; save(); closeDialog(); go('deploy:top'); } else { i++; st.welcomeStep = i; save(); draw(); } };
      if ($('#wback')) $('#wback').onclick = function () { i--; st.welcomeStep = i; save(); draw(); };
      if ($('#wre')) $('#wre').onclick = function () { checkAll().then(draw); };
      $('#wskip').onclick = function () { st.welcomed = true; save(); closeDialog(); };
    }
    draw();
  }
  async function checkAll() { await Promise.all(['docker', 'virtualbox', 'vmware', 'ssh'].map(async function (t) { try { checks[t] = await API.check(t, t === 'ssh' ? (D.hosts[0] || {}).id : ''); } catch (e) { checks[t] = { ok: false, detail: e.message }; } })); if (!$('#ov')) render(); }
  async function reload() { try { var s = await API.snapshot(); D = s; } catch (e) { toast(e.message); } }

  // ---------- Events ----------
  function wire() {
    var app = $('#app');
    API.on(function (ch, p) {
      if (ch === 'changed') { D = p; p.instances.forEach(function (i) { if (i.stats) { (stats[i.id] = stats[i.id] || []).push(i.stats.cpu); if (stats[i.id].length > 60) stats[i.id].shift(); } }); if (!$('.popover') && !$('#ov') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') soon(); else tabstrip(); }
      if (ch === 'log') { addActivity(p.id, p.line); if (progress[p.id]) { progress[p.id].log.push(p.line); if (progress[p.id].log.length > 2000) progress[p.id].log.shift(); } if (st.active === 'deploy' || st.active === 'activity') soon(); }
      if (ch === 'step') { var g = progress[p.id] = progress[p.id] || { log: [], done: false }; if (p.key === 'done') return; g.step = p.key; g.text = p.text; g.fraction = p.fraction || 0; soon(); }
      if (ch === 'busy') { addActivity(p.id, 'Working: ' + p.action, 'action'); }
      if (ch === 'done') {
        var name = instName(p.id);
        addActivity(p.id, p.action + (p.ok ? ' finished' : ' failed: ' + p.error), 'action');
        if (p.action === 'deploy') { var pr = progress[p.id] = progress[p.id] || { log: [] }; pr.done = true; pr.ok = p.ok; pr.error = p.error; if (p.ok) { beep('on'); toast(name + ': ' + msg('deployed'), { emoji: '🎉' }); reload().then(function () { var i = D.instances.filter(function (x) { return x.id === p.id; })[0]; if (st.openAfter && i && i.url) openUrl(i.url); render(); }); } else { beep('bad'); toast(name + ': ' + msg('failedMsg') + ' ' + p.error); } }
        else if (p.action === 'backup') toast(name + ': ' + (p.ok ? msg('backedUp') : p.error));
        else if (p.action === 'remove') toast(p.ok ? name + ' removed.' : p.error);
        else if (!p.ok) toast(name + ': ' + p.error);
        reload().then(soon);
      }
      if (ch === 'downloads') { dls = p; if (st.active === 'downloads') soon(); }
      if (ch === 'window') { var b = $('[data-win="max"]'); if (b) b.innerHTML = icon(p.maximized ? 'WindowRestore' : 'WindowMaximize', 's'); }
    });
    app.addEventListener('click', function (e) {
      var t = e.target;
      var lockedEl = t.closest('.locked'); if (lockedEl && t.closest('button,input,select,a,label,summary') && !t.closest('[data-tab],[data-ext],[data-copy]')) { e.preventDefault(); e.stopPropagation(); toast(msg('locked')); askUnlock(lockedEl.dataset.k); return; }
      var b;
      if ((b = t.closest('[data-win]'))) { API.win(b.dataset.win); return; }
      if ((b = t.closest('[data-closetab]'))) { e.stopPropagation(); closeTab(b.dataset.closetab); return; }
      if ((b = t.closest('[data-tab]'))) { st.active = b.dataset.tab; save(); render(); return; }
      if ((b = t.closest('[data-go]'))) { e.preventDefault(); go(b.dataset.go); return; }
      if ((b = t.closest('[data-ext]'))) { e.preventDefault(); openUrl(b.dataset.ext); return; }
      if ((b = t.closest('[data-regex]'))) { workbench(b.dataset.regex); return; }
      if ((b = t.closest('[data-copy]'))) { copy(b.dataset.copy); return; }
      if ((b = t.closest('[data-oneclick]'))) { oneClick(b.dataset.oneclick); return; }
      if ((b = t.closest('[data-options]'))) { optionsDialog(b.dataset.options); return; }
      if ((b = t.closest('[data-recheck]'))) { var tg = b.dataset.recheck; checks[tg] = null; render(); API.check(tg, tg === 'ssh' ? ($('#sshhost') || {}).value : '').then(function (r) { checks[tg] = r; render(); }); return; }
      if ((b = t.closest('[data-dismiss]'))) { delete progress[b.dataset.dismiss]; render(); return; }
      if ((b = t.closest('[data-retry]'))) { var ri = D.instances.filter(function (x) { return x.id === b.dataset.retry; })[0]; if (ri) { delete progress[ri.id]; API.action(ri.id, 'remove', true).then(function () { oneClick(ri.target, { name: ri.name, port: ri.port, tag: ri.tag, hostId: ri.hostId }); }); } return; }
      if ((b = t.closest('[data-a]'))) { doAction(b.dataset.id, b.dataset.a, b.dataset.a === 'backup' ? 'Manual' : undefined); return; }
      if ((b = t.closest('[data-imenu]'))) { var r = b.getBoundingClientRect(); instMenu(b.dataset.imenu, r.left - 200, r.bottom); return; }
      if ((b = t.closest('[data-restore]'))) { var pr2 = b.dataset.restore.split(':'), inst = D.instances.filter(function (x) { return x.id === pr2[0]; })[0], bk = inst && inst.backups.filter(function (x) { return x.id === pr2[1]; })[0]; if (!bk) return; superConfirm('Restore ' + inst.name, ['It goes back to ' + when(bk.at) + '.', inst.target === 'docker' || inst.target === 'ssh' ? 'The current config is kept beside it as config.before-restore.' : 'The machine is powered off and returned to the snapshot; changes since then are lost.', 'It restarts afterwards.'], 'RESTORE', function () { doAction(inst.id, 'restore', bk.id); }); return; }
      if ((b = t.closest('[data-delbackup]'))) { var pr3 = b.dataset.delbackup.split(':'); superConfirm('Delete this backup', ['The ' + (b.closest('tr').children[2].textContent.toLowerCase()) + ' is deleted from this computer.'], 'DELETE', function () { doAction(pr3[0], 'deleteBackup', pr3[1]); }); return; }
      if ((b = t.closest('[data-ft]'))) { view.filterTarget = b.dataset.ft; render(); return; }
      if ((b = t.closest('[data-fs]'))) { view.filterState = b.dataset.fs; render(); return; }
      if ((b = t.closest('[data-bulk]'))) { var ids = Object.keys(view.sel).filter(function (k) { return view.sel[k]; }); if (b.dataset.bulk === 'clear') view.sel = {}; else ids.forEach(function (id) { doAction(id, b.dataset.bulk, b.dataset.bulk === 'backup' ? 'Manual' : undefined); }); render(); return; }
      if ((b = t.closest('[data-sched]'))) { API.schedule({ on: !D.schedule.on }).then(reload).then(render); return; }
      if ((b = t.closest('[data-testhost]'))) { var hid = b.dataset.testhost; toast('Connecting…'); API.check('ssh', hid).then(function (r) { toast((r.ok ? '✓ ' : '') + r.detail + (r.fix ? ' ' + r.fix : '')); }); return; }
      if ((b = t.closest('[data-edithost]'))) { hostDialog(D.hosts.filter(function (h) { return h.id === b.dataset.edithost; })[0]); return; }
      if ((b = t.closest('[data-rmhost]'))) { var hh = D.hosts.filter(function (h) { return h.id === b.dataset.rmhost; })[0]; superConfirm('Remove ' + hh.name, ['The host is removed from this app with its saved password.', 'Nothing on the host changes.'], 'REMOVE', function () { API.removeHost(hh.id).then(reload).then(render).catch(function (er) { toast(er.message); }); }); return; }
      if ((b = t.closest('[data-toggle]'))) { setVal(b.dataset.toggle, !get(b.dataset.toggle), b.getAttribute('aria-label')); render(); return; }
      if ((b = t.closest('[data-set]'))) { var v = b.dataset.val; if (/^(funEn|funYue|textScale)$/.test(b.dataset.set)) v = +v; setVal(b.dataset.set, v, b.closest('[role=group]').getAttribute('aria-label')); if (b.dataset.set === 'edge' || b.dataset.set === 'lang') shell(); render(); return; }
      if ((b = t.closest('[data-reset]'))) { var pth = b.dataset.reset, dv = pth.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, DEF); setVal(pth, JSON.parse(JSON.stringify(dv)), 'Reset ' + pth); shell(); render(); return; }
      if ((b = t.closest('[data-info]'))) { var mo = $('#i-' + b.dataset.info); mo.hidden = !mo.hidden; b.setAttribute('aria-expanded', !mo.hidden); return; }
      if ((b = t.closest('[data-undo]'))) { undoEntry(+b.dataset.undo); toast(msg('saved')); return; }
      if ((b = t.closest('[data-rmlock]'))) { var k = b.dataset.rmlock; if (isLocked(k)) askUnlock(k, function () { removeLock(k); }); else removeLock(k); return; }
      if (!(b = t.closest('[data-act]'))) return;
      var a = b.dataset.act;
      if (a === 'palette') palette(); else if (a === 'theme') { setVal('theme', isDark() ? 'light' : 'dark', 'Theme'); render(); } else if (a === 'bell') notePanel(); else if (a === 'access') accessPanel(); else if (a === 'newtab') newTab();
      else if (a === 'pi') piDialog();
      else if (a === 'dlall') { API.downloadAll(); toast('Downloading everything that is missing or out of date.'); }
      else if (a === 'autodl') { API.autoDownload(!(D.autoDownload !== false)).then(reload).then(render); }
      else if (a === 'openfolder') API.openFolder('').catch(function (er) { toast(er.message); });
      else if (a === 'vocab-clear') { st.vocab = null; save(); apply(); shell(); render(); }
      else action(a);
    });
    app.addEventListener('input', function (e) {
      var t = e.target, map = { dsearch: 'downloads', isearch: 'instances', bsearch: 'backups', hsearch: 'hosts', asearch: 'activity', ssearch: 'settings', hpsearch: 'help' };
      if (map[t.id]) { q[map[t.id]] = t.value; render(); return; }
      if (t.dataset.isel) { view.sel[t.dataset.isel] = t.checked; render(); return; }
      if (t.dataset.color) { st.seed = t.value; save(); apply(); }
    });
    app.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.isort != null) { view.sort = t.value; render(); }
      if (t.dataset.logfor != null) { view.logFor = t.value; render(); }
      if (t.dataset.schedtime != null) API.schedule({ time: t.value }).then(reload);
      if (t.dataset.schedkeep != null) API.schedule({ keep: Math.max(1, Number(t.value) || 7) }).then(reload);
      if (t.dataset.schedcons != null) API.schedule({ consistent: t.checked }).then(reload);
      if (t.dataset.color) setVal('seed', t.value, 'Main colour');
      if (t.id === 'vocabfile' && t.files[0]) loadVocabFile(t.files[0]);
    });
    app.addEventListener('toggle', function (e) { var d = e.target; if (d.dataset && d.dataset.iopen) view.open[d.dataset.iopen] = d.open; }, true);
    app.addEventListener('keydown', function (e) {
      var tb = e.target.closest && e.target.closest('[data-tab]'); if (tb && /Arrow(Left|Right|Up|Down)/.test(e.key)) { var tabs = $$('[data-tab]'); var i = tabs.indexOf(tb) + (/Right|Down/.test(e.key) ? 1 : -1); st.active = tabs[(i + tabs.length) % tabs.length].dataset.tab; save(); render(); $('#t-' + st.active).focus(); e.preventDefault(); }
      if (tb && e.key === 'Delete') closeTab(tb.dataset.tab);
    });
    var dragged = null;
    app.addEventListener('dragstart', function (e) { var tb = e.target.closest && e.target.closest('[data-tab]'); if (tb) dragged = tb.dataset.tab; });
    app.addEventListener('dragover', function (e) { if (dragged && e.target.closest && e.target.closest('[data-tab]')) e.preventDefault(); });
    app.addEventListener('drop', function (e) { var tb = e.target.closest && e.target.closest('[data-tab]'); if (!dragged || !tb) return; e.preventDefault(); var o = st.tabs.open; o.splice(o.indexOf(dragged), 1); o.splice(o.indexOf(tb.dataset.tab), 0, dragged); dragged = null; save(); render(); });
    document.addEventListener('contextmenu', function (e) { if (e.target.closest('.popover,.dialog,input,textarea')) return; var card = e.target.closest('.icard'); if (card && !e.shiftKey) { e.preventDefault(); instMenu(card.id.slice(5), e.clientX, e.clientY); return; } var el = e.target.closest('[data-k]'); if (!el) return; e.preventDefault(); menuFor(el, e.clientX, e.clientY); });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); palette(); return; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); oneClick(st.defaultTarget); return; }
      if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { var el = document.activeElement && document.activeElement.closest('[data-k]'); if (el) { e.preventDefault(); var r = el.getBoundingClientRect(); var card = el.closest('.icard'); if (card) instMenu(card.id.slice(5), r.left + 12, r.top + 12); else menuFor(el, r.left + 12, r.top + 12); } }
      if (e.key === 'Escape') { if ($('.popover')) closePop(); else if ($('#ov')) closeDialog(); else if ($('.panel')) $('.panel').remove(); }
    });
    document.addEventListener('pointerdown', function (e) { if (!e.target.closest('.popover')) closePop(); });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#ov [data-act="dlg-close"]')) closeDialog();
      if (e.target.closest('#ov [data-act="pal-size"]')) { st.paletteFull = !st.paletteFull; save(); palette(); }
      var tg = e.target.closest('#ov [data-toggle], #ov [data-set], .panel [data-toggle], .panel [data-set]');
      if (tg) { if (tg.dataset.toggle) setVal(tg.dataset.toggle, !get(tg.dataset.toggle), tg.getAttribute('aria-label')); else { var v = tg.dataset.val; if (tg.dataset.set === 'textScale') v = +v; setVal(tg.dataset.set, v, tg.closest('[role=group]').getAttribute('aria-label')); if (tg.dataset.set === 'edge' || tg.dataset.set === 'lang') shell(); } render(); if (tg.closest('#ov')) $$('[data-set="' + tg.dataset.set + '"]', $('#ov')).forEach(function (s) { var on = s.dataset.val === String(get(tg.dataset.set)); s.classList.toggle('sel', on); s.setAttribute('aria-pressed', on); }); }
      var g = e.target.closest('.panel [data-go]'); if (g) { $('.panel').remove(); go(g.dataset.go); }
    });
    var dz = null;
    document.addEventListener('dragover', function (e) { if (dragged) return; if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); if (!dz) { dz = document.createElement('div'); dz.className = 'dropzone'; dz.textContent = 'Drop your wording file to use it'; $('#app').appendChild(dz); } } });
    document.addEventListener('dragleave', function (e) { if (dz && !e.relatedTarget) { dz.remove(); dz = null; } });
    document.addEventListener('drop', function (e) { if (dragged) return; if (dz) { dz.remove(); dz = null; } var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); loadVocabFile(f); } });
    if (mq.addEventListener) mq.addEventListener('change', apply);
  }
  function closeTab(t) {
    if (st.tabs.pinned.indexOf(t) >= 0) return;
    var before = st.tabs.open.slice(); st.tabs.open = st.tabs.open.filter(function (x) { return x !== t; }); if (st.active === t) st.active = st.tabs.open[Math.max(0, before.indexOf(t) - 1)] || 'deploy';
    save(); render(); toast(w(t) + ' closed. New tab reopens it.', { undo: function () { st.tabs.open = before; save(); render(); } });
  }
  function newTab() {
    var closed = TABS.filter(function (t) { return st.tabs.open.indexOf(t) < 0; });
    dialog(w('newtab'), findField('ntq', 'Search pages', '') + '<div id="ntl" class="cmd-list"></div><div class="row"><span class="grow"></span><button class="btn tonal" data-act="openall">' + L('openall') + '</button></div>', { focus: '#ntq' });
    var entries = TABS.map(function (t) { return { label: w(t), go: t + ':top', closed: closed.indexOf(t) >= 0 }; }).concat([['Backups, schedule', 'backups:schedule'], ['Settings, language', 'settings:language'], ['Settings, appearance', 'settings:appearance'], ['Settings, locks', 'settings:locks'], ['Activity, changes to settings', 'activity:history']].map(function (x) { return { label: x[0], go: x[1] }; }));
    function draw() { var m = matcher($('#ntq').value); $('#ntl').innerHTML = entries.filter(function (x) { return m.test(x.label); }).map(function (x) { return '<button class="cmd-row" data-ntgo="' + x.go + '"><span class="ll grow" style="text-align:left">' + esc(x.label) + '</span>' + (x.closed ? '<span class="tag a">Closed</span>' : '') + '</button>'; }).join('') || '<p class="bm mu">' + L('noMatch') + '</p>'; }
    $('#ntq').addEventListener('input', draw); $('#ntl').addEventListener('click', function (e) { var b = e.target.closest('[data-ntgo]'); if (b) { closeDialog(); go(b.dataset.ntgo); } });
    $('#ov').addEventListener('click', function (e) { if (e.target.closest('[data-act="openall"]')) { closeDialog(); action('openall'); } });
    draw();
  }
  function loadVocabFile(file) {
    if (file.size > VL.bytes) { toast('That file is larger than 256 KiB. Nothing changed.'); return; }
    var fr = new FileReader();
    fr.onload = function () { var r = parseVocab(String(fr.result)); if (!r.ok) { toast(r.error + ' Nothing changed.'); beep('bad'); return; } st.vocab = r.entries; st.history.unshift({ t: Date.now(), path: 'vocab', label: 'Your wording file (' + r.count + ' entries)', before: null, after: '(your file)' }); save(); apply(); shell(); render(); var c = document.createElement('div'); c.className = 'celebrate'; c.setAttribute('role', 'status'); c.innerHTML = '<div class="hl">' + esc(msg('vocab')) + '</div><p class="bm">' + r.count + ' words in use.</p>'; $('#app').appendChild(c); setTimeout(function () { c.remove(); }, 3000); beep('on'); };
    fr.readAsText(file);
  }

  // ---------- Start ----------
  (async function () {
    try { about = await API.about(); } catch (e) { about = {}; }
    try { dls = await API.downloads(); } catch (e) { dls = []; }
    await reload(); apply(); shell(); render(); wire();
    checkAll();
    if (!st.welcomed) setTimeout(function () { welcome(false); }, 300);
    setInterval(function () { if (st.active === 'instances' && !$('#ov') && !$('.popover')) soon(); }, 5000);
  })();
})();
