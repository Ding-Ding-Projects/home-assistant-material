"""Modern remake, group 3: System and tools (canvases 05 and 06)."""
from ui import *

begin('system')
P1, P2 = 'system', 'tools'
S = 'Settings'
D = 'Developer'

# ---- 05 ----
va = (header('Voice assistants', '2 assistants', 'Settings › Voice assistants', row(btn('Add assistant', 'fill', 'Plus'), tools(), gap=10), tabs=(['Assistants', 'Expose', 'Wake words'], 0))
      + grid(2, *[card(row(ico('Robot', t, 52, 18, 26), col(f'<b class="h3">{n}</b>', f'<span class="sm mu">{s}</span>', gap=2, style='flex:1'), pill('Preferred', t) if p else ''),
                       row(*[pill(x) for x in xs], gap=6), row(btn('Try it', 'ton', 'Microphone', 'sm'), '<span class="grow"></span>', btn('Edit', 'txt', size='sm')), pad=20)
                  for n, s, xs, p, t in [('Home Assistant', 'English · local', ['Speech: Whisper', 'Agent: Home Assistant', 'Voice: Piper'], True, 'p'),
                                         ('Ollama', 'English · local model', ['Speech: Whisper', 'Agent: Ollama', 'Voice: Piper'], False, 't')]]))
page_board('M05Voice', 'Voice assistants', P1, va, S, caption='Voice assistants: one card per assistant, its stages as pills')

stg = lambda i, n, v, t, d: card(row(ico(i, t), col(f'<b class="h3">{n}</b>', f'<span class="sm mu">{d}</span>', gap=2, style='flex:1')), field(n, v), pad=18)
ova = (header('Home Assistant', 'Four stages, from your voice to an answer', 'Settings › Voice assistants', tools('Play'), back=True)
       + grid(4, stg('Microphone', 'Wake word', 'Okay Nabu', 'p', 'Starts listening'), stg('TextRecognition', 'Speech to text', 'Whisper · base', 't', 'Writes down what you said'),
              stg('Robot', 'Conversation agent', 'Home Assistant', 'g', 'Works out what to do'), stg('AccountVoice', 'Text to speech', 'Piper · Amy', 'w', 'Says the answer'))
       + '<div style="height:16px"></div>' + card(row(*[f'<span style="flex:1;height:10px;border-radius:5px;background:var({c})"></span>' for c in ['--p', '--t', '--ok', '--w']], gap=8),
                                                   row(live('Last run: 1.4 s end to end'), '<span class="grow"></span>', btn('Debug a run', 'ton', 'Bug')), title='Pipeline'))
page_board('M05OneVoice', 'One voice assistant, its four stages', P1, ova, S, caption='One assistant: four stage cards, the pipeline as a coloured run')

expo = header('Expose', 'What each assistant can control', 'Settings › Voice assistants', tools(), tabs=(['Assistants', 'Expose', 'Wake words'], 1)) + table(['Entity', 'Assist', 'Google', 'Alexa', 'Aliases'],
        [[f'<span class="row" style="gap:10px">{ico(i, t, 32, 10, 18)}<b>{n}</b></span>', switch(a), switch(g), switch(x), f'<span class="sm mu">{al}</span>'] for i, n, a, g, x, al, t in
         [('Lightbulb', 'Ceiling', 1, 1, 0, 'big light', 'w'), ('Lock', 'Front door', 1, 0, 0, '', 'g'), ('Thermostat', 'Ecobee', 1, 1, 1, 'heating', 'p'), ('Garage', 'Garage door', 0, 0, 0, '', 'e')]], ['2fr', '1fr', '1fr', '1fr', '1fr'], sel={1})
page_board('M05Expose', 'Expose entities to assistants', P1, expo + actionbar(abtn('Expose', 'Eye'), abtn('Hide', 'EyeOff'), note='1 selected'), S, caption='Expose: one switch per assistant per entity')

tags = (header('Tags', '3 tags', 'Settings › Tags', row(btn('Write a tag', 'fill', 'Nfc'), tools(), gap=10))
        + grid(3, *[card(f'<div class="thumb" style="height:120px;border-radius:50%;width:120px;margin:0 auto">{I("Nfc", 46)}</div>', f'<b class="h3" style="text-align:center">{n}</b>', f'<span class="sm mu" style="text-align:center">{s}</span>', row(btn('Automate', 'ton', 'Robot', 'sm'), btn('Write', 'txt', size='sm'), style='justify-content:center'), pad=20)
                    for n, s in [('Front door', 'Scanned 2 h ago'), ('Bedside', 'Scanned yesterday'), ('Car', 'Never scanned')]]))
