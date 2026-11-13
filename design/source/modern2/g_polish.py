"""Modern remake, group 6: Polish, decisions and dashboard tools (canvases 12, 13, 14 and 21)."""
from ui import *

begin('polish')
P1, P2, P3, P4 = 'polish', 'setup', 'decisions', 'dashtools'
S = 'Settings'
grab = '<div style="width:40px;height:4px;border-radius:2px;background:var(--out);margin:0 auto 12px"></div>'
sh = lambda *parts: f'<div class="sheet">{grab}' + ''.join(parts) + '</div>'


def opt(icon, name, sub, sel=False, t='p'):
    b = 'border:2px solid var(--p);background:var(--pc)' if sel else 'border:1.5px solid var(--out)'
    return (f'<div class="row" style="gap:14px;padding:14px;border-radius:20px;{b}">{ico(icon, t, 40, 13, 20)}'
            f'<div class="col grow" style="gap:2px"><b>{e(name)}</b><span class="sm mu">{e(sub)}</span></div>'
            f'{I("CheckCircle", 22) if sel else ""}</div>')


def keypad(entered=3):
    dots = row(*[f'<span style="width:14px;height:14px;border-radius:7px;background:{"var(--p)" if i < entered else "var(--s3)"};animation:pop .3s {i * 80}ms both"></span>' for i in range(6)], gap=12, style='justify-content:center')
    keys = ''.join(f'<span class="row" style="justify-content:center;height:60px;border-radius:30px;background:var(--s2);font-size:24px;font-weight:500">{k}</span>' for k in '123456789')
    keys += f'<span></span><span class="row" style="justify-content:center;height:60px;border-radius:30px;background:var(--s2);font-size:24px">0</span><span class="row" style="justify-content:center;height:60px">{I("BackspaceOutline", 24)}</span>'
    return dots + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px">{keys}</div>'


# ---------------- 12: workbench, element tools, locks ----------------
wb_body = lambda: (row(*[pill(x, 'p') for x in ['\\b', 'kitchen', '(?:', '_\\w+', ')?', '\\b']], gap=6) + row(*[chip(x, i in (0, 4)) for i, x in enumerate(['Word edge', 'Any letter', 'Digit', 'Optional', 'Ignore case', 'Whole line'])], gap=8, style='flex-wrap:wrap'))
wbp = [phone(search('kitchen', w=330) + card(wb_body(), pad=16, title='Pattern workbench'), 'Entities', S, back=True,
             sheet=sh(lst([('Lightbulb', 'Kitchen', 'light.kitchen', '', 'g'), ('Lightbulb', 'Kitchen counter', 'light.kitchen_counter', '', 'g')], 'Matches'))),
       phone(search('\\bkitchen\\b', w=330) + note('2 matches · flags: i', 'g', 'CheckCircle') + card(code('\\b  word edge\nkitchen  the letters\n(?:_\\w+)?  optional suffix'), pad=16, title='Explain'), 'Entities', S, back=True)]
phone_board('PWorkbenchPhone', 'Pattern workbench on a phone', P1, wbp, caption='Workbench on a phone: chips in a card, matches rise in a sheet, explain in plain words')
wbw = (header('Entities', '128', 'Settings', tools()) + row(search('\\bkitchen(?:_\\w+)?\\b', w=560), btn('Pattern', 'fill', 'Regex'), gap=10) + '<div style="height:16px"></div>'
       + grid('minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)', card(wb_body(), note('Matches 2 of 128.', 'g', 'CheckCircle'), title='Build'), card(code('\\b  word edge\nkitchen  the letters\n(?:_\\w+)?  optional suffix\n\\b  word edge'), title='Explain'),
              lst([('Lightbulb', 'Kitchen', 'light.kitchen', '', 'g'), ('Lightbulb', 'Kitchen counter', 'light.kitchen_counter', '', 'g')], 'Matches')))
