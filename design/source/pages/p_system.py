from lib import *

P = 'system'
C = 'Settings, System'

# ---------- System ----------
def sysrow(icon, title, desc, state='', tone=''):
    st = tag(state, tone) if state else ''
    return (f'<a class="li" href="#{title.lower().replace(" ", "-")}" style="background: var(--sl2); color: var(--on); min-height: 76px; border-radius: 24px"><span class="lead">{I(icon)}</span>'
            f'<span class="col grow"><span class="ll">{title}</span><span class="bs mu">{desc}</span></span>{st}{I("ChevronRight")}</a>')
body = (
    row('<section class="card hero col grow" aria-label="This machine" style="gap: 8px">' + row(I('RaspberryPi', 'l'), '<span class="ll mu">This machine</span>')
        + '<span class="hl">Raspberry Pi 5, running well</span><span class="bl mu">Up for 6 days. Processor 8%, memory 31%, storage 24% used, 52° inside.</span></section>',
        col(btn('Restart', 'tonal lg', 'Restart'), btn('Shut down', 'out lg', 'Power'), gap=8, style='justify-content: center'), gap=24, style='align-items: stretch')
    + grid(2, sysrow('Update', 'Updates', 'Home Assistant, the operating system and apps', '2 ready', 'p'), sysrow('Wrench', 'Repairs', 'Problems Home Assistant found', '1 open', 'a'),
           sysrow('BackupRestore', 'Backups', 'Last one today at 4:45 am', 'Up to date', 'g'), sysrow('TextBoxSearch', 'Logs', 'What Home Assistant and its apps wrote down'),
           sysrow('Lan', 'Network', 'Names, addresses and adapters'), sysrow('Harddisk', 'Storage', '24% of 256 GB used'),
           sysrow('Chip', 'Hardware', 'Processor, memory and connected hardware'), sysrow('Cog', 'General', 'Name, location, units and time zone'),
           sysrow('ChartBox', 'Analytics', 'What you share to help the project', 'Basic only'), sysrow('Flask', 'Labs', 'Try features before they are finished', '1 on'),
           sysrow('Creation', 'AI and entity names', 'Which model helps, and how IDs are formed'), sysrow('InformationOutline', 'About', 'Version 2026.11.1.42, licences'), gap=12)
)
surf(P, 'System', 'System', 'Settings', 'System', body)

# ---------- Updates ----------
def upd(icon, name, frm, to, noteline, tone=''):
    lead = f' style="background: var(--{tone}); color: var(--on-{tone})"' if tone else ''
    return (f'<div class="li" style="background: var(--sl1); min-height: 80px"><span class="lead"{lead}>{I(icon)}</span><span class="col grow"><span class="ll">{name}</span><span class="bs mu">{noteline}</span></span>'
            f'<span class="row mono bs" style="gap: 8px">{frm}{I("ArrowRight", "s")}<b>{to}</b></span>{btn("Notes", "text", None, True)}{btn("Update", "tonal", None, True)}</div>')
body = (
    row('<section class="card hero col grow" aria-label="Updates" style="background: var(--pc); color: var(--on-pc); gap: 8px"><span class="ll">Updates</span><span class="hl">2 are ready</span>'
        '<span class="bl">Checked 12 minutes ago. Updates come from this project’s own feed.</span></section>',
        col(btn('Update all', 'fill lg', 'Update'), btn('Check now', 'out lg', 'Refresh'), gap=8, style='justify-content: center'), gap=24, style='align-items: stretch')
    + col(upd('HomeAssistant', 'Home Assistant Material', '2026.11.1.42', '2026.11.1.43', 'The core and this interface. Takes about 4 minutes.', 'pc'),
          upd('Puzzle', 'Studio Code Server', '5.17.3', '5.18.0', 'App.'), gap=4)
    + grid(2, group('Before updating', setting('BackupRestore', 'Back up first', 'A backup is made before each update', sw(True, 'Back up before updating')),
                    setting('History', 'Keep the last', '3 update backups', I('ChevronRight'))),
           group('Up to date', setting('Linux', 'Operating system', '18.5.42', tag('Current', 'g')), setting('ShieldHome', 'Supervisor', '2026.11.0.42', tag('Current', 'g')),
                 setting('Zigbee', 'Zigbee coordinator firmware', '7.4.4', tag('Current', 'g'))), gap=16)
    + row('<span class="bs mu grow">Skipped updates stay listed under More. Beta versions are off.</span>', btn('Join the beta channel', 'text', None, True))
)
surf(P, 'Updates', 'Updates', C, 'Updates', body)

