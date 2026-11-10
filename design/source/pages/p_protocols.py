from lib import *

P = 'protocols'
C = 'Settings, Devices and services'

def hero(icon, label, big_, sub, tone, *actions):
    return row(f'<section class="card hero col grow" aria-label="{label}" style="background: var(--{tone}c); color: var(--{"on-" + tone + "c" if tone in ("p", "s", "t") else tone}); gap: 8px">'
               + row(I(icon, 'l'), f'<span class="ll">{label}</span>') + f'<span class="hl">{big_}</span><span class="bl">{sub}</span></section>',
               col(*actions, gap=8, style='justify-content: center'), gap=24, style='align-items: stretch')

def mesh(nodes, links, label):
    ls = ''.join(f'<line x1="{nodes[a][0]}" y1="{nodes[a][1]}" x2="{nodes[b][0]}" y2="{nodes[b][1]}" stroke="#72777F" stroke-width="{w}" stroke-opacity=".5"></line>' for a, b, w in links)
    ns = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"></circle>' for x, y, r, c in nodes)
    return f'<svg viewBox="0 0 520 260" role="img" aria-label="{label}" style="display: block; width: 100%; height: 260px; border-radius: 24px; background: var(--sl0)">{ls}{ns}</svg>'

# ---------- Zigbee ----------
net = mesh([(260, 130, 18, '#00639B'), (140, 70, 12, '#68587A'), (380, 80, 12, '#68587A'), (120, 190, 12, '#68587A'), (400, 190, 12, '#68587A'), (60, 110, 8, '#1F6A3B'), (200, 30, 8, '#1F6A3B'), (460, 130, 8, '#1F6A3B'), (300, 220, 8, '#1F6A3B'), (40, 220, 8, '#BA1A1A')],
           [(0, 1, 4), (0, 2, 4), (0, 3, 3), (0, 4, 4), (1, 5, 2), (1, 6, 2), (2, 7, 2), (4, 8, 2), (3, 9, 1)], 'The Zigbee network: one coordinator, four routers and five battery devices. One battery device has a weak link.')
body = (
    hero('Zigbee', 'Zigbee', '23 devices, network is healthy', 'Channel 15. The coordinator is the USB stick on this machine. 1 device has a weak link.', 'green', btn('Add a device', 'fill lg', 'Plus'), btn('Network settings', 'out lg', 'Cog'))
    + row(card(row('<h2 class="tm grow">The network</h2>', seg(['Map', 'List'], 'Map', 'View')), net,
               row(*[f'<span class="row bs mu" style="gap: 6px"><span style="width: 10px; height: 10px; border-radius: 5px; background: {c}"></span>{n}</span>' for n, c in [('Coordinator', '#00639B'), ('Routers, mains powered', '#68587A'), ('Battery devices', '#1F6A3B'), ('Weak link', '#BA1A1A')]], gap=16, style='flex-wrap: wrap'),
               label='Network map', style='flex: 3; min-width: 0; padding: 24px'),
          col(group('', setting('AccountGroup', 'Groups', '3 groups, for lights that switch together', I('ChevronRight')), setting('ChartBellCurve', 'Change channel', 'Now 15. Wi-Fi overlap is low', I('ChevronRight')),
                    setting('BackupRestore', 'Back up the network', 'Last backup today, 4:45 am', btn('Download', 'text', None, True)), setting('SwapHorizontal', 'Move to another radio', 'Keeps every device paired', I('ChevronRight')), style='padding: 12px'),
              note('Garden door sensor has a weak link (signal 38 of 255). A mains-powered device nearby would relay for it.', 'warn', 'SignalCellular1'), gap=12, style='flex: 2; min-width: 0'), gap=20, style='align-items: flex-start')
)
surf(P, 'Zigbee', 'Zigbee network', C, 'Zigbee', body)

