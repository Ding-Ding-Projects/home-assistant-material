from lib import *

P = 'screens'

# ---------- Dashboard ----------
def t(icon, title, sub, on=False, tone='pc'):
    return tile(icon, title, sub, on, tone)

body = (
    row('<div class="col grow" style="gap: 6px"><h1 class="hl">Family</h1><p class="bl mu">Your own dashboard. Four views, arranged by you.</p></div>',
        tabs(['Overview', 'Upstairs', 'Garden', 'Cameras'], 'Overview', 'Views'),
        ib('Plus', 'Add a view'), ib('Pencil', 'Edit dashboard'), style='flex-wrap: wrap; align-items: flex-end')
    + grid(3,
        col('<h2 class="tm" style="padding: 0 8px">Living room</h2>',
            t('CeilingLight', 'Ceiling', '80%, warm white', True), t('FloorLamp', 'Floor lamp', 'Off'),
            t('Television', 'Television', 'Playing, volume 18', True, 'tc'), t('Blinds', 'Blinds', 'Open, 100%'), gap=8),
        col('<h2 class="tm" style="padding: 0 8px">Kitchen</h2>',
            t('Countertop', 'Counter lights', 'On, 60%', True), t('Fridge', 'Fridge door', 'Closed'),
            t('Dishwasher', 'Dishwasher', '42 minutes left', True, 'sc'), t('Thermometer', 'Temperature', '22.0°'), gap=8),
        col('<h2 class="tm" style="padding: 0 8px">Outside</h2>',
            card('<div class="row" style="gap: 12px">' + I('WeatherPartlyCloudy', 'l') + '<div class="col grow"><span class="tl">8° and cloudy</span><span class="bm mu">Rain from 6 pm, 7.2 mm</span></div></div>',
                 grid(5, *[f'<div class="col" style="align-items: center; gap: 4px"><span class="bs mu">{d}</span>{I(i, "s")}<span class="ll">{v}°</span></div>'
                           for d, i, v in [('Tue', 'WeatherRainy', 9), ('Wed', 'WeatherCloudy', 11), ('Thu', 'WeatherSunny', 13), ('Fri', 'WeatherSunny', 14), ('Sat', 'WeatherPartlyCloudy', 12)]], gap=4),
                 label='Weather', style='padding: 20px'),
            t('DoorClosedLock', 'Front door', 'Locked', True, 'greenc'), t('Garage', 'Garage door', 'Closed'), gap=8),
        gap=24)
)
shell(P, 'Dashboard', 'A dashboard of your own, with views', 'Home', 'Family', body)

# ---------- Dashboard, edit mode ----------
def slot(icon, title, sub, sel=False):
    ring = 'box-shadow: 0 0 0 3px var(--p)' if sel else 'box-shadow: inset 0 0 0 1px var(--outv)'
    return (f'<div class="li" style="background: var(--sl2); min-height: 72px; {ring}">{I("DragVertical", "s")}<span class="lead">{I(icon)}</span>'
            f'<span class="col grow"><span class="ll">{title}</span><span class="bs mu">{sub}</span></span>'
            + (ib('Pencil', 'Edit ' + title) if sel else '') + '</div>')

add = f'<button class="li" style="min-height: 72px; justify-content: center; color: var(--p); box-shadow: inset 0 0 0 2px var(--outv); border-style: dashed">{I("Plus")}<span class="ll">Add a card</span></button>'
body = (
    row(f'<div class="row grow" style="gap: 16px; background: var(--inv); color: var(--on-inv); border-radius: 28px; padding: 8px 8px 8px 24px">{I("Pencil")}'
        '<span class="tm grow">Editing Family, Overview</span>'
        + btn('Undo', 'text', 'Undo', True, 'color: var(--on-inv)') + btn('Redo', 'text', 'Redo', True, 'color: var(--on-inv)')
        + btn('Done', 'tonal', 'Check', True, 'background: var(--sl0); color: var(--on)') + '</div>')
    + row(
        grid(2,
             col('<div class="row" style="padding: 0 8px"><h2 class="tm grow">Living room</h2>' + ib('DotsVertical', 'Section options') + '</div>',
                 slot('CeilingLight', 'Ceiling', 'Tile, light.living_ceiling', True), slot('FloorLamp', 'Floor lamp', 'Tile'),
                 slot('Television', 'Television', 'Media control'), add, gap=8),
             col('<div class="row" style="padding: 0 8px"><h2 class="tm grow">Kitchen</h2>' + ib('DotsVertical', 'Section options') + '</div>',
                 slot('Countertop', 'Counter lights', 'Tile'), slot('Dishwasher', 'Dishwasher', 'Tile, time left'),
                 slot('Thermometer', 'Temperature', 'Sensor, with graph'), add, gap=8),
             gap=24, style='flex: 3; min-width: 0; align-self: flex-start'),
        card('<div class="row"><h2 class="tl grow">Tile card</h2>' + ib('Close', 'Close the editor') + '</div>',
             card(tile('CeilingLight', 'Ceiling', '80%, warm white', True), slider('Brightness', 80, '80%'),
                  label='Live preview', style='background: var(--sl0); padding: 16px; border-radius: 24px', gap=8),
             select('Entity', 'Ceiling, light.living_ceiling'), field('Name', 'Ceiling'),
             select('Tap', 'Turn on or off'), select('Hold', 'Open details'),
             setting('Brightness6', 'Brightness slider', 'Shown under the tile', sw(True, 'Brightness slider')),
             setting('Palette', 'Follow the light colour', 'Tint the tile', sw(False, 'Follow the light colour')),
             row(btn('Show code', 'text', 'CodeBraces'), '<span class="grow"></span>', btn('Cancel', 'out'), btn('Save', 'fill')),
             label='Card editor', style='flex: 2; min-width: 0; padding: 24px'),
        gap=24, style='align-items: stretch')
)
shell(P, 'DashboardEdit', 'Dashboard, edit mode with the card editor', 'Home', 'Family', body)

# ---------- Card picker ----------
def pick(icon, name, desc, preview):
    return card(f'<div style="height: 84px; border-radius: 20px; background: var(--sl0); display: grid; place-items: center; padding: 12px">{preview}</div>',
                f'<div class="row" style="gap: 12px">{I(icon)}<div class="col grow"><span class="ll">{name}</span><span class="bs mu">{desc}</span></div></div>',
                label=name, style='padding: 16px; border-radius: 28px', gap=12)