# ---------- Repairs ----------
def issue(icon, title, text, tone, action):
    return card(row(f'<span class="sq" style="background: var(--sl0)">{I(icon)}</span>', f'<div class="col grow"><span class="tm">{title}</span><span class="bm">{text}</span></div>'),
                row('<span class="grow"></span>', btn('Ignore', 'text', None, True), btn(action, 'tonal', None, True, 'background: var(--sl0); color: var(--on)')), label=title, style=f'padding: 24px; background: var(--{tone})', gap=12)
body = (
    head('Repairs', 'Things Home Assistant noticed and can help you fix.')
    + row(col(issue('PowerPlugOff', 'The Garden plug needs to be set up again', 'It stopped answering 19 hours ago and its address changed. Two steps, about a minute.', 'amberc', 'Fix it'),
              card(row(f'<span class="sq" style="background: var(--greenc); color: var(--green)">{I("Check")}</span>', '<div class="col grow"><span class="tm">Nothing else to repair</span><span class="bm mu">3 issues were fixed this month. 1 is ignored.</span></div>', btn('Show ignored', 'text', None, True)), label='All clear', style='padding: 24px'),
              gap=12, style='flex: 3; min-width: 0'),
          card('<h2 class="tm">Fixing the Garden plug, step 1 of 2</h2>', track(50, 'Step 1 of 2'), '<p class="bm mu">Found a TP-Link plug at 192.168.1.87 with the same serial number. Is this the Garden plug?</p>',
               field('New address', '192.168.1.87', 'IpNetwork', mono=True), row(btn('No, search again', 'out', None, True), '<span class="grow"></span>', btn('Yes, use it', 'fill', None, True)), label='Repair steps', style='flex: 2; min-width: 0; padding: 24px'),
          gap=20, style='align-items: flex-start')
    + grid(3, stat('System health', 'Good', 'All checks pass', 'g', 'HeartPulse'), stat('Integrations starting slowly', 'None', 'Slowest: 1.8 seconds'), stat('Unsupported', 'Nothing', 'This installation is supported', '', 'ShieldCheck'))
)
surf(P, 'Repairs', 'Repairs', C, 'Repairs', body)

# ---------- Logs ----------
def logline(time, level, source, text):
    c = {'ERROR': 'err', 'WARNING': 'amber', 'INFO': 'onv'}[level]
    bg = {'ERROR': 'errc', 'WARNING': 'amberc', 'INFO': 'sl3'}[level]
    return (f'<div class="row mono bs" style="gap: 12px; padding: 6px 12px; border-radius: 10px; align-items: baseline"><span class="mu">{time}</span>'
            f'<span class="tag" style="background: var(--{bg}); color: var(--{c}); height: 20px">{level}</span><span style="color: var(--p)">{source}</span><span class="grow">{text}</span></div>')
body = (
    head('Logs', 'What Home Assistant wrote down, newest last.', select('Source', 'Home Assistant Core'), btn('Download', 'out', 'Download'))
    + toolbar('Search logs', chip('Errors', True), chip('Warnings', True), chip('Info'), chip('Follow new lines', True, 'ArrowDownBold'), right=seg(['Summary', 'Raw'], 'Raw', 'View'))
    + card(logline('21:13:58', 'INFO', 'homeassistant.components.automation', 'Evening lights: running'),
           logline('21:13:41', 'WARNING', 'homeassistant.components.tplink', 'Garden plug at 192.168.1.64 is not answering, try 14'),
           logline('21:09:12', 'ERROR', 'homeassistant.components.tuya', 'Sign-in expired. Open the Tuya integration and sign in again.'),
           logline('21:02:07', 'INFO', 'homeassistant.components.lock', 'Front door lock: locked by automation Lock up at night'),
           logline('20:47:33', 'INFO', 'homeassistant.components.light', 'light.living_ceiling turned on, brightness 204'),
           logline('20:31:10', 'WARNING', 'homeassistant.helpers.entity', 'Update of sensor.printer_ink is taking over 10 seconds'),
           logline('20:30:02', 'INFO', 'homeassistant.core', 'Timer out of sync by 0.4 seconds, corrected'),
           label='Log lines', style='padding: 16px 12px; border-radius: 28px', gap=2)
    + grid(3, stat('Errors in the last day', '3', 'All from Tuya', 'e', 'AlertCircle'), stat('Warnings', '41', '38 from the Garden plug', 'a', 'Alert'), stat('Log level', 'Info', 'Change it per integration'))
)
surf(P, 'Logs', 'Logs', C, 'Logs', body)

