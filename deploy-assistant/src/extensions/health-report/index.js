'use strict';
// Built-in extension: reads one JSON line, answers one JSON line.
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const req = JSON.parse(input);
  const backups = Object.fromEntries((req.backups || []).map((b) => [b.name, b.backups]));
  const now = Date.now();
  const lines = (req.instances || []).map((i) => {
    const b = (backups[i.name] || [])[0];
    const age = b ? Math.round((now - Date.parse(b.at)) / 36e5) : null;
    const warn = i.state !== 'running' || age === null || age > 48;
    return (warn ? '! ' : '  ') + i.name + ': ' + i.state + (i.url ? ' at ' + i.url : '') + '; newest backup ' + (age === null ? 'none' : age + ' hours ago');
  });
  const bad = lines.filter((l) => l.startsWith('!')).length;
  process.stdout.write(JSON.stringify({ title: 'Health report', text: (lines.join('\n') || 'No instances yet.') + '\n\n' + (bad ? bad + ' need a look (marked !).' : 'Everything is running and backed up in the last two days.'), notify: bad ? bad + ' instances need a look' : '' }) + '\n');
});
