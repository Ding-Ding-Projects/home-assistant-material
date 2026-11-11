"""Draws the Deploy Assistant's boards (canvas 16) from the app's own page in demo mode.

The app's page runs in Chrome with mock.js standing in for the computer, so every board is the
real interface in one state, saved as a static board. Run from the repository root after
`node deploy-assistant/build-renderer.js`:
  python3 design/source/pages/deploy_boards.py
"""
import datetime
import json
import os
import re

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
APP = os.path.join(ROOT, 'deploy-assistant', 'src', 'renderer')
OUT = os.path.join(ROOT, 'design', 'canvases', '16-deploy-assistant')
FRAMES = os.path.join(ROOT, 'design', 'frames')
CSS = re.sub(r'@font-face\{[^}]*\}', '', open(os.path.join(APP, 'app.css')).read())
DONE = "localStorage.setItem('ham-deploy-v1', JSON.stringify({welcomed: true}))"

BOARDS = [
    ('DeployWelcome', 'Deploy Assistant, first run: what this computer can run', 1320, 880, 'light', [('eval', "localStorage.removeItem('ham-deploy-v1')"), ('reload',), ('wait', 600), ('click', '#wnext'), ('wait', 700)]),
    ('DeployHome', 'Deploy Assistant, one click per target', 1320, None, 'light', [('wait', 700)]),
    ('DeployHomeDark', 'Deploy Assistant, one click per target, dark', 1320, None, 'dark', [('wait', 700)]),
    ('DeployOptions', 'Deploy Assistant, options before deploying', 1320, 880, 'light', [('wait', 500), ('click', '[data-options="docker"]'), ('wait', 400)]),
    ('DeployProgress', 'Deploy Assistant, deploying with live steps', 1320, None, 'light', [('wait', 500), ('click', '[data-oneclick="docker"]'), ('wait', 4300), ('eval', "document.querySelectorAll('.pcard details').forEach(d => d.open = true)")]),
    ('DeployReady', 'Deploy Assistant, ready with its link', 1320, None, 'light', [('wait', 500), ('click', '[data-oneclick="docker"]'), ('wait', 11500)]),
    ('DeployInstances', 'Deploy Assistant, instance manager', 1320, None, 'light', [('tab', 'instances'), ('wait', 300), ('eval', "document.querySelectorAll('.icard details').forEach(d => d.open = true)")]),
    ('DeployInstancesDark', 'Deploy Assistant, instance manager, dark', 1320, None, 'dark', [('tab', 'instances'), ('click', '[data-isel="i1"]'), ('click', '[data-isel="i2"]')]),
    ('DeployInstanceMenu', 'Deploy Assistant, the tools of one instance', 1320, 880, 'light', [('tab', 'instances'), ('click', '[data-imenu="i1"]')]),
    ('DeployBackups', 'Deploy Assistant, backups and their schedule', 1320, None, 'light', [('tab', 'backups')]),
    ('DeployDownloads', 'Deploy Assistant, automatic downloads', 1320, None, 'dark', [('tab', 'downloads')]),
    ('DeployPiWrite', 'Deploy Assistant, writing a Raspberry Pi card', 1320, 880, 'light', [('wait', 500), ('click', '[data-act="pi"]'), ('wait', 900)]),
    ('DeployPiProgress', 'Deploy Assistant, writing and checking the card', 1320, None, 'light', [('wait', 500), ('click', '[data-act="pi"]'), ('wait', 900), ('click', '#pigo'), ('click', '#sc1'), ('fill', '#sc2in', 'ERASE'), ('click', '#sc2'), ('wait', 5200)]),
    ('DeployPalette', 'Deploy Assistant, Ctrl Shift F with live controls', 1320, 880, 'light', [('wait', 400), ('key', 'Control+Shift+F'), ('fill', '#palq', 'deploy')]),
    ('DeployNarrow', 'Deploy Assistant, a narrow window', 400, None, 'light', [('tab', 'instances')]),
]


def board(title, w, h, html):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600;700&amp;display=swap">
<style>
{CSS}
</style>
</helmet>
<div style="width: 100%; min-height: {h}px; position: relative; overflow: hidden">
{html}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'))
        for name, title, w, h, scheme, steps in BOARDS:
            ctx = br.new_context(viewport={'width': w, 'height': h or 880}, color_scheme=scheme)
            pg = ctx.new_page()
            pg.goto('file://' + os.path.join(APP, 'index.html'))
            pg.evaluate(DONE)
            pg.reload()
            pg.wait_for_timeout(300)
            for s in steps:
                k = s[0]
                if k == 'tab':
                    pg.click('#t-' + s[1])
                elif k == 'click':
                    pg.click(s[1])
                elif k == 'fill':
                    pg.fill(s[1], s[2])
                elif k == 'key':
                    pg.keyboard.press(s[1])
                elif k == 'eval':
                    pg.evaluate(s[1])
                elif k == 'reload':
                    pg.reload()
                elif k == 'wait':
                    pg.wait_for_timeout(s[1])
                pg.wait_for_timeout(120)
            hh = h or pg.evaluate('Math.ceil(document.documentElement.scrollHeight)')
            pg.set_viewport_size({'width': w, 'height': hh})
            pg.wait_for_timeout(150)
            pg.screenshot(path=os.path.join(FRAMES, name + '.png'))
            html = pg.evaluate('''() => { const a = document.getElementById('app').cloneNode(true);
              a.querySelectorAll('script,canvas').forEach(e => e.remove());
              a.querySelectorAll('[draggable]').forEach(e => e.removeAttribute('draggable'));
              a.querySelectorAll('input').forEach(i => { if (i.type !== 'file') i.setAttribute('value', i.value); if (i.checked) i.setAttribute('checked', ''); });
              a.querySelectorAll('select').forEach(s => { [...s.options].forEach(o => { if (o.selected) o.setAttribute('selected', ''); }); });
              a.removeAttribute('id'); return a.outerHTML; }''')
            html = html.replace('{{', '{ {').replace('}}', '} }')
            open(os.path.join(OUT, name + '.dc.html'), 'w').write(board(title, w, hh, html))
            sizes[name] = (w, hh)
            ctx.close()
        br.close()
    idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
           'title': 'Deploy Assistant: one-click deploys, instances, backups, downloads and Raspberry Pi cards', 'launch': {'view': 'canvas', 'page': 'all'},
           'pages': [{'id': 'all', 'name': 'All boards'}], 'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
    x = y = rowh = maxw = 0
    for i, (name, title, w, h, scheme, steps) in enumerate(BOARDS):
        if i and i % 4 == 0:
            x, y, rowh = 0, y + rowh + 220, 0
        bw, bh = sizes[name]
        idx['boards'][name + '.dc.html'] = {'x': x, 'y': y, 'w': bw, 'h': bh, 'title': title, 'expand': 'fill', 'page': 'all'}
        idx['order'].append(name + '.dc.html')
        x += bw + 100
        maxw = max(maxw, x - 100)
        rowh = max(rowh, bh)
    idx['notes']['t-all'] = {'x': 0, 'y': -320, 'text': f'Deploy Assistant. {len(BOARDS)} boards drawn from the app.', 'kind': 'title1', 'maxW': maxw, 'page': 'all'}
    json.dump(idx, open(os.path.join(OUT, 'canvas.json'), 'w'), indent=2)
    print(json.dumps(sizes))


if __name__ == '__main__':
    main()
