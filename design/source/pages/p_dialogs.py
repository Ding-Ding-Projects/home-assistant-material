from lib import *

P = 'dialogs'

def rb(icon, label, kind='t', size=56):
    return round_btn(icon, label, kind, size)

def acts(*b):
    return '<div class="row" style="gap: 12px; justify-content: center; flex-wrap: wrap">' + ''.join(b) + '</div>'

def vslider(pct, label, color='p', h=240, text=''):
    t_ = f'<span class="ll" style="position: absolute; left: 0; right: 0; top: 14px; text-align: center; color: var(--onv)">{text}</span>' if text else ''
    return (f'<div role="slider" tabindex="0" aria-label="{label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="{pct}" aria-orientation="vertical" '
            f'style="position: relative; width: 112px; height: {h}px; border-radius: 36px; background: var(--sl2); overflow: hidden; align-self: center; flex: none">{t_}'
            f'<span style="position: absolute; left: 0; right: 0; bottom: 0; height: {pct}%; background: var(--{color}); border-radius: 12px 12px 0 0"></span>'
            f'<span style="position: absolute; left: 36px; right: 36px; bottom: calc({pct}% - 12px); height: 5px; border-radius: 3px; background: var(--sl0)"></span></div>')

def chips(*items):
    return '<div class="row" style="gap: 8px; flex-wrap: wrap; justify-content: center">' + ''.join(items) + '</div>'

def mini(label, value):
    return f'<div class="col" style="flex: 1; background: var(--sl2); border-radius: 20px; padding: 12px 16px"><span class="bs mu">{label}</span><span class="ll">{value}</span></div>'

def minis(*pairs):
    return '<div class="row" style="gap: 8px; align-items: stretch">' + ''.join(mini(k, v) for k, v in pairs) + '</div>'

def spark(path, color='#00639B', h=64):
    return f'<svg viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true" style="display: block; width: 100%; height: {h}px"><path d="{path}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"></path></svg>'

def hist(label, path, color='#00639B'):
    return f'<div class="col" style="background: var(--sl2); border-radius: 24px; padding: 16px; gap: 8px"><div class="row"><span class="ll grow">{label}</span><a class="bs" href="#history">Show more</a></div>{spark(path, color)}</div>'

def swatches():
    cs = [('Warm white, selected', '#FFD9A0', True), ('Cool white', '#E8F1FF', False), ('Red', '#C0392B', False), ('Blue', '#1E3A8A', False), ('Green', '#2E6B3F', False)]
    out = ''.join(f'<button aria-label="{n}" style="width: 40px; height: 40px; border-radius: 20px; background: {c}; {"box-shadow: 0 0 0 3px var(--sl0), 0 0 0 5px var(--p)" if s_ else "box-shadow: inset 0 0 0 1px var(--outv)"}"></button>' for n, c, s_ in cs)
    return f'<div class="row" style="gap: 10px; justify-content: center">{out}<button class="ib t" aria-label="Any colour" style="width: 40px; height: 40px">{I("Eyedropper", "s")}</button></div>'

def board(n, title, *dialogs):
    bare(P, f'More{n}', title, ''.join(dialogs), style='padding: 32px; gap: 20px; align-items: flex-start')

# 1 ---------- Light, Climate, Cover
light = dlg('Ceiling', big('80%', 'On for 26 minutes'), vslider(80, 'Brightness', 'amberc'),
            acts(rb('Power', 'Turn off', 'f'), rb('Brightness6', 'Brightness', 't'), rb('ThermometerLines', 'Colour temperature'), rb('Palette', 'Colour'), rb('Creation', 'Effects')),
            swatches(), chips(chip('Off in 30 min', False, 'TimerOutline'), chip('Follow the sun', True)), sub='Living room')
climate = dlg('Thermostat', big('22°', 'Heating. Now 21.5°', 'heat'),
              f'<div class="row" style="justify-content: center; gap: 20px">{rb("Minus", "Half a degree cooler", "t", 64)}<span class="dl" style="color: var(--heat)">22.0</span>{rb("Plus", "Half a degree warmer", "f", 64)}</div>',
              seg(['Heat', 'Cool', 'Auto', 'Off'], 'Heat', 'Mode').replace('class="seg"', 'class="seg" style="align-self: center"'),
              chips(chip('Home', True), chip('Away'), chip('Sleep'), chip('Boost 1 hour', False, 'RocketLaunch')),
              minis(('Humidity', '46%'), ('Schedule', 'Until 10 pm'), ('Today', '3 h 10 min')), sub='Living room')
