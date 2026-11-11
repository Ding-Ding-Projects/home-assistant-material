'use strict';
// The only door between the page and the computer: a fixed list of calls, no Node.js in the page.
const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => async (...args) => { const r = await ipcRenderer.invoke(name, ...args); if (!r.ok) throw new Error(r.error); return r.value; };
const api = {};
['snapshot', 'labels', 'defaults', 'check', 'deploy', 'action', 'saveHost', 'removeHost', 'testHost', 'schedule', 'update', 'refresh', 'exportList', 'open', 'openFolder', 'pickKey', 'saveFile', 'about', 'win', 'downloads', 'downloadAll', 'autoDownload', 'drives', 'writePi'].forEach((n) => { api[n] = call(n); });
api.on = (cb) => { ipcRenderer.on('ham', (_e, m) => cb(m.channel, m.payload)); };
api.desktop = true;
contextBridge.exposeInMainWorld('ham', api);
