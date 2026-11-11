'use strict';
// The app's main process: one window, the instance manager, and a narrow bridge to the page.
const { app, session, BrowserWindow, ipcMain, shell, dialog, safeStorage, nativeTheme, autoUpdater } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Manager, LABEL } = require('./backend/manager');
const { Downloads } = require('./backend/downloads');
const pi = require('./backend/pi-writer');
const { Extensions } = require('./backend/extensions');
const updates = require('./backend/updates');
const { DimSum } = require('./backend/dimsum');
const ha = require('./backend/ha');
const school = require('./backend/school');
const { Choco } = require('./backend/choco');
const { Minecraft } = require('./backend/minecraft');
const { Ollama, fit } = require('./backend/ollama');
const { VDisk } = require('./backend/vdisk');

if (require('node:os').platform() === 'win32' && require('./squirrel-events')(app)) app.quit();

let win;
let mgr;
const enc = (s) => (safeStorage.isEncryptionAvailable() ? 'k:' + safeStorage.encryptString(s).toString('base64') : 'p:' + Buffer.from(s).toString('base64'));
const dec = (s) => (s.startsWith('k:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : Buffer.from(s.slice(2), 'base64').toString());

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 360, minHeight: 520, show: false,
    // On Windows the system draws the window buttons over our own title bar, so Snap layouts appear
    // when you hover the maximise button. Elsewhere the window is frameless with the app's own buttons.
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#E1E2E8' : '#191C20', height: 48 } } : { frame: false }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111418' : '#F8F9FF',
    title: 'Home Assistant Material Deploy Assistant',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // For release checks: HAM_SNAPSHOT=<file.png> saves a picture of the window, then quits.
  if (process.env.HAM_SNAPSHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => { fs.writeFileSync(process.env.HAM_SNAPSHOT, (await win.webContents.capturePage()).toPNG()); app.quit(); }, Number(process.env.HAM_SNAPSHOT_WAIT || 5000)));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  ['maximize', 'unmaximize'].forEach((ev) => win.on(ev, () => send('window', { maximized: win.isMaximized() })));
}

// Opens an instance's compose.yaml in VS Code when it is installed, otherwise its folder.
async function editor(id) {
  const inst = mgr.get(id);
  const file = path.join(inst.dir || '', 'compose.yaml');
  const { run } = require('./backend/util');
  if (inst.target === 'docker' && fs.existsSync(file)) {
    const r = await run(process.platform === 'win32' ? 'code.cmd' : 'code', [file]);
    if (r.code === 0) return 'Opened in VS Code';
  }
  await shell.openPath(inst.dir || mgr.dir);
  return 'Opened its folder';
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send('ham', { channel, payload }); }

