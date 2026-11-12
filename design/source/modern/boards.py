"""Canvas 23: a modern remake of the navigation (dock, collapse, float) and the
pages from the polish pass. Run from this folder: python3 boards.py; the
boards are written to project/ next to it, then copied to
design/canvases/23-modern-remake/ with ModernShell renamed to Main.
"""
from gen import *

W, H = 1440, 900


def settings_home():
    groups = [('Devices', 'Devices & services', '62 devices · 8 integrations', '#dce4ff', '#0b2a78'),
              ('Robot', 'Automations & scenes', '0 automations · 0 scenes', '#efe3ff', '#3a1a73'),
              ('Sofa', 'Areas, labels & zones', '3 areas', '#d4f4df', '#0f3d22'),
              ('Puzzle', 'Apps', 'Extra programs next to Home Assistant', '#ffe9c7', '#4d2c00'),
              ('Store', 'Marketplace', 'Community integrations and themes', '#dce4ff', '#0b2a78'),
              ('ViewDashboard', 'Dashboards', '2 dashboards', '#efe3ff', '#3a1a73'),
              ('AccessPoint', 'Connectivity', 'Radios and protocols', '#d4f4df', '#0f3d22'),
              ('AccountCog', 'Personal settings', 'Language, playfulness, sound', '#ffe9c7', '#4d2c00'),
              ('AccountMultiple', 'People', '1 person', '#dce4ff', '#0b2a78'),
              ('Lifebuoy', 'Support', 'Locks and a summary to share', '#efe3ff', '#3a1a73'),
              ('NewBox', 'Release notes', 'What changed in build 137', '#d4f4df', '#0f3d22'),
              ('Tools', 'Tools', 'YAML, states, templates, colour', '#ffe9c7', '#4d2c00')]
    tiles = ''.join(
        f'<div class="tile row" style="gap:14px;padding:16px"><div class="ico" style="background:var(--ic{i % 4});color:var(--oic{i % 4})">{I(ic, 22)}</div>'
        f'<div class="col grow"><b style="font-size:15px">{t}</b><span class="sm mu">{s}</span></div>{I("ChevronRight", 20, "mu")}</div>'
        for i, (ic, t, s, _, _) in enumerate(groups))
    hero = (f'<div class="row" style="gap:16px;margin-bottom:20px">'
            f'<div class="grow row" style="gap:18px;padding:22px 24px;border-radius:28px;background:var(--pc);color:var(--onpc)">'
            f'<div class="ico" style="background:rgba(255,255,255,.55);color:var(--p)">{I("Update", 24)}</div>'
            f'<div class="col grow"><b style="font-size:18px">4 updates are ready</b><span class="sm" style="opacity:.8">Demo add-on, Living Room Bulb and 2 more</span></div>'
            f'<span class="btn fill">Review</span></div>'
            f'<div class="grow row" style="gap:18px;padding:22px 24px;border-radius:28px;background:var(--wc);color:var(--onwc)">'
            f'<div class="ico" style="background:rgba(255,255,255,.55);color:var(--w)">{I("Wrench", 24)}</div>'
            f'<div class="col grow"><b style="font-size:18px">1 thing to repair</b><span class="sm" style="opacity:.8">The country has not been set</span></div>'
            f'<span class="btn" style="background:var(--w);color:#fff">Fix</span></div></div>')
    return (header('', 'Settings', 'Everything about this home, in one place.',
                   f'<div class="field" style="width:340px">{I("Magnify", 20)}<span class="grow">Search settings</span><span class="kbd">/</span></div>{tools()}')
            + hero + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">{tiles}</div>')


ICVARS = ('style="--ic0:var(--pc);--oic0:var(--onpc);--ic1:var(--tc);--oic1:var(--ontc);'
          '--ic2:var(--okc);--oic2:var(--ok);--ic3:var(--wc);--oic3:var(--w)"')


# 1. The navigation pane, expanded, docked left.
body = (f'<div class="board-title" style="margin-bottom:20px">One navigation pane: the rail and the tab strip become one, docked left, expanded</div>'
        f'<div {ICVARS}>{frame(settings_home(), nav("Settings"))}</div>'
        + note(48, 1010, '<b>One pane, not two.</b> Pages you opened, the system pages and you, in one column. The rail and the second tab column are gone.')
        + note(420, 1010, '<b>Page tools in one pill.</b> Appearance, history, share, lock and help, instead of a row of loose icons.', 240))
board('ModernShell', 'Navigation pane, expanded, light', 1536, 1110, body)

# 2. Collapsed, automation editor.
starts = [('WeatherSunset', 'At sunset, send a notification', 'Runs when the sun sets'), ('ClockOutline', 'Every day at a time', 'Runs at 7:00 every day'),
          ('SwapHorizontal', 'When something changes', 'You pick the entity'), ('TimerSand', 'Wait, then notify', 'Five minutes after a change'),
          ('CallSplit', 'Choose between two', 'One thing before noon, another after')]
st = ''.join(f'<div class="tile col" style="gap:10px;padding:16px;width:200px;height:150px"><div class="ico" style="background:var(--pc);color:var(--onpc);width:38px;height:38px;border-radius:12px">{I(ic, 20)}</div>'
             f'<b style="font-size:14px">{t}</b><span class="xs mu">{s}</span></div>' for ic, t, s in starts)
blk = lambda tag, title, sub, btn, colour: (
    f'<div class="card" style="padding:22px 24px;margin-top:14px"><div class="row" style="gap:12px"><span class="pill" style="background:var({colour});color:var(--on)">{tag}</span>'
    f'<b style="font-size:17px">{title}</b><span class="mu sm">{sub}</span></div>'
    f'<div class="row" style="gap:10px;margin-top:16px;padding:16px;border-radius:18px;border:1.5px dashed var(--out);color:var(--mu)">{I("Plus", 20)}<span class="grow">{btn}</span></div></div>')
editor = (header('Settings › Automations', 'New automation', '',
                 f'<div class="toolpill"><div class="ib">{I("Undo", 20)}</div><div class="ib">{I("Redo", 20)}</div><div class="vsep"></div><div class="ib">{I("DotsVertical", 20)}</div></div>')
          + '<div class="lbl" style="margin-bottom:12px">Start from</div>'
          + f'<div class="row" style="gap:12px;overflow:hidden">{st}</div>'
          + blk('When', 'Any of these happens', 'Triggers', 'Add a trigger, for example the sun setting', '--tc')
          + blk('And if', 'All of these are true', 'Optional', 'Add a condition', '--okc')
          + blk('Then do', 'These actions', 'In order', 'Add an action', '--wc')
          + f'<div class="row" style="position:absolute;left:50%;transform:translateX(-50%);bottom:24px;gap:8px;padding:8px;border-radius:32px;background:var(--on);color:var(--surf);box-shadow:var(--shl)">'
          f'<span class="sm" style="padding:0 14px;opacity:.8">No unsaved changes</span>'
          f'<span class="btn" style="color:var(--surf);opacity:.45">{I("Play", 18)}Run now</span>'
          f'<span class="btn" style="color:var(--surf)">{I("CheckCircleOutline", 18)}Check</span>'
          f'<span class="btn" style="color:var(--surf)">{I("TestTube", 18)}Dry run</span>'
          f'<span class="btn" style="background:var(--surf);color:var(--on)">{I("ContentSave", 18)}Save <span class="kbd" style="margin-left:4px">Ctrl S</span></span></div>')
body = (f'<div class="board-title" style="margin-bottom:20px">Collapsed to icons: the page takes the room back. Automation editor with a floating action bar</div>'
        f'{frame(editor, nav("Settings", mini=True))}'
        + note(48, 1010, '<b>Collapse</b> with the double arrow. Names show on hover and to screen readers.', 220)
        + note(420, 1010, '<b>One action bar.</b> Run now, Check, Dry run and Save float at the foot, so they never scroll away.', 300))
board('ModernCollapsed', 'Navigation pane collapsed, automation editor', 1536, 1110, body)

# 3. Docked top, automation history.
toptabs = (f'<div class="row" style="gap:6px;padding:8px;border-radius:28px;background:var(--surf);box-shadow:var(--sh)">'
           f'<div class="logo" style="width:40px;height:40px">{I("Home", 22)}</div>'
           f'<div class="ib">{I("DockWindow", 20)}</div><div class="ib">{I("ChevronDoubleLeft", 20)}</div><div class="vsep"></div>'
           + ''.join(f'<div class="tabh{" act" if l == "Settings" else ""}">{I(ic, 18)}{l}{I("Close", 16) if l == "Settings" else ""}</div>'
                     for ic, l in [('Home', 'Overview'), ('Map', 'Map'), ('FormatListBulleted', 'Activity'), ('ChartBox', 'History'), ('LightningBolt', 'Energy'), ('Calendar', 'Calendar'), ('Cog', 'Settings')])
           + f'<div class="ib" style="color:var(--p)">{I("Plus", 20)}</div><div class="grow"></div>'
           f'<div class="field" style="height:40px;width:260px">{I("Magnify", 18)}<span class="grow">Search</span><span class="kbd">Ctrl K</span></div>'
           f'<div class="ib">{I("Bell", 20)}</div><div style="width:40px;height:40px;border-radius:20px;background:var(--tc);color:var(--ontc);display:grid;place-items:center;font-weight:700">TO</div></div>')
steps = [('Checks every automation', 'Each must load without errors and be named'), ('Commits each changed repository', 'None has changes right now'),
         ('Commits the master repository', 'Records which commit each automation is at'), ('Sends them to their Git remotes', 'Only where one is set, never forced')]
st = ''.join(f'<div class="row" style="gap:14px;align-items:flex-start;padding:10px 0"><span style="width:28px;height:28px;border-radius:14px;background:var(--pc);color:var(--onpc);display:grid;place-items:center;font-weight:700;font-size:13px;flex:none">{n + 1}</span>'
             f'<div class="col"><b style="font-size:14px">{t}</b><span class="xs mu">{s}</span></div></div>' for n, (t, s) in enumerate(steps))
hist = (header('Settings › Automations & scenes', 'History', 'Every automation keeps its own Git repository; the master repository records them all.',
               tools()) +
        f'<div class="row" style="gap:20px;align-items:flex-start">'
        f'<div class="col grow" style="gap:16px">'
        f'<div class="row" style="gap:20px;padding:26px 28px;border-radius:28px;background:var(--okc);color:var(--ok)">'
        f'<div class="ico" style="width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,.6)">{I("SourceBranch", 28)}</div>'
        f'<div class="col grow"><span class="lbl" style="color:inherit;opacity:.8">0 automations · 1 master repository</span><span class="h2" style="color:var(--on)">Everything is committed</span>'
        f'<span class="sm onv">The master has no commits yet. No Git remote is set, so commits stay on this instance.</span></div></div>'
        f'<div class="card" style="padding:20px 22px"><div class="row" style="gap:10px;margin-bottom:14px"><div class="field grow" style="height:44px">{I("Magnify", 18)}<span>Search automation repositories</span></div>'
        f'<span class="chip">With changes</span><span class="chip">Clean</span></div>'
        f'<div class="col" style="align-items:center;padding:40px 0;gap:10px;color:var(--mu)"><div class="ico" style="background:var(--s2);width:56px;height:56px;border-radius:18px">{I("SourceBranch", 26)}</div>'
        f'<b style="color:var(--on)">No repositories yet</b><span class="sm">Saving an automation creates its first one.</span></div></div></div>'
        f'<div class="card col" style="width:400px;padding:24px;gap:6px"><div class="h2" style="margin-bottom:6px">What a commit does</div>{st}'
        f'<div class="field" style="margin-top:10px">Message for the master commit</div>'
        f'<div class="row xs mu" style="gap:8px;margin-top:8px">{I("ShieldCheck", 16)}Nothing is overwritten. A refused send is reported.</div>'
        f'<div class="row" style="gap:8px;margin-top:14px"><span class="btn txt">{I("FileCompare", 18)}Preview</span><span class="grow"></span>'
        f'<span class="btn fill lg">{I("CloudUpload", 20)}Commit everything</span></div></div></div>')
body = (f'<div class="board-title" style="margin-bottom:20px">Docked to the top: one bar with search, alerts and you. Automation history with one commit action</div>'
        f'{frame(hist, None, top=toptabs)}'
        + note(48, 1010, '<b>One Commit everything</b>, where the message is written. The hero says the state in a sentence.', 260))
board('ModernTop', 'Docked top, automation history', 1536, 1110, body)

# 4. Floating over the overview, with the position menu open.
home = (f'<div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="xs lbl">Thursday 12 November</div>'
        f'<div class="disp" style="margin-top:8px">Good afternoon,<br>Test Owner</div>'
        f'<div class="onv" style="font-size:16px;margin-top:12px">5 lights are on and 2 doors are not locked.</div></div>{tools()}</div>'
        f'<div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:16px;margin-top:30px">'
        f'<div class="tile" style="padding:22px;background:var(--wc);color:var(--onwc);box-shadow:none"><div class="row" style="gap:12px"><div class="ico" style="background:rgba(255,255,255,.6);color:var(--w)">{I("LockOpenVariant", 22)}</div><span class="grow"></span><span class="pill" style="background:rgba(255,255,255,.6)">Needs you</span></div>'
        f'<div class="h2" style="margin-top:18px;color:var(--on)">2 doors are not locked</div><div class="sm" style="margin:4px 0 16px">Front door, Back door · 4 locks</div><span class="btn" style="background:var(--w);color:#fff">{I("Lock", 18)}Lock all</span></div>'
        f'<div class="tile"><div class="row" style="gap:10px"><div class="ico" style="background:var(--pc);color:var(--onpc)">{I("Thermostat", 22)}</div><b>Living room</b></div>'
        f'<div style="font-size:56px;font-weight:500;letter-spacing:-.03em;margin-top:12px">23°</div><div class="sm mu">Heat and cool · target 22°</div></div>'
        f'<div class="tile" style="background:var(--tc);color:var(--ontc);box-shadow:none"><div class="row" style="gap:10px"><div class="ico" style="background:rgba(255,255,255,.55)">{I("PlayBoxMultiple", 22)}</div><b>Bedroom</b></div>'
        f'<div class="h2" style="margin-top:16px;color:var(--on)">Epic sax guy, 10 hours</div><div class="row" style="gap:10px;margin-top:16px"><span class="ib" style="background:var(--t);color:#fff">{I("Pause", 20)}</span><span class="ib" style="background:rgba(255,255,255,.55)">{I("SkipNext", 20)}</span></div></div></div>'
        f'<div class="lbl" style="margin:28px 0 12px">Summaries</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">'
        + ''.join(f'<div class="tile row" style="gap:12px;padding:14px"><div class="ico" style="width:38px;height:38px;border-radius:12px;background:var(--s2)">{I(ic, 20)}</div><div class="col"><b>{t}</b><span class="xs mu">{s}</span></div></div>'
                  for ic, t, s in [('LightbulbGroup', 'Lights', '5 on'), ('ShieldHome', 'Security', '2 unlocked'), ('BatteryAlert', 'Maintenance', '1 low battery'), ('WeatherPouring', 'Weather', '−24 °C · Rainy')]) + '</div>')
floatnav = f'<div style="position:absolute;left:820px;top:150px;z-index:3;height:640px;display:flex">{nav("Overview", float_=True)}</div>'
dmenu = ('<div class="menu" style="position:absolute;left:560px;top:190px;z-index:4">' + '<div class="lbl" style="padding:8px 14px">Tab strip position</div>'
         + ''.join(f'<div class="mi{" sel" if k == "Float anywhere" else ""}">{I(ic, 20)}<span class="grow">{k}</span>{I("Check", 18) if k == "Float anywhere" else ""}</div>'
                   for ic, k in [('DockLeft', 'Dock to left'), ('DockRight', 'Dock to right'), ('DockTop', 'Dock to top'), ('DockBottom', 'Dock to bottom'), ('DockWindow', 'Float anywhere')])
         + f'<div class="msep"></div><div class="mi">{I("ChevronDoubleLeft", 20)}Collapse tab strip</div><div class="mi">{I("TabPlus", 20)}New tab…</div><div class="mi">{I("FolderPlus", 20)}New group…</div></div>')
page = f'<div style="position:relative;height:100%">{home}</div>'
body = (f'<div class="board-title" style="margin-bottom:20px">Floating anywhere: the pane is a card over the page, moved by its handle. The position menu is open</div>'
        f'<div style="position:relative">{frame(page, None, top="<span></span>")}{floatnav}{dmenu}</div>'
        + note(48, 1010, '<b>Drag the handle</b>, or focus it and use the arrow keys; Shift moves further. It stays where you leave it, on any window size.', 260)
        + note(420, 1010, '<b>The position menu</b> opens from its own button, not only by right-clicking empty space.', 240))
board('ModernFloat', 'Floating pane over the overview, position menu open', 1536, 1110, body)

# 5. Every position, side by side.
def mini(kind, collapsed=False):
    bar = 'var(--p)'
    pane = 'background:var(--surf);box-shadow:var(--sh)'
    if kind in ('left', 'right'):
        side = f'<div style="width:{18 if collapsed else 46}px;border-radius:10px;{pane};display:flex;flex-direction:column;gap:5px;padding:6px">' + ''.join(
            f'<span style="height:7px;border-radius:4px;background:{bar if n == 3 else "var(--s3)"}"></span>' for n in range(7)) + '</div>'
        pg = '<div class="grow" style="border-radius:10px;background:var(--s1)"></div>'
        inner = side + pg if kind == 'left' else pg + side
        return f'<div class="row" style="gap:5px;height:130px;padding:5px;border-radius:14px;background:var(--bg);align-items:stretch">{inner}</div>'
    if kind in ('top', 'bottom'):
        strip = f'<div class="row" style="height:20px;border-radius:10px;{pane};gap:5px;padding:0 6px">' + ''.join(
            f'<span style="width:{8 if collapsed else 22}px;height:7px;border-radius:4px;background:{bar if n == 2 else "var(--s3)"}"></span>' for n in range(6)) + '</div>'
        pg = '<div class="grow" style="border-radius:10px;background:var(--s1)"></div>'
        inner = strip + pg if kind == 'top' else pg + strip
        return f'<div class="col" style="gap:5px;height:130px;padding:5px;border-radius:14px;background:var(--bg)">{inner}</div>'
    return (f'<div style="position:relative;height:130px;padding:5px;border-radius:14px;background:var(--bg)"><div style="height:100%;border-radius:10px;background:var(--s1)"></div>'
            f'<div style="position:absolute;left:58%;top:16px;width:{20 if collapsed else 48}px;height:96px;border-radius:12px;background:var(--surf);box-shadow:var(--shl);display:flex;flex-direction:column;gap:5px;padding:6px">'
            + ''.join(f'<span style="height:7px;border-radius:4px;background:{bar if n == 2 else "var(--s3)"}"></span>' for n in range(6)) + '</div></div>')


cards = ''
for kind, label, sub in [('left', 'Left', 'The default'), ('right', 'Right', 'For the other hand'), ('top', 'Top', 'One bar with search'),
                         ('bottom', 'Bottom', 'Within thumb reach'), ('float', 'Floating', 'Anywhere you drag it')]:
    sel = kind == 'float'
    cards += (f'<div class="col" style="gap:12px;padding:14px;border-radius:24px;background:var(--surf);box-shadow:{"0 0 0 3px var(--p)" if sel else "var(--sh)"}">'
              f'{mini(kind)}{mini(kind, True)}<div class="row" style="gap:8px"><div class="col grow"><b style="font-size:15px">{label}</b><span class="xs mu">{sub}</span></div>'
              f'{"<span class=pill style=background:var(--pc);color:var(--onpc)>Chosen</span>" if sel else ""}</div></div>')
setrow = (f'<div class="card" style="padding:8px;margin-top:28px">'
          f'<div class="row" style="gap:16px;padding:16px 18px"><div class="ico" style="background:var(--pc);color:var(--onpc)">{I("DockWindow", 22)}</div>'
          f'<div class="col grow"><b style="font-size:15px">Tab strip position</b><span class="sm mu">Where the strip of open pages sits</span></div>'
          f'<div class="row" style="gap:4px;padding:4px;border-radius:22px;background:var(--s2)">'
          + ''.join(f'<span class="chip{" sel" if l == "Floating" else ""}" style="background:{"var(--on)" if l == "Floating" else "transparent"}">{l}</span>' for l in ['Left', 'Right', 'Top', 'Bottom', 'Floating'])
          + f'</div></div><div style="height:1px;background:var(--out);margin:0 18px"></div>'
          f'<div class="row" style="gap:16px;padding:16px 18px"><div class="ico" style="background:var(--tc);color:var(--ontc)">{I("ChevronDoubleLeft", 22)}</div>'
          f'<div class="col grow"><b style="font-size:15px">Collapse the tab strip</b><span class="sm mu">Each tab shows as its icon; the name shows when you point at it</span></div>'
          f'<div style="width:52px;height:32px;border-radius:16px;background:var(--p);position:relative"><span style="position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:12px;background:var(--onp)"></span></div></div></div>')
body = (f'<div class="board-title" style="margin-bottom:8px">Every position, expanded and collapsed</div>'
        f'<div class="h1" style="margin-bottom:24px">Put the tabs where your hand is</div>'
        f'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px">{cards}</div>{setrow}')
board('ModernPositions', 'Every tab strip position, expanded and collapsed', 1440, 740, body)

# 6. Dark settings.
body = (f'<div class="board-title" style="margin-bottom:20px">Dark: tonal surfaces instead of grey boxes</div>'
        f'<div {ICVARS}>{frame(settings_home(), nav("Settings"))}</div>')
board('ModernDark', 'Navigation pane, settings, dark', 1536, 1000, body, dark=True)

# 7. Colour tool.
rows = [('HEX', '#2155D6'), ('RGB', 'rgb(33 85 214)'), ('HSL', 'hsl(223 73% 48%)'), ('OKLCH', 'oklch(50% .19 264)'), ('CMYK', '85 60 0 16')]
rws = ''.join(f'<div class="row" style="gap:12px;height:48px;padding:0 6px 0 16px;border-radius:16px;background:var(--s1)"><span class="lbl" style="width:56px">{k}</span>'
              f'<code class="grow" style="font-size:14px">{v}</code><div class="ib">{I("ContentCopy", 18)}</div></div>' for k, v in rows)
colour = (header('Tools', 'Colour', 'Pick, type or take a colour from the screen, and copy it in any format.', tools()) +
          f'<div class="row" style="gap:20px;align-items:flex-start">'
          f'<div class="card col" style="padding:22px;gap:16px;width:440px">'
          f'<div style="height:260px;border-radius:20px;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,#2155d6);position:relative"><span style="position:absolute;left:72%;top:22%;width:22px;height:22px;border-radius:11px;box-shadow:0 0 0 3px #fff,0 2px 8px rgba(0,0,0,.4)"></span></div>'
          f'<div style="height:16px;border-radius:8px;background:linear-gradient(90deg,red,#ff0,lime,cyan,blue,#f0f,red);position:relative"><span style="position:absolute;left:62%;top:-4px;width:24px;height:24px;border-radius:12px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span></div>'
          f'<div class="row" style="gap:10px"><div class="field grow">#2155D6</div><span class="btn ton">{I("Eyedropper", 18)}Pick from screen</span></div></div>'
          f'<div class="card col grow" style="padding:22px;gap:10px"><div class="row" style="gap:16px;margin-bottom:8px"><div style="width:72px;height:72px;border-radius:22px;background:#2155d6"></div>'
          f'<div class="col"><span class="h2">#2155D6</span><span class="sm mu">Nearest name: royal blue · family Blue</span></div></div>{rws}'
          f'<div class="row" style="gap:8px;margin-top:6px"><span class="chip sel">sRGB</span><span class="chip">Display P3</span><span class="pill" style="background:var(--okc);color:var(--ok);margin-left:auto">White text 6.4:1 · AA</span></div></div></div>')
body = (f'<div class="board-title" style="margin-bottom:20px">Colour tool: the picker button keeps one line, every format copies in one press</div>{frame(colour, nav("Developer", mini=True))}')
board('ModernColour', 'Colour tool', 1536, 1060, body)

# 8. Apps without an app store.
apps = (header('Settings', 'Apps', '', tools()) +
        f'<div class="col" style="align-items:center;text-align:center;padding-top:40px">'
        f'<div style="width:96px;height:96px;border-radius:32px;background:linear-gradient(135deg,var(--pc),var(--tc));display:grid;place-items:center;color:var(--p)">{I("Apps", 48)}</div>'
        f'<div class="h1" style="margin-top:24px">Apps need the Operating System</div>'
        f'<div class="onv" style="font-size:16px;max-width:560px;margin-top:10px">Apps run beside Home Assistant: network monitoring, code editors, databases. This installation method has no app store, so there is nothing to install here.</div>'
        f'<div class="row" style="gap:10px;margin-top:26px"><span class="btn fill lg">{I("OpenInNew", 18)}Compare installation methods</span><span class="btn out lg">{I("EyeOff", 18)}Don\'t show again</span></div></div>')
body = (f'<div class="board-title" style="margin-bottom:20px">Apps without an app store: one clear sentence, and dismissing is never red</div>{frame(apps, nav("Settings"))}')
board('ModernApps', 'Apps without an app store', 1536, 1060, body)


# 9 and 10. Phones.
def phone(content, active='Home', dark=False, title='', back=False):
    top = (f'<div class="row" style="gap:8px;padding:56px 16px 10px">'
           + (f'<div class="ib">{I("ArrowLeft", 22)}</div>' if back else '')
           + f'<div class="h2 grow">{title}</div><div class="ib">{I("Magnify", 22)}</div><div class="ib">{I("DotsVertical", 22)}</div></div>')
    items = [('Home', 'Home'), ('Magnify', 'Search'), ('TabPlus', 'Pages'), ('Cog', 'Settings'), ('Menu', 'Menu')]
    bn = '<div class="bnav">' + ''.join(f'<div class="bi{" act" if l == active else ""}"><span class="pi">{I(ic, 22)}</span>{l}</div>' for ic, l in items) + '</div>'
    return f'<div class="phone{" root dark" if dark else ""}" style="flex:none">{top}<div style="padding:0 16px">{content}</div>{bn}</div>'


def lrow(av, t, s, tail='', avbg='var(--pc)', avfg='var(--onpc)'):
    return (f'<div class="row" style="gap:14px;padding:14px;border-radius:22px;background:var(--surf);box-shadow:var(--sh);margin-bottom:10px">'
            f'<div class="ico" style="background:{avbg};color:{avfg};border-radius:16px">{av}</div><div class="col grow" style="gap:3px"><b style="font-size:15px">{t}</b>{s}</div>{tail}</div>')


users = (f'<div class="row" style="gap:8px;margin-bottom:14px"><span class="chip sel">All</span><span class="chip">Admins</span><span class="chip">{I("SortAscending", 16)}Name</span></div>'
         + lrow('<b>TO</b>', 'Test Owner', '<span class="sm mu">test · can sign in from anywhere</span><span class="row" style="gap:6px;margin-top:4px"><span class="pill" style="background:var(--wc);color:var(--onwc)">' + I('Crown', 14) + ' Owner</span></span>', f'<div class="ib">{I("DotsVertical", 20)}</div>', 'var(--tc)', 'var(--ontc)')
         + lrow('<b>HA</b>', 'Home Assistant Content', '<span class="sm mu">System user · not a person</span><span class="row" style="gap:6px;margin-top:4px"><span class="pill" style="background:var(--s2);color:var(--onv)">System</span></span>', f'<div class="ib">{I("DotsVertical", 20)}</div>')
         + f'<div class="row sm onv" style="gap:10px;padding:14px;border-radius:18px;background:var(--s2)">{I("InformationOutline", 18)}The owner cannot be removed.</div>'
         + f'<span class="btn fill lg" style="position:absolute;right:20px;bottom:104px;box-shadow:var(--shl)">{I("Plus", 20)}Add user</span>')
bps = (f'<div class="row" style="gap:8px;margin-bottom:14px;overflow:hidden"><span class="chip sel">All</span><span class="chip">Automations</span><span class="chip">Scripts</span><span class="chip">In use</span></div>'
       + ''.join(lrow(I('Robot' if k == 'Automation' else 'FormatListChecks', 22), t, f'<span class="sm mu">{k} · not used</span><span class="sm onv" style="margin-top:4px">{d}</span>',
                      f'<span class="btn ton sm">{I("Plus", 16)}Use</span>', 'var(--tc)' if k == 'Script' else 'var(--pc)', 'var(--ontc)' if k == 'Script' else 'var(--onpc)')
                 for t, k, d in [('Confirmable notification', 'Script', 'Asks on a phone before it runs an action.'), ('Motion-activated light', 'Automation', 'Turns a light on when motion is seen.'), ('Zone notification', 'Automation', 'Tells a device when someone leaves a zone.')])
       + f'<span class="btn fill lg" style="position:absolute;right:20px;bottom:104px;box-shadow:var(--shl)">{I("Plus", 20)}Import from a link</span>')
tabsheet = (f'<div style="position:absolute;inset:0;background:rgba(10,14,22,.38)"></div>'
            f'<div style="position:absolute;left:0;right:0;bottom:0;border-radius:32px 32px 0 0;background:var(--surf);padding:12px 16px 110px;box-shadow:var(--shl)">'
            f'<div style="width:40px;height:4px;border-radius:2px;background:var(--out);margin:0 auto 14px"></div>'
            f'<div class="row" style="margin-bottom:12px"><b class="h2 grow">Open pages</b><span class="btn txt sm">{I("Plus", 16)}New tab</span></div>'
            + ''.join(f'<div class="ni{" act" if l == "Settings" else ""}" style="height:52px">{I(ic, 22)}{l}{I("Close", 18, "x") if l == "Settings" else (I("Pin", 16, "x") if l == "Overview" else "")}</div>'
                      for ic, l in [('Home', 'Overview'), ('Map', 'Map'), ('FormatListBulleted', 'Activity'), ('ChartBox', 'History'), ('Cog', 'Settings')])
            + '</div>')
p1 = phone(users, 'Settings', title='Users', back=True)
p2 = phone(bps, 'Settings', title='Blueprints', back=True)
p3 = phone(f'<div class="disp" style="font-size:34px">Good afternoon</div><div class="onv" style="margin-top:8px">5 lights on · 2 doors unlocked</div>{tabsheet}', 'Pages', title='')
body = (f'<div class="board-title" style="margin-bottom:28px">Phone: rows are cards that grow with their text; open pages are a sheet from the bottom bar</div>'
        f'<div class="row" style="gap:48px;align-items:flex-start;padding-left:10px">{p1}{p2}{p3}</div>')
board('ModernPhone', 'Phone, light: users, blueprints, open pages', 1440, 1000, body)

home_dark = (f'<div class="disp" style="font-size:34px">Good evening,<br>Test Owner</div><div class="onv" style="margin:10px 0 18px">5 lights on · 2 doors unlocked</div>'
             f'<div class="tile" style="background:var(--wc);color:var(--onwc);box-shadow:none;margin-bottom:12px"><b class="h2" style="color:var(--on)">2 doors are not locked</b><div class="sm" style="margin:6px 0 14px">Front door, Back door</div><span class="btn" style="background:var(--w);color:#2a1700">{I("Lock", 18)}Lock all</span></div>'
             f'<div class="row" style="gap:12px"><div class="tile grow"><b>Living room</b><div style="font-size:44px;font-weight:500">23°</div></div><div class="tile grow" style="background:var(--tc);box-shadow:none"><b>Bedroom</b><div class="sm" style="margin-top:8px">Epic sax guy</div></div></div>')
sett_dark = (f'<div class="field" style="margin-bottom:14px">{I("Magnify", 20)}Search settings</div>'
             f'<div class="row" style="gap:12px;padding:16px;border-radius:24px;background:var(--pc);color:var(--onpc);margin-bottom:10px">{I("Update", 22)}<b class="grow">4 updates are ready</b>{I("ChevronRight", 20)}</div>'
             + ''.join(lrow(I(ic, 22), t, f'<span class="sm mu">{s}</span>', I('ChevronRight', 20, 'mu')) for ic, t, s in
                       [('Devices', 'Devices & services', '62 devices'), ('Robot', 'Automations & scenes', '0 automations'), ('AccountCog', 'Personal settings', 'Language, sound'), ('Tools', 'Tools', 'YAML, states, colour')]))
p4 = phone(home_dark, 'Home', dark=True)
p5 = phone(sett_dark, 'Settings', dark=True, title='Settings')
p6 = phone(colour.split('<div class="row" style="gap:20px;align-items:flex-start">')[0][:0] +
           f'<div class="card col" style="padding:16px;gap:12px"><div style="height:200px;border-radius:18px;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,#2155d6)"></div>'
           f'<div class="field">#2155D6</div><span class="btn ton" style="justify-content:center">{I("Eyedropper", 18)}Pick from screen</span></div>'
           + ''.join(f'<div class="row" style="gap:10px;height:46px;padding:0 6px 0 14px;border-radius:14px;background:var(--surf);margin-top:8px"><span class="lbl" style="width:52px">{k}</span><code class="grow sm">{v}</code><div class="ib">{I("ContentCopy", 18)}</div></div>' for k, v in rows[:3]),
           'Settings', dark=True, title='Colour', back=True)
body = (f'<div class="board-title" style="margin-bottom:28px">Phone, dark: home, settings and the colour tool</div>'
        f'<div class="row" style="gap:48px;align-items:flex-start;padding-left:10px">{p4}{p5}{p6}</div>')
board('ModernPhoneDark', 'Phone, dark: home, settings, colour', 1440, 1000, body, dark=True)

# Canvas index.
idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': '2026-11-12T19:30:00Z'}, 'title': 'Home Assistant Material, modern remake',
       'launch': {'view': 'canvas', 'page': 'shell'},
       'pages': [{'id': 'shell', 'name': 'Navigation: dock, collapse, float'}, {'id': 'pages', 'name': 'Pages from the polish pass'}, {'id': 'phone', 'name': 'Phone'}],
       'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
pagemap = {'ModernShell': 'shell', 'ModernCollapsed': 'shell', 'ModernTop': 'shell', 'ModernFloat': 'shell', 'ModernPositions': 'shell',
           'ModernDark': 'pages', 'ModernColour': 'pages', 'ModernApps': 'pages', 'ModernPhone': 'phone', 'ModernPhoneDark': 'phone'}
pos = {}
for name, title, w, h in BOARDS:
    pg = pagemap[name]
    x, y, rowh, col = pos.get(pg, (0, 0, 0, 0))
    if col == 2:
        x, y, rowh, col = 0, y + rowh + 200, 0, 0
    idx['boards'][name + '.dc.html'] = {'x': x, 'y': y, 'w': w, 'h': h, 'title': title, 'expand': 'fill', 'page': pg}
    idx['order'].append(name + '.dc.html')
    pos[pg] = (x + w + 120, y, max(rowh, h), col + 1)
for pg, text in [('shell', 'Navigation: one pane that docks to any edge, collapses to icons or floats anywhere. 5 boards.'),
                 ('pages', 'Pages from the polish pass, remade: dark settings, colour tool, apps. 3 boards.'),
                 ('phone', 'Phone, light and dark: rows as cards, open pages as a sheet. 2 boards.')]:
    idx['notes']['t-' + pg] = {'x': 0, 'y': -320, 'text': text, 'kind': 'title1', 'maxW': 3200, 'page': pg}
json.dump(idx, open(os.path.join(OUT, 'canvas.json'), 'w'), indent=2)
print(len(BOARDS), 'boards')
