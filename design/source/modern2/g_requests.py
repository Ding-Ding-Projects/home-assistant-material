"""Modern remake, group 8: the most requested community features."""
from ui import *

import json
import os

SC, AU, PF, DE, CA, EV, WT, SF, EA, CU, PH = ('scenes', 'automation', 'performance', 'dashedit', 'cards', 'everyone', 'walltablet', 'setup', 'entities', 'custom', 'phone')
# A personal wording file (kept outside the repository) can rename the page names on the hosted canvas.
WF = os.environ.get('WORDING_FILE')
WORDS = json.load(open(WF)) if WF else {}
begin(WORDS.get('requests_folder', 'requests-uh') if WF else 'requests')
grab = '<div style="width:40px;height:4px;border-radius:2px;background:var(--out);margin:0 auto 12px"></div>'
sh = lambda *parts: f'<div class="sheet"><div class="col" style="gap:10px">{grab}' + ''.join(parts) + '</div></div>'


def swatch(c, sel=False):
    ring = 'outline:3px solid var(--p);outline-offset:2px;' if sel else ''
    return f'<span style="width:28px;height:28px;border-radius:14px;background:{c};{ring}flex:none"></span>'


RAINBOW = 'conic-gradient(red,#ff0,lime,cyan,blue,#f0f,red)'


def palette(colors, sel=None, open_=False):
    """A row of colours that always ends with the rainbow: the infinite picker for any colour."""
    ring = 'outline:3px solid var(--p);outline-offset:2px;' if open_ else ''
    more = (f'<span title="Any colour" style="width:28px;height:28px;border-radius:14px;background:{RAINBOW};{ring}flex:none;display:grid;place-items:center;animation:spin 6s linear infinite">'
            f'<span style="width:12px;height:12px;border-radius:6px;background:var(--s1)"></span></span>')
    return ''.join(swatch(c, i == sel) for i, c in enumerate(colors)) + more


def bulb(name, on, level, t='w', changed=False):
    tag = pill('Changed', 'p') if changed else ''
    return card(row(ico('Lightbulb' if on else 'LightbulbOff', t if on else 'n', 36, 12, 18), col(f'<b>{name}</b>', f'<span class="sm mu">{"On · " + str(level) + "%" if on else "Off"}</span>', gap=0, style='flex:1'), tag, switch(on)),
                slider(level if on else 0, t), pad=14, gap=10)


# ---------------- Editor and workflow ----------------
scene = (header('Evening scene', 'Editing without touching the room', 'Settings › Scenes', row(btn('Preview in the room', 'out', 'Eye'), btn('Save', 'fill', 'ContentSave'), tools(), gap=10))
         + note('Safe editing is on. Nothing in the room changes until you choose Preview or Apply.', 't', 'ShieldCheck')
         + '<div style="height:16px"></div>'
         + grid('minmax(0,1.3fr) minmax(0,1fr)', col(bulb('Sofa lamp', 1, 40, changed=True), bulb('Ceiling', 0, 0), bulb('Reading light', 1, 80), gap=10),
                card(*[row(f'<span class="grow">{n}</span>', f'<span class="mono sm mu">{a}</span>', I('ArrowRight', 16), f'<b class="mono sm">{b}</b>') for n, a, b in [('Sofa lamp', '100%', '40%'), ('Ceiling', 'on', 'off'), ('Reading light', '80%', '80%')]],
                     '<span class="lbl">Room right now</span>', row(live('Living room unchanged'), gap=8), title='Scene vs room', gap=10)))
page_board('RSceneSafe', 'Non-destructive scene editing', SC, scene, caption='Scenes: edit states on paper, the room stays as it is until Preview or Apply')

scenep = over(header('Evening scene', '', 'Settings › Scenes', tools()) + col(bulb('Sofa lamp', 1, 40, changed=True), bulb('Ceiling', 0, 0), gap=10),
              dialog('Preview in the room?', col(note('The lights will change for 30 seconds, then go back to how they are now.', 'w', 'TimerSand'), field('Preview length', '30 seconds'), row('<b class="grow">Go back afterwards</b>', switch(1))),
                     'Eye', 't', actions=btn('Cancel', 'txt') + btn('Preview', 'fill')))
page_board('RScenePreview', 'Scene preview with automatic restore', SC, scenep, caption='Preview: a timed try in the room that puts everything back afterwards')

raw_lines = ['views:', '  - title: Home', '    cards:', '      - type: tile', '        entity: light.kitchen', '      - type: tile', '        entity: light.kitchen_counter', '      - type: history-graph', '        entities:', '          - sensor.kitchen_temperature']
hit = {4, 6, 9}
gutter = ''.join(f'<div class="row" style="gap:14px;height:24px;{"background:color-mix(in srgb,var(--w) 22%,transparent);border-radius:6px" if i in hit else ""}"><span class="mono sm mu" style="width:28px;text-align:right">{i + 1}</span><span class="mono sm" style="white-space:pre">{e(l)}</span></div>' for i, l in enumerate(raw_lines))
raw = (header('Raw configuration editor', 'Home dashboard', 'Dashboards', row(btn('Save', 'fill', 'ContentSave'), tools(), gap=10))
       + card(row(search('kitchen', w=300), field('Replace with', 'galley'), btn('Pattern', 'ton', 'Regex'), chip('Match case'), chip('Whole word', True), '<span class="sm mu">3 of 3</span>', btn('Replace', 'out'), btn('Replace all', 'fill'), gap=8, style='flex-wrap:wrap'), pad=14)
       + '<div style="height:12px"></div>' + card(gutter, pad=14, gap=0)
       + '<div style="height:12px"></div>' + row(pill('Line 5, column 17'), pill('YAML valid', 'g'), btn('Go to line', 'txt', 'FormatListNumbered'), gap=8))
page_board('RRawSearch', 'Search and replace in the raw configuration editor', SC, raw, active='Overview', caption='Raw editor: find bar with the pattern workbench, replace one or all, line numbers and Go to line')

rawe = (header('Replace entity everywhere', 'light.kitchen → light.galley', 'Dashboards', tools())
        + grid(2, card(code('-        entity: light.kitchen\n+        entity: light.galley'), '<span class="sm mu">Whole entity ids only: light.kitchen_counter is left alone.</span>', title='Preview the change'),
               card(lst([('CardOutline', 'Tile: Kitchen', 'Line 5', I('CheckboxMarked', 22), 'w'), ('ChartLine', 'History graph', 'Line 10 · not a match', I('CheckboxBlankOutline', 22), 'n')]), btn('Replace 1', 'fill'), title='Where')))
