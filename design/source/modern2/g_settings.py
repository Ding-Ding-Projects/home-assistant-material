"""Modern remake, group 2: Settings (canvases 03 and 04)."""
from ui import *

begin('settings')
P1, P2 = 'settings', 'settings-2'
S = 'Settings'

# ---- 03 ----
ints = [('LightbulbGroup', 'Philips Hue', '12 devices', 'w'), ('Zigbee', 'Zigbee', '24 devices', 'p'), ('ZWave', 'Z-Wave', '9 devices', 't'), ('Cast', 'Google Cast', '3 devices', 'g'),
        ('Antenna', 'MQTT', '5 devices', 'p'), ('WeatherPartlyCloudy', 'Met.no', '1 service', 't'), ('Bluetooth', 'Bluetooth', '2 adapters', 'p'), ('Robot', 'Demo', '62 entities', 'w'), ('WhiteBalanceSunny', 'Sun', '1 service', 'w')]
ig = (header('Integrations', '8 configured · 2 discovered', 'Settings › Devices & services', row(btn('Add integration', 'fill', 'Plus'), tools(), gap=10), tabs=(['Integrations', 'Devices', 'Entities', 'Helpers'], 0))
      + row(search('Search integrations', w=420), chips('All', 'Needs attention', 'Cloud', 'Local'), gap=10) + '<div style="height:16px"></div>'
      + hero('Magnify', '2 new devices were found', 'Philips Hue bridge and an ESPHome device on your network.', 'p', btn('Set up', 'fill'), 'Discovered')
      + '<div style="height:16px"></div>'
      + grid(3, *[card(row(ico(i, t, 48, 16, 24), col(f'<b class="h3">{n}</b>', f'<span class="sm mu">{s}</span>', gap=2, style='flex:1'), ib('DotsVertical')), row(live('Connected') if k % 4 else pill('1 issue', 'w'), '<span class="grow"></span>', btn('Configure', 'txt', size='sm')), pad=18, gap=12) for k, (i, n, s, t) in enumerate(ints)]))
page_board('M03Integrations', 'Integrations', P1, ig, S, caption='Integrations: discovered devices first, each integration a card with its state')

one = (header('Philips Hue', '12 devices · 48 entities · polling local push', 'Settings › Integrations', row(btn('Add device', 'ton', 'Plus'), tools('Cog'), gap=10), back=True)
       + grid('1.4fr 1fr', lst([('Lightbulb', 'Living room ceiling', 'Hue colour bulb · Living room', live('On'), 'w'), ('Lightbulb', 'Kitchen pendant', 'Hue white · Kitchen', live('On'), 'w'), ('MotionSensor', 'Hall sensor', 'Hue motion · Hall', pill('48% battery', 'w'), 'p'),
                                   ('Remote', 'Dimmer switch', 'Hue dimmer · Bedroom', pill('Idle'), 't'), ('Bridge', 'Hue bridge', 'BSB002 · firmware 1.65', pill('Hub', 'p'), 'p')], 'Devices', btn('Show all 12', 'txt')),
                              col(card(kv([('Host', '192.168.1.40'), ('Version', '1.65.0'), ('Connected', 'Local push'), ('Since', '3 months')]), title='Entry'),
                                  card(row(btn('Reload', 'ton', 'Refresh'), btn('Download diagnostics', 'out', 'Download')), row(btn('Disable', 'txt'), btn('Delete', 'txt')), title='Actions'), gap=16)))
page_board('M03Integration', 'One integration', P1, one, S, caption='One integration: its devices live, its entry and actions in cards')

addi = over(ig, dialog('Add integration', col(steps(['Pick', 'Set up', 'Areas'], 2), row(ico('LightbulbGroup', 'w', 56, 18, 28), col('<b class="h3">Philips Hue is set up</b>', '<span class="sm mu">12 devices found. Put them in areas.</span>', gap=2)),
                                                  *[row(f'<b class="grow">{d}</b>', chip(a, True, 'Sofa')) for d, a in [('Living room ceiling', 'Living room'), ('Kitchen pendant', 'Kitchen'), ('Hall sensor', 'Hall')]], gap=14),
                                         'Plus', w=620, actions=btn('Skip', 'txt') + btn('Finish', 'fill')))
page_board('M03AddIntegration', 'Add integration, pick, set up, assign areas', P1, addi, S, caption='Adding an integration: three steps in one dialog, ending with areas')