page_board('M05Tags', 'Tags', P1, tags, S, caption='Tags: round tag cards, Automate on each')

ppl = (header('People', '3 people', 'Settings › People', row(btn('Add person', 'fill', 'Plus'), tools(), gap=10))
       + grid(3, *[card(row(avatar(a, t, 64), col(f'<b class="h3">{n}</b>', f'<span class="sm mu">{s}</span>', live(z) if h else pill(z), gap=4)), row(pill(u, 'n'), '<span class="grow"></span>', ib('DotsVertical')), pad=20)
                   for a, n, s, z, h, u, t in [('TO', 'Test Owner', 'Owner', 'Home', 1, 'Can sign in', 't'), ('AL', 'Alex', 'Phone tracked', 'Home', 1, 'Can sign in', 'g'), ('SK', 'Sam', 'Phone tracked', 'Work', 0, 'No account', 'w')]]))
page_board('M05People', 'People', P1, ppl, S, caption='People: avatars, where each is, whether they can sign in')

usr = header('Users', '3 users', 'Settings › People › Users', row(btn('Add user', 'fill', 'Plus'), tools(), gap=10)) + table(['Name', 'Username', 'Group', 'Sign in', ''],
       [[f'<span class="row" style="gap:10px">{avatar(a, t, 32)}<b>{n}</b></span>', f'<span class="mono">{u}</span>', pill(g, gt), sg, ib('DotsVertical')] for a, n, u, g, gt, sg, t in
        [('TO', 'Test Owner', 'test', 'Owner', 'w', 'Anywhere', 't'), ('AL', 'Alex', 'alex', 'Admin', 'p', 'Local only', 'g'), ('HA', 'Home Assistant Content', '—', 'System', 'n', 'Never', 'p')]], ['2fr', '1fr', '1fr', '1fr', '60px'])
page_board('M05Users', 'Users', P1, usr, S, caption='Users: groups as coloured pills')

ens = (header('Energy setup', 'Tell Home Assistant where energy comes from', 'Settings › Energy', tools()) + steps(['Grid', 'Solar', 'Battery', 'Gas', 'Water', 'Devices'], 1)
       + '<div style="height:16px"></div>' + grid('1.3fr 1fr', card(lrow('SolarPower', 'Solar production', 'sensor.solar_energy · kWh', btn('Edit', 'txt', size='sm'), 'g'), f'<div class="row" style="gap:10px;padding:14px;border-radius:16px;border:1.5px dashed var(--out);color:var(--mu)">{I("Plus", 20)}Add another source</div>',
                                                                         row(btn('Back', 'txt'), '<span class="grow"></span>', btn('Next: battery', 'fill')), title='Solar panels'),
                                                                    card(spark([0, 0, 1, 3, 6, 8, 9, 8, 6, 3, 1, 0], 'g', 160), '<span class="sm mu">Yesterday\'s production, to check the sensor</span>', title='Preview')))
page_board('M05EnergySetup', 'Energy setup', P1, ens, S, caption='Energy setup: a stepper, each source in a card, a preview to check it')

cloud = (header('Home Assistant Cloud', 'Signed in as test@example.com', 'Settings › Cloud', tools()) + hero('CloudCheck', 'Connected', 'Remote access and voice assistants are on.', 'g', btn('Manage account', 'out'))
         + '<div style="height:16px"></div>' + grid(3, *[card(row(ico(i, t), f'<b class="grow h3">{n}</b>', switch(o)), f'<span class="sm onv">{d}</span>', pad=18)
                                                         for i, n, d, o, t in [('Web', 'Remote access', 'Reach this home from anywhere over HTTPS.', 1, 'p'), ('Google', 'Google Assistant', '14 entities exposed', 1, 't'), ('MicrophoneMessage', 'Alexa', 'Off', 0, 'w')]]))
page_board('M05Cloud', 'Home Assistant Cloud', P1, cloud, S, caption='Cloud: connection as a hero, each service a switch card')

