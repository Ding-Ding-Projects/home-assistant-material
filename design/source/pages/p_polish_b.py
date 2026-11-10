"""Polish pass, canvas 13: personal settings, guided setup, setup guidance, the developer tools
rail item and media search, on a phone and in a wide window. Run through build_polish.py."""
from polish_lib import *

P = '13-polish'
mi = lambda items: ''.join(f'<button class="mi">{I(i, "s")}<span class="bm grow">{t}</span></button>' for i, t in items)


def prow(title, desc, ctrl, reach='', default='', expanded=False, tone=''):
    """One personal setting. Collapsed: title, control. Expanded: explanation, default, reach, reset."""
    head = f'<div class="row" style="gap: 8px"><span class="ll grow">{title}</span>{ctrl}</div>'
    if not expanded:
        return f'<div class="col" style="gap: 4px; padding: 12px 14px; border-radius: 20px; background: var(--sl1)">{head}<span class="bs mu">{desc}</span></div>'
    r = f'<span class="row bs" style="gap: 6px; align-items: flex-start; color: var(--{tone or "onv"})">{I("InformationOutline", "s")}<span>{reach}</span></span>' if reach else ''
    return (f'<div class="col" style="gap: 8px; padding: 14px; border-radius: 20px; background: var(--sl1)">{head}<span class="bs mu">{desc}</span>{r}'
            f'<div class="row" style="gap: 8px"><span class="bs mu grow">Default: {default}</span>{btn("Reset", "text", "Restore", True)}</div></div>')


LEVELS = seg(['1', '2', '3', '4', '5'], '5', 'Playfulness')
MODE = seg(['English', 'Cantonese', 'Both'], 'Both', 'Language mode')
PREVIEW = lambda both=True: card(row('<h3 class="tm grow">Preview</h3>', tag('Preview only', 'a')),
                                 '<span class="bl">Saved! Your changes are safe and snug, and the house is very proud of you.</span>'
                                 + ('<span class="bl" lang="yue">搞掂晒！你嘅更改安安樂樂，成間屋都為你自豪。</span>' if both else ''),
                                 '<span class="bs mu">Only this preview follows the language mode and playfulness today. The rest of the interface follows when its wording is ready.</span>',
                                 label='Preview', style='padding: 18px; background: var(--tc); color: var(--on-tc)', gap=8)

# ---------- 11. Personal settings, phone ----------
grp_chips = row(chip('Language', True), chip('Sound'), chip('Motion'), gap=6, style='overflow: hidden')
s1 = phone(pbar('Personal', True, ib('DotsVertical', 'More: reset all personal settings')) + pbody(
    wfind('Search personal settings', 44), grp_chips, PREVIEW(),
    prow('Language mode', 'English, playful Hong Kong Cantonese, or both together.', '', expanded=False) + f'<div style="margin-top: -6px">{MODE}</div>',
    prow('Playfulness in English', 'From 1, fully serious, to 5, as playful as it gets.', ''), gap=10, style='overflow: hidden'),
    'Groups as chips, the preview pinned under them, then the rows. Language mode and playfulness carry a "Preview only" tag on the preview, not a warning on each row.', h=700)
s2 = phone(pbar('Personal', True) + pbody(
    '<span class="ll mu">Sound</span>',
    prow('Action sounds', 'A short sound when you turn a setting on, reset it, or try a sound.', sw(True, 'Action sounds'),
         'Active on this page now. Other pages do not play sounds yet.', 'On', True),
    prow('Sound volume', 'How loud action sounds are, from 0 to 100.', '<span class="ll">40</span>') + slider('Sound volume', 40),
    '<span class="ll mu">Motion and attention</span>',
    prow('Low stimulation', 'Softens colour, shortens animations and silences action sounds.', sw(False, 'Low stimulation')), gap=10, style='overflow: hidden'),
    'A row opened: its explanation, what it reaches today, its default and its own Reset.', h=700)
s3 = phone(pbar('Personal', True) + pbody(
    wfind_typed('motion'),
    '<span class="bs mu">2 settings match</span>',
    prow('Reduce motion', 'Shortens animations across the interface.', sw(False, 'Reduce motion'), 'Active everywhere that uses the theme\'s animation timing.', 'Off', True),
    prow('Low stimulation', 'Softens colour, shortens animations and silences action sounds.', sw(False, 'Low stimulation')), gap=10),
    'Search matches titles, explanations and reach lines, and keeps each match\'s group name.', dark=True, h=700)