page_board('RRawEntity', 'Swap an entity id safely', SC, rawe, active='Overview', caption='Entity swap: a whole-id match with a diff preview before saving')

def trig(icon, kind, text, state, t, ok):
    return card(row(ico(icon, t, 36, 12, 18), col(f'<span class="lbl">{kind}</span>', f'<b>{text}</b>', gap=0, style='flex:1'),
                    f'<span class="row" style="gap:6px;padding:6px 12px;border-radius:999px;background:var(--{"okc" if ok else "s2"})">{I("CheckCircle" if ok else "CircleOutline", 16)}<span class="sm">{state}</span></span>'), pad=14)
live_auto = (header('Arrive home', 'Live states on', 'Settings › Automations', row(row('<b>Live states</b>', switch(1), gap=8), btn('Save', 'fill', 'ContentSave'), tools(), gap=12))
             + '<span class="lbl">When</span>' + trig('MapMarker', 'Person', 'Alex arrives home', 'Alex: away, 12 km', 'p', False)
             + '<span class="lbl" style="margin-top:12px">And if</span>' + trig('WeatherSunset', 'Sun', 'Sun is below the horizon', 'Below, since 16:48', 'w', True)
             + trig('Lightbulb', 'State', 'Hall light is off', 'Off', 'g', True)
             + trig('Thermometer', 'Numeric', 'Hall below 19 °C', '20.4 °C', 'e', False)
             + '<div style="height:12px"></div>' + note('2 of 3 conditions pass right now. It would not run yet: Alex is still away.', 'w', 'InformationOutline'))
page_board('RLiveStates', 'Live entity states in the automation editor', AU, live_auto, caption='Live states: each trigger and condition shows its entity right now and whether it passes')

stor = (header('Database storage', 'Recorder · 2.4 GB', 'Settings › System › Storage', row(btn('Purge…', 'out', 'Broom'), tools(), gap=10))
        + grid('300px minmax(0,1fr)', card(ring(68, '2.4 GB', 'p', 180), kv([('Rows', '18.2 million'), ('Oldest', '10 days'), ('Growing', '190 MB a day')]), style='align-items:center'),
               card(seg(['Entities', 'Integrations', 'Domains'], 0), bars([38, 21, 12, 8, 6, 4], 'p', 200, ['sensor.power', 'sensor.energy', 'camera.door', 'sensor.rssi', 'weather.home', 'Other']), title='Biggest first')))
page_board('RStorage', 'Database and storage breakdown', PF, stor, caption='Storage: total, growth and the entities taking the most space, biggest first')

stor2 = (header('sensor.power', '912 MB · 38%', 'Settings › System › Storage', tools())
         + grid(2, card(kv([('Changes a day', '86,400'), ('Why so many', 'Updates every second'), ('Kept for', '10 days')]), title='What it costs'),
                card(row('<b class="grow">Keep history</b>', switch(1)), field('Record at most', 'Once a minute'), field('Keep for', '3 days'), note('Saves about 820 MB.', 'g', 'Leaf'), btn('Apply and purge', 'fill'), title='Make it smaller')))
page_board('RStorageEntity', 'One entity: why it is big and how to shrink it', PF, stor2, caption='Storage detail: why an entity is big, with savings shown before applying')

# ---------------- Styling ----------------
style = (header('Kitchen tile', 'Edit card', 'Dashboards', row(btn('Save', 'fill'), tools(), gap=10), tabs=(['Content', 'Style', 'Interactions', 'Visibility'], 1))
         + grid('minmax(0,1fr) minmax(0,1fr)', card(field('Font size', '18 px'), row('<span class="grow">Icon colour</span>', palette(['var(--p)', '#e8735a', '#2e9e88', '#e0a32a'], 1), gap=8),
                                               field('Padding', '20 px'), field('Border', '2 px · outline colour'), field('Corner radius', '24 px'), row(btn('Copy style', 'ton', 'ContentCopy'), btn('Paste', 'txt', 'ContentPaste'), btn('Reset', 'txt')), title='Card style'),
                card(f'<div class="card" style="padding:20px;border:2px solid var(--out);border-radius:24px;animation:pop .5s both">{row(ico("Lightbulb", "e"), "<b style=font-size:18px>Kitchen</b>", "<span class=grow></span>", switch(1))}</div>',
                     note('No code needed. Advanced: the same settings as CSS, for anything not covered.', 'p', 'CodeBraces'), title='Live preview')))
page_board('RCardStyle', 'Native card styling in the visual editor', CA, style, active='Overview', caption='Card styling: font, icon colour, padding, border and radius in the editor, no card-mod')

popup = over(header('Home', '', '', tools()) + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=18) for i, n, t in [('Sofa', 'Living room', 'p'), ('FoodForkDrink', 'Kitchen', 'w'), ('Bed', 'Bedroom', 't')]]),
             f'<div class="dlg" style="width:560px;animation:pop .35s both">{row(ico("Sofa", "p"), "<b class=h2 style=flex:1>Living room</b>", ib("Close"))}'
             + grid(2, bulb('Ceiling', 1, 60), bulb('Lamp', 1, 30), gap=10) + row(chip('Movie', True), chip('Bright'), chip('Off'), gap=8) + '</div>')
page_board('RPopup', 'Interactive pop-up cards', CA, popup, active='Overview', caption='Pop-ups: tap a tile and a room opens as a native pop-up with its own cards')

popcfg = (header('Living room tile', 'Edit card', 'Dashboards', tools(), tabs=(['Content', 'Style', 'Interactions', 'Visibility'], 2))
          + grid(2, card(field('Tap', 'Open a pop-up'), field('Pop-up', 'Living room'), field('Size', 'Medium'), row('<b class="grow">Close when tapping outside</b>', switch(1)), title='Interaction'),
                 card(lst([('CardOutline', 'Ceiling light', 'Tile', ib('DragVertical'), 'w'), ('CardOutline', 'Lamp', 'Tile', ib('DragVertical'), 'w'), ('Palette', 'Scenes', 'Chips', ib('DragVertical'), 'p')]), btn('Add card', 'ton', 'Plus'), title='Pop-up contents')))
page_board('RPopupConfig', 'Building a pop-up', CA, popcfg, active='Overview', caption='Pop-up builder: choose Open a pop-up and fill it with cards, no add-ons')

