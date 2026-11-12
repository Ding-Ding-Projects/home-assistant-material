"""Modern remake, group 1: Everyday (canvases 01 and 02)."""
from ui import *

begin('everyday')
P1, P2 = 'everyday', 'everyday-2'

# ---- 01 ----
greet = (f'<div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="lbl">Thursday 12 November</div>'
         f'<div class="disp" style="margin-top:8px">Good afternoon,<br>Test Owner</div>'
         f'<div class="onv" style="font-size:16px;margin-top:12px">5 lights are on and 2 doors are not locked.</div></div>{tools("Pencil")}</div>')
needs = grid('1.15fr 1fr 1fr',
             card(row(ico('LockOpenVariant', 'w'), '<span class="grow"></span>', pill('Needs you', 'w')),
                  '<b class="h2">2 doors are not locked</b><span class="sm mu">Front door, Back door · 4 locks</span>', row(btn('Lock all', 'fill', 'Lock')), style='background:var(--wc)'),
             card(row(ico('Thermostat', 'p'), '<b>Living room</b>', '<span class="grow"></span>', live('Heating')),
                  '<div style="font-size:56px;font-weight:500;letter-spacing:-.03em">23°</div><span class="sm mu">Target 22° · humidity 41%</span>', slider(62)),
             card(row(ico('PlayBoxMultiple', 't'), '<b>Bedroom</b>'), '<b class="h2">Epic sax guy, 10 hours</b>', bar(38, 't'),
                  row(ib('SkipPrevious'), f'<span class="ib" style="background:var(--t);color:#fff">{I("Pause", 20)}</span>', ib('SkipNext'), '<span class="grow"></span>', ib('VolumeHigh'))), gap=16)
summ = grid(4, *[tile(ic, t, s, tn, '') for ic, t, s, tn in [('LightbulbGroup', 'Lights', '5 on in 3 rooms', 'w'), ('ShieldHome', 'Security', '2 unlocked', 'e'),
                                                            ('BatteryAlert', 'Maintenance', '1 low battery', 'p'), ('WeatherPouring', 'Weather', '−24 °C · rainy', 't')]])
page_board('M01Home', 'Home, light', P1, greet + '<div style="height:26px"></div>' + needs + '<div class="lbl" style="margin:24px 0 12px">Summaries</div>' + summ, 'Overview',
           caption='Home: the greeting says the state in a sentence, cards that need a decision come first')

energy = (header('Energy', 'Today, from midnight', '', tools('CalendarRange')) + row(seg(['Day', 'Week', 'Month', 'Year'], 0), '<span class="grow"></span>', live('Updating every 10 s')) + '<div style="height:18px"></div>'
          + stats(('24.6 kWh', 'Used', 'p', 'Flash'), ('11.2 kWh', 'Solar', 'g', 'SolarPower'), ('3.1 kWh', 'Returned', 't', 'TransmissionTower'), ('$4.18', 'Cost', 'w', 'CurrencyUsd'))
          + '<div style="height:16px"></div>' + grid('2fr 1fr', card(bars([3, 2, 2, 1, 1, 2, 4, 6, 5, 4, 3, 3, 4, 3, 5, 7, 9, 8, 6, 5, 4, 3, 2, 2], 'p', 200, [str(h) if h % 3 == 0 else '' for h in range(24)]), title='Use by hour'),
                                                        card(ring(46, '46%', 'g', 150), '<span class="sm mu" style="text-align:center">of today came from the sun</span>', title='Self-sufficiency', style='align-items:center')))
page_board('M01EnergyDark', 'Energy, dark', P1, energy, 'Energy', dark=True, caption='Energy, dark: the chart grows bar by bar, totals are four tiles')

ph_home = phone('<div class="disp" style="font-size:34px">Good afternoon</div><span class="onv">5 lights on · 2 doors unlocked</span>'
                + card('<b class="h3">2 doors are not locked</b>', btn('Lock all', 'fill', 'Lock'), style='background:var(--wc)', pad=18)
                + grid(2, tile('LightbulbGroup', 'Lights', '5 on', 'w', ''), tile('Thermostat', 'Climate', '23°', 'p', '')), top=False)