cover = dlg('Blinds', big('Open', '100%'), f'<div class="row" style="justify-content: center; gap: 20px">{vslider(100, "Position", "sc", 220, "Position")}{vslider(40, "Slat tilt", "sc", 220, "Tilt")}</div>',
            acts(rb('ArrowUp', 'Open', 't'), rb('Stop', 'Stop', 'f'), rb('ArrowDown', 'Close', 't')), chips(chip('25%'), chip('50%'), chip('75%'), chip('Favourite', False, 'Star')),
            note('Closes by itself at sunset, from the automation Close the blinds at sunset.'), sub='Living room')
board(1, 'Entity dialogs: light, climate, cover', light, climate, cover)

# 2 ---------- Lock, Alarm, Camera
lock = dlg('Front door', big('Locked', 'By Lock up at night, 9:02 pm', 'green'),
           f'<button aria-label="Unlock" style="align-self: center; width: 168px; height: 168px; border-radius: 56px; background: var(--greenc); color: var(--green); display: grid; place-items: center">{I("Lock", "l")}</button>',
           acts(btn('Unlock', 'fill', 'LockOpenVariant'), btn('Open the latch', 'out', 'DoorOpen')),
           minis(('Battery', '74%'), ('Door', 'Closed'), ('Auto-lock', 'After 2 min')), setting('AccountKey', 'Codes', '3 people, 1 guest code until Friday', I('ChevronRight')), sub='Hallway')
keys = ''.join(f'<button class="ib t" aria-label="{k}" style="width: 100%; height: 56px; border-radius: 20px"><span class="tl">{k}</span></button>' for k in '123456789') \
    + f'<button class="ib" aria-label="Clear" style="width: 100%; height: 56px">{I("Backspace")}</button><button class="ib t" aria-label="0" style="width: 100%; height: 56px; border-radius: 20px"><span class="tl">0</span></button><button class="ib f" aria-label="Enter" style="width: 100%; height: 56px; border-radius: 20px">{I("Check")}</button>'
alarm = dlg('Alarm', big('Armed, home', 'Since 9:02 pm', 'green'), chips(chip('Home', True), chip('Away'), chip('Night'), chip('Holiday')),
            f'<label class="field focus" style="justify-content: center"><span class="hs mono" style="letter-spacing: 8px">● ● ○ ○</span></label>', grid(3, keys, gap=8),
            acts(btn('Disarm', 'fill', 'ShieldOff')), '<span class="bs mu" style="text-align: center">3 wrong codes lock the keypad for 5 minutes and tell the owner.</span>', sub='Whole house')
camera = dlg('Front door camera', '<div style="aspect-ratio: 16/10; border-radius: 24px; background: linear-gradient(160deg, #32363C, #72777F); position: relative">'
             + tag('Live', 'e').replace('class="tag e"', 'class="tag e" style="position: absolute; left: 12px; top: 12px"') + f'<button class="ib t" aria-label="Full screen" style="position: absolute; right: 8px; bottom: 8px">{I("Fullscreen")}</button></div>',
             acts(rb('Microphone', 'Talk', 't'), rb('VolumeHigh', 'Listen', 't'), rb('CameraOutline', 'Take a snapshot', 'f'), rb('RecordRec', 'Record a clip', 't')),
             setting('MotionSensor', 'Motion detection', 'People only, not cars', sw(True, 'Motion detection')), setting('EyeOff', 'Privacy mode', 'Lens covered while someone is home', sw(False, 'Privacy mode')),
             hist('Motion today', 'M0,60 L40,60 L42,20 L60,20 L62,60 L150,60 L152,30 L170,30 L172,60 L260,60 L262,10 L280,10 L282,60 L300,60', '#BA1A1A'), sub='Outside')
board(2, 'Entity dialogs: lock, alarm, camera', lock, alarm, camera)