rows = [[f'<span class="row" style="gap:10px">{ico(i, t, 32, 10, 18)}<b>{n}</b></span>', m, a, f'<span class="mu">{n2}</span>', live('Online') if o else pill('Offline', 'e')]
        for i, n, m, a, n2, o, t in [('Lightbulb', 'Living room ceiling', 'Signify', 'Living room', 'Philips Hue', 1, 'w'), ('MotionSensor', 'Hall sensor', 'Signify', 'Hall', 'Philips Hue', 1, 'p'),
                                     ('Thermostat', 'Ecobee', 'ecobee', 'Living room', 'HomeKit', 1, 't'), ('PowerSocketUs', 'Garage plug', 'TP-Link', 'Garage', 'Kasa', 0, 'e'), ('Speaker', 'Bedroom speaker', 'Google', 'Bedroom', 'Cast', 1, 'g'), ('Lock', 'Front door', 'Yale', 'Hall', 'Z-Wave', 1, 'g')]]
dev = header('Devices', '62 devices', 'Settings › Devices & services', row(btn('Add device', 'fill', 'Plus'), tools(), gap=10), tabs=(['Integrations', 'Devices', 'Entities', 'Helpers'], 1)) + table(['Device', 'Manufacturer', 'Area', 'Integration', 'Status'], rows, ['2fr', '1fr', '1fr', '1fr', '120px'], sel={1, 3})
page_board('M03Devices', 'Devices', P1, dev + actionbar(abtn('Assign area', 'Sofa'), abtn('Add label', 'Label'), abtn('Disable', 'Cancel'), note='2 selected'), S, caption='Devices: a soft table, selected rows tonal, bulk actions float up')

od = (header('Hall sensor', 'Hue motion sensor · Hall', 'Settings › Devices', row(btn('Add to dashboard', 'ton', 'ViewDashboardOutline'), tools('Pencil'), gap=10), back=True)
      + grid('1fr 1.3fr 1fr', col(card(f'<div class="thumb" style="height:170px">{I("MotionSensor", 54)}</div>', kv([('Model', 'SML001'), ('Firmware', '2.53.6'), ('Via', 'Hue bridge')]), pad=16), card(row(btn('Reconfigure', 'out', 'Cog')), title='Device'), gap=16),
             col(lst([('Motion', 'Motion', 'Detected 2 min ago', switch(), 'p'), ('Thermometer', 'Temperature', '20.4 °C', '', 't'), ('Brightness6', 'Light level', '312 lx', '', 'w'), ('Battery', 'Battery', '48%', bar(48, 'w'), 'g')], 'Sensors'),
                 card(spark([0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1], 'p', 80, fill=False), title='Activity'), gap=16),
             col(lst([('Robot', 'Hall light on motion', 'Automation', '', 't'), ('Script', 'Night path', 'Script', '', 'p')], 'Used in'), lst([('Lightbulb', 'Hall light', 'Same area', '', 'w')], 'Related'), gap=16)))
page_board('M03Device', 'One device', P1, od, S, caption='One device: what it is, what it measures, where it is used')

erows = [[f'<span class="row" style="gap:10px">{ico(i, t, 32, 10, 18)}<b>{n}</b></span>', f'<span class="mono mu">{eid}</span>', st, ar, pill(st2, tt) if st2 else '']
         for i, n, eid, st, ar, st2, tt, t in [('Lightbulb', 'Ceiling', 'light.living_room_ceiling', 'On', 'Living room', '', 'n', 'w'), ('Thermometer', 'Temperature', 'sensor.hall_temperature', '20.4 °C', 'Hall', '', 'n', 't'),
                                                ('Motion', 'Motion', 'binary_sensor.hall_motion', 'Clear', 'Hall', '', 'n', 'p'), ('PowerSocketUs', 'Garage plug', 'switch.garage_plug', 'Unavailable', 'Garage', 'Unavailable', 'e', 'e'),
                                                ('Robot', 'Good night', 'automation.good_night', 'On', '', 'Read-only', 'n', 't'), ('Lock', 'Front door', 'lock.front_door', 'Unlocked', 'Hall', '', 'n', 'g')]]
ent = header('Entities', '412 entities · 6 unavailable', 'Settings › Devices & services', tools(), tabs=(['Integrations', 'Devices', 'Entities', 'Helpers'], 2)) + table(['Entity', 'Entity ID', 'State', 'Area', ''], erows, ['1.4fr', '1.8fr', '1fr', '1fr', '120px'])
page_board('M03Entities', 'Entities', P1, ent, S, caption='Entities: IDs in mono, problems as pills, no grey boxes')