ph_menu = phone(lst([('Home', 'Overview', 'Pinned'), ('Map', 'Map', '3 people'), ('LightningBolt', 'Energy', '24.6 kWh today'), ('Calendar', 'Calendar', '2 events')]), 'Pages', 'Pages')
ph_dash = phone(card(row(ico('Thermostat'), '<b class="grow">Living room</b>', live('Heat')), '<div style="font-size:48px;font-weight:500">23°</div>', slider(62), pad=18)
                + card(row(ico('Lightbulb', 'w'), '<b class="grow">Kitchen</b>', switch()), slider(80, 'w'), pad=18), 'Living room', back=True)
phone_board('M01Phone', 'Home on a phone', P1, [ph_home, ph_menu, ph_dash], caption='Phone: the bottom bar, open pages as a list, a room')

view_tabs = seg(['Home', 'Living room', 'Kitchen', 'Garden', '+'], 1)
dash = (header('Living room', 'A dashboard of your own', 'Dashboards › My home', tools('Pencil')) + view_tabs + '<div style="height:20px"></div>'
        + grid(3, card(row(ico('Lightbulb', 'w'), '<b class="grow">Ceiling</b>', switch()), slider(70, 'w')),
               card(row(ico('Thermostat'), '<b class="grow">Radiator</b>'), '<div style="font-size:40px;font-weight:500">21.5°</div>'),
               card(row(ico('Television', 't'), '<b class="grow">TV</b>', pill('Playing', 't')), '<span class="sm mu">Nature documentary</span>'),
               card(row(ico('BlindsHorizontal', 'g'), '<b class="grow">Blinds</b>'), slider(40, 'g')),
               card(row(ico('Thermometer', 'p'), '<b class="grow">Temperature</b>'), spark([20, 21, 21.5, 22, 21.8, 21.2, 21.5, 22.4, 22.1], 'p', 70)),
               card(row(ico('Speaker', 't'), '<b class="grow">Speaker</b>'), bar(55, 't'))))
page_board('M01Dashboard', 'A dashboard of your own, with views', P1, dash, 'Overview', extra=('ViewDashboard', 'Living room'),
           caption='Your dashboard: views as a segmented control, cards in one rhythm')

edit = (header('Living room', '', 'Editing · My home', row(ib('Undo'), ib('Redo'), btn('Done', 'fill'), gap=6)) + view_tabs + '<div style="height:20px"></div>'
        + grid('1fr 1fr 440px', card(row(ico('Lightbulb', 'w'), '<b class="grow">Ceiling</b>', switch()), slider(70, 'w'), style='box-shadow:0 0 0 3px var(--p)'),
               card(row(ico('Thermostat'), '<b class="grow">Radiator</b>'), '<div style="font-size:40px">21.5°</div>'),
               card(seg(['Visual', 'YAML'], 0), field('Entity', 'light.ceiling', 'Lightbulb'), field('Name', 'Ceiling'),
                    row('<b class="grow">Show brightness</b>', switch()), row('<b class="grow">Tap action</b>', chip('Toggle', True)), code('type: tile\nentity: light.ceiling\nfeatures:\n  - type: light-brightness'),
                    title='Tile card', action=ib('Close'))))
page_board('M01DashEdit', 'Dashboard, edit mode with the card editor', P1, edit + actionbar(abtn('Add card', 'Plus'), abtn('Dashboard tools', 'Toolbox'), abtn('Save', 'ContentSave', True), note='1 unsaved change'),
           'Overview', caption='Edit mode: the selected card glows, its editor docks beside it, one action bar')

picker = card(row(search('Search cards', w=520), '<span class="grow"></span>', chips('All', 'Favourites', 'Entities', 'Media', 'Graphs')),
              grid(4, *[card(f'<div class="thumb" style="height:110px">{I(ic, 34)}</div>', f'<b>{t}</b><span class="xs mu">{s}</span>', pad=12, gap=8)
                        for ic, t, s in [('ViewAgenda', 'Tile', 'One entity, with features'), ('FormatListBulleted', 'Entities', 'A list of entities'), ('Gauge', 'Gauge', 'A value on a dial'),
                                         ('ChartLine', 'History graph', 'Values over time'), ('Thermostat', 'Thermostat', 'Set a temperature'), ('Image', 'Picture', 'An image with a label'),
                                         ('LanguageMarkdown', 'Markdown', 'Text with templates'), ('ViewGrid', 'Grid', 'Cards in columns')]]), pad=22)