# 3 ---------- Media player, Vacuum, Fan
media = dlg('Kitchen speaker', '<div style="aspect-ratio: 1; max-height: 200px; align-self: center; width: 200px; border-radius: 32px; background: linear-gradient(135deg, #68587A, #EEDBFF)"></div>',
            '<div class="col" style="align-items: center"><span class="tl">Morning jazz radio</span><span class="bm mu">Radio, live</span></div>', track(42, 'Position, 1:26 of 3:24'),
            acts(rb('Shuffle', 'Shuffle', ''), rb('SkipPrevious', 'Previous', 't'), rb('Pause', 'Pause', 'f', 64), rb('SkipNext', 'Next', 't'), rb('Repeat', 'Repeat', '')),
            f'<div class="row" style="gap: 12px">{I("VolumeHigh")}<div class="grow">{slider("Volume", 40, "40%").replace("height:56px", "height:40px")}</div></div>',
            chips(chip('Group speakers', False, 'SpeakerMultiple'), chip('Browse', False, 'FolderMusic'), chip('Sleep timer', False, 'TimerOutline')), sub='Kitchen')
vacuum = dlg('Robot vacuum', big('Cleaning', 'Kitchen, 12 of 30 minutes'), track(40, 'Cleaning, 40% done'),
             acts(rb('Pause', 'Pause', 'f'), rb('Stop', 'Stop', 't'), rb('HomeImportOutline', 'Return to dock', 't'), rb('MapMarker', 'Find it', 't')),
             chips(chip('Kitchen', True), chip('Living room'), chip('Hallway'), chip('Bedroom')), seg(['Quiet', 'Standard', 'Strong'], 'Standard', 'Suction').replace('class="seg"', 'class="seg" style="align-self: center"'),
             minis(('Battery', '68%'), ('Dust bin', 'Half full'), ('Main brush', '62 h left')), sub='Downstairs')
fan = dlg('Ceiling fan', big('Medium', 'On, 50%'), vslider(50, 'Speed', 'sc'), acts(rb('Power', 'Turn off', 'f'), rb('RotateRight', 'Direction: forward', 't'), rb('ArrowOscillating', 'Oscillate', 't')),
          chips(chip('Low'), chip('Medium', True), chip('High'), chip('Breeze', False, 'WeatherWindy'), chip('Sleep', False, 'WeatherNight')), minis(('Room', '23.1°'), ('Off in', '45 min')), sub='Bedroom')
board(3, 'Entity dialogs: media player, vacuum, fan', media, vacuum, fan)

# 4 ---------- Weather, Sensor, Update
weather = dlg('Weather at home', f'<div class="row" style="gap: 16px; justify-content: center">{I("WeatherPartlyCloudy", "l")}<span class="dl">8°</span></div>', '<span class="bm mu" style="text-align: center">Cloudy. Feels like 5°. Rain from 6 pm, 7.2 mm.</span>',
              seg(['Daily', 'Hourly', 'Twice daily'], 'Daily', 'Forecast').replace('class="seg"', 'class="seg" style="align-self: center"'),
              grid(5, *[f'<div class="col" style="align-items: center; gap: 4px; background: var(--sl2); border-radius: 20px; padding: 12px 4px"><span class="bs mu">{d}</span>{I(i, "s")}<span class="ll">{hi}°</span><span class="bs mu">{lo}°</span></div>'
                        for d, i, hi, lo in [('Tue', 'WeatherRainy', 9, 4), ('Wed', 'WeatherCloudy', 11, 5), ('Thu', 'WeatherSunny', 13, 6), ('Fri', 'WeatherSunny', 14, 7), ('Sat', 'WeatherPartlyCloudy', 12, 6)]], gap=6),
              minis(('Wind', '14 km/h W'), ('Humidity', '81%'), ('Pressure', '1012 hPa')), note('Frost warning for Thursday night. The garden tap automation will shut the water off.', 'warn', 'SnowflakeAlert'), sub='Met.no')
sensor = dlg('Living room temperature', big('21.5°', 'Changed 2 minutes ago'), hist('Last 24 hours', 'M0,40 C40,44 70,54 100,50 S160,18 200,14 S260,24 300,20'),
             minis(('Lowest', '19.6°'), ('Average', '20.9°'), ('Highest', '22.1°')), chips(chip('24 h', True), chip('7 days'), chip('30 days'), chip('Compare', False, 'Plus')),
             setting('BellRing', 'Tell me when it leaves a range', 'Below 17° or above 26°', sw(False, 'Range alert')), kv(('Device', 'Thermostat'), ('Accuracy', '±0.3°'), ('Updates', 'Every 5 minutes')), sub='Sensor')