page_board('PWorkbenchWide', 'Pattern workbench in a wide window', P1, wbw, caption='Workbench wide: build, explain and matches in three columns')

em_items = [('FormatPaint', 'Edit appearance'), ('LockOutline', 'Lock'), ('History', 'History'), ('ContentCopy', 'Copy'), ('HelpCircleOutline', 'Help for this'), '-', ('EyeOff', 'Hide')]
emp = [phone(card(row(ico('Lightbulb', 'w'), '<b class="grow">Kitchen</b>', switch(1)), pad=16, style='outline:3px solid var(--p);outline-offset:3px;animation:breathe 1.6s infinite') + card(row(ico('Thermostat'), '<b class="grow">Hall</b>', '<b>21°</b>'), pad=16), 'Kitchen', 'Home', sheet=sh('<b class="h3">Kitchen light</b>', menu(em_items, w=330))),
       phone(card(row(ico('Lightbulb', 'w'), '<b class="grow">Kitchen</b>', I('LockOutline', 18), switch(1)), pad=16) + note('Locked. Changes ask to unlock first.', 'p', 'LockOutline'), 'Kitchen', 'Home')]
phone_board('PElementPhone', 'Element tools on a phone, opened by touch and hold', P1, emp, caption='Element tools on a phone: hold to highlight, the menu rises as a sheet')
emw = over(header('Kitchen', '', '', tools()) + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=20) for i, n, t in [('Lightbulb', 'Kitchen', 'w'), ('Thermostat', 'Hall', 'p'), ('Television', 'TV', 't')]]),
           '<div style="position:absolute;left:300px;top:260px;animation:pop .25s both">' + menu(em_items, 'Kitchen light') + '</div>')
page_board('PElementWide', 'Element tools in a wide window', P1, emw, active='Overview', caption='Element tools wide: right-click pops the same menu in place')

methods = [('Numeric', 'PIN', '4 to 8 digits', 0, 'p'), ('FormTextboxPassword', 'Password', 'Any length', 0, 'p'), ('Fingerprint', 'Passkey', 'Face or finger', 1, 't'), ('ShieldKey', 'One-time code', 'From an authenticator', 0, 'w')]
lwp = [phone(steps(['Method', 'Set', 'Test'], 0) + ''.join(opt(*m) for m in methods), 'Lock Settings', S, back=True),
       phone(steps(['Method', 'Set', 'Test'], 2) + f'<div style="display:grid;place-items:center;height:180px;animation:breathe 2s infinite">{ico("Fingerprint", "t", 88, 28, 44)}</div>' + note('Test it once so you know it works.', 't'), 'Lock Settings', S, back=True)]
phone_board('PLockWizardPhone', 'Lock wizard on a phone', P1, lwp, caption='Lock wizard on a phone: one choice per row, then a test')
lww = (header('Lock Settings', 'A speed bump, not security', 'Settings › Locks', tools()) + steps(['Method', 'Set up', 'Test', 'Done'], 0) + '<div style="height:16px"></div>'
       + grid(2, *[opt(*m) for m in methods]) + '<div style="height:16px"></div>' + note('Locks live in this browser only. They keep curious hands out; they are not a password manager.', 'w', 'Alert'))
page_board('PLockWizardWide', 'Lock wizard in a wide window', P1, lww, caption='Lock wizard wide: four methods in a grid and an honest disclosure')

unp = [phone('<div class="h2" style="text-align:center;margin-top:20px">Enter PIN</div><span class="sm mu" style="text-align:center">to open Developer tools</span>' + keypad(3), 'Unlock', 'Settings', top=False),
       phone('<div class="h2" style="text-align:center;margin-top:20px">Enter PIN</div>' + note('Wrong PIN. 2 tries before a 30 s wait.', 'e', 'AlertCircle') + keypad(0), 'Unlock', 'Settings', top=False)]