page_board('M01CardPicker', 'Card picker', P1, over(edit, dialog('Add a card', picker, 'CardsOutline', w=900, actions=btn('Cancel', 'txt'))), 'Overview',
           caption='Card picker: a dialog of live previews with search and categories')

mapp = (header('Map', '3 people · 4 zones', '', tools('Crosshairs')) +
        f'<div style="position:relative;height:640px;border-radius:28px;overflow:hidden;background:repeating-linear-gradient(0deg,transparent 0 46px,var(--s3) 46px 48px),repeating-linear-gradient(90deg,transparent 0 46px,var(--s3) 46px 48px),var(--s2)">'
        f'<div style="position:absolute;left:38%;top:30%;width:260px;height:260px;border-radius:50%;background:color-mix(in srgb,var(--p) 14%,transparent);box-shadow:inset 0 0 0 2px var(--p)"></div>'
        + ''.join(f'<div class="floaty" style="position:absolute;left:{x}%;top:{y}%;animation-delay:{d}s">{avatar(a, t, 48)}</div>' for x, y, a, t, d in [(46, 40, 'TO', 't', 0), (52, 52, 'AL', 'g', .6), (20, 70, 'SK', 'w', 1.2)])
        + f'<div style="position:absolute;right:20px;top:20px;width:320px">{lst([(None, "Test Owner", "Home · 2 min ago", "", "t", "TO"), (None, "Alex", "Home · 10 min ago", "", "g", "AL"), (None, "Sam", "Work · 1 h ago", "", "w", "SK")], "People")}</div></div>')
page_board('M01Map', 'Map, people and zones', P1, mapp, 'Map', caption='Map: people float on the map, the list docks over it')

logb = (header('Activity', 'What happened, newest first', '', tools('CalendarRange')) + row(search('Search activity', w=420), chips('Today', 'Lights', 'Doors', 'People'), gap=10) + '<div style="height:16px"></div>'
        + lst([('Lightbulb', 'Kitchen light turned on', 'by Motion-activated light · 2 min ago', pill('Light', 'w'), 'w'),
               ('Door', 'Front door opened', 'by Alex · 6 min ago', pill('Door', 'e'), 'e'),
               ('Home', 'Alex arrived home', '10 min ago', pill('Person', 'g'), 'g'),
               ('Robot', 'Good night ran', 'triggered at 22:30 · took 1.2 s', pill('Automation', 't'), 't'),
               ('Thermostat', 'Living room set to 22°', 'by Test Owner · 1 h ago', pill('Climate'), 'p'),
               ('WeatherSunset', 'The sun set', '1 h ago', '', 'w')]))
page_board('M01Activity', 'Activity, the logbook', P1, logb, 'Activity', caption='Activity: each event a row with who did it, filters as chips')

hist = (header('History', 'Living room and kitchen, last 24 hours', '', tools('CalendarRange', 'Download')) + row(chip('Living room', True), chip('Kitchen', True), chip('Add entity', icon='Plus'), gap=8) + '<div style="height:16px"></div>'
        + card(spark([20, 20.5, 21, 21.8, 22.4, 22.1, 21.4, 21, 20.6, 21.4, 22.6, 23, 22.8, 22.1], 'p', 220), row(pill('Living room 22.1°', 'p'), pill('Kitchen 20.4°', 't')), title='Temperature', action=ib('Fullscreen'))
        + '<div style="height:16px"></div>' + card(timeline([('Kitchen light', [(10, 30, 'w', 'On'), (55, 80, 'w', 'On')]), ('Front door', [(20, 23, 'e', 'Open'), (70, 72, 'e', 'Open')]),
                                                            ('Alex', [(0, 35, 'g', 'Home'), (35, 60, 'n', 'Away'), (60, 100, 'g', 'Home')])]), title='States'))