# ---------- Z-Wave ----------
body = (
    hero('ZWave', 'Z-Wave', 'Ready, 9 devices', 'Controller on the USB stick, firmware 7.21. Long Range is on. Every device answered in the last hour.', 'p', btn('Add a device', 'fill lg', 'Plus'), btn('Remove a device', 'out lg', 'Minus'))
    + grid(3, stat('Messages sent', '12,408', '0.2% needed a retry'), stat('Slowest device', '310 ms', 'Garage door opener'), stat('Asleep', '4', 'Battery devices wake by themselves', '', 'Sleep'))
    + grid(2, group('Network', setting('TransitConnectionVariant', 'Rebuild routes', 'Asks every device to find its best path again. About 10 minutes', btn('Rebuild', 'tonal', None, True)),
                    setting('KeyChain', 'Security keys', '4 keys. Keep a copy somewhere safe', btn('Show', 'text', None, True)), setting('Update', 'Device firmware', 'All up to date', I('ChevronRight'))),
           group('Add with a QR code', f'<div class="row" style="gap: 16px; padding: 8px 16px"><span class="sq" style="width: 96px; height: 96px; border-radius: 20px; background: var(--sl0)">{I("QrcodeScan", "l")}</span><span class="col grow"><span class="ll">SmartStart</span><span class="bs mu">Scan the code on the box. The device joins by itself when it is powered on, with full security.</span>{btn("Scan a code", "tonal", "Camera", True)}</span></div>',
                 setting('TextBoxSearch', 'Live log', 'Every Z-Wave message as it happens', btn('Open', 'text', None, True))), gap=16)
)
surf(P, 'ZWave', 'Z-Wave network', C, 'Z-Wave', body)

# ---------- Matter ----------
body = (
    hero('HexagonMultiple', 'Matter', '6 devices', 'Shared with Apple Home and Google Home. Devices use Wi-Fi and Thread.', 't', btn('Add a device', 'fill lg', 'Plus'), btn('Share a device', 'out lg', 'ShareVariant'))
    + row(card('<h2 class="tm">Add a Matter device</h2>', '<p class="bm mu">Type the setup code from the device or its box, or scan it with your phone.</p>',
               f'<label class="field focus">{I("Numeric", "s")}<span class="col grow"><span class="bs mu">Setup code</span><span class="hs mono">3497 011 2332</span></span></label>',
               row(btn('Scan with the phone app', 'out', 'QrcodeScan'), '<span class="grow"></span>', btn('Add', 'fill')), label='Add a device', style='flex: 1; min-width: 0; padding: 24px'),
          group('Devices', setting('LightbulbOutline', 'Desk lamp', 'Wi-Fi. Also in Apple Home', tag('Online', 'g')), setting('PowerSocketEu', 'Study plug', 'Thread. Also in Google Home', tag('Online', 'g')),
                setting('MotionSensor', 'Stairs motion', 'Thread, battery 92%', tag('Online', 'g')), setting('Blinds', 'Bedroom blind', 'Thread', tag('Slow, 1.8 s', 'a')), row(btn('Show all 6', 'text', None, True), style='padding: 0 8px'), style='flex: 1; min-width: 0'),
          gap=20, style='align-items: flex-start')
    + note('A Matter device can be in several homes at once. Removing it here leaves it working in the others.')
)
surf(P, 'Matter', 'Matter', C, 'Matter', body)

# ---------- Thread ----------
def router(name, sub, pref=False):
    return f'<div class="li" style="background: var(--sl1)"><span class="lead">{I("RouterWireless")}</span><span class="col grow"><span class="ll">{name}</span><span class="bs mu">{sub}</span></span>{tag("Preferred", "p") if pref else ""}{ib("DotsVertical", name + " options")}</div>'
body = (
    hero('Hub', 'Thread', 'One network, 3 border routers', 'Named home-thread-7c2a. 4 devices are on it. Border routers connect Thread devices to the rest of your network.', 'p', btn('Add a border router', 'tonal lg', 'Plus'))
    + row(col('<h2 class="tm" style="padding: 0 8px">Preferred network: home-thread-7c2a</h2>', router('Home Assistant, this machine', 'OpenThread border router app, channel 15', True), router('Living room speaker', 'Google Nest, channel 15'), router('Hallway hub', 'Apple, channel 15'),
              '<h2 class="tm" style="padding: 12px 8px 0">Other networks seen</h2>', router('MyHome-1f04', 'A network from another maker. Its devices cannot be reached from here'), gap=4, style='flex: 3; min-width: 0'),
          col(note('All your border routers use the same network, so a device stays connected if one of them is switched off.', 'ok', 'Check'),
              group('', setting('KeyVariant', 'Network credentials', 'Send them to your phone so it can add devices', btn('Send', 'tonal', None, True)), setting('ChartBellCurve', 'Channel', '15', I('ChevronRight')), style='padding: 12px'), gap=12, style='flex: 2; min-width: 0'),
          gap=20, style='align-items: flex-start')
)
surf(P, 'Thread', 'Thread networks', C, 'Thread', body)