phone_board('PUnlockPhone', 'Unlock prompt and PIN keypad on a phone', P1, unp, caption='Unlock on a phone: a big keypad, dots that pop, a gentle wrong-PIN note')
unw = over(header('Developer tools', '', '', tools()),
           dialog('Unlock Developer tools', col(field('PIN', '•••', 'Numeric'), lst([('Fingerprint', 'Use passkey', '', I('ChevronRight', 20), 't'), ('Lifebuoy', 'Forgotten your PIN?', 'Support desk', I('ChevronRight', 20), 'n')])),
                  'LockOpenVariant', 'p', actions=btn('Cancel', 'txt') + btn('Unlock', 'fill')))
page_board('PUnlockWide', 'Unlock prompt in a wide window', P1, unw, active='Developer', caption='Unlock wide: PIN field first, the ladder below')

locks = [('Cog', 'Settings', 'Passkey', 't'), ('HammerWrench', 'Developer tools', 'PIN', 'p'), ('Lightbulb', 'Kitchen light', 'PIN', 'w'), ('Tab', 'Energy tab', 'Password', 'g')]
llp = [phone(lst([(i, n, m, ib('DotsVertical'), t) for i, n, m, t in locks], 'Locks'), 'Locks', S, back=True)]
phone_board('PLockListPhone', 'List of locks on a phone', P1, llp, caption='Locks on a phone: one row each, actions behind the dots')
llw = (header('Locks', '4 locks', 'Settings › Locks', row(btn('Add lock', 'fill', 'Plus'), tools(), gap=10))
       + table(['Item', 'Unlocks with', 'Last opened', ''], [[f'<span class="row" style="gap:10px">{ico(i, t, 32, 10, 18)}<b>{n}</b></span>', pill(m, t), 'Today', row(btn('Change', 'txt', size='sm'), btn('Remove', 'txt', size='sm'))] for i, n, m, t in locks], ['1.5fr', '1fr', '1fr', '1.2fr']))
page_board('PLockListWide', 'List of locks in a wide window', P1, llw, caption='Locks wide: a table with Change and Remove')

# ---------------- 13: personal, guided setup, guidance, rail, media ----------------
pers = [('Translate', 'Language', 'Cantonese, playful'), ('EmoticonHappyOutline', 'Playfulness', 'Lots'), ('AccountVoice', 'Narrator', 'On'), ('School', 'School mode', 'Off'), ('ClockOutline', 'Quiet hours', '22:00 to 07:00'), ('Food', 'Dim sum surprise', 'Sometimes')]
php = [phone(lst([(i, n, v, I('ChevronRight', 20), 'p') for i, n, v in pers]), 'Personal', S, back=True)]
phone_board('PPersonalPhone', 'Personal settings on a phone', P2, php, caption='Personal on a phone: every setting a row with its value')
pw = header('Personal', 'Settings just for you', 'Settings', tools()) + tiles([(i, n, v) for i, n, v in pers])
page_board('PPersonalWide', 'Personal settings in a wide window', P2, pw, caption='Personal wide: settings as tiles with their state')

setup = [('Earth', 'Set your country and units', 'Done', 'g'), ('Sofa', 'Add rooms', 'Done', 'g'), ('Devices', 'Add your first device', 'Next', 'p'), ('Robot', 'Make an automation', '', 'n'), ('BackupRestore', 'Turn on backups', '', 'n')]
slp = [phone(card(bar(40), '<span class="sm mu">2 of 5 done</span>', pad=16) + lst([(i, n, s, pill(s, t) if s else '', t) for i, n, s, t in setup]), 'Guided setup', S)]
phone_board('PSetupListPhone', 'Guided setup list on a phone', P2, slp, caption='Setup on a phone: progress on top, five rows')
slw = (header('Guided setup', '2 of 5 done', 'Settings', tools()) + card(bar(40), pad=18) + '<div style="height:16px"></div>'
       + grid(5, *[card(ico(i, t), f'<b>{n}</b>', pill(s, t) if s else btn('Start', 'ton', size='sm'), pad=16) for i, n, s, t in setup]))
