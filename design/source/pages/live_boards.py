"""Canvas 22: Home Assistant pages drawn from a running copy, not by hand.

Each board shows one page at 1440 pixels wide and at 390 pixels on a phone, as the
frontend in this repository draws it against a running core. Run with a core at
HA_CORE (default http://127.0.0.1:8123) and `pnpm dev:serve -c $HA_CORE -p 8124` in
frontend/, signed in through a saved browser state at HA_STATE:
  python3 design/source/pages/live_boards.py
"""
import base64, io, json, os, datetime
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'canvases', '22-live-app')
FRAMES = os.path.join(ROOT, 'frames')
BASE = os.environ.get('HA_FRONTEND', 'http://127.0.0.1:8124')
STATE = os.environ.get('HA_STATE', '/tmp/hastate2.json')

BOARDS = [
    ('LiveHome', 'Overview: the home page', '/home', 'light', 'The greeting, the cards that need a decision and the summaries. The page tab strip fades where tabs are scrolled out of view.'),
    ('LiveHomeDark', 'Overview, dark', '/home', 'dark', 'The same page in the dark scheme.'),
    ('LiveSettings', 'Settings home', '/config/dashboard', 'light', 'Updates and repairs first, then every settings group with its one-line summary.'),
    ('LiveIntegrations', 'Integrations', '/config/integrations/dashboard', 'light', 'Cards per integration with their state. Brand pictures are missing only because this copy has no internet access.'),
    ('LiveDevices', 'Devices', '/config/devices/dashboard', 'light', 'The device table with its filters, grouping and sorting; on a phone, rows stack their columns.'),
    ('LiveAutomationEditor', 'A new automation', '/config/automation/edit/new', 'light', 'When, And if and Then do, with the save bar and its Ctrl S shortcut.'),
    ('LiveAutomationHistory', 'Automation history', '/config/automation_history', 'light', 'One repository per automation and the master repository, with what a commit does.'),
    ('LiveScenes', 'Scenes, empty', '/config/scene/dashboard', 'light', 'Fixed in this pass: the Learn more icon was drawn at 80 pixels; it is now the size of the text.'),
    ('LiveDashboards', 'Dashboards', '/config/lovelace/dashboards', 'light', 'Built-in and user-created dashboards, who sees each and whether it is on the rail.'),
    ('LiveUpdates', 'Updates', '/config/updates', 'light', 'Everything ready to update, with notes, then what is not installable and what is current.'),
    ('LivePersonal', 'Personal settings', '/config/personal', 'light', 'Language and playfulness with its live preview. Fixed in this pass: the info buttons no longer log a translation error.'),
    ('LiveIdentity', 'Name and logo', '/config/identity', 'light', 'The name, a short name and the logo, with a preview of the sidebar, tab title and About.'),
    ('LiveTodo', 'To-do lists', '/todo', 'light', 'Fixed in this pass: the Add item button sat behind the page footer on wide layouts.'),
    ('LiveUsers', 'Users', '/config/users', 'light', 'Fixed in this pass: on a phone the second line of a row spilled into the next row.'),
    ('LiveBlueprints', 'Blueprints', '/config/blueprint/dashboard', 'light', 'Fixed in this pass: on a phone each row now grows to hold its name, kind and description.'),
]

CSS = """*{box-sizing:border-box;margin:0}body{font-family:'Google Sans Flex',system-ui,sans-serif;background:#f4f6fb;color:#191c20}
.b{padding:40px;display:flex;flex-direction:column;gap:20px}.t{font-size:32px;font-weight:500}.n{font-size:16px;color:#43474e;max-width:1100px;line-height:1.45}
.row{display:flex;gap:32px;align-items:flex-start}.shot{border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.18),0 4px 12px rgba(0,0,0,.08);overflow:hidden;background:#fff}
.shot img{display:block}.cap{font-size:13px;color:#43474e;margin-top:8px}.dark{background:#111318;color:#e2e2e9}.dark .n,.dark .cap{color:#c3c6cf}"""


def data_url(png, width):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=82)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(), im.height


def board(title, w, h, body, dark):
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
<div class="b{' dark' if dark else ''}" style="width: 100%; min-height: {h}px">
{body}
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
    idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
           'title': 'Home Assistant, drawn from a running copy', 'launch': {'view': 'canvas', 'page': 'all'},
           'pages': [{'id': 'all', 'name': 'All boards'}], 'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'))
        x = y = rowh = 0
        for i, (name, title, path, scheme, note) in enumerate(BOARDS):
            shots = {}
            for size, vw, vh in (('wide', 1440, 900), ('phone', 390, 844)):
                ctx = br.new_context(viewport={'width': vw, 'height': vh}, color_scheme=scheme, storage_state=STATE)
                pg = ctx.new_page()
                pg.goto(BASE + path)
                pg.wait_for_timeout(3500)
                shots[size] = pg.screenshot()
                ctx.close()
            wide, wh = data_url(shots['wide'], 1000)
            phone, ph = data_url(shots['phone'], 300)
            body = (f'<div class="t">{title}</div><div class="n">{note}</div><div class="row">'
                    f'<div><div class="shot"><img src="{wide}" width="1000" height="{wh}" alt="{title}, 1440 pixels wide"></div><div class="cap">1440 pixels wide, shown at 1000</div></div>'
                    f'<div><div class="shot"><img src="{phone}" width="300" height="{ph}" alt="{title}, on a phone"></div><div class="cap">390 pixels, a phone, shown at 300</div></div></div>')
            W, H = 1440, 220 + max(wh, ph)
            open(os.path.join(OUT, name + '.dc.html'), 'w').write(board(title, W, H, body, scheme == 'dark'))
            Image.open(io.BytesIO(shots['wide'])).save(os.path.join(FRAMES, name + '.png'))
            if i and i % 3 == 0:
                x, y, rowh = 0, y + rowh + 220, 0
            idx['boards'][name + '.dc.html'] = {'x': x, 'y': y, 'w': W, 'h': H, 'title': title, 'expand': 'fill', 'page': 'all'}
            idx['order'].append(name + '.dc.html')
            x += W + 100
            rowh = max(rowh, H)
            print(name, W, H)
        br.close()
    idx['notes']['t-all'] = {'x': 0, 'y': -320, 'text': f'Home Assistant, drawn from a running copy. {len(BOARDS)} boards, wide and phone.', 'kind': 'title1', 'maxW': 3 * 1540 - 100, 'page': 'all'}
    json.dump(idx, open(os.path.join(OUT, 'canvas.json'), 'w'), indent=2)


if __name__ == '__main__':
    main()
