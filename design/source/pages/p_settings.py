from lib import *

P = 'settings'
C = 'Settings'

def logo(letter, color):
    return f'<span class="sq" style="width: 48px; height: 48px; border-radius: 16px; background: {color}; color: #fff; font-weight: 600; font-size: 18px">{letter}</span>'

# ---------- Settings home ----------
def sec(icon, title, desc, tone=''):
    lead = f' style="background: var(--{tone}); color: var(--on-{tone})"' if tone else ''
    return (f'<a class="li" href="#{title.lower().replace(" ", "-")}" style="background: var(--sl2); color: var(--on); min-height: 76px; border-radius: 24px">'
            f'<span class="lead"{lead}>{I(icon)}</span><span class="col grow"><span class="ll">{title}</span><span class="bs mu">{desc}</span></span>{I("ChevronRight")}</a>')
body = (
    row('<div class="col grow" style="gap: 6px"><h1 class="hl">Settings</h1><p class="bl mu">Everything about this home, in one place.</p></div>', find('Search settings', width='360px'), style='align-items: flex-end')
    + row(f'<a class="row" href="#updates" style="gap: 12px; background: var(--pc); color: var(--on-pc); border-radius: 24px; padding: 16px 20px; flex: 1">{I("Update")}<span class="col grow"><span class="ll">2 updates are ready</span><span class="bs">Home Assistant Material 2026.11.1.43, and one app</span></span>{I("ChevronRight")}</a>',
          f'<a class="row" href="#repairs" style="gap: 12px; background: var(--amberc); color: var(--amber); border-radius: 24px; padding: 16px 20px; flex: 1">{I("Wrench")}<span class="col grow"><span class="ll">1 thing to repair</span><span class="bs">The Garden plug needs to be set up again</span></span>{I("ChevronRight")}</a>', gap=16)
    + grid(3,
           sec('Cloud', 'Home Assistant Cloud', 'Remote access, connected', 'pc'), sec('Devices', 'Devices and services', '42 devices, 14 integrations'), sec('Robot', 'Automations and scenes', '18 automations, 6 scenes'),
           sec('Sofa', 'Areas, labels and zones', '9 areas on 2 floors'), sec('PuzzleOutline', 'Apps', '5 installed, 1 update'), sec('ViewDashboard', 'Dashboards', '3 dashboards'),
           sec('MicrophoneMessage', 'Voice assistants', 'Assist, runs at home'), sec('NfcVariant', 'Tags', '4 tags'), sec('AccountMultiple', 'People', '4 people, 2 can sign in'),
           sec('Palette', 'Appearance', 'Theme, colour, type, motion'), sec('Translate', 'Language and voice', 'English, playfulness 5'), sec('ShieldLock', 'Locks and sign-in', '3 locked elements'),
           sec('Cog', 'System', 'Backups, logs, network, hardware'), sec('Toolbox', 'Developer tools', 'States, actions, templates'), sec('InformationOutline', 'About', 'Version 2026.11.1.42'), gap=12)
)
shell(P, 'SettingsHome', 'Settings, the home of settings', 'Settings', 'Settings', body)

# ---------- Cloud ----------
body = (
    row('<section class="card hero col grow" aria-label="Cloud status" style="background: var(--pc); color: var(--on-pc); gap: 8px">' + row(I('CloudCheck', 'l'), '<span class="ll">Home Assistant Cloud</span>')
        + '<span class="hl">Connected</span><span class="bl">Signed in as sam@example.com. The subscription renews on 4 March 2027.</span></section>',
        col(btn('Manage account', 'tonal lg', 'OpenInNew'), btn('Sign out', 'out lg', 'Logout'), gap=8, style='justify-content: center'), gap=24, style='align-items: stretch')
    + grid(2,
           group('Reach your home', setting('Web', 'Remote access', 'Your address works away from home', sw(True, 'Remote access')),
                 field('Your address', 'https://abcd1234.ui.nabu.casa', 'LinkVariant', mono=True),
                 setting('CertificateOutline', 'Certificate', 'Valid until 2 February 2027', I('ChevronRight')), note='Traffic is encrypted end to end. The cloud cannot read it.'),
           group('Voice and assistants', setting('GoogleAssistant', 'Google Assistant', '12 entities exposed', sw(True, 'Google Assistant')),
                 setting('Microphone', 'Amazon Alexa', 'Not set up', sw(False, 'Amazon Alexa')),
                 setting('AccountVoice', 'Cloud voice', 'English, Jenny', I('ChevronRight'))),
           group('Webhooks', setting('Webhook', 'Phone app, Sam', 'Reachable from the internet', sw(True, 'Phone app webhook')),
                 setting('Webhook', 'Doorbell', 'Local only', sw(False, 'Doorbell webhook'))),
           group('Without an account', note('Everything in this home works without the cloud. It adds remote access and cloud voices, nothing else.', '', 'ShieldCheck'),
                 row(btn('Start a free trial', 'tonal', None, True), btn('Forgot password', 'text', None, True), style='padding: 4px 16px')), gap=16)
)
surf(P, 'Cloud', 'Home Assistant Cloud', C, 'Home Assistant Cloud', body)

# ---------- Integrations ----------
def integ(letter, color, name, sub, tags=''):
    return card(row(logo(letter, color), f'<div class="col grow"><span class="tm">{name}</span><span class="bs mu">{sub}</span></div>', ib('DotsVertical', name + ' options')), row(tags or tag('Working', 'g'), gap=8),
                label=name, style='padding: 20px; border-radius: 28px')
def found(letter, color, name, sub):
    return f'<div class="row" style="gap: 12px; background: var(--pc); color: var(--on-pc); border-radius: 24px; padding: 12px 12px 12px 16px; flex: 1">{logo(letter, color)}<span class="col grow"><span class="ll">{name}</span><span class="bs">{sub}</span></span>{btn("Add", "fill", None, True)}{ib("Close", "Ignore " + name)}</div>'
body = (
    head('Integrations', 'The connections between Home Assistant and your devices and services.')
    + '<h2 class="tm">Found on your network</h2>' + row(found('S', '#111', 'Sonos', 'Kitchen speaker, 192.168.1.42'), found('E', '#18BCF2', 'ESPHome', 'garden-sensor'), gap=16)
    + toolbar('Search integrations', chip('Working', True), chip('Needs attention'), chip('Disabled'), chip('Ignored'))
    + grid(3, integ('H', '#0065D3', 'Philips Hue', '1 hub, 14 devices'), integ('Z', '#E5281E', 'Zigbee Home Automation', '23 devices'), integ('G', '#4285F4', 'Google Cast', '5 devices'),
           integ('M', '#660066', 'MQTT', '8 devices, 31 entities'), integ('T', '#4D4D4D', 'Tuya', '3 devices', tag('Sign in again', 'e')), integ('W', '#F5A623', 'Met.no weather', '1 service'),
           integ('S', '#1DB954', 'Spotify', 'Sam'), integ('B', '#0082FC', 'Bluetooth', '2 adapters'), integ('M', '#2D3135', 'Mobile App', '3 phones'), gap=12)
    + fab('Add integration')
)
surf(P, 'Integrations', 'Integrations', 'Settings, Devices and services', 'Integrations', body)