update = dlg('Home Assistant Material', big('2026.11.1.43', 'Installed: 2026.11.1.42', 'p'),
             '<div class="col" style="background: var(--sl2); border-radius: 24px; padding: 16px; gap: 6px"><span class="ll">What is new</span><span class="bm mu">Tabs remember their order. The pattern workbench opens beside every search. Two fixes for the Zigbee map.</span><a class="bs" href="#notes">Read the full notes</a></div>',
             setting('BackupRestore', 'Back up first', 'About 600 MB, 1 minute', sw(True, 'Back up first')), setting('Update', 'Update by itself', 'Off for this item', sw(False, 'Update by itself')),
             acts(btn('Skip this version', 'text'), btn('Update', 'fill', 'Update')), '<span class="bs mu" style="text-align: center">From this project’s feed. Takes about 4 minutes. You can go back to 2026.11.1.42 afterwards.</span>', sub='Update')
board(4, 'Entity dialogs: weather, sensor, update', weather, sensor, update)

# 5 ---------- Person, Timer, Counter
pmap = '<svg viewBox="0 0 300 150" role="img" aria-label="Map: Sam is in the Home zone" style="display: block; width: 100%; height: 150px; border-radius: 24px"><rect width="300" height="150" fill="#E4EAF0"></rect><g stroke="#fff" stroke-width="8"><path d="M0,90 L300,70"></path><path d="M120,0 L140,150"></path></g><circle cx="132" cy="80" r="40" fill="#00639B" fill-opacity=".16" stroke="#00639B" stroke-width="2"></circle><circle cx="140" cy="76" r="9" fill="#00639B"></circle></svg>'
person = dlg('Sam', f'<div class="row" style="gap: 16px"><span class="av" style="width: 64px; height: 64px; border-radius: 24px; font-size: 22px; background: var(--pc); color: var(--on-pc)">S</span><div class="col"><span class="hs">Home</span><span class="bm mu">Since 5:40 pm</span></div></div>',
             pmap, minis(('Followed by', 'Sam’s phone'), ('Accuracy', '12 m'), ('Phone battery', '63%')), acts(btn('Add this spot as a zone', 'out', 'MapMarkerPlus', True), btn('Directions', 'text', 'Directions', True)),
             hist('Where today', 'M0,20 L110,20 L112,50 L220,50 L222,20 L300,20'), sub='Person')
ring = '<svg viewBox="0 0 200 200" role="img" aria-label="18 minutes 42 seconds left of 45 minutes" style="width: 200px; height: 200px; align-self: center"><circle cx="100" cy="100" r="84" fill="none" stroke="#E1E5EC" stroke-width="14"></circle><path d="M100,16 A84,84 0 1 1 30,146" fill="none" stroke="#00639B" stroke-width="14" stroke-linecap="round"></path><text x="100" y="108" text-anchor="middle" font-size="40" font-weight="500" fill="#181C20">18:42</text><text x="100" y="134" text-anchor="middle" font-size="13" fill="#42474E">of 45:00</text></svg>'
timer = dlg('Laundry timer', ring, acts(rb('Pause', 'Pause', 'f'), rb('Stop', 'Cancel', 't'), rb('Check', 'Finish now', 't')), chips(chip('+1 min'), chip('+5 min'), chip('+15 min'), chip('Restart', False, 'Restart')),
            setting('BellRing', 'When it ends', 'Tell Sam and Mika, and say it in the kitchen', I('ChevronRight')), setting('Restore', 'Survive a restart', 'Carries on where it was', sw(True, 'Survive a restart')), sub='Timer, running')
counter = dlg('Coffee today', f'<div class="row" style="justify-content: center; gap: 20px">{rb("Minus", "One less", "t", 64)}<span class="dx">3</span>{rb("Plus", "One more", "f", 64)}</div>',
              '<span class="bm mu" style="text-align: center">Counts from 0 to 10, one at a time.</span>', acts(btn('Reset to 0', 'out', 'Restore')), minis(('Lowest', '0'), ('Highest', '10'), ('Step', '1')),
              hist('This week', 'M0,50 L40,50 L42,30 L84,30 L86,40 L128,40 L130,20 L172,20 L174,44 L216,44 L218,30 L300,30'), sub='Counter')
