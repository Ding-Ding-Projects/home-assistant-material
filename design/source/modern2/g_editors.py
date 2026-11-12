"""Modern remake, group 7: Editors. New features for the automation and dashboard editors."""
from ui import *

import json
import os
# A personal wording file (kept outside the repository) can rename the problem detector's words.
WF = os.environ.get('WORDING_FILE')
WORDS = json.load(open(WF)) if WF else {}
begin(WORDS.get('folder', 'editors'))
FOUND = WORDS.get('found', 'Problem found')
ONE, MANY = WORDS.get('one', 'problem'), WORDS.get('many', 'problems')
REP = WORDS.get('repairs', 'Repairs')
cap1 = lambda x: x[0].upper() + x[1:]
P1, P2, P3 = 'automation', 'dashboard', 'phone'
grab = '<div style="width:40px;height:4px;border-radius:2px;background:var(--out);margin:0 auto 12px"></div>'
sh = lambda *parts: f'<div class="sheet"><div class="col" style="gap:10px">{grab}' + ''.join(parts) + '</div></div>'
A = 'Settings'


def ah(sub, i):
    return header('Arrive home', sub, 'Settings › Automations', row(btn('Run', 'ton', 'Play'), btn('Save', 'fill', 'ContentSave'), tools(), gap=10),
                  tabs=(['Steps', 'Flow', 'Trace', 'Simulate', 'Checks', 'Tests', 'Variables', 'Schedule'], i))


def node(icon, kind, text, t='p', x=0, y=0, w=250, extra='', delay=0):
    return (f'<div class="card" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;padding:14px;gap:6px;animation:pop .4s {delay}ms both">'
            f'<div class="row" style="gap:10px">{ico(icon, t, 36, 12, 18)}<div class="col grow" style="gap:0"><span class="lbl">{e(kind)}</span><b>{e(text)}</b></div></div>{extra}</div>')


def wire(d, t='--out', dash=False, delay=0):
    da = 'stroke-dasharray:6 6;' if dash else 'stroke-dasharray:600;--len:600;'
    return f'<path d="{d}" fill="none" stroke="var({t})" stroke-width="3" stroke-linecap="round" style="{da}animation:draw 1s {delay}ms ease-out both"/>'


# ---------------- Automation editor ----------------
flow = (ah('Flow view', 1) + '<div style="position:relative;height:560px;border-radius:24px;background:radial-gradient(var(--s3) 1.2px,transparent 1.2px) 0 0/22px 22px,var(--s1)">'
        + '<svg style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">'
        + wire('M280 90 C 340 90, 340 200, 400 200', delay=200) + wire('M280 300 C 340 300, 340 200, 400 200', delay=260) + wire('M650 200 C 700 200, 700 110, 760 110', '--ok', delay=400) + wire('M650 200 C 700 200, 700 330, 760 330', '--e', True, 400) + '</svg>'
        + node('MapMarker', 'When', 'Alex arrives home', 'p', 30, 50) + node('WeatherSunset', 'When', 'Sun has set', 'p', 30, 260, delay=60)
        + node('SourceBranch', 'Choose', 'Is anyone home?', 'w', 400, 150, delay=150) + node('Lightbulb', 'Then', 'Hall and kitchen on', 'g', 760, 70, delay=300) + node('Bell', 'Otherwise', 'Notify Alex', 'e', 760, 290, delay=340)
        + f'<div class="card col" style="position:absolute;right:20px;bottom:20px;width:200px;height:120px;padding:10px;gap:6px"><span class="lbl">Minimap</span><div style="flex:1;border-radius:10px;background:var(--s2);position:relative"><span style="position:absolute;left:20%;top:20%;width:50%;height:55%;border:2px solid var(--p);border-radius:6px"></span></div></div>'
        + f'<div class="toolpill" style="position:absolute;left:20px;bottom:20px">{ib("Plus")}{ib("Minus")}{ib("FitToScreen")}{ib("FormatListBulleted")}</div></div>')
page_board('EAutoFlow', 'Flow view of an automation', P1, flow, caption='Flow view: triggers, the choice and both outcomes as a graph, with a minimap; switch back to the list any time')

trc = (ah('Run at 18:42 · 1.3 s · finished', 2)
       + grid('minmax(0,1.3fr) minmax(0,1fr)', card(*[row(ico(i, t, 36, 12, 18), col(f'<b>{n}</b>', f'<span class="sm mu">{d}</span>', gap=0, style='flex:1'), f'<span style="width:140px">{bar(p, t)}</span>', f'<span class="mono sm">{ms}</span>') for i, n, d, p, ms, t in
                                                     [('MapMarker', 'Alex arrives home', 'Triggered by person.alex → home', 4, '0 ms', 'p'), ('SourceBranch', 'Is anyone home?', 'Yes · 1 person', 8, '12 ms', 'w'), ('Lightbulb', 'Hall and kitchen on', '2 lights changed', 70, '910 ms', 'g'), ('Timer', 'Wait 5 minutes', 'Skipped by condition', 0, '—', 'n')]], title='Each step, painted with the last run', gap=12),
              card(code('trigger.to_state: home\nlights_on: 2\nbrightness: 80'), '<span class="lbl">Earlier runs</span>', '<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,var(--ok) 0 70%,var(--e) 70% 74%,var(--ok) 74%)"></div>',
                   row(*[pill(x) for x in ['18:42', 'Yesterday', 'Mon', 'Sun']], gap=6), title='Variables at the selected step')))