es = over(ent, dialog('Ceiling', col(seg(['Settings', 'Related', 'History']), field('Name', 'Ceiling'), field('Entity ID', 'light.living_room_ceiling', mono=True), grid(2, field('Area', 'Living room', 'Sofa'), field('Icon', 'mdi:ceiling-light', 'CeilingLight')),
                                          row('<b class="grow">Visible</b>', switch()), row('<b class="grow">Enabled</b>', switch()), note('Changing the entity ID updates 3 automations that use it.', 'w', 'AlertOutline'), gap=14), 'Lightbulb', 'w', w=560))
page_board('M03EntitySettings', 'Entity settings', P1, es, S, caption='Entity settings: tabs at the top, a warning that says what a rename touches')

hl = (header('Helpers', '14 helpers', 'Settings › Devices & services', row(btn('Create helper', 'fill', 'Plus'), tools(), gap=10), tabs=(['Integrations', 'Devices', 'Entities', 'Helpers'], 3))
      + grid(4, *[tile(i, n, s, t, '') for i, n, s, t in [('ToggleSwitch', 'Guest mode', 'Toggle · off', 'p'), ('Counter', 'Visitors', 'Counter · 3', 't'), ('TimerOutline', 'Laundry', 'Timer · 24:10 left', 'w'),
                                                           ('FormatListBulleted', 'House mode', 'Dropdown · Home', 'g'), ('Numeric', 'Target heat', 'Number · 21', 'p'), ('CalendarClock', 'Wake up', 'Date and time · 07:00', 't'),
                                                           ('FormTextbox', 'Note', 'Text · "Back at 6"', 'w'), ('ChartBellCurve', 'Average temperature', 'Combine · 21.2 °C', 'g')]]))
page_board('M03Helpers', 'Helpers', P1, hl, S, caption='Helpers: tiles that show each helper\'s current value')

autos = [('WeatherSunset', 'Lights at sunset', 'Last ran 1 h ago', True, 'w'), ('MotionSensor', 'Hall light on motion', 'Last ran 2 min ago', True, 'p'), ('WeatherNight', 'Good night', 'Last ran yesterday 22:30', True, 't'),
         ('Water', 'Leak alert', 'Never ran', True, 'e'), ('Home', 'Welcome home', 'Last ran 10 min ago', False, 'g')]
al = (header('Automations', '5 automations', 'Settings › Automations & scenes', row(btn('Create automation', 'fill', 'Plus'), tools(), gap=10), tabs=(['Automations', 'Scenes', 'Scripts', 'Blueprints'], 0))
      + row(search('Search automations', w=420), chips('All', 'On', 'Off', 'Ran today'), gap=10) + '<div style="height:16px"></div>'
      + lst([(i, n, s, row(pill('On' if on else 'Off', 'g' if on else 'n'), switch(on), ib('DotsVertical'), gap=10), t) for i, n, s, on, t in autos]))
page_board('M03Automations', 'Automations', P1, al, S, caption='Automations: a switch on every row, last run in plain words')

ae = (header('Lights at sunset', '', 'Settings › Automations', row(ib('Undo'), ib('Redo'), tools(), gap=6))
      + col(card(row(pill('When', 't'), '<b class="h3">Any of these happens</b>'), lrow('WeatherSunset', 'The sun sets', 'Offset −00:15:00', ib('DotsVertical'), 'w'), pad=18),
            card(row(pill('And if', 'g'), '<b class="h3">All of these are true</b>'), lrow('Home', 'Someone is home', 'zone.home has 1 or more people', ib('DotsVertical'), 'g'), pad=18),
            card(row(pill('Then do', 'w'), '<b class="h3">These actions</b>'), lrow('LightbulbOn', 'Turn on Living room lights', 'Brightness 60% · transition 3 s', ib('DotsVertical'), 'w'), lrow('Bell', 'Notify phones', '"Lights are on"', ib('DotsVertical'), 'p'),
                 f'<div class="row" style="gap:10px;padding:14px;border-radius:16px;border:1.5px dashed var(--out);color:var(--mu)">{I("Plus", 20)}Add an action</div>', pad=18), gap=14)
      + actionbar(abtn('Run now', 'Play'), abtn('Check', 'CheckCircleOutline'), abtn('Dry run', 'TestTube'), abtn('Save', 'ContentSave', True), note='Saved'))
page_board('M03AutomationEditor', 'Automation editor', P1, ae, S, mini=True, caption='Automation editor: three coloured blocks, one floating action bar, the pane collapsed')