page_board('M01History', 'History, graphs and state timelines', P1, hist, 'History', caption='History: lines draw themselves, states are rounded bars')

media = (header('Media', 'Browse and play', '', tools()) + row(search('Search media', w=420), chips('Local media', 'Radio', 'Cameras', 'Text to speech'), gap=10) + '<div style="height:18px"></div>'
         + grid(5, *[card(f'<div class="thumb" style="height:150px">{I(ic, 40)}</div>', f'<b>{t}</b><span class="xs mu">{s}</span>', pad=10, gap=8)
                     for ic, t, s in [('Folder', 'Music', '214 tracks'), ('Folder', 'Podcasts', '12 shows'), ('Radio', 'Radio Browser', 'Stations'), ('Cctv', 'Cameras', '2 cameras'), ('AccountVoice', 'Text to speech', 'Speak a message')]])
         + '<div style="height:18px"></div>' + card(row(f'<div class="thumb" style="width:72px;height:72px">{I("Music", 30)}</div>', col('<b class="h3">Epic sax guy, 10 hours</b>', '<span class="sm mu">Bedroom speaker</span>', bar(38, 't'), gap=6, style='flex:1'),
                                                       ib('SkipPrevious'), f'<span class="ib" style="background:var(--t);color:#fff">{I("Pause", 20)}</span>', ib('SkipNext'), ib('VolumeHigh'), gap=16), pad=16))
page_board('M01Media', 'Media browser and player', P1, media, 'Media', caption='Media: big tiles to browse, the player docks at the foot')

todo = (header('To-do lists', '', '', tools()) + grid('280px 1fr', lst([('ClipboardList', 'Shopping list', '4 to do'), ('ClipboardCheck', 'Chores', '2 to do'), ('Plus', 'New list', '')], 'Lists'),
        card(row('<b class="h2 grow">Shopping list</b>', btn('Add item', 'fill', 'Plus')), field('New item', '', 'Plus'),
             col(*[row(f'<span class="cb{" on" if d else ""}">{I("Check", 14) if d else ""}</span>', f'<span class="grow" style="{"text-decoration:line-through;color:var(--mu)" if d else ""}">{t}</span>', '<span class="xs mu">' + w + '</span>', ib('DragVertical'))
                   for t, w, d in [('Oat milk', 'Today', False), ('Bao buns', 'Tomorrow', False), ('Chilli oil', '', False), ('Rice', '', False), ('Tea', 'Done', True)]], gap=14))))
page_board('M01Todo', 'To-do lists', P1, todo, 'To-do lists', caption='To-do: lists on the left, items you can drag, done items fade')

days = ''.join(f'<div class="col" style="min-height:104px;padding:8px;border-radius:14px;background:{"var(--pc)" if d == 12 else "var(--surf)"};gap:4px"><b class="sm">{d}</b>'
               + (''.join(f'<span class="pill" style="{tone(t)};font-size:11px">{x}</span>' for x, t in ev.get(d, []))) + '</div>' for d in range(1, 29)
               for ev in [{3: [('Bins', 'g')], 12: [('Dentist', 'p'), ('Yum cha', 'w')], 18: [('Boiler service', 't')], 24: [('Birthday', 'e')]}])
cal = header('Calendar', 'November 2026', '', row(seg(['Month', 'Week', 'Day', 'List']), btn('New event', 'fill', 'Plus'), gap=10)) + f'<div class="grid" style="grid-template-columns:repeat(7,1fr);gap:8px">{days}</div>'
page_board('M01Calendar', 'Calendar, month view', P1, cal, 'Calendar', caption='Calendar: today is tonal, events are coloured pills')

lights = (header('Lights', '5 of 12 on', '', row(btn('All off', 'out', 'LightbulbOff'), tools(), gap=10))
          + ''.join(f'<div class="lbl" style="margin:14px 0 10px">{room}</div>' + grid(4, *[card(row(ico('Lightbulb' if on else 'LightbulbOutline', 'w' if on else 'n'), f'<b class="grow">{n}</b>', switch(on)), slider(b if on else 0, 'w'), pad=16, style='background:var(--wc)' if on else '') for n, on, b in ls])
                    for room, ls in [('Living room', [('Ceiling', True, 70), ('Lamp', True, 40), ('Strip', False, 0), ('Reading', True, 90)]), ('Kitchen', [('Pendant', True, 100), ('Cabinet', False, 0)]), ('Bedroom', [('Bedside', False, 0), ('Ceiling', False, 0)])]))
