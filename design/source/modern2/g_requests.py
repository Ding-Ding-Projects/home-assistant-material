"""Modern remake, group 8: the most requested community features."""
from ui import *

begin('requests')
P1, P2, P3, P4 = 'workflow', 'styling', 'people', 'phone'
grab = '<div style="width:40px;height:4px;border-radius:2px;background:var(--out);margin:0 auto 12px"></div>'
sh = lambda *parts: f'<div class="sheet"><div class="col" style="gap:10px">{grab}' + ''.join(parts) + '</div></div>'


def swatch(c, sel=False):
    ring = 'outline:3px solid var(--p);outline-offset:2px;' if sel else ''
    return f'<span style="width:28px;height:28px;border-radius:14px;background:{c};{ring}flex:none"></span>'


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
page_board('RSceneSafe', 'Non-destructive scene editing', P1, scene, caption='Scenes: edit states on paper, the room stays as it is until Preview or Apply')

scenep = over(header('Evening scene', '', 'Settings › Scenes', tools()) + col(bulb('Sofa lamp', 1, 40, changed=True), bulb('Ceiling', 0, 0), gap=10),
              dialog('Preview in the room?', col(note('The lights will change for 30 seconds, then go back to how they are now.', 'w', 'TimerSand'), field('Preview length', '30 seconds'), row('<b class="grow">Go back afterwards</b>', switch(1))),
                     'Eye', 't', actions=btn('Cancel', 'txt') + btn('Preview', 'fill')))
page_board('RScenePreview', 'Scene preview with automatic restore', P1, scenep, caption='Preview: a timed try in the room that puts everything back afterwards')

raw_lines = ['views:', '  - title: Home', '    cards:', '      - type: tile', '        entity: light.kitchen', '      - type: tile', '        entity: light.kitchen_counter', '      - type: history-graph', '        entities:', '          - sensor.kitchen_temperature']
hit = {4, 6, 9}
gutter = ''.join(f'<div class="row" style="gap:14px;height:24px;{"background:color-mix(in srgb,var(--w) 22%,transparent);border-radius:6px" if i in hit else ""}"><span class="mono sm mu" style="width:28px;text-align:right">{i + 1}</span><span class="mono sm" style="white-space:pre">{e(l)}</span></div>' for i, l in enumerate(raw_lines))
raw = (header('Raw configuration editor', 'Home dashboard', 'Dashboards', row(btn('Save', 'fill', 'ContentSave'), tools(), gap=10))
       + card(row(search('kitchen', w=300), field('Replace with', 'galley'), btn('Pattern', 'ton', 'Regex'), chip('Match case'), chip('Whole word', True), '<span class="sm mu">3 of 3</span>', btn('Replace', 'out'), btn('Replace all', 'fill'), gap=8, style='flex-wrap:wrap'), pad=14)
       + '<div style="height:12px"></div>' + card(gutter, pad=14, gap=0)
       + '<div style="height:12px"></div>' + row(pill('Line 5, column 17'), pill('YAML valid', 'g'), btn('Go to line', 'txt', 'FormatListNumbered'), gap=8))
page_board('RRawSearch', 'Search and replace in the raw configuration editor', P1, raw, active='Overview', caption='Raw editor: find bar with the pattern workbench, replace one or all, line numbers and Go to line')

rawe = (header('Replace entity everywhere', 'light.kitchen → light.galley', 'Dashboards', tools())
        + grid(2, card(code('-        entity: light.kitchen\n+        entity: light.galley'), '<span class="sm mu">Whole entity ids only: light.kitchen_counter is left alone.</span>', title='Preview the change'),
               card(lst([('CardOutline', 'Tile: Kitchen', 'Line 5', I('CheckboxMarked', 22), 'w'), ('ChartLine', 'History graph', 'Line 10 · not a match', I('CheckboxBlankOutline', 22), 'n')]), btn('Replace 1', 'fill'), title='Where')))
