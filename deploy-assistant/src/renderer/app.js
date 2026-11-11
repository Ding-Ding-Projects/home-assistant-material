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
  var TABS = ['deploy', 'instances', 'backups', 'downloads', 'hosts', 'activity', 'extensions', 'tools', 'convert', 'base64', 'draw', 'minecraft', 'models', 'disks', 'support', 'changes', 'run', 'features', 'articles', 'status', 'design', 'settings', 'help'];
  var DEF = {
    lang: 'en', funEn: 5, funYue: 5, emoji: true, vocab: null, school: false, dimsum: true, tickets: [], otp: [], lowStim: false, spotlight: false,
    theme: 'system', seed: '#00639B', density: 'comfortable', textScale: 1, reduceMotion: false, contrast: false, focusRing: true, bigTargets: false,
    sounds: true, volume: 40, voice: '', schedule: { on: false, from: '20:00', to: '07:00' }, name: 'Deploy Assistant', logo: { shape: 'rounded', color: '' },
    tabs: { open: TABS.slice(), pinned: [], offered: TABS.slice() }, active: 'deploy', edge: 'top', paletteFull: false, openAfter: true, defaultTarget: 'docker',
    look: {}, locks: {}, folds: {}, wizTarget: '', axHidden: false, adhd: { focus: false, time: false, one: false, momentum: false }, nextStep: '', doneToday: null, narrator: { on: false, lang: 'en', voiceEn: '', voiceYue: '', rate: 1, pitch: 1 }, rules: [], history: [], notes: [], welcomed: false, welcomeStep: 0, view: 'cards'
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
  // Scheduled rules change settings only in memory: what is saved is always your own base value.
  function save() { try { var b = window.HAM_BASE ? window.HAM_BASE() : {}; var out = Object.assign({}, st); Object.keys(b).forEach(function (k) { out[k] = b[k]; }); localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* storage may be off */ } }
  var unlocked = {};
  try { unlocked = JSON.parse(sessionStorage.getItem(KEY + '-open') || '{}'); } catch (e) { unlocked = {}; }

  // ---------- Words ----------
  var W = {
    deploy: ['Deploy', '部署'], instances: ['Instances', '實例'], backups: ['Backups', '備份'], hosts: ['SSH hosts', 'SSH 主機'], activity: ['Activity', '活動'], settings: ['Settings', '設定'], help: ['Help', '說明'], extensions: ['Extensions', '擴充'], tools: ['Tools', '工具'], support: ['Support', '支援'], changes: ['Changes', '更新紀錄'], run: ['Run it', '點樣行'], convert: ['Convert', '轉換'], base64: ['Base64', 'Base64'], draw: ['Draw', '畫畫'], minecraft: ['Minecraft', 'Minecraft'], models: ['AI models', 'AI 模型'], disks: ['Virtual disks', '虛擬磁碟'], setup: ['Setup', '安裝'], features: ['Features', '功能'], articles: ['Articles', '文章'], status: ['Status', '狀態'], design: ['Design', '設計'], modes: ['Modes', '模式'], sound: ['Sound and voice', '聲音同讀音'], schedule: ['Schedule', '時間表'], identity: ['Name and logo', '名同標誌'], updatesSet: ['Updates', '更新'], adhd: ['ADHD modes', 'ADHD 模式'],
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

  var CHANGES = [{"version":"1.5","commit":"","items":["A small terminal shows every running job as it happens: deploys, Raspberry Pi cards, Minecraft consoles, the world generator and Chocolatey. Coloured lines, it follows new output unless you scroll up, and you can filter it, copy it, unwrap long lines or fill the window with it.","The Minecraft overview is a dashboard: who is playing (with message and kick), ticks per second, processor and memory, world size, backups, a live load chart, quick actions, the last console lines with a command line, and the address as a QR code.","Every tab has a header with an icon and its key facts."]},{"version":"1.4","commit":"915595cc9b3a2b10f6bb78c533e150568c029f31","items":["Minecraft servers: create Vanilla, Paper, Purpur, Fabric, Quilt, Forge, NeoForge or Bedrock servers from the official catalogues (every Mojang version, with channel filters), on Java or Docker, here or on an SSH host. Start, stop, restart, a live console with history, every server setting with its own control, game rules, operators, allowlist and bans, plugins and mods from Modrinth checked by SHA-512, backups and restore, version changes with a backup first, a daily schedule, and a world generator with a chunk grid you draw on, writing to a folder or a ZIP.","AI models: install Ollama from its official release (checked by SHA-256) or with Chocolatey, start and stop it, the full ollama.com library with every variant, a careful fit verdict for this computer, a pull list with progress and cancel, model details, copy, unload, delete, and a local chat.","Virtual disks (Windows): VHD, VHDX, VHD Set and ISO. A library with formats, sizes, partitions and attach state; create (with partitioning and formatting), attach and detach (also at every sign-in), grow and shrink, compact in every mode, convert, merge, child disks, online and read-only, and VHD Set checkpoints. Every operation shows its PowerShell and DiskPart script first and runs through one administrator prompt.","Chocolatey: anything missing (Docker Desktop, VirtualBox, VMware, Java, Git, Python, Node.js, Ollama, VS Code) installs in one click, and Chocolatey itself is installed first when needed. build.bat does the same for building.","Convert, Base64 and Draw tabs, QR codes, ZIP exports, a shared School mode with a PIN, the unlock ladder, Windows Snap layouts, and a fuller extension manager."]},{"version":"1.3","commit":"847f8541063a05e978830f9cde8aa8ba79a73625","items":["ADHD modes, each off by default: Focus, Low stimulation, Time awareness, One thing at a time and Momentum.","A narrator for what happens, off by default, in English, Cantonese or both, with a voice picker per language, speed and pitch.","Schedule rules: change the theme, language, density, motion or colour by days, times and dates, or while a Home Assistant switch is on; your own settings come back afterwards.","The dim sum surprise shows a photo from the public dim sum catalog, 1 time in 10 at start; its switch stays on. Each release has a dim sum code name.","Deleting now takes two keys and a slider, with an emergency exit.","The accessibility button gains read-aloud pause and stop, keyboard help, reset and a way to hide it.","Your own logo from a picture, export in eleven text formats with Open in VS Code, bulk actions on backups and hosts, a history of your records with restore, a clear button in every text box, a live processor chart, and changelog links to each commit.","FEATURES.md lists every feature the interface contract asks for and where the app stands."]},{"version":"1.2","commit":"1c3cc844825a106bbaa37f4497692e839b39309b","items":["New tabs that work offline: Run it, Features, Articles, Status, and Design, which shows every board of this app's design full size.","Tools, Authenticator: scan a one-time code's QR code from an image, a pasted screenshot or the camera.","Settings, Updates: an update self-test walks the releases, the feed, the package and its checksums, the installer, and whether an update was seen applied after a restart, and lets you copy the result.","After an update is applied, the app says so on its next start and keeps a record.","Only the camera and clipboard writing are allowed to the window; every other permission is refused."]},{"version":"1.1","commit":"6271ef36ece5a1e10c6745f57e9f33a129547ea7","items":["The Deploy tab is a two-pane app: pick where it runs on the left, see and change everything it will do on the right, and deploy with one button or Ctrl Enter.","New tabs: Extensions, Tools, Support and Changes.","Extensions: add small helpers in their own folder. Each one says what it may see, asks before it starts and again when that changes, runs in its own process, and never receives passwords or keys. Health report and Link sheet come built in.","Updates: on Windows the app updates itself in the background and asks you to restart. The update is not code-signed, and the banner says so. On macOS and Linux it tells you a new version is out.","Settings: school mode, a reading voice, a dark theme on a schedule, your own name and logo, and the dim sum surprise (names only).","The version and build time show on the first screen and in About.","Open an instance's Compose file in VS Code, or its folder, from its menu.","The filters and totals on Instances fold away."]},{"version":"1.0","commit":"6271ef36ece5a1e10c6745f57e9f33a129547ea7","items":["One-click deploys to Docker on this computer, an SSH host, VirtualBox and VMware, with a free port and name chosen for you and the link at the end.","Raspberry Pi card writer for the Pi 3, 4 and 5, with a read-back check.","Instance manager with start, stop, restart, update, logs, live processor use and backups on a schedule.","Every image downloaded and checked automatically, here and on your SSH hosts."]}];
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
  // Super confirmation: names the action and what is lost, then needs two separate keys before the
  // slider unlocks; only a slider pushed all the way acts. Emergency exit and Escape always cancel,
  // and focus goes back to the control that asked.
  function sw2b() { return '<button class="sw' + (st.axHidden ? '' : ' on') + '" role="switch" aria-checked="' + !st.axHidden + '" aria-label="Show accessibility button" data-axshow><i></i></button>'; }
  function superConfirm(what, items, word, done) {
    var origin = document.activeElement, keys = { a: false, b: false };
    dialog(what, '<div class="sc-warn" role="note"><b>' + esc(what) + '</b></div><ul class="bm" style="margin:0;padding-left:20px">' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '<li>This cannot be undone.</li></ul>' +
      '<div class="sc-keys"><button class="sc-key" id="sc1" aria-pressed="false">' + icon('Lock', 's') + '<span>Key 1: I know what is lost</span></button>' +
      '<label class="sc-key" id="sc2k"><span>Key 2: type <b class="mono">' + esc(word) + '</b></span><input class="input" id="sc2in" aria-label="Key 2: type ' + esc(word) + '" autocomplete="off" spellcheck="false"></label></div>' +
      '<label class="col" style="gap:4px"><span class="ll" id="sclab">Slide all the way to confirm</span><input type="range" id="scslide" min="0" max="100" value="0" disabled aria-labelledby="sclab" aria-describedby="scstate"></label><span class="bs mu" id="scstate" aria-live="polite">Both keys are needed before the slider moves.</span>' +
      '<div class="row" style="gap:8px"><button class="btn tonal" id="scexit">' + icon('Close', 's') + 'Emergency exit</button><span class="grow"></span><button class="btn err" id="sc2" disabled>' + esc(what) + '</button></div>', { emoji: '⚠️' });
    var slide = $('#scslide'), go2 = $('#sc2'), stt = $('#scstate');
    var sync = function () {
      $('#sc1').setAttribute('aria-pressed', keys.a); $('#sc1').classList.toggle('on', keys.a); $('#sc2k').classList.toggle('on', keys.b);
      var both = keys.a && keys.b; slide.disabled = !both; if (!both) slide.value = 0;
      go2.disabled = !(both && +slide.value === 100);
      stt.textContent = !both ? (keys.a || keys.b ? 'One key turned. Turn the other one.' : 'Both keys are needed before the slider moves.') : +slide.value === 100 ? 'Armed. Press the red button, or Enter on the slider.' : 'Keys turned. Slide all the way: ' + slide.value + '%.';
    };
    var finish = function () { if (go2.disabled) return; closeDialog(); done(); if (origin && document.body.contains(origin)) origin.focus(); };
    var cancel = function () { closeDialog(); if (origin && document.body.contains(origin)) origin.focus(); };
    $('#sc1').addEventListener('click', function () { keys.a = !keys.a; sync(); });
    $('#sc2in').addEventListener('input', function () { keys.b = this.value === word; sync(); });
    slide.addEventListener('input', sync); slide.addEventListener('keydown', function (e) { if (e.key === 'Enter') finish(); });
    go2.addEventListener('click', finish); $('#scexit').addEventListener('click', cancel);
    sync();
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

  // The unlock ladder: during a lockout wait, a game ends the wait (and only the wait: the lock stays
  // locked and the PIN is still needed). Dim sum first, then ten sums after five wrong dishes, then
  // whack-a-mole after one wrong sum, then the clock. School mode starts at the sums.
  var LDISH = [['Har gow', 'Shrimp in a thin, see-through wrapper, pleated by hand'], ['Siu mai', 'Open-topped pork and shrimp dumplings'], ['Char siu bao', 'Soft steamed buns with sweet barbecued pork'], ['Cheung fun', 'Rice noodle rolls with soy sauce'], ['Lo mai gai', 'Sticky rice steamed in a lotus leaf'], ['Dan tat', 'Egg tarts with wobbly custard'], ['Lo bak go', 'Pan-fried turnip cake'], ['Fung zao', 'Braised chicken feet in black bean sauce']];
  function ladderStart() { return st.school ? 'sums' : 'dimsum'; }
  window.HAM_LADDER = function (k, back) { ladder(k, back || function () {}); };
  function ladder(k, back) {
    var lk = st.locks[k]; if (!lk) return; if (!lk.ladder) { lk.ladder = ladderStart(); lk.wrongDish = 0; save(); }
    var won = function () { lk.until = Date.now(); lk.ladder = ''; save(); toast('The wait is over. The lock still needs its PIN.'); beep('on'); closeDialog(); back(); };
    var fall = function (to, why) { lk.ladder = to; save(); toast(why); closeDialog(); if (to === 'clock') back(); else ladder(k, back); };
    var left = function () { return Math.max(0, Math.ceil((lk.until - Date.now()) / 1000)); };
    if (lk.ladder === 'dimsum') {
      var pick = LDISH.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 4), right = pick[Math.floor(Math.random() * 4)];
      dialog('Which dish is this?', '<p class="bl">' + esc(right[1]) + '.</p><div class="col" style="gap:8px" role="group" aria-label="Choices">' + pick.map(function (d, i) { return '<button class="btn tonal" data-ld="' + i + '">' + esc(d[0]) + '</button>'; }).join('') + '</div><p class="bs mu" role="status">Right ends the ' + left() + '-second wait. ' + (5 - lk.wrongDish) + ' wrong answers left before the sums.</p>', { emoji: '🥟' });
      $('#ov').addEventListener('click', function (e) { var b = e.target.closest('[data-ld]'); if (!b) return; if (pick[+b.dataset.ld] === right) won(); else { lk.wrongDish++; save(); if (lk.wrongDish >= 5) fall('sums', 'Five wrong dishes. On to ten easy sums: every one must be right.'); else { closeDialog(); ladder(k, back); toast('Not that one. ' + (5 - lk.wrongDish) + ' left.'); } } });
      return;
    }
    if (lk.ladder === 'sums') {
      var qs = Array.from({ length: 10 }, function () { var a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20), plus = Math.random() < 0.5 || a < b; return { q: a + (plus ? ' + ' : ' − ') + b, a: plus ? a + b : a - b }; }), n = 0;
      var ask = function () { $('#lsq').textContent = 'Sum ' + (n + 1) + ' of 10: ' + qs[n].q + ' ='; $('#lsa').value = ''; $('#lsa').focus(); };
      dialog('Ten easy sums', '<p class="bm mu">All ten right ends the ' + left() + '-second wait. One wrong goes to whack-a-mole.</p><label class="col" style="gap:6px"><span class="tl" id="lsq" aria-live="polite"></span><input class="input" id="lsa" inputmode="numeric" aria-labelledby="lsq" autocomplete="off"></label><div class="row"><span class="grow"></span><button class="btn fill" id="lsgo">Answer</button></div>', { emoji: '➕' });
      var go2 = function () { var v = $('#lsa').value.trim(); if (!/^-?\d+$/.test(v)) { toast('Type a whole number.'); return; } if (+v !== qs[n].a) { fall('moles', qs[n].q + ' = ' + qs[n].a + '. On to whack-a-mole.'); return; } n++; if (n === 10) won(); else ask(); };
      $('#lsgo').onclick = go2; $('#lsa').addEventListener('keydown', function (e) { if (e.key === 'Enter') go2(); }); ask(); return;
    }
    if (lk.ladder === 'moles') {
      var hits = 0, need = 8, end = Date.now() + 20000, mole = -1, last = {}, timer;
      dialog('Whack-a-mole', '<p class="bm mu">Hit ' + need + ' moles in 20 seconds. Click, tap, or press 1 to 9 for the holes, top left to bottom right.</p><div class="moles" id="moles" role="grid" aria-label="Holes">' + Array.from({ length: 9 }, function (_, i) { return '<button class="mole" data-mole="' + i + '" aria-label="Hole ' + (i + 1) + '"></button>'; }).join('') + '</div><p class="bm" id="molest" role="status" aria-live="polite">Score 0 of ' + need + '. 20 seconds left.</p>', { emoji: '🔨' });
      var draw = function () { $$('.mole').forEach(function (b, i) { b.classList.toggle('up', i === mole); b.setAttribute('aria-label', 'Hole ' + (i + 1) + (i === mole ? ', a mole is up' : '')); b.textContent = i === mole ? '🐹' : ''; }); };
      var tick = function () { if (!$('#moles')) { clearInterval(timer); return; } var s2 = Math.ceil((end - Date.now()) / 1000); if (s2 <= 0) { clearInterval(timer); if (hits >= need) won(); else fall('clock', 'Round lost with ' + hits + ' of ' + need + '. The games are done for this wait; the clock carries on.'); return; } var nx; do { nx = Math.floor(Math.random() * 9); } while (nx === mole); mole = nx; draw(); $('#molest').textContent = 'Score ' + hits + ' of ' + need + '. ' + s2 + ' seconds left.'; };
      var whack = function (i) { if (Date.now() > end) return; if (i === mole && !last[mole]) { hits++; last = {}; last[mole] = 1; mole = -1; draw(); beep('on'); $('#molest').textContent = 'Score ' + hits + ' of ' + need + '.'; if (hits >= need) { clearInterval(timer); won(); } } };
      $('#moles').addEventListener('click', function (e) { var b = e.target.closest('[data-mole]'); if (b) whack(+b.dataset.mole); });
      $('#ov').addEventListener('keydown', function (e) { if (/^[1-9]$/.test(e.key)) whack(+e.key - 1); });
      timer = setInterval(tick, st.reduceMotion ? 1400 : 900); tick(); return;
    }
    back();
  }
  function askUnlock(k, after) {
    var lk = st.locks[k]; if (!lk) return; var entered = '';
    var order = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    dialog('Unlock ' + lk.label, '<div class="dots" id="pdots" role="img" aria-label="Digits entered"></div><div class="keypad" id="kp">' + order.map(function (d) { return '<button data-d="' + d + '" aria-label="' + d + '">' + d + '</button>'; }).join('') + '<button class="f" data-d="C">Clear</button><button data-d="0" aria-label="0">0</button><button class="f" data-d="B" aria-label="Backspace">' + icon('Backspace') + '</button></div>' +
      '<label class="col" style="gap:4px"><span class="bs mu">Or type it</span><input class="input mono" id="pintype" inputmode="numeric" type="password" aria-label="PIN" maxlength="12"></label><div class="bm" id="pinmsg" role="status"></div>' +
      '<div class="row" style="gap:8px"><button class="btn text sm" id="shuf">' + icon('Shuffle', 's') + 'Shuffle the keys</button><span class="grow"></span><button class="btn out" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="pinsub">Submit</button></div>', { focus: '#pintype', emoji: '🔑' });
    function dots() { $('#pdots').innerHTML = Array.from({ length: Math.max(4, entered.length) }).map(function (_, i) { return '<span class="' + (i < entered.length ? 'on' : '') + '"></span>'; }).join(''); }
    function wait() {
      var left = Math.ceil((lk.until - Date.now()) / 1000); var sub = $('#pinsub'); if (!sub) return;
      var lb = $('#ladbtn');
      if (left > 0) { sub.disabled = true; $('#pinmsg').textContent = 'Too many tries. Wait ' + left + ' seconds' + (lk.ladder === 'clock' ? ', or play no more: the games are used up for this wait.' : ', or play your way out.'); if (!lb && lk.ladder !== 'clock') { $('#pinmsg').insertAdjacentHTML('afterend', '<button class="btn tonal sm" id="ladbtn">' + icon('GamepadVariant', 's') + 'Play your way out</button>'); $('#ladbtn').onclick = function () { closeDialog(); ladder(k, function () { askUnlock(k, after); }); }; } setTimeout(wait, 500); }
      else { sub.disabled = false; if (lb) lb.remove(); if (/Wait/.test($('#pinmsg').textContent)) $('#pinmsg').textContent = ''; }
    }
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
      var talking = 'speechSynthesis' in window && speechSynthesis.speaking, paused = talking && speechSynthesis.paused;
      p.innerHTML = '<div class="row" style="gap:8px"><h2 class="tl grow">' + L('access') + '</h2><button class="ib" data-ax aria-label="' + esc(w('close')) + '">' + icon('Close', 's') + '</button></div>' +
        [['textScale', 'Text size'], ['contrast', 'More contrast'], ['reduceMotion', 'Reduce motion'], ['focusRing', 'Visible focus'], ['bigTargets', 'Larger targets'], ['spotlight', 'Focus spotlight']].map(function (s) { return '<div class="setting"><span class="ll">' + s[1] + '</span><div class="ctl">' + (s[0] === 'textScale' ? seg('textScale', [['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%']], 'Text size') : sw(s[0], s[1])) + '</div></div>'; }).join('') +
        '<div class="setting"><span class="ll">Read aloud</span><div class="ctl"><button class="btn tonal sm" data-axread>' + icon('AccountVoice', 's') + 'Read this page</button>' + (talking ? '<button class="btn text sm" data-axpause>' + (paused ? 'Resume' : 'Pause') + '</button><button class="btn text sm" data-axstop>Stop</button>' : '') + '</div></div>' +
        '<details class="fold"><summary class="ll">' + icon('Keyboard', 's') + 'Keyboard help</summary><ul class="bs" style="margin:6px 0 0;padding-left:18px"><li>Tab and Shift Tab move between controls; Enter or Space acts.</li><li>Arrow keys move between tabs; Delete closes one.</li><li>Ctrl Shift F searches everything; Escape closes what is open.</li><li>Shift F10 or the Menu key opens the menu of the focused element.</li></ul></details>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn text sm" data-axreset>' + icon('Restore', 's') + 'Reset these</button><button class="btn text sm" data-go="settings:accessibility">All accessibility settings</button></div>' +
        '<hr style="border:0;border-top:1px solid var(--outv);margin:4px 0"><button class="btn text sm" data-axhide>Hide accessibility button…</button>';
    }
    draw(); $('#app').appendChild(p);
    p.addEventListener('click', function (e) {
      if (e.target.closest('[data-ax]')) { p.remove(); return; }
      if (e.target.closest('[data-axread]')) speak($('#p-' + st.active).innerText);
      if (e.target.closest('[data-axpause]')) { if (speechSynthesis.paused) speechSynthesis.resume(); else speechSynthesis.pause(); }
      if (e.target.closest('[data-axstop]')) speechSynthesis.cancel();
      if (e.target.closest('[data-axreset]')) { ['textScale', 'contrast', 'reduceMotion', 'focusRing', 'bigTargets', 'spotlight'].forEach(function (k) { st[k] = DEF[k]; }); save(); apply(); }
      if (e.target.closest('[data-axhide]')) { dialog('Hide the accessibility button?', '<p class="bm">The button leaves the top bar. Everything you set stays applied. Settings, Accessibility, Show accessibility button brings it back at any time.</p><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="axhideok">Hide it</button></div>'); $('#axhideok').onclick = function () { setVal('axHidden', true, 'Accessibility button hidden'); closeDialog(); p.remove(); shell(); render(); }; return; }
      setTimeout(draw, 0);
    });
    $('[data-ax]', p).focus();
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
  // The Deploy tab is a two-pane wizard: places on the left, the plan for the chosen place on the right.
  var wiz = { vals: {}, defs: {}, loading: {} };
  var PLACES = ['docker', 'ssh', 'virtualbox', 'vmware', 'pi'];
  function wizTarget() { return PLACES.indexOf(st.wizTarget) >= 0 ? st.wizTarget : st.defaultTarget || 'docker'; }
  function wizLoad(t) {
    if (t === 'pi' || wiz.defs[t] || wiz.loading[t]) return;
    wiz.loading[t] = true;
    API.defaults(t, t === 'ssh' ? (D.hosts[0] || {}).id : '').then(function (d) { wiz.defs[t] = d; wiz.vals[t] = Object.assign({ backupsOn: true, hostId: (D.hosts[0] || {}).id || '' }, d); wiz.loading[t] = false; if (st.active === 'deploy') soon(); }, function (e) { wiz.loading[t] = false; toast(e.message); });
  }
  function provenance() { var b = about.builtAt ? when(about.builtAt) : 'a development run'; return '<span class="prov" data-k="provenance" title="The version you are running and when it was built">' + icon('TagOutline', 's') + 'v' + esc(about.version || '?') + (about.codeName && !st.school ? ' · ' + esc(about.codeName) : '') + ' · built ' + esc(b) + '</span>'; }
  function wizField(t, key, label, type, hint, extra) {
    var v = (wiz.vals[t] || {})[key]; return '<label><span class="ll">' + label + '</span><input class="input' + (type === 'mono' ? ' mono' : '') + '" id="wz-' + t + '-' + key + '" data-wiz="' + key + '" type="' + (type === 'number' ? 'number' : 'text') + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>' + (hint ? '<span class="bs mu">' + hint + '</span>' : '') + '</label>';
  }
  R.deploy = function () {
    var t = wizTarget(); wizLoad(t);
    var latest = Object.keys(progress).map(function (id) { return { id: id, p: progress[id], inst: D.instances.filter(function (x) { return x.id === id; })[0] }; }).filter(function (x) { return x.inst && x.inst.target === t; }).pop();
    var c = checks[t], ready = t === 'pi' || (c && c.ok);
    var stage = latest && latest.p.done && latest.p.ok ? 4 : latest && !latest.p.done ? 3 : ready ? 3 : 2;
    var names = ['Choose where', 'Check', 'Deploy', 'Open'];
    var stepper = '<ol class="stepper" aria-label="Steps" data-k="stepper">' + names.map(function (n, i) { var k = i + 1, cls = k < stage || (k === 4 && stage === 4) ? 'ok' : k === stage ? 'cur' : ''; return '<li class="' + cls + '"' + (k === stage ? ' aria-current="step"' : '') + '><span class="sq ' + (cls === 'ok' ? 'ok' : cls === 'cur' ? 'now' : 'todo') + '">' + (cls === 'ok' ? icon('Check', 's') : k) + '</span><span class="ll ell">' + n + '</span></li>'; }).join('') + '</ol>';
    var list = '<div class="tlist" role="listbox" aria-label="Where it runs" data-k="places">' + PLACES.map(function (p) {
      var cc = checks[p], dot = p === 'pi' ? 'g' : !cc ? '' : cc.ok ? 'g' : 'a', sub = p === 'pi' ? 'SD card or USB drive' : !cc ? 'Checking…' : cc.ok ? 'Ready' : 'Needs setup';
      var n = D.instances.filter(function (i) { return i.target === p; }).length;
      return '<button class="trow" role="option" aria-selected="' + (p === t) + '" data-pick="' + p + '" id="place-' + p + '"><span class="sq">' + icon(TICON[p]) + '</span><span class="col grow" style="min-width:0"><span class="ll ell">' + L(p) + '</span><span class="bs mu ell"><i class="dot ' + dot + '"></i>' + esc(sub) + (n ? ' · ' + n : '') + '</span></span></button>';
    }).join('') + '</div>';
    var panel;
    if (t === 'pi') {
      panel = '<p class="bm mu">' + esc(TDESC.pi) + '</p><div class="plan"><label><span class="ll">Model</span><select class="select" id="pimodel" aria-label="Raspberry Pi model">' + PIM.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="flow" aria-label="What happens">' + STEPS.pi.map(function (k, i) { return '<span class="tag">' + (i + 1) + ' · ' + esc(STEPNAME[k]) + '</span>'; }).join('') + '</div>' +
        '<div class="wfoot"><button class="btn fill lg" data-act="pi" id="wizgo">' + icon('Harddisk', 's') + 'Choose the card and write</button><span class="bs mu">Asks which drive, then asks you to type ERASE before anything is written.</span></div>';
    } else {
      var vm = t === 'virtualbox' || t === 'vmware', v = wiz.vals[t];
      var note = c && !c.ok ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">' + esc(c.detail) + ' ' + esc(c.fix || '') + (c.link ? ' <a href="' + esc(c.link) + '" data-ext="' + esc(c.link) + '">How to install</a>' : '') + (CHOCO_FOR[t] ? ' ' + chocoButton(CHOCO_FOR[t]) : '') + '</span></div>' : '';
      var host = t === 'ssh' ? (D.hosts.length ? '<label><span class="ll">Host</span><select class="select" data-wiz="hostId" aria-label="SSH host">' + D.hosts.map(function (h) { return '<option value="' + h.id + '"' + (v && v.hostId === h.id ? ' selected' : '') + '>' + esc(h.name) + '</option>'; }).join('') + '</select><span class="bs mu"><a href="#" data-act="addhost">Add another host</a></span></label>' : '<div class="note"><span>' + icon('ServerNetwork') + '</span><span class="bm">No SSH host yet. <a href="#" data-act="addhost">Add one</a>; Deploy asks for it too.</span></div>') : '';
      var plan = !v ? '<p class="bm mu" role="status"><span class="spin" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:8px"></span>Working out a free name and port…</p>' :
        '<div class="plan" data-k="plan-' + t + '">' + wizField(t, 'name', 'Name', 'text', '', ' maxlength="60"') + (t === 'vmware' ? '' : wizField(t, 'port', 'Port', 'number', t === 'ssh' ? 'On the host' : 'Free right now', ' min="1" max="65535"')) + host +
        (vm ? wizField(t, 'cpus', 'Processors', 'number', '', ' min="1" max="32"') + wizField(t, 'memoryMb', 'Memory, MB', 'number', '', ' min="1024" step="512"') : wizField(t, 'tag', 'Image', 'mono', 'latest, or a release')) + '</div>' +
        '<details class="fold" data-k="more-' + t + '"><summary class="ll">' + icon('ChevronDown', 's') + 'More options</summary><div class="plan" style="padding-top:8px">' +
        (vm ? (t === 'virtualbox' ? wizField(t, 'diskGb', 'Disk, GB (0 keeps the image size)', 'number', '', ' min="0"') : '') : wizField(t, 'timezone', 'Time zone') + wizField(t, 'memoryLimit', 'Memory limit', 'text', 'For example 2g; empty is no limit')) +
        '<label class="row bm" style="gap:10px;flex-direction:row;align-items:center"><input type="checkbox" data-wiz="backupsOn"' + (v.backupsOn !== false ? ' checked' : '') + '> Daily backups</label></div></details>';
      panel = '<p class="bm mu">' + esc(TDESC[t]) + '</p>' + note + plan +
        '<div class="flow" aria-label="What happens">' + STEPS[t].map(function (k, i) { return '<span class="tag">' + (i + 1) + ' · ' + esc(STEPNAME[k]) + '</span>'; }).join('') + '</div>' +
        '<div class="wfoot"><button class="btn fill lg" id="wizgo" data-act="wizgo"' + (v ? '' : ' disabled') + '>' + icon('RocketLaunch', 's') + L('deploy') + '</button><span class="kbd">Ctrl Enter</span><span class="grow"></span><button class="btn text sm" data-act="wizreset">' + icon('Restore', 's') + 'Fresh defaults</button></div>';
    }
    var head = '<div class="row" style="gap:12px"><span class="sq big">' + icon(TICON[t]) + '</span><div class="col grow" style="gap:4px;min-width:0"><h2 class="tl">' + L(t) + '</h2>' + (t === 'pi' ? '<span class="tag g">' + icon('Check', 's') + ' Ready</span>' : !c ? '<span class="tag">Checking…</span>' : c.ok ? '<span class="tag g">' + icon('Check', 's') + ' ' + esc(c.detail) + '</span>' : '<span class="tag a">' + icon('Alert', 's') + ' Needs setup</span>') + '</div>' + (t === 'pi' ? '' : '<button class="ib" data-recheck="' + t + '" aria-label="Check ' + esc(w(t)) + ' again">' + icon('Refresh', 's') + '</button>') + '</div>';
    var running = Object.keys(progress).filter(function (id) { return D.instances.some(function (i) { return i.id === id; }) || !progress[id].done; });
    var recent = D.instances.slice().sort(function (a2, b2) { return String(b2.created).localeCompare(a2.created); }).slice(0, 5);
    return '<div class="wizbar" id="top"><h1 class="hs grow" data-k="deploy-title">New instance</h1>' + provenance() + (DEMO ? '<span class="tag a">Demo: nothing is deployed</span>' : '') + '</div>' + stepper +
      '<div class="wizgrid">' + list + '<section class="wpanel" aria-labelledby="wiztitle" data-k="wizpanel" id="target-' + t + '">' + head.replace('<h2 class="tl">', '<h2 class="tl" id="wiztitle">') + panel + '</section></div>' +
      (running.length ? '<section class="section"><h2 class="tm">Deploying</h2>' + running.map(progressCard).join('') + '</section>' : '') +
      (recent.length ? '<section class="section" data-k="recent"><div class="row"><h2 class="tm grow">Recent</h2><button class="btn text sm" data-go="instances:top">Every instance (' + D.instances.length + ')</button></div><div class="recent">' + recent.map(function (i) { return '<div class="row-item"><span class="sq">' + icon(TICON[i.target] || 'Docker') + '</span><span class="col grow" style="min-width:0"><span class="ll ell">' + esc(i.name) + '</span><span class="bs mu mono ell">' + esc(i.url || '') + '</span></span>' + stateTag(i.state) + (i.url ? '<button class="btn text sm" data-ext="' + esc(i.url) + '">' + icon('OpenInNew', 's') + L('open') + '</button>' : '') + '</div>'; }).join('') + '</div></section>' : '') + foot();
  };
  function wizGo() {
    var t = wizTarget(); if (t === 'pi') { piDialog(); return; }
    var v = wiz.vals[t]; if (!v) return;
    var port = Number(v.port);
    if (t !== 'vmware' && (!Number.isInteger(port) || port < 1 || port > 65535)) { toast('The port must be a whole number from 1 to 65535.'); var pf = $('[data-wiz="port"]'); if (pf) pf.focus(); return; }
    if (!String(v.name || '').trim()) { toast('Give the instance a name.'); return; }
    var o = { name: String(v.name).trim(), port: port || 0, tag: v.tag, timezone: v.timezone, memoryLimit: v.memoryLimit, cpus: Number(v.cpus) || '', memoryMb: Number(v.memoryMb) || '', diskGb: Number(v.diskGb) || '', backupsOn: v.backupsOn !== false, hostId: v.hostId };
    delete wiz.defs[t]; delete wiz.vals[t];
    oneClick(t, o);
  }

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
    return '<article class="pcard" data-k="progress-' + id + '"><div class="row" style="gap:10px"><span class="sq">' + icon(TICON[inst.target] || 'Docker') + '</span><h3 class="tm grow">' + esc(inst.name) + ' · ' + L(inst.target) + '</h3>' + (adhd('time') && p.t0 ? '<span class="tag">' + icon('TimerSand', 's') + Math.max(1, Math.round(((p.t1 || Date.now()) - p.t0) / 1000)) + ' s</span>' : '') + (p.done ? '' : '<span class="tag p">' + L('deploying') + '</span>') + '</div><ol class="col steps" style="gap:10px;margin:0;padding:0;list-style:none">' + rows + '</ol>' + done +
      (p.done && p.ok ? '<details><summary class="ll" style="cursor:pointer;min-height:40px">Terminal (' + p.log.length + ' lines)</summary>' : '') + termHtml('deploy-' + id, 'ham@' + (inst.target === 'ssh' && inst.host ? inst.host.address : 'this-computer') + ' — ' + inst.name, p.log, { running: !p.done, prompt: 'ham ›' }) + (p.done && p.ok ? '</details>' : '') + '</article>';
  }
  function instMatches(i, m) { return m.test([i.name, i.target, w(i.target), i.url, i.state, i.tag, i.notes].join(' ')); }
  R.instances = function () {
    var m = matcher(q.instances);
    var list = D.instances.filter(function (i) { return (view.filterTarget === 'all' || i.target === view.filterTarget) && (view.filterState === 'all' || i.state === view.filterState) && instMatches(i, m); });
    list.sort(function (a, b) { return view.sort === 'newest' ? String(b.created).localeCompare(a.created) : view.sort === 'state' ? String(a.state).localeCompare(b.state) : a.name.localeCompare(b.name); });
    var chip = function (k, v, label, cur) { return '<button class="chip' + (cur === v ? ' sel' : '') + '" aria-pressed="' + (cur === v) + '" data-' + k + '="' + v + '">' + label + '</button>'; };
    var counts = {}; D.instances.forEach(function (i) { counts[i.state] = (counts[i.state] || 0) + 1; });
    var nsel = Object.keys(view.sel).filter(function (k) { return view.sel[k]; }).length;
    return '<div class="section">' + pageHead('Server', w('instances'), '', null) + '<div class="row" style="gap:12px;flex-wrap:wrap"><span class="grow"></span><button class="btn fill" data-go="deploy:top">' + icon('Plus', 's') + 'New instance</button></div>' +
      fold('stats', 'Totals') + '<div class="stats">' + [['All', D.instances.length], [w('running'), counts.running || 0], [w('stopped'), counts.stopped || 0], [w('failed'), counts.failed || 0], ['Backups', D.instances.reduce(function (n, i) { return n + (i.backups || []).length; }, 0)]].map(function (s) { return '<div class="stat"><span class="hs">' + s[1] + '</span><span class="bs mu">' + esc(s[0]) + '</span></div>'; }).join('') + '</div></details>' +
      '<div class="toolbar">' + findField('isearch', 'Search instances', q.instances) + '<select class="select" data-isort aria-label="Sort">' + [['name', 'By name'], ['newest', 'Newest first'], ['state', 'By state']].map(function (o) { return '<option value="' + o[0] + '"' + (view.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="grow"></span><button class="btn text sm" data-act="refresh">' + icon('Refresh', 's') + 'Refresh</button><button class="btn text sm" data-act="export-instances">' + icon('Export', 's') + L('export') + '</button></div>' +
      fold('live', 'Live chart') + liveChart() + '</details>' + fold('filters', 'Filters') + '<div class="chipline" role="group" aria-label="Target">' + chip('ft', 'all', 'Every target', view.filterTarget) + ['docker', 'ssh', 'virtualbox', 'vmware'].map(function (t) { return chip('ft', t, L(t), view.filterTarget); }).join('') + '</div>' +
      '<div class="chipline" role="group" aria-label="State">' + chip('fs', 'all', 'Any state', view.filterState) + ['running', 'stopped', 'deploying', 'failed', 'unreachable'].map(function (s) { return chip('fs', s, L(s), view.filterState); }).join('') + '</div></details>' +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      (nsel ? '<div class="selbar" role="region" aria-label="Selected instances"><span class="ll grow">' + nsel + ' selected</span><button class="btn tonal sm" data-bulk="start">' + L('start') + '</button><button class="btn tonal sm" data-bulk="stop">' + L('stop') + '</button><button class="btn tonal sm" data-bulk="backup">' + L('backupNow') + '</button><button class="btn text sm" data-bulk="clear">' + L('clear') + '</button></div>' : '') +
      (D.instances.length ? (list.length ? '<div class="igrid">' + list.map(instCard).join('') + '</div>' : '<p class="bm mu">' + L('noMatch') + '</p>') :
        '<div class="empty"><span class="sq big">' + icon('RocketLaunch') + '</span><h2 class="tl">No instances yet</h2><p class="bm mu">Deploy one in one click. Each gets its own name, port and backups.</p><button class="btn fill" data-go="deploy:top">' + L('deploy') + '</button></div>') + '</div>' + foot();
  };
  function fold(key, label) { var on = (st.folds || {})[key] !== false; return '<details class="fold" data-fold="' + key + '"' + (on ? ' open' : '') + '><summary class="ll">' + icon(on ? 'ChevronDown' : 'ChevronRight', 's') + esc(label) + '</summary>'; }
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
  var bsel = {}, nsel = {};
  function notesList() {
    var n = Object.keys(nsel).filter(function (k) { return nsel[k]; }).length;
    return (n ? '<div class="selbar" role="region" aria-label="Selected notifications"><span class="ll grow">' + n + ' selected</span><button class="btn tonal sm" data-act="notesel-rm">' + icon('DeleteOutline', 's') + 'Remove</button><button class="btn text sm" data-act="notesel-export">' + icon('Export', 's') + L('export') + '</button></div>' : '') +
      (st.notes.length ? '<div class="row" style="gap:8px"><button class="btn text sm" data-act="notesel-all">Select all ' + st.notes.length + '</button></div><div class="col" style="gap:2px;max-height:260px;overflow:auto">' + st.notes.slice(0, 200).map(function (x, i) { return '<label class="row-item"><input type="checkbox" data-nsel="' + i + '"' + (nsel[i] ? ' checked' : '') + ' aria-label="Select: ' + esc(x.text) + '"><span class="col grow"><span class="bm">' + esc(x.text) + '</span><span class="bs mu">' + esc(when(new Date(x.t).toISOString())) + '</span></span></label>'; }).join('') + '</div>' : '<p class="bm mu">No notifications.</p>');
  }
  R.backups = function () {
    var m = matcher(q.backups); var rows = [];
    D.instances.forEach(function (i) { (i.backups || []).forEach(function (b) { if (m.test(i.name + ' ' + (b.note || '') + ' ' + b.at)) rows.push([i, b]); }); });
    rows.sort(function (a, b) { return String(b[1].at).localeCompare(a[1].at); });
    var s = D.schedule;
    return '<div class="section">' + pageHead('BackupRestore', w('backups'), '', null) + '<p class="bl mu">Docker and SSH instances are backed up as an archive of their config folder on this computer; virtual machines as snapshots. Restoring keeps the current config beside it, so nothing is lost.</p>' +
      '<section class="card col" id="schedule" data-k="schedule" style="padding:20px;gap:12px"><h2 class="tm">Every day, on a schedule</h2><div class="row" style="gap:12px;flex-wrap:wrap"><button class="sw' + (s.on ? ' on' : '') + '" role="switch" aria-checked="' + !!s.on + '" aria-label="Daily backups" data-sched="on"><i></i></button><span class="bm">Back up every instance at</span><input class="input" type="time" value="' + esc(s.time) + '" data-schedtime aria-label="Time of day"><span class="bm">and keep the newest</span><input class="input" type="number" min="1" max="365" value="' + s.keep + '" data-schedkeep aria-label="How many scheduled backups to keep" style="width:90px"></div>' +
      '<label class="row bm" style="gap:10px"><input type="checkbox" data-schedcons' + (s.consistent ? ' checked' : '') + '> Stop the container for a moment while backing up, so the database is consistent</label><p class="bs mu">Instances whose own backups are turned off are skipped. The app must be open at the time.</p></section>' +
      (function () { var n = Object.keys(bsel).filter(function (k) { return bsel[k]; }).length; return n ? '<div class="selbar" role="region" aria-label="Selected backups"><span class="ll grow">' + n + ' selected</span><button class="btn tonal sm" data-act="bkdel">' + icon('DeleteOutline', 's') + 'Delete</button><button class="btn text sm" data-act="bkclear">' + L('clear') + '</button></div>' : ''; })() +
      '<div class="toolbar">' + findField('bsearch', 'Search backups', q.backups) + '<button class="btn text sm" data-act="export-backups">' + icon('Export', 's') + L('export') + '</button><span class="grow"></span><button class="btn tonal sm" data-act="backup-all">' + icon('BackupRestore', 's') + 'Back up every instance now</button></div>' +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      (rows.length ? '<div class="scrollbox"><table class="t"><thead><tr><th><input type="checkbox" data-bkall aria-label="Select every backup shown"' + (rows.length && rows.every(function (r) { return bsel[r[0].id + ':' + r[1].id]; }) ? ' checked' : '') + '></th><th>Instance</th><th>Made</th><th>Kind</th><th>Size</th><th></th></tr></thead><tbody>' + rows.map(function (r) { var key = r[0].id + ':' + r[1].id; return '<tr data-k="bk-' + r[1].id + '"><td><input type="checkbox" data-bksel="' + key + '" aria-label="Select the backup of ' + esc(r[0].name) + ' from ' + esc(when(r[1].at)) + '"' + (bsel[key] ? ' checked' : '') + '></td><td class="ll">' + esc(r[0].name) + '</td><td class="bs">' + esc(when(r[1].at)) + (r[1].note ? ' · ' + esc(r[1].note) : '') + '</td><td class="bs">' + (r[1].kind === 'snapshot' ? 'Snapshot' : 'Archive') + '</td><td class="bs">' + (r[1].size ? fmtSize(r[1].size) : '') + '</td><td><button class="btn text sm" data-restore="' + r[0].id + ':' + r[1].id + '">' + L('restore') + '</button><button class="btn text sm" data-delbackup="' + r[0].id + ':' + r[1].id + '">' + L('remove') + '</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="bm mu">No backups yet. Use Back up now on an instance, or turn on the schedule.</p>') + '</div>' + foot();
  };
  R.downloads = function () {
    var m = matcher(q.downloads); var list = dls.filter(function (d) { return m.test(d.label + ' ' + (d.release || '') + ' ' + d.state); });
    var tone = { ready: 'g', downloading: 'p', checking: 'p', failed: 'err', none: 'a', skipped: 'a', waiting: '' };
    var word = { ready: 'Ready', downloading: 'Downloading', checking: 'Checking', failed: 'Failed', none: 'Not released yet', skipped: 'Skipped', waiting: 'Waiting' };
    return '<div class="section">' + pageHead('Download', w('downloads'), '', null) + '<div class="row" style="gap:12px;flex-wrap:wrap"><span class="grow"></span><button class="btn fill" data-act="dlall">' + icon('CloudDownload', 's') + 'Download everything now</button></div>' +
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
  var hsel = {};
  R.hosts = function () {
    var m = matcher(q.hosts); var list = D.hosts.filter(function (h) { return m.test(h.name + ' ' + h.address + ' ' + h.user); });
    return '<div class="section">' + pageHead('ServerNetwork', w('hosts'), '', null) + '<div class="row" style="gap:12px;flex-wrap:wrap"><span class="grow"></span><button class="btn fill" data-act="addhost">' + icon('Plus', 's') + 'Add a host</button></div><p class="bl mu">Linux computers with Docker that you reach over SSH. Passwords are encrypted with your system\'s keychain; a key file or the SSH agent is better.</p>' +
      '<div class="toolbar">' + findField('hsearch', 'Search hosts', q.hosts) + '<button class="btn text sm" data-act="export-hosts">' + icon('Export', 's') + L('export') + '</button></div>' + (function () { var n = Object.keys(hsel).filter(function (k) { return hsel[k]; }).length; return n ? '<div class="selbar" role="region" aria-label="Selected hosts"><span class="ll grow">' + n + ' selected</span><button class="btn tonal sm" data-act="hstest">Test each</button><button class="btn tonal sm" data-act="hsdel">' + icon('DeleteOutline', 's') + 'Remove</button><button class="btn text sm" data-act="hsclear">' + L('clear') + '</button></div>' : ''; })() + (list.length ? list.map(function (h) { var n = D.instances.filter(function (i) { return i.hostId === h.id; }).length; return '<div class="row-item" data-k="host-' + h.id + '"><input type="checkbox" data-hsel="' + h.id + '" aria-label="Select ' + esc(h.name) + '"' + (hsel[h.id] ? ' checked' : '') + '><span class="sq">' + icon('ServerNetwork') + '</span><span class="col grow"><span class="ll">' + esc(h.name) + '</span><span class="bs mu mono">' + esc(h.user) + '@' + esc(h.address) + ':' + h.port + ' · ' + (h.keyFile ? 'key ' + esc(h.keyFile) : h.password ? 'password saved' : 'SSH agent') + ' · ' + n + ' instances</span></span><button class="btn text sm" data-testhost="' + h.id + '">Test</button><button class="btn text sm" data-edithost="' + h.id + '">Edit</button><button class="btn text sm" data-rmhost="' + h.id + '">' + L('remove') + '</button></div>'; }).join('') : '<p class="bm mu">No hosts yet.</p>') + '</div>' + foot();
  };
  R.activity = function () {
    var m = matcher(q.activity);
    var list = activity.filter(function (a) { return (view.logFor === 'all' || a.id === view.logFor) && m.test(a.line); }).slice(-400);
    return '<div class="section">' + pageHead('TimelineText', w('activity'), '', null) + '<p class="bl mu">Everything the app did, as it happened, and the changes you made to its settings.</p><div class="toolbar">' + findField('asearch', 'Search activity', q.activity) +
      '<select class="select" data-logfor aria-label="Instance"><option value="all">Every instance</option>' + D.instances.map(function (i) { return '<option value="' + i.id + '"' + (view.logFor === i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</select><span class="grow"></span><button class="btn text sm" data-act="export-activity">' + icon('Export', 's') + L('export') + '</button></div>' +
      (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      '<pre class="logbox tall" tabindex="0" aria-label="Activity log">' + (list.length ? list.map(function (a) { return esc(new Date(a.t).toLocaleTimeString() + '  ' + instName(a.id) + '  ' + a.line); }).join('\n') : 'Nothing yet.') + '</pre>' +
      '<h2 class="tl" id="history">Changes to settings</h2>' + (st.history.length ? st.history.slice(0, 50).map(function (h, i) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(h.label) + '</span><span class="bs mu">' + esc(new Date(h.t).toLocaleString()) + '</span></span><button class="btn text sm" data-undo="' + i + '">' + L('undo') + '</button></div>'; }).join('') : '<p class="bm mu">' + esc(msg('emptyHistory')) + '</p>') + '</div>' + '<h2 class="tl" id="notifications">Notifications</h2>' + notesList() + '<h2 class="tl" id="records">History of your records</h2><p class="bm mu">Every change to instance names and notes, SSH hosts (never their passwords) and the backup schedule. Restoring adds a new revision, so it can be undone too.</p><div id="rhist" class="col" style="gap:6px"></div>' + foot();
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
      ['modes', 'modes', [srow('school', schoolInfo.name || 'School mode', 'Plain wording, playfulness 1, no sounds, and nothing about dim sum. Shared with every Ding Ding Projects app on this computer: switching it here switches it in each of them.' + (schoolInfo.locked ? ' A PIN is needed to switch it off.' : '') + (schoolInfo.by && schoolInfo.at ? ' Last changed by ' + schoolInfo.by + ', ' + when(schoolInfo.at) + '.' : ''), 'Off', 'Every app on this computer', '<button class="sw' + (st.school ? ' on' : '') + '" role="switch" aria-checked="' + !!st.school + '" aria-label="' + esc(schoolInfo.name || 'School mode') + '" data-school><i></i></button><button class="btn text sm" data-act="schoolset">Name and PIN</button>', 'school'),
        st.school ? '' : srow('dimsum', 'Dim sum surprise', 'At start, now and then, a dim sum dish with its photo from the public dim sum catalog, named in English and Cantonese. It is part of the app: the switch stays on.', 'On', 'A card at the bottom of the window', '<button class="sw on" role="switch" aria-checked="true" aria-label="Dim sum surprise" data-dimtroll><i></i></button><button class="btn text sm" data-act="dimsum">Show me one now</button>', '')]],
      ['adhd', 'adhd', [srow('adhdnote', 'About these modes', 'Interface accommodations for attention, each off until you turn it on. They are not a diagnosis or a treatment, and nothing here assesses you.', 'All off', 'This window', '', '')].concat(ADHD.map(function (a) { return srow('adhd-' + a[0], a[1], a[2], 'Off', 'This window', sw('adhd.' + a[0], a[1]), 'adhd.' + a[0]); })).concat([srow('adhd-low', 'Low stimulation', 'Softer colour, no animation, no sounds, no narrator.', 'Off', 'The window', sw('lowStim', 'Low stimulation'), 'lowStim')])],
      ['sound', 'sound', [srow('sounds', 'Action sounds', 'A short sound when something finishes.', 'On', 'Deploys, backups, settings', sw('sounds', 'Action sounds'), 'sounds'),
        srow('voice', 'Reading voice', 'The voice for Read aloud on any element.', 'The system default', 'Read aloud', '<select class="select" data-select="voice" aria-label="Reading voice"><option value="">System default</option>' + (('speechSynthesis' in window) ? speechSynthesis.getVoices() : []).map(function (v) { return '<option' + (v.name === st.voice ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select><button class="btn text sm" data-act="voice-test">Try it</button>', 'voice'),
        srow('narrator', 'Narrator', 'Speaks what happens: a deploy finishing or failing, a backup made, an update ready. One line at a time, at most one per kind every 20 seconds; failures are always spoken.', 'Off', 'Spoken events', sw('narrator.on', 'Narrator'), 'narrator.on'),
        srow('nlang', 'Narrator language', 'English, Cantonese, or both, one after the other.', 'English', 'Spoken events', seg('narrator.lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], 'Narrator language'), 'narrator.lang'),
        srow('nvoiceEn', 'English voice', voiceStatus('en'), 'Choose automatically', 'Spoken English', voicePicker('en'), 'narrator.voiceEn'),
        srow('nvoiceYue', 'Cantonese voice', voiceStatus('yue'), 'Choose automatically', 'Spoken Cantonese', voicePicker('yue'), 'narrator.voiceYue'),
        srow('nrate', 'Speed and pitch', 'Speed from 0.5 to 2, pitch from 0 to 2; 1 is the voice\'s own.', '1 and 1', 'Spoken events', '<label class="row bs" style="gap:6px">Speed <input type="range" min="0.5" max="2" step="0.1" value="' + (st.narrator.rate || 1) + '" data-nrange="rate" aria-label="Narrator speed"></label><label class="row bs" style="gap:6px">Pitch <input type="range" min="0" max="2" step="0.1" value="' + (st.narrator.pitch == null ? 1 : st.narrator.pitch) + '" data-nrange="pitch" aria-label="Narrator pitch"></label><button class="btn text sm" data-act="ntest">Try it</button>', 'narrator.rate')]],
      ['schedule', 'schedule', ['<div class="col" style="gap:8px" data-search="schedule rules time day home assistant switch" id="s-rules">' + rulesList() + '<div><button class="btn text sm" data-act="haconn">' + icon('HomeAutomation', 's') + 'Home Assistant connection</button></div></div>', srow('sched', 'Dark theme on a schedule', 'Uses the dark theme between two times each day.', 'Off, 20:00 to 07:00', 'The theme', sw('schedule.on', 'Dark theme on a schedule') + '<input class="input" type="time" value="' + st.schedule.from + '" data-time="schedule.from" aria-label="From"><input class="input" type="time" value="' + st.schedule.to + '" data-time="schedule.to" aria-label="To">', 'schedule')]],
      ['identity', 'identity', [srow('name', 'Name', 'What the window calls this app, at the top and in the title.', 'Deploy Assistant', 'The top bar and the title', '<input class="input" value="' + esc(st.name) + '" data-text="name" aria-label="Name" maxlength="60">', 'name'),
        srow('logo', 'Logo', 'A preset mark, or your own picture made into one, plus its shape.', 'Rocket, rounded', 'The top bar', '<button class="btn tonal sm" data-act="logo">' + logoMark() + 'Change the logo</button>' + seg('logo.shape', [['rounded', 'Rounded'], ['circle', 'Circle'], ['square', 'Square'], ['leaf', 'Leaf']], 'Logo shape'), 'logo')]],
      ['setup', 'setup', ['<div class="col" style="gap:8px" id="s-setup" data-search="setup chocolatey install docker virtualbox vmware java git python node ollama">' + chocoSection() + '</div>']],
      ['updatesSet', 'updates', [srow('upd', 'Updates', DEMO ? 'The app checks the project\'s releases every four hours.' : (upd.state === 'ready' ? 'Version ' + upd.version + ' is ready; restart to use it.' : upd.state === 'downloading' ? 'Downloading version ' + upd.version + '…' : upd.state === 'available' ? 'Version ' + upd.version + ' is out.' : upd.state === 'offline' ? 'Could not reach the releases: ' + (upd.error || '') : 'You have the newest version.') + ' Updates are not code-signed.', 'Checks every four hours', 'This app', '<button class="btn tonal sm" data-act="checkupd">' + icon('Refresh', 's') + 'Check now</button>', ''),
        srow('selftest', 'Update self-test', 'Downloads the newest update package, checks its size and checksums against the feed, lets the installer stage it on Windows, and shows whether an update was seen applied after a restart.', '', 'Nothing changes unless a newer version is staged', '<button class="btn tonal sm" data-act="selftest">' + icon('PlayCircle', 's') + 'Run the self-test</button>', ''),
        srow('free', 'Free to use', 'This app costs nothing, shows no adverts, and never asks for payment, donations or reviews.', '', 'This app', '', ''),
        srow('about', 'About this build', (about.codeName && !st.school ? 'Code name ' + about.codeName + '. ' : '') + 'Version ' + (about.version || '?') + ', built ' + (about.builtAt ? when(about.builtAt) : 'in a development run') + (about.electron ? ', Electron ' + about.electron : '') + '.', '', 'Shown on the Deploy tab too', provenance(), '')]],
      ['appearance', 'appearance', [srow('theme', 'Theme', 'Light, dark, or follow the system.', 'System', 'The window', seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], 'Theme'), 'theme'),
        srow('seed', 'Main colour', 'The colour of buttons and selections.', '#00639B', 'The window', '<input type="color" value="' + st.seed + '" data-color="seed" aria-label="Main colour" style="width:48px;height:40px;border:0;background:none">', 'seed'),
        srow('density', 'Density', 'How much room rows take.', 'Comfortable', 'Lists', seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Density'), 'density'),
        srow('textScale', 'Text size', 'Larger text, nothing cut off.', '100%', 'The window', seg('textScale', [['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%']], 'Text size'), 'textScale'),
        srow('reduceMotion', 'Reduce motion', 'Stops animations; your system setting is followed too.', 'Off', 'The window', sw('reduceMotion', 'Reduce motion'), 'reduceMotion'),
        srow('contrast', 'More contrast', 'Darker secondary text and lines.', 'Off', 'The window', sw('contrast', 'More contrast'), 'contrast'),
        srow('lowStim', 'Low stimulation', 'Softer colour, no animation, no sounds.', 'Off', 'The window', sw('lowStim', 'Low stimulation'), 'lowStim'),
        srow('spotlight', 'Focus spotlight', 'Dims everything but the part with the keyboard focus.', 'Off', 'The window', sw('spotlight', 'Focus spotlight'), 'spotlight'),
        srow('axshow', 'Show accessibility button', 'The button at the top for text size, contrast, motion, focus, read aloud and keyboard help. Hiding it keeps what you set.', 'On', 'The top bar', sw2b(), 'axHidden')]],
      ['tabsSet', 'tabs', [srow('edge', 'Where the tabs sit', 'Any edge of the window.', 'Top', 'The tab strip', seg('edge', [['top', 'Top'], ['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom']], 'Tab strip edge'), 'edge'),
        srow('openall', 'Open every tab', 'Reopens tabs you closed.', '', 'The tab strip', '<button class="btn tonal sm" data-act="openall">' + L('openall') + '</button>', '')]],
      ['locks', 'locks', [Object.keys(st.locks).length ? Object.keys(st.locks).map(function (k) { var o = st.locks[k]; return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(o.label) + '</span><span class="bs mu">' + (unlocked[k] ? 'Unlocked until the window closes' : 'Locked') + '</span></span><button class="btn text sm" data-rmlock="' + esc(k) + '">Remove</button></div>'; }).join('') : '<p class="bm mu">Nothing is locked. Right-click any card, for example an instance, and choose Lock this element, so it cannot be stopped or removed by accident.</p>', '<p class="bs mu">A lock is a speed bump for fun, not security.</p>']],
      ['resetAll', 'reset', [srow('welcome', 'Welcome again', 'The first-run setup: language, the check of every target, and your default.', '', 'This window', '<button class="btn tonal sm" data-act="welcome">Open it</button>', ''),
        srow('expset', 'Export your settings', 'This window\'s choices as JSON.', '', 'A file you save', '<button class="btn text sm" data-act="export-settings">JSON</button>', ''),
        srow('resetall', 'Reset everything in this window', 'Settings, locks and history of this window go back to the start. Instances and backups are not touched.', '', 'This window only', '<button class="btn err sm" data-act="resetall">' + L('resetAll') + '</button>', '')]]
    ];
    var out = groups.map(function (g) { var rows = g[2].filter(function (r) { var mm = r.match(/data-search="([^"]*)"/); return !q.settings || !mm || m.test(mm[1]); }); if (q.settings && !rows.length) return ''; return '<section class="section" id="' + g[1] + '"><h2 class="tl">' + (W[g[0]] ? L(g[0]) : 'Deploying') + '</h2>' + rows.join('') + '</section>'; }).join('');
    return '<div class="section">' + pageHead('Cog', w('settings'), '', null) + '' + findField('ssearch', 'Search settings', q.settings) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  var HELP = [
    ['extensions', 'Writing an extension', 'An extension is a folder in the extensions folder (Extensions tab, Open the extensions folder) with manifest.json and a script. The manifest has manifestVersion 1, an id of lower-case letters and dashes, name, version, description, main (the script, inside the folder), permissions (instances:read, backups:read, notify) and commands (each with id and title). When you run a command, the script gets one JSON line on standard input, {"command", "app", and only what its permissions allow}, and answers one JSON line on standard output: {"title", "text", "notify"}. It runs with Node, in its own process, for at most 15 seconds and 256 KB of answer. Passwords, keys and files are never sent. Copy health-report or link-sheet from the folder as a start.'],
    ['updates', 'Updates', 'Every four hours the app looks at the project\'s releases. On Windows it downloads a newer version in the background and shows a banner to restart; the update is not code-signed and the banner says so. On macOS and Linux it tells you a new version is out, with a Download button. Settings, Updates checks now.'],
    ['oneclick', 'One click', 'On the Deploy tab, choose where on the left; the right side already holds a free name and port, the latest image, two processors and 4 GB for a virtual machine, and daily backups. Change any of it, or open More options, then press Deploy or Ctrl Enter. In short, the defaults are: the next free name and port, the latest image, two processors and 4 GB for a virtual machine, and daily backups on. Options lets you change any of them first. Ctrl Shift D deploys to your default target.'],
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
    return '<div class="section">' + pageHead('HelpCircleOutline', w('help'), '', null) + '<p class="bl mu">Every article works offline.</p>' + findField('hpsearch', 'Search help', q.help) + (list.length ? list.map(function (h) { return '<article class="card col" id="h-' + h[0] + '" data-k="help-' + h[0] + '" style="padding:20px;gap:8px"><h2 class="tm">' + esc(h[1]) + '</h2><p class="bm">' + esc(h[2]) + '</p></article>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };

  // ---------- Extensions, tools, support, changes ----------
  var exts = [], extRuns = [], schoolInfo = { name: 'School mode', locked: false };
  R.extensions = function () {
    var m = matcher(q.extensions); var list = exts.filter(function (x) { return m.test([x.name, x.description, x.id].join(' ')); });
    return '<div class="section">' + pageHead('PuzzleOutline', w('extensions'), '', null) + '<div class="row" style="gap:12px;flex-wrap:wrap"><span class="grow"></span><button class="btn fill" data-act="extadd">' + icon('Plus', 's') + 'Add from a folder</button><button class="btn tonal" data-act="extfolder">' + icon('FolderOpen', 's') + 'Open the extensions folder</button><button class="btn text" data-go="help:h-extensions">' + icon('BookOpenVariant', 's') + 'How to write one</button></div>' +
      '<div class="setting" data-k="extmaster"><span class="col grow"><span class="ll">Extensions</span><span class="bs mu">Switching this off stops every extension at once; what each one was allowed stays recorded.</span></span><button class="sw' + (exts.length && exts[0].master === false ? '' : ' on') + '" role="switch" aria-checked="' + !(exts.length && exts[0].master === false) + '" aria-label="Every extension" data-extmaster><i></i></button></div>' + '<p class="bl mu">Small helpers that add commands to this app. Each says what it may see, asks before it runs and again when that changes, runs in its own process for at most 15 seconds, and never gets passwords or keys.</p>' + findField('xsearch', 'Search extensions', q.extensions) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' +
      '<div class="igrid">' + (list.length ? list.map(function (x) {
        if (x.error) return '<article class="extcard" data-k="ext-' + esc(x.id) + '"><h2 class="tm">' + esc(x.name) + '</h2><div class="note" style="background:var(--errc);color:var(--on-errc)"><span>' + icon('AlertCircle') + '</span><span class="bm">This extension cannot be loaded: ' + esc(x.error) + '</span></div></article>';
        return '<article class="extcard" id="ext-' + esc(x.id) + '" data-k="ext-' + esc(x.id) + '"><div class="row" style="gap:12px"><span class="sq">' + icon('PuzzleOutline') + '</span><span class="col grow"><h2 class="tm">' + esc(x.name) + '</h2><span class="bs mu">' + esc(x.id) + ' · version ' + esc(x.version) + '</span></span>' + sw2('ext:' + x.id, x.enabled, 'Turn on ' + x.name) + '</div><p class="bm">' + esc(x.description) + '</p>' +
          (x.needsConsent ? '<div class="note"><span>' + icon('ShieldAlertOutline') + '</span><span class="bm">It now asks for more. Turn it on again to agree.</span></div>' : '') +
          '<div class="col" style="gap:4px"><span class="ll">It may</span>' + (x.permissionText.length ? x.permissionText.map(function (pt) { return '<span class="bs mu row" style="gap:6px;align-items:flex-start">' + icon('Check', 's') + '<span>' + esc(pt) + '</span></span>'; }).join('') : '<span class="bs mu">Nothing beyond running.</span>') + '</div>' +
          '<div class="row" style="gap:8px;flex-wrap:wrap">' + (/^(health-report|link-sheet)$/.test(x.id) ? '' : '<button class="btn text sm" data-extrm="' + esc(x.id) + '">' + icon('DeleteOutline', 's') + 'Remove</button>') + x.commands.map(function (c) { return '<button class="btn tonal sm" data-extrun="' + esc(x.id) + ':' + esc(c.id) + '"' + (x.enabled ? '' : ' disabled') + '>' + icon('Play', 's') + esc(c.title) + '</button>'; }).join('') + '</div></article>';
      }).join('') : '<div class="empty"><p class="bm mu">' + (exts.length ? L('noMatch') : 'No extensions yet.') + '</p></div>') + '</div>' +
      '<section class="section" id="extruns" data-k="extruns"><h2 class="tl">Recent runs</h2>' + (extRuns.length ? extRuns.map(function (r) { return '<div class="row-item"><span class="tag ' + (r.ok ? 'g' : 'a') + '">' + (r.ok ? 'Answered' : 'Failed') + '</span><span class="col grow"><span class="ll">' + esc(r.name) + ', ' + esc(r.command) + '</span><span class="bs mu">' + esc(when(r.at)) + (r.text ? ' · ' + esc(r.text) : '') + '</span></span></div>'; }).join('') : '<p class="bm mu">No extension has run yet.</p>') + '</section>' + foot();
  };
  function sw2(key, on, label) { return '<button class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '" data-sw2="' + esc(key) + '"><i></i></button>'; }
  async function extToggle(id, on) {
    var x = exts.filter(function (e) { return e.id === id; })[0]; if (!x) return;
    var go2 = async function () { try { exts = await API.extEnable(id, on); render(); toast(on ? x.name + ' is on.' : x.name + ' is off.'); } catch (e) { toast(e.message); } };
    if (!on) return go2();
    dialog('Turn on ' + x.name, '<p class="bm">' + esc(x.description) + '</p><p class="ll">It asks to:</p><ul class="bm" style="margin:0;padding-left:20px">' + (x.permissionText.length ? x.permissionText.map(function (pt) { return '<li>' + esc(pt) + '</li>'; }).join('') : '<li>Nothing beyond running.</li>') + '</ul><p class="bs mu">It never gets passwords, keys or files. You are asked again if this list changes.</p><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="extok">Allow and turn on</button></div>', { emoji: '🧩' });
    $('#extok').onclick = function () { closeDialog(); go2(); };
  }
  async function extRun(id, cmd) {
    toast('Running…');
    try { var r = await API.extRun(id, cmd); if (r.notify) toast(r.notify, { emoji: '🧩' }); dialog(r.title, '<pre class="logbox tall" tabindex="0">' + esc(r.text) + '</pre><div class="row" style="gap:8px"><span class="grow"></span><button class="btn tonal" data-copy="' + esc(r.text) + '">' + icon('ContentCopy', 's') + L('copy') + '</button><button class="btn fill" data-act="dlg-close">' + L('done') + '</button></div>', { emoji: '🧩' }); }
    catch (e) { toast(e.message); beep('bad'); }
  }
  R.tools = function () {
    return '<div class="section">' + pageHead('Toolbox', w('tools'), '', null) + '<p class="bl mu">Small tools that run entirely in this window.</p><div class="chipline">' + [['regex', 'Pattern workbench'], ['base64', 'Base64'], ['convert', 'Convert'], ['colour', 'Colour'], ['otp', 'Authenticator']].map(function (x) { return '<button class="chip" data-go="tools:' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<section class="section" id="regex" data-k="t-regex"><h2 class="tl">Pattern workbench</h2><p class="bm mu">The same workbench every search here opens.</p><div><button class="btn tonal" data-regex="">Open the workbench</button></div></section>' +
      '<section class="section" id="base64" data-k="t-b64"><h2 class="tl">Base64, converting and drawing</h2><p class="bm mu">Each has its own tab now.</p><div class="chipline"><button class="btn tonal sm" data-go="base64:top">Base64</button><button class="btn tonal sm" data-go="convert:top">Convert</button><button class="btn tonal sm" data-go="draw:top">Draw</button></div></section>' +
      '<section class="section" id="qrmake" data-k="t-qr"><h2 class="tl">Make a QR code</h2><p class="bm mu">From any text or link, or from a one-time code you added below.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input class="input grow" id="qrtext" aria-label="Text for the QR code" placeholder="http://homeassistant.local:8123"><button class="btn tonal sm" data-act="qrmake">Make it</button>' + (st.otp.length ? '<select class="select" id="qrotp" aria-label="One-time code">' + st.otp.map(function (o2, i2) { return '<option value="' + i2 + '">' + esc(o2.name) + '</option>'; }).join('') + '</select><button class="btn text sm" data-act="qrotp">Show its QR code</button>' : '') + '</div></section>' +
      '<section class="section" id="convert" data-k="t-conv"><h2 class="tl">Convert</h2><p class="bm mu">Paste JSON (a list of objects) or CSV, then convert. Progress and errors show here.</p><textarea class="input" id="cvin" aria-label="Text to convert">[{"name": "Kitchen", "port": 8123}, {"name": "Garage", "port": 8124}]</textarea><div class="chipline"><button class="btn tonal sm" data-conv="csv">To CSV</button><button class="btn tonal sm" data-conv="json">To JSON</button><button class="btn tonal sm" data-conv="yaml">To YAML</button><button class="btn tonal sm" data-conv="md">To Markdown</button></div><div id="cvstat" class="bs mu" aria-live="polite"></div><pre class="wb-test" id="cvout"></pre></section>' +
      '<section class="section" id="colour" data-k="t-col"><h2 class="tl">Colour</h2><div class="row" style="gap:16px;flex-wrap:wrap"><input type="color" id="colin" value="#00639b" aria-label="Pick a colour" style="width:64px;height:48px;border:0;background:none"><input class="input mono" id="coltext" value="#00639B" aria-label="Type a colour as hex, rgb() or hsl()"><span class="swatch" id="colsw" style="background:#00639B"></span></div><div id="colout" class="bm"></div></section>' +
      '<section class="section" id="otp" data-k="t-otp"><h2 class="tl">Authenticator</h2><p class="bm mu">Add a one-time code secret (Base32). Codes are worked out here every 30 seconds. Or scan the QR code a site shows you: from an image, a pasted screenshot, or the camera. Nothing leaves this computer.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input class="input" id="otpname" placeholder="Name" aria-label="Name"><input class="input mono" id="otpsecret" placeholder="JBSWY3DPEHPK3PXP" aria-label="Secret"><button class="btn tonal sm" data-act="otpadd">Add</button></div><div class="chipline"><label class="btn tonal sm">' + icon('QrcodeScan', 's') + 'QR code from an image<input type="file" id="qrfile" accept="image/*" hidden></label><button class="btn tonal sm" data-act="qrcam">Use the camera</button><span class="bs mu">or paste a screenshot here</span></div><video id="qrvideo" class="qrvideo" hidden playsinline muted aria-label="Camera view for scanning a QR code"></video><div id="qrout" class="bs mu" aria-live="polite"></div><div id="otplist"></div></section>' + foot();
  };
  var PRESETS = [['A deploy failed', 'Deploying to … stopped at the step …', 'Try again; checked the target on the Deploy tab'], ['Cannot open an instance', 'The link does not load.', 'Restarted it; checked the port'], ['Forgot a lock PIN', 'I locked an element in this window and forgot its PIN.', 'Settings, Reset everything in this window']];
  R.support = function () {
    return '<div class="section">' + pageHead('Lifebuoy', w('support'), '', null) + '<p class="bl mu">Help when something goes wrong, and a place to note it. Tickets stay on this computer; copy them as text to send them on.</p>' +
      '<section class="card" data-k="sup-first" style="padding:24px"><h2 class="tl">First things to try</h2><ol class="bm" style="margin:0;padding-left:20px"><li>Deploy tab: press the circle arrow beside the place to check it again.</li><li>Activity tab: every line a deploy wrote, searchable.</li><li>Instances: the menu on a card has Logs and Restart.</li><li>Forgot a lock PIN: Settings, Reset everything in this window. Instances and backups are not touched.</li></ol></section>' +
      '<section class="section" id="new"><h2 class="tl">New ticket</h2><div class="chipline"><span class="bs mu">Start from:</span>' + PRESETS.map(function (p, i) { return '<button class="chip" data-preset="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<label class="col" style="gap:4px"><span class="ll">Title</span><input class="input" id="tk-title" maxlength="120"></label><span class="field-err" id="tk-title-err" role="alert"></span><label class="col" style="gap:4px"><span class="ll">What happened</span><textarea class="input" id="tk-what" style="font-family:inherit"></textarea></label><label class="col" style="gap:4px"><span class="ll">What you tried</span><input class="input" id="tk-tried"></label>' +
      '<label class="row bm" style="gap:10px"><input type="checkbox" id="tk-act" checked> Add the last 40 activity lines</label><div><button class="btn fill" data-act="ticket">Save the ticket</button></div></section>' +
      '<section class="section"><h2 class="tl">Your tickets</h2>' + (st.tickets.length ? st.tickets.map(function (x, i) { return '<div class="row-item" data-k="tk-' + x.t + '"><span class="col grow"><span class="ll">' + esc(x.title) + '</span><span class="bs mu">' + esc(when(new Date(x.t).toISOString())) + ' · ' + esc(x.what) + (x.tried ? ' · Tried: ' + esc(x.tried) : '') + '</span></span><button class="btn text sm" data-rmticket="' + i + '">Remove</button></div>'; }).join('') : '<p class="bm mu">No tickets yet.</p>') +
      '<button class="btn tonal" style="align-self:flex-start" data-act="copy-tickets">' + icon('ContentCopy', 's') + 'Copy your tickets as text</button></section>' + foot();
  };
  R.changes = function () {
    var m = matcher(q.changes);
    return '<div class="section">' + pageHead('History', w('changes'), '', null) + '<div>' + provenance() + '</div>' + findField('csearch', 'Search changes', q.changes) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' +
      CHANGES.map(function (c) { var items = c.items.filter(function (x) { return m.test(x); }); if (!items.length) return ''; return '<section class="section card" style="padding:20px" id="v-' + esc(c.version.replace(/\W/g, '')) + '" data-k="chg-' + esc(c.version) + '"><h2 class="tl">Version ' + esc(c.version) + '</h2><ul class="bm" style="margin:0;padding-left:20px">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>'; }).join('') + foot();
  };
  var upd = { state: 'current' };
  function updBar() {
    if (upd.state === 'ready') return '<div class="updbar" role="status" data-k="update"><span>' + icon('Update') + '</span><span class="bm grow"><b>Version ' + esc(upd.version) + ' is ready.</b> Restart to use it. This update is not code-signed; it comes from the project\'s own releases.</span><button class="btn fill sm" data-act="restartupd">Restart now</button><button class="btn text sm" data-act="updlater">Later</button></div>';
    if (upd.state === 'available') return '<div class="updbar" role="status" data-k="update"><span>' + icon('Update') + '</span><span class="bm grow"><b>Version ' + esc(upd.version) + ' is out.</b> On this system the app does not update itself; download the new one. It is not code-signed.</span><button class="btn fill sm" data-ext="' + esc(upd.url) + '">Download</button><button class="btn text sm" data-act="updlater">Later</button></div>';
    return '';
  }

  // ---------- The project's own pages, offline: Run it, Features, Articles, Status, Design ----------
  var SITE = window.SITE || { features: [], status: [], canvases: [], image: 'ghcr.io/ding-ding-projects/home-assistant-material', version: '' };
  var fview = { state: 'all', group: 'all', article: null };
  var FSTATE = { built: ['Built', 'g'], partly: ['Partly built', 'p'], written: ['Written', 'p'], designed: ['Designed', ''], na: ['Not for this product', 'a'] };
  function featTag(s) { var x = FSTATE[s] || [s, '']; return '<span class="tag ' + x[1] + '">' + esc(x[0]) + '</span>'; }
  function featById(id) { return SITE.features.filter(function (f) { return f.id === id; })[0]; }
  R.run = function () {
    var cmd = 'docker run -d --name homeassistant --restart unless-stopped --network host -v /path/to/config:/config ' + SITE.image + ':latest';
    return '<div class="section">' + pageHead('Console', w('run'), '', null) + '<p class="bl mu">The Deploy tab does all of this for you. These are the same steps by hand, for when you want them.</p>' +
      '<section class="card" data-k="run-cmd" style="padding:24px"><h2 class="tl">One container</h2><p class="bm mu">For amd64 and arm64. Then open <span class="mono">http://&lt;host&gt;:8123</span>.</p><div class="code"><pre>' + esc(cmd) + '</pre><button class="ib" data-copy="' + esc(cmd) + '" aria-label="Copy the command">' + icon('ContentCopy', 's') + '</button></div></section>' +
      '<section class="card" data-k="run-os" style="padding:24px"><h2 class="tl">Operating system images</h2><p class="bm mu">For Raspberry Pi cards and virtual machines. The Downloads tab fetches and checks every one of them for you.</p><div><button class="btn tonal" data-go="downloads:top">' + icon('Download', 's') + 'Open Downloads</button> <button class="btn text" data-go="deploy:top">' + icon('RocketLaunch', 's') + 'Or deploy in one click</button></div></section>' + foot();
  };
  R.features = function () {
    var m = matcher(q.features), counts = {}, groups = [];
    SITE.features.forEach(function (f) { counts[f.state] = (counts[f.state] || 0) + 1; if (groups.indexOf(f.group) < 0) groups.push(f.group); });
    var list = SITE.features.filter(function (f) { return (fview.state === 'all' || f.state === fview.state) && (fview.group === 'all' || f.group === fview.group) && m.test(f.name + ' ' + f.what + ' ' + f.id + ' ' + f.group); });
    var chip = function (k, v, label, cur) { return '<button class="chip' + (cur === v ? ' sel' : '') + '" aria-pressed="' + (cur === v) + '" data-' + k + '="' + esc(v) + '">' + label + '</button>'; };
    return '<div class="section">' + pageHead('StarFourPoints', w('features'), '', null) + '<p class="bl mu">Every feature the project owes, with its honest state in the product. ' + SITE.features.length + ' in all, from the project page of version ' + esc(SITE.version) + '.</p>' + findField('fsearch', 'Search features', q.features) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
      fold('fstate', 'Filters') + '<div class="chipline" role="group" aria-label="State">' + chip('fst', 'all', 'Every state', fview.state) + Object.keys(FSTATE).filter(function (k) { return counts[k]; }).map(function (k) { return chip('fst', k, esc(FSTATE[k][0]) + ' ' + counts[k], fview.state); }).join('') + '</div>' +
      '<div class="chipline" role="group" aria-label="Group">' + chip('fgr', 'all', 'Every group', fview.group) + groups.map(function (g) { return chip('fgr', g, esc(g), fview.group); }).join('') + '</div></details><p class="bs mu" aria-live="polite">' + list.length + ' shown</p></div>' +
      (list.length ? list.map(function (f) { return '<div class="row-item" id="f-' + f.id + '" data-k="f-' + f.id + '"><span class="col grow" style="gap:4px"><span class="chipline"><span class="tm">' + esc(f.name) + '</span>' + featTag(f.state) + '<span class="tag">' + esc(f.group) + '</span></span><span class="bm">' + esc(f.what) + '</span><span class="bs mu">In the product: ' + esc(f.product) + '</span></span><button class="btn text sm" data-article="' + f.id + '">' + L('articles') + '</button></div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  R.articles = function () {
    if (fview.article) {
      var f = featById(fview.article); if (!f) { fview.article = null; return R.articles(); }
      var next = SITE.features.filter(function (x) { return x.group === f.group && x.id !== f.id; }).slice(0, 3);
      return '<article class="article" id="top" data-k="a-' + f.id + '"><button class="btn text sm" data-article="" style="align-self:flex-start">' + icon('ChevronLeft', 's') + 'All articles</button><h1 class="hl">' + esc(f.name) + '</h1><div class="chipline">' + featTag(f.state) + '<span class="tag">' + esc(f.group) + '</span></div>' +
        (st.lang !== 'en' ? '<p class="bs mu">文章暫時只有英文。</p>' : '') + '<h2 class="tl">What it does</h2><p class="bl">' + esc(f.what) + '</p><h2 class="tl">Where the product stands</h2><p class="bl">' + esc(f.product) + ' The Status tab has the details.</p><h2 class="tl">On the project page</h2><p class="bl">' + esc(f.here) + '</p>' +
        (next.length ? '<h2 class="tl">Read next</h2><div class="chipline">' + next.map(function (x) { return '<button class="chip" data-article="' + x.id + '">' + esc(x.name) + '</button>'; }).join('') + '</div>' : '') + '</article>' + foot();
    }
    var m = matcher(q.articles); var list = SITE.features.filter(function (f) { return m.test(f.name + ' ' + f.what + ' ' + f.here); });
    return '<div class="section">' + pageHead('BookOpenVariant', w('articles'), '', null) + '<p class="bl mu">One article per feature, all inside this app, no connection needed.</p>' + findField('arsearch', 'Search articles', q.articles) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '<p class="bs mu" aria-live="polite">' + list.length + ' shown</p></div>' +
      '<div class="igrid">' + (list.length ? list.map(function (f) { return '<button class="extcard" style="text-align:left;border:0;font:inherit;color:inherit;cursor:pointer" data-k="ac-' + f.id + '" data-article="' + f.id + '"><span class="chipline"><span class="tm">' + esc(f.name) + '</span>' + featTag(f.state) + '</span><span class="bm mu">' + esc(f.what) + '</span></button>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };
  R.status = function () {
    var m = matcher(q.status);
    var out = SITE.status.map(function (sec, si) {
      var rows = sec.rows.filter(function (r) { return m.test(sec.title + ' ' + r.join(' ')); }); if (!rows.length) return '';
      return '<section class="section" id="st-' + si + '" data-k="st-' + si + '"><h2 class="tl">' + esc(sec.title) + '</h2><div class="scrollbox"><table class="t"><thead><tr>' + sec.head.map(function (h) { return '<th class="ll">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { var s2 = (r[1] || '').toLowerCase(), tone = /^done|^built/.test(s2) ? 'g' : /not started|^designed/.test(s2) ? '' : /partly|wired|written/.test(s2) ? 'p' : ''; return '<tr><td class="ll">' + esc(r[0]) + '</td><td><span class="tag ' + tone + '">' + esc(r[1] || '') + '</span></td>' + r.slice(2).map(function (c) { return '<td class="bs">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></section>';
    }).join('');
    return '<div class="section">' + pageHead('ClipboardCheckOutline', w('status'), '', null) + '<p class="bl mu">What exists today, stated plainly, from the project\'s status page at version ' + esc(SITE.version) + '. Nothing is called done until it has been seen working.</p>' + findField('stsearch', 'Search the status', q.status) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  R.design = function () {
    var m = matcher(q.design), total = 0;
    var cvs = SITE.canvases.filter(function (c) { return /^1[678]-deploy/.test(c.id); });
    var out = cvs.map(function (c) {
      var list = c.boards.filter(function (b) { return m.test(c.title + ' ' + b.title + ' ' + b.name); }); total += list.length; if (!list.length) return '';
      return '<section class="section" id="cv-' + c.id + '" data-k="cv-' + c.id + '"><h2 class="tl">' + esc(c.title) + ' <span class="bs mu">' + c.boards.length + ' boards</span></h2><div class="thumbs">' + list.map(function (b) { return '<button class="thumb" data-board="' + esc(b.name) + '" data-btitle="' + esc(b.title) + '"><img src="boards/' + esc(b.name) + '.webp" alt="" loading="lazy"><span class="bs">' + esc(b.title) + '</span></button>'; }).join('') + '</div></section>';
    }).join('');
    var n = cvs.reduce(function (a, c) { return a + c.boards.length; }, 0);
    return '<div class="section">' + pageHead('Palette', w('design'), '', null) + '<p class="bl mu">The design of this app: ' + n + ' boards, each drawn from the app itself in one state. Choose one to see it full size.</p>' + findField('dgsearch', 'Search the boards', q.design) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '<p class="bs mu" aria-live="polite">' + total + ' shown</p></div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  function boardDialog(name, title) {
    var all = SITE.canvases.filter(function (c) { return /^1[678]-deploy/.test(c.id); }).reduce(function (a, c) { return a.concat(c.boards); }, []);
    var i = all.map(function (b) { return b.name; }).indexOf(name);
    dialog(title, '<img src="boards/' + esc(name) + '.webp" alt="' + esc(title) + '" style="width:100%;height:auto;border-radius:16px;box-shadow:0 0 0 1px var(--outv)"><div class="row" style="gap:8px"><button class="btn text" id="bprev"' + (i > 0 ? '' : ' disabled') + '>' + icon('ChevronLeft', 's') + L('back') + '</button><span class="grow bs mu" style="text-align:center">' + (i + 1) + ' of ' + all.length + '</span><button class="btn text" id="bnext"' + (i < all.length - 1 ? '' : ' disabled') + '>' + L('next') + icon('ChevronRight', 's') + '</button></div>', { wide: true });
    var nav = function (d) { var b = all[i + d]; if (b) boardDialog(b.name, b.title); };
    $('#bprev').onclick = function () { nav(-1); }; $('#bnext').onclick = function () { nav(1); };
    $('#ov').addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') nav(-1); if (e.key === 'ArrowRight') nav(1); });
  }

  // ---------- Update self-test ----------
  var selftest = null;
  function selftestDialog() {
    var draw = function () {
      var steps = (selftest && selftest.steps) || [];
      var mark = function (sx) { return sx.state === 'passed' ? '<span class="sq ok">' + icon('Check', 's') + '</span>' : sx.state === 'failed' ? '<span class="sq bad">' + icon('Alert', 's') + '</span>' : sx.state === 'skipped' ? '<span class="sq todo">–</span>' : '<span class="sq now"><span class="spin" aria-hidden="true"></span></span>'; };
      var body = steps.length ? '<ol class="col steps" style="gap:12px;margin:0;padding:0;list-style:none">' + steps.map(function (sx) { return '<li class="row" style="gap:12px;align-items:flex-start">' + mark(sx) + '<span class="col grow"><span class="ll">' + esc(sx.title) + ' <span class="bs mu">' + esc(sx.state) + '</span></span><span class="bs mu">' + esc(sx.detail) + '</span>' + (sx.state === 'running' && sx.fraction ? '<span class="pbar" role="progressbar" aria-valuenow="' + Math.round(sx.fraction * 100) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.round(sx.fraction * 100) + '%"></i></span>' : '') + '</span></li>'; }).join('') + '</ol>' : '<p class="bm mu">Starting…</p>';
      var done = selftest && selftest.done;
      var box = $('#stbody'); if (box) { box.innerHTML = body; var b = $('#stcopy'); if (b) b.disabled = !done; return; }
      dialog('Update self-test', (DEMO ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">Demo: these steps are acted out. The app runs them for real.</span></div>' : '') + '<p class="bm mu">Walks the whole update path: the releases, the feed, the package and its checksums, the installer, and whether an update was seen applied. Updates are not code-signed; this checks them by checksum.</p><div id="stbody" aria-live="polite">' + body + '</div><div class="row" style="gap:8px"><span class="grow"></span><button class="btn tonal" id="stcopy"' + (done ? '' : ' disabled') + '>' + icon('ContentCopy', 's') + 'Copy the result</button><button class="btn fill" data-act="dlg-close">' + L('done') + '</button></div>', { emoji: '🧪' });
      $('#stcopy').onclick = function () { copy('Deploy Assistant ' + (about.version || '') + ' update self-test, ' + new Date().toISOString() + '\n' + (selftest.steps || []).map(function (x) { return '[' + x.state + '] ' + x.title + ': ' + x.detail; }).join('\n')); };
    };
    selftest = { steps: [], done: false, draw: draw }; draw();
    API.updateTest().then(function (r) { selftest.steps = r.steps; selftest.done = true; draw(); var bad = r.steps.filter(function (x) { return x.state === 'failed'; }).length; toast(bad ? 'The update self-test found a problem.' : 'The update self-test passed every step it could run.'); beep(bad ? 'bad' : 'on'); }, function (e) { selftest.done = true; toast(e.message); draw(); });
  }

  // ---------- Shell ----------
  function shell() {
    var app = $('#app');
    var winBtns = DEMO || API.platform === 'win32' ? (API.platform === 'win32' ? '<span class="wcospace" aria-hidden="true"></span>' : '') : '<span class="winctl"><button class="ib" data-win="min" aria-label="Minimize">' + icon('WindowMinimize', 's') + '</button><button class="ib" data-win="max" aria-label="Maximize">' + icon('WindowMaximize', 's') + '</button><button class="ib wclose" data-win="close" aria-label="Close the window">' + icon('Close', 's') + '</button></span>';
    app.innerHTML = '<a class="skip" href="#main">Skip to the page</a><div class="shell edge-' + st.edge + '">' +
      '<header class="topbar drag" data-k="topbar"><span class="brand"><span class="logo ' + st.logo.shape + '" aria-hidden="true">' + icon('RocketLaunch', 's') + '</span><b>' + esc(st.name) + '</b>' + (DEMO ? '<span class="tag a">Demo</span>' : '') + '</span>' +
      '<button class="btn tonal sm nodrag" data-act="palette" aria-label="' + esc(w('palette')) + ', Ctrl Shift F">' + icon('Magnify', 's') + '<span class="opt">' + L('search') + '</span><span class="kbd opt">Ctrl Shift F</span></button>' +
      '<button class="ib nodrag opt" data-act="theme" aria-label="' + esc(w('theme')) + '">' + icon('ThemeLightDark') + '</button>' + (st.axHidden ? '' : '<button class="ib nodrag" data-act="access" aria-label="' + esc(w('access')) + '">' + icon('HumanHandsup') + '</button>') + '' +
      '<button class="ib nodrag" data-act="bell" aria-label="' + esc(w('notifications')) + '" style="position:relative">' + icon('Bell') + '<span class="badge" id="bellcount" hidden>0</span></button>' + winBtns + '</header>' +
      '<div id="updslot"></div><nav class="tabstrip" role="tablist" aria-label="Pages" data-k="tabs"></nav><main class="main" id="main">' + TABS.map(function (t) { return '<section class="pane" role="tabpanel" id="p-' + t + '" aria-labelledby="t-' + t + '" hidden></section>'; }).join('') + '</main></div><div class="toasts" aria-live="polite"></div>';
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
    tabstrip(); var us = $('#updslot'); if (us) us.innerHTML = updBar() + adhdBar(); $('#app').classList.toggle('adhd-focus', adhd('focus'));
    TABS.forEach(function (t) { var p = $('#p-' + t); p.hidden = t !== st.active; p.innerHTML = t === st.active ? R[t]() : ''; });
    openDetails.forEach(function (k) { var d = $('[data-k="' + k + '"] details'); if (d) d.open = true; });
    decorate(); applyVocab($('#app'));
    if (fid && $('#' + fid)) { var n = $('#' + fid); n.focus({ preventScroll: true }); try { if (pos != null) n.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } }
    window.scrollTo(0, scroll);
    $$('.logbox').forEach(function (l) { l.scrollTop = l.scrollHeight; });
    if (st.active === 'tools') { otpDraw(); colour(); }
    if (st.active === 'instances') lcFrame();
    termsFollow();
    if (st.active === 'draw') drPaint();
    if (st.active === 'minecraft' && mcv.sub === 'generate') mgDraw();
    if (st.active === 'minecraft' && mcv.sub === 'console') { var mcb = $('#mccon'); if (mcb) mcb.scrollTop = mcb.scrollHeight; }
    if (API.overlay && API.platform === 'win32') API.overlay(isDark());
    if (st.active === 'activity') historyPanel();
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
      progress[id] = { step: (STEPS[target] || [])[0], text: 'Starting', fraction: 0, log: [], done: false, t0: Date.now() };
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
    var items = [['restart', 'Restart', 'Restart', 'R'], ['update', 'Update the image', 'Update', 'U'], ['logs', 'Show its logs', 'ConsoleLine', 'G'], ['rename', 'Rename or add a note', 'Pencil', 'N'], ['editor', 'Open its Compose file in VS Code', 'CodeBraces', 'E'], ['folder', 'Open its folder', 'FolderOpen', 'F'], ['remove', 'Remove', 'DeleteOutline', 'Del']];
    p.innerHTML = findField('imq', w('filterMenu'), '') + items.map(function (t) { return '<button class="mi" role="menuitem" data-ima="' + t[0] + '" data-name="' + t[1] + '">' + icon(t[2], 's') + '<span class="bm">' + t[1] + '</span><span class="kbd">' + t[3] + '</span></button>'; }).join('');
    $('#app').appendChild(p); var r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px'; $('#imq').focus();
    $('#imq').addEventListener('input', function () { var m = matcher(this.value); $$('.mi', p).forEach(function (b) { b.hidden = !m.test(b.dataset.name); }); });
    p.addEventListener('keydown', function (e) { var map = { r: 'restart', u: 'update', g: 'logs', n: 'rename', e: 'editor', f: 'folder', delete: 'remove' }; if (e.target.id !== 'imq' || e.altKey) { var a = map[e.key.toLowerCase()]; if (a) { e.preventDefault(); act(a); } } });
    p.addEventListener('click', function (e) { var b = e.target.closest('[data-ima]'); if (b) act(b.dataset.ima); });
    function act(a) {
      closePop();
      if (isLocked('inst-' + id) && /restart|update|remove/.test(a)) { askUnlock('inst-' + id); return; }
      if (a === 'restart' || a === 'update') doAction(id, a);
      if (a === 'logs') { view.logFor = id; doAction(id, 'logs'); go('activity:top'); }
      if (a === 'editor') { if (DEMO) toast('In the app this opens compose.yaml in VS Code, or the folder when VS Code is not installed.'); else API.editor(id).then(function (r) { toast(r); }, function (er) { toast(er.message); }); }
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
    items.push({ kind: 'Deploy', label: 'Write a Raspberry Pi card', act: 'pi' });
    exts.forEach(function (x) { (x.commands || []).forEach(function (c) { items.push({ kind: 'Extension', label: c.title, sub: x.name + (x.enabled ? '' : ' (off)'), go: 'extensions:ext-' + x.id }); }); });
    [['Add a schedule rule', 'ruleadd'], ['Change the logo', 'logo'], ['Home Assistant connection', 'haconn'], ['Choose your next step', 'nextset'], ['Export the activity', 'export-activity'], ['Export the backups', 'export-backups'], ['Export your settings', 'export-settings'], ['Show a dim sum', 'dimsum'], ['Check for a new version', 'checkupd'], ['Open the extensions folder', 'extfolder']].forEach(function (a2) { items.push({ kind: 'Action', label: a2[0], act: a2[1] }); });
    [['Minecraft servers', 'minecraft:top'], ['AI models', 'models:top'], ['Virtual disks', 'disks:top'], ['Settings, Setup with Chocolatey', 'settings:setup'], ['Convert files', 'convert:top'], ['Convert, PDF tools', 'convert:cv-pdf'], ['Base64, files', 'base64:b64files'], ['Draw', 'draw:top'], ['Tools, Make a QR code', 'tools:qrmake'], ['Settings, ADHD modes', 'settings:adhd'], ['Activity, History of your records', 'activity:records'], ['Instances, Live chart', 'instances:top'], ['Tools, Base64', 'tools:base64'], ['Tools, Convert', 'tools:convert'], ['Tools, Colour', 'tools:colour'], ['Tools, Authenticator', 'tools:otp'], ['Support, New ticket', 'support:new'], ['Settings, Modes', 'settings:modes'], ['Settings, Sound and voice', 'settings:sound'], ['Settings, Schedule', 'settings:schedule'], ['Settings, Name and logo', 'settings:identity'], ['Settings, Updates', 'settings:updates']].forEach(function (a3) { items.push({ kind: 'Page', label: a3[0], go: a3[1] }); }); items.push({ kind: 'Action', label: 'Download everything now', act: 'dlall' });
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
    if (a === 'export-instances') { var rows = await API.exportList(); return exportDialog('Export the list of instances', 'instances', rows); }
    if (a === 'export-activity') return exportDialog('Export the activity', 'activity', activity.map(function (x) { return { at: new Date(x.t).toISOString(), instance: instName(x.id), kind: x.kind, line: x.line }; }));
    if (a === 'export-activity-old') return saveText('activity.txt', activity.map(function (x) { return new Date(x.t).toISOString() + '  ' + instName(x.id) + '  ' + x.line; }).join('\n'));
    if (a === 'export-settings') return exportDialog('Export your settings', 'settings', Object.keys(DEF).filter(function (k) { return ['vocab', 'otp', 'history', 'notes', 'tickets', 'look', 'locks'].indexOf(k) < 0; }).map(function (k) { return { setting: k, value: st[k] }; }));
    if (a === 'export-backups') { var br = []; D.instances.forEach(function (i) { (i.backups || []).forEach(function (b) { br.push({ instance: i.name, made: b.at, kind: b.kind, size: b.size || 0, note: b.note || '' }); }); }); return exportDialog('Export the list of backups', 'backups', br); }
    if (a === 'export-hosts') return exportDialog('Export the SSH hosts', 'hosts', D.hosts.map(function (h) { return { name: h.name, address: h.address, user: h.user, port: h.port, keyFile: h.keyFile || '' }; }));
    if (a === 'export-downloads') return exportDialog('Export the downloads', 'downloads', (dls || []).map(function (d) { return { name: d.name || d.label, file: d.file || '', state: d.state || '', size: d.size || 0 }; }));
    if (a === 'export-tickets') return exportDialog('Export your tickets', 'tickets', st.tickets.map(function (x) { return { created: new Date(x.t).toISOString(), title: x.title, what: x.what, tried: x.tried }; }));
    if (a === 'rhexport') return exportDialog('Export the record history', 'history', (historyPanel.list ? historyPanel.list() : []).map(function (r) { return { revision: r.rev, at: r.at, action: r.action, change: r.text, instances: r.records.instances.length, hosts: r.records.hosts.length }; }));
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
      else body = '<h3 class="tm">Ready</h3><p class="bm">Choose where it runs on the left of the Deploy tab and press Deploy. When it is ready you get the link, and the instance appears under Instances with its backups. Ctrl Shift F searches everything.</p>';
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
      if (ch === 'log') { addActivity(p.id, p.line); if (progress[p.id]) { progress[p.id].log.push(p.line); if (progress[p.id].log.length > 2000) progress[p.id].log.shift(); if (st.active === 'deploy' && termPush('deploy-' + p.id, p.line)) return; } if (st.active === 'deploy' || st.active === 'activity') soon(); }
      if (ch === 'step') { var g = progress[p.id] = progress[p.id] || { log: [], done: false }; if (p.key === 'done') return; if (g.step !== p.key) g.log.push('ham › ' + (STEPNAME[p.key] || p.key)); g.step = p.key; g.text = p.text; g.fraction = p.fraction || 0; soon(); }
      if (ch === 'busy') { addActivity(p.id, 'Working: ' + p.action, 'action'); }
      if (ch === 'done') {
        var name = instName(p.id);
        addActivity(p.id, p.action + (p.ok ? ' finished' : ' failed: ' + p.error), 'action');
        if (p.action === 'deploy') { var pr = progress[p.id] = progress[p.id] || { log: [] }; pr.done = true; pr.ok = p.ok; pr.error = p.error; pr.t1 = Date.now(); if (p.ok) { finishedOne(); narrate('deploy', name + ' is ready to open.', name + ' 已經準備好，可以打開。'); } else narrate('deployfail', name + ' did not deploy: ' + p.error, name + ' 部署唔到：' + p.error, true); if (p.ok) { beep('on'); toast(name + ': ' + msg('deployed'), { emoji: '🎉' }); reload().then(function () { var i = D.instances.filter(function (x) { return x.id === p.id; })[0]; if (st.openAfter && i && i.url) openUrl(i.url); render(); }); } else { beep('bad'); toast(name + ': ' + msg('failedMsg') + ' ' + p.error); } }
        else if (p.action === 'backup') { toast(name + ': ' + (p.ok ? msg('backedUp') : p.error)); if (p.ok) { finishedOne(); narrate('backup', name + ' is backed up.', name + ' 備份好喇。'); } else narrate('backupfail', name + ' backup failed: ' + p.error, name + ' 備份失敗：' + p.error, true); }
        else if (p.action === 'remove') toast(p.ok ? name + ' removed.' : p.error);
        else if (!p.ok) toast(name + ': ' + p.error);
        reload().then(soon);
      }
      if (ch === 'school') { schoolApply(p); return; }
      if (ch === 'selftest') { if (selftest) { selftest.steps = p.steps; selftest.draw(); } return; }
      if (ch === 'update' && p.state === 'applied') { toast('Updated from ' + p.from + ' to ' + p.version + '. The update is applied and running.', { emoji: '✅' }); return; }
      if (ch === 'update') { if (upd.state !== 'later' || p.state === 'ready') upd = p; if (p.state === 'ready') { toast('Version ' + p.version + ' is ready. Restart to use it; it is not code-signed.', { emoji: '⬆️' }); narrate('update', 'Version ' + p.version + ' is ready. Restart to use it.', p.version + ' 版本準備好，重新開就用得。'); } soon(); }
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
      if ((b = t.closest('[data-sw2]'))) { extToggle(b.dataset.sw2.slice(4), b.getAttribute('aria-checked') !== 'true'); return; }
      if ((b = t.closest('[data-extrun]'))) { var er = b.dataset.extrun.split(':'); extRun(er[0], er[1]); return; }
      if ((b = t.closest('[data-preset]'))) { var pz = PRESETS[+b.dataset.preset]; $('#tk-title').value = pz[0]; $('#tk-what').value = pz[1]; $('#tk-tried').value = pz[2]; $('#tk-title').focus(); return; }
      if ((b = t.closest('[data-rmticket]'))) { st.tickets.splice(+b.dataset.rmticket, 1); save(); render(); return; }
      if ((b = t.closest('[data-conv]'))) { convert(b.dataset.conv); return; }
      if ((b = t.closest('[data-rmotp]'))) { st.otp.splice(+b.dataset.rmotp, 1); save(); otpDraw(); return; }
      if ((b = t.closest('[data-school]'))) { schoolToggle(); return; }
      if ((b = t.closest('[data-extmaster]'))) { var on2 = b.getAttribute('aria-checked') !== 'true'; if (DEMO) { exts.forEach(function (x) { x.master = on2; }); render(); return; } API.extMaster(on2).then(function (l) { exts = l; render(); toast(on2 ? 'Extensions are on again.' : 'Every extension is off.'); }); return; }
      if ((b = t.closest('[data-extrm]'))) { var xid = b.dataset.extrm; superConfirm('Remove the extension ' + xid, ['Its folder is deleted from this app.', 'What it was allowed is forgotten.'], 'REMOVE', function () { API.extRemove(xid).then(function (l) { exts = l; render(); }, function (er) { toast(er.message); }); }); return; }
      if ((b = t.closest('[data-adapter]'))) { cvRun(b.dataset.adapter); return; }
      if ((b = t.closest('[data-cvsave]'))) { var cs = b.dataset.cvsave.split(':'), cx = conv.files[+cs[0]], co = cx && cx.out[+cs[1]]; if (co) { if (co.path && API.showFile) API.showFile(co.path).catch(function (er) { toast(er.message); }); else { var an = document.createElement('a'); an.href = URL.createObjectURL(co.blob); an.download = co.name; an.click(); } } return; }
      if ((b = t.closest('[data-b64o]'))) { var bk = b.dataset.b64o; b64.o[bk] = !b64.o[bk]; render(); return; }
      if ((b = t.closest('[data-drtool]'))) { dr.tool = b.dataset.drtool; dr.mode = 'tools'; render(); return; }
      if ((b = t.closest('[data-drmode]'))) { dr.mode = b.dataset.drmode; render(); return; }
      if ((b = t.closest('[data-drink]'))) { dr.color = b.dataset.drink; dr.mode = 'tools'; render(); return; }
      if ((b = t.closest('[data-dimtroll]'))) { dimsumTroll(); return; }
      if ((b = t.closest('[data-rule]'))) { ruleDialog((st.rules || []).filter(function (r) { return r.id === b.dataset.rule; })[0]); return; }
      if ((b = t.closest('[data-ruleon]'))) { var rl = (st.rules || []).map(function (r) { return r.id === b.dataset.ruleon ? Object.assign({}, r, { on: !r.on }) : r; }); setVal('rules', rl, 'Schedule rule switched'); runRules(); render(); return; }
      if ((b = t.closest('[data-restorerev]'))) { var rv = b.dataset.restorerev; if (DEMO) { toast('In the app this restores revision ' + rv + ' as a new revision.'); return; } API.restoreRevision(rv).then(function (r) { toast(r.text); return reload(); }).then(function () { render(); }, function (er) { toast(er.message); }); return; }
      if ((b = t.closest('[data-axshow]'))) { setVal('axHidden', !st.axHidden, 'Accessibility button'); shell(); render(); return; }
      if ((b = t.closest('[data-fst]'))) { fview.state = b.dataset.fst; render(); return; }
      if ((b = t.closest('[data-fgr]'))) { fview.group = b.dataset.fgr; render(); return; }
      if ((b = t.closest('[data-article]'))) { fview.article = b.dataset.article || null; if (st.active !== 'articles') go('articles:top'); else { render(); window.scrollTo(0, 0); } return; }
      if ((b = t.closest('[data-board]'))) { boardDialog(b.dataset.board, b.dataset.btitle); return; }
      if ((b = t.closest('[data-pick]'))) { st.wizTarget = b.dataset.pick; save(); render(); var f = $('#place-' + st.wizTarget); if (f) f.focus(); return; }
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
      else if (a === 'wizgo') wizGo();
      else if (a === 'qrcam') qrCamera();
      else if (a === 'qrmake') { var qt = $('#qrtext').value.trim(); if (!qt) { toast('Type the text or link first.'); $('#qrtext').focus(); } else qrShow('QR code', qt); }
      else if (a === 'qrotp') { var oo = st.otp[+$('#qrotp').value]; if (oo) qrShow(oo.name, 'otpauth://totp/' + encodeURIComponent(oo.name) + '?secret=' + oo.secret + '&issuer=' + encodeURIComponent(oo.name.split(':')[0])); }
      else if (a === 'extadd') { if (DEMO) toast('In the app this adds an extension from a folder.'); else API.extAdd().then(function (l) { exts = l; render(); toast('Added. Turn it on to see what it asks for.'); }, function (er) { toast(er.message); }); }
      else if (a === 'schoolset') schoolDialog();
      else if (a === 'notesel-rm') { var keep2 = st.notes.filter(function (n2, i2) { return !nsel[i2]; }); setVal('notes', keep2, 'Notifications removed'); nsel = {}; render(); }
      else if (a === 'notesel-all') { st.notes.forEach(function (n2, i2) { nsel[i2] = true; }); render(); }
      else if (a === 'notesel-export') exportDialog('Export notifications', 'notifications', st.notes.filter(function (n2, i2) { return !Object.keys(nsel).length || nsel[i2]; }).map(function (n2) { return { at: new Date(n2.t).toISOString(), text: n2.text }; }));
      else if (a === 'cvclear') { conv.files = []; render(); }
      else if (a === 'cvpause') { conv.paused = !conv.paused; render(); }
      else if (a === 'cvcancel') { conv.cancel = true; conv.paused = false; toast('Cancelling: files already written stay; the rest are not started.'); }
      else if (a === 'cvdest') { API.pickFolder('Choose where converted files go').then(function (d) { if (d) { conv.dest = d; render(); } }); }
      else if (a === 'cvhistexport') exportDialog('Export the conversion history', 'conversions', st.convHistory || []);
      else if (a === 'cvhistclear') superConfirm('Clear the conversion history', [(st.convHistory || []).length + ' entries are removed from this window.', 'The converted files stay where they are.'], 'CLEAR', function () { setVal('convHistory', [], 'Conversion history cleared'); render(); });
      else if (a === 'b64e' || a === 'b64d') { b64Push(); try { if (a === 'b64e') { b64.output = b64Encode(encText(b64.input, b64.o.enc), b64.o); b64.preview = null; b64.note = 'Encoded ' + encText(b64.input, b64.o.enc).length + ' bytes.'; } else { var by = b64Decode(b64.input, b64.o); try { b64.output = decText(by, b64.o.enc); } catch (ee) { b64.output = ''; } b64Preview(by); b64.note = 'Decoded ' + by.length + ' bytes' + (b64.output ? '.' : '; they are not ' + b64.o.enc + ' text, so see the preview.'); } } catch (er) { b64.undo.pop(); b64.note = er.message; } render(); }
      else if (a === 'b64swap') { b64Push(); var tmp2 = b64.input; b64.input = b64.output; b64.output = tmp2; render(); }
      else if (a === 'b64url') { b64Push(); try { var bs = encText(b64.input, b64.o.enc); b64.output = 'data:text/plain;charset=' + (b64.o.enc === 'latin1' ? 'ISO-8859-1' : b64.o.enc.toUpperCase()) + ';base64,' + b64Encode(bs, { pad: true }); b64.note = 'A data: URL of ' + bs.length + ' bytes.'; } catch (er) { b64.note = er.message; } render(); }
      else if (a === 'b64parse') { var pd = parseDataUrl(b64.input); if (!pd) b64.note = 'That is not a data: URL. It starts with data:, then a type, then a comma.'; else { b64Push(); try { b64.output = decText(pd.bytes, (pd.params.charset || 'utf-8').toLowerCase() === 'iso-8859-1' ? 'latin1' : 'utf-8'); } catch (ee) { b64.output = ''; } b64Preview(pd.bytes); b64.note = 'Type ' + pd.mime + (Object.keys(pd.params).length ? ', ' + Object.keys(pd.params).map(function (k) { return k + '=' + pd.params[k]; }).join(', ') : '') + ', ' + pd.bytes.length + ' bytes' + (pd.base64 ? ', Base64.' : ', percent-encoded.'); } render(); }
      else if (a === 'b64paste') { navigator.clipboard.readText().then(function (tx) { b64Push(); b64.input = tx; render(); }, function () { toast('The clipboard could not be read. Paste into the box instead.'); }); }
      else if (a === 'b64undo') { var u = b64.undo.pop(); if (u) { b64.redo.push({ input: b64.input, output: b64.output }); b64.input = u.input; b64.output = u.output; render(); } }
      else if (a === 'b64redo') { var r2 = b64.redo.pop(); if (r2) { b64.undo.push({ input: b64.input, output: b64.output }); b64.input = r2.input; b64.output = r2.output; render(); } }
      else if (a === 'b64record') { var by2 = new TextEncoder().encode(b64.output); sha256(by2).then(function (h) { saveText('base64-record.json', JSON.stringify({ variant: b64.o.url ? 'base64url' : 'base64', padding: b64.o.pad, mime: b64.o.mime, wrap: b64.o.wrap || 0, strict: b64.o.strict, encoding: b64.o.enc, inputBytes: encText(b64.input, b64.o.enc).length, outputBytes: by2.length, outputSha256: h, at: new Date().toISOString() }, null, 2)); }); }
      else if (a === 'b64zip') { var zf = {}; zf['base64-results.json'] = new TextEncoder().encode(JSON.stringify(b64.files.map(function (f) { return { source: f.name, result: f.result, ok: !!f.ok, bytes: f.size || 0, sha256: f.sha || '', message: f.msg }; }), null, 2)); var zb = window.fflate.zipSync(zf); var za = document.createElement('a'); za.href = URL.createObjectURL(new Blob([zb])); za.download = 'base64-results.zip'; za.click(); }
      else if (a === 'b64fclear') { b64.files = []; render(); }
      else if (a === 'drundo') { if (dr.undo.length) { dr.redo.push(JSON.stringify(dr.strokes)); dr.strokes = JSON.parse(dr.undo.pop()); drSave(); render(); } }
      else if (a === 'drredo') { if (dr.redo.length) { dr.undo.push(JSON.stringify(dr.strokes)); dr.strokes = JSON.parse(dr.redo.pop()); drSave(); render(); } }
      else if (a === 'drclear') superConfirm('Clear the drawing', [dr.strokes.length + ' saved strokes are removed.', 'Export it first if you want to keep it.'], 'CLEAR', function () { drSnap(); dr.strokes = []; drSave(); render(); });
      else if (a === 'drsvg') saveText('drawing.svg', drSvg());
      else if (a === 'drpng1' || a === 'drpng2' || a === 'drpng3') drExportPng(+a.slice(-1));
      else if (a === 'nextset') { dialog('Your next step', '<label class="col" style="gap:4px"><span class="ll">What is the one thing to do next?</span><input class="input" id="nsin" maxlength="80" value="' + esc(st.nextStep || '') + '"></label><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="nsok">Keep it in view</button></div>', { emoji: '👉', focus: '#nsin' }); $('#nsok').onclick = function () { setVal('nextStep', $('#nsin').value.trim(), 'Next step'); closeDialog(); render(); }; }
      else if (a === 'nextdone') { setVal('nextStep', '', 'Next step done'); finishedOne(); render(); toast(msg('saved')); }
      else if (a === 'ruleadd') ruleDialog(null);
      else if (a === 'haconn') haDialog();
      else if (a === 'logo') logoDialog();
      else if (a === 'ntest') { var nn = st.narrator.on; st.narrator.on = true; nlast = {}; narrate('test', 'This is the narrator.', '我係旁白。', true); st.narrator.on = nn; }
      else if (a === 'bkclear') { bsel = {}; render(); }
      else if (a === 'bkdel') { var ks = Object.keys(bsel).filter(function (k) { return bsel[k]; }); superConfirm('Delete ' + ks.length + ' backups', [ks.length + ' backup files or snapshots are deleted from this computer.', 'The instances themselves keep running.'], 'DELETE', function () { ks.forEach(function (k) { var pr = k.split(':'); doAction(pr[0], 'deleteBackup', pr[1]); }); bsel = {}; render(); }); }
      else if (a === 'hsclear') { hsel = {}; render(); }
      else if (a === 'hstest') { Object.keys(hsel).filter(function (k) { return hsel[k]; }).forEach(function (id) { var hh = D.hosts.filter(function (h) { return h.id === id; })[0]; API.check('ssh', id).then(function (r) { toast((hh ? hh.name + ': ' : '') + (r.ok ? '✓ ' : '') + r.detail); }); }); }
      else if (a === 'hsdel') { var ids = Object.keys(hsel).filter(function (k) { return hsel[k]; }); superConfirm('Remove ' + ids.length + ' hosts', ['They are removed from this app with their saved passwords.', 'Nothing on the hosts changes.'], 'REMOVE', function () { Promise.all(ids.map(function (id) { return API.removeHost(id); })).then(reload).then(function () { hsel = {}; render(); }, function (er) { toast(er.message); }); }); }
      else if (a === 'selftest') selftestDialog();
      else if (a === 'b64enc') b64(true); else if (a === 'b64dec') b64(false);
      else if (a === 'otpadd') { var nm = $('#otpname').value.trim() || 'Code', sc = $('#otpsecret').value.trim(); try { if (!sc) throw new Error(); b32(sc); } catch (er2) { toast('That secret is not Base32 (letters A to Z and digits 2 to 7).'); return; } st.otp.push({ name: nm, secret: sc }); save(); render(); }
      else if (a === 'ticket') { var ti = $('#tk-title').value.trim(); if (!ti) { $('#tk-title-err').textContent = 'Give the ticket a title, so you can find it later.'; $('#tk-title').focus(); return; } var acts = $('#tk-act').checked ? '\n' + activity.slice(-40).map(function (x) { return new Date(x.t).toISOString() + ' ' + instName(x.id) + ' ' + x.line; }).join('\n') : ''; st.tickets.unshift({ t: Date.now(), title: ti, what: $('#tk-what').value.trim() + acts, tried: $('#tk-tried').value.trim() }); save(); render(); toast(msg('saved')); }
      else if (a === 'copy-tickets') copy(st.tickets.map(function (x) { return '# ' + x.title + '\n' + x.what + (x.tried ? '\nTried: ' + x.tried : ''); }).join('\n\n') || 'No tickets.');
      else if (a === 'dimsum') dimsum(true);
      else if (a === 'voice-test') speak(st.lang === 'yue' ? '你好，呢個係你揀嘅聲。' : 'Hello. This is the voice you picked.');
      else if (a === 'extfolder') { if (DEMO) toast('In the app this opens the extensions folder.'); else API.extFolder(); }
      else if (a === 'checkupd') { if (DEMO) toast('In the app this checks the project releases now.'); else { API.checkUpdates(); toast('Checking for a new version…'); } }
      else if (a === 'restartupd') API.restartToUpdate();
      else if (a === 'updlater') { upd = { state: 'later' }; render(); }
      else if (a === 'wizreset') { var wt = wizTarget(); delete wiz.defs[wt]; delete wiz.vals[wt]; render(); }
      else if (a === 'addhost') { e.preventDefault(); hostDialog(null, function () { var wt2 = wizTarget(); delete wiz.defs[wt2]; delete wiz.vals[wt2]; render(); }); }
      else if (a === 'dlall') { API.downloadAll(); toast('Downloading everything that is missing or out of date.'); }
      else if (a === 'autodl') { API.autoDownload(!(D.autoDownload !== false)).then(reload).then(render); }
      else if (a === 'openfolder') API.openFolder('').catch(function (er) { toast(er.message); });
      else if (a === 'vocab-clear') { st.vocab = null; save(); apply(); shell(); render(); }
      else action(a);
    });
    app.addEventListener('input', function (e) {
      var t = e.target, map = { dsearch: 'downloads', isearch: 'instances', bsearch: 'backups', hsearch: 'hosts', asearch: 'activity', ssearch: 'settings', hpsearch: 'help' };
      if (map[t.id]) { q[map[t.id]] = t.value; render(); return; }
      if (t.id === 'b64i') { b64.input = t.value; return; }
      if (t.dataset.cvopt) { conv.opts[t.dataset.cvopt] = t.value; return; }
      if (t.id && t.id.indexOf('cvq-') === 0) { conv.q[t.id.slice(4)] = t.value; render(); var cf = $('#' + t.id); if (cf) { cf.focus(); cf.setSelectionRange(cf.value.length, cf.value.length); } return; }
      if (t.dataset.drsize != null) { dr.size = +t.value; return; }
      if (t.id === 'rhsearch') { q.rhist = t.value; if (historyPanel.draw) { historyPanel.draw(); var rf = $('#rhsearch'); rf.focus(); rf.setSelectionRange(rf.value.length, rf.value.length); } return; }
      if (t.dataset.nrange) { st.narrator[t.dataset.nrange] = +t.value; save(); return; }
      if (t.dataset.wiz) { var wv = wiz.vals[wizTarget()]; if (wv) wv[t.dataset.wiz] = t.type === 'checkbox' ? t.checked : t.value; return; }
      if (t.dataset.isel) { view.sel[t.dataset.isel] = t.checked; render(); return; }
      if (t.dataset.color) { st.seed = t.value; save(); apply(); }
      if (t.id === 'coltext') colour();
      if (t.id === 'colin') { $('#coltext').value = t.value.toUpperCase(); colour(); }
    });
    app.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'cvfiles' && t.files.length) { cvAdd(Array.prototype.slice.call(t.files)); return; }
      if (t.dataset.b64file && t.files.length) { Array.prototype.forEach.call(t.files, function (f) { b64File(f, t.dataset.b64file); }); return; }
      if (t.dataset.b64wrap != null) { b64.o.wrap = t.value; return; }
      if (t.dataset.b64enc != null) { b64.o.enc = t.value; render(); return; }
      if (t.dataset.drinkc != null) { dr.color = t.value; render(); return; }
      if (t.id === 'drbg' && t.files[0]) { createImageBitmap(t.files[0]).then(function (bm) { dr.bg = bm; drPaint(); }, function () { toast('That picture could not be opened.'); }); return; }
      if (t.dataset.nsel != null) { nsel[t.dataset.nsel] = t.checked; render(); return; }
      if (t.dataset.bksel) { bsel[t.dataset.bksel] = t.checked; render(); return; }
      if (t.dataset.bkall != null) { $$('[data-bksel]').forEach(function (c) { bsel[c.dataset.bksel] = t.checked; }); render(); return; }
      if (t.dataset.hsel) { hsel[t.dataset.hsel] = t.checked; render(); return; }
      if (t.dataset.nvoice) { setVal('narrator.' + (t.dataset.nvoice === 'yue' ? 'voiceYue' : 'voiceEn'), t.value, t.getAttribute('aria-label')); render(); return; }
      if (t.dataset.nrange) { setVal('narrator.' + t.dataset.nrange, +t.value, 'Narrator ' + t.dataset.nrange); return; }
      if (t.dataset.rhact != null) { hview.action = t.value; historyPanel.draw(); return; }
      if (t.dataset.rhfrom != null) { hview.from = t.value; historyPanel.draw(); return; }
      if (t.dataset.rhto != null) { hview.to = t.value; historyPanel.draw(); return; }
      if (t.dataset.lcinst != null) { lc.id = t.value; lc.shown = []; return; }
      if (t.dataset.wiz) { var wv2 = wiz.vals[wizTarget()]; if (wv2) wv2[t.dataset.wiz] = t.type === 'checkbox' ? t.checked : t.value; }
      if (t.dataset.isort != null) { view.sort = t.value; render(); }
      if (t.dataset.logfor != null) { view.logFor = t.value; render(); }
      if (t.dataset.schedtime != null) API.schedule({ time: t.value }).then(reload);
      if (t.dataset.schedkeep != null) API.schedule({ keep: Math.max(1, Number(t.value) || 7) }).then(reload);
      if (t.dataset.schedcons != null) API.schedule({ consistent: t.checked }).then(reload);
      if (t.dataset.color) setVal('seed', t.value, 'Main colour');
      if (t.id === 'vocabfile' && t.files[0]) loadVocabFile(t.files[0]);
      if (t.dataset.select) setVal(t.dataset.select, t.value, t.getAttribute('aria-label'));
      if (t.dataset.time) { setVal(t.dataset.time, t.value, t.getAttribute('aria-label')); apply(); }
      if (t.dataset.text) { setVal(t.dataset.text, t.value.trim() || DEF.name, 'Name'); shell(); render(); }
      if (t.dataset.logocolor) { setVal('logo.color', t.value, 'Logo colour'); shell(); render(); }
      if (t.id === 'qrfile' && t.files[0]) qrFile(t.files[0]);
      if (t.id === 'b64file' && t.files[0]) { var fr = new FileReader(); fr.onload = function () { $('#b64out').textContent = String(fr.result).split(',')[1] || ''; }; fr.readAsDataURL(t.files[0]); }
    });
    app.addEventListener('toggle', function (e) { var d = e.target; if (d.dataset && d.dataset.iopen) view.open[d.dataset.iopen] = d.open; if (d.dataset && d.dataset.fold) { st.folds = st.folds || {}; if (st.folds[d.dataset.fold] !== d.open) { st.folds[d.dataset.fold] = d.open; save(); var sm = d.querySelector('summary .ic'); if (sm) sm.outerHTML = icon(d.open ? 'ChevronDown' : 'ChevronRight', 's'); } } }, true);
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
      if (e.ctrlKey && !e.shiftKey && e.key === 'Enter' && st.active === 'deploy' && !$('#ov')) { e.preventDefault(); wizGo(); return; }
      var lb = e.target.closest && e.target.closest('[data-pick]'); if (lb && /Arrow(Up|Down)/.test(e.key)) { e.preventDefault(); var pi2 = PLACES.indexOf(lb.dataset.pick) + (e.key === 'ArrowDown' ? 1 : -1); st.wizTarget = PLACES[(pi2 + PLACES.length) % PLACES.length]; save(); render(); $('#place-' + st.wizTarget).focus(); return; }
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
    document.addEventListener('dragover', function (e) { if (dragged) return; if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); if (!dz) { dz = document.createElement('div'); dz.className = 'dropzone'; dz.textContent = st.active === 'base64' ? 'Drop to encode or decode' : st.active === 'draw' ? 'Drop a picture to draw on it' : st.active === 'convert' ? 'Drop files to convert' : 'Drop a wording file, files to convert, or a virtual disk'; $('#app').appendChild(dz); } } });
    document.addEventListener('dragleave', function (e) { if (dz && !e.relatedTarget) { dz.remove(); dz = null; } });
    document.addEventListener('drop', function (e) {
      if (dragged) return; if (dz) { dz.remove(); dz = null; } var fl = e.dataTransfer && e.dataTransfer.files; if (!fl || !fl.length) return; e.preventDefault();
      var arr = Array.prototype.slice.call(fl), zone = e.target.closest && e.target.closest('[data-b64drop]');
      if (arr.some(function (f) { return /\.(vhdx?|vhds|avhdx?|iso)$/i.test(f.name); }) && window.vdDrop) { window.vdDrop(arr); return; }
      if (zone || st.active === 'base64') { arr.forEach(function (f) { b64File(f, zone ? zone.dataset.b64drop : (/\.(base64\.txt|b64)$/i.test(f.name) ? 'dec' : 'enc')); }); if (st.active !== 'base64') go('base64:b64files'); return; }
      if (st.active === 'convert') { cvAdd(arr); return; }
      if (st.active === 'draw' && /^image\//.test(arr[0].type)) { createImageBitmap(arr[0]).then(function (bm) { dr.bg = bm; drPaint(); }); return; }
      if (/\.json$/i.test(arr[0].name)) { loadVocabFile(arr[0]); return; }
      cvAdd(arr); go('convert:queue');
    });
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
    fr.onload = function () { var r = parseVocab(String(fr.result)); if (!r.ok) { toast(r.error + ' Nothing changed.'); beep('bad'); return; } setTimeout(function () { celebrate('Your words are in: ' + Object.keys(r.entries).length + ' of them.'); }, 50); st.vocab = r.entries; st.history.unshift({ t: Date.now(), path: 'vocab', label: 'Your wording file (' + r.count + ' entries)', before: null, after: '(your file)' }); save(); apply(); shell(); render(); var c = document.createElement('div'); c.className = 'celebrate'; c.setAttribute('role', 'status'); c.innerHTML = '<div class="hl">' + esc(msg('vocab')) + '</div><p class="bm">' + r.count + ' words in use.</p>'; $('#app').appendChild(c); setTimeout(function () { c.remove(); }, 3000); beep('on'); };
    fr.readAsText(file);
  }

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

  // ---------- School mode, shared with every app on this computer ----------
  function schoolApply(v) {
    var was = st.school; schoolInfo = v; if (!!v.on !== !!st.school) { st.school = !!v.on; save(); apply(); }
    if (was !== st.school) toast((v.name || 'School mode') + (st.school ? ' is on' : ' is off') + (v.by && v.by !== 'Deploy Assistant' ? ', switched in ' + v.by : '') + '.');
    shell(); render();
  }
  function schoolToggle() {
    if (DEMO || !API.schoolSet) { setVal('school', !st.school, 'School mode'); render(); return; }
    var want = !st.school;
    var go2 = function (pin) { API.schoolSet({ on: want, pin: pin }).then(schoolApply, function (e) { toast(e.message); beep('bad'); }); };
    if (!want && schoolInfo.locked) { dialog('Switch off ' + (schoolInfo.name || 'School mode'), '<p class="bm">This needs its PIN. It is the same in every app.</p><input class="input mono" id="scpin" type="password" inputmode="numeric" maxlength="12" aria-label="PIN" autocomplete="off"><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="scok">Switch off</button></div>', { focus: '#scpin' }); $('#scok').onclick = function () { var v = $('#scpin').value; closeDialog(); go2(v); }; return; }
    go2('');
  }
  function schoolDialog() {
    dialog('Name and PIN', '<p class="bm mu">Shared with every Ding Ding Projects app on this computer.</p><label class="col" style="gap:4px"><span class="ll">Its name</span><input class="input" id="scname" maxlength="40" value="' + esc(schoolInfo.name || 'School mode') + '"></label><label class="col" style="gap:4px"><span class="ll">New PIN to switch it off (4 to 12 digits; empty removes it)</span><input class="input mono" id="scnew" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></label>' + (schoolInfo.locked ? '<label class="col" style="gap:4px"><span class="ll">Current PIN</span><input class="input mono" id="sccur" type="password" inputmode="numeric" maxlength="12" autocomplete="off"></label>' : '') + '<span class="field-err" id="scerr" role="alert"></span><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="scsave">Save</button></div>', { emoji: '🎒' });
    $('#scsave').onclick = function () {
      if (DEMO) { closeDialog(); toast('In the app this changes the shared name and PIN.'); return; }
      var o = { name: $('#scname').value, pin: $('#sccur') ? $('#sccur').value : '' }; var np = $('#scnew').value; if (np || schoolInfo.locked) o.newPin = np;
      if (!np && schoolInfo.locked && !o.pin) delete o.newPin;
      API.schoolSet(o).then(function (v) { closeDialog(); schoolApply(v); toast(msg('saved')); }, function (e) { $('#scerr').textContent = e.message; });
    };
  }

  // ---------- A celebration when your wording file is taken in ----------
  function celebrate(text) {
    var calm = st.reduceMotion || st.lowStim || matchMedia('(prefers-reduced-motion: reduce)').matches;
    var c = document.createElement('div'); c.className = 'celebrate'; c.setAttribute('role', 'status'); c.innerHTML = '<div class="celecard"><span class="hl">' + (st.emoji && !st.school ? '🎉 ' : '') + esc(text) + '</span></div>';
    if (!calm) for (var i = 0; i < 80; i++) { var bit = document.createElement('i'); bit.style.left = Math.random() * 100 + '%'; bit.style.background = ['var(--p)', 'var(--t)', 'var(--amber)', 'var(--green)', 'var(--err)'][i % 5]; bit.style.animationDelay = Math.random() * 0.6 + 's'; bit.style.transform = 'rotate(' + Math.random() * 360 + 'deg)'; c.appendChild(bit); }
    $('#app').appendChild(c); c.addEventListener('click', function () { c.remove(); }); setTimeout(function () { c.remove(); }, calm ? 2500 : 3200);
  }
  // ==========================================================================================
  // Converter, Base64 toolkit, QR codes, ZIP and drawing. Everything runs in this window with the
  // bundled libraries in vendor/ (pdf-lib, fflate, qrcode-generator, jsQR); nothing is uploaded.
  // ==========================================================================================
  var MB = 1024 * 1024;
  function hex(b, n) { return Array.prototype.map.call(b.slice(0, n || b.length), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  async function sha256(bytes) { var d = await crypto.subtle.digest('SHA-256', bytes); return hex(new Uint8Array(d)); }
  function fmtSize(n) { n = +n || 0; return n < 1024 ? n + ' B' : n < MB ? (n / 1024).toFixed(1) + ' KB' : n < 1024 * MB ? (n / MB).toFixed(1) + ' MB' : n < 1024 * 1024 * MB ? (n / MB / 1024).toFixed(1) + ' GB' : (n / MB / 1024 / 1024).toFixed(2) + ' TB'; }
  function readBytes(blob, start, end) { return blob.slice(start || 0, end == null ? blob.size : end).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function baseName(n) { var i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; }

  // Type from the first bytes, never from the name alone.
  var SIGS = [['png', 'image/png', '89504e470d0a1a0a'], ['jpeg', 'image/jpeg', 'ffd8ff'], ['gif', 'image/gif', '47494638'], ['webp', 'image/webp', /^52494646.{8}57454250/], ['bmp', 'image/bmp', '424d'], ['pdf', 'application/pdf', '25504446'], ['zip', 'application/zip', '504b0304'], ['gzip', 'application/gzip', '1f8b'], ['mp3', 'audio/mpeg', /^(494433|fffb|fff3)/], ['wav', 'audio/wav', /^52494646.{8}57415645/], ['ogg', 'audio/ogg', '4f676753'], ['flac', 'audio/flac', '664c6143'], ['mp4', 'video/mp4', /^.{8}66747970/], ['webm', 'video/webm', '1a45dfa3'], ['7z', 'application/x-7z-compressed', '377abcaf271c'], ['rar', 'application/vnd.rar', '526172211a07']];
  async function detect(file) {
    var b = await readBytes(file, 0, 4096), h = hex(b, 16);
    for (var i = 0; i < SIGS.length; i++) { var s = SIGS[i]; if (typeof s[2] === 'string' ? h.indexOf(s[2]) === 0 : s[2].test(h)) { var t = { kind: s[0], mime: s[1] }; if (t.kind === 'zip' && /\.(docx|xlsx|pptx|odt|ods)$/i.test(file.name)) t.office = true; return t; } }
    var text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(b.slice(0, b.length - (b.length === 4096 ? 4 : 0))); } catch (e) { return { kind: 'binary', mime: 'application/octet-stream' }; }
    var tt = text.replace(/^﻿/, '').trimStart();
    if (/^<svg[\s>]|^<\?xml[^>]*>\s*<svg/i.test(tt)) return { kind: 'svg', mime: 'image/svg+xml', text: true };
    if (/^[[{]/.test(tt)) return { kind: 'json', mime: 'application/json', text: true };
    if (/^<\?xml|^</.test(tt)) return { kind: 'xml', mime: 'application/xml', text: true };
    if (/^data:[\w.+-]+\/[\w.+-]+[;,]/.test(tt)) return { kind: 'dataurl', mime: 'text/plain', text: true };
    var first = tt.split(/\r?\n/)[0] || '';
    if (/\t/.test(first)) return { kind: 'tsv', mime: 'text/tab-separated-values', text: true };
    if (/,/.test(first) && tt.split(/\r?\n/).length > 1) return { kind: 'csv', mime: 'text/csv', text: true };
    if (/^[A-Za-z0-9+/=_\-\s]+$/.test(tt) && tt.replace(/\s/g, '').length >= 8 && tt.replace(/\s/g, '').length % 4 !== 1) return { kind: 'base64', mime: 'text/plain', text: true };
    return { kind: 'text', mime: 'text/plain', text: true };
  }

  // ---------- Adapter registry: category, sources, target, what can change, and how it runs ----------
  var CATS = [['pdf', 'Documents and PDF'], ['image', 'Images'], ['audio', 'Audio'], ['video', 'Video'], ['archive', 'Archives'], ['data', 'Structured data'], ['text', 'Code and text'], ['binary', 'Binary encodings']];
  var IMG = ['png', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
  function A(id, cat, from, to, name, lossy, run, opts) { return Object.assign({ id: id, cat: cat, from: from, to: to, name: name, lossy: lossy, run: run, enabled: !!run }, opts || {}); }
  function off(id, cat, from, to, name, why) { return A(id, cat, from, to, name, '', null, { why: why }); }
  async function toBitmap(file, t) {
    if (t.kind === 'svg') { var url = URL.createObjectURL(new Blob([await file.text()], { type: 'image/svg+xml' })); try { var img = new Image(); img.src = url; await img.decode(); var c = document.createElement('canvas'); c.width = Math.min(8000, img.naturalWidth || 1024); c.height = Math.min(8000, img.naturalHeight || 1024); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; } finally { URL.revokeObjectURL(url); } }
    var bm = await createImageBitmap(file); if (bm.width * bm.height > 100e6) throw new Error('The picture has more than 100 million pixels.'); return bm;
  }
  function imgTo(mime, q) {
    return async function (file, t, o) {
      var bm = await toBitmap(file, t), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; var x = c.getContext('2d');
      if (mime === 'image/jpeg') { x.fillStyle = o.bg || '#ffffff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(bm, 0, 0); var blob = await new Promise(function (r) { c.toBlob(r, mime, q); });
      if (!blob || blob.type !== mime) throw new Error('This window cannot write ' + mime + '.');
      return [{ name: baseName(file.name) + '.' + ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[mime], blob: blob }];
    };
  }
  async function pdfDoc(file) { var PDF = window.PDFLib; if (!PDF) throw new Error('The PDF library did not load.'); try { return await PDF.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); } catch (e) { if (/encrypt/i.test(e.message)) throw new Error('This PDF is encrypted. Encrypted PDFs are not opened here.'); throw new Error('This PDF could not be read: ' + e.message.slice(0, 120)); } }
  function parseRange(s, n) {
    var out = []; String(s || '').split(',').forEach(function (p) { p = p.trim(); if (!p) return; var m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p); if (!m) throw new Error('"' + p + '" is not a page or a range like 2-5.'); var a = +m[1], b = m[2] ? +m[2] : a; if (a < 1 || b > n || a > b) throw new Error('Pages ' + p + ' are outside 1 to ' + n + '.'); for (var i = a; i <= b; i++) out.push(i - 1); });
    if (!out.length) throw new Error('Give at least one page.'); return out;
  }
  async function pdfSave(doc, name, check) {
    var bytes = await doc.save(); var again = await window.PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    if (check) check(again); return { name: name, blob: new Blob([bytes], { type: 'application/pdf' }), note: again.getPageCount() + ' pages, checked by reopening' };
  }
  var PDFTOOLS = {
    inspect: async function (file) { var d = await pdfDoc(file); var info = { pages: d.getPageCount(), title: d.getTitle() || '', author: d.getAuthor() || '', subject: d.getSubject() || '', keywords: d.getKeywords() || '', creator: d.getCreator() || '', producer: d.getProducer() || '', created: d.getCreationDate() ? d.getCreationDate().toISOString() : '', modified: d.getModificationDate() ? d.getModificationDate().toISOString() : '', sizes: d.getPages().slice(0, 50).map(function (p, i) { return (i + 1) + ': ' + Math.round(p.getWidth()) + ' x ' + Math.round(p.getHeight()) + ' pt, rotated ' + p.getRotation().angle; }) }; return [{ name: baseName(file.name) + '.inspect.json', blob: new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' }), note: info.pages + ' pages' }]; },
    split: async function (file) { var d = await pdfDoc(file), n = d.getPageCount(), files = {}; if (n > 2000) throw new Error('More than 2000 pages.'); for (var i = 0; i < n; i++) { var o = await window.PDFLib.PDFDocument.create(); var pg = await o.copyPages(d, [i]); o.addPage(pg[0]); var r = await pdfSave(o, '', function (a) { if (a.getPageCount() !== 1) throw new Error('Page ' + (i + 1) + ' did not split cleanly.'); }); files[baseName(file.name) + '-page-' + String(i + 1).padStart(String(n).length, '0') + '.pdf'] = new Uint8Array(await r.blob.arrayBuffer()); } return [{ name: baseName(file.name) + '-pages.zip', blob: new Blob([window.fflate.zipSync(files, { level: 0 })], { type: 'application/zip' }), note: n + ' one-page PDFs in a ZIP' }]; },
    extract: async function (file, t, o) { var d = await pdfDoc(file), idx = parseRange(o.pages, d.getPageCount()), out = await window.PDFLib.PDFDocument.create(); (await out.copyPages(d, idx)).forEach(function (p) { out.addPage(p); }); return [await pdfSave(out, baseName(file.name) + '-pages-' + o.pages.replace(/\s/g, '') + '.pdf', function (a) { if (a.getPageCount() !== idx.length) throw new Error('The page count came out wrong.'); })]; },
    reorder: async function (file, t, o) { var d = await pdfDoc(file), idx = parseRange(o.order, d.getPageCount()), out = await window.PDFLib.PDFDocument.create(); (await out.copyPages(d, idx)).forEach(function (p) { out.addPage(p); }); return [await pdfSave(out, baseName(file.name) + '-reordered.pdf', function (a) { if (a.getPageCount() !== idx.length) throw new Error('The page count came out wrong.'); })]; },
    rotate: async function (file, t, o) { var d = await pdfDoc(file), idx = o.pages ? parseRange(o.pages, d.getPageCount()) : d.getPageIndices(), deg = +o.angle || 90, want = {}; idx.forEach(function (i) { var p = d.getPage(i); var a = (p.getRotation().angle + deg) % 360; p.setRotation(window.PDFLib.degrees(a)); want[i] = a; }); return [await pdfSave(d, baseName(file.name) + '-rotated.pdf', function (a) { Object.keys(want).forEach(function (i) { if (a.getPage(+i).getRotation().angle !== want[i]) throw new Error('Page ' + (+i + 1) + ' did not rotate.'); }); })]; },
    metadata: async function (file, t, o) { var d = await pdfDoc(file); ['Title', 'Author', 'Subject', 'Creator'].forEach(function (k) { var v = o['meta' + k]; if (v != null && v !== '') d['set' + k](v); }); if (o.metaKeywords) d.setKeywords(o.metaKeywords.split(',').map(function (x) { return x.trim(); }).filter(Boolean)); d.setModificationDate(new Date()); return [await pdfSave(d, baseName(file.name) + '-metadata.pdf', function (a) { if (o.metaTitle && a.getTitle() !== o.metaTitle) throw new Error('The title did not stick.'); })]; },
    merge: async function (files) { var out = await window.PDFLib.PDFDocument.create(), total = 0; for (var i = 0; i < files.length; i++) { var d = await pdfDoc(files[i]); total += d.getPageCount(); (await out.copyPages(d, d.getPageIndices())).forEach(function (p) { out.addPage(p); }); } return [await pdfSave(out, 'merged-' + files.length + '-pdfs.pdf', function (a) { if (a.getPageCount() !== total) throw new Error('The merged page count came out wrong.'); })]; },
    fromImages: async function (files) { var out = await window.PDFLib.PDFDocument.create(); for (var i = 0; i < files.length; i++) { var f = files[i], t = await detect(f), img; if (t.kind === 'png') img = await out.embedPng(await f.arrayBuffer()); else if (t.kind === 'jpeg') img = await out.embedJpg(await f.arrayBuffer()); else { var png = (await imgTo('image/png')(f, t, {}))[0].blob; img = await out.embedPng(await png.arrayBuffer()); } var pg = out.addPage([img.width, img.height]); pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }); } return [await pdfSave(out, 'images-' + files.length + '.pdf', function (a) { if (a.getPageCount() !== files.length) throw new Error('One page per picture did not come out.'); })]; }
  };
  function textOut(name, s, mime) { return [{ name: name, blob: new Blob([s], { type: mime || 'text/plain' }) }]; }
  function parseCsv(s, sep) { var rows = [], row = [], cell = '', q = false; for (var i = 0; i < s.length; i++) { var ch = s[i]; if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell || row.length) { row.push(cell); rows.push(row); } var head = rows.shift() || []; return rows.filter(function (r) { return r.length > 1 || r[0]; }).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; }); return o; }); }
  async function rowsOf(file, t) { var s = (await file.text()).replace(/^﻿/, ''); if (t.kind === 'json') { var j = JSON.parse(s); if (!Array.isArray(j)) j = [j]; return j.map(function (r) { return r && typeof r === 'object' ? r : { value: r }; }); } if (t.kind === 'csv') return parseCsv(s, ','); if (t.kind === 'tsv') return parseCsv(s, '\t'); throw new Error('Not a table.'); }
  function dataTo(f) { return async function (file, t) { var rows = await rowsOf(file, t); if (!rows.length) throw new Error('No rows were found.'); return textOut(baseName(file.name) + '.' + f, fmtRows(rows, f, baseName(file.name).replace(/\W/g, '_') || 'rows')); }; }
  function textConv(fn, suffix) { return async function (file) { return textOut(baseName(file.name) + suffix, fn(await file.text())); }; }
  var ADAPTERS = [
    A('pdf-inspect', 'pdf', ['pdf'], 'json', 'Inspect a PDF: pages, sizes, rotation, metadata', '', function (f) { return PDFTOOLS.inspect(f); }),
    A('pdf-split', 'pdf', ['pdf'], 'zip', 'Split a PDF into one file per page', '', function (f) { return PDFTOOLS.split(f); }),
    A('pdf-extract', 'pdf', ['pdf'], 'pdf', 'Extract pages', '', function (f, t, o) { return PDFTOOLS.extract(f, t, o); }, { needs: 'pages' }),
    A('pdf-reorder', 'pdf', ['pdf'], 'pdf', 'Reorder pages', '', function (f, t, o) { return PDFTOOLS.reorder(f, t, o); }, { needs: 'order' }),
    A('pdf-rotate', 'pdf', ['pdf'], 'pdf', 'Rotate pages', '', function (f, t, o) { return PDFTOOLS.rotate(f, t, o); }, { needs: 'rotate' }),
    A('pdf-metadata', 'pdf', ['pdf'], 'pdf', 'Change title, author, subject and keywords', 'The modification date is set to now.', function (f, t, o) { return PDFTOOLS.metadata(f, t, o); }, { needs: 'meta' }),
    A('pdf-merge', 'pdf', ['pdf'], 'pdf', 'Merge every chosen PDF into one, in queue order', '', null, { batch: function (fs2) { return PDFTOOLS.merge(fs2); }, enabled: true }),
    A('img-pdf', 'pdf', IMG, 'pdf', 'Pictures into one PDF, a page each', 'GIF and WebP pictures become PNG pages; animation keeps its first frame.', null, { batch: function (fs2) { return PDFTOOLS.fromImages(fs2); }, enabled: true }),
    off('docx-pdf', 'pdf', ['docx', 'odt'], 'pdf', 'Word or OpenDocument to PDF', 'No document layout engine is bundled with this app.'),
    off('pdf-docx', 'pdf', ['pdf'], 'docx', 'PDF to Word', 'No PDF text-layout reader is bundled with this app.'),
    A('img-png', 'image', IMG, 'png', 'To PNG', 'Animation keeps its first frame. Colour profiles and metadata (EXIF) are not kept.', imgTo('image/png')),
    A('img-jpeg', 'image', IMG, 'jpeg', 'To JPEG (quality 90)', 'JPEG has no transparency: see-through parts become white. It is lossy. Animation keeps its first frame; metadata is not kept.', imgTo('image/jpeg', 0.9)),
    A('img-webp', 'image', IMG, 'webp', 'To WebP (quality 90)', 'Lossy at quality 90. Animation keeps its first frame; metadata is not kept.', imgTo('image/webp', 0.9)),
    off('img-heic', 'image', ['heic', 'avif'], 'png', 'HEIC or AVIF to PNG', 'No HEIC decoder is bundled with this app.'),
    off('img-tiff', 'image', ['tiff'], 'png', 'TIFF to PNG', 'No TIFF decoder is bundled with this app.'),
    off('audio-any', 'audio', ['mp3', 'wav', 'ogg', 'flac'], 'mp3', 'Between MP3, WAV, OGG and FLAC', 'No audio encoder (such as FFmpeg) is bundled with this app.'),
    off('video-any', 'video', ['mp4', 'webm'], 'mp4', 'Between MP4 and WebM', 'No video encoder (such as FFmpeg) is bundled with this app.'),
    A('zip-make', 'archive', ['*'], 'zip', 'Every chosen file into one ZIP', '', null, { batch: async function (fs2) { var files = {}; for (var i = 0; i < fs2.length; i++) { var n = fs2[i].name, k = 1; while (files[n]) n = baseName(fs2[i].name) + ' (' + (k++) + ')' + fs2[i].name.slice(baseName(fs2[i].name).length); files[n] = new Uint8Array(await fs2[i].arrayBuffer()); } var z = window.fflate.zipSync(files); var back = window.fflate.unzipSync(z); if (Object.keys(back).length !== fs2.length) throw new Error('The ZIP did not reopen with every file.'); return [{ name: 'files-' + fs2.length + '.zip', blob: new Blob([z], { type: 'application/zip' }), note: fs2.length + ' files, checked by reopening' }]; }, enabled: true }),
    A('zip-list', 'archive', ['zip'], 'txt', 'List what is inside a ZIP', '', async function (f) { var names = []; window.fflate.unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: function (e) { names.push(e.name + '  ' + fmtSize(e.originalSize)); return false; } }); return textOut(baseName(f.name) + '.contents.txt', names.join('\n') || '(empty)'); }),
    A('zip-extract', 'archive', ['zip'], '*', 'Take every file out of a ZIP', 'Folders inside become part of each file name, joined with " - ".', async function (f) { var u = window.fflate.unzipSync(new Uint8Array(await f.arrayBuffer())); var out = []; Object.keys(u).forEach(function (n) { if (/\/$/.test(n)) return; if (out.length > 5000) throw new Error('More than 5000 files inside.'); out.push({ name: n.replace(/\//g, ' - '), blob: new Blob([u[n]]) }); }); return out; }),
    A('gzip-make', 'archive', ['*'], 'gz', 'Compress with gzip', '', async function (f) { return [{ name: f.name + '.gz', blob: new Blob([window.fflate.gzipSync(new Uint8Array(await f.arrayBuffer()), { filename: f.name })], { type: 'application/gzip' }) }]; }),
    A('gzip-open', 'archive', ['gzip'], '*', 'Uncompress gzip', '', async function (f) { return [{ name: f.name.replace(/\.gz$/i, '') || 'uncompressed.bin', blob: new Blob([window.fflate.gunzipSync(new Uint8Array(await f.arrayBuffer()))]) }]; }),
    off('7z-rar', 'archive', ['7z', 'rar'], '*', 'Open 7z or RAR', 'No 7z or RAR reader is bundled with this app.'),
    A('json-csv', 'data', ['json', 'csv', 'tsv'], 'csv', 'To CSV', 'Nested values are written as JSON text in their cell.', dataTo('csv')),
    A('json-tsv', 'data', ['json', 'csv', 'tsv'], 'tsv', 'To TSV', 'Tabs and line breaks inside values become spaces.', dataTo('tsv')),
    A('any-json', 'data', ['json', 'csv', 'tsv'], 'json', 'To JSON', 'From CSV or TSV, every value becomes text.', dataTo('json')),
    A('any-jsonl', 'data', ['json', 'csv', 'tsv'], 'jsonl', 'To JSON Lines', '', dataTo('jsonl')),
    A('any-yaml', 'data', ['json', 'csv', 'tsv'], 'yaml', 'To YAML', 'Nested values are written as JSON text.', dataTo('yaml')),
    A('any-toml', 'data', ['json', 'csv', 'tsv'], 'toml', 'To TOML', 'Nested values are written as JSON text.', dataTo('toml')),
    A('any-xml', 'data', ['json', 'csv', 'tsv'], 'xml', 'To XML', 'Names are made safe for XML tags.', dataTo('xml')),
    A('any-md', 'data', ['json', 'csv', 'tsv'], 'md', 'To a Markdown table', '', dataTo('md')),
    A('any-html', 'data', ['json', 'csv', 'tsv'], 'html', 'To an HTML table', '', dataTo('html')),
    A('any-sql', 'data', ['json', 'csv', 'tsv'], 'sql', 'To SQL inserts', 'Every column becomes TEXT.', dataTo('sql')),
    off('xlsx', 'data', ['xlsx', 'ods'], 'csv', 'Excel or OpenDocument spreadsheets', 'No spreadsheet reader is bundled with this app.'),
    A('txt-lf', 'text', ['text', 'json', 'csv', 'tsv', 'xml', 'svg'], 'txt', 'Line endings to LF (Linux, macOS)', 'Every CRLF and CR becomes LF.', textConv(function (s) { return s.replace(/\r\n?/g, '\n'); }, '.lf.txt')),
    A('txt-crlf', 'text', ['text', 'json', 'csv', 'tsv', 'xml', 'svg'], 'txt', 'Line endings to CRLF (Windows)', 'Every line ending becomes CRLF.', textConv(function (s) { return s.replace(/\r\n?|\n/g, '\r\n'); }, '.crlf.txt')),
    A('txt-trim', 'text', ['text', 'json', 'csv', 'tsv', 'xml', 'svg'], 'txt', 'Remove spaces at line ends', 'Trailing spaces and tabs are removed.', textConv(function (s) { return s.replace(/[ \t]+$/gm, ''); }, '.trimmed.txt')),
    A('txt-utf16', 'text', ['text', 'json', 'csv', 'tsv', 'xml'], 'txt', 'UTF-8 to UTF-16 LE with a byte order mark', 'The character encoding changes; the text does not.', async function (f) { var s = await f.text(), b = new Uint8Array(2 + s.length * 2); b[0] = 0xff; b[1] = 0xfe; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); b[2 + i * 2] = c & 255; b[3 + i * 2] = c >> 8; } return [{ name: baseName(f.name) + '.utf16.txt', blob: new Blob([b]) }]; }),
    A('json-pretty', 'text', ['json'], 'json', 'Format JSON neatly', 'Spacing changes; numbers past 15 digits may round.', textConv(function (s) { return JSON.stringify(JSON.parse(s), null, 2) + '\n'; }, '.formatted.json')),
    A('bin-b64', 'binary', ['*'], 'txt', 'To Base64 text', '', async function (f) { return textOut(f.name + '.base64.txt', await b64OfBlob(f, {})); }),
    A('b64-bin', 'binary', ['base64', 'dataurl'], '*', 'Base64 text back to the file', '', async function (f) { var s = await f.text(), p = parseDataUrl(s), bytes = p ? p.bytes : b64Decode(s, { lenient: true }); var t = sigOf(bytes); return [{ name: restoredName(f.name, p && p.mime, t), blob: new Blob([bytes]) }]; }),
    A('bin-hex', 'binary', ['*'], 'txt', 'To a hex dump', 'Files over 16 MB are not dumped.', async function (f) { if (f.size > 16 * MB) throw new Error('Over 16 MB.'); return textOut(f.name + '.hex.txt', hexDump(new Uint8Array(await f.arrayBuffer()))); })
  ];
  var conv = { files: [], cat: 'pdf', q: {}, opts: { pages: '1', order: '', angle: '90', metaTitle: '', metaAuthor: '', metaSubject: '', metaKeywords: '' }, running: false, paused: false, cancel: false, dest: '' };
  function adaptersFor(t) { return ADAPTERS.filter(function (a) { return a.from.indexOf('*') >= 0 || (t && a.from.indexOf(t.kind) >= 0); }); }
  R.convert = function () {
    var qd = conv.files.map(function (x) { return x.t; });
    var cats = CATS.map(function (c) {
      var m = matcher(conv.q[c[0]] || ''); var list = ADAPTERS.filter(function (a) { return a.cat === c[0] && m.test(a.name + ' ' + a.from.join(' ') + ' ' + a.to + ' ' + (a.why || '')); });
      return '<section class="section" id="cv-' + c[0] + '" data-k="cv-' + c[0] + '"><h2 class="tl">' + c[1] + ' <span class="bs mu">' + ADAPTERS.filter(function (a) { return a.cat === c[0] && a.enabled; }).length + ' available</span></h2>' + findField('cvq-' + c[0], 'Search ' + c[1].toLowerCase(), conv.q[c[0]] || '') + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
        '<div class="col" style="gap:4px">' + (list.length ? list.map(function (a) { var fits = conv.files.length && (a.batch || conv.files.some(function (x) { return a.from.indexOf('*') >= 0 || a.from.indexOf(x.t.kind) >= 0; })); return '<div class="row-item" data-k="ad-' + a.id + '"><span class="col grow"><span class="ll">' + esc(a.name) + (a.enabled ? '' : ' <span class="tag">Not available</span>') + '</span><span class="bs mu">' + esc(a.from.join(', ').replace('*', 'any file')) + ' → ' + esc(a.to === '*' ? 'the original files' : a.to) + (a.enabled ? (a.lossy ? ' · Changes: ' + esc(a.lossy) : ' · Nothing is lost.') : ' · ' + esc(a.why)) + '</span></span>' + (a.enabled ? '<button class="btn ' + (fits ? 'tonal' : 'text') + ' sm" data-adapter="' + a.id + '"' + (fits && !conv.running ? '' : ' disabled') + '>' + (a.batch ? 'Run on the queue' : 'Convert') + '</button>' : '') + '</div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div></section>';
    }).join('');
    var counts = { done: 0, failed: 0, skipped: 0, cancelled: 0 }; conv.files.forEach(function (x) { if (counts[x.state] != null) counts[x.state]++; });
    var queue = '<section class="section card" id="queue" data-k="cvqueue" style="padding:20px"><div class="row" style="gap:8px;flex-wrap:wrap"><h2 class="tl grow">Files <span class="bs mu">' + conv.files.length + '</span></h2><label class="btn fill sm">' + icon('FilePlusOutline', 's') + 'Add files<input type="file" id="cvfiles" multiple hidden></label>' + (conv.files.length ? '<button class="btn text sm" data-act="cvclear"' + (conv.running ? ' disabled' : '') + '>' + L('clear') + '</button>' : '') + '</div>' +
      (conv.files.length ? '<p class="bs mu" aria-live="polite">' + counts.done + ' converted · ' + counts.failed + ' failed · ' + counts.skipped + ' skipped · ' + counts.cancelled + ' cancelled</p>' + (conv.running ? '<div class="row" style="gap:8px"><button class="btn tonal sm" data-act="cvpause">' + (conv.paused ? 'Resume' : 'Pause') + '</button><button class="btn text sm" data-act="cvcancel">' + L('cancel') + '</button></div>' : '') +
        '<div class="col" style="gap:2px;max-height:280px;overflow:auto">' + conv.files.slice(0, 500).map(function (x, i) { return '<div class="row-item" data-k="cvf-' + i + '"><span class="col grow" style="min-width:0"><span class="ll ell">' + esc(x.file.name) + '</span><span class="bs mu">' + esc(x.t.kind.toUpperCase()) + ' by its bytes · ' + fmtSize(x.file.size) + (x.msg ? ' · ' + esc(x.msg) : '') + '</span></span><span class="tag ' + (x.state === 'done' ? 'g' : x.state === 'failed' ? 'a' : x.state === 'working' ? 'p' : '') + '">' + esc(x.state) + '</span>' + (x.out ? x.out.map(function (o, j) { return '<button class="btn text sm" data-cvsave="' + i + ':' + j + '">' + icon('Download', 's') + esc(o.name) + '</button>'; }).join('') : '') + '</div>'; }).join('') + (conv.files.length > 500 ? '<p class="bs mu">And ' + (conv.files.length - 500) + ' more.</p>' : '') + '</div>'
        : '<div class="empty" style="padding:24px"><p class="bm mu">Add or drop files here. Their type is read from their first bytes, then only the conversions that fit light up below.</p></div>') +
      '<details class="fold"><summary class="ll">' + icon('Tune', 's') + 'Options for pages, rotation and metadata</summary><div class="plan" style="padding-top:8px"><label><span class="ll">Pages to extract</span><input class="input" data-cvopt="pages" value="' + esc(conv.opts.pages) + '" placeholder="1-3, 7"></label><label><span class="ll">New order</span><input class="input" data-cvopt="order" value="' + esc(conv.opts.order) + '" placeholder="3, 1, 2"></label><label><span class="ll">Rotate by</span><select class="select" data-cvopt="angle">' + ['90', '180', '270'].map(function (a) { return '<option' + (conv.opts.angle === a ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></label>' + ['Title', 'Author', 'Subject', 'Keywords'].map(function (k) { return '<label><span class="ll">' + k + '</span><input class="input" data-cvopt="meta' + k + '" value="' + esc(conv.opts['meta' + k]) + '"></label>'; }).join('') + '</div></details>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><span class="bs mu grow">' + (DEMO ? 'Results download.' : conv.dest ? 'Results go to ' + esc(conv.dest) + '.' : 'Results are saved beside each source file, never over an existing one.') + '</span>' + (DEMO ? '' : '<button class="btn text sm" data-act="cvdest">' + icon('FolderOpen', 's') + (conv.dest ? 'Change the folder' : 'Choose a folder instead') + '</button>') + '</div></section>';
    var hist = (st.convHistory || []).slice(0, 30);
    return pageHead('SwapHorizontalBold', 'Convert', 'Files are read and converted on this computer by libraries inside the app. Formats it cannot convert are listed too, with the reason.', [[ADAPTERS.filter(function (a2) { return a2.enabled; }).length, 'Conversions'], [ADAPTERS.filter(function (a2) { return !a2.enabled; }).length, 'Not available'], [conv.files.length, 'Files queued'], [(st.convHistory || []).length, 'Done before']]) + queue + cats +
      '<section class="section" id="cvhist" data-k="cvhist"><div class="row"><h2 class="tl grow">History</h2>' + (hist.length ? '<button class="btn text sm" data-act="cvhistexport">' + icon('Export', 's') + L('export') + '</button><button class="btn text sm" data-act="cvhistclear">' + L('clear') + '</button>' : '') + '</div>' + (hist.length ? hist.map(function (h) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(h.source) + ' → ' + esc(h.result) + '</span><span class="bs mu">' + esc(when(h.at)) + ' · ' + esc(h.adapter) + ' · ' + fmtSize(h.size) + ' · SHA-256 ' + esc(h.sha.slice(0, 16)) + '…</span></span></div>'; }).join('') : '<p class="bm mu">Nothing converted yet.</p>') + '</section>' + foot();
  };
  async function cvAdd(list) { for (var i = 0; i < list.length; i++) { var f = list[i]; if (f.size > 500 * MB) { toast(f.name + ' is over 500 MB and was skipped.'); continue; } conv.files.push({ file: f, t: await detect(f), state: 'waiting' }); } render(); }
  async function cvDeliver(x, o) {
    var bytes = new Uint8Array(await o.blob.arrayBuffer());
    if (DEMO || !API.writeBeside) { var a = document.createElement('a'); a.href = URL.createObjectURL(o.blob); a.download = o.name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); return o.name; }
    return conv.dest ? API.writeInto(conv.dest, o.name, bytes) : API.writeBeside(x.file, o.name, bytes);
  }
  function cvRecord(x, a, o, sha) { st.convHistory = [{ at: new Date().toISOString(), source: x ? x.file.name : 'the queue', result: o.name, adapter: a.name, size: o.blob.size, sha: sha }].concat(st.convHistory || []).slice(0, 200); save(); }
  async function cvRun(id) {
    var a = ADAPTERS.filter(function (z) { return z.id === id; })[0]; if (!a || !a.enabled) return;
    var go2 = async function () {
      conv.running = true; conv.cancel = false; render();
      if (a.batch) {
        var fit = conv.files.filter(function (x) { return a.from.indexOf('*') >= 0 || a.from.indexOf(x.t.kind) >= 0; });
        conv.files.forEach(function (x) { if (fit.indexOf(x) < 0) { x.state = 'skipped'; x.msg = 'Not a fit for ' + a.name; } else { x.state = 'working'; x.msg = ''; } }); render();
        try { var outs = await a.batch(fit.map(function (x) { return x.file; })); for (var j = 0; j < outs.length; j++) { var where = await cvDeliver(fit[0], outs[j]); cvRecord(null, a, outs[j], await sha256(await outs[j].blob.arrayBuffer())); toast('Saved ' + outs[j].name + (outs[j].note ? ' (' + outs[j].note + ')' : '') + '.'); if (!DEMO) cvShow(where); } fit.forEach(function (x) { x.state = 'done'; x.msg = 'In ' + outs[0].name; }); finishedOne(); }
        catch (e) { fit.forEach(function (x) { x.state = 'failed'; x.msg = e.message; }); toast(a.name + ': ' + e.message); }
      } else {
        var pending = conv.files.filter(function (x) { return x.state !== 'done' || x.adapter !== a.id; }), i = 0;
        var worker = async function () {
          while (i < pending.length) {
            var x = pending[i++];
            if (conv.cancel) { x.state = 'cancelled'; continue; }
            while (conv.paused && !conv.cancel) await new Promise(function (r) { setTimeout(r, 300); });
            if (a.from.indexOf('*') < 0 && a.from.indexOf(x.t.kind) < 0) { x.state = 'skipped'; x.msg = 'Its bytes say ' + x.t.kind.toUpperCase() + ', which this does not take'; continue; }
            x.state = 'working'; x.msg = ''; soon();
            try { var outs = await a.run(x.file, x.t, conv.opts); x.out = []; for (var j = 0; j < outs.length; j++) { var p2 = await cvDeliver(x, outs[j]); outs[j].path = p2; x.out.push(outs[j]); cvRecord(x, a, outs[j], await sha256(await outs[j].blob.arrayBuffer())); } x.state = 'done'; x.adapter = a.id; x.msg = outs.length + ' file' + (outs.length > 1 ? 's' : '') + (outs[0] && outs[0].note ? ', ' + outs[0].note : ''); }
            catch (e) { x.state = 'failed'; x.msg = e.message; }
            soon();
          }
        };
        await Promise.all([worker(), worker()]);
        var nd = conv.files.filter(function (x) { return x.state === 'done'; }).length; toast(nd + ' converted. Each result was written whole or not at all.'); if (nd) finishedOne();
      }
      conv.running = false; conv.paused = false; render();
    };
    if (a.lossy) { dialog(a.name, '<p class="bm">Before it runs, what can change:</p><div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">' + esc(a.lossy) + '</span></div><p class="bs mu">The source files stay as they are. Results never replace an existing file.</p><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="cvok">Convert</button></div>', { emoji: '🔁' }); $('#cvok').onclick = function () { closeDialog(); go2(); }; }
    else go2();
  }
  function cvShow(p) { if (p && API.showFile) toast(p, { emoji: '📁' }); }

  // ---------- Base64 toolkit ----------
  var B64A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64Encode(bytes, o) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) { var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; out += B64A[n >> 18 & 63] + B64A[n >> 12 & 63] + B64A[n >> 6 & 63] + B64A[n & 63]; }
    var r = bytes.length - i; if (r === 1) { var a = bytes[i] << 16; out += B64A[a >> 18 & 63] + B64A[a >> 12 & 63] + '=='; } else if (r === 2) { var b = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64A[b >> 18 & 63] + B64A[b >> 12 & 63] + B64A[b >> 6 & 63] + '='; }
    if (o.url) out = out.replace(/\+/g, '-').replace(/\//g, '_'); if (o.pad === false) out = out.replace(/=+$/, '');
    var wrap = o.mime ? 76 : +o.wrap || 0; if (wrap) out = out.match(new RegExp('.{1,' + wrap + '}', 'g')).join('\r\n');
    return out;
  }
  function b64Decode(s, o) {
    o = o || {}; var src = String(s), clean = '', url = o.url;
    for (var k = 0; k < src.length; k++) { var ch = src[k]; if (/\s/.test(ch)) { if (o.strict && !(o.mime && (ch === '\r' || ch === '\n'))) throw new Error('A space or line break at offset ' + k + ' is not allowed in strict mode.'); continue; } clean += ch; }
    if (!o.strict) { clean = clean.replace(/-/g, '+').replace(/_/g, '/'); }
    else if (url) { var bad = /[+/]/.exec(clean); if (bad) throw new Error('"' + bad[0] + '" at offset ' + bad.index + ' is not in the URL-safe alphabet.'); clean = clean.replace(/-/g, '+').replace(/_/g, '/'); }
    var m = /[^A-Za-z0-9+/=]/.exec(clean); if (m) throw new Error('"' + m[0] + '" at offset ' + m.index + ' is not Base64.');
    var eq = clean.indexOf('='); if (eq >= 0 && /[^=]/.test(clean.slice(eq))) throw new Error('Padding "=" at offset ' + eq + ' is followed by more characters.');
    if (clean.length % 4) { if (o.strict && o.pad !== false) throw new Error('The length is not a multiple of 4: padding is missing.'); if (clean.length % 4 === 1) throw new Error('The text ends with one stray character.'); clean += '===='.slice(clean.length % 4); }
    var bin = atob(clean), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  }
  function encText(s, enc) { if (enc === 'utf-8') return new TextEncoder().encode(s); var b = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (enc === 'latin1') { if (c > 255) throw new Error('"' + s[i] + '" at position ' + i + ' does not exist in Latin-1.'); b.push(c); } else if (enc === 'utf-16le') b.push(c & 255, c >> 8); else b.push(c >> 8, c & 255); } return new Uint8Array(b); }
  function decText(b, enc) { return new TextDecoder(enc === 'latin1' ? 'iso-8859-1' : enc, { fatal: true }).decode(b); }
  async function b64OfBlob(blob, o, progress) { var parts = [], CH = 3 * MB; for (var i = 0; i < blob.size; i += CH) { if (o.cancel && o.cancel()) throw new Error('Cancelled.'); parts.push(b64Encode(await readBytes(blob, i, i + CH), { url: o.url, pad: true })); if (progress) progress(Math.min(1, (i + CH) / blob.size)); } var out = parts.join(''); if (o.pad === false) out = out.replace(/=+$/, ''); var wrap = o.mime ? 76 : +o.wrap || 0; if (wrap && out) out = out.match(new RegExp('.{1,' + wrap + '}', 'g')).join('\r\n'); return out; }
  function parseDataUrl(s) { var m = /^\s*data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*)(;base64)?,(.*)$/s.exec(s); if (!m) return null; var params = {}; (m[2] || '').split(';').filter(Boolean).forEach(function (p) { var kv = p.split('='); params[kv[0]] = kv[1]; }); return { mime: m[1] || 'text/plain', params: params, base64: !!m[3], bytes: m[3] ? b64Decode(m[4], { lenient: true }) : new TextEncoder().encode(decodeURIComponent(m[4])) }; }
  function sigOf(b) { var h = hex(b, 16); for (var i = 0; i < SIGS.length; i++) { var s = SIGS[i]; if (typeof s[2] === 'string' ? h.indexOf(s[2]) === 0 : s[2].test(h)) return { kind: s[0], mime: s[1] }; } try { new TextDecoder('utf-8', { fatal: true }).decode(b.slice(0, 4096)); return { kind: 'txt', mime: 'text/plain' }; } catch (e) { return { kind: 'bin', mime: 'application/octet-stream' }; } }
  function restoredName(name, mime, t) { var m = /^(.*)\.base64\.txt$/i.exec(name) || /^(.*)\.b64$/i.exec(name); if (m && /\.[\w]{1,8}$/.test(m[1])) return m[1]; var ext = mime && { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/plain': 'txt', 'application/json': 'json', 'application/zip': 'zip' }[mime]; return (m ? m[1] : baseName(name)) + '.' + (ext || (t && t.kind !== 'bin' ? (t.kind === 'jpeg' ? 'jpg' : t.kind) : 'bin')); }
  function hexDump(b) { var lines = []; for (var i = 0; i < b.length; i += 16) { var row = b.slice(i, i + 16); lines.push(('0000000' + i.toString(16)).slice(-8) + '  ' + hex(row).replace(/(..)/g, '$1 ').padEnd(48) + ' ' + Array.prototype.map.call(row, function (c) { return c >= 32 && c < 127 ? String.fromCharCode(c) : '.'; }).join('')); } return lines.join('\n'); }
  var b64 = { o: { url: false, pad: true, mime: false, wrap: '', strict: false, enc: 'utf-8' }, input: '', output: '', note: '', undo: [], redo: [], preview: null, files: [] };
  function b64Push() { b64.undo.push({ input: b64.input, output: b64.output }); b64.redo = []; }
  R.base64 = function () {
    var o = b64.o, inB = 0, outB = 0; try { inB = encText(b64.input, o.enc).length; } catch (e) { inB = '?'; } outB = new TextEncoder().encode(b64.output).length;
    var chip = function (k, label) { return '<button class="chip' + (o[k] ? ' sel' : '') + '" aria-pressed="' + !!o[k] + '" data-b64o="' + k + '">' + label + '</button>'; };
    return pageHead('CodeBraces', 'Base64', 'Encode and decode text and files on this computer. Nothing is uploaded.', [[o.url ? 'URL-safe' : 'Standard', 'Alphabet'], [o.mime ? '76, CRLF' : o.wrap ? o.wrap : 'None', 'Line length'], [o.strict ? 'Strict' : 'Lenient', 'Decoding'], [o.enc.toUpperCase(), 'Text encoding']]) +
      '<section class="section card" id="b64opts" data-k="b64opts" style="padding:20px"><h2 class="tl">Options</h2><div class="chipline">' + chip('url', 'URL-safe (RFC 4648 §5)') + chip('pad', 'Padding') + chip('mime', 'MIME lines (76, CRLF)') + chip('strict', 'Strict decoding') + '<label class="row bs" style="gap:6px">Line length <input class="input" style="width:90px" type="number" min="0" max="1000" data-b64wrap value="' + esc(o.wrap) + '" aria-label="Custom line length, 0 for none"' + (o.mime ? ' disabled' : '') + '></label><label class="row bs" style="gap:6px">Text encoding <select class="select" data-b64enc aria-label="Text encoding">' + [['utf-8', 'UTF-8'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE'], ['latin1', 'Latin-1']].map(function (e) { return '<option value="' + e[0] + '"' + (o.enc === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join('') + '</select></label></div></section>' +
      '<section class="section" id="b64text" data-k="b64text"><h2 class="tl">Text</h2><div class="grid2"><label class="col" style="gap:4px"><span class="ll">Input <span class="bs mu">' + inB + ' bytes</span></span><textarea class="input" id="b64i" rows="7" aria-label="Base64 input">' + esc(b64.input) + '</textarea></label><label class="col" style="gap:4px"><span class="ll">Output <span class="bs mu">' + outB + ' bytes</span></span><textarea class="input mono" id="b64o" rows="7" readonly aria-label="Base64 output">' + esc(b64.output) + '</textarea></label></div>' +
      '<div class="chipline"><button class="btn fill sm" data-act="b64e">Encode</button><button class="btn tonal sm" data-act="b64d">Decode</button><button class="btn text sm" data-act="b64swap">' + icon('SwapHorizontal', 's') + 'Swap</button><button class="btn text sm" data-act="b64url">Make a data: URL</button><button class="btn text sm" data-act="b64parse">Read a data: URL</button><button class="btn text sm" data-act="b64paste">' + icon('ContentPaste', 's') + 'Paste</button><button class="btn text sm" data-copy="' + esc(b64.output) + '"' + (b64.output ? '' : ' disabled') + '>' + icon('ContentCopy', 's') + L('copy') + '</button><button class="btn text sm" data-act="b64undo"' + (b64.undo.length ? '' : ' disabled') + '>Undo</button><button class="btn text sm" data-act="b64redo"' + (b64.redo.length ? '' : ' disabled') + '>Redo</button><button class="btn text sm" data-act="b64record"' + (b64.output ? '' : ' disabled') + '>Save a record (JSON)</button></div><p class="bs" id="b64note" role="status" aria-live="polite">' + esc(b64.note) + '</p>' +
      (b64.preview ? '<div class="card" style="padding:12px" data-k="b64prev"><span class="ll">Preview: ' + esc(b64.preview.kind) + ', ' + b64.preview.size + ' bytes</span>' + b64.preview.html + '</div>' : '') + '</section>' +
      '<section class="section" id="b64files" data-k="b64files"><h2 class="tl">Files</h2><p class="bm mu">' + (DEMO ? 'Results download as report.pdf.base64.txt, or with the original name restored.' : 'Encoding writes report.pdf.base64.txt beside report.pdf; decoding restores the original name beside the .txt. Nothing is ever overwritten; each result is checked by decoding it again and comparing SHA-256.') + '</p><div class="grid2"><label class="b64drop" data-b64drop="enc" tabindex="0">' + icon('FileUploadOutline') + '<span class="ll">Encode</span><span class="bs mu">Drop files or choose</span><input type="file" multiple hidden data-b64file="enc"></label><label class="b64drop" data-b64drop="dec" tabindex="0">' + icon('FileDownloadOutline') + '<span class="ll">Decode</span><span class="bs mu">Drop .base64.txt or .b64 files, or choose</span><input type="file" multiple hidden data-b64file="dec"></label></div>' +
      (b64.files.length ? '<div class="col" style="gap:2px">' + b64.files.slice(-50).reverse().map(function (f) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(f.name) + ' → ' + esc(f.result || '…') + '</span><span class="bs mu">' + esc(f.msg) + '</span></span>' + (f.fraction != null && f.fraction < 1 && !f.done ? '<span class="pbar" role="progressbar" aria-valuenow="' + Math.round(f.fraction * 100) + '" aria-valuemin="0" aria-valuemax="100" style="width:120px"><i style="width:' + Math.round(f.fraction * 100) + '%"></i></span>' : '<span class="tag ' + (f.ok ? 'g' : f.done ? 'a' : '') + '">' + (f.ok ? 'Verified' : f.done ? 'Failed' : 'Working') + '</span>') + '</div>'; }).join('') + '</div><div class="row" style="gap:8px"><button class="btn text sm" data-act="b64zip">' + icon('FolderZipOutline', 's') + 'Export the results as a ZIP record</button><button class="btn text sm" data-act="b64fclear">' + L('clear') + '</button></div>' : '') + '</section>' + foot();
  };
  function b64Note(t) { b64.note = t; var n = $('#b64note'); if (n) n.textContent = t; }
  function b64Preview(bytes) {
    var t = sigOf(bytes), html = '';
    if (/^(png|jpeg|gif|webp|bmp)$/.test(t.kind)) { var url = URL.createObjectURL(new Blob([bytes], { type: t.mime })); html = '<img src="' + url + '" alt="The decoded picture" style="max-width:100%;max-height:240px;display:block;margin-top:8px;border-radius:12px">'; }
    else if (t.kind === 'txt') html = '<pre class="wb-test" style="max-height:200px;overflow:auto">' + esc(new TextDecoder().decode(bytes.slice(0, 8192))) + (bytes.length > 8192 ? '\n…' : '') + '</pre>';
    else html = '<pre class="wb-test" style="max-height:200px;overflow:auto">' + esc(hexDump(bytes.slice(0, 1024))) + (bytes.length > 1024 ? '\n…' : '') + '</pre>';
    b64.preview = { kind: t.kind.toUpperCase(), size: bytes.length, html: html };
  }
  async function b64File(file, mode) {
    var rec = { name: file.name, msg: 'Starting', fraction: 0 }; b64.files.push(rec); render();
    try {
      var out, outName;
      if (mode === 'enc') {
        if (file.size > 1024 * MB) throw new Error('Over 1 GB.');
        var text = await b64OfBlob(file, Object.assign({}, b64.o), function (f) { rec.fraction = f; rec.msg = Math.round(f * 100) + '%'; soon(); });
        out = new TextEncoder().encode(text); outName = file.name + '.base64.txt';
        var back = b64Decode(text, { lenient: true }); if (await sha256(back) !== await sha256(await file.arrayBuffer())) throw new Error('Decoding the result again did not give the same bytes.');
      } else {
        var s = await file.text(), p = parseDataUrl(s); var bytes = p ? p.bytes : b64Decode(s, Object.assign({}, b64.o));
        var t = sigOf(bytes); outName = restoredName(file.name, p && p.mime, t); out = bytes;
        var re = b64Encode(bytes, { url: false, pad: true }); if (await sha256(b64Decode(re, {})) !== await sha256(bytes)) throw new Error('The round trip did not match.');
      }
      rec.result = await cvDeliver({ file: file }, { name: outName, blob: new Blob([out]) });
      rec.ok = true; rec.done = true; rec.sha = await sha256(out); rec.size = out.length; rec.msg = fmtSize(out.length) + ' · SHA-256 ' + rec.sha.slice(0, 16) + '… matches after a round trip';
      st.convHistory = [{ at: new Date().toISOString(), source: file.name, result: outName, adapter: mode === 'enc' ? 'Base64 encode' : 'Base64 decode', size: out.length, sha: rec.sha }].concat(st.convHistory || []).slice(0, 200); save();
    } catch (e) { rec.done = true; rec.msg = e.message; }
    rec.fraction = 1; render();
  }

  // ---------- QR codes: make one from any text, and show an authenticator code's QR ----------
  function qrSvg(text, size) {
    if (!window.qrcode) throw new Error('The QR maker did not load.');
    var q = window.qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(text)), 'Byte'); q.make();
    var n = q.getModuleCount(), cell = Math.max(2, Math.floor((size || 240) / (n + 8))), dim = (n + 8) * cell, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + ((c + 4) * cell) + ' ' + ((r + 4) * cell) + 'h' + cell + 'v' + cell + 'h-' + cell + 'z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + dim + '" height="' + dim + '" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  function qrShow(title, text) {
    var svg; try { svg = qrSvg(text, 280); } catch (e) { toast(e.message); return; }
    dialog(title, '<div style="display:grid;place-items:center">' + svg + '</div><p class="bs mu" style="word-break:break-all">' + esc(text.length > 160 ? text.slice(0, 160) + '…' : text) + '</p><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" id="qrsvg">Save as SVG</button><button class="btn tonal" id="qrpng">Save as PNG</button><button class="btn fill" data-act="dlg-close">' + L('done') + '</button></div>', { emoji: '🔳' });
    $('#qrsvg').onclick = function () { saveText('qr-code.svg', svg); };
    $('#qrpng').onclick = function () { var img = new Image(); img.onload = function () { var c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'qr-code.png'; a.click(); }); }; img.src = 'data:image/svg+xml;base64,' + btoa(svg); };
  }

  // ---------- ZIP of an export in every format ----------
  function zipAll(name, rows) {
    var files = {}; FORMATS.forEach(function (f) { files[name + '.' + f] = new TextEncoder().encode(fmtRows(rows, f, name)); });
    var z = window.fflate.zipSync(files); var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([z], { type: 'application/zip' })); a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.zip'; a.click(); toast('Saved a ZIP with ' + FORMATS.length + ' formats.');
  }

  // ---------- Drawing (Drawesome-style): seven pens, an area eraser, SVG and PNG export ----------
  var PENS = [['pencil', 'Pencil', 'P', 2, 0.9, 'speed'], ['pen', 'Pen', 'N', 3, 1, 'speed'], ['fineliner', 'Fineliner', 'F', 2, 1, 'const'], ['marker', 'Marker', 'M', 8, 1, 'const'], ['highlighter', 'Highlighter', 'H', 18, 0.35, 'const'], ['brush', 'Brush', 'B', 10, 1, 'speed'], ['fountain', 'Fountain Pen', 'O', 5, 1, 'angle']];
  var INKS = ['#1c1b1f', '#00639b', '#b3261e', '#2e7d32', '#e8a600', '#7b1fa2', '#ffffff'];
  var dr = { strokes: null, undo: [], redo: [], tool: 'pen', color: '#1c1b1f', size: 1, mode: 'tools', bg: null, cur: null };
  function drLoad() { if (dr.strokes) return; try { dr.strokes = JSON.parse(localStorage.getItem('ham-draw-v1') || '[]'); } catch (e) { dr.strokes = []; } }
  function drSave() { try { localStorage.setItem('ham-draw-v1', JSON.stringify(dr.strokes.slice(-2000))); } catch (e) { toast('The drawing is too large to keep; export it to save it.'); } }
  function drSnap() { dr.undo.push(JSON.stringify(dr.strokes)); if (dr.undo.length > 200) dr.undo.shift(); dr.redo = []; }
  // Each point gets a width from the pen's character: faster strokes thin, the fountain pen follows direction.
  function drWidth(pen, p, prev, size) { var base = pen[3] * size; if (!prev) return base; if (pen[5] === 'speed') { var v = Math.hypot(p[0] - prev[0], p[1] - prev[1]) / Math.max(1, p[2] - prev[2]); return Math.max(base * 0.35, base * (1.3 - Math.min(1, v / 2.5))); } if (pen[5] === 'angle') { var a = Math.atan2(p[1] - prev[1], p[0] - prev[0]); return base * (0.35 + 0.9 * Math.abs(Math.sin(a - Math.PI / 4))); } return base; }
  function drPath(s) { var pen = PENS.filter(function (x) { return x[0] === s.tool; })[0] || PENS[1], out = []; for (var i = 1; i < s.pts.length; i++) out.push({ a: s.pts[i - 1], b: s.pts[i], w: drWidth(pen, s.pts[i], s.pts[i - 1], s.size) }); return { pen: pen, segs: out }; }
  function drPaint() {
    var c = $('#drawc'); if (!c) return; var dpr = devicePixelRatio || 1, W2 = c.clientWidth, H = c.clientHeight; c.width = W2 * dpr; c.height = H * dpr; var x = c.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, W2, H);
    if (dr.bg) x.drawImage(dr.bg, 0, 0, Math.min(W2, dr.bg.width), Math.min(H, dr.bg.height * Math.min(W2, dr.bg.width) / dr.bg.width));
    dr.strokes.concat(dr.cur ? [dr.cur] : []).forEach(function (s) { var p = drPath(s); x.globalAlpha = p.pen[4]; x.strokeStyle = s.color; x.lineCap = p.pen[0] === 'highlighter' || p.pen[0] === 'marker' ? 'square' : 'round'; x.lineJoin = 'round'; if (s.pts.length === 1) { x.fillStyle = s.color; x.beginPath(); x.arc(s.pts[0][0], s.pts[0][1], p.pen[3] * s.size / 2, 0, 7); x.fill(); } if (p.pen[5] === 'const' && p.segs.length) { x.lineWidth = p.segs[0].w; x.beginPath(); x.moveTo(s.pts[0][0], s.pts[0][1]); s.pts.slice(1).forEach(function (q2) { x.lineTo(q2[0], q2[1]); }); x.stroke(); } else p.segs.forEach(function (g) { x.lineWidth = g.w; x.beginPath(); x.moveTo(g.a[0], g.a[1]); x.lineTo(g.b[0], g.b[1]); x.stroke(); }); });
    x.globalAlpha = 1;
  }
  function drSvg() { var c = $('#drawc'), W2 = c ? c.clientWidth : 1000, H = c ? c.clientHeight : 700; return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W2 + '" height="' + H + '" viewBox="0 0 ' + W2 + ' ' + H + '">' + dr.strokes.map(function (s) { var p = drPath(s); if (s.pts.length === 1) return '<circle cx="' + s.pts[0][0] + '" cy="' + s.pts[0][1] + '" r="' + p.pen[3] * s.size / 2 + '" fill="' + s.color + '" opacity="' + p.pen[4] + '"/>'; if (p.pen[5] === 'const') return '<polyline points="' + s.pts.map(function (q2) { return q2[0].toFixed(1) + ',' + q2[1].toFixed(1); }).join(' ') + '" stroke="' + s.color + '" stroke-width="' + (p.segs[0] ? p.segs[0].w : 2) + '" opacity="' + p.pen[4] + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; return '<g stroke="' + s.color + '" opacity="' + p.pen[4] + '" stroke-linecap="round" fill="none">' + p.segs.map(function (g) { return '<line x1="' + g.a[0].toFixed(1) + '" y1="' + g.a[1].toFixed(1) + '" x2="' + g.b[0].toFixed(1) + '" y2="' + g.b[1].toFixed(1) + '" stroke-width="' + g.w.toFixed(2) + '"/>'; }).join('') + '</g>'; }).join('') + '</svg>'; }
  // The eraser removes only the points it covers, splitting a stroke in two where needed.
  function drErase(px, py, r) { var changed = false, out = []; dr.strokes.forEach(function (s) { var run = []; s.pts.forEach(function (p) { if (Math.hypot(p[0] - px, p[1] - py) <= r) { changed = true; if (run.length) out.push(Object.assign({}, s, { pts: run })); run = []; } else run.push(p); }); if (run.length) out.push(Object.assign({}, s, { pts: run })); }); if (changed) dr.strokes = out; return changed; }
  R.draw = function () {
    drLoad(); var pen = PENS.filter(function (x) { return x[0] === dr.tool; })[0];
    var bar = dr.mode === 'min' ? '<button class="drawdisc" data-drmode="tools" aria-label="Open the drawing toolbar. Active: ' + (pen ? pen[1] : 'Eraser') + '"><span style="background:' + dr.color + '"></span>' + icon(dr.tool === 'eraser' ? 'Eraser' : 'Draw', 's') + '</button>' :
      '<div class="drawbar" role="toolbar" aria-label="Drawing tools" data-k="drawbar">' + (dr.mode === 'colors' ? INKS.map(function (c) { return '<button class="ink' + (c === dr.color ? ' sel' : '') + '" data-drink="' + c + '" aria-label="Ink ' + c + '" aria-pressed="' + (c === dr.color) + '" style="background:' + c + '"></button>'; }).join('') + '<input type="color" data-drinkc value="' + dr.color + '" aria-label="Any ink colour">' :
        dr.mode === 'size' ? '<label class="row bs" style="gap:8px">Size <input type="range" min="0.25" max="4" step="0.25" value="' + dr.size + '" data-drsize aria-label="Pen size"> ' + dr.size + '×</label>' :
        PENS.map(function (p) { return '<button class="ib' + (dr.tool === p[0] ? ' sel' : '') + '" data-drtool="' + p[0] + '" aria-pressed="' + (dr.tool === p[0]) + '" title="' + p[1] + ' (' + p[2] + ')" aria-label="' + p[1] + ', shortcut ' + p[2] + '"><span class="penmark" style="height:' + Math.min(14, p[3]) + 'px;opacity:' + p[4] + ';background:' + dr.color + '"></span></button>'; }).join('') + '<button class="ib' + (dr.tool === 'eraser' ? ' sel' : '') + '" data-drtool="eraser" aria-pressed="' + (dr.tool === 'eraser') + '" title="Eraser (E)" aria-label="Eraser, shortcut E">' + icon('Eraser', 's') + '</button>') +
        '<span class="drsep"></span><button class="ib" data-drmode="' + (dr.mode === 'colors' ? 'tools' : 'colors') + '" aria-label="Colours" title="Colours (C)"><span class="inkdot" style="background:' + dr.color + '"></span></button><button class="ib" data-drmode="' + (dr.mode === 'size' ? 'tools' : 'size') + '" aria-label="Size" title="Size (S)">' + icon('FormatLineWeight', 's') + '</button><button class="ib" data-act="drundo" aria-label="Undo" title="Undo (Ctrl Z)"' + (dr.undo.length ? '' : ' disabled') + '>' + icon('Undo', 's') + '</button><button class="ib" data-act="drredo" aria-label="Redo" title="Redo (Ctrl Y)"' + (dr.redo.length ? '' : ' disabled') + '>' + icon('Redo', 's') + '</button><button class="ib" data-drmode="min" aria-label="Make the toolbar small" title="Minimise">' + icon('ChevronDown', 's') + '</button></div>';
    return pageHead('Draw', 'Draw', 'Seven pens, an eraser that takes only what it touches, and SVG or PNG out. Strokes stay on this computer.', [[dr.strokes.length, 'Strokes'], [(PENS.filter(function (p2) { return p2[0] === dr.tool; })[0] || ['', 'Eraser'])[1], 'Tool'], [dr.size + '×', 'Size']]) + '<div class="section"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="grow"></span><label class="btn text sm">' + icon('ImageOutline', 's') + 'Draw on a picture<input type="file" accept="image/*" hidden id="drbg"></label><button class="btn text sm" data-act="drsvg">SVG</button><button class="btn text sm" data-act="drpng1">PNG 1×</button><button class="btn text sm" data-act="drpng2">2×</button><button class="btn text sm" data-act="drpng3">3×</button><button class="btn text sm" data-act="drclear"' + (dr.strokes.length ? '' : ' disabled') + '>' + L('clear') + '</button></div><p class="bs mu">Shift keeps a stroke to one of eight directions. Your strokes stay on this computer and come back next time. ' + dr.strokes.length + ' strokes.</p></div>' +
      '<div class="drawwrap" data-k="drawwrap"><canvas id="drawc" tabindex="0" aria-label="Drawing surface. Use the pens with a mouse, pen or finger; keys P, N, F, M, H, B, O choose pens and E the eraser." style="cursor:crosshair"></canvas>' + bar + '</div>' + foot();
  };
  function drExportPng(scale) { var c = $('#drawc'); var o = document.createElement('canvas'); o.width = c.clientWidth * scale; o.height = c.clientHeight * scale; var x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); var img = new Image(); img.onload = function () { x.drawImage(img, 0, 0, o.width, o.height); o.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'drawing-' + scale + 'x.png'; a.click(); }); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(drSvg()); }
  (function drInput() {
    var down = false, start = null;
    document.addEventListener('pointerdown', function (e) { if (e.target.id !== 'drawc') return; e.target.setPointerCapture(e.pointerId); var r = e.target.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top, e.timeStamp]; down = true; drSnap(); if (dr.tool === 'eraser') { drErase(p[0], p[1], 14 * dr.size); drPaint(); return; } start = p; dr.cur = { tool: dr.tool, color: dr.color, size: dr.size, pts: [p] }; drPaint(); });
    document.addEventListener('pointermove', function (e) { if (!down || e.target.id !== 'drawc') return; var r = e.target.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top, e.timeStamp]; if (dr.tool === 'eraser') { if (drErase(p[0], p[1], 14 * dr.size)) drPaint(); return; } if (e.shiftKey && start) { var a = Math.round(Math.atan2(p[1] - start[1], p[0] - start[0]) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(p[0] - start[0], p[1] - start[1]); dr.cur.pts = [start, [start[0] + Math.cos(a) * d, start[1] + Math.sin(a) * d, p[2]]]; } else dr.cur.pts.push(p); drPaint(); });
    document.addEventListener('pointerup', function () { if (!down) return; down = false; if (dr.cur) { dr.strokes.push(dr.cur); dr.cur = null; } drSave(); render(); });
    document.addEventListener('keydown', function (e) {
      if (st.active !== 'draw' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || $('#ov')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); action('drundo'); return; } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); action('drredo'); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return; var k = e.key.toUpperCase(), pen = PENS.filter(function (p) { return p[2] === k; })[0];
      if (pen) { dr.tool = pen[0]; render(); } else if (k === 'E') { dr.tool = 'eraser'; render(); } else if (k === 'C') { dr.mode = dr.mode === 'colors' ? 'tools' : 'colors'; render(); } else if (k === 'S') { dr.mode = dr.mode === 'size' ? 'tools' : 'size'; render(); }
    });
    window.addEventListener('resize', function () { if (st.active === 'draw') drPaint(); });
  })();

  // ==========================================================================================
  // Minecraft servers, local AI models (Ollama), Windows virtual disks, and Chocolatey setup.
  // ==========================================================================================
  function seg2(name, val, opts, label) { return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map(function (o) { return '<button data-' + name + '="' + esc(o[0]) + '" class="' + (String(val) === String(o[0]) ? 'sel' : '') + '" aria-pressed="' + (String(val) === String(o[0])) + '"' + (o[2] ? ' disabled title="' + esc(o[2]) + '"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function stepper(id, val, min, max, step, label, unit) { return '<span class="stepper" role="group" aria-label="' + esc(label) + '"><button class="ib" data-step="' + id + '" data-d="-' + (step || 1) + '" aria-label="Less">−</button><input class="input" type="number" id="' + id + '" value="' + esc(val) + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" aria-label="' + esc(label) + '" style="width:110px">' + (unit ? '<span class="bs mu">' + esc(unit) + '</span>' : '') + '<button class="ib" data-step="' + id + '" data-d="' + (step || 1) + '" aria-label="More">+</button></span>'; }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-step]'); if (!b) return; var i = document.getElementById(b.dataset.step); if (!i) return; var v = Math.max(+i.min, Math.min(+i.max, (+i.value || 0) + +b.dataset.d)); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });

  // ---------- Chocolatey: one click installs what a part of the app needs ----------
  var CHOCO_FOR = { docker: 'docker', virtualbox: 'virtualbox', vmware: 'vmware' };
  var chocoState = null;
  function chocoButton(key, label) { return API.platform === 'win32' ? '<button class="btn tonal sm" data-choco="' + key + '">' + icon('PackageDown', 's') + (label || 'Install with Chocolatey') + '</button>' : ''; }
  function chocoRun(keys) {
    var lines = [];
    dialog('Installing with Chocolatey', '<p class="bm mu">Windows asks once for administrator rights. If Chocolatey is not on this computer yet, it is installed first from community.chocolatey.org. Nothing is downgraded or removed.</p>' + termHtml('choco', 'Administrator: Chocolatey', ['ham › Waiting for the administrator prompt'], { running: true, prompt: 'PS>' }) + '<div class="row" style="gap:8px"><span class="grow"></span><button class="btn fill" data-act="dlg-close">' + L('done') + '</button></div>', { emoji: '🍫' });
    chocoRun.on = function (l) { lines.push(l); termPush('choco', l); };
    API.chocoInstall(keys).then(function (r) { chocoState = r.after; chocoRun.on(''); r.results.forEach(function (x) { chocoRun.on((x.ok ? '✓ ' : '✗ ') + x.pkg + (x.reboot ? ' (restart Windows to finish)' : '') + (x.ok ? '' : ', exit code ' + x.code)); }); toast(r.results.every(function (x) { return x.ok; }) ? 'Installed. ' + (r.reboot ? 'Restart Windows to finish.' : 'Checking again.') : 'Something did not install; the log says what.'); checkAll(); render(); }, function (e) { chocoRun.on(e.message); toast(e.message); });
  }
  function chocoSection() {
    if (API.platform !== 'win32') return '<p class="bm mu">' + (DEMO ? 'On Windows, this lists what the app can use and installs anything missing with Chocolatey in one click.' : 'Chocolatey is for Windows. On this system, install with its own package manager.') + '</p>';
    if (!chocoState) { API.chocoStatus().then(function (s) { chocoState = s; if (st.active === 'settings') render(); }); return '<p class="bm mu" role="status">Checking what is installed…</p>'; }
    var names = { docker: 'Docker Desktop', virtualbox: 'VirtualBox', vmware: 'VMware Workstation', java: 'Java 21', git: 'Git', python: 'Python 3', node: 'Node.js with npm', ollama: 'Ollama', vscode: 'Visual Studio Code', openssh: 'OpenSSH client' };
    var missing = Object.keys(chocoState.parts || {}).filter(function (k) { return chocoState.parts[k] === 'missing'; });
    return '<p class="bm">Chocolatey: ' + (chocoState.choco ? 'installed, version ' + esc(chocoState.version) : 'not installed yet; it is installed first when you install anything below') + '.</p><div class="col" style="gap:2px">' + Object.keys(names).map(function (k) { var s = (chocoState.parts || {})[k]; return '<div class="row-item"><span class="ll grow">' + names[k] + '</span><span class="tag ' + (s === 'present' ? 'g' : 'a') + '">' + (s === 'present' ? 'Installed' : 'Missing') + '</span>' + (s === 'present' ? '' : chocoButton(k, 'Install')) + '</div>'; }).join('') + '</div>' + (missing.length > 1 ? '<div><button class="btn fill sm" data-chocoall="' + missing.join(',') + '">' + icon('PackageDown', 's') + 'Install all ' + missing.length + ' missing</button></div>' : '');
  }

  // ---------- Minecraft ----------
  var mcv = { sel: '', sub: 'overview', meta: null, cat: null, list: [], props: null, players: null, addons: null, results: null, q: '', consoleQ: '', hist: [], hi: -1, gen: null, chan: { release: true } };
  async function mcLoad(force) { if (DEMO) { mcv.console = mcv.console || { mc1: ['[Deploy Assistant] Starting with docker run itzg/minecraft-server:java21', '[init] Resolving type given PAPER', '[init] Downloading Paper 1.21.4 build 232', '[init] Copying any plugins from /plugins to /data/plugins', '[12:01:44 INFO]: Starting minecraft server version 1.21.4', '[12:01:44 INFO]: Loading properties', '[12:01:45 INFO]: Default game type: SURVIVAL', '[12:01:47 WARN]: Using 4 threads for Netty based IO', '[12:01:52 INFO]: Preparing level "world"', '[12:01:58 INFO]: Preparing spawn area: 100%', '[12:01:59 INFO]: Done (14.211s)! For help, type "help"', '[12:14:03 INFO]: Swift_Builder joined the game', '[12:16:40 INFO]: Cousin_Lee joined the game', '> list', 'There are 2 of a max of 20 players online: Swift_Builder, Cousin_Lee', '[12:40:12 INFO]: Grandpa_Wong joined the game', '[12:41:00 INFO]: <Grandpa_Wong> where are the cookies'] }; mcv.list = mcv.list.length ? mcv.list : MC_DEMO.slice(); mcv.meta = mcv.meta || MC_META; mcv.cat = mcv.cat || { at: new Date().toISOString(), demo: true, latest: { release: '1.21.4' }, java: [['1.21.5-pre1', 'snapshot', '2025-03-04'], ['1.21.4', 'release', '2024-12-03'], ['1.21.3', 'release', '2024-10-23'], ['1.21.1', 'release', '2024-08-08'], ['1.20.6', 'release', '2024-04-29'], ['1.20.4', 'release', '2023-12-07'], ['1.20.1', 'release', '2023-06-12'], ['1.19.4', 'release', '2023-03-14'], ['1.18.2', 'release', '2022-02-28'], ['1.16.5', 'release', '2021-01-15'], ['1.12.2', 'release', '2017-09-18'], ['1.8.9', 'release', '2015-12-09'], ['b1.7.3', 'old_beta', '2011-07-08'], ['a1.2.6', 'old_alpha', '2010-12-03']].map(function (v) { return { id: v[0], type: v[1], released: v[2] }; }), paper: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'], purpur: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1'], fabric: ['1.21.5-pre1', '1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5'], bedrock: ['LATEST', 'PREVIEW'] }; return; } try { mcv.meta = mcv.meta || await API.mcMeta(); mcv.list = await API.mc('list'); if (force || !mcv.cat) mcv.cat = await API.mc('catalog', !!force); } catch (e) { toast(e.message); } }
  var MC_META = { flavours: { vanilla: { name: 'Vanilla', edition: 'java', local: true }, paper: { name: 'Paper', edition: 'java', local: true, folder: 'plugins' }, purpur: { name: 'Purpur', edition: 'java', local: true, folder: 'plugins' }, fabric: { name: 'Fabric', edition: 'java', local: true, folder: 'mods' }, quilt: { name: 'Quilt', edition: 'java', local: false, folder: 'mods', why: 'Quilt needs its installer; use a Docker target.' }, forge: { name: 'Forge', edition: 'java', local: false, folder: 'mods', why: 'Forge needs its installer; use a Docker target.' }, neoforge: { name: 'NeoForge', edition: 'java', local: false, folder: 'mods', why: 'NeoForge needs its installer; use a Docker target.' }, bedrock: { name: 'Bedrock Dedicated Server', edition: 'bedrock', local: false, why: 'The Bedrock server runs here through Docker only.' } }, targets: { process: 'Java on this computer', docker: 'Docker on this computer', 'ssh-process': 'Java on an SSH host', 'ssh-docker': 'Docker on an SSH host' }, props: [], rules: [] };
  var MC_DEMO = [{ id: 'mc1', name: 'Family survival', slug: 'family-survival', edition: 'java', flavour: 'paper', version: '1.21.4', target: 'docker', port: 25565, memoryMb: 4096, lastState: 'running', backups: [{ id: 'b1', at: new Date(Date.now() - 864e5).toISOString(), size: 182e6, note: 'Scheduled' }], schedule: { restart: '05:00', backup: '04:30', keep: 7 }, java: 21 }, { id: 'mc2', name: 'Creative build', slug: 'creative-build', edition: 'java', flavour: 'fabric', version: '1.20.1', target: 'ssh-docker', hostId: 'h1', port: 25566, memoryMb: 3072, lastState: 'stopped', backups: [], schedule: {}, java: 17 }];
  function mcSel() { return mcv.list.filter(function (s) { return s.id === mcv.sel; })[0]; }
  R.minecraft = function () {
    if (!mcv.meta) { mcLoad().then(function () { if (st.active === 'minecraft') render(); }); return '<div class="section" id="top"><h1 class="hl">Minecraft servers</h1><p class="bm mu" role="status">Loading…</p></div>'; }
    if (!mcv.sel && mcv.list[0]) mcv.sel = mcv.list[0].id;
    var s = mcSel();
    var list = '<nav class="tlist" aria-label="Servers" data-k="mclist">' + mcv.list.map(function (x) { var dot = x.lastState === 'running' ? 'g' : x.lastState === 'starting' ? 'a' : ''; return '<button class="trow" role="option" aria-selected="' + (x.id === mcv.sel) + '" data-mcsel="' + x.id + '"><span class="sq">' + icon('Minecraft', 's') + '</span><span class="col grow" style="min-width:0"><span class="ll ell">' + esc(x.name) + '</span><span class="bs mu ell"><i class="dot ' + dot + '"></i>' + esc(mcv.meta.flavours[x.flavour] ? mcv.meta.flavours[x.flavour].name : x.flavour) + ' ' + esc(x.version) + ' · ' + esc(x.lastState) + '</span></span></button>'; }).join('') + '<button class="btn fill" data-act="mcnew" style="margin-top:6px">' + icon('Plus', 's') + 'New server</button></nav>';
    var subs = [['overview', 'Overview'], ['console', 'Console'], ['settings', 'Settings'], ['rules', 'Game rules'], ['players', 'Players'], ['addons', 'Plugins and mods'], ['backups', 'Backups'], ['version', 'Version'], ['generate', 'World generator']];
    var body = !s ? '<div class="empty"><p class="bl">No servers yet.</p><p class="bm mu">Create one: choose the edition and flavour, any version from the official catalogues, and where it runs: Java or Docker, here or on an SSH host.</p><button class="btn fill" data-act="mcnew">' + icon('Plus', 's') + 'New server</button></div>' :
      '<div class="row" style="gap:12px;flex-wrap:wrap"><div class="col grow" style="gap:4px"><h2 class="hs">' + esc(s.name) + '</h2><span class="bs mu">' + esc(mcv.meta.flavours[s.flavour].name) + ' ' + esc(s.version) + ' · ' + esc(mcv.meta.targets[s.target]) + ' · port ' + s.port + (s.java ? ' · Java ' + s.java : '') + '</span></div><span class="tag ' + (s.lastState === 'running' ? 'g' : s.lastState === 'crashed' || s.lastState === 'failed' ? 'a' : '') + '">' + esc(s.lastState) + '</span>' +
      '<button class="btn fill sm" data-mcdo="start"' + (s.lastState === 'running' || s.lastState === 'starting' ? ' disabled' : '') + '>' + icon('Play', 's') + 'Start</button><button class="btn tonal sm" data-mcdo="stop"' + (s.lastState === 'stopped' ? ' disabled' : '') + '>' + icon('Stop', 's') + 'Stop</button><button class="btn tonal sm" data-mcdo="restart">' + icon('Restart', 's') + 'Restart</button></div>' +
      '<div class="chipline" role="tablist" aria-label="Server sections">' + subs.map(function (x) { return '<button class="chip' + (mcv.sub === x[0] ? ' sel' : '') + '" role="tab" aria-selected="' + (mcv.sub === x[0]) + '" data-mcsub="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' + mcSub(s);
    return pageHead('Minecraft', 'Minecraft servers', 'Create, run and look after Java and Bedrock servers, here or on your SSH hosts.' + (DEMO ? ' Demo: nothing runs.' : ''), [[mcv.list.length, 'Servers'], [mcv.list.filter(function (x) { return x.lastState === 'running'; }).length, 'Running'], [(mcv.cat && mcv.cat.java || []).length, 'Java versions'], [mcv.cat && mcv.cat.at ? when(mcv.cat.at) : '–', 'Catalogue read']], '<button class="btn text sm" data-act="mccat">' + icon('Refresh', 's') + 'Refresh the catalogue</button>') + '<div class="wizgrid">' + list + '<section class="wpanel" data-k="mcpanel">' + body + '</section></div>' + foot();
  };
  function mcSub(s) {
    var addr = (s.target.indexOf('ssh') === 0 ? ((D.hosts.filter(function (h) { return h.id === s.hostId; })[0] || {}).address || 'the host') : 'localhost') + ':' + s.port;
    if (mcv.sub === 'overview') {
      var lv = (mcv.live || {})[s.id] || (DEMO ? { state: s.lastState, online: s.lastState === 'running' ? 3 : 0, max: 20, names: s.lastState === 'running' ? ['Swift_Builder', 'Cousin_Lee', 'Grandpa_Wong'] : [], tps: 19.97, cpu: 23.4, mem: '2.1GiB / 4GiB', worldBytes: 1.84e9, uptimeSince: new Date(Date.now() - 5.2 * 3600e3).toISOString() } : {});
      var hist = (mcv.hist2 || {})[s.id] || [];
      var up = lv.uptimeSince && s.lastState === 'running' ? Math.round((Date.now() - Date.parse(lv.uptimeSince)) / 60000) : 0;
      var tiles = [['AccountGroup', (lv.online != null ? lv.online : '–') + ' / ' + (lv.max || '–'), 'Players online'], ['Speedometer', lv.tps != null ? lv.tps.toFixed(1) : '–', 'Ticks per second' + (lv.tps != null ? (lv.tps >= 19 ? ', smooth' : lv.tps >= 15 ? ', a little slow' : ', struggling') : '')], ['Chip', lv.cpu != null ? lv.cpu.toFixed(1) + '%' : '–', 'Processor'], ['Memory', lv.mem ? String(lv.mem).split('/')[0].trim() : '–', 'Memory of ' + s.memoryMb + ' MB'], ['Earth', lv.worldBytes != null ? fmtSize(lv.worldBytes) : '–', 'World on disk'], ['BackupRestore', String((s.backups || []).length), (s.backups || [])[0] ? 'Backups, newest ' + when(s.backups[0].at) : 'Backups']];
      return '<div class="mcbanner fl-' + esc(s.flavour) + '" data-k="mcbanner"><div class="col grow" style="gap:6px"><span class="bs">' + esc(mcv.meta.flavours[s.flavour].name) + ' · ' + esc(s.version) + ' · ' + esc(mcv.meta.targets[s.target]) + '</span><span class="hs">' + esc(s.name) + '</span><span class="row" style="gap:8px;flex-wrap:wrap"><span class="mcpill ' + esc(s.lastState) + '"><i></i>' + esc(s.lastState) + (up ? ' for ' + (up < 60 ? up + ' min' : Math.floor(up / 60) + ' h ' + (up % 60) + ' min') : '') + '</span><span class="mcaddr mono">' + esc(addr) + '</span><button class="ib" data-copy="' + esc(addr) + '" aria-label="Copy the address" style="color:inherit">' + icon('ContentCopy', 's') + '</button><button class="ib" data-mcqr="' + esc(addr) + '" aria-label="Show the address as a QR code" style="color:inherit">' + icon('Qrcode', 's') + '</button></span></div><span class="mcblock" aria-hidden="true">' + icon('Minecraft') + '</span></div>' +
        '<div class="mctiles" data-k="mctiles">' + tiles.map(function (t) { return '<div class="mctile"><span class="ptile sm">' + icon(t[0], 's') + '</span><b>' + esc(t[1]) + '</b><span class="bs mu">' + esc(t[2]) + '</span></div>'; }).join('') + '</div>' +
        '<div class="mcgrid"><section class="card" style="padding:16px" data-k="mcload"><div class="row"><h3 class="tm grow">Load over the last minutes</h3><span class="bs mu">' + hist.length + ' readings</span></div>' + mcSpark(hist) + '</section>' +
        '<section class="card" style="padding:16px" data-k="mconline"><h3 class="tm">Playing now</h3>' + ((lv.names || []).length ? lv.names.map(function (n) { var hue = 0; for (var i = 0; i < n.length; i++) hue = (hue * 31 + n.charCodeAt(i)) % 360; return '<div class="row-item"><span class="mchead" style="background:hsl(' + hue + ',55%,45%)">' + esc(n.slice(0, 1).toUpperCase()) + '</span><span class="ll grow">' + esc(n) + '</span><button class="btn text sm" data-mcq="tell ' + esc(n) + ' Hello from the console">Message</button><button class="btn text sm" data-mcq="kick ' + esc(n) + '">Kick</button></div>'; }).join('') : '<p class="bm mu">' + (s.lastState === 'running' ? 'Nobody is on right now.' : 'Start the server to see who is on.') + '</p>') + '</section></div>' +
        '<div class="mcactions" data-k="mcactions">' + [['save-all flush', 'ContentSave', 'Save the world'], ['time set day', 'WeatherSunny', 'Make it day'], ['weather clear', 'WeatherPartlyCloudy', 'Clear the weather'], ['say The server restarts soon', 'Bullhorn', 'Warn everyone'], ['whitelist on', 'ShieldAccount', 'Allowlist on'], ['difficulty peaceful', 'Sprout', 'Peaceful']].map(function (q) { return '<button class="mcact" data-mcq="' + esc(q[0]) + '"' + (s.lastState === 'running' ? '' : ' disabled') + '>' + icon(q[1]) + '<span>' + esc(q[2]) + '</span></button>'; }).join('') + '<button class="mcact" data-act="mcbackup">' + icon('BackupRestore') + '<span>Back up now</span></button><button class="mcact" data-mcsub="generate">' + icon('Earth') + '<span>Make a new world</span></button></div>' +
        termHtml('mc-' + s.id, s.slug + ' — last lines', ((mcv.console || {})[s.id] || []).slice(-60), { running: s.lastState === 'running', input: 'mccmd', prompt: '>', placeholder: 'A command, such as say Hello', empty: 'Nothing yet.' }) +
        '<h3 class="tm">Daily schedule</h3><div class="plan"><label><span class="ll">Restart at</span><input class="input" type="time" id="mcsr" value="' + esc((s.schedule || {}).restart || '') + '"></label><label><span class="ll">Back up at</span><input class="input" type="time" id="mcsb" value="' + esc((s.schedule || {}).backup || '') + '"></label><label><span class="ll">Keep scheduled backups</span>' + stepper('mcsk', (s.schedule || {}).keep || 7, 1, 100, 1, 'Scheduled backups to keep') + '</label></div><div><button class="btn tonal sm" data-act="mcsched">Save the schedule</button> <span class="bs mu">Runs while this app is open. Players get a 60-second warning before a restart.</span></div>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--outv)"><span class="bs mu grow">Server file: ' + esc(s.jar ? s.jar.check : s.target.indexOf('docker') >= 0 ? 'downloaded and checked by the itzg image when it starts' : 'not downloaded yet') + (s.java ? ' · Java ' + s.java : '') + '</span><button class="btn text sm" data-act="mcremove">' + icon('DeleteOutline', 's') + 'Remove this server…</button></div>';
    }
      '<h3 class="tm">Daily schedule</h3><div class="plan"><label><span class="ll">Restart at</span><input class="input" type="time" id="mcsr" value="' + esc((s.schedule || {}).restart || '') + '"></label><label><span class="ll">Back up at</span><input class="input" type="time" id="mcsb" value="' + esc((s.schedule || {}).backup || '') + '"></label><label><span class="ll">Keep scheduled backups</span>' + stepper('mcsk', (s.schedule || {}).keep || 7, 1, 100, 1, 'Scheduled backups to keep') + '</label></div><div><button class="btn tonal sm" data-act="mcsched">Save the schedule</button> <span class="bs mu">Runs while this app is open. Players get a 60-second warning before a restart.</span></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--outv)"><button class="btn text sm" data-act="mcremove">' + icon('DeleteOutline', 's') + 'Remove this server…</button></div>';
    if (mcv.sub === 'console') { var lines = (mcv.console && mcv.console[s.id]) || []; return termHtml('mc-' + s.id, s.slug + '@' + (s.target.indexOf('ssh') === 0 ? 'ssh-host' : 'this-computer') + ' — ' + mcv.meta.flavours[s.flavour].name + ' ' + s.version, lines, { running: s.lastState === 'running' || s.lastState === 'starting', input: 'mccmd', prompt: '>', placeholder: 'say Hello, everyone   (Enter sends, Up and Down for earlier commands)', inputLabel: 'Server command', empty: 'Nothing yet. Start the server to see its output.' }) + '<div class="chipline">' + [['list', 'Who is on'], ['save-all', 'Save now'], ['time set day', 'Make it day'], ['weather clear', 'Clear weather'], ['difficulty peaceful', 'Peaceful'], ['tps', 'Ticks per second (Paper)'], ['whitelist list', 'Allowlist'], ['seed', 'Seed']].map(function (c) { return '<button class="chip" data-mcq="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>'; }
    if (mcv.sub === 'settings') {
      if (!mcv.props) { (DEMO ? Promise.resolve({ known: [], other: [] }) : API.mc('properties', s.id)).then(function (p) { mcv.props = p; mcv.edit = {}; render(); }, function (e) { toast(e.message); }); return '<p class="bm mu" role="status">Reading server.properties…</p>'; }
      if (DEMO && !mcv.props.known.length) return '<p class="bm mu">In the app, every server setting appears here with its own control: switches, choices, steppers with bounds, and text where the value is text. Unknown settings are kept exactly as they are.</p>';
      var mq = matcher(mcv.q); var groups = { Players: /player|gamemode|whitelist|op-|pvp|hardcore|idle|force-gamemode/, World: /level|world|spawn|nether|structures|generator|difficulty|monsters|view|simulation/, Network: /port|ip|online|compression|rate|query|status|rcon/, 'Resource pack': /resource/, Other: /./ };
      var used = {}; var html = Object.keys(groups).map(function (g) { var ps = mcv.props.known.filter(function (p) { if (used[p.key] || !groups[g].test(p.key) || !mq.test(p.key + ' ' + p.help)) return false; used[p.key] = 1; return true; }); if (!ps.length) return ''; return '<h3 class="tm">' + g + '</h3>' + ps.map(function (p) { var v = mcv.edit[p.key] != null ? mcv.edit[p.key] : p.value != null ? p.value : String(p.def); var id = 'mcp-' + p.key.replace(/\W/g, '_'); var ctl = p.type === 'bool' ? '<button class="sw' + (v === 'true' ? ' on' : '') + '" role="switch" aria-checked="' + (v === 'true') + '" aria-label="' + esc(p.key) + '" data-mcbool="' + esc(p.key) + '"><i></i></button>' : p.type === 'enum' ? '<select class="select" data-mcprop="' + esc(p.key) + '" aria-label="' + esc(p.key) + '">' + p.choices.map(function (c) { return '<option' + (c === v ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' : p.type === 'int' ? '<span class="row" style="gap:6px">' + (p.max - p.min <= 1000 ? '<input type="range" min="' + p.min + '" max="' + p.max + '" value="' + esc(v) + '" data-mcprop="' + esc(p.key) + '" aria-label="' + esc(p.key) + ' slider">' : '') + '<input class="input" style="width:120px" type="number" min="' + p.min + '" max="' + p.max + '" value="' + esc(v) + '" data-mcprop="' + esc(p.key) + '" aria-label="' + esc(p.key) + '"></span>' : '<input class="input" id="' + id + '" value="' + esc(v) + '" maxlength="' + (p.max || 200) + '" data-mcprop="' + esc(p.key) + '" aria-label="' + esc(p.key) + '"' + (p.type === 'json' ? ' disabled title="Built in the World generator"' : '') + '>';
        return '<div class="setting' + (mcv.edit[p.key] != null ? ' changed' : '') + '"><span class="col grow"><span class="ll mono">' + esc(p.key) + (p.warn ? ' <span class="tag a">Careful</span>' : '') + '</span><span class="bs mu">' + esc(p.help) + '. Default ' + esc(String(p.def)) + (p.min != null ? '; ' + p.min + ' to ' + p.max : '') + '; applies after a restart.</span></span><div class="ctl">' + ctl + '</div></div>'; }).join(''); }).join('');
      var n = Object.keys(mcv.edit).length;
      return findField('mcpq', 'Search server settings', mcv.q) + (mq.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(mq.error) + '</p>') + (n ? '<div class="selbar"><span class="ll grow">' + n + ' changed</span><button class="btn fill sm" data-act="mcpsave">Save</button><button class="btn text sm" data-act="mcpundo">Undo the changes</button></div>' : '') + html + (mcv.props.other.length ? '<h3 class="tm">Other settings, kept as they are</h3>' + mcv.props.other.map(function (o) { return '<div class="setting"><span class="ll mono grow">' + esc(o.key) + '</span><span class="bs mono">' + esc(o.value) + '</span></div>'; }).join('') : '');
    }
    if (mcv.sub === 'rules') { var rq = matcher(mcv.q); return '<p class="bm mu">Game rules change live, so the server must be running. Each has its own control.</p>' + findField('mcrq', 'Search game rules', mcv.q) + (mcv.meta.rules || []).filter(function (r) { return rq.test(r.name); }).map(function (r) { return '<div class="setting"><span class="col grow"><span class="ll mono">' + esc(r.name) + '</span><span class="bs mu">Default ' + esc(String(r.def)) + (r.type === 'int' ? '; ' + r.min + ' to ' + r.max : '') + '</span></span><div class="ctl">' + (r.type === 'bool' ? '<div class="seg" role="group" aria-label="' + esc(r.name) + '"><button data-mcrb="' + r.name + '|true">On</button><button data-mcrb="' + r.name + '|false">Off</button></div>' : '<input class="input" type="number" style="width:120px" min="' + r.min + '" max="' + r.max + '" value="' + r.def + '" id="mcr-' + r.name + '" aria-label="' + esc(r.name) + '"><button class="btn tonal sm" data-mcruleint="' + r.name + '">Set</button>') + '</div></div>'; }).join(''); }
    if (mcv.sub === 'players') {
      if (!mcv.players) { (DEMO ? Promise.resolve({ ops: [{ name: 'Swift_Builder', level: 4 }], allow: [{ name: 'Swift_Builder' }, { name: 'Cousin_Lee' }], bans: [], ipBans: [] }) : API.mc('players', s.id)).then(function (p) { mcv.players = p; render(); }, function (e) { toast(e.message); }); return '<p class="bm mu" role="status">Reading the player lists…</p>'; }
      return [['ops', 'Operators', 'Can run every command'], ['allow', 'Allowlist', 'Only these can join while the allowlist is on'], ['bans', 'Banned players', ''], ['ipBans', 'Banned addresses', '']].map(function (l) { var arr = mcv.players[l[0]] || []; return '<section class="card" style="padding:16px" data-k="mcpl-' + l[0] + '"><h3 class="tm">' + l[1] + ' <span class="bs mu">' + arr.length + '</span></h3>' + (l[2] ? '<p class="bs mu">' + l[2] + '</p>' : '') + arr.map(function (e) { var who = e.name || e.ip; return '<div class="row-item"><span class="ll grow">' + esc(who) + '</span>' + (e.reason ? '<span class="bs mu">' + esc(e.reason) + '</span>' : '') + (e.level ? '<span class="tag">Level ' + e.level + '</span>' : '') + '<button class="btn text sm" data-mcpl="' + l[0] + '|remove|' + esc(who) + '">Remove</button></div>'; }).join('') + '<div class="row" style="gap:8px;margin-top:6px"><input class="input grow" id="mcpl-in-' + l[0] + '" placeholder="' + (l[0] === 'ipBans' ? '203.0.113.7' : 'Player name') + '" aria-label="Add to ' + l[1] + '">' + (l[0] === 'bans' || l[0] === 'ipBans' ? '<input class="input" id="mcpl-why-' + l[0] + '" placeholder="Reason" aria-label="Reason">' : '') + '<button class="btn tonal sm" data-mcpl="' + l[0] + '|add">Add</button></div></section>'; }).join('');
    }
    if (mcv.sub === 'addons') {
      var fl = mcv.meta.flavours[s.flavour]; if (!fl.folder) return '<p class="bm mu">' + esc(fl.name) + ' takes no plugins or mods. Switch to Paper, Purpur or Fabric in Version to add them.</p>';
      if (!mcv.addons) { (DEMO ? Promise.resolve([{ file: 'Chunky-1.4.10.jar', enabled: true, managed: true, name: 'Chunky', version: '1.4.10' }, { file: 'EssentialsX.jar', enabled: false, managed: false, name: 'EssentialsX.jar', version: 'unknown: not installed here, so not managed' }]) : API.mc('addons', s.id)).then(function (a) { mcv.addons = a; render(); }); return '<p class="bm mu" role="status">Reading the ' + fl.folder + ' folder…</p>'; }
      return '<h3 class="tm">Installed in ' + fl.folder + '/</h3>' + (mcv.addons.length ? mcv.addons.map(function (a) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(a.name) + '</span><span class="bs mu">' + esc(a.version) + ' · ' + esc(a.file) + '</span></span><button class="sw' + (a.enabled ? ' on' : '') + '" role="switch" aria-checked="' + a.enabled + '" aria-label="' + esc(a.name) + ' on" data-mcaddon="' + esc(a.file) + '"><i></i></button><button class="btn text sm" data-mcaddrm="' + esc(a.file) + '">Remove</button></div>'; }).join('') : '<p class="bm mu">Nothing yet.</p>') +
        '<h3 class="tm">Find on Modrinth</h3><div class="row" style="gap:8px"><input class="input grow" id="mcsearch" placeholder="Search ' + (fl.folder === 'plugins' ? 'plugins' : 'mods') + ' for ' + esc(fl.name + ' ' + s.version) + '" aria-label="Search Modrinth"><button class="btn tonal sm" data-act="mcfind">Search</button></div><p class="bs mu">Only versions Modrinth marks for ' + esc(fl.name + ' ' + s.version) + ' are installed, checked against their SHA-512. The licence is shown before you install.</p>' +
        (mcv.results ? '<p class="bs mu">' + mcv.results.total + ' found</p>' + mcv.results.hits.map(function (h) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(h.title) + ' <span class="bs mu">by ' + esc(h.author) + '</span></span><span class="bs mu">' + esc(h.description) + '</span><span class="bs mu">' + Number(h.downloads).toLocaleString() + ' downloads · licence ' + esc(h.license || 'not stated') + '</span></span><button class="btn tonal sm" data-mcinst="' + esc(h.id) + '" data-mctitle="' + esc(h.title) + '">Install</button></div>'; }).join('') : '');
    }
    if (mcv.sub === 'backups') return '<div class="row" style="gap:8px"><button class="btn fill sm" data-act="mcbackup">' + icon('BackupRestore', 's') + 'Back up now</button><span class="bs mu">While it runs, saving pauses for a moment so the copy is consistent.</span></div>' + (s.backups.length ? s.backups.map(function (b) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(when(b.at)) + '</span><span class="bs mu">' + esc(b.note) + ' · ' + fmtSize(b.size || 0) + '</span></span><button class="btn text sm" data-mcrestore="' + b.id + '">Restore</button><button class="btn text sm" data-mcbdel="' + b.id + '">Delete</button></div>'; }).join('') : '<p class="bm mu">No backups yet.</p>');
    if (mcv.sub === 'version') {
      var cat = mcv.cat || { java: [], paper: [], purpur: [], fabric: [], bedrock: ['LATEST', 'PREVIEW'] };
      var fls = Object.keys(mcv.meta.flavours).filter(function (k) { return mcv.meta.flavours[k].edition === s.edition; });
      return '<p class="bm mu">Changing the flavour or version makes a backup first. Going back to an older version is only safe by restoring that backup.</p><div class="plan"><label><span class="ll">Flavour</span><select class="select" id="mcvf">' + fls.map(function (k) { var f = mcv.meta.flavours[k], ok = !(s.target === 'process' && !f.local); return '<option value="' + k + '"' + (k === s.flavour ? ' selected' : '') + (ok ? '' : ' disabled') + '>' + esc(f.name) + (ok ? '' : ' (' + esc(f.why) + ')') + '</option>'; }).join('') + '</select></label><label><span class="ll">Version</span><input class="input mono" id="mcvv" list="mcvlist" value="' + esc(s.version) + '"><datalist id="mcvlist">' + (s.edition === 'bedrock' ? cat.bedrock : (cat.java || []).filter(function (v) { return v.type === 'release'; }).map(function (v) { return v.id; })).slice(0, 300).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist></label></div><div><button class="btn fill sm" data-act="mcswitch">Back up and change</button></div>' +
        ((s.history || []).length ? '<h3 class="tm">Earlier</h3>' + s.history.slice().reverse().map(function (h) { return '<div class="row-item"><span class="bm grow">' + esc(mcv.meta.flavours[h.flavour].name + ' ' + h.version) + ' until ' + esc(when(h.at)) + '</span></div>'; }).join('') : '');
    }
    if (mcv.sub === 'generate') return mcGenUi(s);
    return '';
  }
  function mcSpark(h) {
    if (h.length < 2) return '<p class="bm mu">Readings appear every few seconds while the server runs.</p>';
    var W2 = 520, H = 120, max = Math.max(10, Math.max.apply(null, h.map(function (x) { return x.cpu || 0; })) * 1.2), pts = h.map(function (x, i) { return [i * W2 / (h.length - 1), H - 8 - (x.cpu || 0) / max * (H - 16)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var pl = h.map(function (x, i) { return [i * W2 / (h.length - 1), H - 8 - (x.online || 0) / Math.max(1, x.max || 20) * (H - 16)]; }).map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = h[h.length - 1];
    return '<svg viewBox="0 0 ' + W2 + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Processor use now ' + (last.cpu || 0).toFixed(1) + ' percent, ' + (last.online || 0) + ' players"><path d="' + line + ' L' + W2 + ' ' + H + ' L0 ' + H + 'Z" fill="var(--pc)" opacity=".6"/><path d="' + line + '" fill="none" stroke="var(--p)" stroke-width="2.5" stroke-linejoin="round"/><path d="' + pl + '" fill="none" stroke="var(--t)" stroke-width="2" stroke-dasharray="5 4"/><circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="4.5" fill="var(--p)"/></svg><div class="row bs" style="gap:16px"><span><i class="dot" style="background:var(--p)"></i>Processor ' + (last.cpu || 0).toFixed(1) + '%</span><span><i class="dot" style="background:var(--t)"></i>Players ' + (last.online || 0) + '</span></div>';
  }
  // Every few seconds while the Minecraft tab is open, the chosen server's live facts are read.
  setInterval(function () {
    if (st.active !== 'minecraft' || mcv.sub !== 'overview') return; var s = mcSel(); if (!s) return;
    var got = function (lv) { mcv.live = mcv.live || {}; mcv.live[s.id] = lv; mcv.hist2 = mcv.hist2 || {}; var h = mcv.hist2[s.id] = mcv.hist2[s.id] || []; h.push({ cpu: lv.cpu || 0, online: lv.online || 0, max: lv.max || 20 }); if (h.length > 120) h.shift(); if (!$('#mccmd') || document.activeElement !== $('#mccmd')) render(); };
    if (DEMO) { if (s.lastState === 'running') got({ state: 'running', online: 2 + Math.round(Math.random() * 2), max: 20, names: ['Swift_Builder', 'Cousin_Lee', 'Grandpa_Wong'], tps: 19.6 + Math.random() * 0.4, cpu: 15 + Math.random() * 20, mem: '2.1GiB / 4GiB', worldBytes: 1.84e9, uptimeSince: new Date(Date.now() - 5.2 * 3600e3).toISOString() }); return; }
    API.mc('live', s.id).then(got, function () {});
  }, 5000);
  // The world generator: typed controls, a flat-layer editor, and a chunk grid to draw the area on.
  function mcGenUi(s) {
    var g = mcv.gen = mcv.gen || { version: s.edition === 'java' && s.version !== 'LATEST' ? s.version : ((mcv.cat && mcv.cat.latest) || {}).release || '1.21.4', seed: '', levelType: 'minecraft:normal', difficulty: 'normal', gamemode: 'survival', hardcore: false, structures: true, border: true, width: 100, height: 100, centerX: 0, centerZ: 0, layers: [['minecraft:bedrock', 1], ['minecraft:dirt', 2], ['minecraft:grass_block', 1]], biome: 'minecraft:plains', rules: {}, output: { kind: 'folder', dir: '' }, eula: false, log: [] };
    var paperVs = (mcv.cat && mcv.cat.paper) || [];
    return '<p class="bm mu">Builds a new world for the exact version you choose, pre-generates the area you draw, and writes it to a folder or a ZIP. It runs a separate Paper server in Docker with the Chunky plugin, so it never touches this server\'s world.</p>' +
      '<div class="plan"><label><span class="ll">Version</span><input class="input mono" id="mgv" list="mgvl" value="' + esc(g.version) + '"><datalist id="mgvl">' + paperVs.slice(0, 200).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist><span class="bs mu">Versions Paper builds for</span></label><label><span class="ll">Seed</span><span class="row" style="gap:6px"><input class="input mono grow" id="mgseed" value="' + esc(g.seed) + '" placeholder="Random"><button class="ib" data-act="mgdice" aria-label="A random seed">' + icon('DiceMultiple', 's') + '</button></span></label><label><span class="ll">World preset</span><select class="select" id="mglt">' + ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'].map(function (t) { return '<option' + (t === g.levelType ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="setting"><span class="ll grow">Difficulty</span>' + seg2('mgdiff', g.difficulty, [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], 'Difficulty') + '</div><div class="setting"><span class="ll grow">Game mode</span>' + seg2('mggm', g.gamemode, [['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure'], ['spectator', 'Spectator']], 'Game mode') + '</div>' +
      [['hardcore', 'Hardcore'], ['structures', 'Villages and other structures'], ['border', 'World border around the area']].map(function (x) { return '<div class="setting"><span class="ll grow">' + x[1] + '</span><button class="sw' + (g[x[0]] ? ' on' : '') + '" role="switch" aria-checked="' + !!g[x[0]] + '" aria-label="' + x[1] + '" data-mgsw="' + x[0] + '"><i></i></button></div>'; }).join('') +
      (g.levelType === 'minecraft:flat' ? '<h3 class="tm">Flat layers, bottom first</h3>' + g.layers.map(function (l, i) { return '<div class="row" style="gap:6px"><input class="input mono grow" data-mgl="' + i + '" value="' + esc(l[0]) + '" aria-label="Block of layer ' + (i + 1) + '">' + stepper('mglh' + i, l[1], 1, 384, 1, 'Height of layer ' + (i + 1)) + '<button class="ib" data-mglup="' + i + '" aria-label="Move up">↑</button><button class="ib" data-mglrm="' + i + '" aria-label="Remove layer">' + icon('Close', 's') + '</button></div>'; }).join('') + '<button class="btn text sm" data-act="mgladd">' + icon('Plus', 's') + 'Add a layer</button><label class="col"><span class="ll">Biome</span><input class="input mono" id="mgbiome" value="' + esc(g.biome) + '"></label>' : g.levelType === 'minecraft:single_biome_surface' ? '<label class="col"><span class="ll">Biome</span><input class="input mono" id="mgbiome" value="' + esc(g.biome) + '"></label>' : '') +
      '<h3 class="tm">Game rules for the new world</h3><div class="chipline">' + ['doDaylightCycle', 'doWeatherCycle', 'doMobSpawning', 'keepInventory', 'mobGriefing', 'doFireTick'].map(function (r) { var v = g.rules[r]; return '<button class="chip' + (v != null ? ' sel' : '') + '" data-mgrule="' + r + '" aria-pressed="' + (v != null) + '">' + r + (v != null ? ': ' + v : '') + '</button>'; }).join('') + '</div><p class="bs mu">Click once for on, again for off, a third time to leave the default.</p>' +
      '<h3 class="tm">Area to generate</h3><div class="row" style="gap:12px;flex-wrap:wrap"><label class="col"><span class="ll">Width (chunks)</span>' + stepper('mgw', g.width, 1, 2000, 10, 'Width in chunks') + '</label><label class="col"><span class="ll">Height (chunks)</span>' + stepper('mgh', g.height, 1, 2000, 10, 'Height in chunks') + '</label><label class="col"><span class="ll">Centre X (chunk)</span>' + stepper('mgcx', g.centerX, -100000, 100000, 1, 'Centre X') + '</label><label class="col"><span class="ll">Centre Z (chunk)</span>' + stepper('mgcz', g.centerZ, -100000, 100000, 1, 'Centre Z') + '</label></div>' +
      '<canvas id="mggrid" width="560" height="360" tabindex="0" role="img" aria-label="Chunk grid. Drag the rectangle to move it, drag its corner to resize. Arrow keys move it; Shift and the arrow keys resize it." style="width:100%;max-width:560px;border-radius:16px;background:var(--sl2);touch-action:none;cursor:move"></canvas><p class="bs mu" id="mgsum">' + g.width + ' × ' + g.height + ' chunks = ' + (g.width * 16) + ' × ' + (g.height * 16) + ' blocks, about ' + Math.round(g.width * g.height * 0.0045) + ' MB.</p>' +
      '<h3 class="tm">Where it goes</h3><div class="row" style="gap:8px;flex-wrap:wrap">' + seg2('mgout', g.output.kind, [['folder', 'Folder'], ['zip', 'ZIP']], 'Output') + '<button class="btn tonal sm" data-act="mgbrowse">' + icon('FolderOpen', 's') + 'Browse…</button><span class="bs mu">' + esc(g.output.dir || 'Choose a folder. Nothing is overwritten.') + '</span></div>' +
      '<label class="row bm" style="gap:8px"><input type="checkbox" id="mgeula"' + (g.eula ? ' checked' : '') + '> I accept the <a href="#" data-ext="https://aka.ms/MinecraftEULA">Minecraft EULA</a></label><div><button class="btn fill" data-act="mggo">' + icon('Earth', 's') + 'Generate the world</button></div>' + (g.log.length ? termHtml('mggen', 'world generator — Paper ' + g.version + ' with Chunky', g.log, { running: g.log[g.log.length - 1].indexOf('Done') !== 0 && g.log[g.log.length - 1].indexOf('Stopped') !== 0, prompt: 'ham ›' }) : '');
  }
  function mgDraw() {
    var c = $('#mggrid'), g = mcv.gen; if (!c || !g) return; var x = c.getContext('2d'), W2 = c.width, H = c.height, scale = Math.min(W2 / (Math.max(g.width, 200) * 1.3), H / (Math.max(g.height, 200) * 1.3));
    x.clearRect(0, 0, W2, H); var cs = getComputedStyle($('#app')); x.strokeStyle = cs.getPropertyValue('--outv'); x.lineWidth = 1; var step = Math.max(4, 16 * scale) ; for (var i = 0; i < W2; i += step) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); } for (var j = 0; j < H; j += step) { x.beginPath(); x.moveTo(0, j); x.lineTo(W2, j); x.stroke(); }
    var rw = g.width * scale, rh = g.height * scale, rx = W2 / 2 + g.centerX * scale - rw / 2, ry = H / 2 + g.centerZ * scale - rh / 2; mgDraw.r = { x: rx, y: ry, w: rw, h: rh, scale: scale };
    x.fillStyle = cs.getPropertyValue('--pc'); x.globalAlpha = 0.7; x.fillRect(rx, ry, rw, rh); x.globalAlpha = 1; x.strokeStyle = cs.getPropertyValue('--p'); x.lineWidth = 2; x.strokeRect(rx, ry, rw, rh); x.fillStyle = cs.getPropertyValue('--p'); x.fillRect(rx + rw - 8, ry + rh - 8, 12, 12);
    x.fillStyle = cs.getPropertyValue('--on'); x.font = '12px sans-serif'; x.fillText('0,0', W2 / 2 + 3, H / 2 - 3); x.beginPath(); x.arc(W2 / 2, H / 2, 3, 0, 7); x.fill();
    var sm = $('#mgsum'); if (sm) sm.textContent = g.width + ' × ' + g.height + ' chunks = ' + g.width * 16 + ' × ' + g.height * 16 + ' blocks, centred on chunk ' + g.centerX + ', ' + g.centerZ + '; about ' + Math.round(g.width * g.height * 0.0045) + ' MB.';
  }
  (function mgInput() {
    var drag = null;
    document.addEventListener('pointerdown', function (e) { if (e.target.id !== 'mggrid' || !mgDraw.r) return; var c = e.target, b = c.getBoundingClientRect(), k = c.width / b.width, px = (e.clientX - b.left) * k, py = (e.clientY - b.top) * k, r = mgDraw.r; if (px >= r.x + r.w - 12 && px <= r.x + r.w + 6 && py >= r.y + r.h - 12 && py <= r.y + r.h + 6) drag = { mode: 'size', px: px, py: py, w: mcv.gen.width, h: mcv.gen.height }; else if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) drag = { mode: 'move', px: px, py: py, cx: mcv.gen.centerX, cz: mcv.gen.centerZ }; if (drag) c.setPointerCapture(e.pointerId); });
    document.addEventListener('pointermove', function (e) { if (!drag || e.target.id !== 'mggrid') return; var c = e.target, b = c.getBoundingClientRect(), k = c.width / b.width, dx = ((e.clientX - b.left) * k - drag.px) / mgDraw.r.scale, dy = ((e.clientY - b.top) * k - drag.py) / mgDraw.r.scale, g = mcv.gen; if (drag.mode === 'move') { g.centerX = Math.round(drag.cx + dx); g.centerZ = Math.round(drag.cz + dy); } else { g.width = Math.max(1, Math.min(2000, Math.round(drag.w + dx * 2))); g.height = Math.max(1, Math.min(2000, Math.round(drag.h + dy * 2))); } ['mgw', 'mgh', 'mgcx', 'mgcz'].forEach(function (id, i) { var el = $('#' + id); if (el) el.value = [g.width, g.height, g.centerX, g.centerZ][i]; }); mgDraw(); });
    document.addEventListener('pointerup', function () { drag = null; });
    document.addEventListener('keydown', function (e) { if (e.target.id !== 'mggrid') return; var g = mcv.gen, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return; e.preventDefault(); var n = e.ctrlKey ? 10 : 1; if (e.shiftKey) { g.width = Math.max(1, Math.min(2000, g.width + d[0] * n * 2)); g.height = Math.max(1, Math.min(2000, g.height + d[1] * n * 2)); } else { g.centerX += d[0] * n; g.centerZ += d[1] * n; } ['mgw', 'mgh', 'mgcx', 'mgcz'].forEach(function (id, i) { var el = $('#' + id); if (el) el.value = [g.width, g.height, g.centerX, g.centerZ][i]; }); mgDraw(); });
  })();
  function mcNew() {
    var w = { step: 1, edition: 'java', flavour: 'paper', version: '', target: API.platform === 'win32' || DEMO ? 'docker' : 'docker', hostId: (D.hosts[0] || {}).id || '', port: 25565, memoryMb: 4096, name: 'My server', channels: { release: true }, vq: '', seed: '', levelType: 'minecraft:normal', difficulty: 'normal', gamemode: 'survival', hardcore: false, maxPlayers: 20, eula: false };
    var cat = mcv.cat || { java: [], paper: [], purpur: [], fabric: [], bedrock: ['LATEST', 'PREVIEW'], latest: {} };
    function versions() { if (w.flavour === 'bedrock') return cat.bedrock.map(function (v) { return { id: v, type: 'release' }; }); if (w.flavour === 'vanilla' || /forge|quilt/.test(w.flavour)) return (cat.java || []); var ids = cat[w.flavour] || []; return ids.map(function (v) { var j = (cat.java || []).filter(function (x) { return x.id === v; })[0]; return { id: v, type: j ? j.type : 'release', released: j && j.released }; }); }
    function draw() {
      var fls = mcv.meta.flavours, steps = ['Edition and flavour', 'Version', 'Where it runs', 'World', 'Agree and create'], b = '';
      if (w.step === 1) b = '<div class="igrid">' + Object.keys(fls).map(function (k) { var f = fls[k]; return '<button class="extcard" style="text-align:left;border:' + (w.flavour === k ? '2px solid var(--p)' : '0') + ';font:inherit;color:inherit;cursor:pointer" data-nwfl="' + k + '" aria-pressed="' + (w.flavour === k) + '"><span class="ll">' + esc(f.name) + '</span><span class="bs mu">' + (f.edition === 'bedrock' ? 'Bedrock edition: phones, consoles, Windows' : { vanilla: 'Mojang\'s own server, unchanged', paper: 'Faster, with Bukkit and Paper plugins', purpur: 'Paper with more settings', fabric: 'Lightweight mods', quilt: 'Fabric-compatible mods', forge: 'The classic mod loader', neoforge: 'Modern Forge mods' }[k]) + '</span></button>'; }).join('') + '</div>';
      if (w.step === 2) { var vs = versions(), vq = matcher(w.vq), chans = ['release', 'snapshot', 'old_beta', 'old_alpha'], shown = vs.filter(function (v) { return (w.channels[v.type] || w.flavour === 'bedrock') && vq.test(v.id); }); b = '<div class="chipline" role="group" aria-label="Channels">' + chans.map(function (c) { var n = vs.filter(function (v) { return v.type === c; }).length; return n ? '<button class="chip' + (w.channels[c] ? ' sel' : '') + '" data-nwch="' + c + '" aria-pressed="' + !!w.channels[c] + '">' + { release: 'Releases', snapshot: 'Snapshots and pre-releases', old_beta: 'Old betas', old_alpha: 'Old alphas' }[c] + ' ' + n + '</button>' : ''; }).join('') + '</div>' + findField('nwvq', 'Search versions', w.vq) + '<p class="bs mu">' + shown.length + ' of ' + vs.length + ' shown · ' + (cat.demo ? 'demo sample; the app reads the whole official catalogue' : cat.at ? 'catalogue from ' + esc(when(cat.at)) : 'catalogue not loaded') + (cat.errors && Object.keys(cat.errors).length ? ' · could not refresh: ' + esc(Object.keys(cat.errors).join(', ')) + ', the last good copy is used' : '') + '</p><div class="col" style="gap:2px;max-height:300px;overflow:auto" role="listbox" aria-label="Versions">' + shown.slice(0, 400).map(function (v) { return '<button class="trow" role="option" aria-selected="' + (w.version === v.id) + '" data-nwv="' + esc(v.id) + '" style="min-height:40px"><span class="ll mono grow">' + esc(v.id) + '</span><span class="bs mu">' + esc(v.type.replace('_', ' ')) + (v.released ? ' · ' + esc(v.released.slice(0, 10)) : '') + '</span></button>'; }).join('') + '</div>' + (w.flavour === 'vanilla' ? '<p class="bs mu">Some very old versions have no server from Mojang; the app checks the chosen one before creating.</p>' : ''); }
      if (w.step === 3) { var fl = fls[w.flavour]; b = '<div class="col" style="gap:6px">' + Object.keys(mcv.meta.targets).map(function (t) { var bad = /process/.test(t) && !fl.local ? fl.why : /ssh/.test(t) && !D.hosts.length ? 'Add an SSH host first, on the SSH hosts tab.' : ''; return '<button class="trow" role="option" aria-selected="' + (w.target === t) + '" data-nwt="' + t + '"' + (bad ? ' disabled' : '') + '><span class="sq">' + icon(/docker/.test(t) ? 'Docker' : 'LanguageJava', 's') + '</span><span class="col grow"><span class="ll">' + esc(mcv.meta.targets[t]) + '</span><span class="bs mu">' + esc(bad || (/docker/.test(t) ? 'The itzg/minecraft-server image, with the right Java chosen for the version' : 'Needs Java on that computer' + (t === 'process' && API.platform === 'win32' ? '; it is installed with Chocolatey if missing' : ''))) + '</span></span></button>'; }).join('') + '</div>' + (/ssh/.test(w.target) ? '<label class="col"><span class="ll">SSH host</span><select class="select" id="nwhost">' + D.hosts.map(function (h) { return '<option value="' + h.id + '"' + (h.id === w.hostId ? ' selected' : '') + '>' + esc(h.name) + '</option>'; }).join('') + '</select></label>' : '') + '<div class="row" style="gap:16px;flex-wrap:wrap"><label class="col"><span class="ll">Port</span>' + stepper('nwport', w.port, 1024, 65535, 1, 'Port') + '</label><label class="col"><span class="ll">Memory</span><span class="row" style="gap:8px"><input type="range" min="1024" max="32768" step="512" value="' + w.memoryMb + '" id="nwmemr" aria-label="Memory slider">' + stepper('nwmem', w.memoryMb, 512, 65536, 512, 'Memory', 'MB') + '</span></label></div>'; }
      if (w.step === 4) b = '<div class="plan"><label><span class="ll">Name</span><input class="input" id="nwname" value="' + esc(w.name) + '" maxlength="60"></label><label><span class="ll">Seed</span><input class="input mono" id="nwseed" value="' + esc(w.seed) + '" placeholder="Random"></label><label><span class="ll">World preset</span><select class="select" id="nwlt">' + ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'].map(function (t) { return '<option' + (t === w.levelType ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label><label><span class="ll">Most players</span>' + stepper('nwmax', w.maxPlayers, 1, 1000, 1, 'Most players') + '</label></div><div class="setting"><span class="ll grow">Difficulty</span>' + seg2('nwdiff', w.difficulty, [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], 'Difficulty') + '</div><div class="setting"><span class="ll grow">Game mode</span>' + seg2('nwgm', w.gamemode, [['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure']], 'Game mode') + '</div><div class="setting"><span class="ll grow">Hardcore</span><button class="sw' + (w.hardcore ? ' on' : '') + '" role="switch" aria-checked="' + w.hardcore + '" aria-label="Hardcore" data-nwhc><i></i></button></div>';
      if (w.step === 5) b = '<div class="kv"><span>Edition and flavour</span><b>' + esc(fls[w.flavour].name) + '</b><span>Version</span><b>' + esc(w.version || 'LATEST') + '</b><span>Where</span><b>' + esc(mcv.meta.targets[w.target]) + '</b><span>Port and memory</span><b>' + w.port + ', ' + w.memoryMb + ' MB</b><span>World</span><b>' + esc(w.levelType + ', ' + w.difficulty + ', ' + w.gamemode + (w.hardcore ? ', hardcore' : '')) + '</b></div><label class="row bm" style="gap:8px"><input type="checkbox" id="nweula"' + (w.eula ? ' checked' : '') + '> I accept the <a href="#" data-ext="https://aka.ms/MinecraftEULA">Minecraft End User Licence Agreement</a></label><span class="field-err" id="nwerr" role="alert"></span>';
      dialog('New Minecraft server', '<ol class="stepper" aria-label="Steps">' + steps.map(function (n, i) { var k = i + 1; return '<li class="' + (k < w.step ? 'ok' : k === w.step ? 'cur' : '') + '"' + (k === w.step ? ' aria-current="step"' : '') + '><span class="sq ' + (k < w.step ? 'ok' : k === w.step ? 'now' : 'todo') + '">' + (k < w.step ? icon('Check', 's') : k) + '</span><span class="ll ell">' + n + '</span></li>'; }).join('') + '</ol>' + b + '<div class="row" style="gap:8px"><button class="btn text" id="nwback"' + (w.step === 1 ? ' disabled' : '') + '>' + L('back') + '</button><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="nwnext">' + (w.step === 5 ? 'Create the server' : L('next')) + '</button></div>', { wide: true, emoji: '⛏️' });
      var ov = $('#ov');
      ov.addEventListener('click', function (e) { var t = e.target.closest('[data-nwfl],[data-nwch],[data-nwv],[data-nwt],[data-nwdiff],[data-nwgm],[data-nwhc]'); if (!t) return; keep(); if (t.dataset.nwfl) { w.flavour = t.dataset.nwfl; w.edition = fls[w.flavour].edition; w.version = ''; if (w.target === 'process' && !fls[w.flavour].local) w.target = 'docker'; } if (t.dataset.nwch) w.channels[t.dataset.nwch] = !w.channels[t.dataset.nwch]; if (t.dataset.nwv) w.version = t.dataset.nwv; if (t.dataset.nwt) w.target = t.dataset.nwt; if (t.dataset.nwdiff) w.difficulty = t.dataset.nwdiff; if (t.dataset.nwgm) w.gamemode = t.dataset.nwgm; if (t.dataset.nwhc != null) w.hardcore = !w.hardcore; draw(); });
      ov.addEventListener('input', function (e) { if (e.target.id === 'nwvq') { w.vq = e.target.value; var pos = e.target.selectionStart; draw(); var f = $('#nwvq'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } } if (e.target.id === 'nwmemr') { var m2 = $('#nwmem'); if (m2) m2.value = e.target.value; } if (e.target.id === 'nwmem') { var r2 = $('#nwmemr'); if (r2) r2.value = e.target.value; } });
      $('#nwback').onclick = function () { keep(); w.step--; draw(); };
      $('#nwnext').onclick = function () {
        keep();
        if (w.step === 2 && !w.version) { toast('Choose a version.'); return; }
        if (w.step < 5) { w.step++; draw(); return; }
        if (!w.eula) { $('#nwerr').textContent = 'The server only starts after you accept the Minecraft EULA.'; return; }
        var o = { name: w.name, flavour: w.flavour, version: w.version, target: w.target, hostId: /ssh/.test(w.target) ? w.hostId : '', port: w.port, memoryMb: w.memoryMb, eula: true, props: w.flavour === 'bedrock' ? {} : { 'level-seed': w.seed, 'level-type': w.levelType, difficulty: w.difficulty, gamemode: w.gamemode, hardcore: w.hardcore, 'max-players': w.maxPlayers } };
        closeDialog();
        if (DEMO) { var d2 = Object.assign({ id: 'mc' + Date.now(), slug: 'demo', edition: w.edition, lastState: 'stopped', backups: [], schedule: {}, created: new Date().toISOString() }, o); mcv.list.push(d2); mcv.sel = d2.id; render(); toast('Demo: in the app this creates the server.'); return; }
        toast('Creating ' + o.name + '…'); mcv.sub = 'console';
        API.mc('create', o).then(function (s) { mcv.sel = s.id; return mcLoad(); }).then(function () { render(); toast(o.name + ' is created. Start it when you are ready.'); finishedOne(); }, function (e) { toast(e.message); if (/Java/.test(e.message) && API.platform === 'win32') chocoRun(['java']); mcLoad().then(render); });
      };
      function keep() { var g2 = function (id) { var el = $('#' + id); return el ? el.value : null; }; if (g2('nwname') != null) w.name = g2('nwname'); if (g2('nwseed') != null) w.seed = g2('nwseed'); if (g2('nwlt')) w.levelType = g2('nwlt'); if (g2('nwmax')) w.maxPlayers = +g2('nwmax'); if (g2('nwport')) w.port = +g2('nwport'); if (g2('nwmem')) w.memoryMb = +g2('nwmem'); if (g2('nwhost')) w.hostId = g2('nwhost'); var eu = $('#nweula'); if (eu) w.eula = eu.checked; }
    }
    draw();
  }

  // ---------- Local AI models (Ollama) ----------
  var olv = { sub: 'installed', health: null, models: null, lib: null, hw: null, tags: {}, open: '', cart: [], parallel: 1, pulls: {}, chat: { model: '', msgs: [], system: '', temp: 0.7, ctx: 4096, busy: false, id: '' }, q: '', cap: '' };
  async function olLoad() { if (DEMO) { olv.health = { running: true, version: '0.5.7', owned: false }; olv.models = [{ name: 'llama3.2:3b', size: 2.0e9, parameters: '3.2B', quantization: 'Q4_K_M', family: 'llama', running: true, vram: 2.4e9 }, { name: 'nomic-embed-text:latest', size: 2.7e8, parameters: '137M', quantization: 'F16', family: 'nomic-bert', running: false }]; olv.hw = { ram: 32e9, gpus: [{ name: 'NVIDIA GeForce RTX 4070', vram: 12e9 }], free: 420e9, cpus: 16 }; return; } try { olv.health = await API.ol('health'); olv.hw = olv.hw || await API.ol('hardware'); olv.models = olv.health.running ? await API.ol('installed') : []; } catch (e) { toast(e.message); } }
  function fitOf(size) { var hw = olv.hw; if (!hw || !size) return { verdict: 'Unknown', why: 'No size or hardware facts yet.' }; var need = size * 1.2, vram = Math.max.apply(null, [0].concat(hw.gpus.map(function (g) { return g.vram || 0; }))); if (hw.free && size > hw.free) return { verdict: 'Unlikely', why: 'Needs ' + fmtSize(size) + ' of disk; ' + fmtSize(hw.free) + ' free.' }; if (vram && need <= vram) return { verdict: 'Runs well', why: 'About ' + fmtSize(need) + ' with context fits in ' + fmtSize(vram) + ' of graphics memory.' }; if (need <= vram + hw.ram * 0.7) return { verdict: 'Runs with limits', why: 'Spills from graphics memory (' + fmtSize(vram) + ') into system memory (' + fmtSize(hw.ram) + '); slower.' }; return { verdict: 'Unlikely', why: 'About ' + fmtSize(need) + ' is more than this computer can hold.' }; }
  function fitTag(f) { return '<span class="tag ' + (f.verdict === 'Runs well' ? 'g' : f.verdict === 'Unknown' ? '' : 'a') + '" title="' + esc(f.why) + '">' + esc(f.verdict) + '</span>'; }
  R.models = function () {
    if (!olv.health) { olLoad().then(function () { if (st.active === 'models') render(); }); return '<div class="section" id="top"><h1 class="hl">Local AI models</h1><p class="bm mu" role="status">Looking for Ollama…</p></div>'; }
    var h = olv.health, hw = olv.hw || { ram: 0, gpus: [], free: 0 };
    var head = pageHead('Robot', 'Local AI models', 'Run language models on this computer with Ollama. Nothing you type leaves it.', [[(olv.models || []).length, 'Installed'], [(olv.models || []).filter(function (x) { return x.running; }).length, 'In memory'], [fmtSize(hw.free), 'Free for models'], [olv.cart.length, 'To pull']]) + '<div class="wizbar"><span class="tag ' + (h.running ? 'g' : 'a') + '">' + (h.running ? 'Ollama ' + esc(h.version) + (h.owned ? ', run by this app' : '') : 'Ollama is not running') + '</span>' + (h.running ? (h.owned ? '<button class="btn tonal sm" data-act="olstop">Stop</button>' : '') : (h.install ? '<button class="btn fill sm" data-act="olstart">' + icon('Play', 's') + 'Start Ollama ' + esc(h.install.version) + '</button>' : '<button class="btn fill sm" data-act="olinstall">' + icon('Download', 's') + 'Install Ollama</button>' + chocoButton('ollama', 'Or with Chocolatey'))) + '</div>' +
      '<div class="stats" data-k="olhw"><div class="stat"><b>' + fmtSize(hw.ram) + '</b><span>Memory</span></div><div class="stat"><b>' + (hw.gpus[0] ? fmtSize(hw.gpus[0].vram) : 'None found') + '</b><span>' + esc(hw.gpus[0] ? hw.gpus[0].name : 'Graphics memory') + '</span></div><div class="stat"><b>' + fmtSize(hw.free) + '</b><span>Free for models</span></div><div class="stat"><b>' + (olv.models || []).length + '</b><span>Installed</span></div></div>';
    var subs = [['installed', 'Installed'], ['store', 'Model library'], ['cart', 'Pull list (' + olv.cart.length + ')'], ['chat', 'Chat']];
    var b = '';
    if (!h.running && olv.sub !== 'store') b = '<div class="empty"><p class="bl">Ollama is not running.</p><p class="bm mu">Install puts the official Ollama release, checked against its SHA-256, into this app\'s own folder. Start runs it on 127.0.0.1:11434 as a process this app owns and stops. An Ollama you installed yourself is used when it is running.</p></div>';
    else if (olv.sub === 'installed') b = (olv.models.length ? '<table class="t"><thead><tr><th>Model</th><th>Size</th><th>Parameters</th><th>Quantisation</th><th>In memory</th><th></th></tr></thead><tbody>' + olv.models.map(function (m) { return '<tr><td class="ll mono">' + esc(m.name) + '</td><td>' + fmtSize(m.size) + '</td><td>' + esc(m.parameters || '') + '</td><td>' + esc(m.quantization || '') + '</td><td>' + (m.running ? '<span class="tag g">' + fmtSize(m.vram || 0) + ' on the graphics card</span>' : '') + '</td><td class="row" style="gap:4px"><button class="btn text sm" data-olshow="' + esc(m.name) + '">Details</button><button class="btn text sm" data-olchat="' + esc(m.name) + '">Chat</button>' + (m.running ? '<button class="btn text sm" data-olunload="' + esc(m.name) + '">Unload</button>' : '') + '<button class="btn text sm" data-olcopy="' + esc(m.name) + '">Copy</button><button class="btn text sm" data-oldel="' + esc(m.name) + '">Delete</button></td></tr>'; }).join('') + '</tbody></table>' : '<p class="bm mu">No models yet. Find one in the Model library.</p>');
    else if (olv.sub === 'store') {
      if (!olv.lib) { (DEMO ? Promise.resolve({ at: new Date().toISOString(), count: 3, complete: 'Demo', models: [{ name: 'llama3.2', description: 'Meta\'s small Llama 3.2 models.', capabilities: ['tools'], sizes: ['1b', '3b'], pulls: '30M', tagCount: 63, updated: '1 year ago' }, { name: 'qwen3', description: 'Alibaba\'s Qwen 3 family.', capabilities: ['tools', 'thinking'], sizes: ['0.6b', '4b', '8b', '32b'], pulls: '9M', tagCount: 58, updated: '3 months ago' }, { name: 'nomic-embed-text', description: 'Text embeddings.', capabilities: ['embedding'], sizes: [], pulls: '45M', tagCount: 3, updated: '1 year ago' }] }) : API.ol('library')).then(function (l) { olv.lib = l; render(); }, function (e) { olv.lib = { error: e.message, models: [] }; render(); }); return head + '<p class="bm mu" role="status">Reading the Ollama library…</p>'; }
      var m = matcher(olv.q), caps = {}; olv.lib.models.forEach(function (x) { x.capabilities.forEach(function (c) { caps[c] = (caps[c] || 0) + 1; }); });
      var shown = olv.lib.models.filter(function (x) { return m.test(x.name + ' ' + x.description) && (!olv.cap || x.capabilities.indexOf(olv.cap) >= 0); });
      b = (olv.lib.error ? '<div class="note"><span>' + icon('Alert') + '</span><span class="bm">' + esc(olv.lib.error) + '</span></div>' : '<p class="bs mu">' + olv.lib.count + ' models from ollama.com/library, read ' + esc(when(olv.lib.at)) + '. <button class="btn text sm" data-act="olrefresh">Read it again</button></p>') + findField('olq', 'Search models', olv.q) + '<div class="chipline"><button class="chip' + (!olv.cap ? ' sel' : '') + '" data-olcap="">Every kind</button>' + Object.keys(caps).map(function (c) { return '<button class="chip' + (olv.cap === c ? ' sel' : '') + '" data-olcap="' + esc(c) + '">' + esc(c) + ' ' + caps[c] + '</button>'; }).join('') + '</div><p class="bs mu">' + shown.length + ' shown</p>' +
        shown.slice(0, 300).map(function (x) { var open = olv.open === x.name, t = olv.tags[x.name]; return '<div class="card" style="padding:14px" data-k="olm-' + esc(x.name) + '"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="ll mono grow">' + esc(x.name) + '</span>' + x.capabilities.map(function (c) { return '<span class="tag p">' + esc(c) + '</span>'; }).join('') + x.sizes.map(function (z) { return '<span class="tag">' + esc(z) + '</span>'; }).join('') + '<span class="bs mu">' + esc(x.pulls) + ' pulls · ' + x.tagCount + ' tags · ' + esc(x.updated) + '</span><button class="btn text sm" data-oltags="' + esc(x.name) + '">' + (open ? 'Hide' : 'Every variant') + '</button></div><p class="bs mu">' + esc(x.description) + '</p>' +
          (open ? (t ? '<table class="t"><thead><tr><th>Tag</th><th>Download</th><th>Context</th><th>Input</th><th>On this computer</th><th></th></tr></thead><tbody>' + t.tags.map(function (g) { var f = fitOf(g.size); var inCart = olv.cart.indexOf(g.name) >= 0; var have = (olv.models || []).some(function (mm) { return mm.name === g.name; }); return '<tr><td class="mono">' + esc(g.tag) + '</td><td>' + (g.size ? fmtSize(g.size) : '?') + '</td><td>' + esc(g.context) + '</td><td>' + esc(g.input) + '</td><td>' + fitTag(f) + ' <span class="bs mu">' + esc(f.why) + '</span></td><td>' + (have ? '<span class="tag g">Installed</span>' : '<button class="btn ' + (inCart ? 'text' : 'tonal') + ' sm" data-olcart="' + esc(g.name) + '" data-olsize="' + g.size + '">' + (inCart ? 'In the list' : 'Add to the pull list') + '</button>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="bs mu" role="status">Reading its variants…</p>') : '') + '</div>'; }).join('');
    }
    else if (olv.sub === 'cart') { var total = 0; olv.cart.forEach(function (n) { total += (olv.cartSize || {})[n] || 0; }); b = '<p class="bm mu">Pulling downloads from Ollama\'s registry; there is no price or account. Each pull can be cancelled.</p>' + (olv.cart.length ? olv.cart.map(function (n) { var p = olv.pulls[n]; return '<div class="row-item"><span class="col grow"><span class="ll mono">' + esc(n) + '</span><span class="bs mu">' + fmtSize((olv.cartSize || {})[n] || 0) + (p ? ' · ' + esc(p.status) + (p.total ? ' ' + Math.round(p.completed / p.total * 100) + '%' : '') + (p.error ? ': ' + esc(p.error) : '') : '') + '</span>' + (p && p.total && !p.done ? '<span class="pbar"><i style="width:' + Math.round(p.completed / p.total * 100) + '%"></i></span>' : '') + '</span>' + (p && !p.done ? '<button class="btn text sm" data-olcancel="' + esc(n) + '">' + L('cancel') + '</button>' : '<button class="btn text sm" data-oluncart="' + esc(n) + '">Remove</button>') + '</div>'; }).join('') + '<div class="row" style="gap:12px;flex-wrap:wrap"><span class="bm">Together ' + fmtSize(total) + ' of ' + fmtSize(olv.hw ? olv.hw.free : 0) + ' free.</span><label class="row bs" style="gap:6px">At once ' + stepper('olpar', olv.parallel, 1, 4, 1, 'Pulls at once') + '</label><span class="grow"></span><button class="btn fill" data-act="olpull"' + (total > (olv.hw ? olv.hw.free : Infinity) ? ' disabled title="Not enough free space"' : '') + '>' + icon('Download', 's') + 'Pull ' + olv.cart.length + '</button></div>' : '<p class="bm mu">Nothing in the list. Add variants from the Model library.</p>'); }
    else if (olv.sub === 'chat') { var c = olv.chat; if (!c.model && olv.models[0]) c.model = olv.models[0].name; b = '<div class="row" style="gap:8px;flex-wrap:wrap"><select class="select" id="olcm" aria-label="Model">' + olv.models.map(function (mm) { return '<option' + (mm.name === c.model ? ' selected' : '') + '>' + esc(mm.name) + '</option>'; }).join('') + '</select><label class="row bs" style="gap:6px">Temperature <input type="range" min="0" max="2" step="0.1" value="' + c.temp + '" id="oltemp" aria-label="Temperature"> ' + c.temp + '</label><label class="row bs" style="gap:6px">Context ' + stepper('olctx', c.ctx, 512, 131072, 512, 'Context window', 'tokens') + '</label><button class="btn text sm" data-act="olclear">' + L('clear') + '</button><button class="btn text sm" data-act="olexport">' + icon('Export', 's') + L('export') + '</button></div><details class="fold"><summary class="ll">System prompt</summary><textarea class="input" id="olsys" rows="3">' + esc(c.system) + '</textarea></details><div class="chatlog" id="olchat" aria-live="polite">' + (c.msgs.length ? c.msgs.map(function (mm) { return '<div class="msg ' + mm.role + '"><span class="bs mu">' + (mm.role === 'user' ? 'You' : esc(c.model)) + (mm.stats ? ' · ' + mm.stats.tokens + ' tokens, ' + (mm.stats.tokens / Math.max(0.01, mm.stats.seconds)).toFixed(1) + ' per second' : '') + '</span><div class="bm" style="white-space:pre-wrap">' + esc(mm.content) + '</div></div>'; }).join('') : '<p class="bm mu">Everything stays on this computer.</p>') + '</div><div class="row" style="gap:8px"><textarea class="input grow" id="olin" rows="2" placeholder="Ask anything (Ctrl Enter sends)" aria-label="Message"></textarea>' + (c.busy ? '<button class="btn tonal" data-act="olstopchat">Stop</button>' : '<button class="btn fill" data-act="olsend"' + (olv.models.length ? '' : ' disabled') + '>Send</button>') + '</div>'; }
    return head + '<div class="chipline" role="tablist">' + subs.map(function (x) { return '<button class="chip' + (olv.sub === x[0] ? ' sel' : '') + '" role="tab" aria-selected="' + (olv.sub === x[0]) + '" data-olsub="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><section class="section" data-k="olbody">' + b + '</section>' + foot();
  };
  function olSend() {
    var c = olv.chat, t = $('#olin').value.trim(); if (!t || c.busy) return; c.system = ($('#olsys') || {}).value || c.system; c.msgs.push({ role: 'user', content: t }); c.msgs.push({ role: 'assistant', content: '' }); c.busy = true; c.id = 'c' + Date.now(); render();
    var msgs = (c.system ? [{ role: 'system', content: c.system }] : []).concat(c.msgs.slice(0, -1));
    if (DEMO) { var words = 'This is the demo. In the app, the model you chose answers here word by word, on this computer.'.split(' '), i = 0; var iv = setInterval(function () { c.msgs[c.msgs.length - 1].content += words[i++] + ' '; var b = $('#olchat'); if (b) b.lastElementChild.querySelector('.bm').textContent = c.msgs[c.msgs.length - 1].content; if (i >= words.length) { clearInterval(iv); c.busy = false; render(); } }, 80); return; }
    API.ol('chat', c.id, c.model, msgs, { temperature: c.temp, num_ctx: c.ctx }).catch(function (e) { c.busy = false; toast(e.message); render(); });
  }

  // ---------- Windows virtual disks ----------
  var vdv = { lib: null, routes: null, q: '', sort: 'path', log: [] };
  async function vdLoad() { if (DEMO) { vdv.routes = { windows: false, preview: true, storage: true, diskpart: true, hyperv: false }; vdv.lib = { disks: [{ path: 'D:\\VMs\\games.vhdx', format: 'VHDX', type: 'Dynamic', size: 256 * 1073741824, fileSize: 41 * 1073741824, attached: true, number: 3, partitions: [{ letter: 'G', fs: 'NTFS', size: 255e9, free: 210e9, label: 'Games' }] }, { path: 'D:\\ISO\\ubuntu-24.04.iso', format: 'ISO', size: 6e9, fileSize: 6e9, attached: false }] }; return; } try { vdv.routes = await API.vd('routes'); vdv.lib = vdv.routes.windows ? await API.vd('library') : { disks: [] }; vdv.log = await API.vdLog(); } catch (e) { toast(e.message); } }
  R.disks = function () {
    if (!vdv.routes) { vdLoad().then(function () { if (st.active === 'disks') render(); }); return '<div class="section" id="top"><h1 class="hl">Virtual disks</h1><p class="bm mu" role="status">Finding what this Windows can do…</p></div>'; }
    var r = vdv.routes, m = matcher(vdv.q);
    var routes = '<div class="chipline" aria-label="Routes on this computer">' + [['storage', 'Storage module'], ['diskpart', 'DiskPart'], ['hyperv', 'Hyper-V module']].map(function (x) { return '<span class="tag ' + (r[x[0]] ? 'g' : '') + '">' + x[1] + (r[x[0]] ? '' : ': not on this computer') + '</span>'; }).join('') + '</div>' + (r.windows ? '' : '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">' + (DEMO ? 'Demo. ' : '') + 'Running operations needs Windows. Here you can still plan any operation and copy its PowerShell and DiskPart scripts to run there.</span></div>') + (r.windows && !r.hyperv ? '<p class="bs mu">Without the Hyper-V module, converting, shrinking, VHD Sets and block or sector sizes are unavailable; everything else works through the Storage module and DiskPart. The app never turns Hyper-V on for you.</p>' : '');
    var disks = (vdv.lib.disks || []).filter(function (d) { return m.test(d.path + ' ' + d.format + ' ' + (d.type || '')); }).sort(function (a, b) { return vdv.sort === 'size' ? (b.size || 0) - (a.size || 0) : String(a[vdv.sort] || '').localeCompare(String(b[vdv.sort] || '')); });
    var table = '<div class="toolbar">' + findField('vdq', 'Search virtual disks', vdv.q) + '<select class="select" data-vdsort aria-label="Sort">' + [['path', 'By path'], ['format', 'By format'], ['size', 'By size']].map(function (o) { return '<option value="' + o[0] + '"' + (vdv.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><button class="btn fill sm" data-act="vdcreate">' + icon('Plus', 's') + 'Create</button><button class="btn tonal sm" data-act="vdadd">Add files</button><button class="btn text sm" data-act="vdscan">Scan a folder</button><button class="btn text sm" data-act="vdrefresh">' + icon('Refresh', 's') + 'Refresh</button></div>' +
      (disks.length ? disks.map(function (d) { return '<div class="card" style="padding:14px" data-k="vd-' + esc(d.path) + '"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="sq">' + icon(d.format === 'ISO' ? 'Disc' : 'Harddisk', 's') + '</span><span class="col grow" style="min-width:0"><span class="ll mono ell">' + esc(d.path) + '</span><span class="bs mu">' + esc(d.format) + (d.type ? ', ' + esc(d.type) : '') + ' · ' + fmtSize(d.size || 0) + ' virtual, ' + fmtSize(d.fileSize || 0) + ' on disk' + (d.minSize ? ' · smallest safe ' + fmtSize(d.minSize) : '') + (d.block ? ' · block ' + fmtSize(d.block) : '') + (d.logical ? ' · sectors ' + d.logical + '/' + d.physical : '') + (d.fragmentation != null ? ' · ' + d.fragmentation + '% fragmented' : '') + (d.parent ? ' · parent ' + esc(d.parent) : '') + '</span>' + ((d.partitions || []).length ? '<span class="bs">' + d.partitions.map(function (p) { return (p.letter ? p.letter + ': ' : '') + (p.label || 'Partition ' + p.number) + ', ' + (p.fs || '?') + ', ' + fmtSize(p.free || 0) + ' free of ' + fmtSize(p.size || 0); }).join(' · ') + '</span>' : '') + '</span><span class="tag ' + (d.attached ? 'g' : '') + '">' + (d.attached ? 'Attached as disk ' + d.number : 'Not attached') + '</span></div><div class="chipline">' + (d.attached ? '<button class="btn tonal sm" data-vdop="detach" data-vdp="' + esc(d.path) + '">Detach</button>' : '<button class="btn tonal sm" data-vdop="attach" data-vdp="' + esc(d.path) + '">Attach…</button>') + (d.format === 'ISO' ? '' : ['resize|Resize…', 'compact|Compact…', 'convert|Convert…', 'merge|Merge into parent…', 'child|New child disk…'].map(function (x) { var p = x.split('|'); return '<button class="btn text sm" data-vdop="' + p[0] + '" data-vdp="' + esc(d.path) + '">' + p[1] + '</button>'; }).join('')) + (d.attached && d.number != null ? '<button class="btn text sm" data-vdop="online" data-vdp="' + esc(d.path) + '" data-vdn="' + d.number + '">Online and read-only…</button>' : '') + (d.format === 'VHDS' ? '<button class="btn text sm" data-vdop="snapshot" data-vdp="' + esc(d.path) + '">Checkpoints…</button>' : '') + '<button class="btn text sm" data-vdforget="' + esc(d.path) + '">Forget</button></div></div>'; }).join('') : '<div class="empty"><p class="bm mu">No virtual disks yet. Create one, add files, scan a folder, or drop .vhd, .vhdx, .vhds, .avhdx or .iso files on the window.</p></div>');
    var log = (vdv.log || []).slice(0, 30);
    var dd = vdv.lib.disks || []; return pageHead('Harddisk', 'Virtual disks', 'VHD, VHDX, VHD Set and ISO files on Windows. Every operation shows its PowerShell and DiskPart script first; administrator steps ask once.', [[dd.length, 'In the library'], [dd.filter(function (d) { return d.attached; }).length, 'Attached'], [fmtSize(dd.reduce(function (a2, d) { return a2 + (d.size || 0); }, 0)), 'Virtual size'], [fmtSize(dd.reduce(function (a2, d) { return a2 + (d.fileSize || 0); }, 0)), 'On disk']]) + '<div class="section">' + routes + '</div><section class="section" data-k="vdlib">' + table + '</section><section class="section" data-k="vdlog"><h2 class="tl">What was done</h2>' + (log.length ? log.map(function (e) { return '<div class="row-item"><span class="tag ' + (e.ok ? 'g' : 'a') + '">' + (e.ok ? 'Done' : 'Failed') + '</span><span class="col grow"><span class="ll">' + esc(e.title) + '</span><span class="bs mu">' + esc(when(e.at)) + ' · route ' + esc(e.route) + ' · ' + esc(String(e.detail || '').slice(0, 200)) + '</span></span></div>'; }).join('') : '<p class="bm mu">Nothing yet.</p>') + '</section>' + foot();
  };
  // One dialog per operation: typed options, then the scripts, then Run as administrator.
  function vdDialog(op, p, extra) {
    var o = Object.assign({ path: p }, extra || {}), titles = { create: 'Create a virtual disk', child: 'New child (differencing) disk', attach: 'Attach', detach: 'Detach', resize: 'Resize', compact: 'Compact', convert: 'Convert', merge: 'Merge into the parent', online: 'Online and read-only', snapshot: 'VHD Set checkpoints' };
    if (op === 'child') { o = { parent: p, path: p.replace(/(\.\w+)$/, '-child$1'), type: 'differencing' }; op = 'create'; }
    function form() {
      if (op === 'create') return '<div class="plan"><label><span class="ll">File</span><span class="row" style="gap:6px"><input class="input mono grow" id="vd-path" value="' + esc(o.path || 'C:\\VirtualDisks\\new.vhdx') + '"><button class="btn text sm" data-act="vdsaveas">Browse…</button></span></label>' + (o.type === 'differencing' ? '<label><span class="ll">Parent</span><input class="input mono" id="vd-parent" value="' + esc(o.parent) + '"></label>' : '<label><span class="ll">Size</span><span class="row" style="gap:6px"><input class="input" type="number" id="vd-size" min="1" value="' + esc(o.size || 64) + '" style="width:110px">' + seg2('vdunit', o.unit || 'GB', [['MB', 'MB'], ['GB', 'GB'], ['TB', 'TB']], 'Unit') + '</span></label>') + '</div>' + (o.type === 'differencing' ? '' : '<div class="setting"><span class="ll grow">Type</span>' + seg2('vdtype', o.type || 'dynamic', [['dynamic', 'Dynamically expanding'], ['fixed', 'Fixed size']], 'Type') + '</div><details class="fold"><summary class="ll">VHDX options</summary><div class="plan"><label><span class="ll">Block size</span><select class="select" id="vd-block"><option value="">Default</option>' + [1, 2, 4, 8, 16, 32, 64, 128, 256].map(function (b) { return '<option value="' + b + '">' + b + ' MB</option>'; }).join('') + '</select></label><label><span class="ll">Logical sectors</span><select class="select" id="vd-log"><option value="">Default</option><option>512</option><option>4096</option></select></label><label><span class="ll">Physical sectors</span><select class="select" id="vd-phy"><option value="">Default</option><option>512</option><option>4096</option></select></label></div></details><div class="setting"><span class="ll grow">Prepare it for use (partition and format)</span><button class="sw' + (o.init ? ' on' : '') + '" role="switch" aria-checked="' + !!o.init + '" aria-label="Prepare it" data-vdinit><i></i></button></div>' + (o.init ? '<div class="plan"><label><span class="ll">Partition style</span><select class="select" id="vd-style"><option>GPT</option><option>MBR</option></select></label><label><span class="ll">File system</span><select class="select" id="vd-fs"><option>NTFS</option><option>ReFS</option><option>exFAT</option><option>FAT32</option></select></label><label><span class="ll">Label</span><input class="input" id="vd-label" value="Virtual disk" maxlength="32"></label><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-letter" checked> Give it a drive letter</label><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-keep"> Leave it attached</label></div>' : ''));
      if (op === 'attach') return '<label class="row bm" style="gap:8px"><input type="checkbox" id="vd-ro"' + (/\.iso$/i.test(p) ? ' checked disabled' : '') + '> Read-only' + (/\.iso$/i.test(p) ? ' (ISO files always are)' : '') + '</label><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-nl"> No drive letter</label><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-signin"> Attach again at every sign-in (a scheduled task you can remove)</label>';
      if (op === 'detach') return '<p class="bm">Programs using it are named first, and nothing is forced unless you choose.</p><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-force"> Detach even if files are open</label><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-untask"> Also remove its sign-in task</label>';
      if (op === 'resize') return '<div class="setting"><span class="ll grow">Direction</span>' + seg2('vddir', o.direction || 'grow', [['grow', 'Grow'], ['shrink', 'Shrink (VHDX)', /\.vhdx$/i.test(p) ? '' : 'Only a VHDX can shrink']], 'Direction') + '</div><label class="col"><span class="ll">New size</span><span class="row" style="gap:6px"><input class="input" type="number" id="vd-size" value="' + esc(o.size || 128) + '" style="width:110px">' + seg2('vdunit', o.unit || 'GB', [['MB', 'MB'], ['GB', 'GB'], ['TB', 'TB']], 'Unit') + '</span></label><label class="row bm" style="gap:8px"><input type="checkbox" id="vd-extend" checked> Extend the last partition into the new space</label>';
      if (op === 'compact') return '<div class="col" style="gap:6px">' + [['Quick', 'Reclaims unused blocks; the disk is attached read-only while it runs'], ['Full', 'Scans the whole disk; it must be detached'], ['Retrim', 'Sends trims for space already freed'], ['Pretrimmed', 'Like Quick, using trims the disk already received'], ['Prezeroed', 'Like Quick, for space already filled with zeros']].map(function (x) { return '<label class="row-item"><input type="radio" name="vdmode" value="' + x[0] + '"' + ((o.mode || 'Quick') === x[0] ? ' checked' : '') + '><span class="col"><span class="ll">' + x[0] + '</span><span class="bs mu">' + x[1] + '</span></span></label>'; }).join('') + '</div><p class="bs mu">Dynamic and differencing disks only. The disk is put in the state the mode needs and put back afterwards.</p>';
      if (op === 'convert') return '<label class="col"><span class="ll">New file</span><input class="input mono" id="vd-dest" value="' + esc(p.replace(/\.vhdx?$/i, function (x) { return x.toLowerCase() === '.vhd' ? '.vhdx' : '.vhd'; })) + '"></label><div class="setting"><span class="ll grow">Type</span>' + seg2('vdtype', o.type || 'dynamic', [['dynamic', 'Dynamic'], ['fixed', 'Fixed']], 'Type') + '</div><p class="bs mu">The original stays until you delete it yourself after checking the new one.</p>';
      if (op === 'merge') return '<p class="bm">This child disk is merged into its parent. Other children of that parent stop working afterwards; check none exist.</p>';
      if (op === 'online') return '<div class="setting"><span class="ll grow">Online</span>' + seg2('vdon', o.offline ? 'off' : 'on', [['on', 'Online'], ['off', 'Offline']], 'Online') + '</div><div class="setting"><span class="ll grow">Read-only</span>' + seg2('vdro', o.readOnly ? 'yes' : 'no', [['no', 'Writable'], ['yes', 'Read-only']], 'Read-only') + '</div>';
      if (op === 'snapshot') return '<div class="setting"><span class="ll grow">Action</span>' + seg2('vdsa', o.action || 'list', [['list', 'List'], ['take', 'Take one'], ['remove', 'Delete one']], 'Checkpoint action') + '</div>' + (o.action === 'take' ? '<input class="input" id="vd-sname" placeholder="Name">' : o.action === 'remove' ? '<input class="input mono" id="vd-sid" placeholder="Checkpoint ID">' : '');
      return '';
    }
    function collect() { var g = function (id) { var e = $('#' + id); return e ? (e.type === 'checkbox' ? e.checked : e.value) : undefined; }; if (g('vd-path') !== undefined) o.path = g('vd-path'); if (g('vd-parent') !== undefined) o.parent = g('vd-parent'); if (g('vd-size') !== undefined) o.size = +g('vd-size'); if (g('vd-block')) o.block = +g('vd-block'); if (g('vd-log')) o.logical = +g('vd-log'); if (g('vd-phy')) o.physical = +g('vd-phy'); if (g('vd-style')) o.style = g('vd-style'); if (g('vd-fs')) o.fs = g('vd-fs'); if (g('vd-label') !== undefined) o.label = g('vd-label'); if (g('vd-letter') !== undefined) o.letter = g('vd-letter'); if (g('vd-keep') !== undefined) o.keepAttached = g('vd-keep'); if (g('vd-ro') !== undefined) o.readOnly = g('vd-ro'); if (g('vd-nl') !== undefined) o.noLetter = g('vd-nl'); if (g('vd-signin') !== undefined) o.atSignIn = g('vd-signin'); if (g('vd-force') !== undefined) o.force = g('vd-force'); if (g('vd-untask') !== undefined) o.removeTask = g('vd-untask'); if (g('vd-extend') !== undefined) o.extend = g('vd-extend'); if (g('vd-dest') !== undefined) o.dest = g('vd-dest'); if (g('vd-sname') !== undefined) o.name = g('vd-sname'); if (g('vd-sid') !== undefined) o.id = g('vd-sid'); var md = document.querySelector('input[name=vdmode]:checked'); if (md) o.mode = md.value; }
    function draw(plan, err) {
      dialog(titles[op] || op, form() + '<div class="row" style="gap:8px"><button class="btn tonal sm" id="vdplan">Show the scripts</button></div>' + (err ? '<p class="field-err" role="alert">' + esc(err) + '</p>' : '') + (plan ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">Route: ' + esc(plan.route) + (plan.admin ? '. Needs administrator rights.' : '.') + (plan.note ? ' ' + esc(plan.note) : '') + '</span></div><details class="fold" open><summary class="ll">PowerShell</summary><pre class="wb-test" style="max-height:200px;overflow:auto">' + esc(plan.ps) + '</pre><button class="btn text sm" data-copy="' + esc(plan.ps) + '">' + icon('ContentCopy', 's') + 'Copy</button></details>' + (plan.diskpart ? '<details class="fold"><summary class="ll">DiskPart</summary><pre class="wb-test">' + esc(plan.diskpart) + '</pre><button class="btn text sm" data-copy="' + esc(plan.diskpart) + '">' + icon('ContentCopy', 's') + 'Copy</button></details>' : '<p class="bs mu">DiskPart has no equivalent for this.</p>') : '') + '<div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="vdrun"' + (plan && vdv.routes.windows ? '' : ' disabled title="' + (vdv.routes.windows ? 'Show the scripts first' : 'Needs Windows') + '"') + '>' + icon('ShieldAccount', 's') + 'Run as administrator</button></div>', { wide: true, emoji: '💽' });
      var ov = $('#ov');
      ov.addEventListener('click', function (e) { var t = e.target.closest('[data-vdunit],[data-vdtype],[data-vddir],[data-vdon],[data-vdro],[data-vdsa],[data-vdinit]'); if (!t) return; collect(); if (t.dataset.vdunit) o.unit = t.dataset.vdunit; if (t.dataset.vdtype) o.type = t.dataset.vdtype; if (t.dataset.vddir) o.direction = t.dataset.vddir; if (t.dataset.vdon) o.offline = t.dataset.vdon === 'off'; if (t.dataset.vdro) o.readOnly = t.dataset.vdro === 'yes'; if (t.dataset.vdsa) o.action = t.dataset.vdsa; if (t.dataset.vdinit != null) o.init = !o.init; draw(); });
      $('#vdplan').onclick = function () { collect(); API.vd('plan', op, o).then(function (pl) { draw(pl); }, function (er) { draw(null, er.message); }); };
      if ($('#vdrun')) $('#vdrun').onclick = function () {
        collect(); var go3 = function () { closeDialog(); toast('Waiting for the administrator prompt…'); API.vd('execute', op, o).then(function (r) { toast(r.title + ': done.'); finishedOne(); vdLoad().then(render); }, function (er) { toast(er.message); vdLoad().then(render); }); };
        if (op === 'merge' || (op === 'resize' && o.direction === 'shrink') || (op === 'snapshot' && o.action === 'remove')) superConfirm(titles[op] + ': ' + (o.path || ''), ['This changes the disk file and cannot be undone.', op === 'merge' ? 'Other children of the parent stop working.' : 'Copy it first if you are not sure.'], 'CHANGE', go3); else go3();
      };
    }
    draw();
  }
  window.vdDrop = function (files) { var paths = files.map(function (f) { return API.pathOf ? API.pathOf(f) : ''; }).filter(Boolean); go('disks:top'); if (!paths.length) { toast('In the app, dropped virtual disk files are added to the library.'); return; } API.vd('addFiles', paths).then(function () { vdLoad().then(render); toast(paths.length + ' added.'); }, function (e) { toast(e.message); }); };


  // ---------- Events for the managers ----------
  var mcCur = function () { return mcSel(); };
  function mcDo(fn) { var a = [].slice.call(arguments, 1); if (DEMO) { toast('Demo: in the app this runs on the real server.'); return Promise.resolve(null); } return API.mc.apply(null, [fn].concat(a)); }
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-choco]'))) { chocoRun([b.dataset.choco]); return; }
    if ((b = t.closest('[data-chocoall]'))) { chocoRun(b.dataset.chocoall.split(',')); return; }
    if ((b = t.closest('[data-mcsel]'))) { mcv.sel = b.dataset.mcsel; mcv.props = mcv.players = mcv.addons = mcv.results = null; render(); return; }
    if ((b = t.closest('[data-mcsub]'))) { mcv.sub = b.dataset.mcsub; mcv.q = ''; render(); return; }
    if ((b = t.closest('[data-mcdo]'))) { var s = mcCur(), d = b.dataset.mcdo; if (DEMO) { s.lastState = d === 'stop' ? 'stopped' : 'running'; render(); return; } s.lastState = d === 'stop' ? 'stopping' : 'starting'; render(); API.mc(d, s.id).then(function () { return mcLoad(); }, function (er) { toast(er.message); if (/Java was not found|needs Java/.test(er.message) && API.platform === 'win32') chocoRun([s.java === 8 ? 'java8' : s.java === 17 ? 'java17' : 'java']); if (/docker/i.test(er.message) && API.platform === 'win32') chocoRun(['docker']); return mcLoad(); }).then(render); return; }
    if ((b = t.closest('[data-mcqr]'))) { qrShow('Join ' + mcSel().name, b.dataset.mcqr); return; }
    if ((b = t.closest('[data-mcq]'))) { var s2 = mcCur(); mcDo('command', s2.id, b.dataset.mcq).catch(function (er) { toast(er.message); }); return; }
    if ((b = t.closest('[data-mcbool]'))) { var k = b.dataset.mcbool, p = mcv.props.known.filter(function (x) { return x.key === k; })[0], cur = mcv.edit[k] != null ? mcv.edit[k] : p.value != null ? p.value : String(p.def); mcv.edit[k] = cur === 'true' ? 'false' : 'true'; if (mcv.edit[k] === (p.value != null ? p.value : String(p.def))) delete mcv.edit[k]; render(); return; }
    if ((b = t.closest('[data-mcrb]'))) { var rr = b.dataset.mcrb.split('|'); mcDo('gamerule', mcCur().id, rr[0], rr[1]).then(function () { toast(rr[0] + ' is ' + rr[1] + '.'); }, function (er) { toast(er.message); }); return; }
    if ((b = t.closest('[data-mcruleint]'))) { var n = b.dataset.mcruleint; mcDo('gamerule', mcCur().id, n, $('#mcr-' + n).value).then(function () { toast(n + ' set.'); }, function (er) { toast(er.message); }); return; }
    if ((b = t.closest('[data-mcpl]'))) { var pl = b.dataset.mcpl.split('|'), who = pl[2] || ($('#mcpl-in-' + pl[0]) || {}).value || '', why = ($('#mcpl-why-' + pl[0]) || {}).value || ''; who = who.trim(); if (!who) { toast('Type a name first.'); return; } var go4 = function () { mcDo('playerAction', mcCur().id, pl[0], pl[1], who, why).then(function (r) { if (r) toast(r); mcv.players = null; render(); }, function (er) { toast(er.message); }); }; if (pl[0] === 'ops' && pl[1] === 'add') superConfirm('Make ' + who + ' an operator', [who + ' can run every command on this server, including stopping it and changing other players.'], 'OPERATOR', go4); else go4(); return; }
    if ((b = t.closest('[data-mcinst]'))) { var pid = b.dataset.mcinst; b.disabled = true; b.textContent = 'Installing…'; mcDo('install', mcCur().id, pid).then(function (r) { if (r) toast('Installed ' + r.file + ' (' + r.version + ')' + (r.requires ? '; it needs ' + r.requires + ' other add-on' + (r.requires > 1 ? 's' : '') + ', listed on its Modrinth page' : '') + '. Restart the server to load it.'); mcv.addons = null; render(); }, function (er) { toast(er.message); render(); }); return; }
    if ((b = t.closest('[data-mcaddon]'))) { var f = b.dataset.mcaddon; mcDo('toggleAddon', mcCur().id, f, b.getAttribute('aria-checked') !== 'true').then(function (r) { if (r) toast(r); mcv.addons = null; render(); }, function (er) { toast(er.message); }); return; }
    if ((b = t.closest('[data-mcaddrm]'))) { var f2 = b.dataset.mcaddrm; superConfirm('Remove ' + f2, ['The file is deleted from the server folder.'], 'REMOVE', function () { mcDo('removeAddon', mcCur().id, f2).then(function () { mcv.addons = null; render(); }, function (er) { toast(er.message); }); }); return; }
    if ((b = t.closest('[data-mcrestore]'))) { var bid = b.dataset.mcrestore; superConfirm('Restore this backup', ['The server folder goes back to that moment.', 'A backup of how it is now is made first.'], 'RESTORE', function () { mcDo('restore', mcCur().id, bid).then(function (r) { if (r) toast(r); mcLoad().then(render); }, function (er) { toast(er.message); }); }); return; }
    if ((b = t.closest('[data-mcbdel]'))) { var bd = b.dataset.mcbdel; superConfirm('Delete this backup', ['The backup file is deleted.'], 'DELETE', function () { mcDo('deleteBackup', mcCur().id, bd).then(function () { mcLoad().then(render); }); }); return; }
    if ((b = t.closest('[data-mgdiff],[data-mggm],[data-mgsw],[data-mgout],[data-mgrule],[data-mglup],[data-mglrm]'))) { var g = mcv.gen; mgKeep(); if (b.dataset.mgdiff) g.difficulty = b.dataset.mgdiff; if (b.dataset.mggm) g.gamemode = b.dataset.mggm; if (b.dataset.mgsw) g[b.dataset.mgsw] = !g[b.dataset.mgsw]; if (b.dataset.mgout) g.output.kind = b.dataset.mgout; if (b.dataset.mgrule) { var cv = g.rules[b.dataset.mgrule]; if (cv == null) g.rules[b.dataset.mgrule] = true; else if (cv === true) g.rules[b.dataset.mgrule] = false; else delete g.rules[b.dataset.mgrule]; } if (b.dataset.mglup) { var i = +b.dataset.mglup; if (i > 0) { var tmp = g.layers[i]; g.layers[i] = g.layers[i - 1]; g.layers[i - 1] = tmp; } } if (b.dataset.mglrm) g.layers.splice(+b.dataset.mglrm, 1); render(); return; }
    if ((b = t.closest('[data-olsub]'))) { olv.sub = b.dataset.olsub; render(); return; }
    if ((b = t.closest('[data-olcap]'))) { olv.cap = b.dataset.olcap; render(); return; }
    if ((b = t.closest('[data-oltags]'))) { var mn = b.dataset.oltags; olv.open = olv.open === mn ? '' : mn; render(); if (olv.open && !olv.tags[mn]) (DEMO ? Promise.resolve({ tags: [{ tag: 'latest', name: mn + ':latest', size: 2.0e9, context: '128K', input: 'Text input' }, { tag: '1b', name: mn + ':1b', size: 1.3e9, context: '128K', input: 'Text input' }, { tag: '70b', name: mn + ':70b', size: 43e9, context: '128K', input: 'Text input' }] }) : API.ol('tags', mn)).then(function (tg) { olv.tags[mn] = tg; render(); }, function (er) { toast(er.message); }); return; }
    if ((b = t.closest('[data-olcart]'))) { var cn = b.dataset.olcart; olv.cartSize = olv.cartSize || {}; olv.cartSize[cn] = +b.dataset.olsize || 0; if (olv.cart.indexOf(cn) < 0) olv.cart.push(cn); render(); return; }
    if ((b = t.closest('[data-oluncart]'))) { olv.cart = olv.cart.filter(function (x) { return x !== b.dataset.oluncart; }); render(); return; }
    if ((b = t.closest('[data-olcancel]'))) { API.ol('cancel', b.dataset.olcancel); return; }
    if ((b = t.closest('[data-olshow]'))) { var sn = b.dataset.olshow; (DEMO ? Promise.resolve({ capabilities: ['completion', 'tools'], details: { family: 'llama', parameter_size: '3.2B', quantization_level: 'Q4_K_M' }, info: { 'llama.context_length': 131072 }, parameters: 'stop "<|eot_id|>"', license: 'LLAMA 3.2 COMMUNITY LICENSE' }) : API.ol('show', sn)).then(function (d) { dialog(sn, '<div class="kv"><span>Can do</span><b>' + esc((d.capabilities || []).join(', ')) + '</b><span>Family</span><b>' + esc(d.details.family || '') + '</b><span>Parameters</span><b>' + esc(d.details.parameter_size || '') + '</b><span>Quantisation</span><b>' + esc(d.details.quantization_level || '') + '</b>' + Object.keys(d.info || {}).map(function (k) { return '<span>' + esc(k.split('.').pop().replace(/_/g, ' ')) + '</span><b>' + esc(String(d.info[k])) + '</b>'; }).join('') + '</div><details class="fold"><summary class="ll">Parameters</summary><pre class="wb-test">' + esc(d.parameters) + '</pre></details><details class="fold"><summary class="ll">Licence</summary><pre class="wb-test" style="max-height:200px;overflow:auto">' + esc(d.license) + '</pre></details><div class="row"><span class="grow"></span><button class="btn fill" data-act="dlg-close">' + L('done') + '</button></div>', { emoji: '🧠' }); }, function (er) { toast(er.message); }); return; }
    if ((b = t.closest('[data-olchat]'))) { olv.chat.model = b.dataset.olchat; olv.sub = 'chat'; render(); return; }
    if ((b = t.closest('[data-olunload]'))) { API.ol('unload', b.dataset.olunload).then(function (r) { toast(r); olLoad().then(render); }); return; }
    if ((b = t.closest('[data-olcopy]'))) { var from = b.dataset.olcopy; dialog('Copy ' + from, '<label class="col"><span class="ll">New name</span><input class="input mono" id="olnew" value="' + esc(from.split(':')[0] + ':my-copy') + '"></label><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="olcopyok">Copy</button></div>'); $('#olcopyok').onclick = function () { var to = $('#olnew').value.trim(); closeDialog(); API.ol('copy', from, to).then(function (r) { toast(r); olLoad().then(render); }, function (er) { toast(er.message); }); }; return; }
    if ((b = t.closest('[data-oldel]'))) { var dn = b.dataset.oldel; superConfirm('Delete ' + dn, ['Its files are removed from this computer.', 'You can pull it again later.'], 'DELETE', function () { API.ol('remove', dn).then(function (r) { toast(r); olLoad().then(render); }, function (er) { toast(er.message); }); }); return; }
    if ((b = t.closest('[data-vdop]'))) { vdDialog(b.dataset.vdop, b.dataset.vdp, b.dataset.vdn ? { number: +b.dataset.vdn } : null); return; }
    if ((b = t.closest('[data-vdforget]'))) { API.vd('forget', b.dataset.vdforget).then(function () { vdLoad().then(render); }); return; }
    if (!(b = t.closest('[data-act]'))) return;
    var a = b.dataset.act;
    if (a === 'mcnew') { if (!mcv.cat && !DEMO) { mcLoad(true).then(mcNew); } else mcNew(); }
    else if (a === 'mccat') { toast('Reading the official catalogues…'); mcLoad(true).then(function () { render(); toast('Catalogue refreshed' + (mcv.cat && mcv.cat.errors && Object.keys(mcv.cat.errors).length ? ', except ' + Object.keys(mcv.cat.errors).join(', ') : '') + '.'); }); }
    else if (a === 'mcsched') mcDo('setSchedule', mcCur().id, { restart: $('#mcsr').value, backup: $('#mcsb').value, keep: +$('#mcsk').value }).then(function (r) { toast(msg('saved')); mcLoad().then(render); }, function (er) { toast(er.message); });
    else if (a === 'mcremove') { var s3 = mcCur(); superConfirm('Remove ' + s3.name, ['The server is stopped and its container removed.', 'Its folder and world are deleted. Backups stay.'], 'REMOVE', function () { mcDo('remove', s3.id, false).then(function () { mcv.sel = ''; mcLoad().then(render); }); }); }
    else if (a === 'mcsend') { var cmd = $('#mccmd').value.trim(); if (!cmd) return; mcv.hist.unshift(cmd); mcv.hi = -1; $('#mccmd').value = ''; mcDo('command', mcCur().id, cmd).catch(function (er) { toast(er.message); }); }
    else if (a === 'mcpsave') mcDo('setProperties', mcCur().id, mcv.edit).then(function (r) { if (r) toast(r); mcv.props = null; render(); }, function (er) { toast(er.message); });
    else if (a === 'mcpundo') { mcv.edit = {}; render(); }
    else if (a === 'mcfind') { var q2 = $('#mcsearch').value; mcDo('search', mcCur().id, q2).then(function (r) { mcv.results = r || { total: 0, hits: [] }; render(); }, function (er) { toast(er.message); }); }
    else if (a === 'mcbackup') { toast('Backing up…'); mcDo('backup', mcCur().id, 'Manual').then(function () { toast(msg('backedUp')); mcLoad().then(render); }, function (er) { toast(er.message); }); }
    else if (a === 'mcswitch') { var fl = $('#mcvf').value, vv = $('#mcvv').value.trim(), s4 = mcCur(); superConfirm('Change ' + s4.name + ' to ' + mcv.meta.flavours[fl].name + ' ' + vv, ['A backup is made first.', 'Worlds opened by a newer version may not open in an older one; only restoring the backup goes back safely.'], 'CHANGE', function () { mcDo('switchVersion', s4.id, fl, vv).then(function (r) { if (r) toast(r); mcLoad().then(render); }, function (er) { toast(er.message); }); }); }
    else if (a === 'mgdice') { mgKeep(); mcv.gen.seed = String(Math.floor(Math.random() * 9e15) - 4.5e15); render(); }
    else if (a === 'mgladd') { mgKeep(); mcv.gen.layers.push(['minecraft:stone', 1]); render(); }
    else if (a === 'mgbrowse') { if (DEMO) { mcv.gen.output.dir = 'C:\\Users\\you\\Minecraft worlds'; render(); return; } API.pickFolder('Choose where the world goes').then(function (d) { if (d) { mgKeep(); mcv.gen.output.dir = d; render(); } }); }
    else if (a === 'mggo') { mgKeep(); var g = mcv.gen; if (!g.eula) { toast('Accept the Minecraft EULA first.'); return; } if (!g.output.dir) { toast('Choose where the world goes.'); return; } var o = { version: g.version, seed: g.seed, levelType: g.levelType, difficulty: g.difficulty, gamemode: g.gamemode, hardcore: g.hardcore, structures: g.structures, border: g.border, width: g.width, height: g.height, centerX: g.centerX, centerZ: g.centerZ, eula: true, output: g.output, gamerules: Object.keys(g.rules).map(function (k) { return { name: k, value: g.rules[k] }; }) }; if (g.levelType === 'minecraft:flat') o.generatorSettings = JSON.stringify({ layers: g.layers.map(function (l) { return { block: l[0], height: +l[1] }; }), biome: g.biome, features: false, lakes: false }); if (g.levelType === 'minecraft:single_biome_surface') o.generatorSettings = JSON.stringify({ biome: g.biome }); g.log = ['Starting…']; render(); if (DEMO) { g.log.push('Demo: in the app this builds the world with Docker and Chunky.'); render(); return; } API.mcGenerate(o).then(function (out) { g.log.push('Done: ' + out); render(); toast('The world is ready: ' + out); finishedOne(); }, function (er) { g.log.push('Stopped: ' + er.message); render(); toast(er.message); }); }
    else if (a === 'olinstall') { toast('Downloading Ollama from its official release…'); API.ol('install').then(function (i) { toast('Ollama ' + i.version + ' is installed, checked against its SHA-256.'); return API.ol('start'); }).then(function (r) { toast(r); olLoad().then(render); }, function (er) { toast(er.message); olLoad().then(render); }); }
    else if (a === 'olstart') API.ol('start').then(function (r) { toast(r); olLoad().then(render); }, function (er) { toast(er.message); });
    else if (a === 'olstop') API.ol('stop').then(function (r) { toast(r); olLoad().then(render); }, function (er) { toast(er.message); });
    else if (a === 'olrefresh') { olv.lib = null; (DEMO ? Promise.resolve() : API.ol('library', true).then(function (l) { olv.lib = l; })).then(render); }
    else if (a === 'olpull') { olv.cart.forEach(function (n) { olv.pulls[n] = { name: n, status: 'queued' }; }); if (DEMO) { toast('Demo: in the app the models download here with progress.'); render(); return; } API.ol('setCart', olv.cart, olv.parallel).then(render); }
    else if (a === 'olsend') olSend();
    else if (a === 'olstopchat') API.ol('stopChat', olv.chat.id);
    else if (a === 'olclear') { olv.chat.msgs = []; render(); }
    else if (a === 'olexport') exportDialog('Export the chat', 'chat', olv.chat.msgs.map(function (m) { return { role: m.role, text: m.content }; }));
    else if (a === 'vdcreate') vdDialog('create', '');
    else if (a === 'vdadd') { if (DEMO) { toast('In the app this adds virtual disk files.'); return; } API.pickFiles('Add virtual disks', ['vhd', 'vhdx', 'vhds', 'avhd', 'avhdx', 'iso']).then(function (ps2) { if (ps2.length) return API.vd('addFiles', ps2).then(function () { return vdLoad(); }).then(render); }, function (er) { toast(er.message); }); }
    else if (a === 'vdscan') { if (DEMO) { toast('In the app this scans a folder you choose.'); return; } API.pickFolder('Scan a folder for virtual disks').then(function (d) { if (d) { toast('Scanning…'); return API.vd('scan', d).then(function (l) { toast(l.length + ' in the library.'); return vdLoad(); }).then(render); } }, function (er) { toast(er.message); }); }
    else if (a === 'vdrefresh') { vdv.routes = null; render(); }
    else if (a === 'vdsaveas') { if (DEMO) return; API.saveAs('Where the new virtual disk goes', 'new.vhdx').then(function (f) { if (f) { var i2 = $('#vd-path'); if (i2) i2.value = f; } }); }
  });
  function mgKeep() { var g = mcv.gen; if (!g) return; var v = function (id) { var e = $('#' + id); return e ? e.value : null; }; if (v('mgv') != null) g.version = v('mgv').trim(); if (v('mgseed') != null) g.seed = v('mgseed'); if (v('mglt')) g.levelType = v('mglt'); if (v('mgbiome') != null) g.biome = v('mgbiome'); ['mgw', 'mgh', 'mgcx', 'mgcz'].forEach(function (id, i) { var x = v(id); if (x != null && x !== '') g[['width', 'height', 'centerX', 'centerZ'][i]] = +x; }); g.layers.forEach(function (l, i) { var bl = $('[data-mgl="' + i + '"]'), h = v('mglh' + i); if (bl) l[0] = bl.value.trim(); if (h) l[1] = +h; }); var eu = $('#mgeula'); if (eu) g.eula = eu.checked; }
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.mcprop) { var k = t.dataset.mcprop, p = mcv.props.known.filter(function (x) { return x.key === k; })[0]; mcv.edit[k] = t.value; if (t.value === (p.value != null ? p.value : String(p.def))) delete mcv.edit[k]; $$('[data-mcprop="' + k + '"]').forEach(function (x) { if (x !== t) x.value = t.value; }); return; }
    if (t.id === 'mcpq' || t.id === 'mcrq') { mcv.q = t.value; render(); var f = $('#' + t.id); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } return; }
    if (t.id === 'mcconq') { mcv.consoleQ = t.value; render(); var f2 = $('#mcconq'); if (f2) { f2.focus(); f2.setSelectionRange(f2.value.length, f2.value.length); } return; }
    if (/^mg(w|h|cx|cz)$/.test(t.id)) { mgKeep(); mgDraw(); return; }
    if (t.id === 'olq') { olv.q = t.value; render(); var f3 = $('#olq'); if (f3) { f3.focus(); f3.setSelectionRange(f3.value.length, f3.value.length); } return; }
    if (t.id === 'olpar') { olv.parallel = +t.value; return; }
    if (t.id === 'oltemp') { olv.chat.temp = +t.value; return; }
    if (t.id === 'olctx') { olv.chat.ctx = +t.value; return; }
    if (t.id === 'vdq') { vdv.q = t.value; render(); var f4 = $('#vdq'); if (f4) { f4.focus(); f4.setSelectionRange(f4.value.length, f4.value.length); } return; }
  });
  document.addEventListener('change', function (e) { var t = e.target; if (t.id === 'olcm') olv.chat.model = t.value; if (t.dataset.vdsort != null) { vdv.sort = t.value; render(); } if (t.id === 'mglt') { mgKeep(); render(); } });
  document.addEventListener('keydown', function (e) {
    if (e.target.id === 'mccmd') { if (e.key === 'Enter') { e.preventDefault(); $('[data-act="mcsend"]').click(); } if (e.key === 'ArrowUp' && mcv.hist.length) { mcv.hi = Math.min(mcv.hist.length - 1, mcv.hi + 1); e.target.value = mcv.hist[mcv.hi]; e.preventDefault(); } if (e.key === 'ArrowDown') { mcv.hi = Math.max(-1, mcv.hi - 1); e.target.value = mcv.hi < 0 ? '' : mcv.hist[mcv.hi]; e.preventDefault(); } }
    if (e.target.id === 'olin' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); olSend(); }
  });
  if (!DEMO && API.on) API.on(function (ch, p) {
    if (ch === 'choco' && chocoRun.on) chocoRun.on(p);
    if (ch === 'mc-console') { mcv.console = mcv.console || {}; var c = mcv.console[p.id] = mcv.console[p.id] || []; c.push(p.line); if (c.length > 2000) c.splice(0, c.length - 2000); if (st.active === 'minecraft' && mcv.sel === p.id) termPush('mc-' + p.id, p.line); }
    if (ch === 'mc-state') { var s = mcv.list.filter(function (x) { return x.id === p.id; })[0]; if (s) { s.lastState = p.state; if (p.state === 'running') toast(s.name + ' is running.'); if (p.state === 'crashed') toast(s.name + ' stopped unexpectedly. The console shows why.'); if (st.active === 'minecraft' && mcv.sub !== 'console') render(); } }
    if (ch === 'mc-generate' && mcv.gen) { mcv.gen.log.push(p.line); termPush('mggen', p.line); }
    if (ch === 'ol-pull') { olv.pulls[p.name] = p; if (p.done) { toast(p.name + ': ' + (p.status === 'success' ? 'pulled.' : p.status + (p.error ? ', ' + p.error : ''))); if (p.status === 'success') { olv.cart = olv.cart.filter(function (x) { return x !== p.name; }); olLoad().then(function () { if (st.active === 'models') render(); }); } } if (st.active === 'models' && olv.sub === 'cart') soon(); }
    if (ch === 'ol-chat' && olv.chat.id === p.id) { var last = olv.chat.msgs[olv.chat.msgs.length - 1]; if (p.delta) last.content += p.delta; if (p.error) last.content += '\n[' + p.error + ']'; if (p.done) { olv.chat.busy = false; last.stats = p.stats; render(); var cl = $('#olchat'); if (cl) cl.scrollTop = cl.scrollHeight; } else { var bx = $('#olchat'); if (bx && bx.lastElementChild) { bx.lastElementChild.querySelector('.bm').textContent = last.content; bx.scrollTop = bx.scrollHeight; } } }
    if (ch === 'ol-install') toast(p.text + (p.fraction ? ' ' + Math.round(p.fraction * 100) + '%' : ''));
    if (ch === 'ol-state') olLoad().then(function () { if (st.active === 'models') render(); });
  });
  // ---------- Start ----------
  (async function () {
    try { about = await API.about(); } catch (e) { about = {}; }
    try { dls = await API.downloads(); } catch (e) { dls = []; }
    await reload(); apply(); shell(); render(); wire();
    try { exts = await API.extensions(); } catch (e) { exts = []; }
    try { extRuns = API.extRuns ? await API.extRuns() : []; } catch (e) { extRuns = []; }
    try { if (API.school) schoolApply(await API.school()); } catch (e) { /* the shared folder may be unreadable */ }
    checkAll();
    // One fresh draw per start, 1 in 10, never during the first run.
    if (st.welcomed && Math.random() < 0.1) setTimeout(function () { if (!$('#ov')) dimsum(false); }, 5000);
    runRules(); pollHa();
    setInterval(function () { if (st.schedule.on) apply(); }, 60000);
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = function () { if (st.active === 'settings') render(); };
    if (!st.welcomed) setTimeout(function () { welcome(false); }, 300);
    setInterval(function () { if (st.active === 'instances' && !$('#ov') && !$('.popover')) soon(); }, 5000);
  })();
})();