hg = (header('Energy and temperature', 'History graph', 'Dashboards', tools())
      + grid('minmax(0,1.5fr) minmax(0,1fr)', card('<svg viewBox="0 0 600 240" style="width:100%;height:240px" aria-hidden="true">'
                                                   '<line x1="40" y1="20" x2="40" y2="210" stroke="var(--out)"/><line x1="40" y1="210" x2="590" y2="210" stroke="var(--out)"/>'
                                                   '<text x="10" y="26" font-size="12" fill="var(--mu)">30</text><text x="14" y="214" font-size="12" fill="var(--mu)">10</text>'
                                                   '<path d="M40 150 C 120 120, 200 170, 280 110 S 440 90, 590 130" fill="none" stroke="#e8735a" stroke-width="3" style="stroke-dasharray:900;--len:900;animation:draw 1.4s both"/>'
                                                   '<path d="M40 170 C 120 160, 200 180, 280 150 S 440 140, 590 160" fill="none" stroke="#e8735a" stroke-width="3" stroke-dasharray="6 6" opacity=".5"/>'
                                                   '<path d="M40 90 C 120 100, 200 70, 280 80 S 440 60, 590 70" fill="none" stroke="#2e9e88" stroke-width="3" style="stroke-dasharray:900;--len:900;animation:draw 1.4s .2s both"/></svg>',
                                                   row(pill('Hall · this week', 'e'), pill('Hall · last week, dashed', 'n'), pill('Kitchen', 't'), gap=6), title='Preview'),
             card(grid(2, field('Y axis from', '10'), field('Y axis to', '30'), gap=10), row('<span class="grow">Hall colour</span>', palette(['#e8735a', '#2e9e88', '#e0a32a'], 0), gap=8),
                  row('<b class="grow">Compare with</b>', seg(['None', 'Last week', 'Last year'], 1)), title='Controls')))
page_board('RHistory', 'Custom history graph controls', CA, hg, active='History', caption='History graphs: fixed Y axis, a colour per entity and a dashed earlier period to compare')

# ---------------- Dashboards and people ----------------
deflt = (header('Default dashboard', 'For everyone, set once', 'Settings › Dashboards', tools())
         + grid('minmax(0,1fr) minmax(0,1.2fr)', card(field('Everyone opens', 'Home'), seg(['Everyone', 'Each person'], 0), row('<b class="grow">Phones open</b>', pill('Phone first', 'p')), row('<b class="grow">Wall tablets open</b>', pill('Wall panel', 't')),
                                                    row('<b class="grow">Let people choose their own</b>', switch(1)), title='Admin setting'),
                table(['Person', 'Opens', ''], [[row(avatar(a, t, 30), f'<b>{n}</b>', gap=8), d, pill(s, st)] for a, n, t, d, s, st in [('AL', 'Alex', 'g', 'Home', 'Default', 'n'), ('SK', 'Sam', 'w', 'Energy', 'Own choice', 'p'), ('KD', 'Kids', 'p', 'Kids room', 'Set by admin', 't')]], ['1.3fr', '1fr', '1fr'])))
page_board('RDefault', 'System-wide default dashboards', EV, deflt, caption='Defaults: one admin setting for every person and device, with per-device kinds and overrides')

rbac = (header('Roles', '4 roles', 'Settings › People', row(btn('New role', 'fill', 'Plus'), tools(), gap=10))
        + grid('260px minmax(0,1fr)', lst([('ShieldCrown', 'Admin', '2 people', '', 'p'), ('Account', 'Family', '2 people', '', 'g'), ('HumanChild', 'Kids', '2 people', '', 'w'), ('AccountClock', 'House sitter', 'Until 20 Nov', '', 't')]),
               card(*[row(ico(i, t, 32, 10, 16), f'<span class="grow">{n}</span>', seg(['Hidden', 'View', 'Use'], v)) for i, n, v, t in [('ViewDashboard', 'Energy dashboard', 0, 'g'), ('Lock', 'Front door lock', 1, 'w'), ('Lightbulb', 'Kitchen lights', 2, 'p'), ('Cog', 'Settings', 0, 'n'), ('Tab', 'Cameras tab', 0, 'e')]],
                    title='Kids can…', gap=12)))
page_board('RRoles', 'Granular role-based access', EV, rbac, caption='Roles: hide, view or use for each dashboard, card, tab and control, no conditional cards')

rbac2 = over(header('Kitchen lights', '', 'Dashboards', tools()) + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=18) for i, n, t in [('Lightbulb', 'Kitchen', 'w'), ('Lock', 'Front door', 'g'), ('Cctv', 'Cameras', 'e')]]),
              '<div style="position:absolute;left:300px;top:250px;animation:pop .25s both">' + menu([('Pencil', 'Edit'), ('AccountLock', 'Who can see this…'), ('History', 'History'), '-', ('EyeOff', 'Hide for Kids')], 'Front door') + '</div>')
page_board('RRolesInline', 'Who can see this, from any card', EV, rbac2, active='Overview', caption='Right-click any card or tab: Who can see this, and a one-tap Hide for a role')

room = (header('Rooms', 'Made for you, no YAML', 'Dashboards', row(seg(['Phone', 'Wall tablet', 'Desktop'], 1), tools(), gap=10))
        + grid(3, *[card(row(ico(i, t), f'<b class="h3 grow">{n}</b>', f'<span class="sm mu">{temp}</span>'), row(*[chip(c, k == 0) for k, c in enumerate(cs)], gap=6, style='flex-wrap:wrap'), pad=18) for i, n, temp, cs, t in
                    [('Sofa', 'Living room', '21°', ['3 lights on', 'TV', 'Blinds'], 'p'), ('FoodForkDrink', 'Kitchen', '22°', ['1 light on', 'Kettle'], 'w'), ('Bed', 'Bedroom', '19°', ['Lights off', 'Fan'], 't'),
                     ('Shower', 'Bathroom', '23°', ['Fan off'], 'g'), ('Garage', 'Garage', '9°', ['Door closed'], 'n'), ('Tree', 'Garden', '4°', ['Sprinkler off'], 'g')]])
        + '<div style="height:14px"></div>' + note('Built from your areas. New devices appear in their room by themselves.', 'p', 'AutoFix'))
page_board('RRoomFirst', 'Room-first layouts', EV, room, active='Overview', caption='Room-first: every area becomes a room card automatically, ready for phone and wall tablet')