page_board('M01Lights', 'Lights, every room at once', P1, lights, 'Overview', extra=('LightbulbGroup', 'Lights'), caption='Lights: lit cards glow warm, every room in one view')

clim = (header('Climate', '3 rooms', '', tools()) + grid('1.2fr 1fr', card(ring(64, '22.5°', 'w', 240), row(btn('', 'ton', 'Minus'), '<b class="h2">Target 22°</b>', btn('', 'ton', 'Plus'), gap=18), seg(['Heat', 'Cool', 'Auto', 'Off'], 0), title='Living room', action=live('Heating'), style='align-items:center'),
        col(*[tile('Thermostat', n, s, t, '', big=b) for n, s, t, b in [('Kitchen', 'Idle · target 20°', 'p', '20.4°'), ('Bedroom', 'Cooling · target 19°', 't', '19.8°'), ('Office', 'Off', 'n', '18.2°')]], gap=14)))
page_board('M01Climate', 'Climate, thermostat and rooms', P1, clim, 'Overview', extra=('Thermostat', 'Climate'), caption='Climate: a big dial that fills to the temperature, rooms beside it')

sec = (header('Security', 'Armed at home', '', tools()) + hero('ShieldHome', 'Armed, home', 'Doors and windows are watched; motion inside is not.', 'g', btn('Disarm', 'fill'), 'Alarm')
       + '<div style="height:16px"></div>' + grid('1fr 1fr', lst([('LockOpenVariant', 'Front door', 'Unlocked 6 min ago', btn('Lock', 'ton', size='sm'), 'w'), ('LockOpenVariant', 'Back door', 'Unlocked 1 h ago', btn('Lock', 'ton', size='sm'), 'w'),
                                                                  ('Lock', 'Garage', 'Locked', pill('Locked', 'g'), 'g'), ('Lock', 'Shed', 'Locked', pill('Locked', 'g'), 'g')], 'Locks'),
                                                              card(grid(2, *[f'<div class="thumb" style="height:150px;position:relative">{I("Cctv", 34)}<span style="position:absolute;left:10px;top:10px">{live(n)}</span></div>' for n in ['Driveway', 'Garden']]), title='Cameras')))
page_board('M01Security', 'Security, alarm, locks and cameras', P1, sec, 'Overview', extra=('ShieldHome', 'Security'), caption='Security: the alarm state as a hero, locks with one-tap actions, live cameras')

# ---- 02 ----
maint = (header('Maintenance', '3 things need care', '', tools()) + stats(('1', 'Low batteries', 'w', 'BatteryAlert'), ('4', 'Updates', 'p', 'Update'), ('2', 'Offline', 'e', 'LanDisconnect'))
         + '<div style="height:16px"></div>' + grid(2, lst([('Battery10', 'Front door lock', '9% · replace soon', bar(9, 'e'), 'e'), ('Battery50', 'Hall motion sensor', '48%', bar(48, 'w'), 'w'), ('Battery', 'Garden sensor', '92%', bar(92, 'g'), 'g')], 'Batteries'),
                                                    lst([('LanDisconnect', 'Garage plug', 'Offline for 2 days', btn('Find', 'ton', size='sm'), 'e'), ('LanDisconnect', 'Shed light', 'Offline for 3 h', btn('Find', 'ton', size='sm'), 'e')], 'Offline devices')))
page_board('M02Maintenance', 'Maintenance', P2, maint, 'Overview', extra=('Wrench', 'Maintenance'), caption='Maintenance: counts first, then what to replace or find')