board(5, 'Entity dialogs: person, timer, counter', person, timer, counter)

# 6 ---------- Humidifier, Water heater, Valve
humid = dlg('Bedroom humidifier', big('50%', 'Humidifying. Now 44%', 'p'), vslider(50, 'Target humidity', 'pc'), acts(rb('Power', 'Turn off', 'f'), rb('WaterPercent', 'Target', 't'), rb('WeatherNight', 'Night mode', 't')),
            chips(chip('Auto', True), chip('Low'), chip('High'), chip('Baby', False, 'BabyFaceOutline')), minis(('Water tank', '35%'), ('Filter', '3 weeks left')), sub='Bedroom')
water = dlg('Hot water tank', big('55°', 'Heating. Now 48°', 'heat'), f'<div class="row" style="justify-content: center; gap: 20px">{rb("Minus", "One degree cooler", "t", 64)}<span class="dl" style="color: var(--heat)">55</span>{rb("Plus", "One degree warmer", "f", 64)}</div>',
            chips(chip('Eco', True, 'Leaf'), chip('Electric'), chip('Performance'), chip('Off')), setting('Airplane', 'Away mode', 'Keeps it at 40° until you are back', sw(False, 'Away mode')),
            minis(('Ready in', '25 min'), ('Showers left', 'About 3'), ('Today', '4.1 kWh')), note('Heats to 60° every Sunday night to keep the water safe.'), sub='Utility room')
valve = dlg('Garden tap', big('Closed', 'Since yesterday, 7:10 pm'), vslider(0, 'How far open', 'pc', 200, 'Opening'), acts(rb('WaterPump', 'Open', 'f'), rb('Stop', 'Stop', 't'), rb('WaterOff', 'Close', 't')),
            chips(chip('Open for 10 min', False, 'TimerOutline'), chip('25%'), chip('50%'), chip('100%')), minis(('Flow now', '0 L/min'), ('Used today', '0 L'), ('This week', '184 L')),
            note('Shuts by itself if it has been open for 2 hours.', '', 'ShieldCheck'), sub='Garden')
board(6, 'Entity dialogs: humidifier, water heater, valve', humid, water, valve)

# 7 ---------- Siren, Lawn mower, Remote
siren = dlg('Hallway siren', big('Quiet', 'Last sounded 14 days ago'), f'<button aria-label="Sound the siren" style="align-self: center; width: 168px; height: 168px; border-radius: 56px; background: var(--errc); color: var(--on-errc); display: grid; place-items: center">{I("AlarmLight", "l")}</button>',
            chips(chip('Burglar', True), chip('Fire'), chip('Doorbell'), chip('Chime')), f'<div class="row" style="gap: 12px">{I("VolumeHigh")}<div class="grow">{slider("Volume", 70, "70%")}</div></div>',
            minis(('Stops after', '3 minutes'), ('Test', 'Quiet, 2 seconds')), acts(btn('Test quietly', 'out', 'VolumeLow'), btn('Sound now', 'err', 'Bullhorn')), '<span class="bs mu" style="text-align: center">Sound now asks you to confirm with a second button.</span>', sub='Hallway')
mower = dlg('Lawn mower', big('Docked', 'Charging, 92%', 'green'), track(92, 'Battery 92%', 'green'), acts(rb('Play', 'Start mowing', 'f'), rb('Pause', 'Pause', 't'), rb('HomeImportOutline', 'Return to dock', 't')),
            chips(chip('Front lawn', True), chip('Back lawn', True), chip('Edges')), setting('WeatherRainy', 'Skip when it rains', 'Uses the forecast and the rain sensor', sw(True, 'Skip when it rains')),
            minis(('Next run', 'Wed, 10 am'), ('Blades', '41 h left'), ('Cut height', '45 mm')), sub='Garden')
