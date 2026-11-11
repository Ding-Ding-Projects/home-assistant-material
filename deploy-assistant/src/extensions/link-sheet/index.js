'use strict';
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const req = JSON.parse(input);
  const rows = (req.instances || []).filter((i) => i.url).map((i) => i.name + '\n  ' + i.url);
  process.stdout.write(JSON.stringify({ title: 'Link sheet', text: rows.join('\n\n') || 'No instance has a link yet.' }) + '\n');
});