# ---------- Integration page ----------
body = (
    row(logo('H', '#0065D3').replace('48px', '72px').replace('border-radius: 16px', 'border-radius: 24px'), '<div class="col grow" style="gap: 4px"><h1 class="hl">Philips Hue</h1><p class="bl mu">1 hub, 14 devices, 38 entities. Talks to the hub on your network.</p></div>',
        btn('Add another hub', 'tonal', 'Plus'), ib('DotsVertical', 'More'), gap=20)
    + row(
        col(card(row(I('RouterWireless'), '<div class="col grow"><span class="tm">Hue Bridge</span><span class="bs mu">192.168.1.20, firmware 1.63</span></div>', tag('Working', 'g'), btn('Configure', 'out', None, True), ib('DotsVertical', 'Hub options')),
                 table([('Device', 3), ('Area', 2), ('Entities', 1)], [[('Ceiling lights', 'Hue white ambiance'), 'Living room', '3'], [('Shelf strip', 'Hue lightstrip plus'), 'Living room', '2'],
                                                                         [('Counter lights', 'Hue white'), 'Kitchen', '2'], [('Hallway motion', 'Hue motion sensor'), 'Hallway', '4']], 'Devices of this hub', 'LightbulbOutline'),
                 row('<span class="bs mu grow">10 more devices</span>', btn('Show all 14', 'text', None, True)), label='Hue Bridge', style='padding: 20px', gap=12), style='flex: 2; min-width: 0'),
        col(group('', setting('BookOpenVariant', 'Documentation', 'How this integration works', I('OpenInNew')), setting('Bug', 'Known issues', '2 open', I('OpenInNew')),
                  setting('TextBoxSearch', 'Debug logging', 'Off', sw(False, 'Debug logging')), setting('Download', 'Download diagnostics', 'Private details are removed', I('ChevronRight')), style='padding: 12px'),
            note('Quality: Platinum. Works locally, no cloud needed.', 'ok', 'CheckDecagram'), gap=12, style='flex: 1; min-width: 0'),
        gap=20, style='align-items: flex-start')
)
surf(P, 'IntegrationPage', 'One integration', 'Settings, Integrations', 'Philips Hue', body)

# ---------- Add integration ----------
def brand(letter, color, name, sub=''):
    s = f'<span class="bs mu">{sub}</span>' if sub else ''
    return f'<a class="li" href="#" style="color: var(--on)">{logo(letter, color).replace("48px", "40px")}<span class="col grow"><span class="ll">{name}</span>{s}</span>{I("ChevronRight")}</a>'
body = (
    '<section class="dlg col" role="dialog" aria-label="Add integration" style="flex: 1 1 340px; gap: 8px; padding: 24px 16px">'
    + '<h2 class="tl" style="padding: 0 12px 8px">Add integration</h2>' + f'<div style="padding: 0 4px 8px">{find("Search 2,900 brands")}</div>'
    + brand('H', '#0065D3', 'Philips Hue', 'Found on your network') + brand('S', '#111', 'Sonos', 'Found on your network') + brand('A', '#555', 'Apple', 'HomeKit, Apple TV, iCloud') + brand('G', '#4285F4', 'Google', 'Cast, Calendar, Assistant') + brand('I', '#0051BA', 'IKEA', 'Dirigera, Tradfri')
    + '</section>'
    + '<section class="dlg col" role="dialog" aria-label="Set up Philips Hue, step 1 of 2" style="flex: 1 1 340px; gap: 16px; padding: 24px">'
    + row(ib('ArrowLeft', 'Back'), '<div class="col grow"><h2 class="tm">Philips Hue</h2><span class="bs mu">Step 1 of 2</span></div>', ib('HelpCircleOutline', 'Help for this step'))
    + track(50, 'Step 1 of 2') + '<div class="col" style="align-items: center; gap: 12px; padding: 16px 0">' + f'<span class="sq" style="width: 96px; height: 96px; border-radius: 48px; background: var(--pc); color: var(--on-pc)">{I("GestureTapButton", "l")}</span>'
    + '<span class="tl" style="text-align: center">Press the button on the Hue Bridge</span><span class="bm mu" style="text-align: center">Then choose Continue within 30 seconds.</span></div>'
    + field('Bridge', '192.168.1.20', 'RouterWireless', mono=True) + row(btn('Cancel', 'out'), '<span class="grow"></span>', btn('Continue', 'fill')) + '</section>'
    + '<section class="dlg col" role="dialog" aria-label="Philips Hue was added" style="flex: 1 1 340px; gap: 16px; padding: 24px">'
    + row(f'<span class="sq" style="background: var(--greenc); color: var(--green)">{I("Check")}</span>', '<div class="col grow"><h2 class="tm">Philips Hue was added</h2><span class="bs mu">14 devices found. Where are they?</span></div>')
    + select('Ceiling lights', 'Living room') + select('Counter lights', 'Kitchen') + select('Hallway motion', 'Hallway') + '<span class="bs mu">11 more devices. Areas were suggested from their names.</span>'
    + row(btn('Skip', 'text'), '<span class="grow"></span>', btn('Finish', 'fill')) + '</section>'
)
bare(P, 'AddIntegration', 'Add integration, pick, set up, assign areas', body)

# ---------- Devices ----------
body = (
    head('Devices', '42 devices. One needs attention.')
    + toolbar('Search devices', chip('Area: any', False, 'MenuDown'), chip('Integration: any', False, 'MenuDown'), chip('Needs attention'), chip('Battery powered'), right=ib('TableCog', 'Choose columns') + ib('Export', 'Export'))
    + table([('Device', 3), ('Area', 2), ('Integration', 2), ('Battery', 1), ('', 1)],
            [[('Ceiling lights', 'Signify, Hue white ambiance'), 'Living room', 'Philips Hue', '<span class="mu">Mains</span>', ''],
             [('Hallway motion', 'Signify, Hue motion sensor'), 'Hallway', 'Philips Hue', tag('8%', 'e'), ''],
             [('Front door lock', 'Yale, Linus'), 'Hallway', 'Zigbee', '74%', ''],
             [('Garden plug', 'TP-Link, Kasa'), 'Garden', 'TP-Link', '<span class="mu">Mains</span>', tag('Offline', 'e')],
             [('Kitchen speaker', 'Sonos, One'), 'Kitchen', 'Sonos', '<span class="mu">Mains</span>', ''],
             [('Thermostat', 'Tado, Smart thermostat'), 'Living room', 'Tado', '61%', '']], 'Devices',
            ['CeilingLight', 'MotionSensor', 'Lock', 'PowerPlug', 'Speaker', 'Thermostat'])
    + row('<span class="bs mu grow">Showing 6 of 42.</span>', btn('Load more', 'text', None, True), fab('Add device'))
)
surf(P, 'Devices', 'Devices', 'Settings, Devices and services', 'Devices', body)

# ---------- Device ----------
body = (
    row(f'<span class="sq" style="width: 88px; height: 88px; border-radius: 32px; background: var(--pc); color: var(--on-pc)">{I("CeilingLight", "l")}</span>',
        '<div class="col grow" style="gap: 4px"><h1 class="hl">Ceiling lights</h1><p class="bl mu">Hue white ambiance by Signify. In the Living room, through Philips Hue.</p></div>', btn('Rename', 'out', 'Pencil'), ib('DotsVertical', 'More'), gap=20)
    + grid(3,
           col(group('Controls', setting('CeilingLight', 'Ceiling', 'On, 80%', sw(True, 'Ceiling')), '<div style="padding: 4px 16px 8px">' + slider('Brightness', 80, '80%') + '</div>', setting('ThermometerLines', 'Colour temperature', '2,900 K, warm white', I('ChevronRight'))),
               group('Sensors', setting('PowerPlugOutline', 'Power', '7.2 W', I('ChevronRight')), setting('LightningBolt', 'Energy today', '0.04 kWh', I('ChevronRight'))), gap=12),
           col(group('Configuration', setting('Restart', 'Power-on behaviour', 'Last state', I('ChevronRight')), setting('Identifier', 'Identify', 'Blinks the light', btn('Blink', 'tonal', None, True))),
               group('Diagnostic', setting('Zigbee', 'Zigbee connectivity', 'Connected', tag('Good', 'g')), setting('Update', 'Firmware', '1.108.7, up to date', I('ChevronRight')), note='2 more are hidden. They are turned off by default.'), gap=12),
           col(group('Automations', setting('Robot', 'Evening lights', 'Uses this device', I('ChevronRight')), row(btn('New automation', 'tonal', 'Plus', True), style='padding: 4px 16px')),
               group('Activity', setting('History', 'Turned on at 80%', 'By Sam, 8:47 pm', ''), setting('History', 'Turned off', 'By Evening lights, 1:02 am', ''), row(btn('Show more', 'text', None, True), style='padding: 0 8px')), gap=12), gap=16)
)
surf(P, 'Device', 'One device', 'Settings, Devices', 'Ceiling lights', body)