phone_board(P, 'PersonalPhone', 'Personal settings on a phone',
            'Grouped by task, searchable, every row explains itself. The preview shows what the language and playfulness choices do without making the page look broken.',
            [s1, s2, s3],
            [decide('Three groups: Language and playfulness, Sound, Motion and attention. On a phone they are chips that scroll the page to the group.',
                    'Each row: title and control on one line, the explanation under it. Opening a row adds the reach line, the default and Reset.',
                    'Reset all lives in the top bar\'s More menu and asks once, listing what changes.'),
             changes('The "what it reaches today" line is shown only when a row is opened, so the page does not read as a list of disclaimers.',
                     'Language mode and both playfulness levels say "Preview only" once, on the preview card, in the amber tone used for "not yet" everywhere.',
                     'Cantonese and Both: the preview grows to two lines; the rows keep their size.')])

# ---------- 12. Personal settings, wide ----------
nav = col(*[f'<button class="li{" sel" if g == "Language and playfulness" else ""}" style="min-height: 48px">{I(i, "s")}<span class="ll grow">{g}</span></button>'
            for i, g in [('Translate', 'Language and playfulness'), ('VolumeHigh', 'Sound'), ('MotionPauseOutline', 'Motion and attention')]],
          '<span class="grow"></span>', btn('Reset all personal settings', 'out', 'Restore', True), gap=4, style='width: 260px; flex: none')
rows_w = col('<h2 class="tl">Language and playfulness</h2>', '<span class="bm mu">How wording should read: which language, and how playful.</span>',
             prow('Language mode', 'Choose English, playful Hong Kong Cantonese, or both together.', MODE, 'Saved and applied to the preview on this page. Most of the interface is not yet shown in this mode.', 'English', True, 'amber'),
             prow('Playfulness in English', 'From 1, fully serious, to 5, as playful as it gets.', LEVELS, 'Saved and applied to the preview on this page.', '5', True, 'amber'),
             prow('Playfulness in Cantonese', 'From 1 to 5. Independent of the English level.', LEVELS), gap=10, style='flex: 1; min-width: 0')
pw = window('<div class="col" style="padding: 24px 28px; gap: 16px">' + row('<h2 class="hs grow">Personal</h2>', wfind('Search personal settings', 44).replace('find grow', 'find" style="width: 340px; height: 44px; padding-right: 4px'))
            + row(nav, rows_w, col(PREVIEW(), gap=12, style='width: 340px; flex: none'), gap=24, style='align-items: flex-start') + '</div>', label='Personal settings')
wide_board(P, 'PersonalWide', 'Personal settings in a wide window',
           'Groups on the left, the rows in the middle, the preview pinned on the right so it changes in view as a level changes.',
           pw, [decide('The amber reach line marks a choice that is saved but reaches only the preview today; a choice that works everywhere has a plain line.', 'The preview stays in view while the rows scroll.'),
                decide('Reset all asks once and lists every setting it will change, with the current and default values.', 'Search narrows the rows and the group list together; an empty search result says which words were searched.')])

# ---------- 13. Guided setup list, phone ----------
irow = lambda n, d, ic, act='Set up': f'<div class="li" style="background: var(--sl1); min-height: 56px; padding: 8px 12px"><span class="lead">{I(ic, "s")}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{d}</span></span>{btn(act, "tonal", None, True)}</div>'
erow = lambda n, d, ic: f'<div class="li" style="background: var(--sl1); min-height: 56px; padding: 8px 12px"><span class="lead">{I(ic, "s")}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{d}</span></span>{ib("Pencil", "Edit " + n)}{ib("DeleteOutline", "Remove " + n)}</div>'
g1 = phone(pbar('Guided setup', True) + pbody(wfind('Search 240 integrations', 44), '<span class="ll mu">Set up here (2)</span>',
                                              erow('Command line sensor', 'Disk free on /', 'Console'), erow('Wake on LAN', 'Office PC', 'Lan'),
                                              '<span class="ll mu">Can be set up here</span>', irow('Command line', 'Sensors from a shell command', 'Console'),
                                              irow('Generic thermostat', 'A heater and a sensor', 'Thermostat'), irow('Ping', 'Is a device answering?', 'IpNetwork'), gap=8, style='overflow: hidden'),
           'Entries made here come first with Edit and Remove; then the integrations, A to Z.', h=700)