# ---------- Bluetooth ----------
body = (
    head('Bluetooth', '2 adapters, 31 devices heard in the last minute.')
    + grid(2, card(row(I('Bluetooth'), '<div class="col grow"><span class="tm">Built-in adapter</span><span class="bs mu">hci0, on this machine</span></div>', tag('Listening', 'g')), '<span class="ll mu">Connections in use, 2 of 5</span>', track(40, '2 of 5 connections in use'), label='Built-in adapter', style='padding: 24px'),
           card(row(I('AccessPoint'), '<div class="col grow"><span class="tm">Bedroom proxy</span><span class="bs mu">An ESPHome device that relays Bluetooth</span></div>', tag('Listening', 'g')), '<span class="ll mu">Connections in use, 1 of 3</span>', track(33, '1 of 3 connections in use'), label='Bedroom proxy', style='padding: 24px'))
    + tabs(['Heard now', 'Connections', 'Map'], 'Heard now')
    + toolbar('Search by name or address', chip('Known devices', True), chip('Strong signal'))
    + table([('Device', 3), ('Address', 3), ('Heard by', 2), ('Signal', 2), ('Last heard', 2)],
            [['Plant sensor', '<span class="mono bs">C4:7C:8D:6A:11:02</span>', 'Bedroom proxy', '−58 dBm, strong', '2 seconds ago'], ['Toothbrush', '<span class="mono bs">24:DA:11:0F:3B:9E</span>', 'Built-in', '−71 dBm', '11 seconds ago'],
             ['Sam’s watch', '<span class="mono bs">Private address</span>', 'Built-in', '−64 dBm', '1 second ago'], ['Unknown', '<span class="mono bs">7A:19:C2:44:D0:5B</span>', 'Bedroom proxy', '−89 dBm, weak', '40 seconds ago']], 'Advertisements heard', 'Bluetooth')
)
surf(P, 'BluetoothPage', 'Bluetooth', C, 'Bluetooth', body)

# ---------- MQTT ----------
body = (
    head('MQTT', 'Connected to the Mosquitto broker app on this machine. 8 devices use it.', tag('Connected', 'g'), btn('Reconfigure', 'out', 'Cog'))
    + grid(2, card('<h2 class="tm">Publish a message</h2>', field('Topic', 'home/test/hello', mono=True), '<span class="bs mu">Message</span>',
                   '<div class="mono" style="background: var(--sl0); border-radius: 16px; padding: 16px; font-size: 13px; min-height: 72px">{ "state": "ON", "brightness": 128 }</div>',
                   row(select('Quality of service', '0, at most once'), setting('Pin', 'Retain', '', sw(False, 'Retain')), style='align-items: center'), row('<span class="grow"></span>', btn('Publish', 'fill', 'Send')), label='Publish a message', style='padding: 24px'),
           card(row('<h2 class="tm grow">Listen to a topic</h2>', '<span class="row bs mu" style="gap: 6px"><span style="width: 8px; height: 8px; border-radius: 4px; background: var(--green)"></span>Live</span>', btn('Stop', 'out', 'Stop', True)), field('Topic', 'zigbee2mqtt/#', mono=True),
                *[f'<div class="col" style="background: var(--sl0); border-radius: 16px; padding: 12px 16px; gap: 2px"><div class="row"><span class="ll mono grow">{t_}</span><span class="bs mu">{w}</span></div><span class="mono bs mu">{p}</span></div>'
                  for t_, w, p in [('zigbee2mqtt/hallway_motion', '21:14:02', '{"occupancy": true, "battery": 8}'), ('zigbee2mqtt/front_door', '21:13:40', '{"contact": true, "linkquality": 142}'), ('zigbee2mqtt/bridge/state', '21:10:00', '{"state": "online"}')]],
                '<span class="bs mu">3 messages. The newest 50 are kept while this page is open.</span>', label='Listen to a topic', style='padding: 24px', gap=8), gap=16)
    + group('Broker options', setting('MagnifyScan', 'Discovery', 'Devices that announce themselves are added. Prefix: homeassistant', sw(True, 'Discovery')), setting('CakeVariant', 'Birth and last will messages', 'Tell other programs when Home Assistant starts and stops', sw(True, 'Birth and last will')))
)
surf(P, 'Mqtt', 'MQTT', C, 'MQTT', body)