page_board('PSetupListWide', 'Guided setup list in a wide window', P2, slw, caption='Setup wide: five cards, done ones marked')

wz = lambda: steps(['Find', 'Name', 'Room', 'Done'], 1)
swp = [phone(wz() + field('Name', 'Hall light') + field('Room', 'Hall') + row(btn('Back', 'txt'), '<span class="grow"></span>', btn('Next', 'fill')), 'Add a device', S, back=True)]
phone_board('PSetupWizardPhone', 'Guided setup wizard on a phone', P2, swp, caption='Wizard on a phone: one field per line, Back and Next at the thumb')
sww = (header('Add a device', 'Step 2 of 4', 'Guided setup', tools()) + wz() + '<div style="height:16px"></div>'
       + grid('1.4fr 1fr', card(field('Name', 'Hall light'), field('Room', 'Hall'), row(btn('Back', 'txt'), btn('Skip', 'txt'), '<span class="grow"></span>', btn('Next', 'fill')), title='Name it'),
              card(ico('Lightbulb', 'w', 72, 24, 36), '<b class="h3">Philips Hue bulb</b>', '<span class="sm mu">Found on the Hue bridge</span>', title='Found')))
page_board('PSetupWizardWide', 'Guided setup wizard in a wide window', P2, sww, caption='Wizard wide: the step and what was found side by side')

gn = note('Your Z-Wave stick must be plugged in first. Not sure? Open Hardware to check.', 't', 'Lightbulb')
gpp = [phone(gn + field('Port', '/dev/ttyUSB0') + btn('Connect', 'fill'), 'Add Z-Wave', S, back=True)]
phone_board('PGuidancePhone', 'Guidance note in setup dialogs, on a phone', P2, gpp, caption='Guidance on a phone: a friendly note above the first field')
gpw = over(header('Integrations', '', '', tools()), dialog('Add Z-Wave', col(gn, field('Port', '/dev/ttyUSB0')), 'ZWave' if False else 'Waves', 'p', actions=btn('Cancel', 'txt') + btn('Connect', 'fill')))
page_board('PGuidanceWide', 'Guidance note in setup dialogs, wide', P2, gpw, caption='Guidance wide: the same note inside the dialog')

rail = header('Developer tools', '', '', tools(), tabs=(['YAML', 'States', 'Actions', 'Template', 'Events'], 1)) + table(['Entity', 'State'], [[f'<span class="mono">{a}</span>', f'<b>{b}</b>'] for a, b in [('light.kitchen', 'on'), ('sensor.hall_temperature', '20.4')]], ['2fr', '1fr'])
board('PRailDev', 'Developer tools on the rail', P2, window(rail, 'Developer', mini=True), caption='Developer tools on the folded rail: one icon, always one tap away')

med = [('Album', 'Dim sum jazz', 'Playlist', 'p'), ('Radio', 'RTHK Radio 2', 'Station', 't'), ('Music', 'Steam and sizzle', 'Track', 'w')]
mpp = [phone(search('^dim.*', w=330) + lst([(i, n, k, ib('Play'), t) for i, n, k, t in med]), 'Media', 'Home', back=True)]
phone_board('PMediaPhone', 'Media search with the workbench, on a phone', P2, mpp, caption='Media search on a phone: patterns work here too')
mpw = (header('Media', 'Search everything', '', tools()) + row(search('^dim.*', w=520), btn('Pattern', 'ton', 'Regex'), chips('All', 'Tracks', 'Stations'), gap=10) + '<div style="height:16px"></div>'
       + grid(3, *[card(f'<div class="thumb" style="height:150px">{I(i, 44)}</div>', f'<b class="h3">{n}</b>', f'<span class="sm mu">{k}</span>', pad=16) for i, n, k, t in med]))
page_board('PMediaWide', 'Media search with the workbench, wide', P2, mpw, active='Media', caption='Media search wide: big art cards under the pattern search')