page_board('EAutoTrace', 'Live trace overlay', P1, trc, caption='Trace: every step shows how long it took and what it saw; scrub through earlier runs')

sim = (ah('What would happen?', 3)
       + grid('minmax(0,1fr) minmax(0,1.3fr)', card(seg(['Replay a day', 'Fake states'], 1), field('Time', 'Today 22:00'), field('Alex', 'away', 'Account'), field('Sun', 'below horizon', 'WeatherNight'), btn('Simulate', 'fill', 'Play'), note('Nothing really changes. Actions are only shown.', 't', 'ShieldCheck'), title='Situation'),
              card(*[row(I(ic, 20), f'<span class="grow">{x}</span>', pill(s, t)) for ic, x, s, t in [('MapMarker', 'Trigger: Alex arrives home', 'Would not fire', 'n'), ('WeatherSunset', 'Trigger: sun sets', 'Fires 16:48', 'p'), ('SourceBranch', 'Is anyone home?', 'No', 'w'), ('Bell', 'Notify Alex', 'Would run', 'g')]],
                   title='Result', gap=12)))
page_board('EAutoSim', 'Time-travel simulator', P1, sim, caption='Simulator: replay yesterday or fake a situation, see which branch would run, nothing happens for real')

conf = (header('Conflicts and loops', '3 found across 24 automations', 'Settings › Automations', tools())
        + grid(2, card(row(pill('Arrive home', 'p'), I('ArrowRight', 18), pill('light.hall on', 'g')), row(pill('Away mode', 'w'), I('ArrowRight', 18), pill('light.hall off', 'e')), note('Both can run at 18:00 on weekdays. The last one wins.', 'w', 'Alert'), row(btn('Add a condition', 'ton'), btn('Ignore', 'txt')), title='Fighting over the hall light'),
               card('<svg viewBox="0 0 300 160" style="width:100%;height:160px" aria-hidden="true"><circle cx="70" cy="80" r="34" fill="var(--pc)"/><circle cx="230" cy="80" r="34" fill="var(--wc)"/>'
                    '<path d="M104 70 C 150 30, 180 30, 196 70" fill="none" stroke="var(--e)" stroke-width="3" style="stroke-dasharray:300;--len:300;animation:draw 1.2s both"/><path d="M196 92 C 160 130, 140 130, 104 92" fill="none" stroke="var(--e)" stroke-width="3" style="stroke-dasharray:300;--len:300;animation:draw 1.2s .4s both"/>'
                    '<text x="70" y="85" text-anchor="middle" font-size="13" fill="var(--on)">Fan on</text><text x="230" y="85" text-anchor="middle" font-size="13" fill="var(--on)">Fan off</text></svg>',
                    note('These two trigger each other forever.', 'e', 'Sync'), btn('Break the loop', 'fill'), title='Loop')))
page_board('EAutoConflicts', 'Conflict and loop detector', P1, conf, caption='Conflicts: who fights over what and when, loops drawn as a circle with a fix')

nl = (header('New automation', 'Describe it, or read it back', 'Settings › Automations', tools())
      + grid(2, card(field('In your words', 'When the last person leaves, turn everything off and lock the door'), row(btn('Draft it', 'fill', 'Creation'), pill('Local Ollama', 't')),
                     lst([('AccountMultiple', 'When: everyone leaves', '', '', 'p'), ('LightbulbOff', 'Then: all lights off', '', '', 'g'), ('Lock', 'Then: lock front door', '', '', 'g')]), title='Sentence to automation'),
             card('<div class="h3" style="line-height:1.5">"When Alex arrives home after sunset, the hall and kitchen lights come on. If nobody is home, Alex gets a message instead."</div>',
                  row(btn('Read aloud', 'ton', 'AccountVoice'), seg(['English', 'Cantonese', 'Both'], 0)), title='Automation to sentence')))
page_board('EAutoLanguage', 'Plain language both ways', P1, nl, caption='Plain language: a sentence becomes a draft, any automation reads back as a sentence')

bp = (ah('Running live, paused', 0)
      + grid('minmax(0,1.3fr) minmax(0,1fr)', col(*[card(row(f'<span style="width:14px;height:14px;border-radius:7px;background:{"var(--e)" if b else "transparent"};border:2px solid var(--e)"></span>', ico(i, t, 36, 12, 18), f'<b class="grow">{n}</b>', pill(s, st) if s else '', switch(on)),
                                                         pad=16, style='outline:3px solid var(--p);outline-offset:2px;animation:breathe 1.6s infinite' if s == 'Paused here' else ('opacity:.5' if not on else ''))
                                                    for i, n, b, s, st, on, t in [('MapMarker', 'Alex arrives home', 0, 'Done', 'g', 1, 'p'), ('SourceBranch', 'Is anyone home?', 1, 'Paused here', 'w', 1, 'w'), ('Lightbulb', 'Hall and kitchen on', 0, '', 'n', 1, 'g'), ('Speaker', 'Play welcome', 0, 'Turned off', 'n', 0, 't')]], gap=10),
             card(kv([('Step', 'Is anyone home?'), ('zone.home', '1'), ('person.alex', 'home')]), row(btn('Continue', 'fill', 'Play'), btn('Step', 'ton', 'DebugStepOver'), btn('Stop', 'txt', 'Stop')), title='Paused')))
