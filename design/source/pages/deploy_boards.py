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
CANVASES = os.path.join(ROOT, 'design', 'canvases')
# At most 15 boards on a canvas: the first 15 go on canvas 16, the rest on canvas 17.
GROUPS = [('16-deploy-assistant', 'Deploy Assistant: the deploy wizard, instances, backups, downloads and Raspberry Pi cards'), ('17-deploy-assistant-more', 'Deploy Assistant: extensions, tools, the project pages offline, the update self-test, settings and more'), ('18-deploy-assistant-care', 'Deploy Assistant: accommodations, schedules, logo, exports, history, safety and delight')]
FRAMES = os.path.join(ROOT, 'design', 'frames')
CSS = re.sub(r'@font-face\{[^}]*\}', '', open(os.path.join(APP, 'app.css')).read())
DONE = "localStorage.setItem('ham-deploy-v1', JSON.stringify({welcomed: true}))"

BOARDS = [
    ('DeployWelcome', 'Deploy Assistant, first run: what this computer can run', 1320, 880, 'light', [('eval', "localStorage.removeItem('ham-deploy-v1')"), ('reload',), ('wait', 600), ('click', '#wnext'), ('wait', 700)]),
    ('DeployHome', 'Deploy Assistant, the deploy wizard: where on the left, the plan on the right', 1320, None, 'light', [('wait', 900)]),
    ('DeployHomeDark', 'Deploy Assistant, the deploy wizard, dark', 1320, None, 'dark', [('wait', 900)]),
    ('DeployVirtualBox', 'Deploy Assistant, VirtualBox chosen: processors and memory in the plan', 1320, 880, 'light', [('wait', 600), ('click', '[data-pick="virtualbox"]'), ('wait', 500)]),
    ('DeployNeedsSetup', 'Deploy Assistant, VMware needs setup: how to fix it', 1320, 880, 'light', [('wait', 600), ('click', '[data-pick="vmware"]'), ('wait', 500)]),
    ('DeployOptions', 'Deploy Assistant, more options before deploying', 1320, 880, 'light', [('wait', 600), ('click', '[data-k="more-docker"] summary'), ('wait', 200)]),
    ('DeployProgress', 'Deploy Assistant, deploying with live steps', 1320, None, 'light', [('wait', 700), ('click', '#wizgo'), ('wait', 4300), ('eval', "document.querySelectorAll('.pcard details').forEach(d => d.open = true)")]),
    ('DeployReady', 'Deploy Assistant, ready with its link', 1320, None, 'light', [('wait', 700), ('click', '#wizgo'), ('wait', 11500)]),
    ('DeployInstances', 'Deploy Assistant, instance manager', 1320, None, 'light', [('tab', 'instances'), ('wait', 300), ('eval', "document.querySelectorAll('.icard details').forEach(d => d.open = true)")]),
    ('DeployInstancesDark', 'Deploy Assistant, instance manager, dark', 1320, None, 'dark', [('tab', 'instances'), ('click', '[data-isel="i1"]'), ('click', '[data-isel="i2"]')]),
    ('DeployInstanceMenu', 'Deploy Assistant, the tools of one instance', 1320, 880, 'light', [('tab', 'instances'), ('click', '[data-imenu="i1"]')]),
    ('DeployBackups', 'Deploy Assistant, backups and their schedule', 1320, None, 'light', [('tab', 'backups')]),
    ('DeployDownloads', 'Deploy Assistant, automatic downloads', 1320, None, 'dark', [('tab', 'downloads')]),
    ('DeployPiChosen', 'Deploy Assistant, Raspberry Pi chosen in the wizard', 1320, 880, 'light', [('wait', 500), ('click', '[data-pick="pi"]'), ('wait', 300)]),
    ('DeployPiWrite', 'Deploy Assistant, writing a Raspberry Pi card', 1320, 880, 'light', [('wait', 500), ('click', '[data-pick="pi"]'), ('click', '#wizgo'), ('wait', 900)]),
    ('DeployPiProgress', 'Deploy Assistant, writing and checking the card', 1320, None, 'light', [('wait', 500), ('click', '[data-pick="pi"]'), ('click', '#wizgo'), ('wait', 900), ('click', '#pigo'), ('click', '#sc1'), ('fill', '#sc2in', 'ERASE'), ('eval', "const r = document.getElementById('scslide'); r.value = 100; r.dispatchEvent(new Event('input', {bubbles: true}))"), ('click', '#sc2'), ('wait', 5200)]),
    ('DeployExtensions', 'Deploy Assistant, extensions with their permissions', 1320, None, 'light', [('tab', 'extensions'), ('wait', 300)]),
    ('DeployExtConsent', 'Deploy Assistant, asking before an extension runs', 1320, 880, 'light', [('tab', 'extensions'), ('wait', 300), ('click', '[data-sw2="ext:link-sheet"]')]),
    ('DeployExtResult', 'Deploy Assistant, an extension\'s answer', 1320, 880, 'dark', [('tab', 'extensions'), ('wait', 300), ('click', '[data-extrun="health-report:report"]'), ('wait', 500)]),
    ('DeployTools', 'Deploy Assistant, tools', 1320, None, 'light', [('tab', 'tools'), ('wait', 400)]),
    ('DeploySupport', 'Deploy Assistant, support and tickets', 1320, None, 'light', [('tab', 'support'), ('click', '[data-preset="0"]')]),
    ('DeployChanges', 'Deploy Assistant, changes with the build it is', 1320, None, 'light', [('tab', 'changes')]),
    ('DeploySettings', 'Deploy Assistant, settings: modes, voice, schedule, name, updates', 1320, None, 'light', [('tab', 'settings')]),
    ('DeployDesign', 'Deploy Assistant, its own design boards, offline', 1320, 880, 'light', [('tab', 'design'), ('wait', 600)]),
    ('DeployFeatures', 'Deploy Assistant, the project\'s features and their state', 1320, 880, 'light', [('tab', 'features'), ('wait', 300)]),
    ('DeployStatus', 'Deploy Assistant, the status page, offline', 1320, 880, 'dark', [('tab', 'status'), ('wait', 300)]),
    ('DeployQr', 'Deploy Assistant, a one-time code added from its QR code', 1320, 880, 'light', [('tab', 'tools'), ('files', '#qrfile', os.path.join(os.path.dirname(__file__), 'sample-otp-qr.png')), ('wait', 800), ('eval', "document.getElementById('otp').scrollIntoView()")]),
    ('DeploySelfTest', 'Deploy Assistant, the update self-test', 1320, 880, 'light', [('tab', 'settings'), ('click', '[data-act="selftest"]'), ('wait', 600)]),
    ('DeployAdhd', 'Deploy Assistant, ADHD modes on: clock, next step, focus', 1320, 880, 'light', [('eval', "localStorage.setItem('ham-deploy-v1', JSON.stringify({welcomed: true, adhd: {focus: true, time: true, one: true, momentum: true}, nextStep: 'Back up the cottage instance', doneToday: {day: new Date().toDateString(), n: 3}}))"), ('reload',), ('wait', 900)]),
    ('DeployAdhdSettings', 'Deploy Assistant, ADHD modes and the narrator in Settings', 1320, 880, 'light', [('tab', 'settings'), ('wait', 300), ('eval', "document.getElementById('adhd').scrollIntoView()")]),
    ('DeployRule', 'Deploy Assistant, a schedule rule by day and time', 1320, 880, 'light', [('tab', 'settings'), ('click', '[data-act="ruleadd"]'), ('fill', '#rl-label', 'Evenings')]),
    ('DeployRuleHa', 'Deploy Assistant, a schedule rule following a Home Assistant switch', 1320, 880, 'dark', [('tab', 'settings'), ('click', '[data-act="ruleadd"]'), ('click', '[data-rsrc="ha"]'), ('fill', '#rl-label', 'Movie night'), ('fill', '#rl-entity', 'input_boolean.movie_night')]),
    ('DeployLogo', 'Deploy Assistant, the logo: presets or your own picture', 1320, 880, 'light', [('tab', 'settings'), ('click', '[data-act="logo"]')]),
    ('DeployExport', 'Deploy Assistant, export in every text format', 1320, 880, 'light', [('tab', 'instances'), ('click', '[data-act="export-instances"]'), ('click', '[data-xf="yaml"]')]),
    ('DeployRecords', 'Deploy Assistant, the history of your records', 1320, None, 'light', [('tab', 'activity'), ('wait', 500)]),
    ('DeploySuper', 'Deploy Assistant, two keys and a slider before anything is deleted', 1320, 880, 'light', [('tab', 'backups'), ('click', '[data-bkall]'), ('click', '[data-act="bkdel"]'), ('click', '#sc1'), ('fill', '#sc2in', 'DELETE'), ('eval', "const r = document.getElementById('scslide'); r.value = 100; r.dispatchEvent(new Event('input', {bubbles: true}))")]),
    ('DeployLive', 'Deploy Assistant, the live processor chart', 1320, 880, 'dark', [('tab', 'instances'), ('wait', 9000)]),
    ('DeployDimSum', 'Deploy Assistant, a dim sum surprise', 1320, 880, 'light', [('click', '[data-tab="settings"]'), ('click', '[data-act="dimsum"]'), ('wait', 600)]),
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
    for g in GROUPS:
        os.makedirs(os.path.join(CANVASES, g[0]), exist_ok=True)
    where = {b[0]: GROUPS[i // 15][0] for i, b in enumerate(BOARDS)}
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
                elif k == 'files':
                    pg.set_input_files(s[1], s[2])
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
            open(os.path.join(CANVASES, where[name], name + '.dc.html'), 'w').write(board(title, w, hh, html))
            sizes[name] = (w, hh)
            ctx.close()
        br.close()
    for gi, (folder, gtitle) in enumerate(GROUPS):
        group = BOARDS[gi * 15:(gi + 1) * 15]
        idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
               'title': gtitle, 'launch': {'view': 'canvas', 'page': 'all'},
               'pages': [{'id': 'all', 'name': 'All boards'}], 'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
        x = y = rowh = maxw = 0
        for i, (name, title, w, h, scheme, steps) in enumerate(group):
            if i and i % 4 == 0:
                x, y, rowh = 0, y + rowh + 220, 0
            bw, bh = sizes[name]
            idx['boards'][name + '.dc.html'] = {'x': x, 'y': y, 'w': bw, 'h': bh, 'title': title, 'expand': 'fill', 'page': 'all'}
            idx['order'].append(name + '.dc.html')
            x += bw + 100
            maxw = max(maxw, x - 100)
            rowh = max(rowh, bh)
        idx['notes']['t-all'] = {'x': 0, 'y': -320, 'text': f'{gtitle}. {len(group)} boards drawn from the app.', 'kind': 'title1', 'maxW': maxw, 'page': 'all'}
        json.dump(idx, open(os.path.join(CANVASES, folder, 'canvas.json'), 'w'), indent=2)
    print(json.dumps(sizes))


if __name__ == '__main__':
    main()