# ---------- Entities ----------
body = (
    head('Entities', '386 entities. The things devices can sense and do.')
    + toolbar('Search entities', chip('Domain: light', True, 'Close'), chip('Area: any', False, 'MenuDown'), chip('Show hidden'), chip('Show disabled'), right=ib('TableCog', 'Choose columns') + ib('Export', 'Export'))
    + table([('Name', 3), ('Entity ID', 3), ('Area', 2), ('State', 1), ('', 1)],
            [['Ceiling', '<span class="mono bs">light.living_ceiling</span>', 'Living room', 'On', ''], ['Shelf', '<span class="mono bs">light.living_shelf</span>', 'Living room', 'On', ''],
             ['Floor lamp', '<span class="mono bs">light.living_floor</span>', 'Living room', '<span class="mu">Off</span>', ''], ['Counter', '<span class="mono bs">light.kitchen_counter</span>', 'Kitchen', 'On', ''],
             ['Garden path', '<span class="mono bs">light.garden_path</span>', 'Garden', '<span class="mu">Unavailable</span>', tag('Unavailable', 'e')],
             ['Attic', '<span class="mono bs">light.attic</span>', '<span class="mu">None</span>', '<span class="mu">Off</span>', tag('Disabled')]], 'Entities', 'LightbulbOutline')
    + row('<span class="bs mu grow">19 lights. Tick rows to change many at once.</span>', btn('Select', 'out', 'CheckboxMultipleOutline', True))
)
surf(P, 'Entities', 'Entities', 'Settings, Devices and services', 'Entities', body)

# ---------- Entity settings ----------
body = (
    '<section class="dlg col" role="dialog" aria-label="Ceiling, settings" style="flex: 1 1 520px; gap: 16px; padding: 16px 20px 24px">'
    + row(ib('Close', 'Close'), '<div class="col grow"><h2 class="tm">Ceiling</h2><span class="bs mu">Living room, Ceiling lights</span></div>', ib('DotsVertical', 'More'))
    + tabs(['Details', 'History', 'Settings', 'Related'], 'Settings')
    + field('Name', 'Ceiling') + frow(select('Icon', 'Ceiling light'), select('Show as', 'Light'))
    + field('Entity ID', 'light.living_ceiling', mono=True) + select('Area', 'Living room, from the device') + row(chip('Evening', True, 'LabelOutline'), chip('Downstairs', True, 'LabelOutline'), btn('Add label', 'text', 'Plus', True), style='flex-wrap: wrap')
    + row(btn('Delete', 'text', 'Delete', False, 'color: var(--err)'), '<span class="grow"></span>', btn('Cancel', 'out'), btn('Save', 'fill')) + '</section>'
    + col(group('Visibility', setting('Eye', 'Visible', 'Shown on dashboards and to voice assistants', sw(True, 'Visible')), setting('Power', 'Enabled', 'Home Assistant keeps it up to date', sw(True, 'Enabled'))),
          group('Voice assistants', setting('MicrophoneMessage', 'Assist', 'Also called: big light', sw(True, 'Assist')), setting('GoogleAssistant', 'Google Assistant', 'Asks for no PIN', sw(True, 'Google Assistant')), setting('Microphone', 'Amazon Alexa', 'Not set up', sw(False, 'Amazon Alexa'))),
          group('Advanced', setting('Identifier', 'Unique ID', '00:17:88:01:0c:4e:7a:21-0b', btn('Copy', 'text', None, True)), setting('TimerOutline', 'Check for new state', 'Pushed by the hub', '')),
          gap=12, style='flex: 1 1 420px; min-width: 0')
)
bare(P, 'EntitySettings', 'Entity settings', body)

# ---------- Helpers ----------
body = (
    head('Helpers', 'Small entities you make yourself: switches, numbers, timers, groups.')
    + toolbar('Search helpers', chip('Type: any', False, 'MenuDown'), chip('Category: any', False, 'MenuDown'), chip('Label: any', False, 'MenuDown'))
    + row(col(table([('Name', 3), ('Type', 2), ('Entity ID', 5), ('State', 2)],
                    [['Guest mode', 'Toggle', '<span class="mono bs">input_boolean.guest_mode</span>', 'Off'], ['Wake-up time', 'Date and time', '<span class="mono bs">input_datetime.wake_up</span>', '6:45 am'],
                     ['Target humidity', 'Number', '<span class="mono bs">input_number.target_humidity</span>', '50%'], ['Laundry timer', 'Timer', '<span class="mono bs">timer.laundry</span>', 'Idle'],
                     ['All downstairs lights', 'Group', '<span class="mono bs">light.downstairs</span>', 'On'], ['House mode', 'Dropdown', '<span class="mono bs">input_select.house_mode</span>', 'Evening']],
                    'Helpers', ['ToggleSwitchOutline', 'CalendarClock', 'RayVertex', 'TimerOutline', 'LightbulbGroup', 'FormatListBulleted']), style='flex: 2; min-width: 0'),
          card('<h2 class="tm">Create a helper</h2>', *[f'<button class="li" style="background: var(--sl0)"><span class="lead">{I(i)}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{d}</span></span></button>'
                                                        for i, n, d in [('ToggleSwitchOutline', 'Toggle', 'An on or off you control'), ('Counter', 'Counter', 'Counts up and down'), ('TimerOutline', 'Timer', 'Counts down, then tells an automation'),
                                                                        ('LightbulbGroup', 'Group', 'Several entities as one'), ('Sigma', 'Template', 'A value worked out from others')]],
               btn('See all 28 kinds', 'text', None, True), label='Create a helper', style='flex: 1; min-width: 0; padding: 20px', gap=6),
          gap=20, style='align-items: flex-start')
)
surf(P, 'Helpers', 'Helpers', 'Settings, Devices and services', 'Helpers', body)

# ---------- Automations ----------
body = (
    head('Automations', '18 automations. 16 are on.')
    + toolbar('Search automations', chip('Category: any', False, 'MenuDown'), chip('Label: any', False, 'MenuDown'), chip('Area: any', False, 'MenuDown'), chip('Blueprint: any', False, 'MenuDown'))
    + table([('Automation', 4), ('Category', 2), ('Last ran', 2), ('On', 1), ('', 1)],
            [[('Lock up at night', 'When everyone is in bed'), 'Security', 'Today, 9:02 pm', sw(True, 'Lock up at night'), ib('DotsVertical', 'More')],
             [('Evening lights', 'At sunset, if someone is home'), 'Lights', 'Today, 4:58 pm', sw(True, 'Evening lights'), ib('DotsVertical', 'More')],
             [('Close the blinds at sunset', 'At sunset'), 'Lights', 'Today, 4:58 pm', sw(True, 'Close the blinds at sunset'), ib('DotsVertical', 'More')],
             [('Bathroom fan', 'When humidity goes over 60%'), 'Climate', 'Today, 7:12 am', sw(True, 'Bathroom fan'), ib('DotsVertical', 'More')],
             [('Laundry is done', 'When the washer power drops'), 'Notifications', 'Saturday', sw(True, 'Laundry is done'), ib('DotsVertical', 'More')],
             [('Holiday lights', 'In December, at dusk'), 'Lights', '<span class="mu">11 months ago</span>', sw(False, 'Holiday lights'), ib('DotsVertical', 'More')]], 'Automations', 'Robot')
    + row('<span class="bs mu grow">Showing 6 of 18.</span>', btn('Load more', 'text', None, True), fab('Create automation'))
)
surf(P, 'Automations', 'Automations', 'Settings, Automations and scenes', 'Automations', body)

# ---------- Automation editor ----------
def step(icon, title, sub, tone='sl0', sel=False, extra=''):
    ring = 'box-shadow: 0 0 0 3px var(--p)' if sel else ''
    return (f'<div class="li" style="background: var(--{tone}); min-height: 68px; {ring}">{I("DragVertical", "s")}<span class="lead">{I(icon)}</span>'
            f'<span class="col grow"><span class="ll">{title}</span><span class="bs mu">{sub}</span></span>{extra}{ib("DotsVertical", "Step options")}</div>')