# ---------- Infrared and radio ----------
body = (
    head('Infrared and radio remotes', 'Control older devices by replaying the signals of their remotes.', btn('Learn a command', 'fill', 'RecordCircle'))
    + tabs(['Infrared', 'Radio frequency'], 'Infrared')
    + row(col(table([('Command', 3), ('Device', 2), ('Sent by', 2), ('', 2)],
                    [['Power', 'Television', 'Living room blaster', btn('Send', 'tonal', 'Play', True)], ['Input, HDMI 1', 'Television', 'Living room blaster', btn('Send', 'tonal', 'Play', True)],
                     ['Cool, 24°', 'Bedroom air conditioner', 'Bedroom blaster', btn('Send', 'tonal', 'Play', True)], ['Fan speed up', 'Ceiling fan', 'Bedroom blaster', btn('Send', 'tonal', 'Play', True)]], 'Learned commands', 'RemoteTv'), style='flex: 3; min-width: 0'),
          card(f'<span class="sq" style="width: 72px; height: 72px; border-radius: 28px; background: var(--pc); color: var(--on-pc)">{I("Remote", "l")}</span>', '<h2 class="tl">Point the remote at the blaster</h2>',
               '<p class="bm mu">Press the button you want to teach, once. The Living room blaster is listening for 20 seconds.</p>', track(55, 'Listening, 9 seconds left'), row(btn('Cancel', 'out', None, True)), label='Learning a command', style='flex: 2; min-width: 0; padding: 24px; align-items: flex-start'),
          gap=20, style='align-items: flex-start')
    + note('Radio frequency works the same way for 433 MHz sockets, blinds and doorbells. Signals with rolling codes, such as car keys and most garage doors, cannot be copied, and the page says so when it hears one.')
)
surf(P, 'Infrared', 'Infrared and radio remotes', C, 'Infrared and radio', body)

# ---------- LoRaWAN ----------
lora = mesh([(260, 60, 18, '#00639B'), (90, 190, 10, '#1F6A3B'), (200, 210, 10, '#1F6A3B'), (330, 200, 10, '#1F6A3B'), (440, 180, 10, '#6B5200')], [(0, 1, 2), (0, 2, 3), (0, 3, 3), (0, 4, 1)], 'One gateway and four far-away sensors. One sensor has a weak link.')
body = (
    head('LoRaWAN', 'Far-away sensors that send a little data over a long distance. 1 gateway, 4 devices.', btn('Add a device', 'fill', 'Plus'))
    + row(card('<h2 class="tm">Topology</h2>', lora, '<span class="bs mu">Line thickness shows signal quality.</span>', label='Topology', style='flex: 1; min-width: 0; padding: 24px'),
          col(table([('Device', 3), ('Last message', 2), ('Signal', 2)], [['Mailbox sensor', '12 minutes ago', '−97 dBm'], ['Pond level', '4 minutes ago', '−88 dBm'], ['Gate contact', '1 hour ago', '−91 dBm'], ['Orchard soil', '3 hours ago', tag('−118 dBm, weak', 'a')]], 'LoRaWAN devices', 'AccessPointNetwork'),
              group('', setting('RouterWireless', 'Gateway', 'Roof gateway, 868 MHz, online', I('ChevronRight')), setting('KeyVariant', 'Device keys', 'Kept on this machine', I('ChevronRight')), style='padding: 12px'), gap=12, style='flex: 1; min-width: 0'),
          gap=20, style='align-items: flex-start')
)
surf(P, 'Lorawan', 'LoRaWAN', C, 'LoRaWAN', body)