mini_tile = '<div class="row" style="gap: 8px; width: 100%"><span class="lead" style="width: 32px; height: 32px; background: var(--pc)"></span><span class="col grow" style="gap: 4px"><span style="height: 8px; width: 60%; border-radius: 4px; background: var(--sl4)"></span><span style="height: 6px; width: 40%; border-radius: 3px; background: var(--sl3)"></span></span></div>'
mini_graph = '<svg viewBox="0 0 120 40" style="width: 100%; height: 48px" aria-hidden="true"><path d="M0,30 C20,28 30,10 50,14 S80,34 120,8" fill="none" stroke="#00639B" stroke-width="3" stroke-linecap="round"></path></svg>'
mini_gauge = '<svg viewBox="0 0 80 44" style="height: 52px" aria-hidden="true"><path d="M8,40 A32,32 0 0 1 72,40" fill="none" stroke="#E1E5EC" stroke-width="8" stroke-linecap="round"></path><path d="M8,40 A32,32 0 0 1 56,12" fill="none" stroke="#00639B" stroke-width="8" stroke-linecap="round"></path></svg>'
mini_btn = '<span class="btn sm tonal">Movie night</span>'
mini_thermo = '<svg viewBox="0 0 60 60" style="height: 60px" aria-hidden="true"><circle cx="30" cy="30" r="24" fill="none" stroke="#E1E5EC" stroke-width="6"></circle><path d="M30,6 A24,24 0 0 1 54,30" fill="none" stroke="#8C3A1D" stroke-width="6" stroke-linecap="round"></path></svg>'
mini_map = '<svg viewBox="0 0 120 50" style="width: 100%; height: 52px" aria-hidden="true"><rect width="120" height="50" rx="10" fill="#E9EDF3"></rect><path d="M0,34 L120,18" stroke="#fff" stroke-width="5"></path><circle cx="70" cy="24" r="7" fill="#00639B"></circle></svg>'
mini_list = '<div class="col" style="gap: 6px; width: 100%">' + ''.join(f'<span style="height: 8px; width: {w}%; border-radius: 4px; background: var(--sl4)"></span>' for w in (90, 70, 80)) + '</div>'
mini_media = '<div class="row" style="gap: 8px; width: 100%"><span style="width: 44px; height: 44px; border-radius: 12px; background: var(--tc)"></span><span class="col grow" style="gap: 6px"><span style="height: 8px; width: 70%; border-radius: 4px; background: var(--sl4)"></span><span style="height: 6px; border-radius: 3px; background: var(--p); width: 45%"></span></span></div>'
body = (
    head('Add to the dashboard', 'Pick a card, or pick an entity and let Home Assistant suggest one.',
         seg(['By card', 'By entity'], 'By card', 'How to pick'))
    + toolbar('Search cards', chip('Suggested', True), chip('Controls'), chip('Sensors'), chip('Media'), chip('Layout'), chip('Community'))
    + grid(4,
           pick('GestureTap', 'Tile', 'One entity, with quick controls', mini_tile),
           pick('ChartLine', 'Sensor graph', 'A value and its recent history', mini_graph),
           pick('Gauge', 'Gauge', 'A value on a dial', mini_gauge),
           pick('ButtonPointer', 'Button', 'Runs a scene, script or action', mini_btn),
           pick('Thermostat', 'Thermostat', 'A dial for heating and cooling', mini_thermo),
           pick('Map', 'Map', 'People and devices on a map', mini_map),
           pick('FormatListBulleted', 'Entities', 'A list of states', mini_list),
           pick('PlayCircle', 'Media control', 'What is playing, with transport', mini_media))
    + row('<span class="bs mu grow">64 cards in all. Community cards are marked and can be removed in Dashboards.</span>', btn('Write a card by hand', 'text', 'CodeBraces'), btn('Cancel', 'out'))
)
surf(P, 'CardPicker', 'Card picker', 'Family, Overview', 'Add to the dashboard', body)

# ---------- Map ----------
def pin(x, y, initial, tone):
    return (f'<div style="position: absolute; left: {x}%; top: {y}%; transform: translate(-50%, -100%)"><div class="av" style="width: 48px; height: 48px; border-radius: 24px 24px 24px 6px; '
            f'background: var(--{tone}); color: var(--on-{tone}); box-shadow: var(--e3); font-size: 16px">{initial}</div></div>')

svgmap = '''<svg viewBox="0 0 1300 640" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of the neighbourhood with the Home and Work zones" style="position: absolute; inset: 0; width: 100%; height: 100%">
<rect width="1300" height="640" fill="#E4EAF0"></rect>
<path d="M0,470 C200,430 330,520 520,480 S900,380 1300,430 L1300,640 L0,640 Z" fill="#C9DEF2"></path>
<rect x="80" y="60" width="250" height="170" rx="28" fill="#D5E8D4"></rect><rect x="860" y="90" width="300" height="190" rx="28" fill="#D5E8D4"></rect>
<g stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" fill="none"><path d="M-20,300 L1320,250"></path><path d="M420,-20 L500,660"></path><path d="M780,-20 L740,460"></path><path d="M0,120 L420,150"></path><path d="M500,380 L1320,330"></path></g>
<g stroke="#F2D58A" stroke-width="10" stroke-linecap="round" fill="none"><path d="M-20,560 C300,520 700,600 1320,520"></path></g>
<circle cx="470" cy="290" r="96" fill="#00639B" fill-opacity="0.14" stroke="#00639B" stroke-width="3"></circle>
<circle cx="1000" cy="320" r="70" fill="#68587A" fill-opacity="0.14" stroke="#68587A" stroke-width="3" stroke-dasharray="8 8"></circle>
</svg>'''
body = (
    f'<div style="position: relative; flex: 1; min-height: 640px; border-radius: 32px; overflow: hidden">{svgmap}'
    + '<span class="tag p" style="position: absolute; left: 33%; top: 28%">Home</span><span class="tag" style="position: absolute; left: 74%; top: 36%; background: var(--tc); color: var(--on-tc)">Work</span>'
    + pin(35, 45, 'S', 'pc') + pin(38, 49, 'M', 'tc') + pin(77, 52, 'J', 'amberc') + pin(58, 84, 'L', 'greenc')
    + '<aside class="dlg col" aria-label="People" style="position: absolute; left: 24px; top: 24px; width: 340px; gap: 4px; padding: 20px 12px">'
    + '<h1 class="tl" style="padding: 0 12px 8px">Where everyone is</h1>'
    + ''.join(f'<a class="li" href="#{n.lower()}" style="color: var(--on)"><span class="av" style="background: var(--{c}); color: var(--on-{c})">{n[0]}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{w}</span></span>{I("ChevronRight")}</a>'
              for n, w, c in [('Sam', 'Home, since 5:40 pm', 'pc'), ('Mika', 'Home, since 3:15 pm', 'tc'), ('Jo', 'Work, leaving soon', 'amberc'), ('Lee', 'Away, 2.4 km from home', 'greenc')])
    + '</aside>'
    + '<div class="col" style="position: absolute; right: 24px; top: 24px; gap: 8px">' + ib('Plus', 'Zoom in', 't') + ib('Minus', 'Zoom out', 't') + ib('CrosshairsGps', 'Fit everyone', 't') + ib('Layers', 'Map layers', 't') + '</div>'
    + '<div class="dlg row" style="position: absolute; left: 388px; right: 96px; bottom: 24px; padding: 12px 20px; gap: 16px; border-radius: 28px">'
    + ib('Play', 'Play the day') + '<div class="col grow" style="gap: 6px"><div class="row bs mu" style="justify-content: space-between"><span>Midnight</span><span>6 am</span><span>Noon</span><span>6 pm</span><span>Now</span></div>' + track(88, 'Time of day, 9:14 pm') + '</div>'
    + seg(['Today', 'Yesterday', 'Pick a day'], 'Today', 'Day') + '</div></div>'
)
shell(P, 'Map', 'Map, people and zones', 'Map', 'Map', body, pad='8px 20px 0', gap=0)