ch = (header('Choose between options', 'With a test on every option', 'Settings › Automations › Lights at sunset', tools())
      + grid(3, *[card(row(pill(f'Option {n}', t), '<span class="grow"></span>', btn('Test', 'ton', 'TestTube', 'sm')), f'<b>{c}</b>', lrow(i, a, s, '', t), note(r, rt, ri), pad=18)
                  for n, c, i, a, s, t, r, rt, ri in [(1, 'If it is before 22:00', 'Lightbulb', 'Lights to 80%', 'Living room', 'p', 'Passes now', 'g', 'CheckCircle'),
                                                      (2, 'If guests are over', 'Lightbulb', 'Lights to 100%', 'All rooms', 't', 'Fails: guest mode is off', 'w', 'CloseCircle'),
                                                      (3, 'Otherwise', 'LightbulbNight', 'Night light only', 'Hall', 'w', 'Runs if 1 and 2 fail', 'n', 'InformationOutline')]]))
page_board('M03Choose', 'Choose between options, with a test on every option', P1, ch, S, caption='Choose: each option a card with its own Test and a plain result')

hm = (header('History', 'Test and run versions of an automation', 'Settings › Automations › Lights at sunset', tools())
      + grid('1.3fr 1fr', lst([('SourceCommit', 'Lower brightness to 60%', 'Today 14:02 · you', row(btn('Test', 'ton', 'TestTube', 'sm'), btn('Run', 'out', 'Play', 'sm'), gap=6), 'p'),
                              ('SourceCommit', 'Add the someone-home condition', 'Yesterday · you', row(btn('Test', 'ton', 'TestTube', 'sm'), btn('Run', 'out', 'Play', 'sm'), gap=6), 't'),
                              ('SourceCommit', 'Created', '3 Nov · you', row(btn('Test', 'ton', 'TestTube', 'sm'), btn('Restore', 'out', 'Restore', 'sm'), gap=6), 'n')], 'Versions'),
                         card(code('  actions:\n    - action: light.turn_on\n-     data: {brightness_pct: 80}\n+     data: {brightness_pct: 60}'), note('Test ran version 1 without touching devices: 2 actions would run.', 'g', 'CheckCircle'), title='Compare with the one before')))
page_board('M03HistoryManager', 'History manager for automations', P1, hm, S, caption='History manager: every version can be tested or run, the diff beside it')

repo = (header('Lights at sunset', 'Its own Git repository', 'Settings › Automations › History', tools()) + grid('1fr 1fr',
        col(hero('SourceBranch', '3 commits, nothing to commit', 'Last commit today at 14:02.', 'g', '', 'Repository'), card(timeline([('main', [(0, 30, 'p', 'Created'), (30, 70, 't', 'Condition'), (70, 100, 'g', 'Brightness')])]), title='Branch'), gap=16),
        card(kv([('Path', '/config/.automation-history/lights_at_sunset'), ('Remote', 'None set'), ('Size', '12 KB')]), row(btn('Set a remote', 'ton', 'CloudUpload'), btn('Open folder', 'txt')), title='Repository')))
page_board('M03Repo', 'One repository for each automation', P1, repo, S, caption='One automation\'s repository: state as a hero, commits on a timeline')

master = (header('Master repository', 'Which commit each automation is at', 'Settings › Automations › History', tools())
          + table(['Automation', 'Commit', 'When', 'State'], [[f'<b>{a}</b>', f'<span class="mono">{c}</span>', w, pill(s, t)] for a, c, w, s, t in
                                                            [('Lights at sunset', '7c41a2e', 'Today 14:02', 'Clean', 'g'), ('Hall light on motion', '19be004', 'Yesterday', 'Clean', 'g'), ('Good night', 'a03f9d1', '2 days ago', '1 change', 'w'), ('Leak alert', '5512ac0', '3 Nov', 'Clean', 'g')]],
                  ['2fr', '1fr', '1fr', '120px'], toolbar=False)
          + actionbar(abtn('Preview', 'FileCompare'), abtn('Commit everything', 'CloudUpload', True), note='1 automation has changes'))
page_board('M03Master', 'The master repository of all automations', P1, master, S, caption='Master repository: one row per automation, one commit action')