def block(word, title, color, *steps, addl='Add'):
    return card(row(f'<span class="tag" style="background: var(--{color}); color: var(--on); height: 28px; font-size: 13px">{word}</span>', f'<h2 class="tm grow">{title}</h2>'), *steps,
                row(btn(addl, 'text', 'Plus', True)), label=title, style='padding: 20px', gap=8)
body = row(
    col(row('<div class="col grow" style="gap: 4px"><h1 class="hs">Evening lights</h1><p class="bm mu">Turns on the downstairs lights at sunset when someone is home.</p></div>', sw(True, 'Evening lights is on')),
        block('When', 'Any of these happens', 'pc', step('WeatherSunset', 'The sun sets', '15 minutes before sunset', 'sl0', True), step('Brightness4', 'It gets dark inside', 'Living room light level falls under 40 lx', 'sl0'), addl='Add trigger'),
        block('And if', 'All of these are true', 'tc', step('HomeAccount', 'Someone is home', 'Sam, Mika, Jo or Lee is in the Home zone', 'sl0'), addl='Add condition'),
        block('Then do', 'These, in order', 'greenc', step('LightbulbOn', 'Turn on the lights', 'Downstairs lights, 60%, warm white, over 5 seconds', 'sl0'),
              step('Blinds', 'Close the blinds', 'Living room and kitchen', 'sl0'), step('TimerSand', 'Wait', 'Until 11 pm', 'sl0'), addl='Add action'),
        gap=12, style='flex: 3; min-width: 0'),
    card(row('<h2 class="tl grow">The sun sets</h2>', ib('Close', 'Close the step editor')), select('Trigger', 'Sun'), seg(['Sunrise', 'Sunset'], 'Sunset', 'Event'),
         frow(field('Offset', '15 minutes'), seg(['Before', 'After'], 'Before', 'Direction')),
         note('Today that is 4:43 pm. It moves a minute or two each day.'), setting('Identifier', 'Trigger ID', 'Lets a later step tell which trigger fired', btn('Add', 'text', None, True)),
         row(btn('Edit as code', 'text', 'CodeBraces', True), '<span class="grow"></span>', btn('Test', 'out', 'Play', True)), label='Step editor', style='flex: 2; min-width: 0; padding: 24px; align-self: flex-start'),
    gap=20, style='align-items: flex-start') + row(btn('Run now', 'out', 'Play'), btn('See past runs', 'text', 'TransitConnection'), '<span class="grow"></span>', '<span class="bs mu">Saved 4 minutes ago</span>', btn('Save', 'fill', 'ContentSave'))
surf(P, 'AutomationEditor', 'Automation editor', 'Settings, Automations', 'Edit automation', body)

# ---------- Automation trace ----------
def node(icon, label, state='ok'):
    c = {'ok': 'greenc', 'skip': 'sl3', 'sel': 'pc', 'bad': 'errc'}[state]
    ring = '; box-shadow: 0 0 0 3px var(--p)' if state == 'sel' else ''
    return f'<div class="row" style="gap: 12px"><span class="lead" style="background: var(--{c}); color: var(--on){ring}">{I(icon)}</span><span class="ll{" mu" if state == "skip" else ""}">{label}</span></div>'
line = '<span style="width: 2px; height: 20px; background: var(--outv); margin-left: 19px"></span>'
body = row(
    card('<h2 class="tm">Run of today, 4:43:02 pm</h2>', '<span class="bs mu">Finished in 5.4 seconds. Every step succeeded.</span>',
         col(node('WeatherSunset', 'Triggered: the sun sets'), line, node('HomeAccount', 'Checked: someone is home, true'), line, node('LightbulbOn', 'Turn on the lights', 'sel'), line, node('Blinds', 'Close the blinds'), line, node('TimerSand', 'Wait until 11 pm'), gap=0, style='padding: 8px 0'),
         row(ib('ChevronLeft', 'Older run', 't'), '<span class="bm grow" style="text-align: center">Run 5 of 5</span>', ib('ChevronRight', 'Newer run', 't')), label='Steps of this run', style='flex: 1; min-width: 0; padding: 24px'),
    card(row('<h2 class="tl grow">Turn on the lights</h2>', tag('Succeeded', 'g')), tabs(['Step details', 'Changed variables', 'Related activity', 'Step code'], 'Step details'),
         kv(('Ran at', '4:43:02.118 pm'), ('Took', '5.02 seconds'), ('Action', 'light.turn_on'), ('Target', 'Downstairs lights, 5 entities'), ('Brightness', '60%'), ('Transition', '5 seconds')),
         note('All 5 lights reported the new state. The slowest, Shelf, answered after 0.4 seconds.', 'ok', 'Check'),
         row(btn('Download this trace', 'text', 'Download', True), '<span class="grow"></span>', btn('Open in the editor', 'out', 'Pencil', True)), label='Step details', style='flex: 2; min-width: 0; padding: 24px'),
    gap=20, style='align-items: flex-start')
surf(P, 'AutomationTrace', 'Automation trace, one past run', 'Settings, Automations, Evening lights', 'Past runs', body)

# ---------- Scenes ----------
def scene(icon, name, sub, tone):
    return card(row(f'<span class="sq" style="background: var(--sl0)">{I(icon)}</span>', '<span class="grow"></span>', ib('DotsVertical', name + ' options')), f'<div class="col"><span class="tl">{name}</span><span class="bm">{sub}</span></div>',
                row(btn('Turn on', 'tonal', 'Play', True, 'background: var(--sl0); color: var(--on)')), label=name, style=f'padding: 24px; background: var(--{tone}); color: var(--on-{tone})', gap=16)
body = (
    head('Scenes', 'A scene sets many things at once, the way you saved them.')
    + toolbar('Search scenes', chip('Area: any', False, 'MenuDown'), chip('Category: any', False, 'MenuDown'))
    + grid(3, scene('Movie', 'Movie night', '6 entities, living room', 'pc'), scene('WeatherNight', 'Good night', '14 entities, whole house', 'tc'), scene('HomeExportOutline', 'Leaving', '21 entities, whole house', 'sc'),
           scene('SilverwareForkKnife', 'Dinner', '5 entities, kitchen', 'amberc'), scene('WeatherSunny', 'Bright', '19 lights', 'greenc'), scene('BookOpenPageVariant', 'Reading', '3 entities, living room', 'heatc'))
    + fab('Create scene')
)
surf(P, 'Scenes', 'Scenes', 'Settings, Automations and scenes', 'Scenes', body)

# ---------- Scene editor ----------
body = row(
    col(field('Name', 'Movie night'), frow(select('Icon', 'Movie'), select('Area', 'Living room')),
        note('Live edit is on. The room changes as you edit, and goes back if you leave without saving.', '', 'LightbulbOnOutline'),
        group('Devices in this scene', setting('CeilingLight', 'Ceiling lights', 'Off', ib('Close', 'Remove Ceiling lights')), setting('LedStrip', 'Shelf strip', 'On, 20%, deep blue', ib('Close', 'Remove Shelf strip')),
              setting('Television', 'Television', 'On, input HDMI 1', ib('Close', 'Remove Television')), setting('Blinds', 'Blinds', 'Closed', ib('Close', 'Remove Blinds')), row(btn('Add a device', 'tonal', 'Plus', True), btn('Add an entity', 'text', 'Plus', True), style='padding: 4px 16px')),
        gap=12, style='flex: 3; min-width: 0'),
    card('<h2 class="tl">Shelf strip</h2>', row('<span class="ll grow">On</span>', sw(True, 'Shelf strip')), slider('Brightness', 20, '20%'),
         '<div class="row" style="gap: 10px; flex-wrap: wrap">' + ''.join(f'<button aria-label="{n}" style="width: 44px; height: 44px; border-radius: 22px; background: {c}; {"box-shadow: 0 0 0 3px var(--sl2), 0 0 0 5px " + c if s else ""}"></button>'
                                                                              for n, c, s in [('Deep blue, selected', '#1E3A8A', True), ('Warm white', '#FFD9A0', False), ('Red', '#C0392B', False), ('Purple', '#7A4E7E', False), ('Green', '#2E6B3F', False)])
         + btn('Any colour', 'tonal', 'Eyedropper', True) + '</div>', note('Saved in the scene: on, 20%, deep blue.'), label='Shelf strip in this scene', style='flex: 2; min-width: 0; padding: 24px; align-self: flex-start', gap=16),
    gap=20, style='align-items: flex-start') + row(btn('Try it', 'out', 'Play'), '<span class="grow"></span>', btn('Discard', 'text'), btn('Save', 'fill', 'ContentSave'))