sysh = (header('System', '', 'Settings › System', row(btn('Restart', 'out', 'Restart'), tools(), gap=10))
        + tiles([('Update', 'Updates', '4 ready'), ('Wrench', 'Repairs', '1 to fix'), ('TextBoxSearch', 'Logs', '2 errors today'), ('Backup' if False else 'BackupRestore', 'Backups', 'Last: today 03:00'),
                 ('Lan', 'Network', '192.168.1.20'), ('Harddisk', 'Storage', '38% used'), ('Chip', 'Hardware', 'Raspberry Pi 5'), ('Cog', 'General', 'Name, units, location'),
                 ('Flask', 'Labs', '3 previews'), ('ChartBar', 'Analytics', 'Basic sharing'), ('Robot', 'AI and entity IDs', 'Suggestions on'), ('Power', 'Restart options', 'Safe mode, reboot')]))
page_board('M05System', 'System', P1, sysh, S, caption='System: every system page as a tile with its state')

upd = (header('Updates', '4 ready', 'Settings › System', row(btn('Update all', 'fill', 'Update'), tools(), gap=10))
       + lst([('HomeAssistant', 'Home Assistant Material', '2026.11.1.137 → 2026.11.1.140', row(btn('Notes', 'txt', size='sm'), btn('Update', 'ton', size='sm')), 'p'),
              ('Puzzle', 'Studio Code Server', '5.18.1 → 5.19.0', row(btn('Notes', 'txt', size='sm'), btn('Update', 'ton', size='sm')), 't'),
              ('Lightbulb', 'Living Room Bulb', 'Firmware 1.65 → 1.66', row(btn('Notes', 'txt', size='sm'), btn('Update', 'ton', size='sm')), 'w'),
              ('Chip', 'ESPHome hall', '2026.10 → 2026.11', row(f'<span style="width:120px">{busy(8)}</span>', '<span class="sm mu">Installing 40%</span>', gap=10), 'g')], 'Ready'))
page_board('M05Updates', 'Updates', P1, upd, S, caption='Updates: one row each, an install in progress shimmers')

rep = (header('Repairs', '1 to fix', 'Settings › System', tools()) + card(row(ico('Earth', 'w', 52, 18, 26), col('<b class="h3">The country has not been set</b>', '<span class="sm mu">Some integrations need it to pick the right defaults.</span>', gap=2, style='flex:1'), btn('Fix', 'fill')), pad=20)
       + '<div style="height:16px"></div>' + lst([('CheckCircle', 'Deprecated YAML for the sun', 'Fixed yesterday', pill('Fixed', 'g'), 'g'), ('EyeOff', 'Old Z-Wave stick', 'Ignored', btn('Show again', 'txt', size='sm'), 'n')], 'Earlier'))
page_board('M05Repairs', 'Repairs', P1, rep, S, caption='Repairs: what to fix on top, the history below')

logs = (header('Logs', 'Core log, this boot', 'Settings › System', row(seg(['Condensed', 'Raw']), btn('Download', 'out', 'Download'), tools(), gap=10)) + row(search('Search logs', w=420), chips('Errors', 'Warnings', 'Info'), gap=10) + '<div style="height:14px"></div>'
        + lst([('AlertCircle', 'Error setting up Kasa: connection timed out', 'homeassistant.components.kasa · 3 times · last 10:42', pill('Error', 'e'), 'e'),
               ('Alert', 'Entity sensor.old_garage is unavailable', 'homeassistant.helpers.entity · 12:01', pill('Warning', 'w'), 'w'),
               ('Alert', 'Template uses a deprecated filter', 'homeassistant.helpers.template · 08:14', pill('Warning', 'w'), 'w'),
               ('InformationOutline', 'Home Assistant started in 14.2 s', 'homeassistant.core · 07:00', pill('Info'), 'p')]))
page_board('M05Logs', 'Logs', P1, logs, S, caption='Logs: grouped messages with severity pills')

bk = (header('Backups', 'Automatic: every day at 03:00', 'Settings › System', row(btn('Back up now', 'fill', 'Plus'), tools(), gap=10))
      + grid(3, stat('Today 03:00', 'Last backup', 'g', 'CheckCircle'), stat('3 locations', 'Stored in', 'p', 'Cloud'), stat('Tomorrow 03:00', 'Next', 't', 'ClockOutline'))
      + '<div style="height:16px"></div>' + lst([('Archive', 'Automatic backup 2026.11.12', '1.2 GB · this machine, NAS, Cloud', row(btn('Restore', 'ton', size='sm'), ib('Download')), 'p'),
                                                 ('Archive', 'Automatic backup 2026.11.11', '1.2 GB · this machine, NAS', row(btn('Restore', 'ton', size='sm'), ib('Download')), 'p'),
                                                 ('Archive', 'Before the 2026.11 update', '1.1 GB · this machine', row(btn('Restore', 'ton', size='sm'), ib('Download')), 't')], 'Backups'))