# ---------------- Phone ----------------
ph1 = phone(note('Safe editing: the room stays as it is.', 't', 'ShieldCheck') + bulb('Sofa lamp', 1, 40, changed=True) + bulb('Ceiling', 0, 0), 'Evening scene', 'Settings', back=True)
ph2 = phone(search('kitchen', w=330) + card(gutter.replace('width:28px', 'width:20px'), pad=10, gap=0, style='overflow:hidden'), 'Raw editor', 'Home', back=True,
            sheet=sh(field('Replace with', 'galley'), row(btn('Replace', 'out'), btn('Replace all', 'fill'), gap=8)))
ph3 = phone(trig('MapMarker', 'Person', 'Alex arrives', 'Away', 'p', False) + trig('WeatherSunset', 'Sun', 'Below horizon', 'Yes', 'w', True), 'Arrive home', 'Settings', back=True)
phone_board('RPhoneWorkflow', 'Scenes, raw editor and live states on a phone', PH, [ph1, ph2, ph3], caption='On a phone: safe scene editing, the find bar with replace in a sheet, live states on every step')
ph4 = phone(grid(2, card(ico('Sofa', 'p'), '<b>Living room</b>', pad=14), card(ico('Bed', 't'), '<b>Bedroom</b>', pad=14), gap=10), 'Home', 'Home',
            sheet=sh('<b class="h3">Living room</b>', bulb('Ceiling', 1, 60), row(chip('Movie', True), chip('Off'), gap=6)))
ph5 = phone(card(ring(68, '2.4 GB', 'p', 120), pad=14, style='align-items:center') + bars([38, 21, 12], 'p', 140, ['power', 'energy', 'door']), 'Storage', 'Settings', back=True)
ph6 = phone(''.join([card(row(ico(i, t, 32, 10, 16), f'<b class="grow">{n}</b>'), seg(['Hidden', 'View', 'Use'], v), pad=12, gap=8) for i, n, v, t in [('ViewDashboard', 'Energy', 0, 'g'), ('Lock', 'Front door', 1, 'w')]]), title='Kids can…', active='Settings', back=True)
phone_board('RPhoneMore', 'Pop-ups, storage and roles on a phone', PH, [ph4, ph5, ph6], caption='On a phone: pop-ups as sheets, storage as a ring and bars, role choices per item')


# ---------------- Automation editor (more) ----------------
fast = (header('Front door routine', '650 lines · fast mode', 'Settings › Automations', row(seg(['Simple', 'Advanced', 'YAML'], 1), btn('Save', 'fill', 'ContentSave'), tools(), gap=10))
        + grid('minmax(0,1.4fr) minmax(0,1fr)', col(*[card(row(ico(i, t, 32, 10, 16), f'<b class="grow">{n}</b>', f'<span class="sm mu">{d}</span>', I('ChevronRight', 18)), pad=12) for i, n, d, t in
                                                     [('SourceBranch', 'Choose: who is home', '42 steps, folded', 'w'), ('Lightbulb', 'Hall lights', '3 steps', 'g'), ('Lock', 'Lock up', '12 steps, folded', 'p'), ('Bell', 'Notify', '2 steps', 'e')]],
                                                 '<span class="sm mu" style="text-align:center">Only what is on screen is drawn. 612 more steps load as you scroll.</span>', gap=8),
               card(stats(('4%', 'CPU while editing', 'g', 'Speedometer'), ('38 ms', 'To open', 'p', 'TimerOutline')), row('<b class="grow">Fold big branches automatically</b>', switch(1)), row('<b class="grow">Fast mode above 200 steps</b>', switch(1)), title='Fast mode')))
addbar = row(btn('Add trigger', 'fill', 'Plus'), btn('Add condition', 'fill', 'Plus'), btn('Add action', 'fill', 'Plus'), gap=8)
ins = '<div class="row" style="justify-content:center;margin:-2px 0"><span class="row" style="gap:6px;padding:4px 12px;border-radius:999px;border:1.5px dashed var(--p);color:var(--p);font-size:13px;animation:breathe 2.4s infinite">' + I('Plus', 16) + 'Add a step here</span></div>'
adds = (header('Arrive home', 'Adding steps', 'Settings › Automations', row(btn('Save', 'fill', 'ContentSave'), tools(), gap=10))
        + addbar + '<div style="height:14px"></div>'
        + grid('minmax(0,1.4fr) minmax(0,1fr)', col(card(row(ico('MapMarker', 'p', 32, 10, 16), '<b class="grow">Alex arrives home</b>'), pad=12), ins,
                                                    card(row(ico('WeatherSunset', 'w', 32, 10, 16), '<b class="grow">Sun is below the horizon</b>'), pad=12), ins,
                                                    card(row(ico('Lightbulb', 'g', 32, 10, 16), '<b class="grow">Hall lights on</b>'), pad=12), gap=6),
               card(*[row(f'<span class="kbd">{k}</span>', f'<span class="sm">{d}</span>', gap=10) for k, d in [('T', 'Add a trigger'), ('C', 'Add a condition'), ('A', 'Add an action'), ('Ctrl Shift F', 'Add anything by name')]],
                    note('Starting points fold into one row on a phone, so the Add buttons are never more than a glance away.', 'p', 'GestureSwipeHorizontal'), title='Also by keyboard', gap=10)))
page_board('RAutoAdd', 'Adding a trigger, condition or action', AU, adds, caption='Adding steps: Add trigger, condition and action always at the top, a plus between any two steps, and keys T, C and A')

page_board('RAutoFast', 'A fast editor for very large automations', AU, fast, caption='Large automations: big branches fold, only visible steps are drawn, CPU stays low; Simple, Advanced and YAML modes')

grp = (header('Front door routine', 'Triggers in groups', 'Settings › Automations', tools())
       + grid(2, *[card(row(I('FolderOutline', 20), f'<b class="grow">{g}</b>', pill(f'{len(items)} triggers'), ib('ChevronDown')), *[row(ico(i, t, 30, 10, 15), f'<span class="sm">{n}</span>') for i, n, t in items], title=None, pad=16, gap=10) for g, items in
                   [('Arriving', [('MapMarker', 'Alex arrives home', 'p'), ('MapMarker', 'Sam arrives home', 'p'), ('Doorbell', 'Doorbell pressed', 'w')]), ('Leaving', [('MapMarkerOff', 'Everyone leaves', 'e'), ('Alarm', 'Alarm armed away', 'e')])]])
       + '<div style="height:14px"></div>' + row(btn('New group', 'ton', 'FolderPlus'), btn('Group selected', 'txt', 'FolderMove'), gap=8))
