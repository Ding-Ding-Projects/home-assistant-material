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
  var TABS = ['deploy', 'instances', 'backups', 'downloads', 'hosts', 'activity', 'extensions', 'tools', 'support', 'changes', 'run', 'features', 'articles', 'status', 'design', 'settings', 'help'];
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
    deploy: ['Deploy', '部署'], instances: ['Instances', '實例'], backups: ['Backups', '備份'], hosts: ['SSH hosts', 'SSH 主機'], activity: ['Activity', '活動'], settings: ['Settings', '設定'], help: ['Help', '說明'], extensions: ['Extensions', '擴充'], tools: ['Tools', '工具'], support: ['Support', '支援'], changes: ['Changes', '更新紀錄'], run: ['Run it', '點樣行'], features: ['Features', '功能'], articles: ['Articles', '文章'], status: ['Status', '狀態'], design: ['Design', '設計'], modes: ['Modes', '模式'], sound: ['Sound and voice', '聲音同讀音'], schedule: ['Schedule', '時間表'], identity: ['Name and logo', '名同標誌'], updatesSet: ['Updates', '更新'], adhd: ['ADHD modes', 'ADHD 模式'],
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
