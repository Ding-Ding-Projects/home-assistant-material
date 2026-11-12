"""Modern remake, group 4: Protocols and entity dialogs (canvases 07 and 08)."""
from ui import *

begin('protocols')
P1, P2 = 'protocols', 'dialogs'
S = 'Settings'


def net_graph(nodes, t='p'):
    """A small mesh: a coordinator in the middle, routers and end devices around it."""
    import math
    cx, cy, out = 50, 50, ''
    pts = []
    for i, (label, kind) in enumerate(nodes):
        a = i / len(nodes) * 2 * math.pi
        r = 30 if kind == 'r' else 42
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a), label, kind))
    lines = ''.join(f'<line x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}" stroke="var(--out)" stroke-width=".5"/>' for x, y, _, k in pts if k == 'r')
    lines += ''.join(f'<line x1="{pts[(i - 1) % len(pts)][0]:.1f}" y1="{pts[(i - 1) % len(pts)][1]:.1f}" x2="{x:.1f}" y2="{y:.1f}" stroke="var(--out)" stroke-width=".4" stroke-dasharray="1 1"/>' for i, (x, y, _, k) in enumerate(pts) if k == 'e')
    dots = ''.join(f'<div style="position:absolute;left:calc({x:.1f}% - 18px);top:calc({y:.1f}% - 18px)" class="floaty">{ico("Router" if k == "r" else "Circle", "p" if k == "r" else "t", 36, 18, 18)}</div>' for x, y, _, k in pts)
    return (f'<div style="position:relative;height:460px;border-radius:24px;background:var(--s1)"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">{lines}</svg>'
            f'<div style="position:absolute;left:calc(50% - 30px);top:calc(50% - 30px)">{ico("Hub", t, 60, 22, 30)}</div>{dots}</div>')


def proto(name, title, sub, icon, t, stats_, side, graph=True, extra=''):
    body = header(title, sub, 'Settings › Connectivity', row(btn('Add device', 'fill', 'Plus'), tools(), gap=10))
    body += stats(*stats_) + '<div style="height:16px"></div>'
    body += grid('1.5fr 1fr', card(net_graph([(str(i), 'r' if i % 3 == 0 else 'e') for i in range(12)], t), title='Network map', action=live('Healthy')) if graph else extra, side)
    page_board(name, title, P1, body, S, caption=f'{title}: numbers first, the mesh drawn live, the details beside it')


proto('M07Zigbee', 'Zigbee network', 'ZHA · channel 15 · 24 devices', 'Zigbee', 'p', [('24', 'Devices', 'p', 'Zigbee'), ('6', 'Routers', 't', 'Router'), ('15', 'Channel', 'g', 'Wifi'), ('1', 'Offline', 'e', 'LanDisconnect')],
      col(card(kv([('Coordinator', 'SkyConnect'), ('Firmware', '7.4.4'), ('PAN ID', '0x1A2B'), ('Backups', 'Daily')]), title='Coordinator'), card(row(btn('Permit joining', 'ton', 'Plus'), btn('Backup', 'out', 'Download')), title='Actions'), gap=16))
proto('M07ZWave', 'Z-Wave network', 'Z-Wave JS · 9 devices', 'ZWave', 't', [('9', 'Devices', 't', 'ZWave'), ('8', 'Ready', 'g', 'Check'), ('1', 'Asleep', 'w', 'Sleep'), ('S2', 'Security', 'p', 'Shield')],
      col(card(kv([('Controller', 'Zooz ZST39'), ('Home ID', '0xE3A1F4D2'), ('Region', 'USA')]), title='Controller'), card(row(btn('Add device', 'ton', 'Plus'), btn('Heal network', 'out', 'Bandage')), title='Actions'), gap=16))
