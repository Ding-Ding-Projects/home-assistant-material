/* Stands in for the computer when the page runs outside the app, such as the demo on the
 * project page. Nothing is deployed: it plays the same steps with made-up timings. */
(function () {
  'use strict';
  if (window.ham) return;
  var listeners = [];
  var emit = function (ch, p) { listeners.forEach(function (cb) { cb(ch, p); }); };
  var now = Date.now();
  var iso = function (ms) { return new Date(ms).toISOString(); };
  var db = {
    hosts: [{ id: 'h1', name: 'Living room Pi', address: '192.168.1.40', port: 22, user: 'pi', keyFile: '~/.ssh/id_ed25519', password: '', passphrase: '' }],
    schedule: { on: true, time: '03:00', keep: 7, consistent: true }, autoDownload: true,
    instances: [
      { id: 'i1', name: 'Home', slug: 'home', target: 'docker', port: 8123, tag: 'latest', created: iso(now - 864e5 * 9), state: 'running', url: 'http://localhost:8123', lanUrl: 'http://192.168.1.12:8123', dir: '~/.config/Deploy Assistant/data/instances/home', stats: { cpu: 3.1, mem: '412MiB' }, backups: [{ id: 'b1', at: iso(now - 36e5 * 5), note: 'Scheduled', kind: 'file', size: 18300000 }, { id: 'b2', at: iso(now - 864e5 * 1.2), note: 'Scheduled', kind: 'file', size: 18100000 }], backupsOn: true },
      { id: 'i2', name: 'Cottage', slug: 'cottage', target: 'ssh', hostId: 'h1', port: 8123, tag: 'latest', created: iso(now - 864e5 * 4), state: 'running', url: 'http://192.168.1.40:8123', dir: '~/home-assistant-material/cottage on the host', stats: { cpu: 7.4, mem: '388MiB' }, backups: [{ id: 'b3', at: iso(now - 36e5 * 5), note: 'Scheduled', kind: 'file', size: 9300000 }], backupsOn: true },
      { id: 'i3', name: 'Test system', slug: 'test-system', target: 'virtualbox', port: 8180, tag: '', created: iso(now - 864e5), state: 'stopped', url: 'http://localhost:8180', dir: '~/.config/Deploy Assistant/data/instances/test-system', backups: [{ id: 'b4', at: iso(now - 36e5 * 20), note: 'Before trying add-ons', kind: 'snapshot', name: 'backup-1' }], backupsOn: false }
    ]
  };
  var dl = [['virtualbox', 'VirtualBox disk', 'os', 'haos_ova-16.3.vdi.zip', 512000000], ['vmware', 'VMware appliance', 'os', 'haos_ova-16.3.ova', 498000000], ['rpi5', 'Raspberry Pi 5', 'os', 'haos_rpi5-64-16.3.img.xz', 402000000], ['rpi4', 'Raspberry Pi 4 and 400', 'os', 'haos_rpi4-64-16.3.img.xz', 398000000], ['rpi3', 'Raspberry Pi 3', 'os', 'haos_rpi3-64-16.3.img.xz', 391000000], ['container', 'Container image for Docker', 'container', '', 0]].map(function (x) { return { id: x[0], label: x[1], kind: x[2], name: x[3], size: x[4], state: 'ready', fraction: 1, release: x[2] === 'os' ? 'v2026.11.1.60' : '', at: iso(now - 36e5 * 2) }; });
  var snap = function () { return JSON.parse(JSON.stringify({ autoDownload: db.autoDownload, instances: db.instances, hosts: db.hosts.map(function (h) { return Object.assign({}, h, { password: h.password ? '(saved)' : '' }); }), schedule: db.schedule })); };
  var later = function (ms, fn) { setTimeout(fn, ms); };
  var STEPS = { docker: ['config', 'pull', 'start', 'wait'], ssh: ['config', 'pull', 'start', 'wait'], virtualbox: ['image', 'config', 'start', 'wait'], vmware: ['image', 'config', 'start', 'wait'] };
  var TEXT = { image: 'Downloading the operating system image', config: 'Writing the configuration', pull: 'Downloading the image', start: 'Starting it', wait: 'Waiting for Home Assistant to answer' };
  function play(inst) {
    var steps = STEPS[inst.target]; var t = 300;
    steps.forEach(function (k) {
      var n = k === 'image' || k === 'pull' ? 10 : 3;
      for (var i = 0; i <= n; i++) (function (i) { later(t, function () { emit('step', { id: inst.id, key: k, text: TEXT[k], fraction: n > 3 ? i / n : 0 }); emit('log', { id: inst.id, line: k === 'pull' ? 'homeassistant Pulling layer ' + (i + 1) + ' of ' + (n + 1) : k === 'image' ? 'Downloaded ' + Math.round((i / n) * 412) + ' of 412 MB' : TEXT[k] + '…' }); }); t += 450; })(i);
    });
    later(t + 300, function () { inst.state = 'running'; inst.url = inst.target === 'ssh' ? 'http://192.168.1.40:' + inst.port : inst.target === 'vmware' ? 'http://192.168.150.131/' : 'http://localhost:' + inst.port; inst.lanUrl = inst.target === 'docker' ? 'http://192.168.1.12:' + inst.port : ''; emit('log', { id: inst.id, line: 'Home Assistant answered at ' + inst.url }); emit('done', { id: inst.id, action: 'deploy', ok: true }); emit('changed', snap()); });
  }
  var free = function (target) { var used = db.instances.map(function (i) { return i.port; }); var p = target === 'virtualbox' ? 8180 : 8123; while (used.indexOf(p) >= 0) p++; return p; };
  var demoExts = [
    { id: 'health-report', name: 'Health report', version: '1.0.0', description: 'One page on every instance: what runs, what does not, and how old its newest backup is.', permissions: ['instances:read', 'backups:read', 'notify'], permissionText: ['See the list of instances: names, targets, links, states and ports', 'See when each instance was backed up', 'Show you a notification'], commands: [{ id: 'report', title: 'Make the health report' }], enabled: true },
    { id: 'link-sheet', name: 'Link sheet', version: '1.0.0', description: 'Every instance\'s link on one sheet, ready to paste or print for the household.', permissions: ['instances:read'], permissionText: ['See the list of instances: names, targets, links, states and ports'], commands: [{ id: 'sheet', title: 'Make the link sheet' }], enabled: false }];
  var api = {
    desktop: false,
    on: function (cb) { listeners.push(cb); },
    snapshot: async function () { return snap(); },
    labels: async function () { return {}; },
    about: async function () { return { version: (window.HAM_BUILD || {}).version || '1.1.0', builtAt: (window.HAM_BUILD || {}).builtAt || '', codeName: (window.HAM_BUILD || {}).codeName || '', data: '(demo)' }; },
    extensions: async function () { return demoExts; },
    extEnable: async function (id, on) { demoExts.forEach(function (x) { if (x.id === id) x.enabled = on; }); return demoExts; },
    extRun: async function (id) { var live = db.instances.filter(function (i) { return i.url; }); return id === 'link-sheet' ? { title: 'Link sheet', text: live.map(function (i) { return i.name + '\n  ' + i.url; }).join('\n\n') } : { title: 'Health report', text: live.map(function (i) { return '  ' + i.name + ': ' + i.state + ' at ' + i.url; }).join('\n') + '\n\nEverything is running and backed up in the last two days.' }; },
    extFolder: async function () { return true; }, vd: async function (fn, op, o) { if (fn !== 'plan') return []; var f = o.path || 'C:\\VirtualDisks\\new.vhdx', mb = Math.round((o.size || 64) * ({ MB: 1, GB: 1024, TB: 1048576 }[o.unit || 'GB'])); return { title: op + ' ' + f, route: 'diskpart', admin: true, ps: '$s = "create vdisk file=`"' + f + '`" maximum=' + mb + ' type=' + (o.type === 'fixed' ? 'fixed' : 'expandable') + '"\n$s | diskpart | Out-String', diskpart: 'create vdisk file="' + f + '" maximum=' + mb + ' type=' + (o.type === 'fixed' ? 'fixed' : 'expandable') }; },
    vdLog: async function () { return []; },
    history: async function () { var t = Date.now(); var recs = function (n) { return { instances: db.instances.slice(0, n).map(function (i) { return { id: i.id, name: i.name }; }), hosts: db.hosts, schedule: db.schedule }; }; return [{ rev: 1, at: iso(t - 864e5 * 9), action: 'started', text: 'The first record of this list', records: recs(1) }, { rev: 2, at: iso(t - 864e5 * 4), action: 'created', text: 'Instance Cottage added', records: recs(2) }, { rev: 3, at: iso(t - 864e5 * 2), action: 'created', text: 'Host Living room Pi added', records: recs(2) }, { rev: 4, at: iso(t - 864e5), action: 'created', text: 'Instance Test system added', records: recs(3) }, { rev: 5, at: iso(t - 36e5), action: 'settings changed', text: 'Backup schedule changed', records: recs(3) }]; },
    updateHistory: async function () { return { applied: [], tests: [] }; },
    updateTest: async function () { var steps = [['reach', 'Reach the project releases', 'Newest release deploy-assistant-v1.1.4.'], ['compare', 'Compare with this copy', 'This is the newest version; the test checks the same release.'], ['feed', 'Read the update feed (RELEASES)', 'ham_deploy_assistant-1.1.4-full.nupkg, 113.7 MB.'], ['package', 'Download the package and check it', 'Size matches; SHA-1 matches RELEASES; SHA-256 matches SHA256SUMS.'], ['install', 'Let the installer stage it', 'Nothing newer to stage.', 'skipped'], ['applied', 'Seen applied after a restart', 'No update has been applied to this copy yet.', 'skipped']].map(function (x) { return { key: x[0], title: x[1], detail: x[2], state: x[3] || 'passed' }; }); return { steps: steps }; }, checkUpdates: async function () { return true; }, restartToUpdate: async function () { return true; }, editor: async function () { return 'Opened in VS Code'; },
    defaults: async function (t) { return { target: t, name: 'Home ' + (db.instances.length + 1), port: t === 'vmware' ? 0 : free(t), tag: 'latest', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', memoryMb: 4096, cpus: 2, diskGb: 0, memoryLimit: '' }; },
    check: async function (t) { await new Promise(function (r) { setTimeout(r, 400); }); return t === 'vmware' ? { ok: false, detail: 'VMware Workstation is not installed.', fix: 'Install VMware Workstation Pro, which is free for personal use, then check again.', link: 'https://www.vmware.com/products/desktop-hypervisor/workstation-and-fusion' } : { ok: true, detail: { docker: 'Docker 28.1.1, Compose 2.36.0', ssh: 'Connected. Docker 28.0.4 on 192.168.1.40', virtualbox: 'VirtualBox 7.1.8' }[t] }; },
    deploy: async function (o) {
      var d = await api.defaults(o.target); var x = Object.assign(d, Object.fromEntries(Object.entries(o).filter(function (e) { return e[1] !== '' && e[1] != null; })));
      var slug = String(x.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
      var inst = { id: 'i' + Date.now().toString(36), name: x.name, slug: slug, target: x.target, hostId: x.hostId || undefined, port: x.target === 'vmware' ? 0 : Number(x.port), tag: x.tag, created: new Date().toISOString(), state: 'deploying', url: '', backups: [], backupsOn: x.backupsOn !== false, dir: '(demo)/' + slug };
      db.instances.push(inst); emit('changed', snap()); play(inst); return inst.id;
    },
    action: async function (id, a, arg) {
      var inst = db.instances.filter(function (i) { return i.id === id; })[0]; if (!inst) throw new Error('No such instance.');
      emit('busy', { id: id, action: a });
      later(900, function () {
        if (a === 'start' || a === 'restart' || a === 'update') { inst.state = 'running'; inst.stats = { cpu: 2.5, mem: '300MiB' }; }
        if (a === 'stop') { inst.state = 'stopped'; inst.stats = null; }
        if (a === 'backup') inst.backups.unshift({ id: 'b' + Date.now().toString(36), at: new Date().toISOString(), note: arg || '', kind: inst.target === 'virtualbox' || inst.target === 'vmware' ? 'snapshot' : 'file', size: inst.target === 'docker' || inst.target === 'ssh' ? 18000000 + Math.round(Math.random() * 1e6) : 0 });
        if (a === 'deleteBackup') inst.backups = inst.backups.filter(function (b) { return b.id !== arg; });
        if (a === 'remove') db.instances = db.instances.filter(function (i) { return i.id !== id; });
        if (a === 'logs') ['s6-rc: info: service legacy-services successfully started', 'INFO (MainThread) [homeassistant.bootstrap] Home Assistant initialized in 4.12s', 'INFO (MainThread) [homeassistant.core] Starting Home Assistant'].forEach(function (l) { emit('log', { id: id, line: l }); });
        emit('done', { id: id, action: a, ok: true }); emit('changed', snap());
      });
      return true;
    },
    saveHost: async function (h) { if (!h.address || !h.user) throw new Error('A host needs an address and a user name.'); var old = db.hosts.filter(function (x) { return x.id === h.id; })[0]; var rec = { id: h.id || 'h' + Date.now().toString(36), name: h.name || h.address, address: h.address, port: h.port || 22, user: h.user, keyFile: h.keyFile, password: h.password ? 'x' : '' }; if (old) Object.assign(old, rec); else db.hosts.push(rec); emit('changed', snap()); return rec.id; },
    testHost: async function (h) { await api.saveHost(h); return { ok: true, detail: 'Connected. Docker 28.0.4 on ' + h.address + ' (demo)' }; },
    removeHost: async function (id) { if (db.instances.some(function (i) { return i.hostId === id; })) throw new Error('Instances still run on this host. Remove them first.'); db.hosts = db.hosts.filter(function (h) { return h.id !== id; }); emit('changed', snap()); },
    schedule: async function (s) { Object.assign(db.schedule, s); emit('changed', snap()); },
    update: async function (id, p) { var i = db.instances.filter(function (x) { return x.id === id; })[0]; Object.assign(i, p); emit('changed', snap()); },
    refresh: async function () { db.instances.forEach(function (i) { if (i.state === 'running') i.stats = { cpu: Math.max(0.5, (i.stats ? i.stats.cpu : 3) + (Math.random() - 0.5) * 2), mem: (i.stats || {}).mem || '400MiB' }; }); emit('changed', snap()); },
    exportList: async function () { return db.instances.map(function (i) { return { name: i.name, target: i.target, address: i.url, state: i.state, port: i.port, created: i.created, backups: i.backups.length }; }); },
    downloads: async function () { return dl; },
    downloadAll: async function () { dl.forEach(function (d, n) { if (d.state !== 'none') { d.state = 'downloading'; d.fraction = 0; later(400 * (n + 1), function () { d.fraction = 0.6; listeners.forEach(function (cb) { cb('downloads', dl); }); }); later(800 * (n + 1), function () { d.state = 'ready'; d.fraction = 1; d.at = new Date().toISOString(); listeners.forEach(function (cb) { cb('downloads', dl); }); }); } }); return true; },
    autoDownload: async function (on) { db.autoDownload = on; emit('changed', snap()); return on; },
    drives: async function () { await new Promise(function (r) { setTimeout(r, 500); }); return [{ id: '/dev/sdb', name: 'SanDisk Extreme microSD', size: 63864569856, bus: 'usb' }, { id: '/dev/sdc', name: 'Samsung USB Drive', size: 128043712512, bus: 'usb' }]; },
    writePi: async function (o) {
      var inst = { id: 'i' + Date.now().toString(36), name: o.name || 'Raspberry Pi', slug: 'raspberry-pi', target: 'pi', model: o.model, port: 0, created: new Date().toISOString(), state: 'deploying', url: '', backups: [], dir: '' };
      db.instances.push(inst); emit('changed', snap()); var t = 300;
      [['image', 'Using the downloaded and checked image', 2], ['write', 'Writing to ' + o.drive.name, 12], ['verify', 'Checking what was written', 6], ['insert', 'Put the card in the Pi and power it on', 4]].forEach(function (s) { for (var i = 0; i <= s[2]; i++) (function (i) { later(t, function () { emit('step', { id: inst.id, key: s[0], text: s[1], fraction: s[2] > 4 ? i / s[2] : 0 }); }); t += 400; })(i); });
      later(t + 200, function () { inst.state = 'running'; inst.url = 'http://homeassistant.local'; emit('done', { id: inst.id, action: 'deploy', ok: true }); emit('changed', snap()); });
      return inst.id;
    },
    open: async function () {}, openFolder: async function () { throw new Error('The demo has no folder to open.'); }, pickKey: async function () { return ''; }, saveFile: async function () { return ''; }, win: async function () { return false; }
  };
  window.ham = api;
  setInterval(function () { api.refresh(); }, 4000);
})();