g2 = phone(pbar('Guided setup', True) + pbody(wfind_typed('thermo'),
                                              '<span class="bs mu">3 of 240 match</span>', irow('Generic thermostat', 'A heater and a sensor', 'Thermostat'), irow('Generic hygrostat', 'A humidifier and a sensor', 'WaterPercent'), irow('Bayesian', 'Matches "thermostat" in its description', 'ChartBellCurve'), gap=8)
           + '<span class="grow"></span>' + keyboard(200), 'Search with the keyboard up: the count stays in view.', h=700)
g3 = phone(pbar('Guided setup', True) + pbody(wfind('Search 240 integrations', 44), '<div class="col" style="align-items: center; gap: 12px; padding: 40px 12px; text-align: center">'
                                              + f'<span class="sq" style="background: var(--sl2)">{I("PuzzleOutline")}</span><span class="tm">Nothing set up here yet</span>'
                                              + '<span class="bm mu">These integrations have no setup screen of their own. Choose one below to write its YAML for you, with a review before anything is saved.</span></div>'
                                              + irow('Command line', 'Sensors from a shell command', 'Console'), gap=10),
           'Empty: says what this page is for before the list.', dark=True, h=700)
phone_board(P, 'SetupListPhone', 'Guided setup list on a phone',
            'About 240 integrations that have no setup screen, searchable, and the entries already made here with Edit and Remove.', [g1, g2, g3],
            [decide('Two sections: "Set up here" with the entries made on this page, then "Can be set up here" with every integration A to Z.', 'Search matches name and description; the count of matches is always shown.'),
             changes('The integration rows get a one-line description under the name, from the integration\'s own manifest, so similar names can be told apart.', 'Remove asks once and says it will take the YAML out and need a reload.')])

# ---------- 14. Guided setup list, wide ----------
gt = table([('Integration', 4), ('What it does', 5), ('', 2)],
           [[('Command line sensor', 'Disk free on /'), 'Set up here on 9 November', ib('Pencil', 'Edit') + ib('DeleteOutline', 'Remove')],
            [('Wake on LAN', 'Office PC'), 'Set up here on 2 November', ib('Pencil', 'Edit') + ib('DeleteOutline', 'Remove')]], 'Set up here', lead=['Console', 'Lan'])
gl = grid(3, *[f'<button class="li" style="background: var(--sl1); min-height: 64px"><span class="lead">{I(i, "s")}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{d}</span></span>{I("ChevronRight", "s")}</button>'
               for i, n, d in [('Console', 'Command line', 'Sensors from a shell command'), ('Thermostat', 'Generic thermostat', 'A heater and a sensor'), ('IpNetwork', 'Ping', 'Is a device answering?'),
                               ('WaterPercent', 'Generic hygrostat', 'A humidifier and a sensor'), ('ChartBellCurve', 'Bayesian', 'Chance from several sensors'), ('Webhook', 'RESTful', 'Read values from a web address'),
                               ('Lan', 'Wake on LAN', 'Wake a computer'), ('Sigma', 'Statistics', 'Mean, max and more over time'), ('TimerOutline', 'History stats', 'How long a state lasted')]], gap=8)
gw = window('<div class="col" style="padding: 24px 28px; gap: 16px">' + row('<div class="col grow"><h2 class="hs">Guided setup</h2><span class="bm mu">Integrations that have no setup screen of their own. Each entry writes YAML you review first.</span></div>')
            + '<h3 class="tm">Set up here</h3>' + gt + row('<h3 class="tm grow">Can be set up here</h3>', wfind('Search 240 integrations', 44).replace('find grow', 'find" style="width: 360px; height: 44px; padding-right: 4px'))
            + gl + '<span class="bs mu">231 more, A to Z.</span></div>', label='Guided setup')
wide_board(P, 'SetupListWide', 'Guided setup list in a wide window', 'Entries first as a table; the integrations as a three-column grid of rows.', gw,
           [decide('The grid shows nine at a time on first view; the rest load as the page scrolls.', 'Choosing an integration opens the wizard on its About step.'),
            decide('An integration that already has an entry still shows; a small tag says how many entries it has.', 'Errors from a reload after Remove appear as a toast with a link to the log.')])

