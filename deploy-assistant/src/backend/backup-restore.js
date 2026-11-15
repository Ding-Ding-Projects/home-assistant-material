'use strict';
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const tls = require('node:tls');
const net = require('node:net');
const dns = require('node:dns').promises;
const { once } = require('node:events');
const { fail } = require('./backup-archive');
const privateAddress = (address) => net.isIPv4(address) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);

async function lanOrigin(value, { lookup = dns.lookup } = {}) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw fail('invalid_target_address');
  let addresses;
  if (net.isIP(url.hostname)) addresses = [{ address: url.hostname }];
  else {
    let timeout;
    try { addresses = await Promise.race([lookup(url.hostname, { all: true, family: 4 }), new Promise((resolve, reject) => { timeout = setTimeout(() => reject(fail('lan_address_unavailable')), 5000); })]); }
    finally { clearTimeout(timeout); }
  }
  if (!addresses.length || addresses.some((entry) => !privateAddress(entry.address))) throw fail('lan_address_unavailable');
  url.hostname = addresses[0].address; return url.href;
}
function coreManifest(value) { return value && typeof value.name === 'string' && typeof value.short_name === 'string' && value.start_url === '/?homescreen=1' && value.id === '/?homescreen=1' && Array.isArray(value.icons) && value.icons.length > 0; }

function targetUrl(base, { certificate_fingerprint, fingerprint256, allowLanProbe = false } = {}) {
  const u = new URL(base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw fail('invalid_target_address');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  const privateV4 = net.isIPv4(u.hostname) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  if (u.protocol === 'http:' && !loopback && !(allowLanProbe && privateV4)) throw fail('encrypted_restore_transport_required');
  if (u.protocol === 'https:' && !/^[a-f0-9]{64}$/i.test((certificate_fingerprint || fingerprint256 || '').replaceAll(':', ''))) throw fail('verified_tls_pin_required');
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
  return u;
}
function request(base, route, { method = 'GET', headers = {}, body, file, prefix, suffix, signal, transport = {}, allowLanProbe = false } = {}) {
  const probe = allowLanProbe && method === 'GET' && route === '/manifest.json' && !body && !file && Object.keys(headers).length === 0;
  const url = new URL(route, targetUrl(base, { ...transport, allowLanProbe: probe }));
  return new Promise((resolve, reject) => {
    if (transport.servername && !/^[a-z0-9-]{1,63}\.invalid$/.test(transport.servername)) { reject(fail('invalid_tls_identity')); return; }
    const secure = url.protocol === 'https:' ? { ...(transport.ca ? { ca: transport.ca } : {}), ...(transport.servername ? { servername: transport.servername } : {}), checkServerIdentity: (host, certificate) => {
      const identityError = tls.checkServerIdentity(host, certificate); if (identityError) return identityError;
      const actual = crypto.createHash('sha256').update(certificate.raw).digest('hex');
      if (actual !== (transport.certificate_fingerprint || transport.fingerprint256).replaceAll(':', '').toLowerCase()) return fail('target_certificate_changed');
      return undefined;
    } } : {};
    const req = (url.protocol === 'https:' ? https : http).request(url, { method, headers, signal, ...secure, timeout: file ? 3600000 : 15000 }, (res) => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; if (text.length > 1024 * 1024) res.destroy(fail('response_too_large')); });
      res.on('error', reject);
      res.on('end', () => {
        let value = {}; try { if (text) value = JSON.parse(text); } catch { if (res.statusCode < 400) { reject(fail('invalid_target_response')); return; } }
        if (res.statusCode === 401 || res.statusCode === 403) { reject(fail('authentication_needed')); return; }
        if (res.statusCode < 200 || res.statusCode >= 300) { reject(fail(['incorrect_password', 'backup_version_too_new', 'backup_no_core_archive', 'restore_failed'].includes(value.code) ? value.code : 'target_request_failed')); return; }
        resolve(value);
      });
    });
    req.on('timeout', () => req.destroy(fail('target_timeout'))); req.on('error', reject);
    if (file) {
      (async () => {
        req.write(prefix);
        for await (const chunk of fs.createReadStream(file)) { if (!req.write(chunk)) await once(req, 'drain'); }
        req.end(suffix);
      })().catch((e) => req.destroy(e));
    } else req.end(body);
  });
}

async function upload(base, file, agentId, signal, transport) {
  const boundary = 'ham-' + crypto.randomBytes(24).toString('hex');
  const prefix = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="backup.tar"\r\nContent-Type: application/x-tar\r\n\r\n');
  const suffix = Buffer.from('\r\n--' + boundary + '--\r\n');
  return request(base, '/api/onboarding/backup/upload?agent_id=' + encodeURIComponent(agentId), { method: 'POST', signal, transport, file, prefix, suffix, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': prefix.length + fs.statSync(file).size + suffix.length } });
}

async function restoreHomeAssistantBackup({ base, file, password, journal, signal, transport = {}, agentId = 'hassio.local', api = request, uploadFile = upload }) {
  // The caller supplies an independently provisioned, job-owned target, never the source.
  if (journal.phase === 'restore_submitted' || journal.phase === 'restore_accepted') return { reconciling: true };
  const info = await api(base, '/api/onboarding/backup/info', { signal, transport });
  if (!Array.isArray(info.backups)) throw fail('invalid_target_response');
  let backupId = journal.backup_id;
  if (!backupId) { const result = await uploadFile(base, file, agentId, signal, transport); backupId = result.backup_id; if (typeof backupId !== 'string') throw fail('invalid_target_response'); journal.update({ backup_id: backupId, phase: 'uploaded' }); }
  const body = JSON.stringify({ backup_id: backupId, agent_id: agentId, ...(password ? { password } : {}), restore_database: true });
  // Persist before transmission. An uncertain response must be reconciled, never replayed.
  journal.update({ phase: 'restore_submitted' });
  try { await api(base, '/api/onboarding/backup/restore', { method: 'POST', signal, transport, headers: { 'Content-Type': 'application/json' }, body }); }
  catch (e) { if (['incorrect_password', 'backup_version_too_new', 'backup_no_core_archive', 'restore_failed', 'authentication_needed'].includes(e.code)) journal.update({ phase: 'restore_rejected', error_code: e.code }); throw e; }
  journal.update({ phase: 'restore_accepted', restore_accepted_at: new Date().toISOString() });
  return { accepted: true };
}
module.exports = { targetUrl, request, upload, restoreHomeAssistantBackup, lanOrigin, coreManifest };