proto('M07Matter', 'HexagonMultiple', 'Matter server · 5 devices on 2 fabrics', 'HexagonMultiple', 'g', [('5', 'Devices', 'g', 'Devices'), ('2', 'Fabrics', 'p', 'Lan'), ('3', 'Over Thread', 't', 'Lan'), ('2', 'Over Wi-Fi', 'w', 'Wifi')],
      lst([('Lightbulb', 'Eve light strip', 'Thread · 2 fabrics', btn('Share', 'ton', size='sm'), 'w'), ('PowerSocketUs', 'Nanoleaf plug', 'Wi-Fi', btn('Share', 'ton', size='sm'), 'p'), ('ThermostatBox', 'Ecobee', 'Thread', btn('Share', 'ton', size='sm'), 't')], 'Devices'), graph=False,
      extra=card(empty('HexagonMultiple', 'Add a Matter device', 'Scan its QR code with the companion app, or type the 11-digit code.', btn('Add with a code', 'fill', 'Numeric')), pad=16))
proto('M07Thread', 'Thread networks', '1 network · 3 border routers', 'Lan', 'p', [('1', 'Networks', 'p', 'Lan'), ('3', 'Border routers', 't', 'Router'), ('11', 'Devices', 'g', 'Devices'), ('25', 'Channel', 'w', 'Wifi')],
      lst([('Router', 'Home Assistant Connect ZBT-1', 'Preferred · this machine', pill('Preferred', 'p'), 'p'), ('Router', 'Apple TV', 'Living room', '', 't'), ('Router', 'Nest Hub', 'Kitchen', '', 'g')], 'Border routers'))
proto('M07Bluetooth', 'Bluetooth', '2 adapters · 18 devices heard', 'Bluetooth', 'p', [('2', 'Adapters', 'p', 'Bluetooth'), ('18', 'Heard', 't', 'AccessPoint'), ('3', 'Connected', 'g', 'Link'), ('4', 'Proxies', 'w', 'Router')], graph=False,
      extra=lst([('Thermometer', 'Govee H5075', '−62 dBm · 2 s ago', bar(70, 'g'), 'g'), ('Lock', 'Yale lock', '−71 dBm · 5 s ago', bar(50, 'w'), 'w'), ('Watch', 'Fitness band', '−88 dBm · 20 s ago', bar(20, 'e'), 'e')], 'Advertisements', live('Scanning')),
      side=card(kv([('hci0', 'Built in · active'), ('ESPHome proxy', 'Garage · active')]), title='Adapters'))
proto('M07MQTT', 'MQTT', 'Broker at core-mosquitto:1883', 'Antenna', 't', [('5', 'Devices', 't', 'Devices'), ('42', 'Topics', 'p', 'Pound'), ('1.2/s', 'Messages', 'g', 'Message'), ('Yes', 'Discovery', 'w', 'Magnify')], graph=False,
      extra=card(row(field('Topic', 'zigbee2mqtt/#', mono=True, wide=True), btn('Listen', 'fill', 'EarHearing'), align='flex-end'), code('zigbee2mqtt/hall_motion\n{"occupancy": true, "battery": 48}\nzigbee2mqtt/kitchen_plug\n{"state": "ON", "power": 112.4}'), title='Listen to a topic', action=live('2 messages')),
      side=card(field('Topic', 'home/test', mono=True), field('Payload', 'hello'), btn('Publish', 'ton', 'Send'), title='Publish'))
proto('M07Remotes', 'Infrared and radio remotes', 'Learn a button once, send it from anywhere', 'Remote', 'w', [('3', 'Transmitters', 'w', 'Remote'), ('24', 'Learned codes', 'p', 'Gesture'), ('2', 'Bands', 't', 'Radio'), ('', '', 'n', 'Circle')][:3], graph=False,
      extra=card(f'<div class="col" style="align-items:center;gap:12px;padding:30px 0"><div style="width:140px;height:140px;border-radius:70px;background:var(--wc);display:grid;place-items:center;color:var(--w);animation:breathe 1.8s ease-in-out infinite">{I("Remote", 60)}</div><b class="h2">Press the button on your remote</b><span class="sm mu">Point it at the Broadlink in the living room</span></div>', title='Learning: TV power'),
      side=lst([('Television', 'TV power', 'IR · 38 kHz', btn('Send', 'ton', size='sm'), 'p'), ('Fan', 'Fan speed', 'RF 433 MHz', btn('Send', 'ton', size='sm'), 't'), ('BlindsHorizontal', 'Blinds up', 'RF 433 MHz', btn('Send', 'ton', size='sm'), 'g')], 'Codes'))