# ---------- 15. Guided setup wizard, phone ----------
WSTEPS = ['About', 'Options', 'Review', 'Done']
whead = lambda st, name='Generic thermostat': pbar(name, False, ib('Close', 'Cancel setup'), sub=f'Step {st + 1} of 4, {WSTEPS[st]}') + f'<div style="padding: 0 16px 8px">{stepper(4, st)}</div>'
wfoot = lambda nxt='Next', back=True: (f'<footer class="row" style="gap: 8px; padding: 12px 16px; flex: none; border-top: 1px solid var(--outv); background: var(--sl1)">'
                                       + (btn('Back', 'text', None, True) if back else '') + '<span class="grow"></span>' + btn(nxt, 'fill', None, True) + '</footer>')
x1 = phone(whead(1) + pbody(mfield('Name', 'Living room heat'), mfield('Heater', 'switch.living_heater', 'PowerPlug'),
                            mfield('Temperature sensor', '', 'Thermometer', err='Choose a sensor. The thermostat needs one to know the temperature.'),
                            frow(mfield('Lowest', '7 °C'), mfield('Highest', '35 °C')), mfield('Tolerance', '0.3 °C'), gap=10, style='overflow: hidden') + wfoot(),
           'Options, drawn form: one field per option, an error under the field that caused it.', h=700)
yaml = ('<div class="mono bs" style="background: var(--sl0); border-radius: 16px; padding: 12px; line-height: 20px; white-space: pre">'
        '<span style="color: var(--p)">climate</span>:\n  - <span style="color: var(--p)">platform</span>: generic_thermostat\n    <span style="color: var(--p)">name</span>: Living room heat\n'
        '    <span style="color: var(--p)">heater</span>: switch.living_heater\n    <span style="color: var(--p)">target_sensor</span>: sensor.living_temp\n    <span style="color: var(--p)">min_temp</span>: 7\n    <span style="color: var(--p)">max_temp</span>: 35</div>')
x2 = phone(whead(2) + pbody('<span class="bm">This will be added to <span class="mono">configuration.yaml</span>:</span>', yaml, note('Nothing is written until you choose Write.', '', 'InformationOutline'), gap=10) + wfoot('Write'),
           'Review: the exact YAML that will be written, and where.', h=700)
x3 = phone(whead(3) + pbody(f'<div class="col" style="align-items: center; gap: 12px; padding: 24px 8px; text-align: center"><span class="sq" style="background: var(--greenc); color: var(--green)">{I("Check")}</span>'
                            '<span class="tm">Written to configuration.yaml</span><span class="bm mu">Generic thermostat is read when YAML is reloaded. A reload is enough; no restart needed.</span></div>',
                            btn('Reload YAML now', 'fill', 'Refresh', False, 'align-self: stretch'), btn('Later', 'text', None, False, 'align-self: center'), gap=10),
           'Done: says whether a reload is enough or a restart is needed, with that one action.', dark=True, h=700)
phone_board(P, 'SetupWizardPhone', 'Guided setup wizard on a phone', 'About, Options, Review, Done. The Options step draws a form for most integrations; the board for the single YAML box is beside it on the wide board.', [x1, x2, x3],
            [decide('Four steps with the same segmented line as the lock wizard, so progress reads the same everywhere.', 'Field errors sit under their field and name what to do; the Next button stays enabled and moves focus to the first error.'),
             changes('Done offers exactly one action, Reload YAML or Restart, chosen by what the integration needs, instead of both.', 'The Review step names the file it writes to.')])

# ---------- 16. Guided setup wizard, wide ----------
wz = lambda title, step, body, w=640, foot='Next': (
    f'<section class="dlg col" role="dialog" aria-label="{title}" style="width: {w}px; flex: none; gap: 18px; padding: 24px">'
    + row(f'<div class="col grow"><h2 class="tl">{title}</h2><span class="bs mu">Step {step + 1} of 4, {WSTEPS[step]}</span></div>', ib('Close', 'Cancel setup'))
    + stepper(4, step) + body + row(btn('Back', 'text', None, True), '<span class="grow"></span>', btn(foot, 'fill', None, True)) + '</section>')
form_body = col(frow(mfield('Name', 'Living room heat'), mfield('Heater', 'switch.living_heater', 'PowerPlug')),
                frow(mfield('Temperature sensor', '', 'Thermometer', err='Choose a sensor. The thermostat needs one to know the temperature.'), mfield('Tolerance', '0.3 °C')),
                frow(mfield('Lowest', '7 °C'), mfield('Highest', '35 °C')), gap=12)