page_board('M05Backups', 'Backups', P1, bk, S, caption='Backups: three numbers, then each backup with Restore')

bks = header('Backup settings', '', 'Settings › Backups', tools()) + form([('Automatic backups', '', [('Schedule', 'When backups run', seg(['Daily', 'Weekly', 'Off'])), ('Time', '', chip('03:00', True)), ('Keep', 'Older ones are removed', chip('7 backups', True))]),
                                                                         ('Locations', '', [('This machine', '/backup', switch()), ('NAS', 'smb://nas/backups', switch()), ('Home Assistant Cloud', 'Encrypted, 5 GB', switch())]),
                                                                         ('Encryption key', '', [('Key', 'Needed to restore anywhere else', row(btn('Show', 'txt', 'Eye'), btn('Download', 'ton', 'Download'), gap=6))])])
page_board('M05BackupSettings', 'Backup settings', P1, bks, S, caption='Backup settings: schedule, where, and the key')

ana = header('Analytics', 'What this home shares', 'Settings › System', tools()) + grid('1.3fr 1fr', form([('', '', [('Basic', 'Version and installation type', switch()), ('Usage', 'Which integrations are set up', switch()), ('Statistics', 'Counts of devices and entities', switch(False)), ('Diagnostics', 'Crash reports', switch(False))])]),
                                                                                                card(code('{\n  "version": "2026.11.1",\n  "installation_type": "Container",\n  "integrations": 8\n}'), title='What would be sent today'))
page_board('M05Analytics', 'Analytics', P1, ana, S, caption='Analytics: switches beside a preview of exactly what is sent')

# ---- 06 ----
net = header('Network', '', 'Settings › System', tools()) + grid(2, card(kv([('Address', '192.168.1.20/24'), ('Gateway', '192.168.1.1'), ('DNS', '1.1.1.1'), ('IPv6', 'Automatic')]), seg(['Automatic', 'Static', 'Off']), title='eth0', action=live('Connected')),
                                                                   card(field('Home Assistant URL', 'http://homeassistant.local:8123', 'Lan'), field('External URL', 'https://home.example.com', 'Web'), title='URLs'))
page_board('M06Network', 'Network', P2, net, S, caption='Network: the interface with its state, URLs beside')

sto = header('Storage', '38% of 64 GB used', 'Settings › System', tools()) + grid('1fr 1.4fr', card(ring(38, '38%', 'p', 200), '<span class="sm mu" style="text-align:center">24.3 of 64 GB</span>', style='align-items:center'),
                                                                                          card(*[col(row(f'<b class="grow">{n}</b>', f'<span class="sm mu">{s}</span>'), bar(p, t), gap=6) for n, s, p, t in [('Database', '9.1 GB', 60, 'p'), ('Backups', '8.4 GB', 52, 't'), ('Media', '4.2 GB', 28, 'w'), ('Apps', '2.6 GB', 18, 'g')]], title='What uses it', gap=16))
page_board('M06Storage', 'Storage', P2, sto, S, caption='Storage: a ring that fills in, then what uses the space')

hw = header('Hardware', 'Raspberry Pi 5 · 8 GB', 'Settings › System', row(btn('All hardware', 'out', 'Chip'), tools(), gap=10)) + grid(3, card(spark([12, 18, 14, 22, 30, 24, 18, 16, 20, 14], 'p', 110), '<b class="h2">14%</b>', title='Processor', action=live()),
                                                                                                                                        card(spark([38, 39, 40, 41, 41, 42, 42, 41, 42, 43], 't', 110), '<b class="h2">3.4 GB</b>', title='Memory'), card(spark([48, 50, 52, 51, 53, 55, 54, 52, 51, 50], 'w', 110), '<b class="h2">50 °C</b>', title='Temperature'))
page_board('M06Hardware', 'Hardware', P2, hw, S, caption='Hardware: three live lines that draw themselves')