page_board('RAutoGroups', 'Trigger groups', AU, grp, caption='Trigger groups: triggers in named folders that fold, built by selecting and grouping')

rel = (header('How it connects', 'Front door routine', 'Settings › Automations', tools())
       + '<div style="position:relative;height:440px;border-radius:24px;background:radial-gradient(var(--s3) 1.2px,transparent 1.2px) 0 0/22px 22px,var(--s1)">'
       + '<svg style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">'
       + ''.join(f'<path d="{d}" fill="none" stroke="var(--{c})" stroke-width="3" style="stroke-dasharray:600;--len:600;animation:draw 1s {k * 120}ms both"/>' for k, (d, c) in enumerate([('M250 80 C 340 80, 340 200, 420 200', 'p'), ('M250 200 L 420 200', 'p'), ('M250 320 C 340 320, 340 200, 420 200', 'w'), ('M660 200 C 720 200, 720 120, 780 120', 'ok'), ('M660 200 C 720 200, 720 300, 780 300', 'ok')]))
       + '</svg>'
       + ''.join(f'<div class="card" style="position:absolute;left:{x}px;top:{y}px;width:220px;padding:12px;animation:pop .4s {k * 80}ms both">{row(ico(i, t, 32, 10, 16), f"<b>{n}</b>")}</div>' for k, (x, y, i, n, t) in enumerate(
           [(30, 50, 'MapMarker', 'Alex arrives', 'p'), (30, 170, 'MapMarker', 'Sam arrives', 'p'), (30, 290, 'Doorbell', 'Doorbell', 'w'), (420, 170, 'SourceBranch', 'Who is home?', 'w'), (780, 90, 'Lightbulb', 'Hall lights', 'g'), (780, 270, 'Lock', 'Unlock', 'g')]))
       + '</div>' + '<div style="height:12px"></div>' + note('Select a trigger to see every step it can reach.', 'p', 'GestureTap'))
page_board('RAutoRelations', 'Relationships between triggers and steps', AU, rel, caption='Relationships: which triggers feed which branch and what each can reach')

modes = (header('New automation', '', 'Settings › Automations', tools())
         + grid(3, *[card(ico(i, t, 56, 18, 28), f'<b class="h3">{n}</b>', f'<span class="sm mu">{d}</span>', btn('Use this', 'ton' if not s else 'fill'), pad=20, style='border:2px solid var(--p)' if s else '') for i, n, d, s, t in
                     [('Stairs', 'Simple', 'One question at a time: when, if, then. Made for a first automation.', 0, 't'), ('ViewList', 'Advanced', 'Every step at once, with groups, live states and the trace.', 1, 'p'), ('CodeBraces', 'YAML', 'A big editor with search, line numbers and its shortcuts.', 0, 'w')]])
         + '<div style="height:14px"></div>' + note('Switch any time. Each automation remembers its mode.', 'p', 'SwapHorizontal'))
page_board('RAutoModes', 'Simple and advanced modes', AU, modes, caption='Modes: Simple for beginners, Advanced for power users, YAML for the big view')

# ---------------- Performance (more) ----------------
perf = (header('Why is it slow?', 'Home dashboard on this iPad', 'Settings › System › Performance', row(btn('Run again', 'ton', 'Refresh'), tools(), gap=10))
        + stats(('0.8 s', 'To show the first cards', 'g', 'TimerOutline'), ('3.1 s', 'Until every card is ready', 'w', 'Timer'), ('Healthy', 'Offline cache', 'g', 'CloudCheck'))
        + '<div style="height:16px"></div>'
        + lst([('Cctv', 'Camera card loads its stream at once', '1.9 s · load it only when scrolled to', btn('Fix', 'ton', size='sm'), 'w'), ('ChartLine', 'History graph asks for 30 days', '0.6 s · 7 days is enough here', btn('Fix', 'ton', size='sm'), 'w'),
               ('CheckCircle', 'Cards below the fold wait until scrolled to', 'Lazy loading is on', '', 'g')], 'What slowed it down'))
page_board('RPerfLoad', 'Dashboard load diagnostics', PF, perf, caption='Diagnostics: what slowed this dashboard on this device, each with a Fix')

sw = (header('Offline cache', 'The app on this device', 'Settings › System › Performance', tools())
      + grid(2, card(row(ico('CloudCheck', 'g'), col('<b>Working</b>', '<span class="sm mu">Version 2026.11.137 · 14 MB</span>', gap=0)), kv([('Last updated', 'Today 21:02'), ('Stalls this week', '0')]), title='Status'),
             card(note('If the app ever shows a blank page for a long time, this resets the cache without signing you out.', 'p', 'InformationOutline'), btn('Reset the cache and reload', 'fill', 'Restore'), title='Repair')))
page_board('RPerfWorker', 'Offline cache health and repair', PF, sw, caption='Offline cache: its health, stalls counted, and a one-tap repair for blank pages')

# ---------------- Dashboard editing ----------------
ms = over(header('Home', 'Editing · 3 selected', 'Dashboards', tools())
          + '<div style="position:relative">' + grid(4, *[card(ico(i, t), f'<b>{n}</b>', pad=16, style='outline:3px solid var(--p);outline-offset:2px' if s else '') for i, n, s, t in
                                                         [('Lightbulb', 'Kitchen', 1, 'w'), ('Thermostat', 'Hall', 1, 'p'), ('Television', 'TV', 0, 't'), ('Lock', 'Front door', 1, 'g'), ('Fan', 'Fan', 0, 'p'), ('Blinds', 'Blinds', 0, 'w')]])
          + '<div style="position:absolute;left:-10px;top:-10px;width:66%;height:240px;border:2px dashed var(--p);background:color-mix(in srgb,var(--p) 8%,transparent);border-radius:12px;animation:fade .6s both"></div></div>',
          actionbar(abtn('Copy', 'ContentCopy'), abtn('Duplicate', 'ContentDuplicate'), abtn('Move to view', 'ArrowRightBold'), abtn('Style', 'Palette'), abtn('Delete', 'Delete'), note='3 cards · Shift drag or Ctrl click'))
page_board('RMultiSelect', 'Select many cards at once', DE, ms, active='Overview', caption='Multi-select: draw a box or Ctrl click, then copy, duplicate, move, style or delete together')

