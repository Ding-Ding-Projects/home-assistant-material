'use strict';
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { fail } = require('./backup-archive');

function targetUrl(base) {
  const u = new URL(base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw fail('invalid_target_address');
  return u;
}
function request(base, route, { method = 'GET', headers = {}, body, file, prefix, suffix, signal } = {}) {
  const url = new URL(route, targetUrl(base));
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, { method, headers, signal, timeout: file ? 3600000 : 15000 }, (res) => {
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

async function upload(base, file, agentId, signal) {
  const boundary = 'ham-' + crypto.randomBytes(24).toString('hex');
  const prefix = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="backup.tar"\r\nContent-Type: application/x-tar\r\n\r\n');
  const suffix = Buffer.from('\r\n--' + boundary + '--\r\n');
  return request(base, '/api/onboarding/backup/upload?agent_id=' + encodeURIComponent(agentId), { method: 'POST', signal, file, prefix, suffix, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': prefix.length + fs.statSync(file).size + suffix.length } });
}

async function restoreHomeAssistantBackup({ base, file, password, journal, signal, agentId = 'hassio.local', api = request, uploadFile = upload }) {
  // The caller supplies an independently provisioned, job-owned target, never the source.
  if (journal.phase === 'restore_submitted' || journal.phase === 'restore_accepted') return { reconciling: true };
  const info = await api(base, '/api/onboarding/backup/info', { signal });
  if (!Array.isArray(info.backups)) throw fail('invalid_target_response');
  let backupId = journal.backup_id;
  if (!backupId) { const result = await uploadFile(base, file, agentId, signal); backupId = result.backup_id; if (typeof backupId !== 'string') throw fail('invalid_target_response'); journal.update({ backup_id: backupId, phase: 'uploaded' }); }
  const body = JSON.stringify({ backup_id: backupId, agent_id: agentId, ...(password ? { password } : {}), restore_database: true });
  // Persist before transmission. An uncertain response must be reconciled, never replayed.
  journal.update({ phase: 'restore_submitted' });
  try { await api(base, '/api/onboarding/backup/restore', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body }); }
  catch (e) { if (['incorrect_password', 'backup_version_too_new', 'backup_no_core_archive', 'restore_failed', 'authentication_needed'].includes(e.code)) journal.update({ phase: 'restore_rejected', error_code: e.code }); throw e; }
  journal.update({ phase: 'restore_accepted', restore_accepted_at: new Date().toISOString() });
  return { accepted: true };
}
module.exports = { targetUrl, request, upload, restoreHomeAssistantBackup };