page_board('EAutoBreak', 'Breakpoints and step-through', P1, bp, caption='Breakpoints: a red dot pauses a live run, step or continue; any step can be switched off')

var = (ah('Variables and templates', 6) + table(['Variable', 'Set at', 'Used at', 'Now'], [[f'<span class="mono">{a}</span>', b, c, f'<b>{d}</b>'] for a, b, c, d in
                                                                                    [('who', 'Trigger', 'Notify, Welcome', 'Alex'), ('lights_on', 'Step 3', 'Notify', '2'), ('brightness', 'Variables', 'Step 3', '80'), ('{{ now().hour }}', 'Template', 'Condition', '18')]], ['1.3fr', '1fr', '1.3fr', '1fr'])
       + '<div style="height:16px"></div>' + card(code('{{ "Welcome home, " ~ who ~ "!" }}'), row(f'<b class="grow">Welcome home, Alex!</b>', live('Live')), title='Inline template preview'))
page_board('EAutoVariables', 'Variable and template inspector', P1, var, caption='Variables: where each is set and used, templates previewed live')

bpm = (header('Make a blueprint', 'From 3 selected steps', 'Settings › Automations', tools())
       + grid(2, card(*[row(I('CheckboxMarked', 22), ico(i, t, 32, 10, 16), f'<b class="grow">{n}</b>') for i, n, t in [('MapMarker', 'Person arrives home', 'p'), ('SourceBranch', 'Is anyone home?', 'w'), ('Lightbulb', 'Lights on', 'g')]], title='Steps', gap=10),
              card(*[row(f'<span class="mono sm grow">{a}</span>', pill(b, 't')) for a, b in [('person', 'Person picker'), ('lights', 'Light targets'), ('brightness', 'Number, 1 to 100')]], btn('Create blueprint', 'fill', 'FileDocumentOutline'), title='Inputs it will ask for', gap=10))
       + '<div style="height:16px"></div>' + lst([('Puzzle', 'Snippet: wait until nobody moves', '3 steps', btn('Insert', 'ton', size='sm'), 'p'), ('Puzzle', 'Snippet: only at night', '1 condition', btn('Insert', 'ton', size='sm'), 't')], 'Snippet library'))
page_board('EAutoBlueprint', 'Blueprint maker and snippet library', P1, bpm, caption='Blueprints: select steps, name the inputs; snippets insert in one click')

hlth = (ah('Health 82 of 100', 4)
        + grid('260px minmax(0,1fr)', card(ring(82, '82', 'g', 160), '<span class="sm mu" style="text-align:center">3 things to improve</span>', style='align-items:center'),
               lst([('LinkVariantOff', 'light.porch is unavailable', 'Step 3 targets it', btn('Fix', 'ton', size='sm'), 'e'), ('Alert', 'homeassistant.turn_on is deprecated', 'Use light.turn_on', btn('Fix', 'ton', size='sm'), 'w'),
                    ('ShieldOutline', 'No guard condition', 'Runs even when on holiday', btn('Add', 'ton', size='sm'), 'p'), ('CheckCircle', 'Mode is set', 'single', '', 'g')], 'Checks')))
page_board('EAutoHealth', 'Health score', P1, hlth, caption='Health: one score, then every finding with its Fix')

cov = (ah('Tests reach 3 of 4 branches', 5)
       + grid('minmax(0,1fr) minmax(0,1.2fr)', lst([('Flask', 'Alex home after sunset', 'Passed', pill('Passed', 'g'), 'g'), ('Flask', 'Nobody home', 'Passed', pill('Passed', 'g'), 'g'), ('Flask', 'Daytime arrival', 'Failed', pill('Failed', 'e'), 'e')], 'Test cases'),
              card(*[row(f'<span style="width:12px;height:12px;border-radius:6px;background:var({c})"></span>', f'<span class="grow">{n}</span>', f'<span class="sm mu">{h}</span>') for n, h, c in
                     [('Choose: someone home', '2 tests', '--ok'), ('Choose: nobody home', '1 test', '--ok'), ('Condition: after sunset, false', '1 test', '--ok'), ('Default branch', 'No test', '--e')]], btn('Write a test for this branch', 'ton', 'Plus'), title='Coverage map', gap=12)))
page_board('EAutoCoverage', 'Coverage map for test cases', P1, cov, caption='Coverage: green branches are tested, red ones offer a new test')

