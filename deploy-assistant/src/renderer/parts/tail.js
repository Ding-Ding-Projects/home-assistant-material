
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
      var note = c && !c.ok ? '<div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">' + esc(c.detail) + ' ' + esc(c.fix || '') + (c.link ? ' <a href="' + esc(c.link) + '" data-ext="' + esc(c.link) + '">How to install</a>' : '') + '</span></div>' : '';
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
    return '<div class="section" id="top"><h1 class="hl">' + L('backups') + '</h1><p class="bl mu">Docker and SSH instances are backed up as an archive of their config folder on this computer; virtual machines as snapshots. Restoring keeps the current config beside it, so nothing is lost.</p>' +
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
  var hsel = {};
  R.hosts = function () {
    var m = matcher(q.hosts); var list = D.hosts.filter(function (h) { return m.test(h.name + ' ' + h.address + ' ' + h.user); });
    return '<div class="section" id="top"><div class="row" style="gap:12px;flex-wrap:wrap"><h1 class="hl grow">' + L('hosts') + '</h1><button class="btn fill" data-act="addhost">' + icon('Plus', 's') + 'Add a host</button></div><p class="bl mu">Linux computers with Docker that you reach over SSH. Passwords are encrypted with your system\'s keychain; a key file or the SSH agent is better.</p>' +
      '<div class="toolbar">' + findField('hsearch', 'Search hosts', q.hosts) + '<button class="btn text sm" data-act="export-hosts">' + icon('Export', 's') + L('export') + '</button></div>' + (function () { var n = Object.keys(hsel).filter(function (k) { return hsel[k]; }).length; return n ? '<div class="selbar" role="region" aria-label="Selected hosts"><span class="ll grow">' + n + ' selected</span><button class="btn tonal sm" data-act="hstest">Test each</button><button class="btn tonal sm" data-act="hsdel">' + icon('DeleteOutline', 's') + 'Remove</button><button class="btn text sm" data-act="hsclear">' + L('clear') + '</button></div>' : ''; })() + (list.length ? list.map(function (h) { var n = D.instances.filter(function (i) { return i.hostId === h.id; }).length; return '<div class="row-item" data-k="host-' + h.id + '"><input type="checkbox" data-hsel="' + h.id + '" aria-label="Select ' + esc(h.name) + '"' + (hsel[h.id] ? ' checked' : '') + '><span class="sq">' + icon('ServerNetwork') + '</span><span class="col grow"><span class="ll">' + esc(h.name) + '</span><span class="bs mu mono">' + esc(h.user) + '@' + esc(h.address) + ':' + h.port + ' · ' + (h.keyFile ? 'key ' + esc(h.keyFile) : h.password ? 'password saved' : 'SSH agent') + ' · ' + n + ' instances</span></span><button class="btn text sm" data-testhost="' + h.id + '">Test</button><button class="btn text sm" data-edithost="' + h.id + '">Edit</button><button class="btn text sm" data-rmhost="' + h.id + '">' + L('remove') + '</button></div>'; }).join('') : '<p class="bm mu">No hosts yet.</p>') + '</div>' + foot();
  };
  R.activity = function () {
    var m = matcher(q.activity);
    var list = activity.filter(function (a) { return (view.logFor === 'all' || a.id === view.logFor) && m.test(a.line); }).slice(-400);
    return '<div class="section" id="top"><h1 class="hl">' + L('activity') + '</h1><p class="bl mu">Everything the app did, as it happened, and the changes you made to its settings.</p><div class="toolbar">' + findField('asearch', 'Search activity', q.activity) +
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
    return '<div class="section" id="top"><h1 class="hl">' + L('settings') + '</h1>' + findField('ssearch', 'Search settings', q.settings) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
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
    return '<div class="section" id="top"><h1 class="hl">' + L('help') + '</h1><p class="bl mu">Every article works offline.</p>' + findField('hpsearch', 'Search help', q.help) + (list.length ? list.map(function (h) { return '<article class="card col" id="h-' + h[0] + '" data-k="help-' + h[0] + '" style="padding:20px;gap:8px"><h2 class="tm">' + esc(h[1]) + '</h2><p class="bm">' + esc(h[2]) + '</p></article>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };

  // ---------- Extensions, tools, support, changes ----------
  var exts = [], extRuns = [], schoolInfo = { name: 'School mode', locked: false };
  R.extensions = function () {
    var m = matcher(q.extensions); var list = exts.filter(function (x) { return m.test([x.name, x.description, x.id].join(' ')); });
    return '<div class="section" id="top"><div class="row" style="gap:12px;flex-wrap:wrap"><h1 class="hl grow">' + L('extensions') + '</h1><button class="btn fill" data-act="extadd">' + icon('Plus', 's') + 'Add from a folder</button><button class="btn tonal" data-act="extfolder">' + icon('FolderOpen', 's') + 'Open the extensions folder</button><button class="btn text" data-go="help:h-extensions">' + icon('BookOpenVariant', 's') + 'How to write one</button></div>' +
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
    return '<div class="section" id="top"><h1 class="hl">' + L('tools') + '</h1><p class="bl mu">Small tools that run entirely in this window.</p><div class="chipline">' + [['regex', 'Pattern workbench'], ['base64', 'Base64'], ['convert', 'Convert'], ['colour', 'Colour'], ['otp', 'Authenticator']].map(function (x) { return '<button class="chip" data-go="tools:' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<section class="section" id="regex" data-k="t-regex"><h2 class="tl">Pattern workbench</h2><p class="bm mu">The same workbench every search here opens.</p><div><button class="btn tonal" data-regex="">Open the workbench</button></div></section>' +
      '<section class="section" id="base64" data-k="t-b64"><h2 class="tl">Base64, converting and drawing</h2><p class="bm mu">Each has its own tab now.</p><div class="chipline"><button class="btn tonal sm" data-go="base64:top">Base64</button><button class="btn tonal sm" data-go="convert:top">Convert</button><button class="btn tonal sm" data-go="draw:top">Draw</button></div></section>' +
      '<section class="section" id="qrmake" data-k="t-qr"><h2 class="tl">Make a QR code</h2><p class="bm mu">From any text or link, or from a one-time code you added below.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input class="input grow" id="qrtext" aria-label="Text for the QR code" placeholder="http://homeassistant.local:8123"><button class="btn tonal sm" data-act="qrmake">Make it</button>' + (st.otp.length ? '<select class="select" id="qrotp" aria-label="One-time code">' + st.otp.map(function (o2, i2) { return '<option value="' + i2 + '">' + esc(o2.name) + '</option>'; }).join('') + '</select><button class="btn text sm" data-act="qrotp">Show its QR code</button>' : '') + '</div></section>' +
      '<section class="section" id="convert" data-k="t-conv"><h2 class="tl">Convert</h2><p class="bm mu">Paste JSON (a list of objects) or CSV, then convert. Progress and errors show here.</p><textarea class="input" id="cvin" aria-label="Text to convert">[{"name": "Kitchen", "port": 8123}, {"name": "Garage", "port": 8124}]</textarea><div class="chipline"><button class="btn tonal sm" data-conv="csv">To CSV</button><button class="btn tonal sm" data-conv="json">To JSON</button><button class="btn tonal sm" data-conv="yaml">To YAML</button><button class="btn tonal sm" data-conv="md">To Markdown</button></div><div id="cvstat" class="bs mu" aria-live="polite"></div><pre class="wb-test" id="cvout"></pre></section>' +
      '<section class="section" id="colour" data-k="t-col"><h2 class="tl">Colour</h2><div class="row" style="gap:16px;flex-wrap:wrap"><input type="color" id="colin" value="#00639b" aria-label="Pick a colour" style="width:64px;height:48px;border:0;background:none"><input class="input mono" id="coltext" value="#00639B" aria-label="Type a colour as hex, rgb() or hsl()"><span class="swatch" id="colsw" style="background:#00639B"></span></div><div id="colout" class="bm"></div></section>' +
      '<section class="section" id="otp" data-k="t-otp"><h2 class="tl">Authenticator</h2><p class="bm mu">Add a one-time code secret (Base32). Codes are worked out here every 30 seconds. Or scan the QR code a site shows you: from an image, a pasted screenshot, or the camera. Nothing leaves this computer.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input class="input" id="otpname" placeholder="Name" aria-label="Name"><input class="input mono" id="otpsecret" placeholder="JBSWY3DPEHPK3PXP" aria-label="Secret"><button class="btn tonal sm" data-act="otpadd">Add</button></div><div class="chipline"><label class="btn tonal sm">' + icon('QrcodeScan', 's') + 'QR code from an image<input type="file" id="qrfile" accept="image/*" hidden></label><button class="btn tonal sm" data-act="qrcam">Use the camera</button><span class="bs mu">or paste a screenshot here</span></div><video id="qrvideo" class="qrvideo" hidden playsinline muted aria-label="Camera view for scanning a QR code"></video><div id="qrout" class="bs mu" aria-live="polite"></div><div id="otplist"></div></section>' + foot();
  };
  var PRESETS = [['A deploy failed', 'Deploying to … stopped at the step …', 'Try again; checked the target on the Deploy tab'], ['Cannot open an instance', 'The link does not load.', 'Restarted it; checked the port'], ['Forgot a lock PIN', 'I locked an element in this window and forgot its PIN.', 'Settings, Reset everything in this window']];
  R.support = function () {
    return '<div class="section" id="top"><h1 class="hl">' + L('support') + '</h1><p class="bl mu">Help when something goes wrong, and a place to note it. Tickets stay on this computer; copy them as text to send them on.</p>' +
      '<section class="card" data-k="sup-first" style="padding:24px"><h2 class="tl">First things to try</h2><ol class="bm" style="margin:0;padding-left:20px"><li>Deploy tab: press the circle arrow beside the place to check it again.</li><li>Activity tab: every line a deploy wrote, searchable.</li><li>Instances: the menu on a card has Logs and Restart.</li><li>Forgot a lock PIN: Settings, Reset everything in this window. Instances and backups are not touched.</li></ol></section>' +
      '<section class="section" id="new"><h2 class="tl">New ticket</h2><div class="chipline"><span class="bs mu">Start from:</span>' + PRESETS.map(function (p, i) { return '<button class="chip" data-preset="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<label class="col" style="gap:4px"><span class="ll">Title</span><input class="input" id="tk-title" maxlength="120"></label><span class="field-err" id="tk-title-err" role="alert"></span><label class="col" style="gap:4px"><span class="ll">What happened</span><textarea class="input" id="tk-what" style="font-family:inherit"></textarea></label><label class="col" style="gap:4px"><span class="ll">What you tried</span><input class="input" id="tk-tried"></label>' +
      '<label class="row bm" style="gap:10px"><input type="checkbox" id="tk-act" checked> Add the last 40 activity lines</label><div><button class="btn fill" data-act="ticket">Save the ticket</button></div></section>' +
      '<section class="section"><h2 class="tl">Your tickets</h2>' + (st.tickets.length ? st.tickets.map(function (x, i) { return '<div class="row-item" data-k="tk-' + x.t + '"><span class="col grow"><span class="ll">' + esc(x.title) + '</span><span class="bs mu">' + esc(when(new Date(x.t).toISOString())) + ' · ' + esc(x.what) + (x.tried ? ' · Tried: ' + esc(x.tried) : '') + '</span></span><button class="btn text sm" data-rmticket="' + i + '">Remove</button></div>'; }).join('') : '<p class="bm mu">No tickets yet.</p>') +
      '<button class="btn tonal" style="align-self:flex-start" data-act="copy-tickets">' + icon('ContentCopy', 's') + 'Copy your tickets as text</button></section>' + foot();
  };
  R.changes = function () {
    var m = matcher(q.changes);
    return '<div class="section" id="top"><h1 class="hl">' + L('changes') + '</h1><div>' + provenance() + '</div>' + findField('csearch', 'Search changes', q.changes) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' +
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
    return '<div class="section" id="top"><h1 class="hl">' + L('run') + '</h1><p class="bl mu">The Deploy tab does all of this for you. These are the same steps by hand, for when you want them.</p>' +
      '<section class="card" data-k="run-cmd" style="padding:24px"><h2 class="tl">One container</h2><p class="bm mu">For amd64 and arm64. Then open <span class="mono">http://&lt;host&gt;:8123</span>.</p><div class="code"><pre>' + esc(cmd) + '</pre><button class="ib" data-copy="' + esc(cmd) + '" aria-label="Copy the command">' + icon('ContentCopy', 's') + '</button></div></section>' +
      '<section class="card" data-k="run-os" style="padding:24px"><h2 class="tl">Operating system images</h2><p class="bm mu">For Raspberry Pi cards and virtual machines. The Downloads tab fetches and checks every one of them for you.</p><div><button class="btn tonal" data-go="downloads:top">' + icon('Download', 's') + 'Open Downloads</button> <button class="btn text" data-go="deploy:top">' + icon('RocketLaunch', 's') + 'Or deploy in one click</button></div></section>' + foot();
  };
  R.features = function () {
    var m = matcher(q.features), counts = {}, groups = [];
    SITE.features.forEach(function (f) { counts[f.state] = (counts[f.state] || 0) + 1; if (groups.indexOf(f.group) < 0) groups.push(f.group); });
    var list = SITE.features.filter(function (f) { return (fview.state === 'all' || f.state === fview.state) && (fview.group === 'all' || f.group === fview.group) && m.test(f.name + ' ' + f.what + ' ' + f.id + ' ' + f.group); });
    var chip = function (k, v, label, cur) { return '<button class="chip' + (cur === v ? ' sel' : '') + '" aria-pressed="' + (cur === v) + '" data-' + k + '="' + esc(v) + '">' + label + '</button>'; };
    return '<div class="section" id="top"><h1 class="hl">' + L('features') + '</h1><p class="bl mu">Every feature the project owes, with its honest state in the product. ' + SITE.features.length + ' in all, from the project page of version ' + esc(SITE.version) + '.</p>' + findField('fsearch', 'Search features', q.features) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
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
    return '<div class="section" id="top"><h1 class="hl">' + L('articles') + '</h1><p class="bl mu">One article per feature, all inside this app, no connection needed.</p>' + findField('arsearch', 'Search articles', q.articles) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '<p class="bs mu" aria-live="polite">' + list.length + ' shown</p></div>' +
      '<div class="igrid">' + (list.length ? list.map(function (f) { return '<button class="extcard" style="text-align:left;border:0;font:inherit;color:inherit;cursor:pointer" data-k="ac-' + f.id + '" data-article="' + f.id + '"><span class="chipline"><span class="tm">' + esc(f.name) + '</span>' + featTag(f.state) + '</span><span class="bm mu">' + esc(f.what) + '</span></button>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div>' + foot();
  };
  R.status = function () {
    var m = matcher(q.status);
    var out = SITE.status.map(function (sec, si) {
      var rows = sec.rows.filter(function (r) { return m.test(sec.title + ' ' + r.join(' ')); }); if (!rows.length) return '';
      return '<section class="section" id="st-' + si + '" data-k="st-' + si + '"><h2 class="tl">' + esc(sec.title) + '</h2><div class="scrollbox"><table class="t"><thead><tr>' + sec.head.map(function (h) { return '<th class="ll">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { var s2 = (r[1] || '').toLowerCase(), tone = /^done|^built/.test(s2) ? 'g' : /not started|^designed/.test(s2) ? '' : /partly|wired|written/.test(s2) ? 'p' : ''; return '<tr><td class="ll">' + esc(r[0]) + '</td><td><span class="tag ' + tone + '">' + esc(r[1] || '') + '</span></td>' + r.slice(2).map(function (c) { return '<td class="bs">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></section>';
    }).join('');
    return '<div class="section" id="top"><h1 class="hl">' + L('status') + '</h1><p class="bl mu">What exists today, stated plainly, from the project\'s status page at version ' + esc(SITE.version) + '. Nothing is called done until it has been seen working.</p>' + findField('stsearch', 'Search the status', q.status) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '</div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
  };
  R.design = function () {
    var m = matcher(q.design), total = 0;
    var cvs = SITE.canvases.filter(function (c) { return /^1[678]-deploy/.test(c.id); });
    var out = cvs.map(function (c) {
      var list = c.boards.filter(function (b) { return m.test(c.title + ' ' + b.title + ' ' + b.name); }); total += list.length; if (!list.length) return '';
      return '<section class="section" id="cv-' + c.id + '" data-k="cv-' + c.id + '"><h2 class="tl">' + esc(c.title) + ' <span class="bs mu">' + c.boards.length + ' boards</span></h2><div class="thumbs">' + list.map(function (b) { return '<button class="thumb" data-board="' + esc(b.name) + '" data-btitle="' + esc(b.title) + '"><img src="boards/' + esc(b.name) + '.webp" alt="" loading="lazy"><span class="bs">' + esc(b.title) + '</span></button>'; }).join('') + '</div></section>';
    }).join('');
    var n = cvs.reduce(function (a, c) { return a + c.boards.length; }, 0);
    return '<div class="section" id="top"><h1 class="hl">' + L('design') + '</h1><p class="bl mu">The design of this app: ' + n + ' boards, each drawn from the app itself in one state. Choose one to see it full size.</p>' + findField('dgsearch', 'Search the boards', q.design) + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') + '<p class="bs mu" aria-live="polite">' + total + ' shown</p></div>' + (out || '<p class="bm mu">' + L('noMatch') + '</p>') + foot();
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
    if (st.active === 'draw') drPaint();
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
    [['Convert files', 'convert:top'], ['Convert, PDF tools', 'convert:cv-pdf'], ['Base64, files', 'base64:b64files'], ['Draw', 'draw:top'], ['Tools, Make a QR code', 'tools:qrmake'], ['Settings, ADHD modes', 'settings:adhd'], ['Activity, History of your records', 'activity:records'], ['Instances, Live chart', 'instances:top'], ['Tools, Base64', 'tools:base64'], ['Tools, Convert', 'tools:convert'], ['Tools, Colour', 'tools:colour'], ['Tools, Authenticator', 'tools:otp'], ['Support, New ticket', 'support:new'], ['Settings, Modes', 'settings:modes'], ['Settings, Sound and voice', 'settings:sound'], ['Settings, Schedule', 'settings:schedule'], ['Settings, Name and logo', 'settings:identity'], ['Settings, Updates', 'settings:updates']].forEach(function (a3) { items.push({ kind: 'Page', label: a3[0], go: a3[1] }); }); items.push({ kind: 'Action', label: 'Download everything now', act: 'dlall' });
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
      if (ch === 'log') { addActivity(p.id, p.line); if (progress[p.id]) { progress[p.id].log.push(p.line); if (progress[p.id].log.length > 2000) progress[p.id].log.shift(); } if (st.active === 'deploy' || st.active === 'activity') soon(); }
      if (ch === 'step') { var g = progress[p.id] = progress[p.id] || { log: [], done: false }; if (p.key === 'done') return; g.step = p.key; g.text = p.text; g.fraction = p.fraction || 0; soon(); }
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