clip = (header('Paste cards', 'From your clipboard, any tab', 'Dashboards', tools())
        + grid('minmax(0,1fr) minmax(0,1.2fr)', lst([('CardMultiple', '3 cards from Home', 'Copied 2 min ago · other tab', btn('Paste', 'fill', size='sm'), 'p'), ('CardOutline', 'Energy summary', 'Yesterday', btn('Paste', 'ton', size='sm'), 'g')], 'Clipboard'),
               card(field('Paste into', 'Kitchen view'), field('Section', 'New section'), row('<b class="grow">Keep their styles</b>', switch(1)), title='Where')))
page_board('RClipboard', 'A clipboard shared between tabs', DE, clip, active='Overview', caption='Clipboard: copied cards survive across tabs and reloads, with a history to paste from')

dup = over(header('Dashboards', '6', 'Settings › Dashboards', tools()) + lst([('ViewDashboard', 'Home', '5 views', ib('DotsVertical'), 'p'), ('LightningBolt', 'Energy', '2 views', ib('DotsVertical'), 'g')]),
           dialog('Duplicate "Home"', col(field('New name', 'Home, guest copy'), seg(['Whole dashboard', 'One view'], 0), row('<b class="grow">Keep the same entities</b>', switch(1)), row('<b class="grow">Open it when done</b>', switch(1))),
                  'ContentDuplicate', 'p', actions=btn('Cancel', 'txt') + btn('Duplicate', 'fill')))
page_board('RDuplicate', 'Duplicate views and dashboards', DE, dup, caption='Duplicate: a whole dashboard or one view, in one step')

dl = (header('All my dashboards', 'A section that lists itself', 'Dashboards', tools())
      + grid(4, *[card(f'<div class="thumb" style="height:100px">{I(i, 34)}</div>', f'<b>{n}</b>', f'<span class="sm mu">{v}</span>', pad=14) for i, n, v in
                  [('Home', 'Home', '5 views'), ('LightningBolt', 'Energy', '2 views'), ('Cctv', 'Cameras', '1 view'), ('HumanChild', 'Kids room', '1 view')]])
      + '<div style="height:14px"></div>' + grid(2, note('New dashboards appear here by themselves.', 'p', 'AutoFix'),
                                                 card(row(ico('GestureSwipeHorizontal', 'p', 36, 12, 18), col('<b>Swipe left or right to change dashboard</b>', '<span class="sm mu">On phones and tablets. Turn it off if it gets in the way of sliders or maps.</span>', gap=2, style='flex:1'), switch(1)), pad=14), gap=12))
page_board('RDashList', 'An automatic list of dashboards, and swiping between them', DE, dl, active='Overview', caption='Dashboards section: lists every dashboard by itself; swipe to switch on a phone')

# ---------------- Cards (more) ----------------
lt = (header('Kitchen light', 'Light card', 'Dashboards', tools(), tabs=(['Content', 'Style', 'Interactions', 'Visibility'], 0))
      + grid(2, card(row('<b class="grow">Brightness slider</b>', switch(1)), row('<b class="grow">Colour temperature slider</b>', switch(1)), field('Slider style', 'Thick, full width'), title='Light card'),
             card(f'<div class="card col" style="padding:20px;gap:12px;animation:pop .5s both">{row(ico("Lightbulb", "w"), "<b class=h3 style=flex:1>Kitchen</b>", "<b>72%</b>")}{slider(72, "w")}<div style="height:14px;border-radius:7px;background:linear-gradient(90deg,#ffb46b,#fff,#bcd7ff)"></div></div>', title='Preview')))
page_board('RLightSlider', 'A brightness slider on the light card', CA, lt, active='Overview', caption='Light card: brightness and colour temperature sliders right on the card')

en = (header('Energy', 'Colours', 'Energy', tools())
      + grid('minmax(0,1.3fr) minmax(0,1fr)', card(row('<b class="grow">Follow the theme colours</b>', switch(1)), *[row(f'<span class="grow">{n}</span>', palette(['var(--p)', '#e8735a', '#2e9e88', '#e0a32a'], s, n == 'Car'), gap=6) for n, s in [('Solar', 3), ('Grid', 0), ('Heat pump', 1), ('Car', 2)]], title='Per device', gap=12),
             card('<div class="row" style="gap:18px;align-items:flex-end;height:220px">' + ''.join(f'<div class="col" style="flex:1;gap:6px;align-items:center"><span style="width:100%;height:{h}px;border-radius:12px 12px 6px 6px;background:{c};transform-origin:bottom;animation:barup .7s {k * 80}ms both"></span><span class="xs mu">{n}</span></div>' for k, (h, c, n) in enumerate([(180, '#e0a32a', 'Solar'), (130, 'var(--p)', 'Grid'), (110, '#e8735a', 'Heat pump'), (70, '#2e9e88', 'Car')])) + '</div>', title='Today')))
page_board('REnergyColours', 'Energy colours from the theme, or per device', CA, en, active='Energy', caption='Energy: colours follow the theme, or pick one per device')

cp = over(header('Kitchen tile', 'Edit card', 'Dashboards', tools(), tabs=(['Content', 'Style', 'Interactions', 'Visibility'], 1)) + card(row('<span class="grow">Icon colour</span>', palette(['var(--p)', '#e8735a', '#2e9e88', '#e0a32a'], None, True), gap=8), pad=16),
          '<div class="dlg" style="width:600px;position:absolute;right:60px;top:120px;animation:pop .3s both">'
          + row('<b class="h3 grow">Any colour</b>', ib('Eyedropper'), ib('Close'))
          + '<div style="height:220px;border-radius:18px;position:relative;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,#e8735a)"><span style="position:absolute;left:62%;top:28%;width:22px;height:22px;border-radius:11px;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></span></div>'
          + f'<div style="height:18px;border-radius:9px;background:linear-gradient(90deg,red,#ff0,lime,cyan,blue,#f0f,red);position:relative"><span style="position:absolute;left:3%;top:-3px;width:24px;height:24px;border-radius:12px;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></span></div>'
          + '<div style="height:18px;border-radius:9px;background:linear-gradient(90deg,transparent,#e8735a),repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/12px 12px"></div>'
          + grid(4, field('HEX', '#E8735A'), field('RGB', '232 115 90'), field('HSL', '11° 75% 63%'), field('OKLCH', '0.68 0.14 37'), gap=8)
          + row('<span class="lbl" style="width:70px">Recent</span>', *[swatch(c) for c in ['#e8735a', '#2e9e88', '#7b61ff', '#e0a32a', '#1f6feb']], gap=8)
          + row('<span class="lbl" style="width:70px">Theme</span>', *[swatch(f'var({v})') for v in ['--p', '--t', '--e', '--w', '--ok']], gap=8)
          + row('<span class="grow sm mu">Paste or type any colour: names, hex, rgb, hsl, oklch.</span>', btn('Use', 'fill'), gap=8) + '</div>')
