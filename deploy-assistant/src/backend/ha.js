'use strict';
// Reads one Home Assistant boolean entity for a scheduled settings rule. HTTPS only, or plain HTTP
// to this computer; no redirects; 8 seconds and 64 KB at most. The token stays encrypted in the
// app's data and is never logged or sent to the window.
const http = require('node:http');
const https = require('node:https');

function checkBase(base) {
  let u;
  try { u = new URL(base); } catch { throw new Error('That is not an address.'); }
  if (u.username || u.password) throw new Error('Put no user name or password in the address.');
  const loop = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loop)) throw new Error('Use https://, or http:// only for this computer.');
  return u;
}

function entityState(base, token, entity) {
  const u = checkBase(base);
  if (!/^(binary_sensor|input_boolean)\.[a-z0-9_]{1,80}$/.test(entity)) throw new Error('The entity must be a binary_sensor or input_boolean, such as input_boolean.evening.');
  if (!token) throw new Error('No Home Assistant token is saved.');
  const url = new URL('/api/states/' + entity, u);
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, timeout: 8000 }, (res) => {
      if (res.statusCode === 401) { res.resume(); reject(new Error('Home Assistant refused the token.')); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Home Assistant answered ' + res.statusCode + '.')); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 65536) res.destroy(new Error('The answer is too large.')); });
      res.on('end', () => { try { const j = JSON.parse(body); if (j.state !== 'on' && j.state !== 'off') throw new Error('The entity is ' + String(j.state).slice(0, 20) + ', not on or off.'); resolve(j.state); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('Home Assistant did not answer within 8 seconds.')));
    req.on('error', reject);
  });
}

module.exports = { entityState, checkBase };