remote = dlg('Living room remote', '<span class="bm mu" style="text-align: center">Activity: Watch TV</span>',
             grid(3, '<span></span>', rb('ChevronUp', 'Up', 't'), '<span></span>', rb('ChevronLeft', 'Left', 't'), rb('CheckboxBlankCircle', 'OK', 'f'), rb('ChevronRight', 'Right', 't'), '<span></span>', rb('ChevronDown', 'Down', 't'), '<span></span>', gap=8, style='justify-items: center; width: 216px; align-self: center'),
             acts(rb('ArrowULeftTop', 'Back', 't'), rb('Home', 'Home', 't'), rb('Menu', 'Menu', 't'), rb('VolumeMinus', 'Volume down', 't'), rb('VolumePlus', 'Volume up', 't')),
             chips(chip('Watch TV', True), chip('Music'), chip('Game console'), chip('All off', False, 'Power')), setting('RecordCircle', 'Learn a new button', 'Point the old remote at the hub', btn('Learn', 'tonal', None, True)), sub='Remote')
board(7, 'Entity dialogs: siren, lawn mower, remote', siren, mower, remote)

# 8 ---------- Switch, Toggle helper, Group
def bigswitch(on, label):
    c = 'p' if on else 'sl4'
    return (f'<button role="switch" aria-checked="{str(on).lower()}" aria-label="{label}" style="align-self: center; width: 112px; height: 220px; border-radius: 36px; background: var(--sl2); position: relative">'
            f'<span style="position: absolute; left: 10px; right: 10px; {"top" if on else "bottom"}: 10px; height: 100px; border-radius: 28px; background: var(--{c}); color: var(--{"on-p" if on else "onv"}); display: grid; place-items: center">{I("Power")}</span></button>')
switch = dlg('Coffee machine', big('On', 'For 12 minutes, using 1,180 W'), bigswitch(True, 'Coffee machine'), chips(chip('Off in 30 min', True, 'TimerOutline'), chip('On at 6:30 am', False, 'ClockOutline')),
             minis(('Today', '0.4 kWh'), ('Cost today', '0.12')), setting('BabyFaceOutline', 'Child lock on the plug', 'The button on the plug does nothing', sw(False, 'Child lock')), sub='Kitchen plug')
toggle = dlg('Guest mode', big('Off', 'Turned off by Sam on Sunday'), bigswitch(False, 'Guest mode'), note('While on: the hallway light stays dim at night, the alarm does not arm by itself, and the guest Wi-Fi code shows on the TV.'),
             setting('Robot', 'Used by', '3 automations', I('ChevronRight')), setting('TimerOutline', 'Turn off by itself', 'After 3 days', sw(True, 'Turn off by itself')), sub='Toggle you made')
group_ = dlg('Downstairs lights', big('5 of 8 on', 'Average brightness 64%'), acts(btn('All on', 'tonal', 'LightbulbOn'), btn('All off', 'fill', 'LightbulbOff')),
             *[f'<div class="li" style="background: var(--sl2); min-height: 56px"><span class="lead" style="width: 36px; height: 36px">{I("LightbulbOutline", "s")}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{s_}</span></span>{sw(o, n)}</div>'
               for n, s_, o in [('Ceiling', '80%', True), ('Shelf', '80%', True), ('Floor lamp', 'Off', False), ('Counter', '60%', True)]],
             row('<span class="bs mu grow">4 more members</span>', btn('Show all', 'text', None, True), btn('Edit members', 'text', 'Pencil', True)), sub='Group of 8 lights')
board(8, 'Entity dialogs: switch, toggle, group', switch, toggle, group_)

# 9 ---------- Automation, Script, Conversation
auto = dlg('Evening lights', big('On', 'Last ran today at 4:43 pm', 'green'), row('<span class="ll grow" style="padding: 0 8px">Automation is on</span>', sw(True, 'Evening lights is on')),
           kv(('Runs when', 'The sun sets, or it gets dark inside'), ('Only if', 'Someone is home'), ('Then', '3 actions'), ('Runs this month', '9, all succeeded')), acts(btn('Run the actions now', 'tonal', 'Play'), btn('Edit', 'out', 'Pencil')),
           chips(chip('Past runs', False, 'TransitConnection'), chip('Pause until tomorrow', False, 'Pause'), chip('Duplicate', False, 'ContentCopy')), sub='Automation')
script = dlg('Water the garden', big('Running', 'Zone 2 of 3, 6 minutes left', 'p'), track(55, 'Zone 2 of 3'), field('Minutes per zone', '10'), acts(btn('Stop', 'out', 'Stop'), btn('Run again', 'fill', 'Play')),
             kv(('If already running', 'One at a time'), ('Last finished', 'Friday, 7:10 pm'), ('Used by', '1 automation, 1 dashboard button')), chips(chip('Past runs', False, 'TransitConnection'), chip('Edit', False, 'Pencil')), sub='Script')