page_board('RRawEntity', 'Swap an entity id safely', P1, rawe, active='Overview', caption='Entity swap: a whole-id match with a diff preview before saving')

def trig(icon, kind, text, state, t, ok):
    return card(row(ico(icon, t, 36, 12, 18), col(f'<span class="lbl">{kind}</span>', f'<b>{text}</b>', gap=0, style='flex:1'),
                    f'<span class="row" style="gap:6px;padding:6px 12px;border-radius:999px;background:var(--{"okc" if ok else "s2"})">{I("CheckCircle" if ok else "CircleOutline", 16)}<span class="sm">{state}</span></span>'), pad=14)
live_auto = (header('Arrive home', 'Live states on', 'Settings › Automations', row(row('<b>Live states</b>', switch(1), gap=8), btn('Save', 'fill', 'ContentSave'), tools(), gap=12))
             + '<span class="lbl">When</span>' + trig('MapMarker', 'Person', 'Alex arrives home', 'Alex: away, 12 km', 'p', False)
             + '<span class="lbl" style="margin-top:12px">And if</span>' + trig('WeatherSunset', 'Sun', 'Sun is below the horizon', 'Below, since 16:48', 'w', True)
             + trig('Lightbulb', 'State', 'Hall light is off', 'Off', 'g', True)
             + trig('Thermometer', 'Numeric', 'Hall below 19 °C', '20.4 °C', 'e', False)
             + '<div style="height:12px"></div>' + note('2 of 3 conditions pass right now. It would not run yet: Alex is still away.', 'w', 'InformationOutline'))
page_board('RLiveStates', 'Live entity states in the automation editor', P1, live_auto, caption='Live states: each trigger and condition shows its entity right now and whether it passes')

stor = (header('Database storage', 'Recorder · 2.4 GB', 'Settings › System › Storage', row(btn('Purge…', 'out', 'Broom'), tools(), gap=10))
        + grid('300px minmax(0,1fr)', card(ring(68, '2.4 GB', 'p', 180), kv([('Rows', '18.2 million'), ('Oldest', '10 days'), ('Growing', '190 MB a day')]), style='align-items:center'),
               card(seg(['Entities', 'Integrations', 'Domains'], 0), bars([38, 21, 12, 8, 6, 4], 'p', 200, ['sensor.power', 'sensor.energy', 'camera.door', 'sensor.rssi', 'weather.home', 'Other']), title='Biggest first')))
page_board('RStorage', 'Database and storage breakdown', P1, stor, caption='Storage: total, growth and the entities taking the most space, biggest first')

stor2 = (header('sensor.power', '912 MB · 38%', 'Settings › System › Storage', tools())
         + grid(2, card(kv([('Changes a day', '86,400'), ('Why so many', 'Updates every second'), ('Kept for', '10 days')]), title='What it costs'),
                card(row('<b class="grow">Keep history</b>', switch(1)), field('Record at most', 'Once a minute'), field('Keep for', '3 days'), note('Saves about 820 MB.', 'g', 'Leaf'), btn('Apply and purge', 'fill'), title='Make it smaller')))
page_board('RStorageEntity', 'One entity: why it is big and how to shrink it', P1, stor2, caption='Storage detail: why an entity is big, with savings shown before applying')

# ---------------- Styling ----------------
style = (header('Kitchen tile', 'Edit card', 'Dashboards', row(btn('Save', 'fill'), tools(), gap=10), tabs=(['Content', 'Style', 'Interactions', 'Visibility'], 1))
         + grid('minmax(0,1fr) minmax(0,1fr)', card(field('Font size', '18 px'), row('<span class="grow">Icon colour</span>', *[swatch(c, i == 1) for i, c in enumerate(['var(--p)', '#e8735a', '#2e9e88', '#e0a32a'])], gap=8),
                                               field('Padding', '20 px'), field('Border', '2 px · outline colour'), field('Corner radius', '24 px'), row(btn('Copy style', 'ton', 'ContentCopy'), btn('Paste', 'txt', 'ContentPaste'), btn('Reset', 'txt')), title='Card style'),
                card(f'<div class="card" style="padding:20px;border:2px solid var(--out);border-radius:24px;animation:pop .5s both">{row(ico("Lightbulb", "e"), "<b style=font-size:18px>Kitchen</b>", "<span class=grow></span>", switch(1))}</div>',
                     note('No code needed. Advanced: the same settings as CSS, for anything not covered.', 'p', 'CodeBraces'), title='Live preview')))