# ---------- Activity ----------
def ev(icon, text, who, when, tone=''):
    lead = f' style="background: var(--{tone}); color: var(--on-{tone})"' if tone else ''
    return (f'<div class="li" style="background: var(--sl1)"><span class="lead"{lead}>{I(icon)}</span><span class="col grow"><span class="bl">{text}</span>'
            f'<span class="bs mu">{who}</span></span><span class="bm mu">{when}</span></div>')

body = (
    head('Activity', 'Everything that happened at home, newest first.',
         seg(['Today', 'Yesterday', '7 days', 'Pick dates'], 'Today', 'Period'), btn('Export', 'out', 'Export'))
    + toolbar('Search activity', chip('Lights', True), chip('Doors and locks', True), chip('People'), chip('Automations'), chip('Climate'))
    + row(
        col('<span class="ll mu" style="padding: 0 16px">This evening</span>',
            ev('DoorClosedLock', '<b>Front door</b> was locked', 'By the automation Lock up at night', '9:02 pm', 'greenc'),
            ev('CeilingLight', '<b>Living room ceiling</b> turned on at 80%', 'By Sam, from the Home dashboard', '8:47 pm', 'pc'),
            ev('HomeImportOutline', '<b>Sam</b> arrived home', 'Phone location', '5:40 pm', 'tc'),
            '<span class="ll mu" style="padding: 12px 16px 0">This afternoon</span>',
            ev('GarageOpen', '<b>Garage door</b> opened, then closed after 4 minutes', 'By Mika, from the phone app', '3:12 pm'),
            ev('Robot', '<b>Close the blinds at sunset</b> ran', 'Automation, 3 actions, all succeeded', '4:58 pm'),
            ev('LightbulbOff', '<b>Hallway light</b> turned off', 'By the motion timer', '2:30 pm'),
            gap=4, style='flex: 2; min-width: 0'),
        col(stat('Events today', '148', '32 more than a usual Monday', 'p', 'Pulse'),
            stat('Busiest hour', '5 to 6 pm', '27 events', '', 'ClockOutline', 'tl'),
            card('<span class="ll mu">Most active</span>',
                 *[f'<div class="row" style="gap: 12px"><span class="bm grow">{n}</span><span class="ll">{v}</span></div>' + track(p, f'{n}, {v} events')
                   for n, v, p in [('Hallway motion', 41, 100), ('Front door', 18, 44), ('Living room ceiling', 12, 30)]],
                 label='Most active', style='padding: 24px'),
            gap=16, style='flex: 1; min-width: 0'),
        gap=24, style='align-items: flex-start')
)
shell(P, 'Activity', 'Activity, the logbook', 'Activity', 'Activity', body)

# ---------- History ----------
chart = '''<svg viewBox="0 0 900 260" preserveAspectRatio="none" role="img" aria-label="Temperature in three rooms over the last 24 hours. Living room is between 20.4 and 22.1 degrees." style="display: block; width: 100%; height: 260px">
<g stroke="#E1E5EC" stroke-width="1" stroke-dasharray="2 6"><line x1="0" y1="65" x2="900" y2="65"></line><line x1="0" y1="130" x2="900" y2="130"></line><line x1="0" y1="195" x2="900" y2="195"></line></g>
<path d="M0,150 C80,160 150,190 230,180 S380,90 470,80 S640,70 720,96 S840,120 900,104" fill="none" stroke="#00639B" stroke-width="4" stroke-linecap="round"></path>
<path d="M0,190 C90,200 170,214 250,206 S400,150 490,140 S650,150 740,164 S850,170 900,160" fill="none" stroke="#68587A" stroke-width="3" stroke-linecap="round"></path>
<path d="M0,110 C70,100 160,60 240,70 S380,40 480,50 S650,90 750,60 S850,50 900,56" fill="none" stroke="#8C3A1D" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9"></path>
<line x1="620" y1="0" x2="620" y2="260" stroke="#72777F" stroke-width="1"></line><circle cx="620" cy="74" r="6" fill="#fff" stroke="#00639B" stroke-width="3"></circle>
</svg>'''
def band(name, segs):
    parts = ''.join(f'<span style="flex: {w}; background: var(--{c}); height: 100%"></span>' for w, c in segs)
    return f'<div class="row" style="gap: 16px"><span class="bm" style="width: 150px; flex: none">{name}</span><div class="row grow" role="img" aria-label="{name} over the last 24 hours" style="height: 28px; border-radius: 10px; overflow: hidden; gap: 2px">{parts}</div></div>'
