  // ---------- USB stick maker ----------
  // Three steps: what the stick is for, which stick, then write and check. The page holds only
  // opaque handles the app issued; drives are listed read only, and nothing is formatted or deleted.
  var stk = { step: 1, purpose: 'update', action: 'reset-apps', vols: null, vol: '', pack: null, bundle: null, plan: null, armed: false, busy: false, progress: null, result: null, error: '' };
  Object.assign(W, {
    stkTitle: ['USB stick maker', 'USB 手指製作'],
    stkSub: ['Put an offline update pack or a recovery request on a USB stick. Files are added to what the stick already holds; nothing is formatted or deleted.', '將離線更新包或復原要求放入 USB 手指。只會加入檔案，唔會格式化或刪除任何嘢。'],
    stkStep1: ['What is the stick for?', '呢支手指用嚟做乜？'],
    stkStep2: ['Choose the stick', '揀手指'],
    stkStep3: ['Write and check', '寫入同核對'],
    stkUpdate: ['Offline updates', '離線更新'],
    stkUpdateHelp: ['Update a device that has no internet. Each part of the pack is checked against its manifest before it is written, and read back from the stick afterwards.', '更新冇網絡嘅裝置。每個部分寫入前會對照清單核對，寫完再由手指讀返核對。'],
    stkRecovery: ['Recovery', '復原'],
    stkRecoveryHelp: ['A one-shot request for a device that misbehaves. The stick must already be labelled HA-RECOVERY; this app does not relabel or format drives.', '一次性要求，用嚟修復有問題嘅裝置。手指標籤必須已經係 HA-RECOVERY；呢個程式唔會改標籤或格式化。'],
    stkOnlyRemovable: ['Only removable drives are listed, with their size and label. System drives are never shown.', '只會列出可移除磁碟同其大細同標籤，唔會顯示系統磁碟。'],
    stkRefresh: ['Refresh the list', '重新整理'],
    stkNone: ['No removable drive with a mounted volume was found. Plug one in and refresh.', '搵唔到已掛載嘅可移除磁碟。插入後請重新整理。'],
    stkPickPack: ['Choose the pack (ZIP or folder)', '揀更新包（ZIP 或資料夾）'],
    stkPickBundle: ['Choose the update file (.raucb)', '揀更新檔（.raucb）'],
    stkArm: ['I have checked the drive and its name above, and want to add these files to it', '我已核對上面嘅磁碟同名稱，同意將呢啲檔案加入'],
    stkWrite: ['Write to the stick', '寫入手指'],
    stkNext: ['Next', '下一步'],
    stkBack: ['Back', '返轉頭'],
    stkPlan: ['Check the plan', '檢查計劃'],
    stkDone: ['Written and read back correctly. Eject the stick before unplugging it.', '已寫入並讀返核對無誤。拔出前請先彈出。'],
    stkDemo: ['Writing a stick works in the desktop app. This page shows the steps only.', '寫入手指要喺桌面程式入面做。呢頁只係示範步驟。']
  });
  var STK_ACTIONS = [['reset-apps', 'Reset apps', 'Resets the apps container storage. Settings and the Home Assistant configuration are kept.'], ['reinstall-os', 'Reinstall the operating system', 'Reinstalls from the update file you choose. Needs the file for your board.'], ['factory-reset', 'Factory reset', 'Erases everything on the device when it next starts.']];
  async function stkLoad() { if (DEMO) { stk.vols = []; return; } try { stk.vols = await API.stickVolumes(); } catch (e) { stk.vols = []; stk.error = e.message; } }
  function stkVol() { return (stk.vols || []).filter(function (v) { return v.handle === stk.vol; })[0]; }
  function stkSteps() {
    return '<ol class="chipline" aria-label="Steps">' + [1, 2, 3].map(function (n) { return '<li class="tag ' + (stk.step === n ? 'g' : '') + '" ' + (stk.step === n ? 'aria-current="step"' : '') + '>' + n + '. ' + esc(w('stkStep' + n)) + '</li>'; }).join('') + '</ol>';
  }
  function stkBody() {
    if (stk.step === 1) {
      var card = function (id, title, help) { return '<button class="card" style="padding:16px;text-align:start" data-stk="purpose" data-v="' + id + '" aria-pressed="' + (stk.purpose === id) + '"><b>' + esc(w(title)) + '</b><span class="bm mu">' + esc(w(help)) + '</span></button>'; };
      var more = stk.purpose === 'recovery' ? '<fieldset class="col" style="gap:8px;border:0;padding:0"><legend class="ll">Recovery action</legend>' + STK_ACTIONS.map(function (a) { return '<button class="btn ' + (stk.action === a[0] ? 'fill' : 'tonal') + ' sm" data-stk="action" data-v="' + a[0] + '" aria-pressed="' + (stk.action === a[0]) + '">' + esc(a[1]) + '</button><span class="bs mu">' + esc(a[2]) + '</span>'; }).join('') + '</fieldset>' : '';
      return '<div class="col" style="gap:12px">' + card('update', 'stkUpdate', 'stkUpdateHelp') + card('recovery', 'stkRecovery', 'stkRecoveryHelp') + more + '<div class="row" style="gap:8px"><button class="btn fill" data-stk="to2">' + esc(w('stkNext')) + '</button></div></div>';
    }
    if (stk.step === 2) {
      if (stk.vols == null) { stkLoad().then(function () { if (st.active === 'stick') render(); }); return '<p class="bm mu" role="status">Looking for removable drives…</p>'; }
      var list = stk.vols.length ? stk.vols.map(function (v) { return '<label class="card row" style="padding:12px;gap:10px;align-items:center"><input type="radio" name="stkvol" data-stk="vol" value="' + esc(v.handle) + '" ' + (stk.vol === v.handle ? 'checked' : '') + '><span class="col grow" style="gap:2px"><b>' + esc(v.label || '(no label)') + '</b><span class="bs mu">' + esc(v.mount) + ' · ' + esc(v.fs || 'unknown') + ' · ' + esc(fmtSize(v.size)) + ', ' + esc(fmtSize(v.free)) + ' free · ' + esc(v.bus) + '</span></span></label>'; }).join('') : '<p class="bm mu" role="status">' + esc(w('stkNone')) + '</p>';
      var source = stk.purpose === 'update'
        ? '<div class="row" style="gap:8px;align-items:center"><button class="btn tonal" data-stk="pickpack">' + esc(w('stkPickPack')) + '</button><span class="bm">' + (stk.pack ? esc(stk.pack.name) + ' · board ' + esc(stk.pack.board) + ' · ' + esc(fmtSize(stk.pack.bytes)) + ' · checked' : 'No pack chosen') + '</span></div>' + (stk.pack ? '<ul class="bs">' + stk.pack.parts.map(function (p) { return '<li>' + esc(p.kind) + (p.version ? ' ' + esc(p.version) : '') + ': ' + (p.available ? esc(fmtSize(p.size)) + ' in the pack' : 'not in this pack') + '</li>'; }).join('') + '</ul><p class="bs mu">Only the operating system part installs without internet. The Supervisor and Core parts are carried and checked, then update over the network.</p>' : '')
        : (stk.action === 'reinstall-os' ? '<div class="row" style="gap:8px;align-items:center"><button class="btn tonal" data-stk="pickbundle">' + esc(w('stkPickBundle')) + '</button><span class="bm">' + (stk.bundle ? esc(stk.bundle.name) : 'No file chosen') + '</span></div>' : '');
      var ready = stk.vol && (stk.purpose === 'recovery' ? (stk.action !== 'reinstall-os' || stk.bundle) : stk.pack);
      return '<div class="col" style="gap:12px"><p class="bm mu">' + esc(w('stkOnlyRemovable')) + '</p>' + list + '<div class="row" style="gap:8px"><button class="btn text" data-stk="refresh">' + esc(w('stkRefresh')) + '</button></div>' + source + (stk.error ? '<p class="bm" role="alert">' + esc(stk.error) + '</p>' : '') + '<div class="row" style="gap:8px"><button class="btn text" data-stk="to1">' + esc(w('stkBack')) + '</button><button class="btn fill" data-stk="plan" ' + (ready ? '' : 'disabled') + '>' + esc(w('stkPlan')) + '</button></div></div>';
    }
    var p = stk.plan; if (!p) return '<p class="bm mu">Go back and choose the stick.</p>';
    var blocked = p.blocked.length ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm" role="alert">' + p.blocked.map(esc).join('<br>') + '</span></div>' : '';
    var files = '<ul class="bs">' + p.files.map(function (f) { return '<li class="mono">' + esc(f.name) + ' · ' + esc(fmtSize(f.size)) + '</li>'; }).join('') + '</ul>';
    var res = stk.result ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm" role="status">' + (stk.result.ok ? esc(w('stkDone')) : esc(stk.result.error)) + '</span></div>' + '<ul class="bs">' + stk.result.results.map(function (r) { return '<li class="mono">' + (r.ok ? 'OK ' : 'FAILED ') + esc(r.name) + ' · ' + esc(r.sha256.slice(0, 16)) + '…</li>'; }).join('') + '</ul>' : '';
    var prog = stk.busy ? '<progress id="stkprog" class="prog" max="100" value="' + Math.round(((stk.progress || {}).fraction || 0) * 100) + '" aria-label="Progress"></progress><p class="bs mu" id="stkphase" role="status">' + esc((stk.progress || {}).phase || 'starting') + '</p>' : '';
    var controls = p.blocked.length || stk.result ? '' : '<div class="col" style="gap:10px"><button class="btn tonal" role="switch" aria-checked="' + stk.armed + '" data-stk="arm">' + (stk.armed ? 'Armed: ' : 'Not armed: ') + esc(w('stkArm')) + '</button><button class="btn fill" data-stk="write" ' + (stk.armed && !stk.busy ? '' : 'disabled') + '>' + esc(w('stkWrite')) + '</button></div>';
    return '<div class="col" style="gap:12px"><p class="bm"><b>' + esc(p.target) + '</b></p><p class="bm">' + esc(p.summary) + '</p>' + files + blocked + controls + prog + res + '<div class="row" style="gap:8px"><button class="btn text" data-stk="to2" ' + (stk.busy ? 'disabled' : '') + '>' + esc(w('stkBack')) + '</button></div></div>';
  }
  R.stick = function () {
    return pageHead('Harddisk', w('stkTitle'), esc(w('stkSub')), null, '') + '<div class="section col" style="gap:14px">' + (DEMO ? '<p class="bm mu" role="status">' + esc(w('stkDemo')) + '</p>' : '') + stkSteps() + stkBody() + '</div>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-stk]') : null; if (!b || b.disabled) return;
    var a = b.dataset.stk, v = b.dataset.v;
    if (a === 'purpose') { stk.purpose = v; stk.pack = stk.bundle = stk.plan = null; stk.result = null; render(); }
    else if (a === 'action') { stk.action = v; stk.plan = null; render(); }
    else if (a === 'to1') { stk.step = 1; render(); }
    else if (a === 'to2') { stk.step = 2; stk.armed = false; stk.result = null; stk.plan = null; stk.error = ''; render(); }
    else if (a === 'refresh') { stk.vols = null; stk.vol = ''; stk.plan = null; render(); }
    else if (a === 'vol') { stk.vol = b.value; stk.plan = null; }
    else if (a === 'pickpack') { if (DEMO) { toast(w('stkDemo')); return; } stk.error = ''; API.stickPickPack().then(function (p) { if (p) { stk.pack = p; stk.plan = null; } render(); }, function (er) { stk.error = er.message; render(); }); }
    else if (a === 'pickbundle') { if (DEMO) { toast(w('stkDemo')); return; } API.stickPickBundle().then(function (p) { if (p) { stk.bundle = p; stk.plan = null; } render(); }, function (er) { stk.error = er.message; render(); }); }
    else if (a === 'plan') {
      if (DEMO) { toast(w('stkDemo')); return; }
      var radio = document.querySelector('input[name="stkvol"]:checked'); if (radio) stk.vol = radio.value;
      API.stickPlan({ purpose: stk.purpose === 'recovery' ? 'recovery' : 'update', volume: stk.vol, pack: stk.pack && stk.pack.handle, bundle: stk.bundle && stk.bundle.handle, action: stk.action }).then(function (p) { stk.plan = p; stk.step = 3; stk.armed = false; stk.result = null; stk.error = ''; render(); }, function (er) { stk.error = er.message; render(); });
    }
    else if (a === 'arm') { stk.armed = !stk.armed; render(); }
    else if (a === 'write') {
      if (!stk.armed || stk.busy || !stk.plan) return;
      stk.busy = true; stk.progress = { phase: 'starting', fraction: 0 }; render();
      API.stickWrite({ plan: stk.plan.handle, armed: stk.armed, confirmed: true }).then(function (r) { stk.busy = false; stk.result = r; stk.armed = false; render(); toast(r.ok ? w('stkDone') : r.error); }, function (er) { stk.busy = false; stk.armed = false; stk.result = { ok: false, error: er.message, results: [] }; render(); });
    }
  });
  if (!DEMO && API.on) API.on(function (ch, p) {
    if (ch !== 'stick-progress') return;
    stk.progress = p; var bar = $('#stkprog'), phase = $('#stkphase');
    if (bar) bar.value = Math.round(p.fraction * 100);
    if (phase) phase.textContent = p.phase === 'writing' ? 'Writing to the stick' : p.phase === 'checking' ? 'Reading every file back to check it' : 'Checking the pack';
  });