wk = (header('Week ahead', 'When time-based automations will fire', 'Settings › Automations', tools())
      + '<div style="display:grid;grid-template-columns:70px repeat(7,1fr);gap:6px">' + ''.join(f'<span class="lbl" style="text-align:center">{d}</span>' for d in ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
      + ''.join(f'<span class="mono sm mu">{h}</span>' + ''.join(f'<span style="height:46px;border-radius:12px;{"background:var(--pc);animation:pop .4s " + str(i * 30) + "ms both" if (h, d) in {("07:00", 0), ("07:00", 1), ("07:00", 2), ("07:00", 3), ("07:00", 4), ("16:48", 0), ("16:48", 1), ("16:48", 2), ("16:48", 3), ("16:48", 4), ("16:48", 5), ("16:48", 6), ("22:00", 5), ("22:00", 6)} else "background:var(--s2)"}"></span>' for i, d in enumerate(range(7)))
                for h in ['07:00', '12:00', '16:48', '22:00']) + '</div>'
      + '<div style="height:16px"></div>' + row(pill('Wake up · weekdays 07:00', 'p'), pill('Sunset lights · daily', 'p'), pill('Weekend late night · 22:00', 'p'), gap=8))
page_board('EAutoWeek', 'Week ahead calendar', P1, wk, caption='Week ahead: every scheduled fire on a weekly grid')

nts = (ah('Notes, locks and bulk edits', 0)
       + grid('minmax(0,1.3fr) minmax(0,1fr)', col(card(row(ico('Lightbulb', 'g', 36, 12, 18), '<b class="grow">Hall and kitchen on</b>', I('LockOutline', 18)), f'<div style="padding:12px;border-radius:14px;background:var(--wc);transform:rotate(-1deg);animation:pop .4s both">{I("NoteText", 18)} Brightness 80 because the kids sleep upstairs.</div>', pad=16),
                                                  card(row(ico('Bell', 'e', 36, 12, 18), '<b class="grow">Notify Alex</b>'), pad=16), gap=10),
              card(field('Swap entity', 'light.porch', mono=True), field('With', 'light.porch_main', mono=True), note('Used by 6 automations and 2 scripts.', 'p'), btn('Swap everywhere', 'fill'), title='Bulk edit across automations')))
page_board('EAutoNotes', 'Notes, locks and bulk edits on steps', P1, nts, caption='Sticky notes and locks on steps, and an entity swapped across every automation')

# ---------------- Dashboard editor ----------------
def mini(w, h, cols):
    cells = ''.join(f'<span style="height:{max(28, h // 6)}px;border-radius:10px;background:var({c});animation:rise .5s {i * 40}ms both"></span>' for i, c in enumerate(['--pc', '--wc', '--tc', '--okc', '--pc', '--wc'][:cols * 2]))
    return f'<div style="width:{w}px;height:{h}px;border-radius:18px;border:6px solid var(--on);padding:8px;display:grid;grid-template-columns:repeat({cols},1fr);gap:6px;align-content:start;background:var(--s1)">{cells}</div>'


dh = lambda sub, i: header('Home', sub, 'Dashboards › Editing', row(btn('Done', 'fill', 'Check'), tools(), gap=10), tabs=(['Screens', 'Layout', 'Visibility', 'Interactions', 'Style', 'Simulate', 'Entities', 'Checks'], i))
scr = (dh('Every screen at once', 0) + row(mini(170, 330, 1), mini(330, 240, 2), mini(300, 180, 3), mini(420, 260, 3), gap=24, align='flex-end')
       + '<div style="height:20px"></div>' + row(note('The phone view has 2 cards wider than the screen.', 'w', 'Alert'), btn('Make phone friendly', 'fill', 'Cellphone'), gap=12))
page_board('EDashScreens', 'Every screen side by side', P2, scr, active='Overview', caption='Screens: phone, tablet, wall panel and desktop previewed live together')

lay = (dh('Layout tools', 1) + '<div style="position:relative;height:520px;border-radius:24px;background:radial-gradient(var(--s3) 1.2px,transparent 1.2px) 0 0/22px 22px,var(--s1)">'
       + '<span style="position:absolute;left:0;right:0;top:120px;border-top:2px dashed var(--e)"></span><span style="position:absolute;top:0;bottom:0;left:380px;border-left:2px dashed var(--e)"></span>'
       + f'<div class="card" style="position:absolute;left:60px;top:120px;width:320px;height:150px;padding:16px">{row(ico("Lightbulb", "w"), "<b>Kitchen</b>")}</div>'
       + f'<div class="card" style="position:absolute;left:380px;top:120px;width:280px;height:150px;padding:16px;outline:3px solid var(--p);outline-offset:2px;animation:float 2.4s infinite">{row(ico("Thermostat"), "<b>Hall</b>")}<span style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;border-radius:4px;background:var(--p)"></span></div>'
       + f'<div class="toolpill" style="position:absolute;left:20px;bottom:20px">{"".join(ib(i) for i in ["AlignHorizontalLeft", "AlignHorizontalCenter", "AlignVerticalTop", "DistributeHorizontalCenter", "Magnet", "Grid"])}</div></div>')
page_board('EDashLayout', 'Free layout tools', P2, lay, active='Overview', caption='Layout: drag and resize with snapping guides, align and distribute like a design app')

vis = (dh('Kitchen card · show when', 2)
       + grid('minmax(0,1.3fr) minmax(0,1fr)', card(*[row(pill(a, 'p'), f'<span class="grow">{b}</span>', ib('Close')) for a, b in [('Person', 'Alex or Sam is viewing'), ('Screen', 'Wider than a phone'), ('State', 'light.kitchen is on'), ('Time', 'Between 06:00 and 23:00')]],
                                                    row(seg(['All of these', 'Any of these'], 0), btn('Add rule', 'ton', 'Plus')), title='Show this card when', gap=12),
              card(row(f'<b class="grow">Visible now</b>', pill('Yes', 'g')), *[row(f'<span class="sm grow">{x}</span>', I('CheckCircle', 18)) for x in ['Alex is viewing', 'Desktop', 'Kitchen is on', '18:42']], title='Right now', gap=8)))
page_board('EDashVisibility', 'Visibility rule builder', P2, vis, active='Overview', caption='Visibility: rules built from person, screen, state and time, with a live answer')

itc = (dh('Kitchen card · interactions', 3)
       + grid(3, *[card(ico(i, t), f'<b class="h3">{g}</b>', field('Does', a), field('Animation', m), pad=18) for i, g, a, m, t in
                   [('GestureTap', 'Tap', 'Toggle the light', 'Ripple and pop', 'p'), ('GestureTapHold', 'Hold', 'Open more info', 'Sheet from the card', 't'), ('GestureDoubleTap', 'Double tap', 'Set 100% brightness', 'Glow', 'w')]])
       + '<div style="height:16px"></div>' + note('Animations come from the motion editor and follow Reduce motion.', 'p', 'MotionPlay'))
page_board('EDashInteractions', 'Interaction editor', P2, itc, active='Overview', caption='Interactions: tap, hold and double tap, each with its action and animation')

sty = (dh('Style', 4)
       + grid('minmax(0,1fr) minmax(0,1.2fr)', card(field('Background', 'Coral container'), field('Corner radius', '28 px'), field('Shadow', 'Soft'), field('Title font', 'Fraunces 600'), row(btn('Copy style', 'ton', 'ContentCopy'), btn('Paste style', 'txt', 'ContentPaste')), title='Kitchen card'),
              card(f'<div class="card" style="padding:20px;background:var(--ec);border-radius:28px;animation:pop .5s both">{row(ico("Lightbulb", "e"), "<b class=h2>Kitchen</b>")}</div>', field('Theme for this view', 'Evening, warm'), title='Preview')))
page_board('EDashStyle', 'Style per card and per view', P2, sty, active='Overview', caption='Style: per-card overrides, copy and paste styles, a theme per view')

dsim = (dh('Preview a situation', 5) + row(*[chip(x, i == 1) for i, x in enumerate(['Now', 'Night', 'Away', 'Alarm', 'Party'])], gap=8) + '<div style="height:16px"></div>'
        + f'<div class="root dark" style="border-radius:24px;padding:24px;animation:fade .8s both">' + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', f'<span class="sm mu">{s}</span>', pad=18) for i, n, s, t in
                                                                                                        [('WeatherNight', 'Night', 'Dimmed, 22:30', 'p'), ('Lock', 'Front door', 'Locked', 'g'), ('Lightbulb', 'Hall', '10%', 'w')]]) + '</div>')