# ---------- Backups ----------
body = (
    row('<section class="card hero col grow" aria-label="Backups" style="background: var(--greenc); color: var(--green); gap: 8px">' + row(I('BackupRestore', 'l'), '<span class="ll">Backups</span>')
        + '<span class="hl">Backed up today at 4:45 am</span><span class="bl">Next automatic backup tomorrow at 4:45 am. Copies are in 2 places and encrypted.</span></section>',
        col(btn('Back up now', 'fill lg', 'Plus'), btn('Restore', 'tonal lg', 'Restore'), btn('Settings', 'out lg', 'Cog'), gap=8, style='justify-content: center'), gap=24, style='align-items: stretch')
    + grid(3, stat('On this machine', '7 backups', '4.1 GB', '', 'Harddisk'), stat('Home Assistant Cloud', '1 backup', 'The newest, 612 MB', '', 'Cloud'), stat('Network share', '14 backups', 'nas.local, 8.6 GB', '', 'Nas'))
    + table([('Backup', 3), ('Made', 2), ('Size', 1), ('Kept in', 2), ('', 1)],
            [[('Automatic backup', 'Everything'), 'Today, 4:45 am', '612 MB', tag('Here') + tag('Cloud') + tag('Share'), ib('DotsVertical', 'More')], [('Before update 2026.11.1.42', 'Settings and history'), 'Friday, 9:10 pm', '590 MB', tag('Here'), ib('DotsVertical', 'More')],
             [('Automatic backup', 'Everything'), 'Yesterday, 4:45 am', '608 MB', tag('Here') + tag('Share'), ib('DotsVertical', 'More')], [('Before the kitchen rewire', 'Made by Sam'), '28 October', '571 MB', tag('Share'), ib('DotsVertical', 'More')]], 'Backups', 'Archive')
    + row('<span class="bs mu grow">Showing 4 of 22.</span>', btn('Show all', 'text', None, True), btn('Upload a backup', 'out', 'Upload', True))
)
surf(P, 'Backups', 'Backups', C, 'Backups', body)

# ---------- Backup settings ----------
body = grid(2,
    col(group('Automatic backups', setting('CalendarClock', 'When', 'Every day at about 4:45 am', btn('Change', 'text', None, True)), setting('DeleteClock', 'Keep', 'The last 7', btn('Change', 'text', None, True)),
              setting('BellRing', 'Tell me if one fails', '', sw(True, 'Tell me if a backup fails'))),
        group('What to include', setting('HomeAssistant', 'Settings', 'Always included', tag('Always')), setting('ChartLine', 'History', 'Your recorded states, 410 MB', sw(True, 'Include history')),
              setting('FolderMusic', 'Media', '2.2 GB', sw(False, 'Include media')), setting('Puzzle', 'Apps', 'All 5, with their data', sw(True, 'Include apps'))), gap=12),
    col(group('Where to keep them', setting('Harddisk', 'This machine', 'Keeps 7', sw(True, 'Keep on this machine')), setting('Cloud', 'Home Assistant Cloud', 'Keeps the newest, up to 5 GB', sw(True, 'Keep in the cloud')),
              setting('Nas', 'Network share, nas.local', 'Keeps 14', sw(True, 'Keep on the network share')), row(btn('Add a location', 'tonal', 'Plus', True), style='padding: 4px 16px')),
        card(row(f'<span class="sq" style="background: var(--sl0)">{I("KeyVariant")}</span>', '<div class="col grow"><span class="tm">Encryption key</span><span class="bm">Backups are locked with this key. Without it, a backup cannot be restored on a new machine.</span></div>'),
             row(btn('Show the key', 'tonal', 'Eye', True, 'background: var(--sl0); color: var(--on)'), btn('Download it', 'tonal', 'Download', True, 'background: var(--sl0); color: var(--on)'), '<span class="grow"></span>', btn('Change key', 'text', None, True)),
             label='Encryption key', style='padding: 24px; background: var(--amberc); color: var(--amber)'), gap=12), gap=16)
surf(P, 'BackupSettings', 'Backup settings', 'Settings, System, Backups', 'Backup settings', body)