convo = dlg('Home Assistant', big('Ready', 'English. Runs at home.'), kv(('Understands', 'Commands for exposed entities'), ('Exposed', '64 entities'), ('Last request', '“Turn off the lights downstairs”'), ('Answered in', '0.18 seconds')),
            f'<label class="field focus">{I("MessageText", "s")}<span class="bl mu grow">Try a sentence</span>{I("Send", "s")}</label>', acts(btn('Open Assist', 'tonal', 'Microphone'), btn('Choose what it can see', 'out')),
            note('Requests are not kept after they are answered, unless you turn on the debug log.', '', 'ShieldCheck'), sub='Conversation agent')
board(9, 'Entity dialogs: automation, script, conversation', auto, script, convo)

# 10 ---------- Date, Time, Date and time
cal = ''.join(f'<span class="lm mu" style="text-align: center">{d}</span>' for d in 'MTWTFSS')
for d in range(1, 31):
    sel = d == 14
    cal += f'<button class="bm" aria-label="{d} November" style="height: 36px; border-radius: 18px; text-align: center; {"background: var(--p); color: var(--on-p); font-weight: 600" if sel else ""}{"box-shadow: inset 0 0 0 1px var(--p);" if d == 9 else ""}">{d}</button>'
date = dlg('Boiler service', big('14 November', 'Saturday, in 5 days'), row(ib('ChevronLeft', 'Previous month'), '<span class="ll grow" style="text-align: center">November 2026</span>', ib('ChevronRight', 'Next month')),
           grid(7, cal, gap=2), chips(chip('Today'), chip('+1 week'), chip('+1 month'), chip('+1 year')), acts(btn('Cancel', 'out'), btn('Set date', 'fill')), sub='Date')
def wheel(vals, sel):
    return '<div class="col" style="align-items: center; gap: 6px; width: 84px">' + ''.join(f'<span class="{"dm" if v == sel else "tl mu"}" style="{"background: var(--pc); color: var(--on-pc); border-radius: 20px; padding: 4px 14px" if v == sel else "opacity: .5"}">{v}</span>' for v in vals) + '</div>'
time_ = dlg('Wake-up time', f'<div class="row" style="justify-content: center; gap: 8px">{wheel(["05", "06", "07"], "06")}<span class="dm">:</span>{wheel(["30", "45", "00"], "45")}{seg(["am", "pm"], "am", "Half of the day")}</div>',
            '<span class="bm mu" style="text-align: center">Arrow keys change the selected part. You can also type 0645.</span>', chips(chip('6:00'), chip('6:30'), chip('7:00'), chip('Sunrise', False, 'WeatherSunset')),
            setting('CalendarWeek', 'Weekdays only', 'Saturday and Sunday use 8:00', sw(True, 'Weekdays only')), acts(btn('Cancel', 'out'), btn('Set time', 'fill')), sub='Time')
dt = dlg('Holiday starts', big('19 Dec, 3:30 pm', 'In 40 days'), frow(field('Date', '19 December 2026', 'CalendarMonth'), field('Time', '3:30 pm', 'ClockOutline')), select('Time zone', 'Home, America/Toronto'),
         chips(chip('Now'), chip('Tonight 8 pm'), chip('Tomorrow 9 am')), note('Used by the automation Holiday mode. Changing it reschedules that automation.'), acts(btn('Cancel', 'out'), btn('Set', 'fill')), sub='Date and time')
board(10, 'Entity dialogs: date, time, date and time', date, time_, dt)

# 11 ---------- Sun, Image, Calendar
arc = '<svg viewBox="0 0 300 150" role="img" aria-label="The sun is below the horizon. It rises at 7:02 am and sets at 4:58 pm." style="display: block; width: 100%; height: 150px"><line x1="0" y1="110" x2="300" y2="110" stroke="#C2C7CF" stroke-width="2"></line><path d="M30,110 A120,100 0 0 1 270,110" fill="none" stroke="#F2C744" stroke-width="4" stroke-dasharray="2 8" stroke-linecap="round"></path><circle cx="286" cy="128" r="11" fill="#68587A"></circle></svg>'
sun = dlg('Sun', big('Below the horizon', 'Set at 4:58 pm'), arc, minis(('Rises', '7:02 am'), ('Sets tomorrow', '4:57 pm'), ('Daylight', '9 h 55 min')),
          kv(('Dawn', '6:31 am'), ('Dusk', '5:29 pm'), ('Elevation', '−31.2°'), ('Tomorrow', '1 min 48 s shorter')), chips(chip('Use in an automation', False, 'Robot'), chip('Golden hour', False, 'WeatherSunset')), sub='At home')