# ---------------- 14: decisions ----------------
reach = [phone('<div class="grow"></div>' + note('Search, accessibility and New tab sit in the bottom bar, in thumb reach.', 'p'), 'Home', 'Search',
               sheet=sh(row(*[col(ico(i, t, 48, 16, 24), f'<span class="xs">{n}</span>', gap=4, style='align-items:center') for i, n, t in [('Magnify', 'Search', 'p'), ('Human', 'Access', 't'), ('TabPlus', 'New tab', 'w')]], style='justify-content:space-around')))]
phone_board('PDPhoneReach', 'Search, accessibility and New tab on a phone', P3, reach, caption='Reach: the three most used tools in the thumb zone')

tabsp = [phone(grid(2, *[card(f'<div class="thumb" style="height:100px">{I(i, 30)}</div>', f'<b>{n}</b>', pad=12, gap=8) for i, n in [('Home', 'Overview'), ('Map', 'Map'), ('LightningBolt', 'Energy'), ('Calendar', 'Calendar')]], gap=12)
             + btn('Open every tab', 'ton', 'TabPlus'), 'Open pages', 'Pages')]
phone_board('PDPhoneTabs', 'Open pages on a phone, with one hand', P3, tabsp, caption='Tabs on a phone: a grid of page cards, swipe to close')

pick = [phone(card(row(ico('Lightbulb', 'w'), '<b class="grow">Kitchen</b>', switch(1)), pad=16, style='outline:3px dashed var(--p);outline-offset:4px') + note('Tap an element to pick it. Tap again to confirm.', 'p', 'GestureTap'), 'Pick an element', 'Home', back=True)]
phone_board('PDPickTouch', 'Choosing an element by touch', P3, pick, caption='Pick by touch: tap to outline, tap again to confirm')

ar = (header('Replacing blocking boxes', 'alert, confirm and prompt become three kinds', '', tools())
      + table(['Where', 'Today', 'Becomes'], [[a, f'<span class="mono">{b}</span>', pill(c, t)] for a, b, c, t in
                                            [('Filter categories', 'alert()', 'Toast with Details', 'p'), ('Automation trace', 'prompt()', 'Dialog with a field', 't'), ('Dashboard raw editor', 'confirm()', 'Dialog, two buttons', 'w'),
                                             ('Google Assistant settings', 'alert()', 'Toast with Details', 'p'), ('Save dashboard', 'alert()', 'Toast with Details', 'p')]], ['1.4fr', '1fr', '1.2fr']))
page_board('PDAlerts', "Replacing the browser's blocking boxes", P3, ar, caption='Blocking boxes: every alert, confirm and prompt mapped to a kind')

two = [phone(note('Delete 14 backups?', 'e', 'AlertOctagon') + field('Type DELETE', 'DELETE') + '<div style="height:60px;border-radius:30px;background:var(--e);color:#fff;display:grid;place-items:center;font-weight:600;position:relative;overflow:hidden">Hold to delete<span style="position:absolute;left:0;top:0;bottom:0;width:60%;background:rgba(255,255,255,.25);transform-origin:left;animation:widen 1.6s ease-out both"></span></div>', 'Confirm', S, back=True)]
phone_board('PDTwoStep', 'Two-step confirmation on a phone', P3, two, caption='Two steps on a phone: type the word, then hold the button')

lm1 = (header('Locks still to build, part 1', 'Tabs, single appearance values, many at once, search', '', tools())
       + grid(2, card(row(*[pill(x, 'p' if i < 2 else 'n') for i, x in enumerate(['Home', 'Energy', 'Map', 'Activity'])], gap=6), note('A locked tab cannot be closed or moved.', 'p', 'LockOutline'), title='Locked tabs and groups'),
              card(field('Text size', '16 px, locked', 'LockOutline'), title='Lock one appearance value'),
              card(actionbar(abtn('Lock', 'LockOutline', True), abtn('Unlock', 'LockOpenVariant'), note='4 selected'), '<span class="sm mu">One wizard for all four.</span>', title='Lock many at once', style='position:relative;min-height:160px'),
              card(lst([('Lightbulb', 'Kitchen lights', 'Locked', I('LockOutline', 18), 'w')]), title='Locked items in search')))
