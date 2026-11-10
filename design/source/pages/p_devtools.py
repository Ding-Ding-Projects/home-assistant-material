from lib import *

P = 'devtools'
C = 'Settings, Developer tools'
T = ['YAML', 'States', 'Actions', 'Template', 'Events', 'Statistics', 'Assist', 'Debug']

def code(lines, h=''):
    st = f'; min-height: {h}' if h else ''
    body = ''.join(f'<span><span class="mu" style="display: inline-block; width: 28px">{n}</span>{l}</span>' for n, l in enumerate(lines, 1))
    return f'<div class="col mono" style="background: var(--sl0); border-radius: 20px; padding: 16px; gap: 2px; font-size: 13px; line-height: 20px{st}">{body}</div>'
K = lambda s: f'<span style="color: var(--p)">{s}</span>'
V = lambda s: f'<span style="color: var(--heat)">{s}</span>'

# ---------- YAML ----------
def rel(name, n): return f'<div class="li" style="background: var(--sl1)"><span class="ll grow">{name}</span><span class="bs mu">{n}</span>{btn("Reload", "text", "Refresh", True)}</div>'
body = (tabs(T, 'YAML') + row(
    col(card(row(f'<span class="sq" style="background: var(--greenc); color: var(--green)">{I("Check")}</span>', '<div class="col grow"><span class="tm">The configuration is valid</span><span class="bm mu">Checked 20 seconds ago. 14 files, no errors, no warnings.</span></div>', btn('Check again', 'tonal', None, True)), label='Configuration check', style='padding: 24px'),
        card('<h2 class="tm">Restart</h2><p class="bm mu">Needed for changes that a reload cannot pick up.</p>', row(btn('Restart Home Assistant', 'out', 'Restart'), btn('More options', 'text')), label='Restart', style='padding: 24px'), gap=12, style='flex: 1; min-width: 0'),
    col('<h2 class="tm" style="padding: 0 8px">Reload without restarting</h2>', row(find('Search what can be reloaded'), btn('Reload everything', 'tonal', 'Refresh')),
        rel('Automations', '18'), rel('Scripts', '5'), rel('Scenes', '6'), rel('Template entities', '9'), rel('Groups and helpers', '12'), rel('Themes', '2'), '<span class="bs mu" style="padding: 4px 16px">23 more kinds.</span>', gap=4, style='flex: 1; min-width: 0'),
    gap=24, style='align-items: flex-start'))
surf(P, 'DevYaml', 'Developer tools, YAML', C, 'Developer tools', body)

# ---------- States ----------
body = (tabs(T, 'States') + row(
    col(toolbar('Search entities, states or attributes', chip('Changed lately', True)),
        table([('Entity', 4), ('State', 2), ('Attributes', 4)],
              [['<span class="mono bs">light.living_ceiling</span>', 'on', '<span class="mono bs mu">brightness: 204, color_temp_kelvin: 2900</span>'], ['<span class="mono bs">sensor.living_room_temperature</span>', '21.5', '<span class="mono bs mu">unit_of_measurement: °C</span>'],
               ['<span class="mono bs">lock.front_door</span>', 'locked', '<span class="mono bs mu">changed_by: Lock up at night</span>'], ['<span class="mono bs">person.sam</span>', 'home', '<span class="mono bs mu">source: device_tracker.sam_phone</span>'],
               ['<span class="mono bs">sun.sun</span>', 'below_horizon', '<span class="mono bs mu">next_rising: 07:02, elevation: -31.2</span>']], 'Current states'),
        '<span class="bs mu">386 entities. Select a row to load it into the form.</span>', gap=12, style='flex: 3; min-width: 0'),
    card('<h2 class="tm">Set a state by hand</h2>', field('Entity', 'light.living_ceiling', mono=True), field('State', 'on', mono=True), '<span class="bs mu">Attributes, as YAML</span>',
         code([K('brightness') + ': ' + V('204'), K('color_temp_kelvin') + ': ' + V('2900'), K('friendly_name') + ': Ceiling']),
         note('This changes what Home Assistant believes, not the device. The real state returns at the next update.', 'warn', 'Alert'), row('<span class="grow"></span>', btn('Set state', 'fill')),
         label='Set a state', style='flex: 2; min-width: 0; padding: 24px'), gap=20, style='align-items: flex-start'))
surf(P, 'DevStates', 'Developer tools, States', C, 'Developer tools', body)

