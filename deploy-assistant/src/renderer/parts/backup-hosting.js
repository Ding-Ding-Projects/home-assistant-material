  // ---------- Host an uploaded backup ----------
  // Only native-issued opaque handles enter the renderer. Archive bytes and
  // local paths never pass through this view or the settings/history store.
  var backupHost = { file: null, jobs: [], busy: false, requestId: '', error: '', bridge: null, drives: [], drive: '', submittedTarget: '', submittedOptions: null, piAddresses: '', piAddressByJob: {} };
  Object.assign(W, {
    bhTitle: ['Host a backup', '託管備份'],
    bhPick: ['Choose ZIP or native backup archive', '選擇 ZIP 或原生備份封存檔'],
    bhOriginal: ['Keep original active automations. The source instance is unchanged; restored automations may run in this new instance.', '保留原本已啟用嘅自動化。來源實例維持不變；還原後嘅自動化可能喺新實例執行。'],
    bhKey: ['Encryption key, if protected', '如有加密，請輸入加密金鑰'],
    bhStart: ['Host and restore this backup', '託管並還原呢個備份'],
    bhFresh: ['Return to a new empty instance', '返回建立空白實例'],
    bhPending: ['Waiting for verified startup, restore, and LAN reachability.', '等候驗證啟動、還原同區域網絡連線。'],
    bhUnavailable: ['Backup hosting is unavailable in this build or demonstration.', '呢個版本或示範未有備份託管功能。'],
    bhError: ['The operation could not be confirmed. Refresh jobs before retrying.', '未能確認操作，請重新整理工作狀態後再試。'],
    bhRefresh: ['Refresh hosting jobs', '重新整理託管工作'],
    bhCancel: ['Cancel job', '取消工作'],
    bhSetup: ['Pair this computer with a Home Assistant backup page', '將呢部電腦同 Home Assistant 備份頁配對'],
    bhSetupHelp: ['Enable on a private LAN address, then enter the HTTPS address and certificate fingerprint on the backup page. Approve the matching client in the native confirmation.', '喺私人區域網絡地址啟用，再喺備份頁輸入 HTTPS 地址同憑證指紋，並喺原生確認視窗批准相符用戶端。'],
    bhEnable: ['Enable backup hosting', '啟用備份託管'],
    bhAddress: ['Private LAN address', '私人區域網絡地址'],
    bhFingerprint: ['Certificate fingerprint', '憑證指紋'],
    bhPiAddresses: ['Local addresses for the newly written Raspberry Pi (optional)', '新寫入 Raspberry Pi 嘅區域網絡地址（可選）'],
    bhPiAddressHelp: ['Enter up to 16 private IPv4 addresses, separated by commas or spaces. Only the supplied addresses are tried; a blank field permits a bounded local-name lookup. No network scan is performed. The device must present this job’s exact certificate.', '最多輸入 16 個私人 IPv4 地址，以逗號或空格分隔。只會嘗試指定地址；留空就只會進行有限嘅本機名稱查詢，唔會掃描網絡。裝置必須出示呢個工作指定嘅憑證。'],
    bhPiRetry: ['Try these addresses for this device', '用呢啲地址尋找呢部裝置'],
    bhPiInvalid: ['Enter at most 16 private IPv4 addresses. Ranges, public addresses, URLs, and host names are not accepted.', '請輸入最多 16 個私人 IPv4 地址，唔接受地址範圍、公網地址、網址或主機名稱。'],
    bhDrive: ['SD card or USB drive, erased only after native confirmation', 'SD 卡或 USB 儲存裝置，原生確認後先會清除'],
    bhDrives: ['Find removable drives', '尋找可移除儲存裝置'],
    bhNoDrive: ['Select a removable drive', '選擇可移除儲存裝置'],
    bhQueued: ['Queued', '已排程'], bhRunning: ['Hosting in progress', '正在託管'],
    bhReady: ['Restored and reachable', '已還原並可連接'], bhFailed: ['Hosting failed', '託管失敗'],
    bhCancelled: ['Cancelled', '已取消'], bhNeedsKey: ['Encryption key required', '需要加密金鑰'],
    bhSetupRequired: ['Setup required', '需要設定'], bhNative: ['Waiting for native approval', '等候原生視窗批准'],
    bhHardware: ['Waiting for hardware', '等候硬件'], bhRestart: ['Waiting for restart', '等候重新啟動'],
    bhRestore: ['Restoring the backup', '正在還原備份'], bhVerify: ['Verifying reachability', '正在驗證連線'],
    bhAccepted: ['Restore accepted; verification pending', '已接受還原，等候驗證'],
    bhSelected: ['Selected backup', '已選備份'],
    bhCancelling: ['Cancelling: waiting for the current operation to settle', '取消中：等候目前操作安全完成'],
    bhHostKey: ['Review SSH host key and resume', '核對 SSH 主機金鑰並繼續'],
    bhHostKeyPending: ['Review the exact host and fingerprint in the native confirmation. Nothing is approved automatically.', '請喺原生確認視窗核對指定主機同指紋，程式唔會自動批准。'],
    bhHostKeyUnavailable: ['Reopen this job in an updated Deploy Assistant to retrieve its saved host and retry handle.', '請喺更新後嘅 Deploy Assistant 重新開啟工作，以取得已儲存主機同重試憑證。'],
    bhAuth: ['Sign-in required to verify the restored instance', '需要登入以驗證已還原實例'],
    bhSignIn: ['Open sign-in to verify', '開啟登入頁以進行驗證'],
    bhSignInPending: ['The LAN address answered. Sign in to continue verification; this job is not complete.', '區域網絡地址已有回應。請登入以繼續驗證，呢個工作尚未完成。']
  });
  function backupHostPiAddresses(value) {
    if (typeof value !== 'string' || value.length > 512) throw new Error('bhPiInvalid');
    var values = value.trim() ? value.trim().split(/[\s,;]+/) : [];
    if (values.length > 16) throw new Error('bhPiInvalid');
    values.forEach(function (address) {
      if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(address)) throw new Error('bhPiInvalid');
      var octets = address.split('.').map(Number);
      if (octets.some(function (n) { return n > 255; }) || !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168))) throw new Error('bhPiInvalid');
    });
    return Array.from(new Set(values));
  }
  function backupHostNeedsKey(j) { return j.state === 'needs_attention' && j.error_code === 'incorrect_password'; }
  function backupHostNeedsSshApproval(j) { return j.target === 'ssh' && ['needs_attention', 'needs_resume'].indexOf(j.state) >= 0 && ['host_key_approval_required', 'host_key_changed'].indexOf(j.error_code) >= 0; }
  function backupHostCanApproveSsh(j) { return backupHostNeedsSshApproval(j) && typeof j.host_id === 'string' && !!j.host_id && typeof j.upload_handle === 'string' && !!j.upload_handle; }
  function backupHostBlocksStart(j) { return backupHostActive(j) && !(backupHostNeedsKey(j) && j.request_id === backupHost.requestId); }
  function backupHostActive(j) { return ['ready', 'failed', 'cancelled'].indexOf(j.state) < 0; }
  function backupHostUrl(j) {
    if (j.state !== 'ready' || !j.lan_url) return '';
    try { var u = new URL(j.lan_url); return /^(https?:)$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
  }
  function backupHostSignInUrl(j) {
    if (j.state !== 'authentication_needed' || j.lan_url_verified !== true || typeof j.lan_url_verified_at !== 'string' || j.lan_url_verified_at.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(j.lan_url_verified_at) || !Number.isFinite(Date.parse(j.lan_url_verified_at))) return '';
    try { var u = new URL(j.lan_url); return /^(https?:)$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
  }
  function backupHostState(j) {
    return L(({ queued: 'bhQueued', running: 'bhRunning', ready: 'bhReady', failed: 'bhFailed', cancelled: 'bhCancelled', cancelling: 'bhCancelling', needs_key: 'bhNeedsKey', setup_required: 'bhSetupRequired', pending_native_approval: 'bhNative', waiting_hardware: 'bhHardware', waiting_restart: 'bhRestart', waiting_for_restart: 'bhRestart', restoring: 'bhRestore', needs_resume: 'bhSetupRequired', needs_attention: 'bhSetupRequired', waiting_for_hardware: 'bhHardware', writing_card: 'bhHardware', waiting_for_boot: 'bhHardware', authentication_needed: 'bhAuth', restore_accepted: 'bhAccepted' })[j.state] || 'bhRunning');
  }
  function backupHostCards() {
    return '<section class="section backup-host-jobs" aria-live="polite">' + (backupHost.error ? '<p role="alert">' + L(backupHost.error) + '</p>' : '') + backupHost.jobs.map(function (j) {
      var url = backupHostUrl(j), signInUrl = backupHostSignInUrl(j);
      return '<article class="pcard"><h3 class="tm">' + L(j.target) + ': ' + backupHostState(j) + '</h3><p class="bm">' +
        L(({ restore: 'bhRestore', verify: 'bhVerify', restore_accepted: 'bhAccepted', restore_submitted: 'bhRestore', restore_rejected: 'bhNeedsKey', restart: 'bhRestart', waiting_for_boot: 'bhHardware' })[j.phase] || (j.state === 'ready' ? 'bhReady' : 'bhPending')) + '</p>' +
        (j.error_code ? '<p role="alert"><code>' + esc(j.error_code) + '</code></p>' : '') +
        (j.target === 'pi' && j.state === 'waiting_for_boot' && j.upload_handle ? '<label class="col"><span class="ll">' + L('bhPiAddresses') + '</span><textarea class="input" rows="3" maxlength="512" autocomplete="off" data-bh-pi-address="' + esc(j.id) + '" id="bh-pi-address-' + esc(j.id) + '">' + esc(backupHost.piAddressByJob[j.id] || '') + '</textarea><span class="bs mu">' + L('bhPiAddressHelp') + '</span></label><button class="btn tonal" data-bh-pi-retry="' + esc(j.id) + '"' + (backupHost.busy ? ' disabled' : '') + '>' + L('bhPiRetry') + '</button>' : '') +
        (backupHostNeedsSshApproval(j) ? '<p class="bm">' + L(backupHostCanApproveSsh(j) ? 'bhHostKeyPending' : 'bhHostKeyUnavailable') + '</p>' + (backupHostCanApproveSsh(j) ? '<button class="btn tonal" data-bh-ssh-approve="' + esc(j.id) + '"' + (backupHost.busy ? ' disabled' : '') + '>' + L('bhHostKey') + '</button>' : '') : '') +
        (signInUrl ? '<p class="bm">' + L('bhSignInPending') + '</p><a class="btn tonal" href="' + esc(signInUrl) + '" data-ext="' + esc(signInUrl) + '">' + L('bhSignIn') + '</a>' : '') +
        (url ? '<a class="btn tonal" href="' + esc(url) + '" data-ext="' + esc(url) + '">' + esc(url) + '</a>' : '') +
        (backupHostActive(j) && j.state !== 'cancelling' ? '<button class="btn text" data-bh-cancel="' + esc(j.id) + '">' + L('bhCancel') + '</button>' : '') + '</article>';
    }).join('') + '</section>';
  }
  function backupHostPanel() {
    var file = backupHost.file;
    return '<section class="card backup-host-panel" aria-labelledby="backup-host-title"><h2 class="tl" id="backup-host-title">' + L('bhTitle') + '</h2>' +
      '<p class="bm">' + L('bhOriginal') + '</p><div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn tonal" data-act="bh-pick"' + (backupHost.busy || backupHost.jobs.some(backupHostActive) ? ' disabled' : '') + '>' + L('bhPick') + '</button>' +
      '<button class="btn text" data-act="bh-refresh">' + L('bhRefresh') + '</button><button class="btn text" data-act="bh-setup">' + L('bhSetup') + '</button></div>' +
      (file ? '<p class="bm">' + L('bhSelected') + ': <b>' + esc(file.name) + '</b> · ' + fmtSize(file.size) + '</p><label class="col"><span class="ll">' + L('bhKey') + '</span><input class="input" type="password" id="bh-password" autocomplete="off"></label><button class="btn text" data-act="bh-clear">' + L('bhFresh') + '</button>' : '') +
      '</section>';
  }
  var renderDeployWithoutBackup = R.deploy;
  R.deploy = function () {
    var body = renderDeployWithoutBackup();
    if (backupHost.file) {
      body = body.replace(/data-act="wizgo"/g, 'data-act="bh-start"').replace(/data-act="pi" id="wizgo"/g, 'data-act="bh-start" id="wizgo"');
      // The target configuration remains the existing rich form. Only its action
      // goes through the backup coordinator rather than the empty-instance path.
      body = body.replace(/(<button[^>]*data-act="bh-start"[^>]*>)[\s\S]*?(<\/button>)/g, '$1' + L('bhStart') + '$2');
      body = body.replace(/(<button[^>]*data-act="bh-start")/g, '$1' + (backupHost.busy || backupHost.jobs.some(backupHostBlocksStart) ? ' disabled' : ''));
      if (wizTarget() === 'pi') body = body.replace('<div class="wfoot">', '<div class="plan"><label><span class="ll">' + L('bhDrive') + '</span><select class="select" id="bh-drive"><option value="">' + L('bhNoDrive') + '</option>' + backupHost.drives.map(function (d) { return '<option value="' + esc(d.drive_handle) + '"' + (d.drive_handle === backupHost.drive ? ' selected' : '') + '>' + esc(d.name) + ' · ' + fmtSize(d.size) + '</option>'; }).join('') + '</select></label><button class="btn tonal" data-act="bh-drives">' + L('bhDrives') + '</button><label><span class="ll">' + L('bhPiAddresses') + '</span><textarea class="input" id="bh-pi-addresses" rows="3" maxlength="512" autocomplete="off" aria-describedby="bh-pi-address-help">' + esc(backupHost.piAddresses) + '</textarea><span class="bs mu" id="bh-pi-address-help">' + L('bhPiAddressHelp') + '</span></label></div><div class="wfoot">');
    }
    return backupHostPanel() + backupHostCards() + body;
  };
  var renderBackupsWithoutHosting = R.backups;
  R.backups = function () { return '<div class="row"><button class="btn fill" data-act="bh-pick">' + L('bhTitle') + '</button><button class="btn tonal" data-act="bh-setup">' + L('bhSetup') + '</button></div>' + backupHostCards() + renderBackupsWithoutHosting(); };
  // Preserve a currently typed key across synchronous view redraws without
  // putting it in HTML attributes, persistent settings, or job/history records.
  var renderWithoutBackupKey = render;
  render = function () {
    var field = $('#bh-password'), key = field ? field.value : '';
    renderWithoutBackupKey();
    var next = $('#bh-password');
    if (next && backupHost.file && !backupHost.busy) next.value = key;
    key = '';
  };
  var backupHostTimer;
  async function backupHostRefresh() {
    clearTimeout(backupHostTimer);
    if (DEMO || !API.backupHostJobs) return;
    try { backupHost.jobs = (await API.backupHostJobs()).jobs; backupHost.error = ''; if (backupHost.jobs.some(function (j) { return j.request_id === backupHost.requestId && (j.state === 'ready' || j.state === 'cancelled'); })) backupHost.file = null; }
    catch (_) { backupHost.error = 'bhError'; }
    if (st.active === 'deploy' || st.active === 'backups') soon();
    if (backupHost.jobs.some(backupHostActive)) backupHostTimer = setTimeout(backupHostRefresh, 3000);
  }
  async function backupHostStart() {
    if (backupHost.busy || !backupHost.file || backupHost.jobs.some(backupHostBlocksStart)) return;
    var retry = backupHost.jobs.some(function (j) { return j.request_id === backupHost.requestId && backupHostNeedsKey(j); });
    var target = retry ? backupHost.submittedTarget : wizTarget(), v = wiz.vals[target] || {}, input = $('#bh-password'), password = input ? input.value : '';
    if (input) input.value = '';
    var options = {};
    ['name', 'hostId'].forEach(function (key) { if (v[key]) options[key] = v[key]; });
    ['memoryMb', 'cpus', 'diskGb'].forEach(function (key) { if (v[key] !== '' && v[key] != null) options[key] = Number(v[key]); });
    if (target === 'pi' && !retry) {
      try { options.pi_addresses = backupHostPiAddresses(backupHost.piAddresses); } catch (_) { backupHost.error = 'bhPiInvalid'; soon(); return; }
      options.model = ($('#pimodel') || {}).value || 'rpi5';
      options.drive_handle = ($('#bh-drive') || {}).value || '';
      if (!options.drive_handle) { backupHost.error = 'bhNoDrive'; soon(); return; }
    }
    if (retry) options = backupHost.submittedOptions;
    else { backupHost.submittedTarget = target; backupHost.submittedOptions = options; }
    backupHost.busy = true; backupHost.error = ''; soon();
    try {
      var j = await API.backupHostStart({ request_id: backupHost.requestId, upload_handle: backupHost.file.upload_handle, target: target, options: options, ...(password ? { password: password } : {}) });
      backupHost.jobs = backupHost.jobs.filter(function (old) { return old.id !== j.id; }).concat([j]);
      await backupHostRefresh();
    } catch (_) { backupHost.error = 'bhError'; }
    finally { password = ''; backupHost.busy = false; soon(); }
  }
  async function backupHostRetryPi(jobId) {
    if (backupHost.busy || DEMO) return;
    var job = backupHost.jobs.find(function (item) { return item.id === jobId; });
    if (!job || job.target !== 'pi' || job.state !== 'waiting_for_boot' || !job.upload_handle) return;
    var addresses;
    try { addresses = backupHostPiAddresses(backupHost.piAddressByJob[jobId] || ''); }
    catch (_) { backupHost.error = 'bhPiInvalid'; soon(); return; }
    backupHost.busy = true; backupHost.error = ''; soon();
    try {
      await API.backupHostStart({ request_id: job.request_id, upload_handle: job.upload_handle, target: 'pi', options: { pi_addresses: addresses } });
      await backupHostRefresh();
    } catch (_) { backupHost.error = 'bhError'; }
    finally { backupHost.busy = false; soon(); }
  }
  async function backupHostApproveSsh(jobId) {
    if (backupHost.busy || DEMO || typeof API.sshHostKeyApprove !== 'function') return;
    var job = backupHost.jobs.find(function (item) { return item.id === jobId; });
    if (!job || !backupHostCanApproveSsh(job)) return;
    backupHost.busy = true; backupHost.error = ''; soon();
    try {
      // The native dialog owns consent. Never send an approval flag or derive
      // the host from whichever target happens to be selected in the form.
      var result = await API.sshHostKeyApprove(job.host_id);
      if (result && result.approved === true && result.host_id === job.host_id) {
        await API.backupHostStart({ request_id: job.request_id, upload_handle: job.upload_handle, target: job.target });
        await backupHostRefresh();
      }
    } catch (_) { backupHost.error = 'bhError'; }
    finally { backupHost.busy = false; soon(); }
  }
  async function backupHostSetup() {
    if (DEMO || !API.hostBridgeStatus) { toast(w('bhUnavailable')); return; }
    try {
      var bridge = await API.hostBridgeStatus(); backupHost.bridge = bridge;
      dialog(w('bhSetup'), '<p class="bm">' + L('bhSetupHelp') + '</p><label class="col"><span class="ll">' + L('bhAddress') + '</span><select class="select" id="bh-address">' + (bridge.bind_addresses || []).map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('') + '</select></label><button class="btn fill" id="bh-enable"' + ((bridge.bind_addresses || []).length ? '' : ' disabled') + '>' + L('bhEnable') + '</button><div id="bh-bridge-result" aria-live="polite"></div>', { focus: '#bh-address' });
      $('#bh-enable').onclick = async function () {
        this.disabled = true;
        try {
          var result = await API.hostBridgeEnable({ address: $('#bh-address').value });
          var out = $('#bh-bridge-result');
          if (out) out.innerHTML = '<p class="bm">' + esc(result.address || '') + '</p><p class="bm">' + L('bhFingerprint') + '</p><code style="overflow-wrap:anywhere">' + esc(result.certificate_fingerprint || '') + '</code><p>' + L('bhSetupHelp') + '</p>';
        } catch (_) { var out = $('#bh-bridge-result'); if (out) out.textContent = w('bhError'); }
        finally { var button = $('#bh-enable'); if (button) button.disabled = false; }
      };
    } catch (_) { toast(w('bhError')); }
  }
  document.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-act^="bh-"], [data-bh-cancel], [data-bh-ssh-approve], [data-bh-pi-retry]');
    if (!button || button.disabled) return;
    if (DEMO || !API.backupPick) { toast(w('bhUnavailable')); return; }
    try {
      var action = button.dataset.act;
      if (action === 'bh-pick') {
        if (backupHost.busy || backupHost.jobs.some(backupHostActive)) return;
        backupHost.busy = true;
        try { var file = await API.backupPick(); if (file) { backupHost.file = file; backupHost.requestId = crypto.randomUUID(); backupHost.error = ''; go('deploy:top'); } }
        finally { backupHost.busy = false; soon(); }
      } else if (action === 'bh-start') await backupHostStart();
      else if (action === 'bh-refresh') await backupHostRefresh();
      else if (action === 'bh-clear') { if (backupHost.jobs.some(backupHostActive)) return; backupHost.file = null; backupHost.requestId = ''; backupHost.piAddresses = ''; soon(); }
      else if (action === 'bh-setup') await backupHostSetup();
      else if (action === 'bh-drives') { backupHost.drives = await API.backupPiDrives(); soon(); }
      else if (button.dataset.bhPiRetry) await backupHostRetryPi(button.dataset.bhPiRetry);
      else if (button.dataset.bhSshApprove) await backupHostApproveSsh(button.dataset.bhSshApprove);
      else if (button.dataset.bhCancel) { await API.backupHostCancel(button.dataset.bhCancel); await backupHostRefresh(); }
    } catch (_) { backupHost.error = 'bhError'; soon(); }
  });
  document.addEventListener('input', function (event) { if (event.target.id === 'bh-pi-addresses') backupHost.piAddresses = event.target.value; if (event.target.dataset.bhPiAddress) backupHost.piAddressByJob[event.target.dataset.bhPiAddress] = event.target.value; });
  document.addEventListener('change', function (event) { if (event.target.id === 'bh-drive') backupHost.drive = event.target.value; });
  window.addEventListener('beforeunload', function () { clearTimeout(backupHostTimer); backupHost.piAddresses = ''; backupHost.piAddressByJob = {}; var input = $('#bh-password'); if (input) input.value = ''; });