# ---------- Serial and Modbus ----------
body = (
    head('Serial ports and Modbus', 'Wired connections to meters, inverters and heat pumps.')
    + grid(2, group('Serial ports on this machine', setting('Usb', '/dev/ttyUSB0', 'Zigbee coordinator. In use by Zigbee', tag('In use', 'p')), setting('Usb', '/dev/ttyACM0', 'Z-Wave stick. Free', tag('Free')),
                    setting('SerialPort', '/dev/ttyUSB1', 'USB to RS-485 adapter. In use by Modbus', tag('In use', 'p')), note='A port can be used by one integration at a time.'),
           group('Modbus hubs', setting('Lan', 'Heat pump', 'TCP, 192.168.1.60 port 502. 14 registers read every 30 seconds', tag('Reading', 'g')), setting('SerialPort', 'Energy meter', 'RTU on /dev/ttyUSB1, 9600 baud, address 1', tag('Reading', 'g')), row(btn('Add a hub', 'tonal', 'Plus', True), style='padding: 4px 16px')), gap=16)
    + card(row('<h2 class="tm grow">Read a register by hand</h2>', select('Hub', 'Energy meter')), frow(field('Address', '30073', mono=True), select('Kind', 'Input register'), select('Read as', '32-bit float')),
           row('<div class="col grow"><span class="bs mu">Answer</span><span class="hs mono">2417.6</span><span class="bs mu">Raw: 0x4517 0x199A. Took 42 ms.</span></div>', btn('Read', 'fill', 'Play'), btn('Make this a sensor', 'out')), label='Read a register', style='padding: 24px')
)
surf(P, 'Serial', 'Serial ports and Modbus', C, 'Serial and Modbus', body)

# ---------- Network discovery ----------
body = (
    head('Network discovery', 'What Home Assistant can hear on your network. Useful when a device will not show up.')
    + tabs(['Addresses given out (DHCP)', 'Announcements (SSDP)', 'Services (Zeroconf)'], 'Services (Zeroconf)')
    + toolbar('Search by name, type or address', chip('Matches an integration', True), chip('Not set up'))
    + table([('Name', 3), ('Service type', 3), ('Address', 2), ('Integration', 2)],
            [['Kitchen speaker', '<span class="mono bs">_sonos._tcp.local.</span>', '192.168.1.42', 'Sonos'], ['Hue Bridge', '<span class="mono bs">_hue._tcp.local.</span>', '192.168.1.20', 'Philips Hue'], ['garden-sensor', '<span class="mono bs">_esphomelib._tcp.local.</span>', '192.168.1.77', tag('Not set up', 'a')],
             ['Living room TV', '<span class="mono bs">_googlecast._tcp.local.</span>', '192.168.1.31', 'Google Cast'], ['Printer', '<span class="mono bs">_ipp._tcp.local.</span>', '192.168.1.50', 'Internet Printing']], 'Services heard', 'AccessPoint')
    + row('<span class="bs mu grow">58 services heard. Select a row for everything the device said about itself.</span>', btn('Export', 'out', 'Export', True))
)
surf(P, 'Discovery', 'Network discovery browsers', C, 'Network discovery', body)

# ---------- Application credentials ----------
body = (
    head('Application credentials', 'Sign-in details for services that ask you to register your own app, such as Google or Spotify.', btn('Add credential', 'fill', 'Plus'))
    + table([('Name', 3), ('Integration', 2), ('Client ID', 4), ('Used by', 2), ('', 1)],
            [['Home, Google', 'Google Calendar', '<span class="mono bs">7341…apps.googleusercontent.com</span>', '1 calendar account', ib('DotsVertical', 'More')], ['Home, Spotify', 'Spotify', '<span class="mono bs">a81c…9f20</span>', 'Sam', ib('DotsVertical', 'More')],
             ['Old test app', 'Google Mail', '<span class="mono bs">5520…apps.googleusercontent.com</span>', '<span class="mu">Not used</span>', ib('Delete', 'Delete Old test app')]], 'Application credentials', 'KeyVariant')
    + note('The client secret is never shown again after you save it. A credential that an integration still uses cannot be deleted.', '', 'ShieldCheck')
)
surf(P, 'AppCredentials', 'Application credentials', C, 'Application credentials', body)
