'use strict';
// The only door between the page and the computer: a fixed list of calls, no Node.js in the page.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (name) => async (...args) => { const r = await ipcRenderer.invoke(name, ...args); if (!r.ok) throw new Error(r.error); return r.value; };
const api = {};
['snapshot', 'labels', 'defaults', 'check', 'deploy', 'action', 'saveHost', 'removeHost', 'testHost', 'schedule', 'update', 'refresh', 'exportList', 'open', 'openFolder', 'pickKey', 'saveFile', 'about', 'win', 'downloads', 'downloadAll', 'autoDownload', 'drives', 'writePi', 'extensions', 'extEnable', 'extRun', 'extFolder', 'checkUpdates', 'updateTest', 'updateHistory', 'restartToUpdate', 'editor', 'dimsum', 'history', 'restoreRevision', 'haSave', 'haInfo', 'haState', 'exportOpen', 'pickFolder', 'writeInto', 'showFile'].forEach((n) => { api[n] = call(n); });
// Writing beside a file needs its real path, which only a file you picked or dropped has.
api.writeBeside = async (file, name, bytes) => { const p = webUtils.getPathForFile(file); if (!p) throw new Error('This file has no folder on this computer.'); const r = await ipcRenderer.invoke('writeBeside', p, name, bytes); if (!r.ok) throw new Error(r.error); return r.value; };
api.pathOf = (file) => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } };
api.on = (cb) => { ipcRenderer.on('ham', (_e, m) => cb(m.channel, m.payload)); };
api.desktop = true;
contextBridge.exposeInMainWorld('ham', api);