page_board('PDLocks1', 'Locks still to build, part 1', P3, lm1, caption='Locks part 1: tabs, one value, many at once, search')

lm2 = (header('Locks still to build, part 2', 'QR code, support desk, locked on start', '', tools())
       + grid(3, card('<div style="width:160px;height:160px;border-radius:16px;background:repeating-conic-gradient(var(--on) 0 25%,var(--s1) 0 50%) 0 0/16px 16px;margin:0 auto"></div>', '<span class="mono sm" style="text-align:center">JBSW Y3DP EHPK 3PXP</span>', title='QR for one-time codes'),
              card(note('Locks live only in this browser and cannot be recovered.', 'w'), *[row(pill(str(n), 'p'), x) for n, x in [(1, 'Open site settings'), (2, 'Clear this site\'s data'), (3, 'Every lock is removed')]], title='Forgotten your password?'),
              card(f'<div style="display:grid;place-items:center;height:140px;border-radius:20px;background:#1b1b22;color:#fff">{I("LockOutline", 44)}</div>', btn('Unlock', 'fill'), title='Locked on start')))
page_board('PDLocks2', 'Locks still to build, part 2', P3, lm2, caption='Locks part 2: QR drawn on the device, an honest desk, locked on start')

wm = (header('Pattern workbench, gaps', 'Dialects, trace, files, encoding, layout', '', tools())
      + grid(2, card(field('Write in', 'JavaScript'), field('Convert to', 'Python re'), code('r"\\bkitchen(?:_\\w+)?\\b", re.I'), title='Dialects and converting'),
             card(*[row(pill(str(n), 't'), f'<span class="mono sm">{x}</span>') for n, x in [(1, '\\b at 0: word edge'), (2, 'kitchen at 0 to 7'), (3, '(_\\w+)? at 7: _counter'), (4, '\\b at 15: word edge')]], title='Step-by-step trace', gap=8),
             card(field('Files', 'configuration.yaml, automations.yaml'), code('automations.yaml:42  light.kitchen_counter'), title='Search files'),
             card(row(field('Encoding', 'UTF-8'), field('Line breaks', 'LF'), gap=10), '<span class="sm mu">Drag sections by their handle to rearrange.</span>', title='Encoding and layout')))
page_board('PDWorkbench', 'Pattern workbench, gaps against the reference tool', P3, wm, caption='Workbench gaps: four cards, one per missing capability')