box_body = col('<span class="bm mu">This integration has no drawn form yet. Write its options as YAML; they are checked as you type.</span>',
               '<div class="mono bs" style="background: var(--sl1); border-radius: 16px; padding: 12px; line-height: 20px; white-space: pre; box-shadow: inset 0 -3px 0 var(--err)">'
               '<span style="color: var(--p)">sensor</span>:\n  - <span style="color: var(--p)">platform</span>: snmp\n    <span style="color: var(--p)">host</span>: 192.168.1.20\n    <span style="color: var(--p)">baseoid</span>: \n</div>',
               '<span class="bs" role="alert" style="color: var(--err)">Line 4: baseoid needs a value, for example 1.3.6.1.2.1.1.3.0</span>', gap=8)
wide_board(P, 'SetupWizardWide', 'Guided setup wizard in a wide window',
           'The same step can be a drawn form (223 of 240 integrations) or one YAML box (the other 17). Both show errors where they happen.',
           row(window(f'<div style="padding: 32px">{wz("Generic thermostat", 1, form_body)}</div>', label='Drawn form'), window(f'<div style="padding: 32px">{wz("SNMP", 1, box_body, 560)}</div>', w=624, label='Single YAML box, dark', dark=True), gap=32, style='align-items: flex-start'),
           [decide('The drawn form pairs short fields side by side from 600 px; on a phone they stack.', 'The YAML box shows line-level errors under it, naming the line and an example value.'),
            decide('About lists what is needed first (a device, a sensor, a host) and links to the documentation.', 'Done says Reload or Restart, and the Restart path warns that automations stop for about a minute.')])

# ---------- 17. Guidance note, phone ----------
gnote = lambda open_=False: (f'<button class="row" aria-expanded="{str(open_).lower()}" style="gap: 10px; padding: 10px 14px; border-radius: 16px; background: var(--sl2); width: 100%">'
                             f'{I("InformationOutline", "s")}<span class="ll grow">About this step</span>{I("ChevronUp" if open_ else "ChevronDown", "s")}</button>')
flow_fields = col(mfield('Host', '192.168.1.40'), mfield('Port', '1883'), mfield('Username', 'homeassistant'), mfield('Password', '••••••••'), gap=10)
n1 = phone(pbar('MQTT', False, ib('Close', 'Close'), sub='Connect to the broker') + pbody(gnote(), flow_fields, gap=12) + wfoot('Submit', False),
           'Collapsed: one 44 px row above the form. The form starts where it always did.', h=640)
n2 = phone(pbar('MQTT', False, ib('Close', 'Close'), sub='Connect to the broker') + pbody(gnote(), flow_fields, gap=12) + scrim()
           + sheet('<h3 class="tm">About this step</h3>', '<span class="bm"><b>What it is for:</b> tells Home Assistant where your MQTT broker is and how to sign in.</span>',
                   '<span class="bm"><b>Needed first:</b> a running broker, for example the Mosquitto app, and its user name and password.</span>',
                   '<a class="row ll" href="#docs" style="gap: 8px">' + I('OpenInNew', 's') + 'MQTT documentation</a>', label='About this step', gap=10),
           'Opened: a sheet over the form, so the form never moves.', h=640)
n3 = phone(pbar('MQTT', False, ib('Close', 'Close'), sub='Connect to the broker') + pbody(gnote(), mfield('Host', '192.168.1.40', err='Could not reach the broker at this address.'), mfield('Port', '1883'), gap=12) + wfoot('Submit', False),
           'With an error: the note stays collapsed and the error is under its field.', dark=True, h=640)
phone_board(P, 'GuidancePhone', 'Guidance note in setup dialogs, on a phone', 'A collapsed note per step: what the step is for, what is needed first, a link to the documentation.', [n1, n2, n3],
            [decide('Collapsed by default, one row. It remembers being opened for the rest of that setup.', 'Three parts in a fixed order: what it is for, needed first, documentation link.'),
             changes('On a phone the note opens as a sheet instead of expanding in place, so the form does not move down.', 'Steps that have no guidance show no row at all, rather than an empty note.')])