page_board('RCardStyle', 'Native card styling in the visual editor', P2, style, active='Overview', caption='Card styling: font, icon colour, padding, border and radius in the editor, no card-mod')

popup = over(header('Home', '', '', tools()) + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=18) for i, n, t in [('Sofa', 'Living room', 'p'), ('FoodForkDrink', 'Kitchen', 'w'), ('Bed', 'Bedroom', 't')]]),
             f'<div class="dlg" style="width:560px;animation:pop .35s both">{row(ico("Sofa", "p"), "<b class=h2 style=flex:1>Living room</b>", ib("Close"))}'
             + grid(2, bulb('Ceiling', 1, 60), bulb('Lamp', 1, 30), gap=10) + row(chip('Movie', True), chip('Bright'), chip('Off'), gap=8) + '</div>')
page_board('RPopup', 'Interactive pop-up cards', P2, popup, active='Overview', caption='Pop-ups: tap a tile and a room opens as a native pop-up with its own cards')

popcfg = (header('Living room tile', 'Edit card', 'Dashboards', tools(), tabs=(['Content', 'Style', 'Interactions', 'Visibility'], 2))
          + grid(2, card(field('Tap', 'Open a pop-up'), field('Pop-up', 'Living room'), field('Size', 'Medium'), row('<b class="grow">Close when tapping outside</b>', switch(1)), title='Interaction'),
                 card(lst([('CardOutline', 'Ceiling light', 'Tile', ib('DragVertical'), 'w'), ('CardOutline', 'Lamp', 'Tile', ib('DragVertical'), 'w'), ('Palette', 'Scenes', 'Chips', ib('DragVertical'), 'p')]), btn('Add card', 'ton', 'Plus'), title='Pop-up contents')))
page_board('RPopupConfig', 'Building a pop-up', P2, popcfg, active='Overview', caption='Pop-up builder: choose Open a pop-up and fill it with cards, no add-ons')

hg = (header('Energy and temperature', 'History graph', 'Dashboards', tools())
      + grid('minmax(0,1.5fr) minmax(0,1fr)', card('<svg viewBox="0 0 600 240" style="width:100%;height:240px" aria-hidden="true">'
                                                   '<line x1="40" y1="20" x2="40" y2="210" stroke="var(--out)"/><line x1="40" y1="210" x2="590" y2="210" stroke="var(--out)"/>'
                                                   '<text x="10" y="26" font-size="12" fill="var(--mu)">30</text><text x="14" y="214" font-size="12" fill="var(--mu)">10</text>'
                                                   '<path d="M40 150 C 120 120, 200 170, 280 110 S 440 90, 590 130" fill="none" stroke="#e8735a" stroke-width="3" style="stroke-dasharray:900;--len:900;animation:draw 1.4s both"/>'
                                                   '<path d="M40 170 C 120 160, 200 180, 280 150 S 440 140, 590 160" fill="none" stroke="#e8735a" stroke-width="3" stroke-dasharray="6 6" opacity=".5"/>'
                                                   '<path d="M40 90 C 120 100, 200 70, 280 80 S 440 60, 590 70" fill="none" stroke="#2e9e88" stroke-width="3" style="stroke-dasharray:900;--len:900;animation:draw 1.4s .2s both"/></svg>',
                                                   row(pill('Hall · this week', 'e'), pill('Hall · last week, dashed', 'n'), pill('Kitchen', 't'), gap=6), title='Preview'),
             card(grid(2, field('Y axis from', '10'), field('Y axis to', '30'), gap=10), row('<span class="grow">Hall colour</span>', *[swatch(c, i == 0) for i, c in enumerate(['#e8735a', '#2e9e88', '#e0a32a'])], gap=8),
                  row('<b class="grow">Compare with</b>', seg(['None', 'Last week', 'Last year'], 1)), title='Controls')))