trace = (header('Good night', 'Ran yesterday at 22:30 · 1.2 s', 'Settings › Automations › Traces', row(seg(['Graph', 'Steps', 'Changes', 'Logbook']), tools(), gap=10))
         + grid('1fr 1.2fr', card(*[row(f'<span style="width:34px;height:34px;border-radius:17px;{tone(t)};display:grid;place-items:center">{I(i, 18)}</span>', f'<b class="grow">{n}</b>', f'<span class="xs mu">{ms}</span>') for i, n, ms, t in
                                    [('ClockOutline', 'At 22:30', '0 ms', 't'), ('CheckCircle', 'Someone is home', '4 ms', 'g'), ('LightbulbOff', 'Turn off all lights', '840 ms', 'w'), ('Lock', 'Lock the doors', '1.1 s', 'p')]], title='Path', gap=18),
                                card(code('trigger: time 22:30\ncondition: zone.home = 1 → true\naction 1: light.turn_off (12 lights)\naction 2: lock.lock (2 locks)'), note('Finished. All 2 actions succeeded.', 'g', 'CheckCircle'), title='Step details')))
page_board('M03Trace', 'Automation trace, one past run', P1, trace, S, caption='Trace: the path as steps with timings, details beside it')

# ---- 04 ----
sh = (header('Settings', 'Everything about this home, in one place.', '', row(search('Search settings', '/', 340), tools(), gap=10))
      + grid(2, hero('Update', '4 updates are ready', 'Demo add-on, Living Room Bulb and 2 more', 'p', btn('Review', 'fill')), hero('Wrench', '1 thing to repair', 'The country has not been set', 'w', btn('Fix', 'fill')))
      + '<div style="height:16px"></div>' + tiles([('Devices', 'Devices & services', '62 devices · 8 integrations'), ('Robot', 'Automations & scenes', '5 automations · 2 scenes'), ('Sofa', 'Areas, labels & zones', '3 areas'),
                                                  ('Puzzle', 'Apps', 'Programs next to Home Assistant'), ('Store', 'Marketplace', 'Community integrations'), ('ViewDashboard', 'Dashboards', '2 dashboards'),
                                                  ('AccessPoint', 'Connectivity', 'Radios and protocols'), ('AccountCog', 'Personal settings', 'Language, sound, motion'), ('AccountMultiple', 'People', '1 person'),
                                                  ('Lifebuoy', 'Support', 'Locks and a summary'), ('Cog', 'System', 'Backups, logs, restart'), ('Tools', 'Tools', 'YAML, states, colour')]))
page_board('M04SettingsHome', 'Settings, the home of settings', P2, sh, S, caption='Settings home: what needs you as two heroes, then every group as a tile')

guided = (header('App settings that explain themselves', '', 'Settings › General', tools()) + form([('Home', '', [
    ('Name', 'Shown in the sidebar and tab titles', field('', 'Home')), ('Location', 'Used for sunrise, weather and zones', btn('Set on the map', 'ton', 'MapMarker')),
    ('Units', 'Metric uses °C, km and litres', seg(['Metric', 'US customary'])), ('Currency', 'For energy prices', chip('CAD', True))]),
    ('Help', '', [('Show help beside every control', 'A short line under each setting, like these', switch()), ('Explain changes before saving', 'Say what each change will affect', switch())])])
    + f'<div class="card" style="position:absolute;right:60px;top:600px;width:300px;padding:18px;box-shadow:var(--shl);border-radius:22px" ><div class="row" style="gap:10px">{ico("Lightbulb", "w", 36, 12, 18)}<b>Units</b></div><p class="sm onv" style="margin-top:8px">Changing units converts dashboards and history; automations keep their numbers.</p></div>')
page_board('M04Guided', 'App settings that explain themselves', P2, guided, S, caption='Self-explaining settings: help under each control, a popover for the big changes')

scn = (header('Scenes', '2 scenes', 'Settings › Automations & scenes', row(btn('Create scene', 'fill', 'Plus'), tools(), gap=10), tabs=(['Automations', 'Scenes', 'Scripts', 'Blueprints'], 1))
       + grid(3, *[card(f'<div class="thumb" style="height:120px;background:linear-gradient(135deg,{a},{b})">{I(i, 40)}</div>', row(col(f'<b class="h3">{n}</b>', f'<span class="sm mu">{s}</span>', gap=2, style='flex:1'), btn('Activate', 'ton', 'Play', 'sm')), pad=14)
                   for i, n, s, a, b in [('MovieOpen', 'Movie night', '6 lights · 1 TV', 'var(--tc)', 'var(--pc)'), ('WeatherSunny', 'Morning', '8 lights · 2 blinds', 'var(--wc)', 'var(--okc)'), ('Plus', 'New scene', 'Capture the room as it is', 'var(--s2)', 'var(--s3)')]]))