gen = header('General', '', 'Settings › System', tools()) + form([('', '', [('Name', '', field('', 'Home')), ('Time zone', '', chip('America/Toronto', True)), ('Elevation', 'Metres above sea level', chip('76 m')), ('Units', '', seg(['Metric', 'US customary'])), ('Currency', '', chip('CAD', True)), ('Language', 'For the backend and voice', chip('English', True))])])
page_board('M06General', 'General', P2, gen, S, caption='General: one calm card of settings')

labs = header('Labs', 'Try what is coming', 'Settings › System', tools()) + grid(3, *[card(f'<div class="thumb" style="height:120px">{I(i, 40)}</div>', row(f'<b class="h3 grow">{n}</b>', switch(o)), f'<span class="sm onv">{d}</span>', pill(s, t), pad=16)
                                                                                   for i, n, d, o, s, t in [('ViewDashboardVariant', 'Sections everywhere', 'Every dashboard uses sections.', 1, 'Preview', 'p'), ('Animation', 'Motion editor', 'Tune every animation and transition.', 1, 'New', 't'), ('Brain', 'Local AI suggestions', 'Names and areas from a local model.', 0, 'Experimental', 'w')]])
page_board('M06Labs', 'Labs', P2, labs, S, caption='Labs: a picture, a switch and how ready it is')

ai = header('AI and entity IDs', '', 'Settings › System', tools()) + grid('1fr 1fr', form([('Suggestions', '', [('Suggest names', 'When a device is added', switch()), ('Suggest areas', '', switch()), ('Model', 'Runs on this machine', chip('Ollama · llama3.2', True))])]),
                                                                                       card(row(f'<span class="mono">sensor.0x00158d0001a2b3c4_temperature</span>'), f'<div style="text-align:center;color:var(--p)">{I("ArrowDown", 24)}</div>', row('<span class="mono" style="color:var(--ok)">sensor.hall_temperature</span>'), btn('Apply to 12 entities', 'fill'), title='Entity ID format'))
page_board('M06AI', 'AI and entity IDs', P2, ai, S, caption='AI and entity IDs: the rename shown as before and after')

rs = over(header('System', '', '', tools()) + tiles([('Update', 'Updates', '4 ready'), ('Wrench', 'Repairs', '1 to fix'), ('TextBoxSearch', 'Logs', '2 errors')]),
          dialog('Restart', col(*[row(ico(i, t, 44, 14, 22), col(f'<b>{n}</b>', f'<span class="sm mu">{d}</span>', gap=2, style='flex:1'), I('ChevronRight', 20, 'mu')) for i, n, d, t in
                                  [('Refresh', 'Quick reload', 'Reload YAML without restarting', 'p'), ('Restart', 'Restart Home Assistant', 'Stops automations for about a minute', 'w'), ('ShieldOutline', 'Safe mode', 'Start without custom integrations', 't'), ('Power', 'Reboot the system', 'Restarts the whole machine', 'e')]], gap=10),
                 'Power', 'w', w=520, actions=btn('Cancel', 'txt')))
page_board('M06Restart', 'Restart options', P2, rs, S, caption='Restart: four choices, from gentlest to strongest')

dt = lambda i: header('Developer tools', '', '', tools(), tabs=(['YAML', 'States', 'Actions', 'Template', 'Events', 'Statistics', 'Assist', 'Debug'], i))
yml = dt(0) + grid(2, card(note('Check the configuration before restarting.', 'p'), btn('Check configuration', 'fill', 'CheckCircleOutline'), note('Configuration is valid.', 'g', 'CheckCircle'), title='Check and restart'),
                   card(*[row(f'<span class="grow">{n}</span>', btn('Reload', 'ton', 'Refresh', 'sm')) for n in ['Automations', 'Scripts', 'Scenes', 'Groups', 'Templates']], title='Reload YAML', gap=8))
page_board('M06DevYaml', 'Developer tools, YAML', P2, yml, D, caption='YAML: check, then reload just what changed')

stt = dt(1) + table(['Entity', 'State', 'Attributes'], [[f'<span class="mono">{a}</span>', f'<b>{b}</b>', f'<span class="sm mu ell">{c}</span>'] for a, b, c in
                                                      [('light.living_room_ceiling', 'on', 'brightness: 178 · color_mode: color_temp'), ('sensor.hall_temperature', '20.4', 'unit: °C · device_class: temperature'), ('lock.front_door', 'unlocked', 'friendly_name: Front door'),
                                                       ('sun.sun', 'above_horizon', 'next_setting: 16:48'), ('zone.home', '2', 'radius: 100')]], ['1.6fr', '1fr', '2fr'])
