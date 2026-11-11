'use strict';
// Keeps every operating system image and the container image downloaded and current, so a
// deployment or a Raspberry Pi card never waits on a download. Runs on start and every six hours.
const { fetchImage, latestImage, KINDS } = require('./images');
const { run } = require('./util');

const IMAGE = 'ghcr.io/ding-ding-projects/home-assistant-material:latest';

class Downloads {
  constructor(manager) {
    this.m = manager;
    this.items = {};
    Object.entries(KINDS).forEach(([k, v]) => { this.items[k] = { id: k, label: v.label, kind: 'os', state: 'waiting', fraction: 0 }; });
    this.items.container = { id: 'container', label: 'Container image for Docker', kind: 'container', state: 'waiting', fraction: 0 };
    this.running = false;
  }
  emit() { this.m.emit('downloads', this.list()); }
  list() { return Object.values(this.items); }
  set(id, patch) { Object.assign(this.items[id], patch); this.emit(); }

  async all(force) {
    if (this.running) return;
    if (!force && this.m.db.autoDownload === false) return;
    this.running = true;
    try {
      for (const [k, v] of Object.entries(KINDS)) {
        this.set(k, { state: 'checking', error: '' });
        try {
          const info = await latestImage(v.re);
          this.set(k, { state: 'downloading', release: info.release, name: info.name, size: info.size });
          const r = await fetchImage(v.re, this.m.cacheDir(), (line) => this.m.emit('log', { id: 'downloads', line }), (f) => this.set(k, { fraction: f }));
          this.set(k, { state: 'ready', fraction: 1, file: r.file, release: r.release, at: new Date().toISOString() });
        } catch (e) { this.set(k, { state: /No release has/.test(e.message) ? 'none' : 'failed', error: e.message }); }
      }
      this.set('container', { state: 'checking', error: '' });
      const d = await run(process.platform === 'win32' ? 'docker.exe' : 'docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 15000 });
      if (d.code !== 0) this.set('container', { state: 'skipped', error: 'Docker is not running on this computer.' });
      else {
        this.set('container', { state: 'downloading' });
        let layers = 0;
        const p = await run(process.platform === 'win32' ? 'docker.exe' : 'docker', ['pull', IMAGE], { onLine: (l) => { if (/Pull complete/.test(l)) { layers++; this.set('container', { detail: layers + ' layers ready' }); } } });
        this.set('container', p.code === 0 ? { state: 'ready', fraction: 1, at: new Date().toISOString(), detail: (p.out.match(/Digest: (\S+)/) || [])[1] || '' } : { state: 'failed', error: p.err.trim().split('\n').pop() });
      }
      // Each SSH host pulls the container image too, so its next deployment starts at once.
      for (const h of this.m.db.hosts) {
        const id = 'host-' + h.id;
        this.items[id] = this.items[id] || { id, label: 'Container image on ' + h.name, kind: 'container', state: 'checking' };
        try {
          const ssh = require('./ssh');
          const full = this.m.withSecrets({ hostId: h.id }).host;
          const c = await ssh.connect(full);
          this.set(id, { state: 'downloading' });
          const r = await ssh.exec(c, 'docker pull ' + IMAGE);
          c.end();
          this.set(id, r.code === 0 ? { state: 'ready', fraction: 1, at: new Date().toISOString() } : { state: 'failed', error: r.err.trim().split('\n').pop() });
        } catch (e) { this.set(id, { state: 'failed', error: e.message }); }
      }
    } finally { this.running = false; this.emit(); }
  }
}

module.exports = { Downloads };