page_board('EDashSimulate', 'State simulator', P2, dsim, active='Overview', caption='Simulator: fake night, away or alarm to see how the dashboard looks')

ent = (dh('Entities used', 6) + table(['Entity', 'Cards', 'State'], [[f'<span class="mono">{a}</span>', b, pill(c, t)] for a, b, c, t in
                                                                 [('light.kitchen', 'Kitchen, Lights row', 'on', 'g'), ('sensor.hall_temperature', 'Hall', '20.4 °C', 'n'), ('sensor.old_garage', 'Garage', 'Missing', 'e'), ('media_player.tv', 'TV', 'off', 'n')]], ['1.5fr', '1.5fr', '1fr'], sel={2})
       + actionbar(abtn('Swap everywhere', 'SwapHorizontal', True), abtn('Show cards', 'Eye'), note='1 selected'))
page_board('EDashEntities', 'Entity inspector', P2, ent, active='Overview', caption='Entities: every entity and the cards that use it, broken ones in red')

a11 = (dh('Accessibility check', 7)
       + grid('260px minmax(0,1fr)', card(ring(90, '90', 't', 160), style='align-items:center'),
              lst([('Contrast', 'Garage card text is 3.8:1', 'Needs 4.5:1', btn('Fix', 'ton', size='sm'), 'e'), ('GestureTap', 'Scene buttons are 36 px', 'Make them 48 px', btn('Fix', 'ton', size='sm'), 'w'),
                   ('Label', 'Icon button has no name', 'Fan card', btn('Name it', 'ton', size='sm'), 'w'), ('FormatListNumbered', 'Reading order matches the layout', '', '', 'g')], 'Findings')))
page_board('EDashA11y', 'Accessibility checker', P2, a11, active='Overview', caption='Accessibility: contrast, target size, names and reading order, each fixable')

