'use strict';
// Handles the Squirrel.Windows install, update and uninstall events: makes or removes the
// Start menu shortcut, then quits. Returns true when the app should quit right away.
const path = require('node:path');
const { spawn } = require('node:child_process');

module.exports = function handle(app) {
  const cmd = process.argv[1];
  if (!cmd || !cmd.startsWith('--squirrel')) return false;
  const update = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const exe = path.basename(process.execPath);
  const go = (args) => { try { spawn(update, args, { detached: true }).on('close', () => app.quit()); } catch { app.quit(); } };
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated') { go(['--createShortcut', exe]); return true; }
  if (cmd === '--squirrel-uninstall') { go(['--removeShortcut', exe]); return true; }
  if (cmd === '--squirrel-obsolete') { app.quit(); return true; }
  return false;
};
