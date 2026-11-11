'use strict';
const test = require('node:test');
const assert = require('node:assert');
const mc = require('../src/backend/minecraft');
const vd = require('../src/backend/vdisk');
const ol = require('../src/backend/ollama');

test('server.properties keeps comments, order and unknown keys when values change', () => {
  const before = '#Minecraft server properties\nmotd=Hi\nfoo-unknown=keep me\nmax-players=20\n';
  const after = mc.updateProps(before, { 'max-players': mc.validateProp('max-players', 8), pvp: mc.validateProp('pvp', false) });
  assert.equal(after, '#Minecraft server properties\nmotd=Hi\nfoo-unknown=keep me\nmax-players=8\npvp=false\n');
  assert.equal(mc.propsObject(after)['foo-unknown'], 'keep me');
});

test('typed server settings refuse values outside their bounds', () => {
  assert.throws(() => mc.validateProp('max-players', 5000), /0 to 1000/);
  assert.throws(() => mc.validateProp('difficulty', 'brutal'), /one of/);
  assert.throws(() => mc.validateProp('motd', 'two\nlines'), /one line/);
  assert.equal(mc.validateProp('online-mode', 'false'), 'false');
});

test('each Minecraft version gets the Java it needs', () => {
  assert.equal(mc.javaFor('1.12.2'), 8);
  assert.equal(mc.javaFor('1.18.2'), 17);
  assert.equal(mc.javaFor('1.20.4'), 17);
  assert.equal(mc.javaFor('1.20.5'), 21);
  assert.equal(mc.javaFor('1.21.4', { javaVersion: { majorVersion: 21 } }), 21);
  assert.equal(mc.dockerTag(8), 'java8');
});

test('virtual disk scripts respect the format limits and name their route', () => {
  const routes = { windows: true, hyperv: false, storage: true, diskpart: true };
  const p = vd.OPS.create({ path: 'C:\\Disks\\data.vhdx', size: 20, unit: 'GB', type: 'dynamic', init: true, style: 'GPT', fs: 'NTFS' }, routes);
  assert.equal(p.route, 'diskpart');
  assert.match(p.diskpart, /create vdisk file="C:\\Disks\\data.vhdx" maximum=20480 type=expandable/);
  assert.match(p.ps, /Initialize-Disk -Number \$d -PartitionStyle GPT/);
  assert.throws(() => vd.OPS.create({ path: 'C:\\d.vhd', size: 3000, unit: 'GB', type: 'dynamic' }, routes), /2,040 GB/);
  assert.throws(() => vd.OPS.create({ path: 'C:\\d.vhd', size: 1, unit: 'MB', type: 'fixed' }, routes), /3 MB/);
  assert.throws(() => vd.OPS.convert({ path: 'C:\\d.vhd', dest: 'C:\\d.vhdx' }, routes), /Hyper-V/);
  assert.throws(() => vd.OPS.resize({ path: 'C:\\d.vhd', size: 1, unit: 'GB', direction: 'shrink' }, routes), /Only a VHDX/);
  const iso = vd.OPS.attach({ path: 'C:\\x.iso' }, routes);
  assert.match(iso.ps, /-Access ReadOnly/);
  assert.throws(() => vd.checkPath('relative.vhdx', { mustExist: false }), /full path/);
});

test('model fit is careful and explains itself', () => {
  const hw = { ram: 16e9, gpus: [{ vram: 8e9 }], free: 50e9 };
  assert.equal(ol.fit(4.9e9, hw).verdict, 'Runs well');
  assert.equal(ol.fit(12e9, hw).verdict, 'Runs with limits');
  assert.equal(ol.fit(43e9, hw).verdict, 'Unlikely');
  assert.equal(ol.fit(0, hw).verdict, 'Unknown');
  assert.equal(ol.parseSize('• 4.9GB •'), 4.9e9);
  assert.equal(ol.parseSize('8b'), 0);
});