surf(P, 'SceneEditor', 'Scene editor', 'Settings, Scenes', 'Edit scene', body)

# ---------- Scripts ----------
body = (
    head('Scripts', 'A script is a list of actions you can run from anywhere.')
    + toolbar('Search scripts', chip('Category: any', False, 'MenuDown'), chip('Label: any', False, 'MenuDown'))
    + table([('Script', 4), ('Category', 2), ('Last ran', 2), ('', 2)],
            [[('Announce dinner', 'Says it on every speaker'), 'Notifications', 'Today, 6:30 pm', btn('Run', 'tonal', 'Play', True)], [('Vacuum the kitchen', 'Sends the robot to one room'), 'Cleaning', 'Yesterday', btn('Run', 'tonal', 'Play', True)],
             [('Flash the porch light', 'Three times, then back'), 'Lights', 'Saturday', btn('Run', 'tonal', 'Play', True)], [('Water the garden', 'Each zone for 10 minutes'), 'Garden', tag('Running, 6 min left', 'p'), btn('Stop', 'out', 'Stop', True)],
             [('Guest Wi-Fi code', 'Shows the QR code on the TV'), 'Guests', '3 weeks ago', btn('Run', 'tonal', 'Play', True)]], 'Scripts', 'ScriptText')
    + fab('Create script')
)
surf(P, 'Scripts', 'Scripts', 'Settings, Automations and scenes', 'Scripts', body)

# ---------- Script editor ----------
body = row(
    col('<div class="col" style="gap: 4px"><h1 class="hs">Water the garden</h1><p class="bm mu">Runs each zone in turn. Stops if it starts to rain.</p></div>', row('<span class="bm mu">If it is already running</span>', seg(['One at a time', 'Restart', 'Queue', 'Side by side'], 'One at a time', 'If it is already running'), style='flex-wrap: wrap'),
        block('Ask for', 'Fields the script asks for when it runs', 'pc', step('TimerOutline', 'Minutes per zone', 'Number, 1 to 30, default 10', 'sl0'), addl='Add field'),
        block('Do', 'These, in order', 'greenc', step('Repeat', 'For each zone', 'Lawn, Beds, Pots', 'sl0', True), step('WaterPump', 'Open the valve', 'The zone of this pass', 'sl0'),
              step('TimerSand', 'Wait', 'Minutes per zone, or until rain is detected', 'sl0'), step('WaterOff', 'Close the valve', 'The zone of this pass', 'sl0'), addl='Add action'),
        gap=12, style='flex: 3; min-width: 0'),
    card(row('<h2 class="tl grow">For each zone</h2>', ib('Close', 'Close the step editor')), select('Kind of repeat', 'For each item in a list'),
         col(*[f'<div class="li" style="background: var(--sl0)">{I("DragVertical", "s")}<span class="ll grow">{z}</span>{ib("Close", "Remove " + z)}</div>' for z in ['Lawn', 'Beds', 'Pots']], gap=4), btn('Add an item', 'text', 'Plus', True),
         note('The three steps under it run once for each zone.'), label='Step editor', style='flex: 2; min-width: 0; padding: 24px; align-self: flex-start'),
    gap=20, style='align-items: flex-start') + row(btn('Run now', 'out', 'Play'), btn('See past runs', 'text', 'TransitConnection'), '<span class="grow"></span>', btn('Save', 'fill', 'ContentSave'))
surf(P, 'ScriptEditor', 'Script editor', 'Settings, Scripts', 'Edit script', body)

# ---------- Blueprints ----------
body = (
    head('Blueprints', 'Ready-made automations and scripts. Fill in the blanks and they are yours.', btn('Import from a link', 'tonal', 'LinkVariant'))
    + toolbar('Search blueprints', chip('Automations', True), chip('Scripts'), chip('In use'))
    + table([('Blueprint', 4), ('Kind', 2), ('Used by', 2), ('', 2)],
            [[('Motion-activated light', 'Turn on a light when motion is seen'), 'Automation', '4 automations', btn('Use', 'tonal', 'Plus', True)], [('Notify when a zone is left', 'A message when a person leaves a zone'), 'Automation', '1 automation', btn('Use', 'tonal', 'Plus', True)],
             [('Low battery report', 'A weekly list of low batteries'), 'Automation', '1 automation', btn('Use', 'tonal', 'Plus', True)], [('Confirmable notification', 'Asks a question, then acts'), 'Script', '<span class="mu">Not used</span>', btn('Use', 'tonal', 'Plus', True)]], 'Blueprints', 'PaletteSwatch')
    + note('Blueprints come from files in your configuration. Importing one from a link shows you its code before anything is saved.')
)
surf(P, 'Blueprints', 'Blueprints', 'Settings, Automations and scenes', 'Blueprints', body)

# ---------- Areas ----------
def area(name, icon, sub, c1, c2, temp=''):
    t_ = f'<span class="tag" style="background: var(--sl0)">{temp}</span>' if temp else ''
    return (f'<a class="card col" href="#{name.lower().replace(" ", "-")}" style="padding: 0; overflow: hidden; gap: 0; color: var(--on)"><span style="height: 96px; background: linear-gradient(135deg, {c1}, {c2}); display: flex; align-items: flex-end; padding: 12px">{t_}</span>'
            f'<span class="row" style="gap: 12px; padding: 16px 20px">{I(icon)}<span class="col grow"><span class="tm">{name}</span><span class="bs mu">{sub}</span></span></span></a>')
body = (
    head('Areas', '9 areas on 2 floors. Areas tell Home Assistant where things are.', btn('Add a floor', 'out', 'Plus'), btn('Add an area', 'fill', 'Plus'))
    + row('<h2 class="tm grow">Ground floor</h2>', ib('Pencil', 'Edit Ground floor'))
    + grid(4, area('Living room', 'Sofa', '11 devices, 3 automations', '#00639B', '#CEE5FF', '21.5°'), area('Kitchen', 'SilverwareForkKnife', '8 devices', '#8C3A1D', '#FFDBCF', '22.0°'), area('Hallway', 'CoatRack', '4 devices', '#51606F', '#D5E4F6'), area('Garage', 'Garage', '3 devices', '#42474E', '#C2C7CF'))
    + row('<h2 class="tm grow">First floor</h2>', ib('Pencil', 'Edit First floor'))
    + grid(4, area('Bedroom', 'Bed', '6 devices', '#68587A', '#EEDBFF', '19.8°'), area('Study', 'Desk', '5 devices', '#1F6A3B', '#B6F2BE', '20.6°'), area('Bathroom', 'Shower', '3 devices', '#006B5F', '#A7F3E6', '23.1°'), area('Kids room', 'TeddyBear', '2 devices', '#6B5200', '#FFE08B'))
    + row('<h2 class="tm grow">No floor</h2>') + grid(4, area('Garden', 'Flower', '4 devices', '#2E6B3F', '#D5E8D4'))
)
surf(P, 'Areas', 'Areas and floors', 'Settings, Areas, labels and zones', 'Areas', body)

