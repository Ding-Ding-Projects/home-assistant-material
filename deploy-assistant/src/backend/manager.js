'use strict';
// Keeps the list of instances, hosts and backups, and runs every action through the right target.
// Plain JSON in the app's data folder; SSH passwords are encrypted with the system keychain.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { freePort, uniqueSlug, stamp } = require('./util');

const TARGETS = { docker: require('./docker-local'), ssh: require('./ssh'), virtualbox: require('./virtualbox'), vmware: require('./vmware'), pi: require('./pi') };
const LABEL = { docker: 'Docker on this computer', ssh: 'SSH host', virtualbox: 'VirtualBox', vmware: 'VMware', pi: 'Raspberry Pi' };
const { KINDS } = require('./images');

class Manager extends EventEmitter {
  constructor(dataDir, { encrypt = (s) => s, decrypt = (s) => s, portCheck } = {}) {
    super();
    this.dir = dataDir;
    this.file = path.join(dataDir, 'instances.json');
    this.encrypt = encrypt;
    this.decrypt = decrypt;
    this.portCheck = portCheck;
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = { version: 1, instances: [], hosts: [], schedule: { on: false, time: '03:00', keep: 7, consistent: true }, autoDownload: true };
    try { Object.assign(this.db, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* first start */ }
    this.busy = {};
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
    this.emit('changed', this.snapshot());
  }

  snapshot() {
    return {
      instances: this.db.instances.map((i) => ({ ...i, host: i.host ? { ...i.host, password: undefined, passphrase: undefined } : undefined })),
      hosts: this.db.hosts.map((h) => ({ ...h, password: h.password ? '(saved)' : '', passphrase: h.passphrase ? '(saved)' : '' })),
      schedule: this.db.schedule,
      autoDownload: this.db.autoDownload !== false
    };
  }

  cacheDir() { return path.join(this.dir, 'images'); }
  setAutoDownload(on) { this.db.autoDownload = !!on; this.save(); }

  // Writes a Raspberry Pi card: image (already downloaded when automatic downloads are on),
  // write and check, then wait for the Pi to answer and add it to the list.
  async writePi({ model, drive, name }) {
    const kind = KINDS[model];
    if (!kind || !/^rpi/.test(model)) throw new Error('Choose a Raspberry Pi model.');
    if (!drive || !drive.id) throw new Error('Choose the card or drive to write.');
    const pw = require('./pi-writer');
    const inst = { id: 'i' + Date.now().toString(36), name: String(name || kind.label).slice(0, 60), slug: uniqueSlug(name || model, this.db.instances.map((i) => i.slug)), target: 'pi', model, port: 0, created: new Date().toISOString(), state: 'deploying', url: '', backups: [], backupsOn: false, dir: '' };
    this.db.instances.push(inst);
    this.save();
    const id = inst.id;
    const log = (line) => this.emit('log', { id, line: String(line) });
    const step = (key, text, fraction) => this.emit('step', { id, key, text, fraction });
    this.busy[id] = 'write';
    (async () => {
      try {
        step('image', 'Getting the ' + kind.label + ' image');
        const img = await require('./images').fetchImage(kind.re, this.cacheDir(), log, (f) => step('image', 'Downloading the ' + kind.label + ' image', f));
        step('write', 'Writing to ' + drive.name + ' (your system asks for permission)');
        await pw.write({ image: img.file, drive, log, onProgress: (p) => step(p.state === 'verifying' ? 'verify' : 'write', p.state === 'verifying' ? 'Checking what was written' : 'Writing to ' + drive.name, p.fraction) });
        step('insert', 'Done writing. Put the card in the Pi, connect the network cable, and power it on');
        log('Written and checked. Waiting for the Pi at http://homeassistant.local');
        const url = await pw.waitForPi(log, 40);
        if (!url) throw new Error('The card is written and checked, but no Pi answered at homeassistant.local within 40 minutes. Check its network cable; you can add its address by hand later.');
        Object.assign(inst, { state: 'running', url, deployed: new Date().toISOString() });
        step('done', 'Ready');
        this.emit('done', { id, action: 'deploy', ok: true });
      } catch (e) {
        inst.state = 'failed'; inst.lastError = e.message;
        this.emit('done', { id, action: 'deploy', ok: false, error: e.message });
      } finally { delete this.busy[id]; this.save(); }
    })();
    return id;
  }

  target(id) { const t = TARGETS[id]; if (!t) throw new Error('Unknown target ' + id); return t; }
  get(id) { const i = this.db.instances.find((x) => x.id === id); if (!i) throw new Error('No instance with id ' + id); return i; }
  withSecrets(inst) {
    if (!inst.hostId) return inst;
    const h = this.db.hosts.find((x) => x.id === inst.hostId);
    if (!h) throw new Error('The SSH host of this instance was removed.');
    return { ...inst, host: { ...h, password: h.password ? this.decrypt(h.password) : '', passphrase: h.passphrase ? this.decrypt(h.passphrase) : '' } };
  }

  async check(targetId, hostId) {
    const host = hostId ? this.withSecrets({ hostId }).host : undefined;
    try { return await this.target(targetId).check(host); } catch (e) { return { ok: false, detail: e.message }; }
  }

  saveHost(h) {
    const list = this.db.hosts;
    const old = list.find((x) => x.id === h.id);
    const rec = { id: h.id || 'h' + Date.now().toString(36), name: h.name || h.address, address: String(h.address || '').trim(), port: Number(h.port) || 22, user: String(h.user || '').trim(), keyFile: h.keyFile || '' };
    if (!rec.address || !rec.user) throw new Error('A host needs an address and a user name.');
    rec.password = h.password === '(saved)' && old ? old.password : h.password ? this.encrypt(h.password) : '';
    rec.passphrase = h.passphrase === '(saved)' && old ? old.passphrase : h.passphrase ? this.encrypt(h.passphrase) : '';
    if (old) Object.assign(old, rec); else list.push(rec);
    this.save();
    return rec.id;
  }
  removeHost(id) {
    if (this.db.instances.some((i) => i.hostId === id)) throw new Error('Instances still run on this host. Remove them first.');
    this.db.hosts = this.db.hosts.filter((h) => h.id !== id); this.save();
  }

  // Everything one click needs, filled in: a free name, a free port, the latest image.
  async defaults(targetId, hostId) {
    const n = this.db.instances.length + 1;
    const name = 'Home ' + n;
    const taken = this.db.instances.filter((i) => (targetId === 'ssh' ? i.hostId === hostId : i.target !== 'ssh')).map((i) => i.port);
    const start = targetId === 'virtualbox' ? 8180 : 8123;
    const port = targetId === 'vmware' ? 0 : targetId === 'ssh' ? (taken.length ? Math.max(...taken) + 1 : 8123) : await freePort(start, taken, this.portCheck);
    return { target: targetId, hostId: hostId || '', name, port, tag: 'latest', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', memoryMb: 4096, cpus: 2, diskGb: 0, memoryLimit: '', backupsOn: true };
  }

  async deploy(opts) {
    const d = await this.defaults(opts.target, opts.hostId);
    const o = { ...d, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== '' && v != null)) };
    if (o.target === 'ssh' && !o.hostId) throw new Error('Choose an SSH host first.');
    const slugs = this.db.instances.map((i) => i.slug);
    const inst = {
      id: 'i' + Date.now().toString(36), name: String(o.name).slice(0, 60), slug: uniqueSlug(o.slug || o.name, slugs), target: o.target, hostId: o.hostId || undefined,
      port: Number(o.port) || 0, tag: o.tag, timezone: o.timezone, memoryMb: Number(o.memoryMb), cpus: Number(o.cpus), diskGb: Number(o.diskGb) || 0, memoryLimit: o.memoryLimit,
      created: new Date().toISOString(), state: 'deploying', url: '', lanUrl: '', backups: [], backupsOn: o.backupsOn !== false, notes: ''
    };
    inst.dir = path.join(this.dir, 'instances', inst.slug);
    this.db.instances.push(inst);
    this.save();
    this.run(inst.id, 'deploy');
    return inst.id;
  }