proto('M07LoRaWAN', 'LoRaWAN', 'The Things Network · 2 sensors', 'AccessPoint', 'g', [('2', 'Sensors', 'g', 'AccessPoint'), ('1', 'Gateway', 'p', 'Router'), ('−98', 'Best RSSI', 't', 'SignalCellular2'), ('', '', 'n', 'Circle')][:3], graph=False,
      extra=lst([('Water', 'Garden soil sensor', 'SF7 · −98 dBm · 4 min ago', pill('34% moisture', 'g'), 'g'), ('Mailbox', 'Mailbox', 'SF9 · −112 dBm · 2 h ago', pill('Post!', 'w'), 'w')], 'Sensors'),
      side=card(kv([('Application', 'home-sensors'), ('Region', 'US915'), ('Webhook', 'Connected')]), title='Application'))
proto('M07Serial', 'Serial ports and Modbus', '2 ports · 1 Modbus hub', 'SerialPort', 'p', [('2', 'Ports', 'p', 'SerialPort'), ('1', 'Modbus hub', 't', 'Lan'), ('14', 'Registers', 'g', 'Numeric')][:3], graph=False,
      extra=table(['Register', 'Address', 'Type', 'Value'], [[f'<b>{a}</b>', f'<span class="mono">{b}</span>', c, d] for a, b, c, d in [('Inverter power', '30775', 'int32', '2.4 kW'), ('Battery charge', '30845', 'uint16', '86%'), ('Grid frequency', '30803', 'uint32', '60.01 Hz')]], ['1.6fr', '1fr', '1fr', '1fr'], toolbar=False),
      side=lst([('SerialPort', '/dev/ttyUSB0', 'Silicon Labs CP210x', pill('Zigbee', 'p'), 'p'), ('SerialPort', '/dev/ttyACM0', 'Zooz ZST39', pill('Z-Wave', 't'), 't')], 'Ports'))
proto('M07Discovery', 'Network discovery browsers', 'What is on the network right now', 'Magnify', 'p', [('31', 'Zeroconf', 'p', 'Magnify'), ('14', 'SSDP', 't', 'Lan'), ('9', 'DHCP', 'g', 'Router')], graph=False,
      extra=row(search('Search discovered', w=380), chips('Zeroconf', 'SSDP', 'DHCP', 'Bluetooth'), gap=10) + '<div style="height:12px"></div>' + lst([('Printer', 'Office printer', '_ipp._tcp · 192.168.1.33', pill('Not set up', 'w'), 'p'), ('Television', 'Living room TV', 'SSDP · 192.168.1.51', btn('Set up', 'ton', size='sm'), 't'), ('Chip', 'esphome-hall', 'DHCP · 192.168.1.60', btn('Set up', 'ton', size='sm'), 'g')]),
      side=card(note('Discovery shows what answers on the network. Nothing is added until you set it up.', 'p'), title='About discovery'))
proto('M07AppCreds', 'Application credentials', 'Client IDs for cloud integrations', 'Key', 'w', [('3', 'Credentials', 'w', 'Key'), ('2', 'In use', 'g', 'Link')], graph=False,
      extra=table(['Name', 'Integration', 'Client ID', ''], [[f'<b>{a}</b>', b, f'<span class="mono">{c}</span>', ib('Delete')] for a, b, c in [('Google', 'Google Calendar', '81…apps.googleusercontent.com'), ('Spotify', 'Spotify', '3f9c…a21'), ('Netatmo', 'Netatmo', '5e1d…77b')]], ['1fr', '1fr', '2fr', '60px'], toolbar=False),
      side=card(note('Secrets are stored encrypted and never shown again after you save them.', 'g', 'ShieldCheck'), btn('Add credential', 'fill', 'Plus'), title='Add'))