# ---------- 18. Guidance note, wide ----------
gd = lambda open_: (f'<section class="dlg col" role="dialog" aria-label="MQTT" style="width: {840 if open_ else 520}px; flex: none; gap: 16px; padding: 24px">'
                    + row('<div class="col grow"><h2 class="tl">MQTT</h2><span class="bs mu">Connect to the broker</span></div>', ib('Close', 'Close'))
                    + row(col(gnote(open_), flow_fields, gap=12, style='flex: 1; min-width: 0'),
                          (col('<h3 class="tm">About this step</h3>', '<span class="bm"><b>What it is for:</b> tells Home Assistant where your MQTT broker is and how to sign in.</span>',
                               '<span class="bm"><b>Needed first:</b> a running broker and its user name and password.</span>', '<a class="row ll" href="#docs" style="gap: 8px">' + I('OpenInNew', 's') + 'MQTT documentation</a>',
                               gap=10, style='width: 280px; flex: none; padding: 16px; border-radius: 20px; background: var(--sl1)') if open_ else ''), gap=20, style='align-items: flex-start')
                    + row('<span class="grow"></span>', btn('Submit', 'fill', None, True)) + '</section>')
wide_board(P, 'GuidanceWide', 'Guidance note in setup dialogs, wide', 'Collapsed, and opened as a side panel that widens the dialog instead of pushing the form down.',
           row(window(f'<div style="padding: 32px">{gd(False)}</div>', w=600, label='Collapsed'), window(f'<div style="padding: 32px">{gd(True)}</div>', label='Opened, dark', dark=True), gap=32, style='align-items: flex-start'),
           [decide('From 900 px the opened note is a 280 px panel to the right of the form; between 600 and 900 px it is the phone sheet.', 'The link opens the documentation in a new tab and says so to screen readers.')])

# ---------- 19. Developer tools on the rail ----------
DEST = [('ViewDashboard', 'Home'), ('LightningBolt', 'Energy'), ('Map', 'Map'), ('FormatListBulleted', 'Activity'), ('PlayBoxMultiple', 'Media'), ('Toolbox', 'Tools')]


def rail_x(sel, expanded=False):
    def item(ic, lab):
        s = lab == sel
        if expanded:
            return (f'<a class="row" href="#{lab}" style="gap: 12px; height: 56px; padding: 0 16px; border-radius: 28px; {"background: var(--sc); color: var(--on-sc)" if s else "color: var(--on)"}">'
                    f'{I(ic)}<span class="ll">{lab}</span></a>')
        return (f'<a class="ri{" sel" if s else ""}" href="#{lab}"><span class="pill">{I(ic)}</span><span class="lm">{lab}</span></a>')
    top = ''.join(item(i, l) for i, l in DEST)
    bottom = item('Bell', 'Alerts') + item('Hammer', 'Developer tools' if expanded else 'Developer') + item('Cog', 'Settings')
    w = 280 if expanded else 96
    return (f'<nav class="col" aria-label="Main" style="width: {w}px; gap: 6px; padding: 12px {12 if expanded else 4}px; align-items: {"stretch" if expanded else "center"}; background: var(--sl0); border-radius: 28px; min-height: 760px">'
            f'{top}<span class="grow"></span>{bottom}</nav>')


rail_body = row(col('<span class="ll mu">Collapsed, Developer tools selected</span>', rail_x('Developer'), gap=12),
                col('<span class="ll mu">Expanded</span>', rail_x('Developer tools', True), gap=12),
                col('<span class="ll mu">Collapsed, dark, Home selected</span>', f'<div class="m3 dark" style="border-radius: 28px; width: 96px">{rail_x("Home")}</div>', gap=12),
                col('<span class="ll mu">Phone drawer</span>', phone(pbar('Menu', False, ib('Close', 'Close the menu')) + pbody(*[f'<a class="row" href="#{l}" style="gap: 12px; height: 48px; padding: 0 16px; border-radius: 24px; {"background: var(--sc); color: var(--on-sc)" if l == "Developer tools" else "color: var(--on)"}">{I(i)}<span class="ll">{l}</span></a>' for i, l in DEST + [("Bell", "Alerts"), ("Hammer", "Developer tools"), ("Cog", "Settings")]], gap=2), h=760), gap=12),
                gap=40, style='align-items: flex-start')