page_board('M04Scenes', 'Scenes', P2, scn, S, caption='Scenes: a colourful card per scene, Activate right on it')

sce = (header('Movie night', 'Live edit: devices change as you edit', 'Settings › Scenes', row(pill('Live', 'w'), tools(), gap=10))
       + grid('1fr 1fr', lst([('Lightbulb', 'Living room ceiling', 'Off', switch(False), 'w'), ('Lightbulb', 'Lamp', '20% · warm', slider(20, 'w'), 'w'), ('LedStrip', 'Strip', 'Purple · 40%', f'<span style="width:28px;height:28px;border-radius:14px;background:#7b47d1"></span>', 't'),
                              ('Television', 'TV', 'On · HDMI 1', switch(), 'p'), ('BlindsHorizontal', 'Blinds', 'Closed', switch(False), 'g')], 'In this scene', btn('Add device', 'txt', 'Plus')),
                         card(note('Leaving live edit puts every device back as it was.', 'w', 'AlertOutline'), field('Name', 'Movie night'), field('Icon', 'mdi:movie-open', 'MovieOpen'), title='Scene'))
       + actionbar(abtn('Apply', 'Play'), abtn('Save', 'ContentSave', True), note='Live edit is on'))
page_board('M04SceneEditor', 'Scene editor', P2, sce, S, caption='Scene editor: live edit is loud about itself, controls right in the rows')

scr = (header('Scripts', '3 scripts', 'Settings › Automations & scenes', row(btn('Create script', 'fill', 'Plus'), tools(), gap=10), tabs=(['Automations', 'Scenes', 'Scripts', 'Blueprints'], 2))
       + lst([('Script', 'Night path', 'Hall and stairs to 10% for 5 minutes', row(btn('Run', 'ton', 'Play', 'sm'), ib('DotsVertical')), 'p'), ('Script', 'Confirmable notification', 'Asks on a phone first', row(btn('Run', 'ton', 'Play', 'sm'), ib('DotsVertical')), 't'),
              ('Script', 'Flash the lights', 'Three times, then back', row(btn('Run', 'ton', 'Play', 'sm'), ib('DotsVertical')), 'w')]))
page_board('M04Scripts', 'Scripts', P2, scr, S, caption='Scripts: Run on every row')

scre = (header('Night path', '', 'Settings › Scripts', row(ib('Undo'), ib('Redo'), tools(), gap=6)) + grid('1.4fr 1fr', col(card(row(pill('Fields', 't'), '<b class="h3">Ask for when it runs</b>'), lrow('Numeric', 'Minutes', 'number · default 5', '', 't'), pad=18),
                                                                                                                   card(row(pill('Sequence', 'w'), '<b class="h3">Do these in order</b>'), lrow('LightbulbOn', 'Hall and stairs to 10%', 'light.turn_on', '', 'w'), lrow('TimerSand', 'Wait {{ minutes }} minutes', 'delay', '', 'p'), lrow('LightbulbOff', 'Turn them off', 'light.turn_off', '', 'w'), pad=18), gap=14),
                                                                                                               card(row('<b class="grow">Run in mode</b>', chip('Restart', True)), row('<b class="grow">Show on dashboard</b>', switch()), field('Icon', 'mdi:walk', 'Walk'), title='Script'))
        + actionbar(abtn('Run', 'Play'), abtn('Save', 'ContentSave', True)))
page_board('M04ScriptEditor', 'Script editor', P2, scre, S, mini=True, caption='Script editor: fields and the sequence as blocks, settings beside')

bp = (header('Blueprints', '3 blueprints', 'Settings › Automations & scenes', row(btn('Import', 'fill', 'Download'), tools(), gap=10), tabs=(['Automations', 'Scenes', 'Scripts', 'Blueprints'], 3))
      + grid(3, *[card(row(ico(i, t), pill(k, t)), f'<b class="h3">{n}</b>', f'<span class="sm onv">{d}</span>', row(f'<span class="sm mu grow">{u}</span>', btn('Use', 'ton', 'Plus', 'sm')), pad=18)
                  for i, n, k, d, u, t in [('MotionSensor', 'Motion-activated light', 'Automation', 'Turns a light on when motion is seen.', 'Used once', 'p'), ('MapMarkerRadius', 'Zone notification', 'Automation', 'Tells a device when someone leaves a zone.', 'Not used', 'p'),
                                           ('BellCheck', 'Confirmable notification', 'Script', 'Asks on a phone before it runs an action.', 'Used once', 't')]]))
