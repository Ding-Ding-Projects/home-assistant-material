'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { fail } = require('./backup-archive');
const { restoreHomeAssistantBackup, request } = require('./backup-restore');
const { lanAddress } = require('./util');

const TERMINAL = new Set(['ready', 'cancelled']);
class BackupJobs extends EventEmitter {
  constructor(manager, uploads, { restore = restoreHomeAssistantBackup, probe = request } = {}) {
    super(); this.manager = manager; this.uploads = uploads; this.restore = restore; this.probe = probe; this.piApprovals = new Map();
    this.file = path.join(manager.dir, 'backup-host-jobs.json'); this.running = new Map();
    this.jobs = [];
    try { const db = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (db.version !== 1 || !Array.isArray(db.jobs)) throw fail('invalid_job_journal'); this.jobs = db.jobs; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const job of this.jobs) if (!TERMINAL.has(job.state)) { job.state = 'needs_resume'; job.error_code = 'application_restarted'; }
    this.save();
  }
  save() { const temp = this.file + '.tmp'; fs.writeFileSync(temp, JSON.stringify({ version: 1, jobs: this.jobs }), { mode: 0o600 }); fs.renameSync(temp, this.file); }
  public(job) { const { id, request_id, state, phase, target, instance_id, lan_url, error_code, updated_at } = job; return { id, request_id, state, phase, target, instance_id, lan_url, error_code, updated_at }; }
  list() { return { jobs: this.jobs.map((j) => this.public(j)) }; }
  update(job, patch) { Object.assign(job, patch, { updated_at: new Date().toISOString() }); this.save(); this.emit('changed', this.public(job)); }
  start(input) {
    if (!input || !/^[A-Za-z0-9_-]{8,100}$/.test(input.request_id || '') || !['docker', 'ssh', 'virtualbox', 'vmware', 'pi'].includes(input.target)) throw fail('invalid_request');
    if (input.password !== undefined && (typeof input.password !== 'string' || input.password.length > 16384)) throw fail('invalid_password');
    const previous = this.jobs.find((j) => j.request_id === input.request_id);
    if (previous) {
      if (previous.target !== input.target || previous.upload_handle !== input.upload_handle || ['name', 'hostId', 'memoryMb', 'cpus', 'diskGb', 'model'].some((key) => input.options && key in input.options && input.options[key] !== previous.options[key])) throw fail('idempotency_conflict');
      if (!TERMINAL.has(previous.state) && !this.running.has(previous.id)) this.launch(previous, input.password); return this.public(previous);
    }
    this.uploads.resolve(input.upload_handle);
    const allowed = ['name', 'hostId', 'memoryMb', 'cpus', 'diskGb', 'model'];
    const options = Object.fromEntries(allowed.filter((k) => input.options && k in input.options).map((k) => [k, input.options[k]]));
    if ('name' in options && (typeof options.name !== 'string' || options.name.length > 60 || /[\x00-\x1f]/.test(options.name))) throw fail('invalid_options');
    if ('hostId' in options && (typeof options.hostId !== 'string' || !this.manager.db.hosts.some((host) => host.id === options.hostId))) throw fail('invalid_host');
    for (const [key, minimum, maximum] of [['memoryMb', 2048, 65536], ['cpus', 1, 32], ['diskGb', 0, 2048]]) if (key in options && (!Number.isInteger(options[key]) || options[key] < minimum || options[key] > maximum)) throw fail('invalid_options');
    if ('model' in options && !['rpi3', 'rpi4', 'rpi5'].includes(options.model)) throw fail('invalid_pi_model');
    const job = { id: crypto.randomUUID(), request_id: input.request_id, target: input.target, upload_handle: input.upload_handle, options, state: 'queued', phase: 'pending', created_at: new Date().toISOString() };
    this.jobs.push(job); this.update(job, {}); this.launch(job, input.password); return this.public(job);
  }
  launch(job, password) { const controller = new AbortController(); this.running.set(job.id, controller); this.execute(job, password, controller.signal).catch((e) => this.update(job, { state: controller.signal.aborted ? 'cancelled' : 'needs_attention', error_code: typeof e.code === 'string' && /^[a-z0-9_]{1,80}$/.test(e.code) ? e.code : 'hosting_failed' })).finally(() => this.running.delete(job.id)); }
  cancel(id) { const job = this.jobs.find((j) => j.id === id); if (!job) throw fail('job_not_found'); if (job.phase === 'restore_submitted' || job.phase === 'restore_accepted') throw fail('restore_cannot_cancel'); if (job.phase === 'card_write_started') throw fail('write_cannot_cancel'); this.running.get(id)?.abort(); this.update(job, { state: 'cancelled' }); return this.public(job); }
  async execute(job, password, signal) {
    const manager = this.manager;
    const item = this.uploads.handles.get(job.upload_handle);
    if (!item) throw fail('upload_unavailable');
    const adapter = manager.target(job.target);
    if (job.target === 'pi') {
      const writer = require('./pi-writer');
      if (!job.instance_id) {
        const approval = this.piApprovals.get(job.request_id);
        if (!approval) { this.update(job, { state: 'waiting_for_hardware', error_code: 'native_drive_confirmation_required' }); return; }
        this.piApprovals.delete(job.request_id);
        const kind = require('./images').KINDS[job.options.model];
        if (!kind || !/^rpi/.test(job.options.model)) throw fail('invalid_pi_model');
        if (job.phase === 'card_write_started') throw fail('card_write_reconciliation_required');
        const image = await require('./images').fetchImage(kind.re, manager.cacheDir(), () => {}, () => {});
        if (!fs.existsSync(image.file + '.verified')) throw fail('image_verification_required');
        const recordedHash = fs.readFileSync(image.file + '.verified', 'utf8').trim();
        if (!/^[a-f0-9]{64}$/.test(recordedHash) || await require('./util').sha256File(image.file) !== recordedHash) throw fail('image_verification_failed');
        if (signal.aborted) throw fail('cancelled');
        this.update(job, { phase: 'card_write_started', state: 'writing_card' });
        await writer.write({ image: image.file, drive: approval, onProgress: (p) => this.emit('progress', { id: job.id, phase: p.state }), log: () => {} });
        const id = 'backup-' + job.id;
        manager.db.instances.push({ id, slug: id, name: job.options.name || 'Restored Home Assistant', target: 'pi', hostingJobId: job.id, port: 80, backups: [], backupsOn: false, state: 'waiting_for_boot', dir: path.join(manager.dir, 'instances', id), url: '' }); manager.save();
        this.update(job, { instance_id: id, phase: 'waiting_for_boot', state: 'waiting_for_boot' });
      }
      if (job.phase === 'waiting_for_boot') {
        // A generic discovery hostname can belong to the source or another device.
        this.update(job, { state: 'waiting_for_boot', error_code: 'verified_hardware_identity_required' }); return;
      }
    }
    if (!job.instance_id) {
      const check = await manager.check(job.target, job.options.hostId);
      if (!check.ok) throw fail('target_setup_needed');
      const defaults = await manager.defaults(job.target, job.options.hostId);
      const id = 'backup-' + job.id;
      const inst = { ...defaults, ...job.options, id, slug: id, target: job.target, state: 'deploying', url: '', lanUrl: '', backups: [], backupsOn: false, created: new Date().toISOString(), hostingJobId: job.id, prefix: 'ham', backupHostingFull: ['docker', 'ssh'].includes(job.target) };
      inst.dir = path.join(manager.dir, 'instances', id);
      // Persist resource ownership before provisioning so a crash cannot create another target.
      const existing = manager.db.instances.find((i) => i.id === id);
      if (existing && existing.hostingJobId !== job.id) throw fail('resource_ownership_mismatch');
      if (!existing) { manager.db.instances.push(inst); manager.save(); }
      this.update(job, { instance_id: id, phase: 'provision_pending' });
    }
    const inst = manager.get(job.instance_id);
    if (inst.hostingJobId !== job.id) throw fail('resource_ownership_mismatch');
    if (signal.aborted) throw fail('cancelled');
    const full = manager.withSecrets(inst);
    if (job.phase === 'provision_pending' || job.phase === 'provision_started') {
      const state = await adapter.status(full);
      if (job.phase === 'provision_started' && state === 'missing') throw fail('provision_reconciliation_required');
      if (state === 'missing') {
        this.update(job, { state: 'running', phase: 'provision_started' });
        const result = await adapter.deploy(full, () => {}, (key) => this.emit('progress', { id: job.id, phase: key }), { cacheDir: manager.cacheDir() });
        Object.assign(inst, result, { state: 'running', ip: full.ip || inst.ip }); manager.save();
      } else if (state !== 'running') throw fail('target_not_running');
      Object.assign(inst, adapter.urls(full), { state: 'running' }); manager.save(); this.update(job, { phase: 'provisioned' });
    }
    const base = inst.url;
    if (signal.aborted) throw fail('cancelled');
    if (!base) throw fail('target_address_unavailable');
    const journal = { get phase() { return job.phase; }, get backup_id() { return job.backup_id; }, update: (patch) => this.update(job, patch) };
    this.update(job, { state: 'restoring', error_code: undefined });
    await this.restore({ base, file: item.file, password, journal, signal });
    this.update(job, { state: 'waiting_for_restart' });
    const end = Date.now() + 30 * 60000;
    while (Date.now() < end && !signal.aborted) {
      try {
        const info = await this.probe(base, '/api/onboarding/backup/info', { signal });
        const event = info.last_action_event;
        if (event && event.manager_state === 'restore_backup' && event.state === 'failed') throw fail('restore_failed');
        if (event && event.manager_state === 'restore_backup' && event.state === 'completed') this.update(job, { restore_completed: true });
      } catch (e) {
        if (e.code === 'authentication_needed' && (job.phase === 'restore_accepted' || job.phase === 'restore_submitted' || job.restore_completed)) {
          // Completed onboarding closes the unauthenticated restore API. Verify the actual LAN address.
          const lan = inst.lanUrl || (job.target === 'docker' || job.target === 'virtualbox' ? (lanAddress() ? 'http://' + lanAddress() + ':' + inst.port + '/' : '') : job.target === 'ssh' ? inst.url : '');
          if (!lan) throw fail('lan_address_unavailable');
          await this.probe(lan, '/manifest.json', { signal });
          if (!job.restore_completed) { this.update(job, { state: 'authentication_needed', lan_url: lan, error_code: 'restore_completion_requires_authentication' }); return; }
          this.update(job, { state: 'ready', phase: 'verified', lan_url: lan }); return;
        }
        if (e.code === 'restore_failed') throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw fail('restore_readiness_unverified');
  }
}
module.exports = { BackupJobs };