  // Runs an action in the background and reports progress as events.
  async run(id, action, arg) {
    if (this.busy[id]) throw new Error('This instance is busy: ' + this.busy[id] + '.');
    const inst = this.get(id);
    const t = this.target(inst.target);
    const log = (line) => this.emit('log', { id, line: String(line) });
    const step = (key, text, fraction) => this.emit('step', { id, key, text, fraction });
    this.busy[id] = action;
    this.emit('busy', { id, action });
    try {
      const full = this.withSecrets(inst);
      let res;
      if (action === 'deploy') {
        res = await t.deploy(full, log, step, { cacheDir: path.join(this.dir, 'images') });
        Object.assign(inst, { state: 'running', url: res.url, lanUrl: res.lanUrl || '', ip: full.ip || inst.ip, deployed: new Date().toISOString() });
        step('done', 'Ready');
      } else if (action === 'backup') {
        const b = await t.backup(full, path.join(this.dir, 'backups', inst.slug), { consistent: this.db.schedule.consistent });
        inst.backups.unshift({ id: 'b' + Date.now().toString(36), at: new Date().toISOString(), note: arg || '', ...b });
        res = b;
      } else if (action === 'restore') {
        const b = inst.backups.find((x) => x.id === arg);
        if (!b) throw new Error('That backup no longer exists.');
        res = await t.restore(full, b);
      } else if (action === 'deleteBackup') {
        const b = inst.backups.find((x) => x.id === arg);
        if (b) await t.deleteBackup(full, b);
        inst.backups = inst.backups.filter((x) => x.id !== arg);
      } else if (action === 'remove') {
        await t.remove(full, { keepData: !!arg });
        this.db.instances = this.db.instances.filter((x) => x.id !== id);
      } else if (['start', 'stop', 'restart', 'update'].includes(action)) {
        const r = await t[action](full, log);
        if (r && r.code && r.code !== 0) throw new Error(action + ' failed. ' + String(r.err || '').trim().split('\n').pop());
        if (full.ip) inst.ip = full.ip;
        if (inst.target === 'vmware') Object.assign(inst, t.urls(inst));
      } else if (action === 'logs') {
        res = await t.logs(full, log);
      } else throw new Error('Unknown action ' + action);
      this.emit('done', { id, action, ok: true, result: res });
      return res;
    } catch (e) {
      if (action === 'deploy') inst.state = 'failed';
      inst.lastError = e.message;
      this.emit('done', { id, action, ok: false, error: e.message });
      throw e;
    } finally {
      delete this.busy[id];
      this.save();
    }
  }