page_board('RColourPicker', 'The rainbow opens the infinite colour picker', CA, cp, active='Overview', caption='Every colour row ends with the rainbow: it opens the infinite picker with a colour field, the full rainbow, opacity, every format, recent and theme colours, and an eyedropper')

# ---------------- Wall tablets and the phone app ----------------
kiosk = (header('Wall tablet mode', 'Hall iPad', 'Settings › Devices', row(btn('Turn on', 'fill', 'Tablet'), tools(), gap=10))
         + grid(3, card(field('Screensaver after', '2 minutes'), field('Shows', 'Clock, dimmed'), row('<b class="grow">Shift pixels to prevent burn-in</b>', switch(1)), title='Screensaver'),
                card(row('<b class="grow">Lock navigation</b>', switch(1)), row('<b class="grow">Hide the sidebar and header</b>', switch(1)), field('Exit with', 'PIN, hold the corner 3 s'), title='Lockdown'),
                card(row('<b class="grow">Wake on motion</b>', switch(1)), field('Motion from', 'binary_sensor.hall_motion'), row('<b class="grow">Reconnect by itself</b>', switch(1)), title='Wake and stay connected')))
page_board('RKiosk', 'Built-in wall tablet mode', WT, kiosk, caption='Wall tablet mode: screensaver against burn-in, navigation lockdown with a PIN exit, wake on motion')

kr = (header('Wall tablets', '3 tablets', 'Settings › Devices', tools())
      + table(['Tablet', 'Screen', 'Connection', ''], [[f'<b>{a}</b>', pill(b, bt), live(c) if c == 'Online' else pill(c, 'e'), row(btn('Wake', 'txt', size='sm'), btn('Sleep', 'txt', size='sm'), btn('Reload', 'txt', size='sm'))] for a, b, bt, c in
                                                     [('Hall iPad', 'Screensaver', 'n', 'Online'), ('Kitchen tablet', 'On', 'g', 'Online'), ('Garage tablet', 'Off', 'n', 'Offline 2 h')]], ['1.2fr', '1fr', '1fr', '1.4fr'])
      + '<div style="height:14px"></div>' + note('Each tablet also has actions for automations: wake at sunrise, sleep at night.', 'p', 'Robot'))
page_board('RKioskRemote', 'Wake, sleep and reload tablets from anywhere', WT, kr, caption='Tablets: remote wake, sleep and reload, with actions for automations')

wd = phone(card(row(ico('CartOutline', 'p', 32, 10, 16), '<b class="grow">Shopping list</b>', ib('Plus')), *[row(I('CheckboxBlankOutline', 20), x) for x in ['Bok choy', 'Rice', 'Soy sauce']], pad=14, gap=8)
           + card(row(ico('LightningBolt', 'g', 32, 10, 16), '<b class="grow">Energy, last 7 days</b>'), bars([5, 7, 6, 8, 4, 6, 7], 'g', 80), pad=14, gap=8)
           + card(row(ico('Lightbulb', 'w', 32, 10, 16), '<b class="grow">Any card: Kitchen</b>', switch(1)), pad=14), 'Widgets', 'Home', top=False)
wd2 = phone(card(row(ico('Car', 'p', 36, 12, 18), col('<b>Garage door is open</b>', '<span class="sm mu">From Home Assistant</span>', gap=0, style='flex:1')), row(btn('Close it', 'fill'), btn('Ignore', 'txt')), pad=16)
            + note('Notifications and their actions also appear in CarPlay and Android Auto.', 'p', 'Car'), 'In the car', 'Home', top=False)
wd3 = phone('<div style="height:420px;border-radius:24px;background:var(--s2);display:grid;place-items:center;opacity:.6">Dashboard, last seen 21:02</div>' + note('Offline. Showing the last dashboard until the connection is back.', 'w', 'CloudOffOutline'), 'Home', 'Home')
phone_board('RWidgets', 'Widgets, the car and offline', WT, [wd, wd2, wd3], caption='Phone app: widgets for any card, a to-do list and a 7-day energy view; actions in the car; the dashboard stays behind an offline banner')

# ---------------- Setup forms ----------------
cols = (header('Add Weather station', 'Step 2 of 3', 'Settings › Integrations', tools()) + steps(['Connect', 'Options', 'Finish'], 1) + '<div style="height:16px"></div>'
        + card(grid(2, field('Host', '192.168.1.40'), field('Port', '8080'), field('Units', 'Metric'), field('Update every', '60 s'), gap=12),
               f'<div class="row" style="gap:8px;padding:12px 0;border-top:1px solid var(--out)">{I("ChevronRight", 20)}<b>Advanced</b><span class="sm mu">5 options, folded</span></div>',
               row(btn('Back', 'txt'), '<span class="grow"></span>', btn('Next', 'fill')), title='Options'))
page_board('RSetupColumns', 'Setup forms with two columns and folding sections', SF, cols, caption='Setup forms: a step indicator, two fields side by side, advanced options folded away')

cond = (header('Add Weather station', 'Step 2 of 3', 'Settings › Integrations', tools())
        + grid(2, card(seg(['Local', 'Cloud'], 1), field('API key', '••••••••'), note('Local fields are hidden while Cloud is chosen.', 'p', 'EyeOff'), title='Only what applies'),
               card(field('Host', '192.168.1.4', 'AlertCircle'), '<span class="sm" style="color:var(--e)">No answer from this address. Check the station is on.</span>', btn('Try again', 'ton', 'Refresh'), title='Checked as you type')))
page_board('RSetupConditional', 'Fields that show only when they apply', SF, cond, caption='Conditional fields: only the options that apply, checked as you type')

# ---------------- Entities, devices and accessibility ----------------
pick = (header('Choose an entity', 'Works with a keyboard and a screen reader', 'Automations', tools())
        + grid('minmax(0,1.3fr) minmax(0,1fr)', card(search('kitchen', w=420), lst([('Lightbulb', 'Kitchen light', 'light.kitchen', '', 'w'), ('Thermometer', 'Kitchen temperature', 'sensor.kitchen_temperature', '', 'e')]),
                                                     row('<span class="kbd">↑ ↓</span>', '<span class="sm mu">move</span>', '<span class="kbd">Enter</span>', '<span class="sm mu">choose</span>', '<span class="kbd">Esc</span>', '<span class="sm mu">close</span>', gap=8), pad=16, style='outline:3px solid var(--p);outline-offset:3px'),
               card(code('combobox "Choose an entity", expanded\noption "Kitchen light, light, Kitchen", 1 of 2, selected'), title='What a screen reader hears')))
