'use strict';
// Chrome-style updates. On Windows the Squirrel installer updates itself in the background from
// the newest Deploy Assistant release and the app shows a "restart to update" banner; elsewhere
// the app tells you a new version is out and where to get it. Nothing is code-signed, and the
// banner says so.
const { getJson } = require('./util');

const API = 'https://api.github.com/repos/Ding-Ding-Projects/home-assistant-material/releases?per_page=50';
const newer = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

async function latest() {
  const list = await getJson(API);
  const r = list.find((x) => !x.draft && /^deploy-assistant-v/.test(x.tag_name));
  return r ? { version: r.tag_name.replace('deploy-assistant-v', ''), tag: r.tag_name, url: r.html_url, feed: 'https://github.com/Ding-Ding-Projects/home-assistant-material/releases/download/' + r.tag_name } : null;
}

function start({ app, autoUpdater, send }) {
  const check = async () => {
    try {
      const l = await latest();
      if (!l || !newer(l.version, app.getVersion())) { send('update', { state: 'current', version: app.getVersion() }); return; }
      if (process.platform === 'win32' && app.isPackaged) {
        autoUpdater.setFeedURL({ url: l.feed });
        autoUpdater.once('update-downloaded', () => send('update', { state: 'ready', version: l.version }));
        autoUpdater.once('error', (e) => send('update', { state: 'failed', version: l.version, error: e.message }));
        send('update', { state: 'downloading', version: l.version });
        autoUpdater.checkForUpdates();
      } else send('update', { state: 'available', version: l.version, url: l.url });
    } catch (e) { send('update', { state: 'offline', error: e.message }); }
  };
  setTimeout(check, 15000);
  setInterval(check, 4 * 3600 * 1000);
  return check;
}

module.exports = { start, newer };