page_board('RHistory', 'Custom history graph controls', P2, hg, active='History', caption='History graphs: fixed Y axis, a colour per entity and a dashed earlier period to compare')

# ---------------- Dashboards and people ----------------
deflt = (header('Default dashboard', 'For everyone, set once', 'Settings › Dashboards', tools())
         + grid('minmax(0,1fr) minmax(0,1.2fr)', card(field('Everyone opens', 'Home'), seg(['Everyone', 'Each person'], 0), row('<b class="grow">Phones open</b>', pill('Phone first', 'p')), row('<b class="grow">Wall tablets open</b>', pill('Wall panel', 't')),
                                                    row('<b class="grow">Let people choose their own</b>', switch(1)), title='Admin setting'),
                table(['Person', 'Opens', ''], [[row(avatar(a, t, 30), f'<b>{n}</b>', gap=8), d, pill(s, st)] for a, n, t, d, s, st in [('AL', 'Alex', 'g', 'Home', 'Default', 'n'), ('SK', 'Sam', 'w', 'Energy', 'Own choice', 'p'), ('KD', 'Kids', 'p', 'Kids room', 'Set by admin', 't')]], ['1.3fr', '1fr', '1fr'])))
page_board('RDefault', 'System-wide default dashboards', P3, deflt, caption='Defaults: one admin setting for every person and device, with per-device kinds and overrides')

rbac = (header('Roles', '4 roles', 'Settings › People', row(btn('New role', 'fill', 'Plus'), tools(), gap=10))
        + grid('260px minmax(0,1fr)', lst([('ShieldCrown', 'Admin', '2 people', '', 'p'), ('Account', 'Family', '2 people', '', 'g'), ('HumanChild', 'Kids', '2 people', '', 'w'), ('AccountClock', 'House sitter', 'Until 20 Nov', '', 't')]),
               card(*[row(ico(i, t, 32, 10, 16), f'<span class="grow">{n}</span>', seg(['Hidden', 'View', 'Use'], v)) for i, n, v, t in [('ViewDashboard', 'Energy dashboard', 0, 'g'), ('Lock', 'Front door lock', 1, 'w'), ('Lightbulb', 'Kitchen lights', 2, 'p'), ('Cog', 'Settings', 0, 'n'), ('Tab', 'Cameras tab', 0, 'e')]],
                    title='Kids can…', gap=12)))
page_board('RRoles', 'Granular role-based access', P3, rbac, caption='Roles: hide, view or use for each dashboard, card, tab and control, no conditional cards')

rbac2 = over(header('Kitchen lights', '', 'Dashboards', tools()) + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=18) for i, n, t in [('Lightbulb', 'Kitchen', 'w'), ('Lock', 'Front door', 'g'), ('Cctv', 'Cameras', 'e')]]),
              '<div style="position:absolute;left:300px;top:250px;animation:pop .25s both">' + menu([('Pencil', 'Edit'), ('AccountLock', 'Who can see this…'), ('History', 'History'), '-', ('EyeOff', 'Hide for Kids')], 'Front door') + '</div>')
page_board('RRolesInline', 'Who can see this, from any card', P3, rbac2, active='Overview', caption='Right-click any card or tab: Who can see this, and a one-tap Hide for a role')