# ---- 08: entity dialogs, three per board ----


def edlg(title, icon, t, *body, state=''):
    st = f'<span class="sm mu">{e(state)}</span>' if state else ''
    return (f'<div class="dlg" style="width:380px;gap:14px"><div class="row" style="gap:12px">{ico(icon, t, 44, 15, 22)}<div class="col grow" style="gap:1px"><b class="h3">{e(title)}</b>{st}</div>{ib("DotsVertical")}{ib("Close")}</div>'
            f'{"".join(body)}<div class="row" style="gap:6px;border-top:1px solid var(--s2);padding-top:10px">{chip("Controls", True)}{chip("History")}{chip("Settings")}</div></div>')


def big(v, unit=''):
    return f'<div style="font-size:48px;font-weight:500;letter-spacing:-.03em;text-align:center">{v}<span style="font-size:22px;color:var(--mu)">{unit}</span></div>'


def vslider(pct, t='w'):
    return (f'<div style="margin:0 auto;width:120px;height:260px;border-radius:36px;background:var(--s3);position:relative;overflow:hidden">'
            f'<div style="position:absolute;left:0;right:0;bottom:0;height:{pct}%;background:var({TONE[t][1]});transform-origin:bottom;animation:grow 1s var(--spring) .4s both"></div>'
            f'<div style="position:absolute;left:0;right:0;bottom:12px;display:grid;place-items:center;color:#fff">{I("Lightbulb", 30)}</div></div>')


def dboard(name, title, dialogs, caption):
    bg = header('Overview', '', '', tools()) + grid(3, *[tile(i, n, '', c) for i, n, c in [('Lightbulb', 'Lights', 'w'), ('Thermostat', 'Climate', 'p'), ('Lock', 'Locks', 'g')]])
    page_board(name, title, P2, over(bg, *dialogs), 'Overview', caption=caption)


dboard('M08LightClimateCover', 'Entity dialogs: light, climate, cover', [
    edlg('Ceiling', 'Lightbulb', 'w', big('70', '%'), vslider(70), row(*[f'<span style="width:34px;height:34px;border-radius:17px;background:{c}"></span>' for c in ['#ffb357', '#fff1d6', '#9fc3ff', '#c9a6ff', '#ff8b8b']], gap=8, style='justify-content:center'), state='On · warm white'),
    edlg('Living room', 'Thermostat', 'p', f'<div style="display:grid;place-items:center">{ring(66, "22°", "w", 200)}</div>', row(btn('', 'ton', 'Minus'), '<b class="grow" style="text-align:center">Target 22°</b>', btn('', 'ton', 'Plus')), seg(['Heat', 'Cool', 'Auto', 'Off']), state='Heating to 22°'),
    edlg('Blinds', 'BlindsHorizontal', 'g', vslider(40, 'g'), row(btn('Open', 'ton', 'ArrowUp'), btn('Stop', 'out', 'Stop'), btn('Close', 'ton', 'ArrowDown'), style='justify-content:center', gap=8), state='40% open')],
    'Light, climate, cover: one big control each, the tabs at the foot')
dboard('M08LockAlarmCamera', 'Entity dialogs: lock, alarm, camera', [
    edlg('Front door', 'LockOpenVariant', 'w', f'<div style="margin:0 auto;width:160px;height:160px;border-radius:80px;background:var(--wc);display:grid;place-items:center;color:var(--w)">{I("LockOpenVariant", 64)}</div>', btn('Lock', 'fill', 'Lock', 'lg'), state='Unlocked 6 min ago'),
    edlg('Alarm', 'ShieldHome', 'g', f'<div style="margin:0 auto;width:160px;height:160px;border-radius:80px;background:var(--okc);display:grid;place-items:center;color:var(--ok)">{I("ShieldHome", 64)}</div>', grid(3, *[btn(x, 'ton') for x in ['Home', 'Away', 'Night']]), btn('Disarm', 'out', 'ShieldOff'), state='Armed home'),
    edlg('Driveway', 'Cctv', 'p', f'<div class="thumb" style="height:210px;position:relative">{I("Cctv", 48)}<span style="position:absolute;left:12px;top:12px">{live("Live")}</span></div>', row(btn('Snapshot', 'ton', 'Camera'), btn('Record', 'out', 'Record'), gap=8), state='Streaming')],
    'Lock, alarm, camera: the state as a big round badge, the action under it')