body = (
    head('History', 'How any entity changed over time. Pick what to compare.',
         seg(['24 hours', '7 days', '30 days', 'Pick dates'], '24 hours', 'Period'), btn('Export', 'out', 'Export'))
    + row(chip('Living room temperature', True, 'Close'), chip('Bedroom temperature', True, 'Close'), chip('Outside temperature', True, 'Close'), btn('Add an entity', 'text', 'Plus', True), style='flex-wrap: wrap')
    + card('<div class="row" style="gap: 16px"><div class="col grow"><span class="ll mu">Temperature, °C</span><span class="dm">21.4°</span></div>'
           + ''.join(f'<span class="row bm" style="gap: 8px"><span style="width: 12px; height: 12px; border-radius: 6px; background: {c}"></span>{n}</span>'
                     for n, c in [('Living room', '#00639B'), ('Bedroom', '#68587A'), ('Outside', '#8C3A1D')]) + '</div>',
           f'<div style="position: relative">{chart}<div class="menu" style="position: absolute; left: 53%; top: 8px; min-width: 0; padding: 12px 16px"><span class="lm mu">Today, 2:40 pm</span><div class="tm" style="color: var(--p)">21.9° living room</div></div></div>',
           '<div class="row bs mu" style="justify-content: space-between"><span>9 pm</span><span>3 am</span><span>9 am</span><span>3 pm</span><span>Now</span></div>',
           label='Temperature chart', cls='hero')
    + card('<span class="ll mu">States</span>',
           band('Front door', [(30, 'greenc'), (2, 'errc'), (40, 'greenc'), (1, 'errc'), (27, 'greenc')]),
           band('Heating', [(10, 'heatc'), (25, 'sl4'), (20, 'heatc'), (30, 'sl4'), (15, 'heatc')]),
           band('Sam', [(34, 'pc'), (38, 'sl4'), (28, 'pc')]),
           '<span class="bs mu">Green is locked, red is unlocked. Orange is heating. Blue is home.</span>',
           label='State timelines', style='padding: 24px')
)
shell(P, 'PageHistory', 'History, graphs and state timelines', 'Activity', 'History', body)

# ---------- Media ----------
def src_(icon, name, sub, tone):
    return (f'<a class="card col" href="#{name.lower().replace(" ", "-")}" style="gap: 12px; padding: 20px; background: var(--{tone}); color: var(--on-{tone})">'
            f'{I(icon, "l")}<span class="col"><span class="tm">{name}</span><span class="bs">{sub}</span></span></a>')
def album(title, artist, c1, c2):
    return (f'<a class="col" href="#" style="gap: 8px; color: var(--on)"><span style="aspect-ratio: 1; border-radius: 24px; background: linear-gradient(135deg, {c1}, {c2})"></span>'
            f'<span class="col"><span class="ll">{title}</span><span class="bs mu">{artist}</span></span></a>')
body = (
    head('Media', 'Play anything on any speaker or screen in the house.', find('Search media', width='320px'))
    + grid(5, src_('FolderMusic', 'My media', '412 files', 'pc'), src_('Radio', 'Radio', '38 stations', 'tc'), src_('Spotify', 'Spotify', 'Signed in as Sam', 'greenc'),
           src_('Cctv', 'Cameras', '4 live', 'sc'), src_('AccountVoice', 'Say something', 'Text to speech', 'amberc'))
    + '<h2 class="tm">Played lately</h2>'
    + grid(6, album('Morning jazz radio', 'Radio', '#68587A', '#EEDBFF'), album('Kind of Blue', 'Miles Davis', '#00639B', '#CEE5FF'), album('Cooking mix', 'Playlist', '#8C3A1D', '#FFDBCF'),
           album('Rain sounds', 'My media', '#1F6A3B', '#B6F2BE'), album('News at six', 'Radio', '#51606F', '#D5E4F6'), album('Kids stories', 'My media', '#6B5200', '#FFE08B'), gap=20)
    + '<span class="grow"></span>'
    + '<div class="row" style="gap: 20px; background: var(--tc); color: var(--on-tc); border-radius: 32px; padding: 16px 24px">'
    + '<span style="width: 64px; height: 64px; border-radius: 20px; background: linear-gradient(135deg, #68587A, #EEDBFF); flex: none"></span>'
    + '<div class="col" style="width: 240px"><span class="tm">Morning jazz radio</span><span class="bm">Kitchen speaker</span></div>'
    + ib('SkipPrevious', 'Previous') + '<button class="ib f" aria-label="Pause" style="width: 64px; height: 64px; border-radius: 24px; background: var(--on-tc); color: var(--tc)">' + I('Pause', 'l') + '</button>' + ib('SkipNext', 'Next')
    + '<div class="col grow" style="gap: 6px">' + track(42, 'Position, 1:26 of 3:24') + '<div class="row bs" style="justify-content: space-between"><span>1:26</span><span>3:24</span></div></div>'
    + ib('VolumeHigh', 'Volume, 40%') + btn('Kitchen speaker', 'tonal', 'Speaker', False, 'background: var(--sl0); color: var(--on)') + '</div>'
)
shell(P, 'Media', 'Media browser and player', 'Media', 'Media', body)

# ---------- To-do ----------
def todo(text, sub='', done=False, due=''):
    box = (f'<span style="width: 24px; height: 24px; border-radius: 8px; background: var(--p); color: var(--on-p); display: grid; place-items: center; flex: none">{I("Check", "s")}</span>' if done
           else '<span style="width: 24px; height: 24px; border-radius: 8px; box-shadow: inset 0 0 0 2px var(--out); flex: none"></span>')
    s = f'<span class="bs mu">{sub}</span>' if sub else ''
    d = tag(due, 'a') if due else ''
    st = 'text-decoration: line-through; color: var(--onv)' if done else ''
    return f'<label class="li" style="background: var(--sl1)">{box}<span class="col grow"><span class="bl" style="{st}">{text}</span>{s}</span>{d}{I("DragVertical", "s")}</label>'