room = (header('Rooms', 'Made for you, no YAML', 'Dashboards', row(seg(['Phone', 'Wall tablet', 'Desktop'], 1), tools(), gap=10))
        + grid(3, *[card(row(ico(i, t), f'<b class="h3 grow">{n}</b>', f'<span class="sm mu">{temp}</span>'), row(*[chip(c, k == 0) for k, c in enumerate(cs)], gap=6, style='flex-wrap:wrap'), pad=18) for i, n, temp, cs, t in
                    [('Sofa', 'Living room', '21°', ['3 lights on', 'TV', 'Blinds'], 'p'), ('FoodForkDrink', 'Kitchen', '22°', ['1 light on', 'Kettle'], 'w'), ('Bed', 'Bedroom', '19°', ['Lights off', 'Fan'], 't'),
                     ('Shower', 'Bathroom', '23°', ['Fan off'], 'g'), ('Garage', 'Garage', '9°', ['Door closed'], 'n'), ('Tree', 'Garden', '4°', ['Sprinkler off'], 'g')]])
        + '<div style="height:14px"></div>' + note('Built from your areas. New devices appear in their room by themselves.', 'p', 'AutoFix'))
page_board('RRoomFirst', 'Room-first layouts', P3, room, active='Overview', caption='Room-first: every area becomes a room card automatically, ready for phone and wall tablet')

# ---------------- Phone ----------------
ph1 = phone(note('Safe editing: the room stays as it is.', 't', 'ShieldCheck') + bulb('Sofa lamp', 1, 40, changed=True) + bulb('Ceiling', 0, 0), 'Evening scene', 'Settings', back=True)
ph2 = phone(search('kitchen', w=330) + card(gutter.replace('width:28px', 'width:20px'), pad=10, gap=0, style='overflow:hidden'), 'Raw editor', 'Home', back=True,
            sheet=sh(field('Replace with', 'galley'), row(btn('Replace', 'out'), btn('Replace all', 'fill'), gap=8)))
ph3 = phone(trig('MapMarker', 'Person', 'Alex arrives', 'Away', 'p', False) + trig('WeatherSunset', 'Sun', 'Below horizon', 'Yes', 'w', True), 'Arrive home', 'Settings', back=True)
phone_board('RPhoneWorkflow', 'Scenes, raw editor and live states on a phone', P4, [ph1, ph2, ph3], caption='On a phone: safe scene editing, the find bar with replace in a sheet, live states on every step')
ph4 = phone(grid(2, card(ico('Sofa', 'p'), '<b>Living room</b>', pad=14), card(ico('Bed', 't'), '<b>Bedroom</b>', pad=14), gap=10), 'Home', 'Home',
            sheet=sh('<b class="h3">Living room</b>', bulb('Ceiling', 1, 60), row(chip('Movie', True), chip('Off'), gap=6)))
ph5 = phone(card(ring(68, '2.4 GB', 'p', 120), pad=14, style='align-items:center') + bars([38, 21, 12], 'p', 140, ['power', 'energy', 'door']), 'Storage', 'Settings', back=True)
ph6 = phone(''.join([card(row(ico(i, t, 32, 10, 16), f'<b class="grow">{n}</b>'), seg(['Hidden', 'View', 'Use'], v), pad=12, gap=8) for i, n, v, t in [('ViewDashboard', 'Energy', 0, 'g'), ('Lock', 'Front door', 1, 'w')]]), title='Kids can…', active='Settings', back=True)
phone_board('RPhoneMore', 'Pop-ups, storage and roles on a phone', P4, [ph4, ph5, ph6], caption='On a phone: pop-ups as sheets, storage as a ring and bars, role choices per item')

write_index('Home Assistant Material, modern: Community requests', [(P1, 'Editor and workflow: scenes, raw editor, live states, storage'), (P2, 'Styling: card styling, pop-ups, history graphs'), (P3, 'Dashboards and people: defaults, roles, room-first'), (P4, 'On a phone')], 'RSceneSafe')