dboard('M08MediaVacuumFan', 'Entity dialogs: media player, vacuum, fan', [
    edlg('Bedroom speaker', 'Speaker', 't', f'<div class="thumb" style="height:170px">{I("Music", 52)}</div>', '<b class="h3">Epic sax guy, 10 hours</b>', bar(38, 't'), row(ib('SkipPrevious'), f'<span class="ib" style="background:var(--t);color:#fff;width:52px;height:52px;border-radius:26px">{I("Pause", 24)}</span>', ib('SkipNext'), style='justify-content:center', gap=16), slider(55, 't'), state='Playing'),
    edlg('Roborock', 'RobotVacuum', 'p', f'<div style="height:200px;border-radius:20px;background:repeating-linear-gradient(45deg,var(--s2) 0 10px,var(--s1) 10px 20px);display:grid;place-items:center"><span class="floaty">{ico("RobotVacuum", "p", 56, 28, 30)}</span></div>', grid(3, btn('Start', 'fill', 'Play'), btn('Dock', 'ton', 'Home'), btn('Locate', 'out', 'MapMarker')), bar(78, 'g'), state='Docked · 78% battery'),
    edlg('Ceiling fan', 'Fan', 'g', f'<div style="display:grid;place-items:center"><span class="spin" style="color:var(--ok)">{I("Fan", 110)}</span></div>', seg(['Low', 'Medium', 'High']), row('<b class="grow">Oscillate</b>', switch()), state='On · medium')],
    'Media, vacuum, fan: the fan spins, the vacuum floats over its map')
dboard('M08WeatherSensorUpdate', 'Entity dialogs: weather, sensor, update', [
    edlg('Home', 'WeatherPouring', 't', big('−24', '°C'), row(*[col(f'<span class="xs mu">{d}</span>', I(i, 26), f'<b class="sm">{tt}°</b>', gap=4, style='align-items:center;flex:1') for d, i, tt in [('Fri', 'WeatherSnowy', -20), ('Sat', 'WeatherCloudy', -18), ('Sun', 'WeatherSunny', -12), ('Mon', 'WeatherPartlyCloudy', -15)]]), state='Rainy · wind 12 km/h'),
    edlg('Hall temperature', 'Thermometer', 'p', big('20.4', '°C'), spark([19.8, 20, 20.2, 20.6, 20.4, 20.1, 20.4], 'p', 120), state='Updated 1 min ago'),
    edlg('Home Assistant Material', 'Update', 'p', '<b class="h2">2026.11.1.140 is ready</b>', '<span class="sm onv">Tab strip collapse and float, phone tables, colour tool fixes.</span>', row('<span class="grow">Back up first</span>', switch()), btn('Install', 'fill', 'Download', 'lg'), state='2026.11.1.137 installed')],
    'Weather, sensor, update: the number big, the trend or forecast under it')
dboard('M08PersonTimerCounter', 'Entity dialogs: person, timer, counter', [
    edlg('Alex', 'Account', 'g', f'<div style="display:grid;place-items:center">{avatar("AL", "g", 120)}</div>', live('Home since 18:02'), kv([('Phone battery', '64%'), ('Last seen', 'Kitchen')]), state='Home'),
    edlg('Laundry', 'TimerOutline', 'w', f'<div style="display:grid;place-items:center">{ring(60, "24:10", "w", 200)}</div>', row(btn('Pause', 'ton', 'Pause'), btn('Cancel', 'out', 'Close'), btn('+5 min', 'txt'), style='justify-content:center', gap=8), state='Running'),
    edlg('Visitors', 'Counter', 't', big('3'), row(btn('', 'ton', 'Minus'), btn('Reset', 'out', 'Restore'), btn('', 'ton', 'Plus'), style='justify-content:center', gap=10), state='Step 1')],
    'Person, timer, counter: the timer ring counts down')
