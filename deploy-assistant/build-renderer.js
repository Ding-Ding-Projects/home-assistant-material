'use strict';
// Builds src/renderer/app.js and app.css from the shared parts of the project page
// (docs/site/app.js and its styles) plus this app's own parts, so both stay one design.
// Run: node build-renderer.js   (npm run build does it too)
const fs = require('node:fs');
const path = require('node:path');

const site = path.join(__dirname, '..', 'docs', 'site');
const src = fs.readFileSync(path.join(site, 'app.js'), 'utf8');
function section(title) {
  const start = src.indexOf('  // ---------- ' + title);
  if (start < 0) throw new Error('The project page has no section "' + title + '".');
  const next = src.indexOf('  // ---------- ', start + 10);
  return src.slice(start, next);
}
const shared = [
  'Personal wording', 'Sound, voice, notifications', 'History of changes', 'Applying settings to the page', 'Search with patterns',
  'Dialogs', 'Pattern workbench', 'Element menu, appearance and locks', 'Panels', 'Tools'
].map(section).join('\n')
  .replace(/  function findField\([\s\S]*?\n  \}\n/, '');
// The changelog is shown in the Changes tab: sections of '## version' with '- ' items.
const changes = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8').split(/^## /m).slice(1).map((b) => { const lines = b.split('\n'); return { version: lines[0].trim(), items: lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) }; });
const out = '// Written by build-renderer.js. Edit parts/head.js, parts/tail.js or docs/site/app.js instead.\n' +
  fs.readFileSync(path.join(__dirname, 'src', 'renderer', 'parts', 'head.js'), 'utf8') + '\n  var CHANGES = ' + JSON.stringify(changes) + ';\n' + shared + '\n' +
  fs.readFileSync(path.join(__dirname, 'src', 'renderer', 'parts', 'tail.js'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'src', 'renderer', 'app.js'), out);
const css = '/* Written by build-renderer.js from the project page styles and parts/app-extra.css. */\n' +
  fs.readFileSync(path.join(site, 'm3.css'), 'utf8') + '\n' +
  fs.readFileSync(path.join(site, 'app.css'), 'utf8').replace(/url\(fonts\//g, 'url(fonts/') + '\n' +
  fs.readFileSync(path.join(__dirname, 'src', 'renderer', 'parts', 'app-extra.css'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'src', 'renderer', 'app.css'), css);
fs.mkdirSync(path.join(__dirname, 'src', 'renderer', 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(site, 'fonts'))) fs.copyFileSync(path.join(site, 'fonts', f), path.join(__dirname, 'src', 'renderer', 'fonts', f));
const build = { version: require('./package.json').version, builtAt: new Date().toISOString() };
fs.writeFileSync(path.join(__dirname, 'src', 'build-info.json'), JSON.stringify(build) + '\n');
fs.writeFileSync(path.join(__dirname, 'src', 'renderer', 'build-info.js'), '// Written by build-renderer.js: the version and build time shown on the first screen.\nwindow.HAM_BUILD = ' + JSON.stringify(build) + ';\n');
console.log('renderer built:', out.length, 'bytes of script');