wall = (header('Wall panel', 'Hall tablet', 'Dashboards', tools())
        + grid(3, card(field('Screensaver after', '2 minutes'), field('Shows', 'Clock and photos'), title='Screensaver'), card(field('Rotate views', 'Home, Energy, Cameras'), field('Every', '30 s'), title='Rotation'),
               card(row('<b class="grow">Dim when idle</b>', switch(1)), field('Night brightness', '10%'), field('Schedule', '22:00 to 07:00'), title='Brightness'))
        + '<div style="height:16px"></div>' + f'<div style="height:220px;border-radius:24px;background:#16161c;color:#fff;display:grid;place-items:center;animation:breathe 4s infinite"><div class="col" style="align-items:center;gap:4px"><span style="font-size:64px;font-weight:300">18:42</span><span>Thursday · 4° · Clear</span></div></div>')
page_board('EDashWall', 'Wall panel builder', P2, wall, active='Overview', caption='Wall panel: screensaver, rotation and night dimming, with the screensaver previewed')

lib = (header('My cards', '5 cards', 'Dashboards', row(btn('New card', 'fill', 'Plus'), tools(), gap=10))
       + grid(3, *[card(f'<div class="thumb" style="height:110px">{I(i, 36)}</div>', f'<b class="h3">{n}</b>', row(pill(v), pill(f'{k} input' + ('s' if k > 1 else ''), 't')), row(btn('Insert', 'ton', size='sm'), btn('Share', 'txt', 'ShareVariant', 'sm')), pad=18) for i, n, v, k in
                   [('ViewAgenda', 'Room header', 'v3', 2), ('LightningBolt', 'Energy summary', 'v1', 1), ('Doorbell', 'Doorbell', 'v2', 1)]]))
page_board('EDashLibrary', 'My cards library', P2, lib, active='Overview', caption='My cards: your own cards with inputs and versions, shareable as an extension')

prf = (dh('Performance', 7) + stats(('41 ms', 'First draw', 'g', 'Timer'), ('19', 'Live subscriptions', 'p', 'AccessPoint'), ('2', 'Slow cards', 'w', 'Turtle'))
       + '<div style="height:16px"></div>' + bars([34, 12, 8, 6, 4, 3], 'p', 160, ['Camera', 'History graph', 'Map', 'Weather', 'Tile', 'Tile']))
page_board('EDashPerf', 'Performance meter', P2, prf, active='Overview', caption='Performance: draw time and live subscriptions per card, the slow ones first')

dif = (header('Compare checkpoints', 'Before party vs now', 'Dashboards › History', row(btn('Restore left', 'out', 'Restore'), tools(), gap=10))
       + grid(2, *[card(grid(2, *[f'<div style="height:70px;border-radius:14px;background:var({c});{o}"></div>' for c, o in cs], gap=10), title=t) for t, cs in
                   [('Before party', [('--pc', ''), ('--wc', ''), ('--tc', ''), ('--s2', '')]), ('Now', [('--pc', ''), ('--ec', 'outline:3px solid var(--e)'), ('--tc', ''), ('--okc', 'outline:3px solid var(--ok)')])]])
       + '<div style="height:16px"></div>' + row(pill('1 changed', 'e'), pill('1 added', 'g'), gap=8))
page_board('EDashDiff', 'Visual diff between checkpoints', P2, dif, active='Overview', caption='Diff: two named checkpoints side by side, changes outlined')

# ---------------- Phone ----------------
p1 = phone(''.join(card(row(ico(i, t, 36, 12, 18), col(f'<b>{n}</b>', f'<span class="xs mu">{s}</span>', gap=0, style='flex:1'), f'<span class="mono xs">{ms}</span>'), bar(p, t), pad=14, gap=8) for i, n, s, p, ms, t in
                   [('MapMarker', 'Alex arrives home', 'Triggered', 4, '0 ms', 'p'), ('SourceBranch', 'Anyone home?', 'Yes', 8, '12 ms', 'w'), ('Lightbulb', 'Lights on', '2 changed', 70, '910 ms', 'g')]), 'Trace', A, back=True)
p2 = phone(field('Time', 'Today 22:00') + field('Alex', 'away'), 'Simulate', A, back=True, sheet=sh('<b class="h3">Result</b>', row('<span class="grow">Notify Alex</span>', pill('Would run', 'g')), row('<span class="grow">Lights on</span>', pill('Skipped', 'n'))))
p3 = phone(row(mini(110, 200, 1), mini(190, 140, 2), gap=12) + btn('Make phone friendly', 'fill', 'Cellphone'), 'Screens', 'Home', back=True,
           sheet=sh('<b class="h3">Kitchen card · show when</b>', row(pill('Person', 'p'), '<span class="sm">Alex is viewing</span>'), row(pill('Time', 'p'), '<span class="sm">06:00 to 23:00</span>')))
phone_board('EPhoneEditors', 'Both editors on a phone', P3, [p1, p2, p3], caption='On a phone: the trace as cards, the simulator result in a sheet, screens and visibility rules kept')