# ---------- Actions ----------
body = (tabs(T, 'Actions') + row(
    card(row('<h2 class="tm grow">Run an action</h2>', seg(['Form', 'YAML'], 'Form', 'Mode')), select('Action', 'Light: Turn on'), '<span class="bs mu">Turns on one or more lights and can set brightness, colour and transition.</span>',
         '<span class="ll">Targets</span>', row(chip('Living room', True, 'Sofa'), chip('Counter', True, 'LightbulbOutline'), btn('Add target', 'text', 'Plus', True), style='flex-wrap: wrap'),
         setting('Brightness6', 'Brightness', '60%', sw(True, 'Set brightness')), '<div style="padding: 0 16px">' + slider('Brightness', 60, '60%') + '</div>',
         setting('ThermometerLines', 'Colour temperature', 'Not set', sw(False, 'Set colour temperature')), setting('TimerOutline', 'Transition', '5 seconds', sw(True, 'Set transition')),
         row(btn('Copy as YAML', 'text', 'ContentCopy', True), '<span class="grow"></span>', btn('Run action', 'fill', 'Play')), label='Run an action', style='flex: 3; min-width: 0; padding: 24px'),
    col(card(row(f'<span class="sq" style="background: var(--greenc); color: var(--green)">{I("Check")}</span>', '<div class="col grow"><span class="tm">Done in 0.31 seconds</span><span class="bm mu">4 lights changed.</span></div>'), label='Result', style='padding: 24px'),
        card('<h2 class="tm">What was sent</h2>', code([K('action') + ': light.turn_on', K('target') + ':', '  ' + K('area_id') + ': living_room', '  ' + K('entity_id') + ': light.kitchen_counter', K('data') + ':', '  ' + K('brightness_pct') + ': ' + V('60'), '  ' + K('transition') + ': ' + V('5')]),
             label='Action as YAML', style='padding: 24px'), gap=12, style='flex: 2; min-width: 0'), gap=20, style='align-items: flex-start'))
surf(P, 'DevActions', 'Developer tools, Actions', C, 'Developer tools', body)

# ---------- Template ----------
body = (tabs(T, 'Template') + row(
    card(row('<h2 class="tm grow">Template</h2>', btn('Reset to the example', 'text', None, True), btn('Clear', 'text', None, True)),
         code(['{% set lights = states.light', '   | selectattr(' + V("'state'") + ', ' + V("'eq'") + ', ' + V("'on'") + ') | list %}', 'There are {{ lights | count }} lights on.', '', '{% if is_state(' + V("'person.sam'") + ', ' + V("'home'") + ') %}', '  Sam is home.', '{% endif %}',
               'It is {{ states(' + V("'sensor.living_room_temperature'") + ') }} degrees.'], '300px'), label='Template editor', style='flex: 1; min-width: 0; padding: 24px'),
    col(card('<h2 class="tm">Result</h2>', '<div class="bl" style="background: var(--sl0); border-radius: 20px; padding: 16px; white-space: pre-line">There are 7 lights on.\n\nSam is home.\nIt is 21.5 degrees.</div>',
             row(tag('Text'), '<span class="bs mu grow">Worked out in 2 ms. Updates as states change.</span>'), label='Result', style='padding: 24px'),
        group('This template listens to', setting('LightbulbGroup', 'Every light', 'All entities in the light domain', ''), setting('Account', 'person.sam', 'State changes', ''), setting('Thermometer', 'sensor.living_room_temperature', 'State changes', ''), style='padding: 12px'),
        gap=12, style='flex: 1; min-width: 0'), gap=20, style='align-items: flex-start'))
surf(P, 'DevTemplate', 'Developer tools, Template', C, 'Developer tools', body)

# ---------- Events ----------
def evt(name, when, lines): return card(row(f'<span class="ll mono grow">{name}</span>', f'<span class="bs mu">{when}</span>'), code(lines), label=name, style='padding: 16px; border-radius: 24px', gap=8)
body = (tabs(T, 'Events') + row(
    col(card('<h2 class="tm">Fire an event</h2>', field('Event type', 'my_doorbell_pressed', mono=True), '<span class="bs mu">Event data, as YAML</span>', code([K('door') + ': front', K('by') + ': test']), row('<span class="grow"></span>', btn('Fire event', 'fill', 'Send')), label='Fire an event', style='padding: 24px'),
        group('Active listeners', setting('Broadcast', 'state_changed', '63 listeners', ''), setting('Broadcast', 'call_service', '4 listeners', ''), setting('Broadcast', 'automation_triggered', '2 listeners', ''), style='padding: 12px'), gap=12, style='flex: 2; min-width: 0'),
    card(row('<h2 class="tm grow">Listening to state_changed</h2>', '<span class="row bs mu" style="gap: 6px"><span style="width: 8px; height: 8px; border-radius: 4px; background: var(--green)"></span>Live</span>', btn('Stop', 'out', 'Stop', True)),
         row(field('Event type', 'state_changed', mono=True, style='flex: 1'), field('Only if it contains', 'light.', mono=True, style='flex: 1'), gap=12),
         evt('state_changed', '21:13:58.204', [K('entity_id') + ': light.hallway', K('old_state') + ': off', K('new_state') + ': on']),
         evt('state_changed', '21:13:41.870', [K('entity_id') + ': light.living_shelf', K('old_state') + ': on, brightness 51', K('new_state') + ': on, brightness 204']),
         '<span class="bs mu">2 events shown. The newest 50 are kept while this page is open.</span>', label='Event listener', style='flex: 3; min-width: 0; padding: 24px'), gap=20, style='align-items: flex-start'))