wide_board(P, 'RailDevTools', 'Developer tools on the rail', 'A new item directly above Settings, with the hammer icon the frontend already uses. Collapsed, expanded, dark and in the phone drawer.', rail_body,
           [decide('Order at the foot of the rail: Alerts, Developer tools, Settings.', 'Collapsed label is "Developer" so it fits 72 px; the full name is the expanded label and the tooltip.'),
            decide('Selected state is the same pill as every other destination; Settings is not also selected while a developer tool is open.', 'Shown only to administrators, as today.')], w=1440)

# ---------- 20. Media search, phone ----------
mrow = lambda t, s, ic: f'<div class="li" style="background: var(--sl1); min-height: 56px; padding: 8px 12px"><span class="lead">{I(ic, "s")}</span><span class="col grow"><span class="ll">{t}</span><span class="bs mu">{s}</span></span></div>'
m1 = phone(pbar('Media', True, ib('DotsVertical', 'More')) + pbody(row(wfind('Search music', 44), ib('FilterVariant', 'Filter: all kinds'), gap=4),
                                                                   row(chip('All', True), chip('Albums'), chip('Artists'), gap=6, style='overflow: hidden'),
                                                                   mrow('Blue in Green', 'Track, Kind of Blue', 'FileMusic'), mrow('Blue Train', 'Album', 'FolderMusic'), mrow('Blue Nile', 'Artist', 'Account'), gap=10), 'The field takes the row; Search runs on Enter, so the Search button goes. Filter is one icon button.', h=640)
m2 = phone(pbar('Media', True) + pbody(row(wfind('Search music', 44), ib('FilterVariant', 'Filter'), gap=4), mrow('Blue in Green', 'Track', 'FileMusic'), gap=10) + scrim()
           + sheet('<h3 class="tm">Show</h3>', f'<div class="col" style="gap: 0">{mi([("CheckboxMultipleOutline", "All kinds"), ("FolderMusic", "Albums"), ("Account", "Artists"), ("FileMusic", "Tracks"), ("Radio", "Radio")])}</div>', label='Filter', gap=6),
           'The filter menu becomes a sheet.', h=640)
m3 = phone(pbar('Media', True) + pbody(row(wfind('Search music', 44), ib('FilterVariant', 'Filter'), gap=4), '<div class="col" style="align-items: center; gap: 10px; padding: 40px 12px; text-align: center">'
                                       + f'<span class="sq" style="background: var(--sl2)">{I("Magnify")}</span><span class="tm">No results for "bleu"</span><span class="bm mu">This player searches titles only. Try fewer letters, or build a pattern.</span></div>', gap=10),
           'No results: says what was searched and offers the workbench.', dark=True, h=640)
phone_board(P, 'MediaSearchPhone', 'Media search with the workbench, on a phone', 'The workbench button sits inside the field; the Search button and filter menu shrink so the row fits at 320 px.', [m1, m2, m3],
            [decide('Row: field (with the workbench button inside), then one Filter icon button.', 'Kind chips under the field when the player supports them.'),
             changes('The separate Search button is dropped on phones; Enter or the keyboard\'s search key runs it.', 'The filter menu opens as a sheet below 700 px.')])

# ---------- 21. Media search, wide ----------
mw = window('<div class="col" style="padding: 24px 28px; gap: 16px">' + row('<h2 class="hs grow">Living room speaker</h2>', btn('Browse', 'text', 'FolderOpen', True))
            + row(wfind('Search music, podcasts and radio'), btn('Search', 'tonal', None, True), select('Show', 'All kinds').replace('class="field"', 'class="field" style="width: 200px; height: 48px"'), gap=8)
            + grid(4, *[f'<div class="col" style="gap: 8px"><div style="aspect-ratio: 1; border-radius: 20px; background: var(--sl3); display: grid; place-items: center">{I("FolderMusic", "l")}</div><span class="ll">{t}</span><span class="bs mu">{s}</span></div>'
                        for t, s in [('Blue Train', 'Album'), ('Kind of Blue', 'Album'), ('Blue in Green', 'Track'), ('Blue Nile', 'Artist')]], gap=16) + '</div>', label='Media search')
wide_board(P, 'MediaSearchWide', 'Media search with the workbench, wide', 'Field with the workbench button inside, then Search, then the kind filter as a menu field.', mw,
           [decide('The workbench button is inside the field on every search surface, at the right end, so the row has one field and two controls.', 'Album art is a neutral tile until the player sends a picture; no stock images.')])