page_board('M04Blueprints', 'Blueprints', P2, bp, S, caption='Blueprints: a card each, what it does in one line, Use')

areas = (header('Areas and floors', '2 floors · 6 areas', 'Settings › Areas, labels & zones', row(btn('Add area', 'fill', 'Plus'), tools(), gap=10))
         + ''.join(f'<div class="row" style="gap:10px;margin:8px 0 12px">{ico("HomeFloor" + f, "n", 32, 10, 18)}<b class="h3">{fl}</b><span class="sm mu">{len(ars)} areas</span></div>'
                   + grid(3, *[card(f'<div class="thumb" style="height:96px">{I(i, 34)}</div>', row(f'<b class="grow">{a}</b>', f'<span class="sm mu">{d}</span>'), pad=12, gap=10) for i, a, d in ars])
                   for f, fl, ars in [('1', 'Ground floor', [('Sofa', 'Living room', '14 devices'), ('Stove', 'Kitchen', '9 devices'), ('Door', 'Hall', '5 devices')]),
                                      ('2', 'First floor', [('Bed', 'Bedroom', '6 devices'), ('Shower', 'Bathroom', '3 devices'), ('Desk', 'Office', '7 devices')])]))
page_board('M04Areas', 'Areas and floors', P2, areas, S, caption='Areas: grouped by floor, a picture card per area')

oa = (header('Living room', 'Ground floor · 14 devices', 'Settings › Areas', row(btn('Edit', 'ton', 'Pencil'), tools(), gap=10), back=True)
      + grid('1fr 1fr 1fr', lst([('Lightbulb', 'Ceiling', 'On', '', 'w'), ('Lightbulb', 'Lamp', '40%', '', 'w'), ('Thermostat', 'Ecobee', '22.5°', '', 'p'), ('Television', 'TV', 'Playing', '', 't')], 'Devices'),
             lst([('Robot', 'Lights at sunset', 'Automation', '', 't'), ('MovieOpen', 'Movie night', 'Scene', '', 'p')], 'Used in'), card(spark([21, 21.4, 22, 22.5, 22.3, 22.6], 'p', 120), title='Temperature today')))
page_board('M04Area', 'One area', P2, oa, S, caption='One area: devices, what uses them, its climate')

lab = (header('Labels', '5 labels', 'Settings › Areas, labels & zones', row(btn('Create label', 'fill', 'Plus'), tools(), gap=10))
       + lst([(None, n, d, row(pill(f'{c} items', t), ib('DotsVertical')), t) if False else
              f'<div class="lr row"><span class="pill" style="{tone(t)};height:32px;padding:0 14px;font-size:13px">{I(i, 16)}&nbsp;{n}</span><span class="grow sm mu">{d}</span>{pill(str(c) + " items")}{ib("DotsVertical")}</div>'
              for i, n, d, c, t in [('Battery', 'Battery powered', 'Devices that need new batteries', 12, 'w'), ('Leaf', 'Energy saving', 'Turn off when away', 8, 'g'), ('Shield', 'Security', 'Doors, locks, cameras', 9, 'e'), ('Baby', 'Nursery', 'Quiet hours', 4, 't'), ('Flask', 'Testing', 'Not used every day', 3, 'p')]]))
page_board('M04Labels', 'Labels', P2, lab, S, caption='Labels: each label wears its own colour')

zones = (header('Zones', '4 zones', 'Settings › Areas, labels & zones', row(btn('Add zone', 'fill', 'Plus'), tools(), gap=10)) + grid('1.6fr 1fr',
         f'<div class="card" style="height:620px;background:repeating-linear-gradient(0deg,transparent 0 46px,var(--s3) 46px 48px),repeating-linear-gradient(90deg,transparent 0 46px,var(--s3) 46px 48px),var(--s2);position:relative;overflow:hidden">'
         + ''.join(f'<div style="position:absolute;left:{x}%;top:{y}%;width:{r}px;height:{r}px;border-radius:50%;background:color-mix(in srgb,var({c}) 18%,transparent);box-shadow:inset 0 0 0 2px var({c})"></div>' for x, y, r, c in [(30, 30, 220, '--p'), (65, 15, 140, '--t'), (12, 65, 120, '--w')]) + '</div>',
         lst([('Home', 'Home', '100 m · 2 people', '', 'p'), ('Briefcase', 'Work', '150 m · nobody', '', 't'), ('School', 'School', '80 m · nobody', '', 'w'), ('Dumbbell', 'Gym', '60 m · nobody', '', 'g')], 'Zones')))