surf(P, 'DevEvents', 'Developer tools, Events', C, 'Developer tools', body)

# ---------- Statistics ----------
body = (tabs(T, 'Statistics') + toolbar('Search statistics', chip('With problems', True), chip('Source: any', False, 'MenuDown'))
    + table([('Statistic', 4), ('Unit', 1), ('Source', 2), ('Problem', 4), ('', 2)],
            [['<span class="mono bs">sensor.grid_consumption</span>', 'kWh', 'Recorder', '<span class="mu">None</span>', ib('ChartLine', 'Show chart') + ib('TuneVariant', 'Adjust a value')],
             ['<span class="mono bs">sensor.gas_meter</span>', 'm³', 'Recorder', tag('Unit changed from ft³', 'a'), btn('Fix', 'tonal', None, True)],
             ['<span class="mono bs">sensor.old_plug_energy</span>', 'kWh', 'Recorder', tag('Entity no longer exists', 'e'), btn('Fix', 'tonal', None, True)],
             ['<span class="mono bs">sensor.living_room_temperature</span>', '°C', 'Recorder', '<span class="mu">None</span>', ib('ChartLine', 'Show chart') + ib('TuneVariant', 'Adjust a value')],
             ['<span class="mono bs">tibber:energy_cost</span>', 'CAD', 'Tibber', '<span class="mu">None</span>', ib('ChartLine', 'Show chart') + ib('TuneVariant', 'Adjust a value')]], 'Long-term statistics')
    + note('Fixing a unit converts the old values. Removing a statistic that has no entity deletes its history; you are shown how much first.'))
surf(P, 'DevStatistics', 'Developer tools, Statistics', C, 'Developer tools', body)

# ---------- Assist ----------
body = (tabs(T, 'Assist') + row(
    card('<h2 class="tm">Test a sentence</h2>', frow(select('Language', 'English'), select('Assistant', 'Home Assistant')), f'<label class="field focus"><span class="bl grow">turn the kitchen lights to half</span>{I("Send", "s")}</label>',
         '<span class="bs mu">Nothing is carried out. This only shows how the sentence is understood.</span>', label='Sentence tester', style='flex: 2; min-width: 0; padding: 24px'),
    card(row('<h2 class="tm grow">Understood</h2>', tag('Matched', 'g')), kv(('Intent', 'HassLightSet'), ('Area', 'Kitchen'), ('Brightness', '50%'), ('Would act on', 'Counter, Island, Pantry, Hood'), ('Matched sentence', 'turn [the] {area} lights to {brightness}'), ('Source', 'Built-in sentences, English')),
         row(btn('Show the full match as YAML', 'text', 'CodeBraces', True)), label='How it was understood', style='flex: 3; min-width: 0; padding: 24px'), gap=20, style='align-items: flex-start')
    + note('Add your own sentences in a file under custom_sentences, or with a sentence trigger in an automation.'))
surf(P, 'DevAssist', 'Developer tools, Assist', C, 'Developer tools', body)

# ---------- Debug ----------
body = (tabs(T, 'Debug') + grid(2,
    col(group('Find what is slow', setting('Speedometer', 'Profile Home Assistant', 'Records for 60 seconds, then offers a file', btn('Start', 'tonal', None, True)), setting('Memory', 'Memory report', 'Which objects grew', btn('Start', 'tonal', None, True)),
              setting('TimerSand', 'Slow updates', 'Warn when an entity takes over 10 seconds', sw(True, 'Warn about slow updates'))),
        group('Log more for a while', setting('TextBoxSearch', 'Debug logging for one integration', 'Turns itself off after 30 minutes', btn('Choose', 'tonal', None, True)), setting('Web', 'Frontend debug console', 'Shows interface messages in this tab', sw(False, 'Frontend debug console'))), gap=12),
    card(row('<h2 class="tm grow">Actions run lately</h2>', btn('Clear', 'text', None, True)),
         *[f'<div class="li" style="background: var(--sl0)"><span class="col grow"><span class="ll mono">{a}</span><span class="bs mu">{w}</span></span><span class="bs mu">{t}</span>{ib("Replay", "Run again")}</div>'
           for a, w, t in [('light.turn_on', 'By Sam, Developer tools', '21:14'), ('lock.lock', 'By automation Lock up at night', '21:02'), ('cover.close_cover', 'By automation Close the blinds at sunset', '16:58'), ('script.announce_dinner', 'By Mika, dashboard button', '18:30')]],
         '<span class="bs mu">The last 50 actions, with who or what ran them. Kept on this machine only.</span>', label='Action history', style='padding: 24px', gap=6), gap=16))
surf(P, 'DevDebug', 'Developer tools, Debug and action history', C, 'Developer tools', body)
