"""Draws the project page's boards (canvas 15) from the live page in docs/site/.

Each board is the page as Chrome renders it in one state, saved as a static board: the markup is
the page's own, without its script. Run from the repository root:
  python3 design/source/pages/site_boards.py
Needs Python Playwright and Chrome (set CHROME if it is not /usr/bin/google-chrome).
"""
import datetime
import json
import os
import re

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SITE = os.path.join(ROOT, 'docs', 'site')
OUT = os.path.join(ROOT, 'design', 'canvases', '15-site')
FRAMES = os.path.join(ROOT, 'design', 'frames')
IMG = '../../../docs/site/img/'

CSS = open(os.path.join(SITE, 'm3.css')).read() + '\n' + open(os.path.join(SITE, 'app.css')).read()
CSS = re.sub(r'@font-face\{[^}]*\}', '', CSS)


def setup(pg, steps):
    for s in steps:
        kind, arg = s[0], s[1:]
        if kind == 'tab':
            pg.click('#t-' + arg[0])
        elif kind == 'click':
            pg.click(arg[0])
        elif kind == 'right':
            pg.click(arg[0], button='right')
        elif kind == 'fill':
            pg.fill(arg[0], arg[1])
        elif kind == 'key':
            pg.keyboard.press(arg[0])
        elif kind == 'eval':
            pg.evaluate(arg[0])
        pg.wait_for_timeout(150)


BOARDS = [
    ('SiteHome', 'Project page, Home, wide, light', 1440, None, 'light', [('tab', 'home')]),
    ('SiteHomeDark', 'Project page, Home, wide, dark', 1440, None, 'dark', [('tab', 'home')]),
    ('SiteFeatures', 'Project page, Features filtered to built, wide', 1440, None, 'light', [('tab', 'features'), ('click', '[data-fstate="built"]')]),
    ('SiteArticle', 'Project page, one article per feature, wide', 1440, None, 'light', [('tab', 'articles'), ('click', '[data-article="regex-search"]')]),
    ('SiteSettings', 'Project page, Settings, wide', 1440, None, 'light', [('tab', 'settings'), ('click', '[data-info="lang"]')]),
    ('SiteTools', 'Project page, Tools, wide, dark', 1440, None, 'dark', [('tab', 'tools'), ('click', '[data-act="b64enc"]'), ('click', '[data-conv="csv"]')]),
    ('SitePalette', 'Project page, Ctrl Shift F search with live controls', 1440, 900, 'light', [('tab', 'home'), ('key', 'Control+Shift+F'), ('fill', '#palq', 'mode')]),
    ('SiteMenu', 'Project page, the menu on any element', 1440, 900, 'light', [('tab', 'home'), ('right', '[data-k="hero-title"]')]),
    ('SiteAppearance', 'Project page, editing the appearance of an element', 1440, 900, 'dark', [('tab', 'home'), ('right', '[data-k="hero-title"]'), ('click', '[data-mi="look"]')]),
    ('SiteWorkbench', 'Project page, the pattern workbench from a search', 1440, 1100, 'light', [('tab', 'features'), ('fill', '#fsearch', 'lock'), ('click', '[data-regex="fsearch"]')]),
    ('SiteUnlock', 'Project page, a lock and its keypad', 1440, 900, 'light', [('tab', 'home'), ('eval', "(()=>{const s=JSON.parse(localStorage.getItem('ham-site-v1')||'{}');s.locks={status:{label:'Early status',salt:'x',hash:'0',tries:3,until:0}};s.welcomed=true;localStorage.setItem('ham-site-v1',JSON.stringify(s));location.reload()})()"), ('right', '[data-k="status"]'), ('click', '[data-mi="lock"]'), ('click', '#kp [data-d="4"]'), ('click', '#kp [data-d="2"]')]),
    ('SitePhone', 'Project page, phone, light', 360, None, 'light', [('tab', 'home')]),
    ('SitePhoneSettings', 'Project page, phone, Settings, dark', 360, None, 'dark', [('tab', 'settings')]),
    ('SitePhoneBoth', 'Project page, phone, English and Cantonese together', 360, None, 'light', [('tab', 'settings'), ('click', '[data-set="lang"][data-val="both"]'), ('tab', 'support')]),
]


def board(name, title, w, h, html):
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
    for f in os.listdir(OUT):
        if f.startswith('Site') and f.endswith('.dc.html'):
            os.remove(os.path.join(OUT, f))
    sizes = {}
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'))
        for name, title, w, h, scheme, steps in BOARDS:
            ctx = br.new_context(viewport={'width': w, 'height': h or 900}, color_scheme=scheme, has_touch=w < 500)
            pg = ctx.new_page()
            pg.goto('file://' + os.path.join(SITE, 'index.html'))
            pg.wait_for_timeout(400)
            pg.keyboard.press('Escape')
            setup(pg, steps)
            pg.wait_for_timeout(300)
            hh = h or pg.evaluate('Math.ceil(document.documentElement.scrollHeight)')
            pg.set_viewport_size({'width': w, 'height': hh})
            pg.wait_for_timeout(150)
            pg.screenshot(path=os.path.join(FRAMES, name + '.png'))
            html = pg.evaluate('''() => { const a = document.getElementById('app').cloneNode(true);
              a.querySelectorAll('script,noscript,canvas').forEach(e => { if (e.tagName === 'CANVAS') { const d = document.createElement('div'); d.className = 'live'; d.style.height = '160px'; d.style.borderRadius = '20px'; d.style.background = 'var(--sl1)'; e.replaceWith(d); } else e.remove(); });
              a.querySelectorAll('[draggable]').forEach(e => e.removeAttribute('draggable'));
              a.querySelectorAll('input').forEach(i => { if (i.type !== 'file') i.setAttribute('value', i.value); if (i.checked) i.setAttribute('checked', ''); });
              a.querySelectorAll('textarea').forEach(t => { t.textContent = t.value; });
              a.removeAttribute('id'); return a.outerHTML; }''')
            html = html.replace('src="img/', 'src="' + IMG).replace('href="img/', 'href="' + IMG)
            html = html.replace('{{', '{ {').replace('}}', '} }')
            open(os.path.join(OUT, name + '.dc.html'), 'w').write(board(name, title, w, hh, html))
            sizes[name] = (w, hh)
            ctx.close()
        br.close()
    idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
           'title': 'Project page: every tab, wide and phone, light and dark', 'launch': {'view': 'canvas', 'page': 'all'}, 'pages': [{'id': 'all', 'name': 'All boards'}],
           'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
    x = y = rowh = maxw = 0
    per_row = 4
    for i, (name, title, w, h, scheme, steps) in enumerate(BOARDS):
        if i and i % per_row == 0:
            x, y, rowh = 0, y + rowh + 220, 0
        bw, bh = sizes[name]
        idx['boards'][name + '.dc.html'] = {'x': x, 'y': y, 'w': bw, 'h': bh, 'title': title, 'expand': 'fill', 'page': 'all'}
        idx['order'].append(name + '.dc.html')
        x += bw + 100
        maxw = max(maxw, x - 100)
        rowh = max(rowh, bh)
    idx['notes']['t-all'] = {'x': 0, 'y': -320, 'text': f'Project page: every tab, wide and phone, light and dark. {len(BOARDS)} boards.', 'kind': 'title1', 'maxW': maxw, 'page': 'all'}
    json.dump(idx, open(os.path.join(OUT, 'canvas.json'), 'w'), indent=2)
    print(json.dumps(sizes))


if __name__ == '__main__':
    main()