smw = (header('Settings controls still to build', '', '', tools())
       + grid(2, card(note('Backup finished, 3.2 GB on this machine.', 'g', 'PartyPopper'), row('<b class="grow">Emoji in dialog titles</b>', switch(1)), title='Emoji in dialogs'),
              card('<span>Your changes were saved.</span>', '<span class="onv">Saved! Snug and proud.<br>搞掂晒！</span>', title='Language mode in real text'),
              card(row(field('From', '22:00'), field('To', '07:00'), gap=10), row(*[chip(d, d not in ('Sat', 'Sun')) for d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']], gap=6), title='Quiet hours'),
              card(lrow('ClockOutline', 'Low stimulation on school nights', 'Sun to Thu, 20:00 to 07:00', switch(1), 't'), title='Scheduled settings')))
page_board('PDSettings', 'Settings controls still to build', P3, smw, caption='Settings to build: emoji, language in real text, quiet hours, schedules')

# ---------------- 21: dashboard tools ----------------
dtt = lambda i: seg(['Outline', 'Replace', 'Check', 'Templates', 'Statistics', 'Preview width'], i)
dash = lambda: grid(3, *[card(ico(i, t), f'<b>{n}</b>', pad=16) for i, n, t in [('Lightbulb', 'Kitchen', 'w'), ('Thermostat', 'Hall', 'p'), ('Television', 'TV', 't')]])
dlg = lambda body, i: f'<div class="dlg" style="width:640px;position:absolute;right:30px;top:30px;bottom:30px;animation:slidein .4s both">{header("Dashboard tools", "Every change can be undone", "", ib("Close"))}{dtt(i)}<div class="col" style="gap:14px;margin-top:16px">{body}</div></div>'
ol = dlg(lst([('ViewDashboard', 'Home view', '3 sections', '', 'p'), ('ViewGrid', 'Kitchen section', '4 cards', '', 't'), ('CardOutline', 'Tile: Kitchen light', 'light.kitchen', I('CheckboxMarked', 22), 'w'), ('CardOutline', 'Tile: Hall', 'sensor.hall', I('CheckboxMarked', 22), 'w')])
         + actionbar(abtn('Move', 'ArrowAll'), abtn('Duplicate', 'ContentCopy'), abtn('Delete', 'Delete'), note='2 selected'), 0)
page_board('PDashOutline', 'Dashboard tools: outline and bulk actions', P4, f'<div style="position:relative;height:100%">{header("Home", "Editing", "", tools())}{dash()}{ol}</div>', active='Overview', caption='Outline: the whole tree, tick cards, act on them together')
rc = dlg(card(field('Find', 'light.kitchen', mono=True), field('Replace with', 'light.kitchen_main', mono=True), btn('Replace in 4 cards', 'fill'), title='Find and replace')
         + card(note('2 cards use entities that no longer exist.', 'w', 'Alert'), lrow('CardOutline', 'Tile: Old garage', 'sensor.old_garage', btn('Fix', 'ton', size='sm'), 'e'), title='Check'), 1)
page_board('PDashReplace', 'Dashboard tools: find and replace, and the check', P4, f'<div style="position:relative;height:100%">{header("Home", "Editing", "", tools())}{dash()}{rc}</div>', active='Overview', caption='Replace and check: swap an entity everywhere, fix what broke')
ts = dlg(card(field('Template name', 'Room header'), btn('Save 2 cards', 'fill'), title='Templates')
         + lst([('Bookmark', 'Room header', '2 cards', btn('Insert', 'ton', size='sm'), 'p'), ('Bookmark', 'Energy summary', '3 cards', btn('Insert', 'ton', size='sm'), 'g')])
         + stats(('3', 'Views', 'p', 'ViewDashboard'), ('26', 'Cards', 't', 'CardOutline'), ('19', 'Entities', 'w', 'Shape')) + seg(['Full', 'Phone', 'Tablet', 'Desktop'], 1), 3)
page_board('PDashTemplates', 'Dashboard tools: templates, statistics and the preview width', P4, f'<div style="position:relative;height:100%">{header("Home", "Editing", "", tools())}{dash()}{ts}</div>', active='Overview', caption='Templates, statistics and preview width in one panel')
dtp = [phone(card(ico('Lightbulb', 'w'), '<b>Kitchen</b>', pad=14), 'Home', 'Home', sheet=sh(dtt(0), lst([('ViewGrid', 'Kitchen section', '4 cards', '', 't'), ('CardOutline', 'Tile: Kitchen light', '', I('CheckboxMarked', 22), 'w')])))]
phone_board('PDashPhone', 'Dashboard tools on a phone', P4, dtp, caption='Dashboard tools on a phone: the panel becomes a sheet, nothing dropped')

write_index('Home Assistant Material, modern: Polish, decisions and dashboard tools',
            [(P1, 'Polish: workbench, element tools, locks'), (P2, 'Polish: personal, guided setup, guidance, rail, media'), (P3, 'Decisions: phone reach, blocking boxes, locks and workbench gaps'), (P4, 'Dashboard tools')], 'PWorkbenchPhone')