page_board('RPicker', 'An accessible entity picker', EA, pick, caption='Entity picker: labelled, fully keyboard driven, and announced properly to screen readers')

nt = (header('Hall motion sensor', 'Device', 'Settings › Devices', tools())
      + grid('minmax(0,1fr) minmax(0,1.2fr)', card(kv([('Model', 'Aqara P1'), ('Battery', 'CR2450'), ('Added', '3 March')]), title='Device'),
             card('<div class="onv" style="padding:14px;border-radius:16px;background:var(--wc);line-height:1.6">Mounted above the coat rack, 2 m up.<br>Battery changed 12 Oct.<br>Manual: aqara.com/p1</div>', row(btn('Edit notes', 'ton', 'Pencil'), pill('Searchable', 't')), title='Notes')))
page_board('RDeviceNotes', 'Notes on devices and entities', EA, nt, caption='Notes: installation, battery and manual links on any device or entity, found by search')

kb = over(header('Raw configuration editor', '', 'Dashboards', tools()) + card(code('views:\n  - title: Home'), pad=14),
          dialog('Keyboard shortcuts', grid(2, *[row(f'<span class="kbd">{k}</span>', f'<span class="sm">{d}</span>', gap=10) for k, d in [('Ctrl F', 'Find'), ('Ctrl H', 'Replace'), ('Ctrl G', 'Go to line'), ('Ctrl /', 'Comment'), ('Alt ↑', 'Move line up'), ('Ctrl S', 'Save'), ('Ctrl Shift F', 'Command palette'), ('?', 'This list')]], gap=10),
                 'Keyboard', 'p', w=560, actions=btn('Close', 'txt')))
page_board('RShortcuts', 'Keyboard shortcuts in the YAML editor', EA, kb, active='Overview', caption='Shortcuts: press ? in any editor for the full list')

# ---------------- Customisation ----------------
sb = (header('Sidebar', 'Your own labels', 'Settings › Personal', tools())
      + grid(2, table(['Item', 'Label'], [[row(I(i, 18), n, gap=8), f'<b>{l}</b>'] for i, n, l in [('Home', 'Overview', 'Home'), ('LightningBolt', 'Energy', 'Power'), ('HammerWrench', 'Developer tools', 'Dev')]], ['1fr', '1fr']),
             card(row('<b class="grow">Show Developer tools in the sidebar</b>', switch(1)), row('<b class="grow">Swipe left or right to change dashboard</b>', switch(1)), field('Default history tab', 'By entity'), title='Defaults')))
page_board('RSidebar', 'Sidebar labels and defaults', CU, sb, caption='Sidebar: rename any item, keep Developer tools on it, and pick default tabs')

lq = (header('Links and the quick bar', '', 'Settings › Personal', tools())
      + grid(2, card(seg(['Same tab', 'New tab', 'Ask'], 1), '<span class="sm mu">For links that leave Home Assistant.</span>', title='Outside links'),
             card(lst([('Pin', 'Restart Home Assistant', 'Pinned', '', 'p'), ('Pin', 'Kitchen light', 'Pinned', '', 'w'), ('History', 'Energy', 'Recent', '', 'n')]), title='Quick bar remembers')))
page_board('RLinks', 'Outside links in a new tab, and a quick bar that remembers', CU, lq, caption='Links open where you choose; the quick bar keeps pins and recent items')

dk = (header('Dark mode check', '2 problems', 'Settings › Appearance', tools())
      + lst([('Contrast', 'Energy legend text', '2.9:1 in dark mode · needs 4.5:1', btn('Fix', 'ton', size='sm'), 'e'), ('Contrast', 'Map labels', '3.6:1 · needs 4.5:1', btn('Fix', 'ton', size='sm'), 'w'), ('CheckCircle', 'Every other text', 'Readable', '', 'g')], 'Text checked in dark mode'))
page_board('RDarkCheck', 'A dark mode readability check', CU, dk, dark=True, caption='Dark mode check: finds text that is hard to read in dark mode and fixes it')

ph7 = phone(grid(2, card(ico('Home', 'p'), '<b>Home</b>', pad=12), card(ico('LightningBolt', 'g'), '<b>Energy</b>', pad=12), gap=10) + note('Swipe left or right to change dashboard.', 'p', 'GestureSwipeHorizontal'), 'Dashboards', 'Home')
ph7b = phone(card(row(ico('GestureSwipeHorizontal', 'p', 32, 10, 16), col('<b>Swipe between dashboards</b>', '<span class="xs mu">Off: only the Dashboards list changes dashboard</span>', gap=0, style='flex:1'), switch(0)), pad=14)
             + note('Swiping is off. Sliders, maps and charts get every swipe.', 'w', 'GestureSwipeHorizontal'), 'Personal settings', 'Settings', back=True)
ph8 = phone(card(kv([('Battery', 'CR2450'), ('Added', '3 March')]), pad=14) + card('<div style="line-height:1.6">Mounted above the coat rack.<br>Battery changed 12 Oct.</div>', pad=14), 'Hall motion', 'Settings', back=True)
ph9 = phone(card(field('Host', '192.168.1.40'), field('Port', '8080'), pad=14) + '<div class="row" style="gap:8px">' + I('ChevronRight', 20) + '<b>Advanced</b></div>', 'Add Weather station', 'Settings', back=True)
phone_board('RPhoneSwipe', 'Swiping between dashboards, and turning it off', PH, [ph7, ph7b], caption='On a phone: swipe between dashboards, or turn swiping off in Personal settings so sliders and maps get every swipe')
phone_board('RPhoneEditing', 'Device notes and setup on a phone', PH, [ph8, ph9], caption='On a phone: device notes, and setup forms that stack to one column')

phone_name = WORDS.get('phone_page', 'On a phone')
write_index('Home Assistant Material, modern: Community requests', [
    (SC, 'Scenes and the raw configuration editor'), (AU, 'Automation editor'), (PF, 'Performance and storage'), (DE, 'Dashboard editing'), (CA, 'Cards'),
    (EV, 'Dashboards for everyone'), (WT, 'Wall tablets and the phone app'), (SF, 'Setup forms'), (EA, 'Entities, devices and accessibility'), (CU, 'Customisation'), (PH, phone_name)], 'RSceneSafe')
