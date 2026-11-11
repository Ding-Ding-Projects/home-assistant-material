'use strict';
// School mode, shared by every Ding Ding Projects app for this person on this computer: one small
// file in a common folder, so switching it on here switches it on everywhere. It can be renamed,
// and it can carry an unlock PIN (stored only as a salted PBKDF2 hash) that is needed to switch
// it off. Every app watches the file and follows it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function folder() {
  if (process.env.DING_DING_SHARED) return process.env.DING_DING_SHARED;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Ding Ding Projects');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Ding Ding Projects');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'ding-ding-projects');
}
const file = () => path.join(folder(), 'school-mode.json');
const hashPin = (pin, salt) => crypto.pbkdf2Sync(String(pin), salt, 210000, 32, 'sha256').toString('hex');

function read() {
  try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); return { on: !!j.on, name: String(j.name || 'School mode').slice(0, 40), locked: !!j.pinHash, by: String(j.by || ''), at: String(j.at || '') }; }
  catch { return { on: false, name: 'School mode', locked: false, by: '', at: '' }; }
}
function raw() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } }
function write(j) { fs.mkdirSync(folder(), { recursive: true }); const tmp = file() + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 2)); fs.renameSync(tmp, file()); }

function set({ on, name, pin, newPin, app }) {
  const j = raw();
  if (j.pinHash && (on === false || newPin !== undefined)) {
    if (!pin || hashPin(pin, j.salt) !== j.pinHash) throw new Error('That is not the School mode PIN.');
  }
  if (on !== undefined) j.on = !!on;
  if (name !== undefined) { const n = String(name).trim(); if (!n || n.length > 40) throw new Error('The name must be 1 to 40 characters.'); j.name = n; }
  if (newPin !== undefined) {
    if (newPin === '') { delete j.pinHash; delete j.salt; }
    else { if (!/^\d{4,12}$/.test(newPin)) throw new Error('The PIN must be 4 to 12 digits.'); j.salt = crypto.randomBytes(16).toString('hex'); j.pinHash = hashPin(newPin, j.salt); }
  }
  j.by = app || 'Deploy Assistant'; j.at = new Date().toISOString();
  write(j);
  return read();
}

function watch(cb) { let last = JSON.stringify(read()); fs.watchFile(file(), { interval: 3000 }, () => { const now = JSON.stringify(read()); if (now !== last) { last = now; cb(read()); } }); }

module.exports = { read, set, watch, folder };