  async refresh() {
    await Promise.all(this.db.instances.map(async (inst) => {
      if (this.busy[inst.id] || inst.state === 'deploying' || inst.state === 'failed') return;
      try {
        const full = this.withSecrets(inst);
        const t = this.target(inst.target);
        inst.state = await t.status(full);
        inst.stats = inst.state === 'running' ? await t.stats(full) : null;
      } catch { inst.state = 'unreachable'; }
    }));
    this.emit('changed', this.snapshot());
  }

  setSchedule(s) { Object.assign(this.db.schedule, s); this.save(); }
  update(id, patch) {
    const inst = this.get(id);
    ['name', 'notes', 'backupsOn', 'tag', 'memoryLimit'].forEach((k) => { if (k in patch) inst[k] = patch[k]; });
    if (inst.target === 'docker' && ('tag' in patch || 'memoryLimit' in patch)) this.target('docker').write(inst);
    this.save();
  }

  // Daily backups at the chosen time, keeping the newest N per instance.
  async tick(now = new Date()) {
    const s = this.db.schedule;
    if (!s.on) return;
    const hm = now.toTimeString().slice(0, 5);
    const today = now.toISOString().slice(0, 10);
    if (hm !== s.time || s.lastRun === today) return;
    s.lastRun = today;
    this.save();
    for (const inst of this.db.instances.filter((i) => i.backupsOn && i.state !== 'failed')) {
      try { await this.run(inst.id, 'backup', 'Scheduled'); } catch { /* reported through the done event */ }
      const auto = inst.backups.filter((b) => b.note === 'Scheduled');
      for (const old of auto.slice(s.keep)) { try { await this.run(inst.id, 'deleteBackup', old.id); } catch { /* reported */ } }
    }
  }

  exportList() {
    return this.db.instances.map((i) => ({ name: i.name, target: LABEL[i.target], address: i.url, state: i.state, port: i.port, image: i.tag, created: i.created, backups: i.backups.length }));
  }
}

module.exports = { Manager, TARGETS, LABEL, stamp };