image = dlg('Doorbell, last ring', '<div style="aspect-ratio: 4/3; border-radius: 24px; background: linear-gradient(160deg, #51606F, #D5E4F6)"></div>', '<span class="bm mu" style="text-align: center">Taken today at 2:14 pm</span>',
            acts(rb('MagnifyPlus', 'Zoom', 't'), rb('Download', 'Save the picture', 't'), rb('ShareVariant', 'Share', 't'), rb('Draw', 'Draw on it', 't')),
            chips(chip('Earlier', False, 'ChevronLeft'), chip('3 of 7 today', True), chip('Later', False, 'ChevronRight')), note('Pictures older than 14 days are removed.'), sub='Image')
def evrow(when, what, c): return f'<div class="row" style="gap: 12px; padding: 8px 4px"><span style="width: 6px; align-self: stretch; border-radius: 3px; background: var(--{c})"></span><div class="col grow"><span class="ll">{what}</span><span class="bs mu">{when}</span></div></div>'
calendar = dlg('Family calendar', big('Movie night', 'Today, 8:00 to 10:30 pm', 'p'), '<span class="ll mu" style="padding: 0 4px">Coming up</span>',
               evrow('Tue 10 Nov, all day', 'Jo away', 'amber'), evrow('Sat 14 Nov, 9:00 am', 'Boiler service', 'heat'), evrow('Fri 20 Nov, all day', 'Mika birthday', 'green'),
               acts(btn('New event', 'fill', 'Plus'), btn('Open the calendar', 'out', 'Calendar')), setting('Robot', 'Start automations from events', 'Movie night starts its scene 5 minutes before', sw(True, 'Start automations from events')), sub='Calendar, 9 events')
board(11, 'Entity dialogs: sun, image, calendar', sun, image, calendar)

# 12 ---------- Configurator, any other entity, the shared parts
config = dlg('Set up the printer', big('Needs you', 'One step left', 'amber'), '<p class="bm mu" style="text-align: center">Press the Wi-Fi button on the printer, then choose Continue. It waits for 2 minutes.</p>', track(50, 'Step 1 of 2'),
             field('Printer name', 'Study printer'), acts(btn('Not now', 'out'), btn('Continue', 'fill')), note('Older integrations ask this way. Newer ones use the Add integration steps.'), sub='Waiting for a step', more=False)
other = dlg('Dishwasher programme', big('Eco 50°', 'Changed 1 hour ago'), kv(('Entity ID', '<span class="mono">select.dishwasher_programme</span>'), ('Options', 'Eco 50°, Auto, Intensive, Quick'), ('Device', 'Dishwasher'), ('Area', 'Kitchen')),
            select('Programme', 'Eco 50°'), hist('Changes this week', 'M0,40 L60,40 L62,20 L120,20 L122,40 L240,40 L242,30 L300,30'),
            note('An entity without a dialog of its own still gets its state, its attributes, its history and every option it offers.'), sub='Any other kind of entity')
shared = dlg('What every dialog has', tabs(['Details', 'History', 'Settings', 'Related'], 'History'),
             hist('History, with the logbook under it', 'M0,50 C60,48 90,20 140,24 S230,44 300,30'),
             setting('LockOutline', 'Lock this control', 'Ask for a credential before it can be changed', I('ChevronRight')), setting('FormatPaint', 'Edit appearance', 'Colour, type and layers of this dialog', I('ChevronRight')),
             setting('AccountVoice', 'Read it aloud', 'The narrator reads the state and each change', sw(False, 'Read it aloud')), setting('Export', 'Export', 'State and history as CSV, JSON or a picture', I('ChevronRight')),
             kv(('Keyboard', 'Esc closes, arrow keys move the slider'), ('Opens from', 'A tap on any tile, a long press, or Enter')), sub='On every entity', more=False)
board(12, 'Entity dialogs: setup step, any other entity, and what every dialog shares', config, other, shared)