# ---------------- Problem detector ----------------
P4 = 'problems'
pring = 'outline:3px solid var(--e);outline-offset:4px;animation:pgpulse 1.6s ease-in-out infinite'
PGCSS = ('<style>@keyframes pgpulse{0%,100%{outline-color:var(--e);box-shadow:0 0 0 0 color-mix(in srgb,var(--e) 40%,transparent)}50%{outline-color:color-mix(in srgb,var(--e) 55%,transparent);box-shadow:0 0 0 12px transparent}}'
         '@keyframes spot{from{clip-path:circle(140% at 50% 50%)}to{clip-path:circle(var(--r,160px) at var(--x,50%) var(--y,50%))}}'
         '@media (prefers-reduced-motion:reduce){[style*=pgpulse],[style*=spot]{animation:none!important}}</style>')


def badge(x=None, y=None):
    pos = f'position:absolute;left:{x}px;top:{y}px;' if x is not None else ''
    return (f'<span class="row" style="{pos}gap:6px;padding:6px 12px 6px 8px;border-radius:999px;background:var(--e);color:#fff;font-weight:600;font-size:13px;box-shadow:var(--shl);animation:pop .4s .2s both;z-index:3">'
            f'{I("AlertDecagram", 18)}{e(FOUND)}</span>')


def details(what, why, auto=True, manual=None, w=420):
    m = ''
    if manual:
        m = '<b class="h3">How to fix it by hand</b>' + ''.join(row(pill(str(n), 'e'), f'<span class="sm">{e(x)}</span>', align='flex-start') for n, x in enumerate(manual, 1))
    acts = row(btn('Fix', 'fill', 'AutoFix') if auto else btn('Show me where', 'fill', 'Crosshairs'), btn('Ignore', 'txt'), btn('Ask for help', 'txt', 'Lifebuoy'))
    return (f'<div class="dlg" style="width:{w}px;gap:12px;animation:slidein .4s .25s both">{row(ico("AlertDecagram", "e", 44, 14, 22), col(f"<b class=h3>{e(FOUND)}</b>", f"<span class=sm>{e(what)}</span>", gap=2, style="flex:1"), ib("Close"), align="flex-start")}'
            f'{note(why, "w", "InformationOutline")}{m}{acts}</div>')


au = (PGCSS + ah('1 ' + ONE, 0)
      + grid('minmax(0,1.2fr) minmax(0,1fr)', col(card(row(ico('MapMarker', 'p', 36, 12, 18), '<b class="grow">Alex arrives home</b>'), pad=16),
                                                  f'<div style="position:relative">{badge(16, -16)}' + card(row(ico('Lightbulb', 'g', 36, 12, 18), col('<b>Porch light on</b>', '<span class="sm mu">light.porch</span>', gap=0, style='flex:1')), pad=16, style=pring) + '</div>',
                                                  card(row(ico('Bell', 'e', 36, 12, 18), '<b class="grow">Notify Alex</b>'), pad=16), gap=14),
             details('light.porch does not exist any more.', 'The step is skipped every time, so the porch stays dark.', True)))
page_board('EPGAutomation', cap1(ONE) + ' detector on an automation step', P4, au, caption=f'On a step: the exact step pulses, a "{FOUND}" badge, details with Fix')

da = (PGCSS + header('Home', '', 'Dashboards', tools())
      + grid('minmax(0,1.3fr) minmax(0,1fr)', grid(2, card(ico('Lightbulb', 'w'), '<b class="h3">Kitchen</b>', pad=18),
                                                   f'<div style="position:relative">{badge(14, -14)}' + card(ico('Garage', 'n'), '<b class="h3">Garage</b>', '<span class="sm mu">Unavailable</span>', pad=18, style=pring) + '</div>',
                                                   card(ico('Thermostat'), '<b class="h3">Hall</b>', pad=18), card(ico('Television', 't'), '<b class="h3">TV</b>', pad=18)),
             details('The garage door opener has been offline for 3 days.', 'This needs a hand: Home Assistant cannot plug it back in for you.', False,
                     ['Check the opener has power and its light is on.', 'Open Settings › Devices › Garage opener and press Reconnect.', 'Still offline? Remove it and add it again.'])))
page_board('EPGDashboard', cap1(ONE) + ' detector on a dashboard card, manual fix', P4, da, active='Overview', caption='On a card: when it cannot fix itself, numbered steps to fix it by hand')

st = (PGCSS + header('General', '', 'Settings › System', tools())
      + grid('minmax(0,1.2fr) minmax(0,1fr)', card(field('Name', 'Home'), f'<div style="position:relative">{badge(200, -10)}<div style="{pring};border-radius:16px">{field("Time zone", "Europe/Londn")}</div></div>', field('Units', 'Metric'), title='General'),
             details('"Europe/Londn" is not a time zone.', 'Automations that use the time will run at the wrong hour.', True)))
page_board('EPGSettings', cap1(ONE) + ' detector on a settings field', P4, st, caption='On a field: the field itself is outlined, Fix offers the closest match')