# ---------- Analytics ----------
body = (
    head('Analytics', 'What this home shares to help the project. All of it is your choice.')
    + row(group('Share', setting('ChartBox', 'Basic', 'Version, installation type and country', sw(True, 'Share basic analytics')),
                setting('PuzzleOutline', 'Which integrations you use', 'Names and counts only', sw(False, 'Share integration names')),
                setting('Counter', 'How much you use', 'Number of entities, automations and users', sw(False, 'Share usage counts')),
                setting('Bug', 'Crash reports', 'Sent when Home Assistant itself fails', sw(False, 'Share crash reports')), style='flex: 1; min-width: 0'),
          card('<h2 class="tm">Exactly what is sent now</h2>', '<pre class="mono bs" style="margin: 0; padding: 16px; border-radius: 16px; background: var(--sl0); white-space: pre-wrap">{\n  "version": "2026.11.1.42",\n  "installation_type": "Home Assistant OS",\n  "country": "CA",\n  "uuid": "a random number, not your name"\n}</pre>',
               '<span class="bs mu">Sent once a day. Never sent: names, addresses, locations, entity states, or anything from your devices.</span>', row(btn('Copy', 'text', 'ContentCopy', True), btn('See the public statistics', 'text', 'OpenInNew', True)),
               label='Preview of the data', style='flex: 1; min-width: 0; padding: 24px'), gap=20, style='align-items: flex-start')
)
surf(P, 'Analytics', 'Analytics', C, 'Analytics', body)

# ---------- Network ----------
body = grid(2,
    col(group('Names and addresses', field('Name on the network', 'homeassistant', 'Lan', mono=True), field('Address at home', 'http://homeassistant.local:8123', 'HomeOutline', mono=True),
              field('Address away from home', 'https://abcd1234.ui.nabu.casa', 'Web', mono=True), setting('Cloud', 'Use Home Assistant Cloud for the away address', '', sw(True, 'Use the cloud address'))),
        group('Secure connection', setting('CertificateOutline', 'Certificate', 'From Home Assistant Cloud, valid', tag('Valid', 'g')), setting('LockOutline', 'Home address uses', 'Plain HTTP on your own network', I('ChevronRight'))), gap=12),
    col(group('Adapters', setting('Ethernet', 'Ethernet, end0', '192.168.1.10, from your router, 1 Gbit', tag('In use', 'p')), setting('Wifi', 'Wi-Fi, wlan0', 'Not connected', btn('Connect', 'tonal', None, True)),
              row(btn('Set a fixed address', 'text', None, True), btn('Name servers', 'text', None, True), style='padding: 0 8px')),
        group('Which adapters integrations may use', setting('AutoFix', 'Choose for me', 'Uses the adapter with the default route', sw(True, 'Choose adapters for me')), note='Turn this off to pick adapters one by one.'),
        card(row(I('Speedometer'), '<div class="col grow"><span class="ll">Check the connection</span><span class="bs mu">Internet reachable, time in sync, name lookups 12 ms.</span></div>', btn('Run again', 'out', None, True)), label='Connection check', style='padding: 20px'), gap=12), gap=16)
surf(P, 'Network', 'Network', C, 'Network', body)

# ---------- Storage ----------
bar = ''.join(f'<span style="flex: {w}; background: var(--{c}); height: 100%"></span>' for w, c in [(9, 'p'), (6, 't'), (5, 'heat'), (3, 'green'), (1, 'amber'), (76, 'sl4')])
def leg(c, n, v): return f'<div class="row" style="gap: 12px; padding: 8px 4px"><span style="width: 14px; height: 14px; border-radius: 5px; background: var(--{c})"></span><span class="bm grow">{n}</span><span class="ll">{v}</span></div>'
body = (
    card('<span class="ll mu">Storage on this machine</span>', '<span class="dl">61 GB of 256 GB</span>', f'<div class="row" role="img" aria-label="24 percent used" style="height: 28px; border-radius: 14px; overflow: hidden; gap: 3px">{bar}</div>',
         grid(3, leg('p', 'History and statistics', '23 GB'), leg('t', 'Media', '15 GB'), leg('heat', 'Backups', '13 GB'), leg('green', 'Apps and their data', '8 GB'), leg('amber', 'System', '2 GB'), leg('sl4', 'Free', '195 GB'), gap=24),
         label='Storage used', cls='hero')
    + grid(2, group('The disk', setting('Harddisk', 'NVMe SSD, 256 GB', 'Healthy. Worn 3% after 14 months.', tag('Healthy', 'g')), setting('Thermometer', 'Disk temperature', '41°', I('ChevronRight')),
                    setting('SwapHorizontal', 'Move data to another disk', 'A larger or faster one', btn('Move', 'tonal', None, True))),
           group('Make room', setting('ChartLine', 'Keep history for', '10 days', btn('Change', 'text', None, True)), setting('Broom', 'Clean up now', 'Removes old history and unused app images, about 6 GB', btn('Clean up', 'tonal', None, True)),
                 setting('Nas', 'Network storage', '1 share: nas.local, for backups', I('ChevronRight'))), gap=16)
)
surf(P, 'Storage', 'Storage', C, 'Storage', body)