body = row(
    col('<h1 class="hl" style="padding: 0 16px 8px">To-do</h1>',
        *[f'<a class="li{" sel" if s else ""}" href="#{n.lower()}"{"" if s else " style=\'color: var(--on)\'"}><span class="lead"{" style=\'background: var(--sl0); color: var(--on-pc)\'" if s else ""}>{I(i)}</span><span class="col grow"><span class="ll">{n}</span><span class="bs{"" if s else " mu"}">{c}</span></span></a>'
          for n, i, c, s in [('Shopping', 'Cart', '6 to buy', True), ('Chores', 'Broom', '3 this week', False), ('Packing for Friday', 'BagSuitcase', '11 items', False), ('Garden', 'Flower', 'Nothing due', False)]],
        btn('New list', 'text', 'Plus'), gap=4, style='width: 320px; flex: none', tagname='nav', label='Lists'),
    card(row('<div class="col grow"><h2 class="hs">Shopping</h2><span class="bm mu">Shared with Mika and Jo. 6 to buy, 2 done.</span></div>', ib('SortVariant', 'Sort'), ib('DotsVertical', 'List options')),
         f'<label class="field focus">{I("Plus", "s")}<span class="bl mu grow">Add an item, then press Enter</span>{I("Microphone", "s")}</label>',
         todo('Oat milk', '2 cartons'), todo('Tomatoes'), todo('Dish soap', '', False, 'Today'), todo('Batteries, AA', 'For the hallway sensor'), todo('Bread'), todo('Coffee beans', 'The dark roast'),
         '<span class="ll mu" style="padding: 8px 16px 0">Done</span>', todo('Eggs', '', True), todo('Rice', '', True),
         row('<span class="bs mu grow">Drag to reorder. Items you tick stay here until you clear them.</span>', btn('Clear done', 'text', 'Broom', True)),
         label='Shopping list', style='flex: 1; min-width: 0; background: var(--sl0); box-shadow: inset 0 0 0 1px var(--outv)', gap=6),
    gap=24, style='align-items: flex-start')
shell(P, 'Todo', 'To-do lists', 'Home', 'To-do', body)

# ---------- Calendar ----------
events = {3: [('Bins out', 'sc')], 5: [('Dentist, 9:30', 'tc')], 9: [('Movie night', 'pc')], 10: [('Jo away', 'amberc')], 11: [('Jo away', 'amberc')],
          14: [('Boiler service', 'heatc')], 17: [('Bins out', 'sc')], 20: [('Mika birthday', 'greenc')], 24: [('School holiday', 'tc')], 27: [('Dinner, 7 pm', 'pc')]}
cells = ''
for wk in range(5):
    for d in range(7):
        n = wk * 7 + d - 0
        day = n + 1 - 1
        num = (day % 30) + 1 if day >= 30 else day + 1
        dim = day >= 30
        today = num == 9 and not dim
        pills = ''.join(f'<span class="tag" style="background: var(--{c}); color: var(--on-{c if c in ("pc", "sc", "tc") else "inv"}); color: var(--on); max-width: 100%; overflow: hidden">{t_}</span>' for t_, c in events.get(num, []) if not dim)
        badge = f'<span class="ll" style="width: 28px; height: 28px; border-radius: 14px; display: grid; place-items: center; background: var(--p); color: var(--on-p)">{num}</span>' if today else f'<span class="ll{" mu" if dim else ""}" style="padding: 4px 6px; opacity: {0.5 if dim else 1}">{num}</span>'
        cells += f'<div class="col" style="gap: 4px; min-height: 92px; padding: 8px; border-radius: 16px; background: var(--{"pc" if today else "sl1"}); align-items: flex-start">{badge}{pills}</div>'