dboard('M08HumidifierHeaterValve', 'Entity dialogs: humidifier, water heater, valve', [
    edlg('Bedroom humidifier', 'AirHumidifier', 't', f'<div style="display:grid;place-items:center">{ring(45, "45%", "t", 200)}</div>', seg(['Normal', 'Eco', 'Sleep']), state='Humidifying to 45%'),
    edlg('Water heater', 'WaterBoiler', 'w', big('52', '°C'), slider(70, 'w'), seg(['Eco', 'Electric', 'Heat pump']), state='Eco'),
    edlg('Garden valve', 'Valve', 'g', vslider(100, 'g'), row(btn('Open', 'fill'), btn('Close', 'ton'), style='justify-content:center', gap=8), state='Open')],
    'Humidifier, water heater, valve')
dboard('M08SirenMowerRemote', 'Entity dialogs: siren, lawn mower, remote', [
    edlg('Siren', 'Bullhorn', 'e', f'<div style="margin:0 auto;width:150px;height:150px;border-radius:75px;background:var(--ec);display:grid;place-items:center;color:var(--e);animation:breathe 1.2s ease-in-out infinite">{I("Bullhorn", 60)}</div>', field('Tone', 'Alarm'), slider(80, 'e'), btn('Sound', 'err', 'Bullhorn'), state='Off'),
    edlg('Lawn mower', 'RobotMower', 'g', f'<div style="height:180px;border-radius:20px;background:repeating-linear-gradient(90deg,var(--okc) 0 18px,color-mix(in srgb,var(--okc) 60%,var(--surf)) 18px 36px)"></div>', grid(3, btn('Mow', 'fill', 'Play'), btn('Pause', 'ton', 'Pause'), btn('Dock', 'out', 'Home')), state='Docked'),
    edlg('TV remote', 'Remote', 'p', f'<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;justify-items:center">{"".join(ib(x) for x in ["VolumePlus", "ChevronUp", "PlusBox", "ChevronLeft", "CheckCircle", "ChevronRight", "VolumeMinus", "ChevronDown", "Home"])}</div>', row('<b class="grow">Power</b>', switch()), state='On')],
    'Siren, mower, remote: the siren breathes while armed')
dboard('M08SwitchToggleGroup', 'Entity dialogs: switch, toggle, group', [
    edlg('Kitchen plug', 'PowerSocketUs', 'p', f'<div style="margin:0 auto;width:120px;height:200px;border-radius:40px;background:var(--p);position:relative;box-shadow:var(--shl)"><span style="position:absolute;left:12px;right:12px;top:12px;height:84px;border-radius:30px;background:var(--onp)"></span></div>', kv([('Power', '112 W'), ('Today', '1.4 kWh')]), state='On'),
    edlg('Guest mode', 'ToggleSwitch', 't', f'<div style="margin:0 auto;width:120px;height:200px;border-radius:40px;background:var(--s3);position:relative"><span style="position:absolute;left:12px;right:12px;bottom:12px;height:84px;border-radius:30px;background:var(--mu)"></span></div>', state='Off'),
    edlg('Downstairs lights', 'LightbulbGroup', 'w', *[row(f'<b class="grow">{n}</b>', switch(o)) for n, o in [('Ceiling', 1), ('Lamp', 1), ('Kitchen', 0), ('Hall', 1)]], btn('All off', 'out', 'LightbulbOff'), state='3 of 4 on')],
    'Switch, toggle, group: big rocker switches, a group lists its members')