# ---------- Hardware ----------
def spark(pts, color):
    return f'<svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true" style="display: block; width: 100%; height: 70px"><path d="{pts}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"></path></svg>'
def live(label, value, sub, pts, color):
    return card(row(f'<span class="ll mu grow">{label}</span>', '<span class="row bs mu" style="gap: 6px"><span style="width: 8px; height: 8px; border-radius: 4px; background: var(--green)"></span>Live</span>'), f'<span class="hl">{value}</span>', spark(pts, color), f'<span class="bs mu">{sub}</span>', label=label, style='padding: 24px', gap=8)
body = (
    row(f'<span class="sq" style="width: 88px; height: 88px; border-radius: 32px; background: var(--pc); color: var(--on-pc)">{I("RaspberryPi", "l")}</span>',
        '<div class="col grow" style="gap: 4px"><h1 class="hl">Raspberry Pi 5</h1><p class="bl mu">8 GB memory, 4 cores. Home Assistant OS 18.5.42. Up for 6 days.</p></div>', btn('Restart', 'tonal', 'Restart'), btn('Shut down', 'out', 'Power'), gap=20)
    + grid(3, live('Processor', '8%', 'Peak in the last hour: 41%, during the backup check', 'M0,60 C40,58 60,40 90,52 S140,20 170,44 S230,56 300,50', '#00639B'),
           live('Memory', '31%', '2.5 GB of 8 GB', 'M0,46 C60,44 100,48 150,44 S240,42 300,43', '#68587A'), live('Temperature', '52°', 'Slows down at 80°', 'M0,40 C50,42 90,30 130,34 S220,44 300,38', '#8C3A1D'))
    + group('Connected hardware', setting('Zigbee', 'Zigbee coordinator', 'USB, /dev/ttyUSB0. Used by Zigbee Home Automation', btn('Configure', 'text', None, True)),
            setting('Bluetooth', 'Built-in Bluetooth', 'hci0. Used by Bluetooth', I('ChevronRight')), setting('Usb', 'Z-Wave stick', 'USB, /dev/ttyACM0. Not set up', btn('Set up', 'tonal', None, True)),
            row(btn('All hardware', 'text', 'FormatListBulleted', True), btn('Board details', 'text', None, True), style='padding: 0 8px'))
)
surf(P, 'Hardware', 'Hardware', C, 'Hardware', body)

# ---------- General ----------
gmap = '''<svg viewBox="0 0 520 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map with your home marked" style="display: block; width: 100%; height: 300px">
<rect width="520" height="300" fill="#E4EAF0"></rect><path d="M0,230 C120,200 260,260 520,210 L520,300 L0,300 Z" fill="#C9DEF2"></path>
<g stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none"><path d="M-10,150 L530,120"></path><path d="M210,-10 L250,310"></path></g>
<circle cx="232" cy="136" r="54" fill="#00639B" fill-opacity=".16" stroke="#00639B" stroke-width="3"></circle><circle cx="232" cy="136" r="9" fill="#00639B"></circle></svg>'''
body = grid(2,
    col(field('Name of this home', 'Home'), frow(select('Country', 'Canada'), select('Language', 'English')), frow(select('Time zone', 'America/Toronto'), select('Currency', 'CAD')),
        group('Units', setting('Ruler', 'Unit system', 'Metric: °C, km, kg, litres', seg(['Metric', 'US customary'], 'Metric', 'Unit system')),
              setting('CalendarWeek', 'First day of the week', 'Monday', I('ChevronRight'))), gap=12),
    col(f'<div style="border-radius: 32px; overflow: hidden">{gmap}</div>', frow(field('Height above sea level', '76 m'), field('Radius of home', '100 m')),
        '<span class="bs mu">Used for sunrise and sunset, weather, and telling whether someone is home. It never leaves this machine unless an integration you add needs it.</span>', gap=12), gap=24) \
    + row('<span class="grow"></span>', btn('Discard', 'text'), btn('Save', 'fill'))
