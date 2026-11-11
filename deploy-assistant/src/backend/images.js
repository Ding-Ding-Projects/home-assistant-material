'use strict';
// Finds and downloads operating system images from the project's releases, and checks each
// against SHA256SUMS from the same release before use.
const fs = require('node:fs');
const path = require('node:path');
const { getJson, download, sha256File } = require('./util');

const RELEASES = 'https://api.github.com/repos/Ding-Ding-Projects/home-assistant-material/releases?per_page=50';
const KINDS = {
  virtualbox: { label: 'VirtualBox disk', re: /^haos_ova-.*\.vdi\.zip$/ },
  vmware: { label: 'VMware appliance', re: /^haos_ova-.*\.ova$/ },
  rpi5: { label: 'Raspberry Pi 5', re: /^haos_rpi5-64-.*\.img\.xz$/ },
  rpi4: { label: 'Raspberry Pi 4 and 400', re: /^haos_rpi4-64-.*\.img\.xz$/ },
  rpi3: { label: 'Raspberry Pi 3', re: /^haos_rpi3-64-.*\.img\.xz$/ }
};

let cache = { at: 0, list: null };
async function releases() {
  if (cache.list && Date.now() - cache.at < 10 * 60000) return cache.list;
  cache = { at: Date.now(), list: await getJson(RELEASES) };
  return cache.list;
}

async function latestImage(pattern) {
  for (const r of await releases()) {
    if (r.draft) continue;
    const a = (r.assets || []).find((x) => pattern.test(x.name));
    if (a) {
      const sums = (r.assets || []).find((x) => x.name === 'SHA256SUMS');
      return { release: r.tag_name, name: a.name, url: a.browser_download_url, size: a.size, sumsUrl: sums ? sums.browser_download_url : null };
    }
  }
  throw new Error('No release has this image yet. Releases that rebuilt the operating system attach it; the app checks again later.');
}

async function fetchImage(pattern, cacheDir, log, progress) {
  const img = await latestImage(pattern);
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, img.name);
  const okMark = file + '.verified';
  if (fs.existsSync(file) && fs.existsSync(okMark)) { log('Using the downloaded and checked ' + img.name); return { file, release: img.release, name: img.name }; }
  if (!fs.existsSync(file)) {
    log('Downloading ' + img.name + ' from release ' + img.release);
    await download(img.url, file, (got, total) => progress(total ? got / total : 0, got, total));
  }
  if (img.sumsUrl) {
    const sumsFile = file + '.SHA256SUMS';
    await download(img.sumsUrl, sumsFile);
    const line = fs.readFileSync(sumsFile, 'utf8').split('\n').find((l) => l.trim().endsWith(img.name));
    const want = line ? line.trim().split(/\s+/)[0].toLowerCase() : null;
    if (!want) throw new Error('SHA256SUMS in the release does not list ' + img.name + '.');
    const have = await sha256File(file);
    if (want !== have) { fs.rmSync(file, { force: true }); throw new Error('The downloaded image does not match its SHA-256 sum, so it was deleted. It will be downloaded again.'); }
    log('SHA-256 matches SHA256SUMS of ' + img.release);
    fs.writeFileSync(okMark, have + '\n');
  } else log('This release has no SHA256SUMS; the image was not checked.');
  // Older releases of the same image are no longer needed.
  for (const f of fs.readdirSync(cacheDir)) {
    if (f !== img.name && pattern.test(f)) for (const extra of ['', '.verified', '.SHA256SUMS']) fs.rmSync(path.join(cacheDir, f + extra), { force: true });
  }
  return { file, release: img.release, name: img.name };
}

module.exports = { latestImage, fetchImage, KINDS };