dboard('M08AutomationScriptConversation', 'Entity dialogs: automation, script, conversation', [
    edlg('Lights at sunset', 'Robot', 't', row('<b class="grow">Enabled</b>', switch()), kv([('Last ran', '1 h ago'), ('Runs', 'Every day')]), row(btn('Run', 'ton', 'Play'), btn('Trace', 'out', 'Timeline'), btn('Edit', 'txt'), gap=8), state='On'),
    edlg('Night path', 'Script', 'p', btn('Run', 'fill', 'Play', 'lg'), field('Minutes', '5'), kv([('Last ran', 'Yesterday 23:10'), ('Mode', 'Restart')]), state='Off'),
    edlg('Home Assistant', 'Robot', 'g', card('Turned off 2 lights.', pad=12, style='background:var(--s1);box-shadow:none;border-radius:16px'), field('Ask', 'What is on?', 'Microphone'), state='Conversation agent')],
    'Automation, script, conversation')
dboard('M08DateTime', 'Entity dialogs: date, time, date and time', [
    edlg('Bin day', 'Calendar', 'g', grid(7, *[f'<span style="height:34px;border-radius:17px;display:grid;place-items:center;font-size:13px;{"background:var(--p);color:var(--onp)" if d == 18 else ""}">{d}</span>' for d in range(1, 29)], gap=4), state='18 November'),
    edlg('Wake up', 'ClockOutline', 'p', f'<div style="font-size:64px;font-weight:500;text-align:center;letter-spacing:-.03em">07<span style="color:var(--mu)">:</span>00</div>', seg(['AM', 'PM']), state='07:00'),
    edlg('Next holiday', 'CalendarClock', 't', field('Date', '24 Dec 2026', 'Calendar'), field('Time', '18:00', 'ClockOutline'), state='24 Dec 18:00')],
    'Date, time, date and time')
dboard('M08SunImageCalendar', 'Entity dialogs: sun, image, calendar', [
    edlg('Sun', 'WhiteBalanceSunny', 'w', '<svg viewBox="0 0 300 120" style="width:100%;height:120px" aria-hidden="true"><path d="M10,110 Q150,-40 290,110" fill="none" stroke="var(--w)" stroke-width="3" stroke-dasharray="6 6"/><circle cx="210" cy="40" r="12" fill="var(--w)"/></svg>', kv([('Sunrise', '07:12'), ('Sunset', '16:48')]), state='Above the horizon'),
    edlg('Front door snapshot', 'Image', 'p', f'<div class="thumb" style="height:220px">{I("Image", 48)}</div>', state='Updated 3 min ago'),
    edlg('Family', 'Calendar', 't', lst([('CalendarStar', 'Dentist', 'Today 15:00', '', 'p'), ('Food', 'Yum cha', 'Today 18:30', '', 'w'), ('Delete', 'Bins', 'Thursday', '', 'g')]), state='2 events today')],
    'Sun, image, calendar: the sun on its arc')
dboard('M08SetupAny', 'Entity dialogs: setup step, any other entity, and the menu', [
    edlg('Set up Philips Hue', 'LightbulbGroup', 'w', steps(['Bridge', 'Press', 'Done'], 1), f'<div style="margin:0 auto;width:120px;height:120px;border-radius:60px;background:var(--wc);display:grid;place-items:center;color:var(--w);animation:breathe 1.5s ease-in-out infinite">{I("GestureTap", 50)}</div>', '<span class="sm onv" style="text-align:center">Press the button on the bridge</span>', state='Step 2 of 3'),
    edlg('Air quality', 'AirFilter', 'g', big('12', 'µg/m³'), pill('Good', 'g'), state='PM2.5'),
    menu([('Pencil', 'Rename'), ('Sofa', 'Change area'), ('Label', 'Add label'), ('ViewDashboardOutline', 'Add to dashboard'), '-', ('History', 'History'), ('Cog', 'Settings'), ('Delete', 'Remove', 'danger')], 'Entity')],
    'A setup step, any other entity, and the entity menu')

write_index('Home Assistant Material, modern: Protocols and dialogs', [(P1, 'Protocols: Zigbee, Z-Wave, Matter, Thread, Bluetooth, MQTT, remotes, LoRaWAN, serial, discovery'), (P2, 'Entity dialogs: every domain, three per board')], 'M07Zigbee')