surf(P, 'General', 'General', C, 'General', body)

# ---------- Labs ----------
def lab(icon, name, desc, on, tone):
    return card(row(f'<span class="sq" style="background: var(--sl0)">{I(icon)}</span>', '<span class="grow"></span>', sw(on, name)), f'<div class="col" style="gap: 4px"><span class="tl">{name}</span><span class="bm">{desc}</span></div>',
                row(btn('Give feedback', 'text', None, True), btn('Report a problem', 'text', None, True), style='margin: 0 -12px'), label=name, style=f'padding: 24px; background: var(--{tone})', gap=16)
body = (
    head('Labs', 'Features that are still being finished. Turn one on to try it; turn it off and it is gone.')
    + grid(3, lab('ViewDashboardVariant', 'Automatic room dashboards', 'A view for each area, built and kept up to date for you.', True, 'pc'),
           lab('RobotHappy', 'Suggested automations', 'Notices what you repeat and offers to automate it.', False, 'sl2'),
           lab('ChartTimeline', 'Energy forecast', 'Predicts tomorrow’s use from weather and habits.', False, 'sl2'))
    + note('A backup is offered before a Labs feature is turned on. Labs features can change or disappear in an update.', '', 'Flask')
)
surf(P, 'Labs', 'Labs', C, 'Labs', body)

# ---------- AI and IDs ----------
body = grid(2,
    col(group('AI helpers', setting('Creation', 'Suggest names and descriptions', 'For automations, scenes and scripts', sw(True, 'Suggest names')), select('Model for writing tasks', 'Ollama, llama3.2, on this network'),
              select('Model for pictures', 'None'), note='Nothing is sent to a model until you press a Suggest button. Local models are listed first.'),
        group('Let AI tools reach this home', setting('Connection', 'Model Context Protocol server', 'Off. Lets an assistant on your computer read and control exposed entities', sw(False, 'Model Context Protocol server'))), gap=12),
    col(group('How entity IDs are formed', seg(['Area and name', 'Device and name', 'Name only'], 'Area and name', 'ID format'),
              kv(('A new light called Ceiling in the Living room', '<span class="mono">light.living_room_ceiling</span>'), ('A new sensor on the Thermostat', '<span class="mono">sensor.living_room_temperature</span>')),
              note='Changing this affects new entities only. Existing IDs stay as they are.', style='padding: 20px'),
        group('Rename many at once', setting('FormTextbox', 'Find and rename entity IDs', 'Preview every change before it is made', btn('Open', 'tonal', None, True))), gap=12), gap=16)
surf(P, 'AiIds', 'AI and entity IDs', C, 'AI and entity IDs', body)

# ---------- Restart ----------
def opt(icon, title, desc, tone='sl2', sel=False):
    ring = '; box-shadow: 0 0 0 3px var(--p)' if sel else ''
    return f'<button class="li" style="background: var(--{tone}); min-height: 76px{ring}"><span class="lead" style="background: var(--sl0)">{I(icon)}</span><span class="col grow"><span class="ll">{title}</span><span class="bs mu">{desc}</span></span></button>'
body = ('<section class="dlg col" role="dialog" aria-label="Restart Home Assistant" style="width: 560px; gap: 8px; padding: 28px; margin: auto">'
        '<h1 class="hs">Restart Home Assistant</h1><p class="bl mu" style="padding-bottom: 8px">Pick the smallest restart that does the job.</p>'
        + opt('AutoFix', 'Quick reload', 'Loads changed automations, scripts and scenes. Nothing stops.', 'pc', True)
        + opt('Restart', 'Restart Home Assistant', 'About 1 minute. Automations pause while it restarts.')
        + opt('ShieldHalfFull', 'Restart in safe mode', 'Without custom integrations and cards, to find a problem.')
        + '<span class="ll mu" style="padding: 12px 16px 0">This machine</span>'
        + opt('RaspberryPi', 'Reboot the machine', 'About 3 minutes. Apps stop too.') + opt('Power', 'Shut down', 'You will need to switch it on by hand.', 'errc')
        + row('<span class="bs mu grow">The configuration is checked first. A restart is refused if it has errors.</span>', btn('Cancel', 'out'), btn('Quick reload', 'fill'), style='padding-top: 12px') + '</section>')
bare(P, 'Restart', 'Restart options', body, style='padding: 48px; display: flex')