# ---------- Area ----------
body = (
    f'<div class="row" style="gap: 20px; border-radius: 40px; padding: 32px; background: linear-gradient(135deg, #00639B, #CEE5FF); color: #fff; align-items: flex-end; min-height: 180px">'
    + '<div class="col grow" style="gap: 4px"><span class="ll">Ground floor</span><h1 class="dl">Living room</h1><span class="bl">21.5°, 46% humidity. 2 of 3 lights on.</span></div>' + btn('Edit area', 'tonal', 'Pencil', False, 'background: #fff; color: #181C20') + '</div>'
    + grid(3,
           group('Devices, 11', setting('CeilingLight', 'Ceiling lights', 'Philips Hue', I('ChevronRight')), setting('Television', 'Television', 'Google Cast', I('ChevronRight')), setting('Thermostat', 'Thermostat', 'Tado', I('ChevronRight')), row(btn('Show all 11', 'text', None, True), style='padding: 0 8px')),
           group('Automations and scenes', setting('Robot', 'Evening lights', 'Automation, on', I('ChevronRight')), setting('Movie', 'Movie night', 'Scene', I('ChevronRight')), setting('BookOpenPageVariant', 'Reading', 'Scene', I('ChevronRight'))),
           group('What this area reports', setting('Thermometer', 'Temperature', 'From the thermostat', I('ChevronRight')), setting('WaterPercent', 'Humidity', 'From the thermostat', I('ChevronRight')), setting('TagText', 'Also called', 'lounge, front room', I('ChevronRight')),
                 note='Voice assistants understand these names.'), gap=16)
)
surf(P, 'Area', 'One area', 'Settings, Areas', 'Living room', body)

# ---------- Labels ----------
def dot(c): return f'<span style="display: inline-block; vertical-align: middle; margin-right: 12px; width: 20px; height: 20px; border-radius: 10px; background: {c}"></span>'
body = (
    head('Labels', 'Your own tags for anything: devices, entities, automations, areas.', btn('Create label', 'fill', 'Plus'))
    + toolbar('Search labels')
    + table([('Label', 3), ('Description', 4), ('Used on', 2), ('', 1)],
            [[dot('#00639B') + '<span class="ll">Evening</span>', 'Part of the evening routine', '9 things', ib('DotsVertical', 'More')], [dot('#1F6A3B') + '<span class="ll">Downstairs</span>', 'Ground floor, for bulk actions', '24 things', ib('DotsVertical', 'More')],
             [dot('#BA1A1A') + '<span class="ll">Critical</span>', 'Tell me at once when these fail', '6 things', ib('DotsVertical', 'More')], [dot('#6B5200') + '<span class="ll">Holiday</span>', 'Only used in December', '5 things', ib('DotsVertical', 'More')],
             [dot('#68587A') + '<span class="ll">Kids</span>', '', '3 things', ib('DotsVertical', 'More')]], 'Labels')
)
surf(P, 'Labels', 'Labels', 'Settings, Areas, labels and zones', 'Labels', body)

# ---------- Zones ----------
zmap = '''<svg viewBox="0 0 700 460" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map with the Home zone selected. Its radius is 120 metres." style="display: block; width: 100%; height: 100%; min-height: 460px">
<rect width="700" height="460" fill="#E4EAF0"></rect><rect x="40" y="40" width="200" height="130" rx="24" fill="#D5E8D4"></rect>
<g stroke="#fff" stroke-width="14" stroke-linecap="round" fill="none"><path d="M-10,240 L710,200"></path><path d="M300,-10 L340,470"></path><path d="M520,-10 L500,470"></path></g>
<circle cx="330" cy="230" r="120" fill="#00639B" fill-opacity=".16" stroke="#00639B" stroke-width="3"></circle><circle cx="330" cy="230" r="10" fill="#00639B"></circle>
<circle cx="450" cy="230" r="11" fill="#fff" stroke="#00639B" stroke-width="4"></circle><circle cx="560" cy="110" r="46" fill="#68587A" fill-opacity=".16" stroke="#68587A" stroke-width="2" stroke-dasharray="6 6"></circle></svg>'''
body = row(
    col(*[f'<a class="li{" sel" if s else ""}" href="#"{"" if s else " style=\'color: var(--on)\'"}><span class="lead"{" style=\'background: var(--sl0); color: var(--on-pc)\'" if s else ""}>{I(i)}</span><span class="col grow"><span class="ll">{n}</span><span class="bs{"" if s else " mu"}">{d}</span></span></a>'
          for n, i, d, s in [('Home', 'Home', '120 m, 2 people here', True), ('Work', 'Briefcase', '80 m, 1 person here', False), ('School', 'School', '100 m', False), ('Gym', 'Dumbbell', '60 m, passive', False)]],
        btn('Add a zone', 'tonal', 'Plus'), gap=4, style='width: 300px; flex: none', tagname='nav', label='Zones'),
    col(f'<div style="border-radius: 32px; overflow: hidden; position: relative">{zmap}<span class="tag p" style="position: absolute; left: 44%; top: 18%">Home, 120 m</span></div>',
        frow(field('Name', 'Home'), field('Radius', '120 m'), select('Icon', 'Home')),
        row('<span class="bs mu grow">Drag the centre to move the zone, or the ring handle to resize it. Arrow keys work too: plus and minus change the radius by 10 m.</span>', btn('Save', 'fill')), gap=16, style='flex: 1; min-width: 0'),
    gap=24, style='align-items: flex-start')
surf(P, 'Zones', 'Zones on the map', 'Settings, Areas, labels and zones', 'Zones', body)

# ---------- Apps ----------
def app(letter, color, name, ver, state, cpu, mem, upd=False):
    st = tag('Running', 'g') if state else tag('Stopped')
    u = tag('Update ready', 'p') if upd else ''
    usage = (f'<div class="row bs mu" style="gap: 12px"><span>CPU {cpu}%</span><div class="grow">{track(cpu * 4, "CPU " + str(cpu) + "%")}</div><span>Memory {mem}%</span><div class="grow">{track(mem * 3, "Memory " + str(mem) + "%")}</div></div>' if state else '<span class="bs mu">Not using any resources.</span>')
    return card(row(logo(letter, color), f'<div class="col grow"><span class="tm">{name}</span><span class="bs mu">{ver}</span></div>', st, u), usage, label=name, style='padding: 20px; border-radius: 28px')
body = (
    head('Apps', 'Extra programs that run next to Home Assistant on this machine.', btn('App store', 'fill', 'Store'))
    + toolbar('Search installed apps', chip('Running', True), chip('Stopped'), chip('Update ready'))
    + grid(2, app('C', '#007ACC', 'Studio Code Server', '5.17.3', True, 2, 9, True), app('M', '#660066', 'Mosquitto broker', '6.5.0', True, 1, 2), app('Z', '#FFC135', 'Zigbee2MQTT', '2.1.1', True, 3, 6),
           app('E', '#18BCF2', 'ESPHome Device Builder', '2026.10.3', False, 0, 0), app('S', '#2D3135', 'Terminal and SSH', '9.16.0', True, 0, 1), app('F', '#3B82F6', 'File editor', '5.8.0', False, 0, 0), gap=12)
)
surf(P, 'Apps', 'Apps, installed', C, 'Apps', body)

# ---------- App store ----------
def sapp(letter, color, name, desc, tagtext='', installed=False):
    t_ = tag('Installed', 'g') if installed else (tag(tagtext) if tagtext else '')
    return card(row(logo(letter, color), f'<div class="col grow"><span class="tm">{name}</span><span class="bs mu">{desc}</span></div>'), row(t_, '<span class="grow"></span>', btn('Open' if installed else 'Install', 'text' if installed else 'tonal', None, True)), label=name, style='padding: 20px; border-radius: 28px')
body = (
    head('App store', '112 apps from 3 repositories.', btn('Repositories', 'out', 'SourceRepository'), btn('Check for new apps', 'text', 'Refresh'))
    + toolbar('Search the store', chip('Official', True), chip('Community'), chip('Not installed'), chip('Fits this machine', True))
    + '<h2 class="tm">Official apps</h2>'
    + grid(3, sapp('M', '#660066', 'Mosquitto broker', 'An MQTT broker', '', True), sapp('C', '#007ACC', 'Studio Code Server', 'Edit your configuration in the browser', '', True), sapp('S', '#2C5F8A', 'Samba share', 'Reach your files from another computer'),
           sapp('W', '#4A90D9', 'Whisper', 'Speech to text, at home', 'Needs 2 GB memory'), sapp('P', '#1E88E5', 'Piper', 'Text to speech, at home'), sapp('D', '#2F6DB5', 'MariaDB', 'A database server'), gap=12)
    + note('This machine is a Raspberry Pi 5 with 8 GB. Apps that cannot run on it are shown greyed out with the reason, not hidden.')
)
surf(P, 'AppStore', 'App store', 'Settings, Apps', 'App store', body)

