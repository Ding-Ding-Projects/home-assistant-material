'use strict';
// The app's main process: one window, the instance manager, and a narrow bridge to the page.
const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Manager, LABEL } = require('./backend/manager');
const { Downloads } = require('./backend/downloads');
const pi = require('./backend/pi-writer');

if (require('node:os').platform() === 'win32' && require('./squirrel-events')(app)) app.quit();

let win;
let mgr;
const enc = (s) => (safeStorage.isEncryptionAvailable() ? 'k:' + safeStorage.encryptString(s).toString('base64') : 'p:' + Buffer.from(s).toString('base64'));
const dec = (s) => (s.startsWith('k:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : Buffer.from(s.slice(2), 'base64').toString());

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 360, minHeight: 520, frame: false, show: false,
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

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send('ham', { channel, payload }); }

app.whenReady().then(() => {
  mgr = new Manager(path.join(app.getPath('userData'), 'data'), { encrypt: enc, decrypt: dec });
  ['changed', 'log', 'step', 'busy', 'done', 'downloads'].forEach((ev) => mgr.on(ev, (p) => send(ev, p)));
  const dl = new Downloads(mgr);
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
  h('downloads', () => dl.list());
  h('downloadAll', () => { dl.all(true); return true; });
  h('autoDownload', (on) => { mgr.setAutoDownload(on); if (on) dl.all(); return on; });
  h('drives', () => pi.listDrives());
  h('writePi', (o) => mgr.writePi(o));
  h('about', () => ({ version: app.getVersion(), platform: process.platform, data: mgr.dir, electron: process.versions.electron }));
  h('win', (a) => { if (a === 'min') win.minimize(); if (a === 'max') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } if (a === 'close') win.close(); return win.isMaximized(); });
  createWindow();
  setInterval(() => mgr.refresh().catch(() => {}), 5000);
  setInterval(() => mgr.tick().catch(() => {}), 30000);
  setTimeout(() => dl.all(), 4000);
  setInterval(() => dl.all(), 6 * 3600 * 1000);
});
app.on('window-all-closed', () => app.quit());