rep = (PGCSS + header(REP, f'4 {MANY} across the app', 'Settings › System', row(btn('Fix all that can be fixed', 'fill', 'AutoFix'), tools(), gap=10))
       + lst([('Robot', 'Arrive home › Porch light on', 'light.porch does not exist', row(btn('Fix', 'ton', size='sm'), btn('Teleport', 'out', 'Crosshairs', 'sm')), 'e'),
              ('ViewDashboard', 'Home › Garage card', 'Offline for 3 days · needs a hand', row(btn('How to fix', 'ton', size='sm'), btn('Teleport', 'out', 'Crosshairs', 'sm')), 'e'),
              ('Cog', 'General › Time zone', '"Europe/Londn" is not a time zone', row(btn('Fix', 'ton', size='sm'), btn('Teleport', 'out', 'Crosshairs', 'sm')), 'w'),
              ('PuzzleOutline', 'Integrations › Kasa', 'Connection timed out 3 times', row(btn('Retry', 'ton', size='sm'), btn('Teleport', 'out', 'Crosshairs', 'sm')), 'w')], f'All {MANY}'))
page_board('EPGRepairs', REP + ' with Teleport', P4, rep, caption=f'{REP}: every {ONE} in one list, Fix where it can, Teleport to the exact element')

tp = (PGCSS + '<div style="position:relative;height:100%">' + header('Home', 'Teleported from ' + REP, 'Dashboards', tools())
      + grid(4, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=18, style=pring if n == 'Garage' else '') for i, n, t in [('Lightbulb', 'Kitchen', 'w'), ('Garage', 'Garage', 'n'), ('Thermostat', 'Hall', 'p'), ('Television', 'TV', 't')]])
      + '<div style="position:absolute;inset:-48px;background:rgba(10,10,20,.55);--x:41%;--y:21%;--r:150px;-webkit-mask:radial-gradient(circle 115px at 40% 22%,transparent 98%,#000);mask:radial-gradient(circle 115px at 40% 22%,transparent 98%,#000);animation:fade .6s both"></div>'
      + f'<div style="position:absolute;left:44%;top:34%;animation:rise .5s .4s both">{details("The garage door opener has been offline for 3 days.", "Follow the steps, or go back to the list.", False, ["Check the opener has power.", "Press Reconnect on the device page."], 380)}</div>'
      + f'<div style="position:absolute;left:24px;bottom:24px">{btn("Back to " + REP, "ton", "ArrowLeft")}</div></div>')
page_board('EPGTeleport', 'Teleport to the exact element', P4, tp, active='Overview', caption='Teleport: the right page opens, everything dims except the element, details beside it')

cfg = (header(cap1(ONE) + ' detector', 'Everywhere in the app', 'Settings › Personal', tools())
       + grid(2, card(row('<b class="grow">Highlight ' + MANY + ' where they are</b>', switch(1)), row('<b class="grow">Pulse the outline</b>', switch(1)), row('<b class="grow">Show the badge</b>', switch(1)), field('Check every', '1 minute'), title='Detector'),
              card(*[row(f'<span class="grow">{n}</span>', switch(o)) for n, o in [('Missing entities', 1), ('Offline devices', 1), ('Invalid settings', 1), ('Deprecated actions', 1), ('Slow cards', 0)]], title='What to look for', gap=10),
              card(field('Badge wording', FOUND), '<span class="sm mu">Comes from your personal wording file when one is applied.</span>', title='Wording')))
page_board('EPGConfig', cap1(ONE) + ' detector settings', P4, cfg, caption='Settings: what it looks for, how loud it is, and wording from your file')

pp1 = phone(PGCSS + card(ico('Lightbulb', 'w'), '<b>Kitchen</b>', pad=14) + f'<div style="position:relative">{badge(12, -14)}' + card(ico('Garage', 'n'), '<b>Garage</b>', '<span class="sm mu">Unavailable</span>', pad=14, style=pring) + '</div>', 'Home', 'Home',
            sheet=sh(f'<b class="h3">{e(FOUND)}</b>', '<span class="sm">Garage opener offline for 3 days.</span>', *[row(pill(str(n), 'e'), f'<span class="sm">{x}</span>') for n, x in [(1, 'Check it has power'), (2, 'Press Reconnect')]], btn('Show me where', 'fill', 'Crosshairs')))
pp2 = phone(lst([('Robot', 'Porch light on', 'Missing entity', btn('Teleport', 'out', 'Crosshairs', 'sm'), 'e'), ('ViewDashboard', 'Garage card', 'Needs a hand', btn('Teleport', 'out', 'Crosshairs', 'sm'), 'e'), ('Cog', 'Time zone', 'Invalid', btn('Teleport', 'out', 'Crosshairs', 'sm'), 'w')]) + btn('Fix all that can be fixed', 'fill', 'AutoFix'), REP, 'Settings', back=True)
phone_board('EPGPhone', cap1(ONE) + ' detector on a phone', P4, [pp1, pp2], caption='On a phone: the badge and outline stay, details and steps in a sheet, Teleport from the list')

write_index('Home Assistant Material, modern: Editors', [(P1, 'Automation editor: 12 new features'), (P2, 'Dashboard editor: 12 new features'), (P3, 'Both editors on a phone'), (P4, cap1(ONE) + ' detector everywhere, with ' + REP + ' and Teleport')], 'EAutoFlow')