# ---------- App page ----------
body = (
    row(logo('C', '#007ACC').replace('48px', '72px').replace('border-radius: 16px', 'border-radius: 24px'), '<div class="col grow" style="gap: 4px"><h1 class="hl">Studio Code Server</h1><p class="bl mu">Version 5.17.3, running for 6 days. Edit your configuration in the browser.</p></div>',
        btn('Open', 'fill', 'OpenInApp'), btn('Restart', 'out', 'Restart'), btn('Stop', 'out', 'Stop'), gap=20)
    + tabs(['Info', 'Documentation', 'Configuration', 'Log'], 'Info')
    + grid(2,
           col(f'<div class="row" style="gap: 12px; background: var(--pc); color: var(--on-pc); border-radius: 24px; padding: 16px 20px">{I("Update")}<span class="col grow"><span class="ll">Version 5.18.0 is ready</span><span class="bs">A backup of the app is made first.</span></span>{btn("Changelog", "text", None, True)}{btn("Update", "fill", None, True)}</div>',
               group('Options', setting('Power', 'Start when the machine starts', '', sw(True, 'Start when the machine starts')), setting('ShieldRefresh', 'Restart if it crashes', 'Watchdog', sw(True, 'Restart if it crashes')),
                     setting('Update', 'Update by itself', '', sw(False, 'Update by itself')), setting('ViewDashboard', 'Show in the sidebar', 'As a page of its own', sw(True, 'Show in the sidebar'))), gap=12),
           col(grid(2, stat('CPU', '2%', 'Of 4 cores'), stat('Memory', '9%', '720 MB of 8 GB')),
               group('What it may do', setting('FolderOpen', 'Read and write your configuration', 'Needed to edit files', tag('Granted')), setting('Lan', 'Use the network of the machine', 'Not asked for', tag('No')),
                     setting('ShieldCheck', 'Security rating', '6 of 8', I('InformationOutline')), note='An update that asks for more is held until you agree.'), gap=12), gap=16)
    + row(btn('Uninstall', 'text', 'Delete', False, 'color: var(--err)'), '<span class="grow"></span>')
)
surf(P, 'AppPage', 'One app', 'Settings, Apps', 'Studio Code Server', body)

# ---------- Dashboards ----------
body = (
    head('Dashboards', 'The pages on the navigation rail. Reorder them by dragging.', btn('Add dashboard', 'fill', 'Plus'))
    + tabs(['Dashboards', 'Resources'], 'Dashboards')
    + table([('Dashboard', 4), ('Kind', 2), ('Who sees it', 2), ('On the rail', 1), ('', 1)],
            [[('Home', 'Built from your areas'), 'Automatic', 'Everyone', sw(True, 'Home on the rail'), tag('Default', 'p')], [('Family', '4 views'), 'Made by you', 'Everyone', sw(True, 'Family on the rail'), ib('DotsVertical', 'More')],
             [('Energy', 'Usage and solar'), 'Automatic', 'Everyone', sw(True, 'Energy on the rail'), ib('DotsVertical', 'More')], [('Map', 'People and zones'), 'Automatic', 'Everyone', sw(True, 'Map on the rail'), ib('DotsVertical', 'More')],
             [('Wall tablet', '1 view, large tiles'), 'Made by you', 'Kitchen tablet', sw(False, 'Wall tablet on the rail'), ib('DotsVertical', 'More')], [('Admin', 'Network and batteries'), 'Made by you', 'Administrators', sw(True, 'Admin on the rail'), ib('DotsVertical', 'More')]],
            'Dashboards', ['Home', 'ViewDashboard', 'LightningBolt', 'Map', 'Tablet', 'ShieldAccount'])
    + note('Resources are extra card files from the community. There are 3. Each is listed with where it came from and can be removed.')
)
surf(P, 'Dashboards', 'Dashboards and resources', C, 'Dashboards', body)

# ---------- Voice assistants ----------
def va(icon, name, sub, tone, tags_):
    return card(row(f'<span class="sq" style="background: var(--sl0)">{I(icon)}</span>', f'<div class="col grow"><span class="tl">{name}</span><span class="bm">{sub}</span></div>', ib('DotsVertical', name + ' options')), row(*tags_, gap=8, style='flex-wrap: wrap'),
                label=name, style=f'padding: 24px; background: var(--{tone}); color: var(--on-{tone})', gap=16)
body = (
    head('Voice assistants', 'Talk to your home. Choose who listens, who thinks and who answers.', btn('Add assistant', 'fill', 'Plus'))
    + tabs(['Assistants', 'Expose', 'Voice devices'], 'Assistants')
    + grid(3, va('HomeAssistant', 'Home Assistant', 'Preferred. Runs at home, in English.', 'pc', [tag('Whisper'), tag('Home Assistant'), tag('Piper')]),
           va('Robot', 'Smart helper', 'Uses a language model for open questions.', 'tc', [tag('Whisper'), tag('Ollama, local'), tag('Piper')]),
           va('Cloud', 'Cloud voice', 'Faster speech, needs the internet.', 'sc', [tag('Cloud'), tag('Home Assistant'), tag('Cloud')]))
    + grid(2, group('Other assistants', setting('GoogleAssistant', 'Google Assistant', '12 entities exposed', I('ChevronRight')), setting('Microphone', 'Amazon Alexa', 'Not set up', btn('Set up', 'tonal', None, True))),
           group('Voice devices', setting('SpeakerWireless', 'Kitchen voice puck', 'Wake word: Okay Nabu. Uses Home Assistant', I('ChevronRight')), setting('Cellphone', 'Sam’s phone', 'Uses Home Assistant', I('ChevronRight'))), gap=16)
)
surf(P, 'VoiceAssistants', 'Voice assistants', C, 'Voice assistants', body)

# ---------- Voice pipeline ----------
def stage(n, icon, title, value, sub):
    return card(row(f'<span class="tag p" style="height: 28px; min-width: 28px; justify-content: center">{n}</span>', I(icon), f'<span class="tm grow">{title}</span>'), select(title, value), f'<span class="bs mu">{sub}</span>', label=title, style='padding: 20px', gap=12)
body = (
    frow(field('Name', 'Home Assistant'), select('Language', 'English, United Kingdom'))
    + grid(4, stage(1, 'EarHearing', 'Wake word', 'Okay Nabu', 'Heard on the voice device itself.'), stage(2, 'Microphone', 'Speech to text', 'Whisper, at home', 'About 1.2 seconds for a short sentence.'),
           stage(3, 'Brain', 'Conversation', 'Home Assistant', 'Understands commands for your devices.'), stage(4, 'AccountVoice', 'Text to speech', 'Piper, Alba', 'A calm voice with a Scottish accent.'))
    + grid(2, group('Behaviour', setting('HomeAssistant', 'Prefer handling commands at home', 'Only ask the language model when a command is not understood', sw(True, 'Prefer handling commands at home')),
                    setting('TimerOutline', 'Stop listening after', '3 seconds of silence', I('ChevronRight'))),
           card('<h2 class="tm">Try it</h2>', f'<label class="field focus"><span class="bl grow">Turn on the kitchen lights</span>{I("Send", "s")}</label>',
                kv(('Understood as', 'Turn on, Counter and Island'), ('Answer', 'Turned on 2 lights'), ('Took', '0.18 seconds')), row(btn('Open the debugger', 'text', 'Bug', True)), label='Try it', style='padding: 24px'), gap=16)
    + row(btn('Delete', 'text', 'Delete', False, 'color: var(--err)'), '<span class="grow"></span>', btn('Make preferred', 'out'), btn('Save', 'fill'))
)
surf(P, 'VoicePipeline', 'One voice assistant, its four stages', 'Settings, Voice assistants', 'Home Assistant', body)