iframe = header('Router', 'An app or web page inside the pane', '', tools('OpenInNew', 'Refresh')) + card('<div class="col" style="height:620px;border-radius:20px;background:var(--s2);padding:20px;gap:14px">' + row('<b class="h3 grow">Router admin</b>', pill('Embedded page', 'n')) + busy(10) + grid(3, *[f'<div class="tile" style="height:120px"></div>' for _ in range(3)]) + '</div>', pad=12)
page_board('M02Panel', 'An app or web page inside the pane', P2, iframe, 'Overview', extra=('Web', 'Router'), caption='A web page in the pane: framed in a card, with open and refresh in the tools pill')

prof = header('Profile', 'Test Owner · owner', '', tools(), tabs=(['General', 'Security'], 0)) + form([
    ('Appearance', '', [('Theme', 'Follows the system', seg(['System', 'Light', 'Dark'])), ('Accent colour', 'Used for buttons and highlights', row(*[f'<span style="width:28px;height:28px;border-radius:14px;background:{c};box-shadow:{"0 0 0 3px var(--surf),0 0 0 5px "+c if i == 0 else "none"}"></span>' for i, c in enumerate(['#2155d6', '#6d44b8', '#1a6e3e', '#8a5100', '#b42a18'])], gap=10)),
                        ('Motion', 'Animations and transitions', btn('Open the motion editor', 'ton', 'Animation'))]),
    ('Language and region', '', [('Language', '', chip('English', True)), ('Number format', '', chip('Auto')), ('Time format', '', seg(['12 h', '24 h'], 1))]),
    ('Behaviour', '', [('Keep the screen on', 'While a dashboard is open', switch(False)), ('Vibrate', 'On a phone, when you press a control', switch())])])
page_board('M02Profile', 'Profile, general', P2, prof, 'Overview', extra=('Account', 'Profile'), caption='Profile: grouped cards of settings, a motion editor entry under appearance')

profsec = header('Profile', 'Test Owner · owner', '', tools(), tabs=(['General', 'Security'], 1)) + grid(2, lst([('Cellphone', 'Phone, Toronto', 'This device · active now', pill('This one', 'g'), 'g'), ('Laptop', 'Laptop, Chrome', '2 days ago', ib('Delete'), 'p'), ('Tablet', 'Kitchen tablet', '1 week ago', ib('Delete'), 'p')], 'Signed in', btn('Sign out others', 'txt')),
                                                                                                       col(card(row(ico('ShieldKey', 'g'), col('<b>Two-step sign in</b>', '<span class="sm mu">Authenticator app</span>', gap=2, style='flex:1'), pill('On', 'g')), row(btn('Change password', 'out', 'Key'), btn('Recovery codes', 'txt'))),
                                                                                                           lst([('KeyVariant', 'Home tablet token', 'Expires in 10 years', ib('Delete'), 't')], 'Long-lived tokens', btn('Create', 'ton', 'Plus', 'sm')), gap=16))
page_board('M02ProfileSecurity', 'Profile, security', P2, profsec, 'Overview', extra=('Account', 'Profile'), caption='Profile security: devices you can sign out, two-step state as a card')

assist = over(header('Overview', '', '', tools()) + grid(3, *[tile(i, t, '', c) for i, t, c in [('Lightbulb', 'Lights', 'w'), ('Thermostat', 'Climate', 'p'), ('Lock', 'Locks', 'g')]]),
              dialog('Assist', col(row(avatar('TO', 't', 32), card('Turn off the kitchen lights', pad=12, style='border-radius:18px 18px 6px 18px;background:var(--pc);color:var(--onpc)'), style='justify-content:flex-end', gap=8),
                                   row(ico('Robot', 'p', 32, 10, 18), card('Turned off 2 lights in the kitchen.', pad=12, style='border-radius:18px 18px 18px 6px'), gap=8),
                                   row(field('Ask Assist', 'What is the temperature<span class="caret"></span>', 'Robot', wide=True, raw=True), f'<span class="ib" style="background:var(--p);color:var(--onp);width:48px;height:48px;border-radius:24px">{I("Microphone", 22)}</span>', align='flex-end'), gap=12),
                     'Robot', w=520, actions=''))
page_board('M02Assist', 'Assist, typed and spoken', P2, assist, 'Overview', caption='Assist: a chat with bubbles, the microphone is the biggest control')

