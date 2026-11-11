'use strict';
// Target record for a Raspberry Pi written by the app. The Pi runs on its own, so the app can
// only see whether it answers; backups and updates happen inside Home Assistant on the Pi.
const http = require('node:http');

function answers(url) {
  return new Promise((resolve) => { const r = http.get(url, { timeout: 4000 }, (res) => { res.resume(); resolve(res.statusCode < 500); }); r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); }); });
}
const inside = () => { throw new Error('This Raspberry Pi runs on its own. Do this inside Home Assistant on the Pi: Settings, System.'); };

module.exports = {
  id: 'pi',
  async check() { return { ok: true, detail: 'Needs an SD card or USB drive of 32 GB or more, and a card reader.' }; },
  async status(inst) { return inst.url && (await answers(inst.url)) ? 'running' : 'unreachable'; },
  async stats() { return null; },
  urls: (inst) => ({ url: inst.url, lanUrl: null }),
  start: inside, stop: inside, restart: inside, update: inside, backup: inside, restore: inside, deleteBackup: inside,
  async logs(inst, onLine) { onLine('Logs are inside Home Assistant on the Pi: Settings, System, Logs.'); return { code: 0 }; },
  async remove() { /* forgets the Pi; nothing on it changes */ }
};