# ---------- Expose ----------
body = (
    head('Expose', 'Which entities each assistant may see and control. 64 are exposed.')
    + tabs(['Assistants', 'Expose', 'Voice devices'], 'Expose')
    + toolbar('Search exposed entities', chip('Assist', True), chip('Google Assistant'), chip('Alexa'), chip('Area: any', False, 'MenuDown'))
    + table([('Entity', 3), ('Also called', 3), ('Area', 2), ('Assist', 1), ('Google', 1), ('Alexa', 1)],
            [['Ceiling', 'big light', 'Living room', sw(True, 'Ceiling, Assist'), sw(True, 'Ceiling, Google'), sw(False, 'Ceiling, Alexa')], ['Front door lock', '<span class="mu">None</span>', 'Hallway', sw(True, 'Front door lock, Assist'), sw(False, 'Front door lock, Google'), sw(False, 'Front door lock, Alexa')],
             ['Thermostat', 'heating', 'Living room', sw(True, 'Thermostat, Assist'), sw(True, 'Thermostat, Google'), sw(False, 'Thermostat, Alexa')], ['Television', 'TV, telly', 'Living room', sw(True, 'Television, Assist'), sw(True, 'Television, Google'), sw(False, 'Television, Alexa')],
             ['Garage door', '<span class="mu">None</span>', 'Garage', sw(False, 'Garage door, Assist'), sw(False, 'Garage door, Google'), sw(False, 'Garage door, Alexa')]], 'Exposed entities', ['CeilingLight', 'Lock', 'Thermostat', 'Television', 'Garage'])
    + note('Locks, doors and alarms are not exposed until you choose to. New entities are exposed to Assist only.', '', 'ShieldCheck')
)
surf(P, 'Expose', 'Expose entities to assistants', 'Settings, Voice assistants', 'Expose', body)

# ---------- Tags ----------
body = (
    head('Tags', 'Scan a sticker or card with your phone to run an automation.', btn('Add tag', 'fill', 'Plus'))
    + row(col(table([('Tag', 2), ('Last scanned', 3), ('', 4)],
                    [['Bedside', 'Today, 6:44 am, by Sam’s phone', btn('Create automation', 'text', 'Robot', True) + ib('Pencil', 'Write this tag')], ['Front door', 'Today, 5:40 pm, by Sam’s phone', btn('Create automation', 'text', 'Robot', True) + ib('Pencil', 'Write this tag')],
                     ['Washing machine', 'Saturday, by Mika’s phone', btn('Create automation', 'text', 'Robot', True) + ib('Pencil', 'Write this tag')], ['Guest Wi-Fi', '<span class="mu">Never</span>', btn('Create automation', 'text', 'Robot', True) + ib('Pencil', 'Write this tag')]], 'Tags', 'NfcVariant'), style='flex: 2; min-width: 0'),
          card(f'<span class="sq" style="width: 72px; height: 72px; border-radius: 28px; background: var(--pc); color: var(--on-pc)">{I("CellphoneNfc", "l")}</span>', '<h2 class="tl">Waiting for a scan</h2>',
               '<p class="bm mu">Hold a new tag to the back of a phone that has the app. It appears here, ready to name.</p>', track(40, 'Listening for a tag'), label='Scan a new tag', style='flex: 1; min-width: 0; padding: 24px; align-items: flex-start'),
          gap=20, style='align-items: flex-start')
)
surf(P, 'Tags', 'Tags', C, 'Tags', body)

# ---------- People ----------
def person(name, c, where, sub, signin=True):
    return card(row(f'<span class="av" style="width: 64px; height: 64px; border-radius: 24px; font-size: 22px; background: var(--{c}); color: var(--on-{c})">{name[0]}</span>', f'<div class="col grow"><span class="tl">{name}</span><span class="bm mu">{where}</span></div>', ib('Pencil', 'Edit ' + name)),
                row(tag('Can sign in', 'p') if signin else tag('No sign-in'), tag(sub), gap=8), label=name, style='padding: 24px', gap=16)
body = (
    head('People', 'Who lives here. A person is followed by their phone or another tracker.', btn('Add person', 'fill', 'Plus'))
    + tabs(['People', 'Users'], 'People')
    + grid(2, person('Sam', 'pc', 'Home, since 5:40 pm', 'Sam’s phone'), person('Mika', 'tc', 'Home, since 3:15 pm', 'Mika’s phone'), person('Jo', 'amberc', 'Work', 'Jo’s phone, car'), person('Lee', 'greenc', 'Away', 'Watch', False))
    + note('A person without a sign-in still shows on the map and in automations. Good for children and guests.')
)
surf(P, 'People', 'People', C, 'People', body)

# ---------- Users ----------
body = (
    head('Users', 'Accounts that can sign in to this Home Assistant.', btn('Add user', 'fill', 'Plus'))
    + tabs(['People', 'Users'], 'Users')
    + toolbar('Search users')
    + table([('User', 3), ('Role', 2), ('Second step', 2), ('Away from home', 2), ('Last signed in', 2)],
            [[('Sam', 'sam'), tag('Owner', 'p'), tag('On', 'g'), 'Allowed', 'Today'], [('Mika', 'mika'), 'Administrator', tag('On', 'g'), 'Allowed', 'Today'],
             [('Jo', 'jo'), 'User', tag('Off', 'a'), 'Allowed', 'Yesterday'], [('Kitchen tablet', 'tablet'), 'User', '<span class="mu">Not needed</span>', tag('Home network only'), 'Today'],
             [('Home Assistant Cloud', 'System account'), '<span class="mu">System</span>', '', '', '']], 'Users', ['Account', 'Account', 'Account', 'Tablet', 'Cloud'])
    + note('Owner cannot be removed. A user limited to the home network cannot sign in through remote access.')
)
surf(P, 'Users', 'Users', C, 'Users', body)

# ---------- Energy setup ----------
def src(icon, name, sub, tone=''):
    lead = f' style="background: var(--{tone}); color: var(--on-{tone})"' if tone else ''
    return f'<div class="li" style="background: var(--sl0)"><span class="lead"{lead}>{I(icon)}</span><span class="col grow"><span class="ll">{name}</span><span class="bs mu">{sub}</span></span>{ib("Pencil", "Edit " + name)}</div>'
def egroup(title, desc, *items, addl):
    return card(f'<div class="col"><h2 class="tm">{title}</h2><span class="bs mu">{desc}</span></div>', *items, row(btn(addl, 'text', 'Plus', True)), label=title, style='padding: 20px', gap=8)
body = (
    head('Energy setup', 'Tell Home Assistant where your energy comes from and where it goes.')
    + grid(3, egroup('Electricity grid', 'What you buy and what you sell back.', src('TransmissionTower', 'Grid consumption', 'Smart meter, 0.31 per kWh', 'pc'), src('TransmissionTowerExport', 'Return to grid', 'Smart meter, 0.09 per kWh', 'greenc'), addl='Add a meter'),
           egroup('Solar panels', 'Production, and a forecast if you want one.', src('SolarPower', 'Roof, south', 'Inverter, with forecast', 'amberc'), addl='Add solar'),
           egroup('Home battery', 'Energy going in and coming out.', note('No battery set up.'), addl='Add a battery'),
           egroup('Gas', 'For heating and hot water.', src('Fire', 'Gas meter', 'In m³, 1.14 per m³', 'heatc'), addl='Add a gas source'),
           egroup('Water', 'From the mains.', src('Water', 'Water meter', 'In litres'), addl='Add a water source'),
           egroup('Individual devices', 'To see what uses the most.', src('Dishwasher', 'Dishwasher', 'Smart plug'), src('Television', 'Television', 'Smart plug'), addl='Add a device'), gap=16)
    + row('<span class="bs mu grow">Statistics are kept for as long as you like. Costs use the prices above from the day you entered them.</span>', btn('Open the Energy dashboard', 'tonal', 'LightningBolt'))
)
surf(P, 'EnergyConfig', 'Energy setup', C, 'Energy', body)