app.whenReady().then(() => {
  // Only the camera (for scanning a QR code in Tools) and writing to the clipboard are allowed.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb((perm === 'media' && !((details && details.mediaTypes) || []).includes('audio')) || perm === 'clipboard-sanitized-write'));
  mgr = new Manager(path.join(app.getPath('userData'), 'data'), { encrypt: enc, decrypt: dec });
  ['changed', 'log', 'step', 'busy', 'done', 'downloads'].forEach((ev) => mgr.on(ev, (p) => send(ev, p)));
  const dl = new Downloads(mgr);
  const ext = new Extensions(mgr, path.join(__dirname, 'extensions'));
  const upd = updates.start({ app, autoUpdater, send, dir: mgr.dir });
  const h = (name, fn) => ipcMain.handle(name, async (_e, ...a) => { try { return { ok: true, value: await fn(...a) }; } catch (e) { return { ok: false, error: e.message }; } });
  h('snapshot', () => mgr.snapshot());
  h('labels', () => LABEL);
  h('defaults', (t, hId) => mgr.defaults(t, hId));
  h('check', (t, hId) => mgr.check(t, hId));
  h('deploy', (o) => mgr.deploy(o));
  h('action', (id, a, arg) => { mgr.run(id, a, arg).catch(() => {}); return true; });
  h('saveHost', (x) => mgr.saveHost(x));
  h('removeHost', (id) => mgr.removeHost(id));
  h('testHost', (x) => { const id = mgr.saveHost(x); return mgr.check('ssh', id); });
  h('schedule', (s) => mgr.setSchedule(s));
  h('update', (id, p) => mgr.update(id, p));
  h('refresh', () => mgr.refresh());
  h('exportList', () => mgr.exportList());
  h('open', (url) => { if (!/^https?:\/\//.test(url)) throw new Error('Only web addresses open here.'); return shell.openExternal(url); });
  h('openFolder', (id) => shell.openPath(id ? mgr.get(id).dir : mgr.dir));
  h('pickKey', async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose your SSH private key', properties: ['openFile', 'showHiddenFiles'], defaultPath: path.join(app.getPath('home'), '.ssh') }); return r.canceled ? '' : r.filePaths[0]; });
  h('saveFile', async (name, text) => { const r = await dialog.showSaveDialog(win, { defaultPath: name }); if (r.canceled) return ''; fs.writeFileSync(r.filePath, text); return r.filePath; });
  // Files the converter and Base64 toolkit write: into a folder you picked, or beside a file you
  // picked or dropped. Never over an existing file (a number is added), written to a temporary name
  // first and renamed, so a half-written file is never left under the real name.
  const pickedDirs = new Set(); const written = new Set();
  const freeName = (dir, name) => { const ext = path.extname(name); const stem = name.slice(0, name.length - ext.length); let n = 0; let f = path.join(dir, name); while (fs.existsSync(f)) f = path.join(dir, stem + ' (' + (++n) + ')' + ext); return f; };
  const writeAtomic = (dir, name, bytes) => {
    if (!/^[^\\/:*?"<>|\u0000-\u001f]{1,200}$/.test(name) || name === '.' || name === '..') throw new Error('That file name is not allowed.');
    const buf = Buffer.from(bytes); if (buf.length > 2 * 1024 * 1024 * 1024) throw new Error('The result is larger than 2 GB.');
    const free = fs.statfsSync ? fs.statfsSync(dir) : null; if (free && free.bavail * free.bsize < buf.length + 64 * 1024 * 1024) throw new Error('Not enough free space in that folder.');
    const f = freeName(dir, name); const tmp = f + '.partial-' + process.pid;
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, f); written.add(f); return f;
  };
  const choco = new Choco(); choco.on('line', (l) => send('choco', l));
  h('chocoStatus', () => choco.status());
  h('chocoInstall', (keys) => choco.install(keys));
  const mc = new Minecraft(mgr); mc.on('console', (p) => send('mc-console', p)); mc.on('state', (p) => send('mc-state', p)); mc.on('progress', (p) => send('mc-progress', p)); mc.on('generate', (p) => send('mc-generate', p));
  h('mc', (fn, ...args) => {
    const allowed = ['list', 'catalog', 'create', 'start', 'stop', 'restart', 'command', 'status', 'stats', 'logs', 'players', 'playerAction', 'properties', 'setProperties', 'gamerule', 'search', 'install', 'addons', 'toggleAddon', 'removeAddon', 'backup', 'restore', 'deleteBackup', 'switchVersion', 'remove', 'presets', 'setSchedule'];
    if (!allowed.includes(fn)) throw new Error('Unknown action.'); return mc[fn](...args);
  });
  setInterval(() => mc.tick().catch(() => {}), 60000);
  h('mcMeta', () => { const m = require('./backend/minecraft'); return { flavours: m.FLAVOURS, targets: m.TARGETS, props: m.PROPS, rules: m.RULES }; });
  h('mcGenerate', async (o) => mc.generate(o, async (worldDir, output, slug) => {
    if (!pickedDirs.has(output.dir)) throw new Error('Choose the folder first.');
    if (output.kind === 'zip') {
      const { zipSync } = require('./renderer/vendor/fflate.js'); const files = {}; let total = 0;
      const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(f, r); else { total += fs.statSync(f).size; if (total > 4 * 1024 ** 3) throw new Error('The world is over 4 GB; choose a folder instead.'); files['world/' + r] = fs.readFileSync(f); } } };
      walk(worldDir, ''); const z = zipSync(files); const out = writeAtomic(output.dir, slug + '-world.zip', z);
      const back = require('./renderer/vendor/fflate.js').unzipSync(fs.readFileSync(out), { filter: () => true }); if (Object.keys(back).length !== Object.keys(files).length) throw new Error('The ZIP did not reopen with every file.');
      return out;
    }
    if (!pickedDirs.has(output.dir)) throw new Error('Choose the folder first.');
    let dest = path.join(output.dir, slug + '-world'); let n = 1; while (fs.existsSync(dest)) dest = path.join(output.dir, slug + '-world (' + (n++) + ')');
    fs.cpSync(worldDir, dest, { recursive: true }); if (!fs.existsSync(path.join(dest, 'level.dat'))) throw new Error('The copied world has no level.dat.');
    return dest;
  }));
  const ol = new Ollama(mgr); ['pull', 'chat', 'install', 'log', 'state'].forEach((ev) => ol.on(ev, (p) => send('ol-' + ev, p)));
  h('ol', (fn, ...args) => {
    const allowed = ['health', 'install', 'start', 'stop', 'installed', 'show', 'remove', 'copy', 'unload', 'pull', 'cancel', 'setCart', 'chat', 'stopChat', 'library', 'tags', 'hardware'];
    if (!allowed.includes(fn)) throw new Error('Unknown action.'); return ol[fn](...args);
  });
  h('olFit', (size, hw) => fit(size, hw));
  const vd = new VDisk(mgr);
  h('vd', (fn, ...args) => { const allowed = ['routes', 'library', 'addFiles', 'forget', 'scan', 'plan', 'execute', 'supported']; if (!allowed.includes(fn)) throw new Error('Unknown action.'); return vd[fn](...args); });
  h('vdLog', () => mgr.db.vdisk ? mgr.db.vdisk.log : []);
  h('pickFiles', async (title, exts) => { const r = await dialog.showOpenDialog(win, { title, properties: ['openFile', 'multiSelections'], filters: exts ? [{ name: 'Files', extensions: exts }] : [] }); return r.canceled ? [] : r.filePaths; });
  h('saveAs', async (title, name) => { const r = await dialog.showSaveDialog(win, { title, defaultPath: name }); return r.canceled ? '' : r.filePath; });
  h('school', () => school.read());
  h('schoolSet', (o) => school.set(o));
  school.watch((v) => send('school', v));
  h('overlay', (dark) => { if (process.platform === 'win32' && win.setTitleBarOverlay) win.setTitleBarOverlay({ color: '#00000000', symbolColor: dark ? '#E1E2E8' : '#191C20', height: 48 }); return process.platform === 'win32'; });
  h('extAdd', async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose an extension folder (it holds manifest.json)', properties: ['openDirectory'] }); if (r.canceled) return ext.list(); return ext.addFrom(r.filePaths[0]); });
  h('extRemove', (id) => ext.remove(id));
  h('extMaster', (on) => ext.setMaster(on));
  h('extRuns', () => ext.runs());
  h('pickFolder', async (title) => { const r = await dialog.showOpenDialog(win, { title: title || 'Choose where to save', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return ''; pickedDirs.add(r.filePaths[0]); return r.filePaths[0]; });
  h('writeInto', (dir, name, bytes) => { if (!pickedDirs.has(dir)) throw new Error('Choose the folder first.'); return writeAtomic(dir, name, bytes); });
  h('writeBeside', (source, name, bytes) => { if (!path.isAbsolute(source) || !fs.existsSync(source)) throw new Error('The source file is no longer there.'); return writeAtomic(path.dirname(source), name, bytes); });
  h('showFile', (f) => { if (!written.has(f)) throw new Error('Only files this app wrote can be shown.'); shell.showItemInFolder(f); return true; });
  h('downloads', () => dl.list());
  h('downloadAll', () => { dl.all(true); return true; });
  h('autoDownload', (on) => { mgr.setAutoDownload(on); if (on) dl.all(); return on; });
  h('drives', () => pi.listDrives());
  h('writePi', (o) => mgr.writePi(o));
  h('extensions', () => ext.list());
  h('extEnable', (id, on) => { ext.setEnabled(id, on); return ext.list(); });
  h('extRun', (id, c) => ext.run(id, c));
  h('extFolder', () => shell.openPath(ext.dir));
  h('checkUpdates', () => { upd.check(); return true; });
  h('updateTest', () => upd.selfTest());
  h('updateHistory', () => upd.history());
  h('restartToUpdate', () => { autoUpdater.quitAndInstall(); return true; });
  h('editor', (id) => editor(id));
  const dim = new DimSum(mgr.dir);
  h('dimsum', () => dim.surprise());
  h('history', () => mgr.history().map((r) => ({ rev: r.rev, at: r.at, action: r.action, text: r.text, records: r.records })));
  h('restoreRevision', (n) => mgr.restoreRevision(n));
  h('haSave', (o) => { ha.checkBase(o.base); mgr.db.ha = { base: o.base, token: o.token === '(saved)' && mgr.db.ha ? mgr.db.ha.token : o.token ? enc(o.token) : '' }; mgr.save(); return { base: o.base, saved: !!mgr.db.ha.token }; });
  h('haInfo', () => ({ base: (mgr.db.ha || {}).base || '', saved: !!(mgr.db.ha || {}).token }));
  h('haState', (entity) => { const c = mgr.db.ha || {}; return ha.entityState(c.base || '', c.token ? dec(c.token) : '', entity); });
  // Saves an export into the exports folder and opens it in VS Code, or its folder without VS Code.
  h('exportOpen', async (name, text) => {
    if (!/^[\w .()-]{1,120}$/.test(name)) throw new Error('That file name is not allowed.');
    const dir = path.join(mgr.dir, 'exports'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name); fs.writeFileSync(file, String(text).slice(0, 50 * 1024 * 1024));
    const { run } = require('./backend/util');
    const r = await run(process.platform === 'win32' ? 'code.cmd' : 'code', [file]).catch(() => ({ code: 1 }));
    if (r.code === 0) return 'Opened ' + name + ' in VS Code';
    shell.showItemInFolder(file); return 'Saved ' + name + '; VS Code was not found, so its folder is open';
  });
  h('about', () => { let bi = {}; try { bi = require('./build-info.json'); } catch { /* a development run */ } return { version: app.getVersion(), builtAt: bi.builtAt || '', codeName: bi.codeName || '', platform: process.platform, data: mgr.dir, electron: process.versions.electron }; });
  h('win', (a) => { if (a === 'min') win.minimize(); if (a === 'max') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } if (a === 'close') win.close(); return win.isMaximized(); });
  createWindow();
  setInterval(() => mgr.refresh().catch(() => {}), 5000);
  setInterval(() => mgr.tick().catch(() => {}), 30000);
  setTimeout(() => dl.all(), 4000);
  setInterval(() => dl.all(), 6 * 3600 * 1000);
});
app.on('window-all-closed', () => app.quit());