keys = over(header('Overview', '', '', tools()), dialog('Keyboard shortcuts', grid(2, *[card(lbl(g), *[row(f'<span class="grow">{d}</span>', *[f'<span class="kbd">{k}</span>' for k in ks.split('+')], gap=6) for d, ks in items], pad=16, gap=10)
                                                                                         for g, items in [('Anywhere', [('Command palette', 'Ctrl+Shift+F'), ('Search', 'Ctrl+K'), ('Assist', 'A'), ('My link', 'M')]),
                                                                                                          ('Pages', [('New tab', 'Ctrl+T'), ('Close tab', 'Ctrl+W'), ('Next tab', 'Ctrl+Tab'), ('Collapse the strip', 'Ctrl+B')]),
                                                                                                          ('Editors', [('Save', 'Ctrl+S'), ('Undo', 'Ctrl+Z'), ('Redo', 'Ctrl+Y')]),
                                                                                                          ('Lists', [('Select all', 'Ctrl+A'), ('Filter', '/'), ('Open', 'Enter')])]]),
                                                                    'Keyboard', w=820, actions=btn('Done', 'fill')))
page_board('M02Shortcuts', 'Keyboard shortcuts', P2, keys, 'Overview', caption='Shortcuts: grouped in cards, keys as keycaps')

states = grid(3, card(empty('FormatListBulleted', 'No automations yet', 'Start from a template or a blank one.', btn('Create automation', 'fill', 'Plus')), pad=16),
              card(empty('MapMarkerQuestion', 'This page is not here', 'It may have moved. Search, or go home.', btn('Go home', 'ton', 'Home')), pad=16),
              card(col(busy(14), busy(14), grid(2, *[f'<div class="busy" style="height:110px;border-radius:20px"></div>' for _ in range(4)]), busy(14), gap=14), title='Loading', pad=22))
page_board('M02States', 'Empty, lost and loading states', P2, header('States', 'Empty, lost and loading, in one family', '', tools()) + states, 'Overview',
           caption='Empty, lost and loading: a floating illustration, one action, shimmering placeholders')

mylink = over(header('Overview', '', '', tools()), dialog('Open a page from a link?', col(note('A link from <b>my.home-assistant.io</b> wants to open <b>Add integration › Philips Hue</b>.', 'p', 'LinkVariant'), kv([('Instance', 'Home'), ('Page', 'Settings › Integrations')])),
                                                         'OpenInNew', w=520, actions=btn('Stay here', 'txt') + btn('Open page', 'fill')))
page_board('M02MyLink', 'A link from the web asks to open a page', P2, mylink, 'Overview', caption='A link asks first: what will open, from where, two clear choices')

signin = (f'<div class="col" style="height:100%;align-items:center;justify-content:center;gap:20px"><div class="logo" style="width:72px;height:72px;border-radius:24px">{I("Home", 36)}</div>'
          + card(col('<b class="h2">Enter your code</b>', '<span class="sm mu">From your authenticator app</span>', row(*[f'<span style="width:52px;height:64px;border-radius:16px;background:var(--s2);display:grid;place-items:center;font-size:28px;font-weight:600;{"box-shadow:0 0 0 2px var(--p)" if i == 3 else ""}">{d}</span>' for i, d in enumerate(['4', '8', '2', '', '', ''])], gap=8),
                     row(f'<span class="cb on">{I("Check", 14)}</span>', '<span class="sm">Trust this device for 30 days</span>', gap=10), btn('Sign in', 'fill', size='lg'), btn('Use a recovery code', 'txt'), gap=16), pad=32, style='width:440px;align-items:center;text-align:center') + '</div>')
board('M02SignIn', 'Sign in, second step, and trusted devices', P2, window(signin, bare=True), caption='Sign in: one card, the code in big boxes, trust this device')

wiz = lambda cur, body: (f'<div class="col" style="height:100%;align-items:center;justify-content:center;gap:24px"><div class="logo" style="width:64px;height:64px;border-radius:22px">{I("Home", 32)}</div>'
                         + card(steps(['Welcome', 'Account', 'Location', 'Analytics', 'Devices', 'Done'], cur), body, pad=32, gap=22, style='width:880px') + '</div>')