page_board('M04Zones', 'Zones on the map', P2, zones, S, caption='Zones: coloured circles on the map, the same colours in the list')

apps_i = (header('Apps', '3 installed', 'Settings › Apps', row(btn('App store', 'fill', 'Store'), tools(), gap=10)) + grid(3, *[card(row(ico(i, t, 52, 18, 26), col(f'<b class="h3">{n}</b>', f'<span class="sm mu">{v}</span>', gap=2, style='flex:1')), row(live('Running') if r else pill('Stopped', 'n'), '<span class="grow"></span>', btn('Open', 'ton', 'OpenInNew', 'sm')), pad=18)
                                                                                                           for i, n, v, r, t in [('MicrosoftVisualStudioCode', 'Studio Code Server', '5.18.1', True, 'p'), ('Database', 'MariaDB', '2.7.2', True, 't'), ('Network', 'Network UPS Tools', '0.13', False, 'w')]]))
page_board('M04AppsInstalled', 'Apps, installed', P2, apps_i, S, caption='Installed apps: running state live, Open on each')

store = (header('App store', 'Official and community apps', 'Settings › Apps', row(search('Search apps', w=320), tools(), gap=10)) + chips('All', 'Official', 'Community', 'Media', 'Networking')
         + '<div style="height:16px"></div>' + grid(4, *[card(ico(i, t, 52, 18, 26), f'<b>{n}</b>', f'<span class="sm mu">{d}</span>', row(pill(k, t)), pad=18) for i, n, d, k, t in
                                                         [('Antenna', 'Mosquitto broker', 'An MQTT broker', 'Official', 'p'), ('Dns', 'AdGuard Home', 'Network-wide ad blocking', 'Community', 't'), ('Cctv', 'Frigate', 'Camera recording with detection', 'Community', 'w'),
                                                          ('Zigbee', 'Zigbee2MQTT', 'Zigbee through MQTT', 'Community', 'g'), ('Folder', 'Samba share', 'Reach /config from a computer', 'Official', 'p'), ('Console', 'Terminal and SSH', 'A shell on this machine', 'Official', 'p'),
                                                          ('Music', 'Music Assistant', 'Your music library', 'Community', 't'), ('BackupRestore', 'Google Drive backup', 'Off-site backups', 'Community', 'w')]]))
page_board('M04AppStore', 'App store', P2, store, S, caption='App store: tiles with their source as a pill')

oneapp = (header('Studio Code Server', 'Version 5.18.1 · by the community', 'Settings › Apps', row(btn('Open web UI', 'fill', 'OpenInNew'), tools(), gap=10), back=True, tabs=(['Info', 'Configuration', 'Log'], 0))
          + grid('1.5fr 1fr', card(row(live('Running'), '<span class="grow"></span>', btn('Stop', 'out', 'Stop'), btn('Restart', 'ton', 'Restart')), row('<b class="grow">Start on boot</b>', switch()), row('<b class="grow">Watchdog</b>', switch()), row('<b class="grow">Show in sidebar</b>', switch(False)), title='Running'),
                               card(stats(('4%', 'CPU', 'p'), ('312 MB', 'Memory', 't')), title='Use')))
page_board('M04OneApp', 'One app', P2, oneapp, S, caption='One app: controls grouped, use as two stats')

dashes = (header('Dashboards', '2 dashboards and 1 resource', 'Settings › Dashboards', row(btn('Add dashboard', 'fill', 'Plus'), tools(), gap=10), tabs=(['Dashboards', 'Resources'], 0))
          + table(['Dashboard', 'Who sees it', 'On the pane', 'Mode'], [[f'<span class="row" style="gap:10px">{ico(i, t, 32, 10, 18)}<b>{n}</b></span>', w, switch(s), pill(m, t)] for i, n, w, s, m, t in
                                                                         [('ViewDashboard', 'Overview', 'Everyone', True, 'Auto', 'p'), ('ViewDashboard', 'My home', 'Everyone', True, 'Storage', 't'), ('Map', 'Map', 'Admins', False, 'Built in', 'n')]], ['2fr', '1fr', '1fr', '1fr'], toolbar=False))
page_board('M04Dashboards', 'Dashboards and resources', P2, dashes, S, caption='Dashboards: who sees each, a switch to put it on the pane')

write_index('Home Assistant Material, modern: Settings', [(P1, 'Settings: devices, entities, helpers, automations and their history'), (P2, 'Settings: the settings home, scenes, scripts, blueprints, areas, apps, dashboards')], 'M03Integrations')