page_board('M06DevStates', 'Developer tools, States', P2, stt, D, caption='States: entity IDs in mono, attributes on one line')

act = dt(2) + grid(2, card(field('Action', 'light.turn_on', 'Flash', mono=True), field('Target', 'Living room', 'Sofa'), field('Brightness', '60%'), row(seg(['UI', 'YAML']), '<span class="grow"></span>', btn('Perform action', 'fill', 'Play')), title='Action'),
                   card(code('response:\n  success: true\n  changed: 2 entities'), note('Performed in 84 ms.', 'g', 'CheckCircle'), title='Response'))
page_board('M06DevActions', 'Developer tools, Actions', P2, act, D, caption='Actions: a form, then the response beside it')

tpl = dt(3) + grid(2, card(code('{% set t = states("sensor.hall_temperature") | float %}\nIt is {{ t }} °C in the hall,\n{{ "warm" if t > 20 else "cool" }}.'), title='Template'),
                   card('<div class="h2">It is 20.4 °C in the hall, warm.</div>', row(pill('Result type: string'), pill('Listens to 1 entity', 't')), title='Result', action=live('Live')))
page_board('M06DevTemplate', 'Developer tools, Template', P2, tpl, D, caption='Template: code on the left, the live result on the right')

evt = dt(4) + grid(2, card(field('Event type', 'my_event', mono=True), code('who: test\nwhat: hello'), btn('Fire event', 'fill', 'Send'), title='Fire'),
                   card(field('Listen to', 'state_changed', mono=True), row(btn('Start listening', 'ton', 'EarHearing'), live('Listening')), code('event_type: state_changed\nentity_id: light.kitchen\nnew_state: on'), title='Listen'))
page_board('M06DevEvents', 'Developer tools, Events', P2, evt, D, caption='Events: fire on one side, listen on the other')

stc = dt(5) + table(['Statistic', 'Source', 'Unit', 'Issue', ''], [[f'<span class="mono">{a}</span>', b, c, pill(d, t) if d else '<span class="mu">None</span>', btn('Fix', 'ton', size='sm') if d else ''] for a, b, c, d, t in
                                                                  [('sensor.energy_used', 'Recorder', 'kWh', '', 'n'), ('sensor.old_garage', 'Recorder', '°C', 'Entity no longer exists', 'w'), ('sensor.gas', 'Recorder', 'm³', 'Unit changed', 'e')]], ['2fr', '1fr', '80px', '1.4fr', '80px'])
page_board('M06DevStatistics', 'Developer tools, Statistics', P2, stc, D, caption='Statistics: issues as pills with a Fix')

das = dt(6) + grid(2, card(field('Sentence', 'turn off the kitchen lights'), btn('Parse', 'fill', 'Play'), title='Try a sentence'),
                   card(kv([('Intent', 'HassTurnOff'), ('Area', 'Kitchen'), ('Domain', 'light'), ('Matched', '2 entities')]), note('Understood by the built-in agent.', 'g', 'CheckCircle'), title='Result'))
page_board('M06DevAssist', 'Developer tools, Assist', P2, das, D, caption='Assist: a sentence in, the understood intent out')

dbg = dt(7) + grid('1fr 1.3fr', card(*[row(f'<b class="grow">{n}</b>', switch(o)) for n, o in [('Debug logging', 0), ('Profile the event loop', 0), ('Show entity IDs in the UI', 1)]], title='Debug'),
                   lst([('Play', 'light.turn_on', 'Kitchen · 2 min ago · 84 ms', pill('OK', 'g'), 'g'), ('Play', 'lock.lock', 'Front door · 6 min ago · failed', pill('Failed', 'e'), 'e'), ('Play', 'script.night_path', '1 h ago · 5.0 s', pill('OK', 'g'), 'g')], 'Action history'))
page_board('M06DevDebug', 'Developer tools, Debug and action history', P2, dbg, D, caption='Debug: switches, then every action performed and how it went')

write_index('Home Assistant Material, modern: System and tools', [(P1, 'System: voice, people, energy, cloud, updates, repairs, logs, backups'), (P2, 'Tools: network, storage, hardware, labs, restart, developer tools')], 'M05Voice')