board('M02Pi', 'First-run wizard on a Raspberry Pi', P2, window(wiz(0, col('<div class="disp" style="font-size:38px">Welcome home</div>', '<span class="onv" style="font-size:16px">This Raspberry Pi is ready. Make an owner account, or restore a backup.</span>',
                                                                     row(btn('Create my smart home', 'fill', size='lg'), btn('Restore a backup', 'out', 'Restore', 'lg')), gap=14)), bare=True), caption='First run on a Raspberry Pi: one welcome, two paths')
board('M02FirstRun', 'First run, all six steps', P2, window(wiz(2, col('<b class="h2">Where is your home?</b>', f'<div style="height:240px;border-radius:20px;background:repeating-linear-gradient(0deg,transparent 0 38px,var(--s3) 38px 40px),var(--s2);position:relative"><span class="floaty" style="position:absolute;left:48%;top:38%;color:var(--p)">{I("MapMarker", 44)}</span></div>',
                                                                      grid(3, field('Country', 'Canada'), field('Time zone', 'America/Toronto'), field('Units', 'Metric')), row('<span class="grow"></span>', btn('Back', 'txt'), btn('Next', 'fill')), gap=16)), bare=True),
      caption='First run: the six steps as a stepper, the current one in a card')
board('M02Preparing', 'The preparing page, before the first start', P2, window(f'<div class="col" style="height:100%;align-items:center;justify-content:center;gap:22px;text-align:center"><div class="logo" style="width:80px;height:80px;border-radius:26px;animation:breathe 2.4s ease-in-out infinite">{I("Home", 40)}</div><b class="h1">Preparing Home Assistant</b><span class="onv">This can take up to 20 minutes on a Raspberry Pi.</span><div style="width:420px">{busy(10)}</div>'
                                                                        + card(code('Downloading core 2026.11.1.137\nUnpacking frontend\nChecking the database'), pad=8, style='width:520px;text-align:left') + '</div>', bare=True), caption='Preparing: a breathing logo, a shimmer, the log in a card')

about = header('About', 'This build and where it came from', '', tools()) + grid('1.3fr 1fr', card(row(f'<div class="logo" style="width:64px;height:64px;border-radius:22px">{I("Home", 32)}</div>', col('<b class="h2">Home Assistant Material</b>', '<span class="sm mu">2026.11.1.137 · Peeled Prawn Cheung Fun</span>', gap=2), gap=16),
                                                                                                  kv([('Core', '2026.11.1'), ('Frontend', '20261112.0'), ('Built', '12 Nov 2026, 13:58'), ('Fork of', 'home-assistant/core and frontend'), ('Update channel', 'Stable')]), row(btn('Check for updates', 'fill', 'Update'), btn('Release notes', 'txt'))),
                                                                                             lst([('SourceBranch', 'Source', 'Ding-Ding-Projects/home-assistant-material', ib('OpenInNew'), 'p'), ('ScaleBalance', 'Licence', 'Apache 2.0', ib('OpenInNew'), 't'), ('Heart', 'Credits', 'Upstream contributors', ib('ChevronRight'), 'w')], 'Provenance'))
page_board('M02About', 'About, provenance and updates', P2, about, 'Settings', caption='About: the build as a card, where it came from as a list')

prov = header('Release notes', 'Text from the provider, rendered', '', tools()) + grid(2, card('<b class="h2">What changed in 2026.11</b>', '<span class="onv">The tab strip can collapse to icons and float anywhere. Tables on a phone grow with their text.</span>', code('- Tab strip: collapse, float\n- Tables: rows grow on phones\n- Colour tool: one-line picker'), title='Rendered'),
                                                                                       card(empty('TextBoxRemoveOutline', 'Nothing from this provider', 'It sent no text for this release.', btn('Try again', 'ton', 'Refresh')), title='Empty'))
page_board('M02Provider', 'Provider text rendered, and its empty state', P2, prov, 'Settings', caption='Provider text: rendered in a card, and the same card when it sends nothing')

write_index('Home Assistant Material, modern: Everyday', [(P1, 'Everyday: home, dashboards, map, history, media, rooms'), (P2, 'Everyday: maintenance, profile, Assist, states, sign in, first run, about')], 'M01Home')