body = (
    row('<div class="col grow" style="gap: 6px"><h1 class="hl">November 2026</h1><p class="bl mu">Three events this week. Bins go out on Tuesday.</p></div>',
        ib('ChevronLeft', 'Previous month', 't'), btn('Today', 'out', None, True), ib('ChevronRight', 'Next month', 't'),
        seg(['Month', 'Week', 'Day', 'List'], 'Month', 'View'), btn('New event', 'fill', 'Plus'), style='flex-wrap: wrap; align-items: flex-end')
    + row(
        col(grid(7, *[f'<span class="lm mu" style="padding: 0 10px">{d}</span>' for d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']], gap=6),
            grid(7, cells, gap=6), gap=8, style='flex: 3; min-width: 0'),
        col(card('<span class="ll mu">Monday 9 November</span>',
                 '<div class="row" style="gap: 12px"><span style="width: 6px; align-self: stretch; border-radius: 3px; background: var(--p)"></span><div class="col grow"><span class="tm">Movie night</span><span class="bm mu">8:00 to 10:30 pm, living room</span></div></div>',
                 '<span class="bs mu">Starts the Movie night scene 5 minutes before.</span>', label='Today', style='padding: 24px'),
            group('Calendars',
                  *[setting(i, n, d, sw(o, n)) for i, n, d, o in [('AccountGroup', 'Family', 'Shared, 9 events', True), ('TrashCan', 'Waste collection', 'From the city, read only', True), ('Briefcase', 'Work', 'Jo, read only', True), ('School', 'School', '2 events', False)]]),
            gap=16, style='flex: 1; min-width: 280px'),
        gap=24, style='align-items: flex-start')
)
shell(P, 'Calendar', 'Calendar, month view', 'Home', 'Calendar', body)

# ---------- Lights ----------
def room(name, on, total, pct, lights):
    return card(row(f'<div class="col grow"><h2 class="tl">{name}</h2><span class="bm mu">{on} of {total} on</span></div>', sw(on > 0, name + ' lights')),
                slider(name + ' brightness', pct, f'{pct}%'),
                row(*[chip(l, s) for l, s in lights], style='flex-wrap: wrap', gap=8), label=name, style='padding: 24px', gap=16)
body = (
    row('<section class="card hero col grow" aria-label="All lights" style="background: var(--pc); color: var(--on-pc); gap: 8px">'
        '<span class="ll">Lights</span><span class="dl">7 are on</span><span class="bl">Out of 19, in four rooms. Using about 64 W.</span></section>',
        col(btn('Turn all off', 'fill lg', 'LightbulbOff'), btn('Evening scene', 'tonal lg', 'WeatherSunset'), btn('Bright', 'out lg', 'Brightness7'), gap=8, style='justify-content: center'),
        gap=24, style='align-items: stretch')
    + grid(3,
           room('Living room', 2, 3, 80, [('Ceiling', True), ('Shelf', True), ('Floor lamp', False)]),
           room('Kitchen', 2, 4, 60, [('Counter', True), ('Island', True), ('Pantry', False), ('Hood', False)]),
           room('Bedroom', 0, 3, 0, [('Ceiling', False), ('Bedside left', False), ('Bedside right', False)]),
           room('Hallway', 1, 2, 30, [('Hallway', True), ('Stairs', False)]),
           room('Outside', 2, 4, 100, [('Porch', True), ('Path', True), ('Garage', False), ('Flood light', False)]),
           room('Study', 0, 3, 0, [('Desk', False), ('Spotlights', False), ('Shelf', False)]))
)
shell(P, 'Lights', 'Lights, every room at once', 'Home', 'Lights', body)

# ---------- Climate ----------
dial = '''<svg viewBox="0 0 280 280" role="img" aria-label="Thermostat dial. Now 21.5 degrees, target 22." style="width: 280px; height: 280px; flex: none">
<path d="M56,224 A118,118 0 1 1 224,224" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="22" stroke-linecap="round"></path>
<path d="M56,224 A118,118 0 1 1 236,96" fill="none" stroke="#8C3A1D" stroke-width="22" stroke-linecap="round"></path>
<circle cx="236" cy="96" r="15" fill="#FFFFFF" stroke="#8C3A1D" stroke-width="5"></circle>
<text x="140" y="150" text-anchor="middle" font-size="64" font-weight="500" fill="#8C3A1D">22°</text>
<text x="140" y="184" text-anchor="middle" font-size="16" fill="#8C3A1D">Now 21.5°</text></svg>'''
def rm(name, temp, hum, state, tone=''):
    return stat(name, temp, f'{hum} humidity. {state}', tone, None, 'hs')
body = row(
    card(row('<div class="col grow"><span class="ll">Downstairs thermostat</span><span class="hs">Heating to 22°</span><span class="bm">About 10 minutes to go</span></div>', tag('Heating', 'a')),
         f'<div class="row" style="justify-content: center; gap: 24px">{round_btn("Minus", "Half a degree cooler", "t", 64)}{dial}{round_btn("Plus", "Half a degree warmer", "f", 64)}</div>',
         row(seg(['Heat', 'Cool', 'Auto', 'Off'], 'Heat', 'Mode'), '<span class="grow"></span>', seg(['Home', 'Away', 'Sleep'], 'Home', 'Preset'), style='flex-wrap: wrap'),
         label='Downstairs thermostat', cls='hero', style='flex: 5; min-width: 0; background: var(--heatc); color: var(--heat)', gap=20),
    col(grid(2, rm('Living room', '21.5°', '46%', 'Heating', 'h'), rm('Kitchen', '22.0°', '48%', 'At target'), rm('Bedroom', '19.8°', '51%', 'Set to 19°'), rm('Study', '20.6°', '44%', 'At target'),
             rm('Bathroom', '23.1°', '63%', 'Fan is on', 'p'), rm('Outside', '8.2°', '81%', 'Rain later')),
        card(row(I('WaterPercent'), '<div class="col grow"><span class="ll">Bathroom humidity is high</span><span class="bs mu">The fan runs until it falls under 55%.</span></div>', btn('Stop fan', 'out', None, True)), label='Humidity note', style='padding: 20px'),
        gap=16, style='flex: 4; min-width: 0'),
    gap=24, style='align-items: stretch')
shell(P, 'ClimatePage', 'Climate, thermostat and rooms', 'Home', 'Climate', body)

# ---------- Security ----------
def cam(name, when):
    return (f'<a class="col" href="#" style="gap: 8px; color: var(--on)"><span style="aspect-ratio: 16/9; border-radius: 24px; background: linear-gradient(160deg, #32363C, #72777F); position: relative; display: block">'
            f'<span class="tag e" style="position: absolute; left: 12px; top: 12px">Live</span></span><span class="row"><span class="ll grow">{name}</span><span class="bs mu">{when}</span></span></a>')
body = (
    row('<section class="card hero col grow" aria-label="Alarm" style="background: var(--greenc); color: var(--green); gap: 8px">'
        + row(I('ShieldHome', 'l'), '<span class="ll">Alarm</span>') + '<span class="dl">Armed, home</span><span class="bl">Every door is locked and every window is closed.</span></section>',
        col(btn('Disarm', 'fill lg', 'ShieldOff'), btn('Arm away', 'tonal lg', 'ShieldLock'), btn('Arm night', 'out lg', 'ShieldMoon'), gap=8, style='justify-content: center'),
        gap=24, style='align-items: stretch')
    + row(
        col('<h2 class="tm" style="padding: 0 8px">Doors and locks</h2>',
            tile('DoorClosedLock', 'Front door', 'Locked at 9:02 pm', True, 'greenc'), tile('DoorClosedLock', 'Back door', 'Locked', True, 'greenc'),
            tile('Garage', 'Garage door', 'Closed since 3:16 pm'), tile('WindowClosedVariant', 'Windows', 'All 9 closed'), gap=8, style='flex: 1; min-width: 0'),
        col('<h2 class="tm" style="padding: 0 8px">Cameras</h2>', grid(2, cam('Front door', 'Motion 12 min ago'), cam('Driveway', 'Motion 1 h ago'), cam('Garden', 'Quiet'), cam('Garage', 'Quiet')), gap=12, style='flex: 2; min-width: 0'),
        col('<h2 class="tm" style="padding: 0 8px">Sensors</h2>',
            tile('SmokeDetectorVariant', 'Smoke', '3 detectors, all clear'), tile('WaterAlert', 'Leaks', '2 sensors, dry'), tile('MotionSensor', 'Motion', 'Hallway, 2 min ago', True, 'amberc'), tile('BatteryAlert', 'Batteries', '1 sensor is low'), gap=8, style='flex: 1; min-width: 0'),
        gap=24, style='align-items: flex-start')
)
shell(P, 'SecurityPage', 'Security, alarm, locks and cameras', 'Home', 'Security', body)

# ---------- Maintenance ----------
def job(icon, title, sub, action, tone=''):
    lead = f' style="background: var(--{tone}); color: var(--on-{tone})"' if tone else ''
    return f'<div class="li" style="background: var(--sl1)"><span class="lead"{lead}>{I(icon)}</span><span class="col grow"><span class="ll">{title}</span><span class="bs mu">{sub}</span></span>{action}</div>'
body = (
    head('Maintenance', 'The small jobs that keep the house running. Four need you.')
    + grid(4, stat('Batteries', '1 low', '14 are fine', 'a', 'BatteryAlert'), stat('Updates', '2 ready', 'Core and one app', 'p', 'Update'),
           stat('Offline', '1 device', 'Since yesterday', 'e', 'LanDisconnect'), stat('Consumables', 'All fine', 'Filters and ink', 'g', 'AirFilter'))
    + col(job('BatteryAlert', 'Hallway motion sensor battery is at 8%', 'Takes 2 AA batteries. They are on the shopping list.', btn('Mark replaced', 'tonal', None, True), 'amberc'),
          job('Update', 'Home Assistant Material 2026.11.1.43 is ready', 'From this project. A backup is made first.', btn('Review', 'tonal', None, True), 'pc'),
          job('LanDisconnect', 'Garden plug has been offline for 19 hours', 'Last seen on Wi-Fi Sunday at 2:02 am.', btn('Troubleshoot', 'tonal', None, True), 'errc'),
          job('Puzzle', 'Studio Code Server 5.18 is ready', 'App update.', btn('Review', 'tonal', None, True)),
          job('AirFilter', 'Air purifier filter', '61% left, about 4 months.', btn('Details', 'text', None, True)),
          job('Printer3d', 'Printer ink', 'Black 44%, colour 70%.', btn('Details', 'text', None, True)), gap=4)
)
shell(P, 'Maintenance', 'Maintenance, batteries, updates and offline devices', 'Home', 'Maintenance', body)

# ---------- Embedded app or web page ----------
body = (
    row('<div class="col grow"><h1 class="tl">Studio Code Server</h1><span class="bm mu">An app, shown inside Home Assistant.</span></div>',
        tag('Running', 'g'), btn('Open in a new window', 'out', 'OpenInNew', True), ib('Refresh', 'Reload the app'), ib('DotsVertical', 'App options'))
    + '<div class="row grow" style="border-radius: 28px; overflow: hidden; min-height: 560px; align-items: stretch; background: #1D2126; color: #C2C7CF">'
    + '<div class="col" style="width: 56px; background: #14181D; align-items: center; gap: 20px; padding: 16px 0">' + I('FileMultiple') + I('Magnify') + I('SourceBranch') + I('Puzzle') + '</div>'
    + '<div class="col" style="width: 240px; background: #191D22; padding: 16px; gap: 10px"><span class="lm">CONFIG</span>'
    + ''.join(f'<span class="row bm" style="gap: 8px">{I(i, "s")}{n}</span>' for i, n in [('Folder', 'blueprints'), ('Folder', 'custom_components'), ('FileCode', 'automations.yaml'), ('FileCode', 'configuration.yaml'), ('FileCode', 'scenes.yaml'), ('FileCode', 'scripts.yaml')])
    + '</div><div class="col grow mono" style="padding: 20px 24px; gap: 4px; font-size: 14px; line-height: 22px">'
    + ''.join(f'<span><span style="color: #72777F; display: inline-block; width: 32px">{n}</span>{l}</span>' for n, l in enumerate(
        ['<span style="color: #98CBFF">default_config</span>:', '', '<span style="color: #98CBFF">frontend</span>:', '  <span style="color: #98CBFF">themes</span>: !include_dir_merge_named themes', '',
         '<span style="color: #98CBFF">automation</span>: !include automations.yaml', '<span style="color: #98CBFF">script</span>: !include scripts.yaml', '<span style="color: #98CBFF">scene</span>: !include scenes.yaml'], 1))
    + '</div></div>'
    + note('Web pages and apps open inside the pane and keep their own look. If a page refuses to be shown inside another page, you get a button to open it in a new window instead.')
)
shell(P, 'Embedded', 'An app or web page inside the pane', 'Tools', 'Studio Code Server', body, pad='12px 28px 8px', gap=16)

# ---------- Profile ----------
body = (
    row('<span class="av" style="width: 88px; height: 88px; border-radius: 32px; font-size: 32px">S</span>',
        '<div class="col grow" style="gap: 4px"><h1 class="hl">Sam</h1><p class="bl mu">Owner and administrator. Signed in on this browser since 2 November.</p></div>',
        btn('Edit name and picture', 'out', 'Pencil'), btn('Sign out', 'text', 'Logout'), gap=24)
    + tabs(['General', 'Security'], 'General')
    + grid(2,
           group('Language and region', setting('Translate', 'Language', 'English', btn('Change', 'text', None, True)),
                 setting('ClockOutline', 'Time format', 'Follows the language: 9:14 pm', I('ChevronRight')), setting('CalendarMonth', 'Date format', '9 November 2026', I('ChevronRight')),
                 setting('Numeric', 'Number format', '1,234.5', I('ChevronRight')), setting('MapClock', 'Time zone', 'Shown in the home time zone', I('ChevronRight'))),
           group('This browser', setting('ViewDashboard', 'Opening dashboard', 'Home', btn('Change', 'text', None, True)),
                 setting('ThemeLightDark', 'Theme', 'Follows your device', I('ChevronRight')), setting('Keyboard', 'Keyboard shortcuts', 'On in this browser', sw(True, 'Keyboard shortcuts')),
                 setting('BellRing', 'Notifications here', 'Allowed', sw(True, 'Notifications in this browser')), setting('Vibrate', 'Vibrate on touch', 'On phones and tablets', sw(False, 'Vibrate on touch')),
                 note_ := ''), gap=24)
)
body = body.replace("note_ := ''", '')
surf(P, 'Profile', 'Profile, general', 'Account', 'Your profile', body)

body = (
    tabs(['General', 'Security'], 'Security')
    + grid(2,
           col(group('Password', setting('FormTextboxPassword', 'Password', 'Changed 3 months ago', btn('Change', 'tonal', None, True))),
               group('Second step', setting('Cellphone', 'Authenticator app', 'On, added 2 August', btn('Remove', 'text', None, True)),
                     setting('BellRing', 'Code by notification', 'Off', btn('Set up', 'tonal', None, True)),
                     note='You are asked for the second step when you sign in on a new device.'), gap=16),
           col(group('Where you are signed in',
                     setting('Laptop', 'This browser', 'Chrome on Windows, active now', tag('Current', 'p')),
                     setting('Cellphone', 'Sam’s phone', 'Phone app, used 4 minutes ago', btn('Sign out', 'text', None, True)),
                     setting('Tablet', 'Kitchen tablet', 'Used yesterday', btn('Sign out', 'text', None, True)),
                     note='Sessions not used for 90 days are signed out.'),
               group('Access tokens for scripts', setting('KeyVariant', 'Backup script', 'Created 12 June, expires in 10 years', btn('Delete', 'text', None, True)),
                     row(btn('Create a token', 'tonal', 'Plus', True), style='padding: 4px 16px')), gap=16), gap=24)
    + row(btn('Sign out everywhere else', 'out', 'LogoutVariant'), '<span class="grow"></span>')
)
surf(P, 'ProfileSecurity', 'Profile, security', 'Account', 'Your profile', body)

# ---------- Assist ----------
def said(text, me=False):
    st = 'background: var(--p); color: var(--on-p); align-self: flex-end; border-radius: 24px 24px 6px 24px' if me else 'background: var(--sl2); align-self: flex-start; border-radius: 24px 24px 24px 6px'
    return f'<div class="bl" style="padding: 12px 18px; max-width: 78%; {st}">{text}</div>'
body = (
    '<section class="dlg col" role="dialog" aria-label="Assist" style="width: 520px; flex: none; gap: 12px; padding: 16px 16px 20px">'
    + row(ib('Close', 'Close'), '<div class="col grow"><h2 class="tm">Assist</h2><span class="bs mu">Home Assistant, runs at home</span></div>', btn('Home Assistant', 'out', 'MenuDown', True), ib('DotsVertical', 'More'))
    + col(said('How can I help?'), said('Turn off the lights downstairs', True), said('Turned off 5 lights.'), said('Is the front door locked?', True), said('Yes, the front door is locked.'), gap=8, style='padding: 8px 8px 16px')
    + f'<div class="row" style="gap: 8px"><label class="field focus grow"><span class="bl mu grow">Type a request</span>{I("Send", "s")}</label>'
    + '<button class="ib f" aria-label="Speak" style="width: 56px; height: 56px; border-radius: 20px">' + I('Microphone') + '</button></div></section>'
    + '<section class="dlg col" role="dialog" aria-label="Assist, listening" style="width: 520px; flex: none; gap: 20px; padding: 16px 16px 28px; align-items: stretch">'
    + row(ib('Close', 'Close'), '<div class="col grow"><h2 class="tm">Assist</h2><span class="bs mu">Listening</span></div>', ib('DotsVertical', 'More'))
    + '<div class="col" style="align-items: center; gap: 20px; padding: 24px 0"><div class="row" style="gap: 6px; height: 72px">'
    + ''.join(f'<span style="width: 8px; height: {h}px; border-radius: 4px; background: var(--p)"></span>' for h in (18, 34, 58, 72, 44, 64, 30, 52, 22, 40, 16))
    + '</div><span class="hs" style="text-align: center">Set the bedroom to 19 degrees</span><span class="bm mu">Stop talking to send, or press the button.</span></div>'
    + row(btn('Cancel', 'out'), '<span class="grow"></span>', btn('Send now', 'fill', 'Send'))
    + '</section>'
    + col(note('Assist answers from the house itself by default. A cloud voice is used only if you pick one in Voice assistants.', '', 'ShieldCheck'),
          note('Reduced motion replaces the moving bars with a steady "Listening" label.'), gap=12, style='width: 520px; flex: 1 1 100%')
)
bare(P, 'Assist', 'Assist, typed and spoken', body, w=1200, style='padding: 32px; gap: 24px; align-items: flex-start; flex-wrap: wrap; justify-content: center')

# ---------- Shortcuts ----------
def kb(keys, what):
    ks = ''.join(f'<span class="kbd">{k}</span>' for k in keys)
    return f'<div class="row" style="gap: 12px; padding: 8px 4px"><span class="bm grow">{what}</span><span class="row" style="gap: 4px">{ks}</span></div>'
body = grid(3,
    group('Search and commands', kb(['Ctrl', 'Shift', 'F'], 'Command palette'), kb(['E'], 'Find an entity'), kb(['D'], 'Find a device'), kb(['C'], 'Run a command'), kb(['A'], 'Ask Assist'), style='padding: 20px'),
    group('Moving around', kb(['Alt', 'A'], 'Accessibility tools'), kb(['←', '→'], 'Next or previous tab'), kb(['Ctrl', 'T'], 'New tab catalog'), kb(['M'], 'Make a link to this page'), kb(['?'], 'This list'), style='padding: 20px'),
    group('Editing', kb(['Ctrl', 'S'], 'Save'), kb(['Ctrl', 'Z'], 'Undo'), kb(['Ctrl', 'Y'], 'Redo'), kb(['Ctrl', 'C'], 'Copy the selected step'), kb(['Delete'], 'Remove the selected step'), style='padding: 20px'),
    gap=16) + row('<span class="bs mu grow">Single-letter shortcuts are off while you type. You can turn all of them off in your profile.</span>', btn('Turn shortcuts off', 'text', None, True))
surf(P, 'Shortcuts', 'Keyboard shortcuts', 'Help', 'Keyboard shortcuts', body)

# ---------- States ----------
def state(icon, title, text, actions, tone='sl2'):
    return (f'<section class="card col" aria-label="{title}" style="flex: 1 1 320px; align-items: center; text-align: center; gap: 16px; padding: 40px 32px; background: var(--{tone})">'
            f'<span class="sq" style="width: 72px; height: 72px; border-radius: 28px">{I(icon, "l")}</span><h2 class="hs">{title}</h2><p class="bl mu">{text}</p><div class="row" style="gap: 8px; flex-wrap: wrap; justify-content: center">{actions}</div></section>')
body = grid(2, state('MapMarkerQuestion', 'This page does not exist', 'The address /lovelace/attic leads nowhere. It may have been renamed or removed.', btn('Go to Home', 'fill') + btn('Search pages', 'out', 'Magnify'))
        , state('LanDisconnect', 'Connection lost', 'Trying again in 4 seconds. Your unsaved changes on this page are kept.', btn('Try now', 'fill', 'Refresh') + btn('What to check', 'text'), 'errc')
        , state('ProgressClock', 'Home Assistant is starting', 'Loading integrations, 41 of 56. Dashboards work now; some entities appear in a moment.', '<div style="width: 220px">' + track(73, 'Starting, 73%') + '</div>')
        , state('ShieldLock', 'You need to be an administrator', 'Settings are for administrators. Ask Sam, or sign in with another account.', btn('Switch account', 'out')), style='width: 100%')
bare(P, 'States', 'Empty, lost and loading states', body, style='padding: 32px')

# ---------- My link ----------
body = ('<section class="dlg col" role="dialog" aria-label="Open a link in your Home Assistant" style="width: 560px; gap: 20px; padding: 40px; margin: auto">'
        + f'<span class="sq" style="background: var(--pc); color: var(--on-pc)">{I("LinkVariant")}</span>'
        + '<h1 class="hs">A link wants to open Add integration</h1><p class="bl mu">You followed a link from a web page. It opens the Add integration dialog for <b>Philips Hue</b> in this Home Assistant. Nothing is added until you finish the steps.</p>'
        + field('This Home Assistant', 'http://homeassistant.local:8123', 'Home', mono=True)
        + row(btn('Not this time', 'out'), '<span class="grow"></span>', btn('Open it', 'fill')) + '</section>')
bare(P, 'MyLink', 'A link from the web asks to open a page', body, w=1200, style='padding: 48px; display: flex')
