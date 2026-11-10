"""Builds the boards of one polish-pass canvas: writes the sources, inlines the shared parts,
measures each board's height in Chrome, writes canvas.json and renders the review frames.

Usage: python3 build_polish.py <module> <canvas folder> "<canvas title>"
  e.g. python3 build_polish.py p_polish_a 12-polish "Polish pass: workbench, element tools, locks"
Needs: node, the @mdi/js package (set MDI_MODULE to its mdi.js), Python Playwright and Chrome
(set CHROME to its path if it is not /usr/bin/google-chrome).
"""
import datetime
import importlib
import json
import os
import re
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
design = os.path.abspath(os.path.join(here, '..', '..'))

mod, folder, title = sys.argv[1], sys.argv[2], sys.argv[3]
per_row = int(os.environ.get('PER_ROW', '4'))
import lib  # noqa: E402
importlib.import_module(mod)
boards = list(lib.BOARDS)

out = os.path.join(design, 'canvases', folder)
os.makedirs(out, exist_ok=True)
env = dict(os.environ, ARTBOARD_OUT=out)
subprocess.run(['node', os.path.join(design, 'source', 'inline-assets.mjs')] + [b[1] for b in boards], check=True, env=env)

from playwright.sync_api import sync_playwright  # noqa: E402

frames = os.path.join(design, 'frames')
sizes = {}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'))
    for page_id, name, btitle, w, h in boards:
        path = os.path.join(out, name + '.dc.html')
        pg = br.new_page(viewport={'width': w, 'height': 400})
        pg.goto('file://' + path)
        pg.wait_for_timeout(150)
        mh = h or pg.evaluate('Math.ceil(document.documentElement.scrollHeight)')
        sw = pg.evaluate('document.documentElement.scrollWidth')
        if sw > w:
            print(f'WARNING {name}: content is {sw}px wide in a {w}px board')
        src = open(path).read()
        src = re.sub(r'"\$preview":\{"width":(\d+),"height":\d+\}', f'"$preview":{{"width":{w},"height":{mh}}}', src)
        open(path, 'w').write(src)
        pg.set_viewport_size({'width': w, 'height': mh})
        pg.screenshot(path=os.path.join(frames, name + '.png'), full_page=True)
        sizes[name] = (w, mh)
        pg.close()
    br.close()

idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
       'title': title, 'launch': {'view': 'canvas', 'page': 'all'}, 'pages': [{'id': 'all', 'name': 'All boards'}], 'boards': {}, 'order': [],
       'notes': {}, 'designSystems': []}
x = y = 0
rowh = 0
maxw = 0
for i, (page_id, name, btitle, w, h) in enumerate(boards):
    if i and i % per_row == 0:
        x, y = 0, y + rowh + 220
        rowh = 0
    bw, bh = sizes[name]
    idx['boards'][name + '.dc.html'] = {'x': x, 'y': y, 'w': bw, 'h': bh, 'title': btitle, 'expand': 'fill', 'page': 'all'}
    idx['order'].append(name + '.dc.html')
    x += bw + 100
    maxw = max(maxw, x - 100)
    rowh = max(rowh, bh)
idx['notes']['t-all'] = {'x': 0, 'y': -320, 'text': f'{title}. {len(boards)} boards.', 'kind': 'title1', 'maxW': maxw, 'page': 'all'}
json.dump(idx, open(os.path.join(out, 'canvas.json'), 'w'), indent=2)
open(os.path.join(out, 'canvas.json'), 'a').write('\n')
print(json.dumps({n: s for n, s in sizes.items()}))
