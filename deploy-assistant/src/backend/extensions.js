'use strict';
// Extensions: folders with a manifest.json and a script that runs in its own process. The app
// sends one JSON line with the command and only the data its permissions allow, and reads one
// JSON line back. Time and size are limited; passwords and keys are never sent. A new or changed
// permission turns the extension off until the person agrees again.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PERMS = {
  'instances:read': 'See the list of instances: names, targets, links, states and ports',
  'backups:read': 'See when each instance was backed up',
  notify: 'Show you a notification'
};
const LIMITS = { timeoutMs: 15000, outBytes: 256 * 1024 };

function readManifest(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (m.manifestVersion !== 1) throw new Error('manifestVersion must be 1');
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(m.id || '')) throw new Error('id must be lower-case letters, digits and dashes');
  if (!m.name || !m.version || !m.main) throw new Error('name, version and main are required');
  if (path.isAbsolute(m.main) || m.main.includes('..')) throw new Error('main must be a file inside the extension folder');
  const unknown = (m.permissions || []).filter((p) => !PERMS[p]);
  if (unknown.length) throw new Error('unknown permissions: ' + unknown.join(', '));
  if (!Array.isArray(m.commands) || !m.commands.length) throw new Error('at least one command is required');
  return { id: m.id, name: String(m.name), version: String(m.version), description: String(m.description || ''), permissions: m.permissions || [], main: m.main, commands: m.commands.map((c) => ({ id: String(c.id), title: String(c.title) })), dir };
}

class Extensions {
  constructor(manager, builtinDir) {
    this.m = manager;
    this.dir = path.join(manager.dir, 'extensions');
    fs.mkdirSync(this.dir, { recursive: true });
    // Built-in extensions are copied in once and updated when the app has a newer version.
    for (const id of fs.existsSync(builtinDir) ? fs.readdirSync(builtinDir) : []) {
      const src = path.join(builtinDir, id);
      const dest = path.join(this.dir, id);
      let copy = !fs.existsSync(dest);
      if (!copy) { try { copy = readManifest(src).version !== readManifest(dest).version; } catch { copy = true; } }
      if (copy) { fs.mkdirSync(dest, { recursive: true }); for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f)); }
    }
    this.grants = manager.db.extensionGrants = manager.db.extensionGrants || {};
  }

  list() {
    return fs.readdirSync(this.dir).map((d) => {
      const dir = path.join(this.dir, d);
      try {
        const x = readManifest(dir);
        const g = this.grants[x.id];
        const granted = g && x.permissions.every((p) => g.permissions.includes(p));
        return { ...x, dir, enabled: !!(g && g.enabled && granted), needsConsent: !!(g && g.enabled && !granted), permissionText: x.permissions.map((p) => PERMS[p]) };
      } catch (e) { return { id: d, name: d, error: e.message, dir, enabled: false, permissions: [], commands: [] }; }
    });
  }

  setEnabled(id, on) {
    const x = this.list().find((e) => e.id === id);
    if (!x || x.error) throw new Error('That extension cannot be loaded.');
    this.grants[id] = { enabled: !!on, permissions: on ? x.permissions.slice() : [], version: x.version, at: new Date().toISOString() };
    this.m.save();
  }

  run(id, commandId) {
    const x = this.list().find((e) => e.id === id);
    if (!x || !x.enabled) throw new Error('Turn the extension on first.');
    if (!x.commands.some((c) => c.id === commandId)) throw new Error('That extension has no such command.');
    const input = { command: commandId, app: 'deploy-assistant' };
    const snap = this.m.snapshot();
    if (x.permissions.includes('instances:read')) input.instances = snap.instances.map((i) => ({ name: i.name, target: i.target, url: i.url, state: i.state, port: i.port, created: i.created }));
    if (x.permissions.includes('backups:read')) input.backups = snap.instances.map((i) => ({ name: i.name, backups: (i.backups || []).map((b) => ({ at: b.at, kind: b.kind, size: b.size || 0 })) }));
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(x.dir, x.main)], { cwd: x.dir, env: { ELECTRON_RUN_AS_NODE: '1', PATH: process.env.PATH }, windowsHide: true });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error(x.name + ' took longer than 15 seconds and was stopped.')); }, LIMITS.timeoutMs);
      child.stdout.on('data', (d) => { out += d; if (out.length > LIMITS.outBytes) { child.kill(); clearTimeout(timer); reject(new Error(x.name + ' answered with more than 256 KB and was stopped.')); } });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', () => {
        clearTimeout(timer);
        const line = out.split('\n').find((l) => l.trim().startsWith('{'));
        if (!line) { reject(new Error(x.name + ' gave no answer. ' + err.trim().split('\n').pop())); return; }
        try {
          const r = JSON.parse(line);
          resolve({ title: String(r.title || x.name), text: String(r.text || ''), notify: x.permissions.includes('notify') && r.notify ? String(r.notify).slice(0, 200) : '' });
        } catch (e) { reject(new Error(x.name + ' answered with something that is not JSON.')); }
      });
      child.stdin.end(JSON.stringify(input) + '\n');
    });
  }
}

module.exports = { Extensions, PERMS, readManifest };
