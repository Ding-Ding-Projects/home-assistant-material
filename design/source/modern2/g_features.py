"""Modern remake, group 5: Features (canvases 09, 10 and 11) plus the motion editor."""
from ui import *

begin('features')
P1, P2, P3 = 'language', 'everywhere', 'tools'
S = 'Settings'


def opt(icon, name, sub, sel=False, t='p'):
    b = 'border:2px solid var(--p);background:var(--pc)' if sel else 'border:1.5px solid var(--out)'
    return (f'<div class="row" style="gap:14px;padding:16px;border-radius:20px;{b}">{ico(icon, t, 44, 14, 22)}'
            f'<div class="col grow" style="gap:2px"><b>{e(name)}</b><span class="sm mu">{e(sub)}</span></div>'
            f'{I("CheckCircle", 22) if sel else ""}</div>')


def events(rows):
    out = ''
    for i, (when, what, who) in enumerate(rows):
        dot = 'var(--p)' if i == 0 else 'var(--out)'
        out += (f'<div class="row" style="gap:16px;align-items:flex-start;animation:rise .5s {i * 70}ms both"><span class="mono sm mu" style="width:90px;padding-top:14px">{e(when)}</span>'
                f'<span style="width:14px;height:14px;border-radius:7px;background:{dot};margin-top:16px;flex:none"></span>'
                f'<div class="card col grow" style="padding:14px 18px;gap:2px"><b>{e(what)}</b><span class="sm mu">{e(who)}</span></div></div>')
    return f'<div class="col" style="gap:10px">{out}</div>'


def swrow(name, sub, on=True):
    return row(col(f'<b>{e(name)}</b>', f'<span class="sm mu">{e(sub)}</span>', gap=2, style='flex:1'), switch(on))


# ---------------- 09: language, playfulness, appearance ----------------
lang = (header('Language and playfulness', 'How the app talks to you', 'Settings › Personal', tools())
        + grid('1.2fr 1fr', card(opt('Translate', 'English', 'Plain and clear'), opt('Translate', 'Cantonese, playful', 'Hong Kong style, with jokes', True, 't'), opt('Translate', 'Both side by side', 'English with Cantonese under it'), title='Language mode'),
               card(f'<b class="h3">Playfulness</b>', slider(70, 't'), row(*[f'<span class="sm mu">{x}</span>' for x in ['Calm', 'Some', 'Lots', 'Silly']], style='justify-content:space-between'),
                    note('Preview: "The kitchen lights are off now, sleep well, dim sum dreams."', 't', 'EmoticonHappyOutline'), title='How funny')))
page_board('M09Language', 'Language modes and playfulness', P1, lang, caption='Language: three modes as big choices, playfulness as a slider with a live preview')

word = (header('Personal wording', 'Your own words for anything the app says', 'Settings › Personal', row(btn('Import file', 'out', 'Upload'), tools(), gap=10))
        + grid('1.3fr 1fr', table(['App says', 'You say', ''], [[f'<span class="mono">{a}</span>', f'<b>{b}</b>', ib('Pencil')] for a, b in
                                                                [('Dashboard', 'Board'), ('Automation', 'Robot'), ('Turn off', 'Lights out'), ('Area', 'Room')]], ['1fr', '1fr', '60px']),
               card(f'<div class="empty-art" style="height:180px;border:2px dashed var(--p);border-radius:24px;display:grid;place-items:center;animation:breathe 2.4s ease-in-out infinite">{I("FileDownloadOutline", 44)}</div>',
                    '<b class="h3" style="text-align:center">Drop a wording file here</b>', note('4 words applied. Confetti!', 'g', 'PartyPopper'), title='Drop to apply')))
page_board('M09Wording', 'Personal wording file and drop celebration', P1, word, caption='Wording: a table of swaps, a breathing drop zone that celebrates')

narr = (header('Narrator and sounds', 'Hear what happens', 'Settings › Accessibility', tools())
        + grid(2, card(swrow('Spoken narrator', 'Reads headings, buttons and changes aloud'), field('Voice', 'Piper · Amy', 'AccountVoice'), field('Speed', '1.1×'), btn('Hear a sample', 'ton', 'Play'), title='Narrator'),
               card(*[row(ico(i, t, 36, 12, 18), f'<b class="grow">{n}</b>', switch(o)) for i, n, o, t in
                      [('VolumeHigh', 'Click', 1, 'p'), ('CheckCircle', 'Success chime', 1, 'g'), ('AlertCircle', 'Error buzz', 1, 'e'), ('Bell', 'Notification', 0, 'w')]], title='Action sounds', gap=10)))
page_board('M09Narrator', 'Spoken narrator and action sounds', P1, narr, caption='Narrator and sounds: one card each, every sound its own switch')

focus = (header('Focus modes', 'Quiet the app for a while', 'Settings › Personal', tools())
         + grid(3, *[card(ico(i, t, 56, 18, 28), f'<b class="h3">{n}</b>', f'<span class="sm mu">{d}</span>', switch(o), pad=20) for i, n, d, o, t in
                     [('School', 'School mode', 'Hides settings and developer tools, keeps lights and media', 1, 't'), ('Target', 'Deep focus', 'Silences toasts, keeps alarms', 0, 'p'), ('WeatherNight', 'Bedtime', 'Dims the app and mutes sounds', 0, 'w')]])
         + '<div style="height:16px"></div>' + note('School mode is on until 15:30. Ends by itself.', 't', 'ClockOutline'))
page_board('M09Focus', 'School mode and focus modes', P1, focus, caption='Focus modes: three cards, the active one says when it ends')

sched = (header('Scheduled settings', 'Change settings by time of day', 'Settings › Personal', row(btn('Add schedule', 'fill', 'Plus'), tools(), gap=10))
         + events([('07:00', 'Light theme, playful', 'Every weekday'), ('08:30', 'School mode on', 'Monday to Friday'), ('15:30', 'School mode off', 'Monday to Friday'), ('21:00', 'Dark theme, calm, quiet sounds', 'Every day')]))
page_board('M09Schedule', 'Scheduled settings', P1, sched, caption='Schedules: a day timeline of setting changes')

rn = (header('Name and logo', 'Make the app yours', 'Settings › Personal', tools())
      + grid('1fr 1fr', card(field('App name', 'Dim Sum Home'), field('Short name', 'Home'), row(*[f'<span class="logo" style="width:56px;height:56px;border-radius:18px;{s}">{I(i, 28)}</span>' for i, s in
                                                                                                [('Home', ''), ('Food', 'background:var(--t)'), ('Heart', 'background:var(--e)'), ('Star', 'background:var(--w)')]], gap=12), btn('Upload a logo', 'out', 'Upload'), title='Name and logo'),
             card(f'<div class="row" style="gap:14px;padding:18px;border-radius:20px;background:var(--s2);animation:pop .6s both"><span class="logo" style="width:56px;height:56px;border-radius:18px;background:var(--t)">{I("Food", 28)}</span><div class="col"><b class="h2">Dim Sum Home</b><span class="sm mu">Home Assistant</span></div></div>',
                  note('Shown in the rail, the window title and the installed app.', 'p'), title='Preview')))
page_board('M09Rename', 'Renaming the app and its logo', P1, rn, caption='Rename: fields on the left, the new identity popping in on the right')

ds = (header('Dim sum surprise', 'A little treat now and then', 'Settings › Personal', tools())
      + grid('1fr 1.2fr', card(swrow('Surprises', 'Show a dim sum after finishing something'), field('How often', 'Sometimes'), swrow('Sound', 'A soft steam hiss', False), title='Surprise'),
             card(f'<div style="height:240px;border-radius:24px;background:var(--wc);display:grid;place-items:center;animation:float 3s ease-in-out infinite">{I("Food", 96)}</div>',
                  '<b class="h2" style="text-align:center">Har gow!</b>', '<span class="sm mu" style="text-align:center">Shrimp dumpling, see it in Dim Sum Atlas</span>', title='Preview')))
page_board('M09DimSum', 'Dim sum surprise', P1, ds, caption='Surprise: settings, and the floating dumpling it shows')

typ = (header('Edit appearance: type', 'Word-level control over text', 'Settings › Appearance', tools(), tabs=(['Type', 'Fills', 'Colour', 'Fonts', 'Motion'], 0))
       + grid('1fr 1.3fr', card(field('Font', 'Google Sans Flex'), field('Size', '16 px'), field('Weight', '500'), field('Line height', '1.5'), field('Letter spacing', '0'), row(*[ib(i) for i in ['FormatBold', 'FormatItalic', 'FormatUnderline', 'FormatAlignLeft', 'FormatAlignCenter']], gap=4), title='Body text'),
              card('<div class="disp">Good afternoon</div>', '<div class="h2">Living room</div>', '<p class="onv" style="margin:0;font-size:16px;line-height:1.5">Five lights are on and the front door is unlocked.</p>', '<span class="sm mu">Caption, 12 px</span>', title='Preview')))
page_board('M09Type', 'Edit appearance, type at Word depth', P1, typ, caption='Type: every text property like a word processor, a live sample beside it')

fills = (header('Edit appearance: fills', 'Layers on any surface', 'Settings › Appearance', tools(), tabs=(['Type', 'Fills', 'Colour', 'Fonts', 'Motion'], 1))
         + grid('1fr 1.3fr', lst([('Square', 'Solid · surface', '100%', ib('Eye'), 'n'), ('GradientHorizontal', 'Linear · coral to teal', '40%', ib('Eye'), 't'), ('Grain', 'Noise', '8%', ib('EyeOff'), 'n'), ('Image', 'Photo', '20%', ib('Eye'), 'w')], 'Layers', btn('Add layer', 'ton', 'Plus', 'sm')),
                card('<div style="height:300px;border-radius:24px;background:linear-gradient(135deg,color-mix(in srgb,var(--e) 40%,var(--s1)),color-mix(in srgb,var(--t) 40%,var(--s1)));animation:fade 1s both"></div>', title='Card preview')))
page_board('M09Fills', 'Edit appearance, layered fills', P1, fills, caption='Fills: a layer list like a design tool, the preview on the right')

colour = (header('Colour', 'Any colour, in any format', 'Settings › Appearance', tools(), tabs=(['Type', 'Fills', 'Colour', 'Fonts', 'Motion'], 2))
          + grid('1.1fr 1fr', card('<div style="height:260px;border-radius:20px;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,#e8735a)"></div>',
                                   '<div style="height:16px;border-radius:8px;background:linear-gradient(90deg,red,#ff0,lime,cyan,blue,#f0f,red)"></div>', title='Pick'),
                 card(kv([('HEX', '#E8735A'), ('RGB', '232 115 90'), ('HSL', '11° 75% 63%'), ('OKLCH', '0.68 0.14 37'), ('Name', 'Coral')]), field('Paste any colour', 'tomato'), title='Translate')))
page_board('M09Colour', 'Infinite colour picker and translator', P1, colour, caption='Colour: an open picker, every format translated live')

fonts = (header('Fonts and type scale', '', 'Settings › Appearance', tools(), tabs=(['Type', 'Fills', 'Colour', 'Fonts', 'Motion'], 3))
         + grid('1fr 1.3fr', lst([('FormatFont', 'Google Sans Flex', 'Built in', pill('In use', 'p'), 'p'), ('FormatFont', 'Atkinson Hyperlegible', 'Built in', '', 't'), ('FormatFont', 'Fraunces', 'Built in', '', 'w'), ('Upload', 'Add a font file', '.ttf, .otf, .woff2', '', 'n')], 'Fonts'),
                card(*[row(f'<span class="mono sm mu" style="width:90px">{n}</span>', f'<span style="font-size:{s}px;font-weight:{w}">Aa {n}</span>') for n, s, w in
                       [('Display', 44, 500), ('Headline', 30, 500), ('Title', 22, 600), ('Body', 16, 400), ('Label', 13, 600)]], title='Scale', gap=10)))
page_board('M09Fonts', 'Fonts and type scale', P1, fonts, caption='Fonts: a list and the full scale in one view')

a11y = (header('Accessibility tools', 'Available on every page', 'Settings › Accessibility', tools())
        + tiles([('MagnifyPlus', 'Zoom', '125%'), ('Contrast', 'High contrast', 'Off'), ('FormatSize', 'Larger text', 'On'), ('Keyboard', 'Keyboard map', 'Every shortcut'),
                 ('MotionPause', 'Reduce motion', 'Follows system'), ('CursorDefault', 'Big pointer', 'Off'), ('AccountVoice', 'Narrator', 'On'), ('FocusField', 'Focus rings', 'Always')]))
page_board('M09A11y', 'Accessibility tools everywhere', P1, a11y, caption='Accessibility: every tool as a tile with its state')

rz = (header('Resizable panels', 'Drag any edge, fold any filter', 'Settings › Devices', tools())
      + grid('300px 14px 1fr', card(*[row(I('ChevronDown', 18), f'<b class="grow">{n}</b>', pill(c)) for n, c in [('Integration', '3'), ('Area', '1'), ('Status', '0')]], title='Filters', gap=10),
             '<div style="width:6px;border-radius:3px;background:var(--p);margin:auto;height:120px;animation:breathe 1.8s infinite"></div>',
             table(['Device', 'Area', 'Integration'], [[f'<b>{a}</b>', b, c] for a, b, c in [('Hue bridge', 'Hall', 'Philips Hue'), ('Ecobee', 'Living room', 'HomeKit'), ('Front door lock', 'Hall', 'Z-Wave')]], ['1.4fr', '1fr', '1fr'])))
page_board('M09Resize', 'Resizable panels and folding filters', P1, rz, caption='Resize: a glowing grab handle between folding filters and the table')

tok = (header('Material Design 3 tokens', 'Every token, editable', 'Settings › Appearance', tools())
       + grid(4, *[card(f'<div style="height:72px;border-radius:16px;background:var({v})"></div>', f'<b>{n}</b>', f'<span class="mono xs mu">{v}</span>', pad=14, gap=8) for n, v in
                   [('Primary', '--p'), ('Primary container', '--pc'), ('Tertiary', '--t'), ('Error', '--e'), ('Surface', '--s1'), ('Surface high', '--s2'), ('Outline', '--out'), ('Warning', '--w')]]))
page_board('M09Tokens', 'Material Design 3 tokens', P1, tok, caption='Tokens: swatches in a grid, each with its name')

# ---------------- 10: everywhere features ----------------
tabsb = (header('New tab', 'Every page, one click away', '', row(btn('Open every tab', 'fill', 'TabPlus'), tools(), gap=10))
         + row(search('Search pages', w=520), chips('All', 'Pages', 'Settings', 'Tools'), gap=10) + '<div style="height:16px"></div>'
         + tiles([('Home', 'Overview', 'Open'), ('Map', 'Map', 'Open'), ('LightningBolt', 'Energy', 'Closed'), ('Calendar', 'Calendar', 'Open'), ('Minecraft' if False else 'Cube', 'Minecraft', 'Closed'), ('Robot', 'Automations', 'Open')]))
page_board('M10NewTab', 'Every tab open, and the New tab catalog', P2, tabsb, active='New tab', caption='New tab: a searchable catalog, closed tabs come back with one click')

cp = over(header('Overview', '', '', tools()) + tiles([('Lightbulb', 'Lights', '5 on'), ('Lock', 'Doors', '2 unlocked'), ('Thermostat', 'Climate', '21°')]),
          f'<div class="dlg" style="width:720px;animation:pop .35s both">{search("dark", "Ctrl Shift F", 660)}'
          + lst([('ThemeLightDark', 'Theme', 'Appearance › Theme', seg(['Light', 'Dark', 'Auto'], 1), 'p'), ('WeatherNight', 'Dark dashboard background', 'Appearance', switch(1), 't'),
                 ('Contrast', 'High contrast in the dark', 'Accessibility', switch(0), 'w'), ('ArrowRight', 'Go to Appearance', 'Teleport to the exact control', '', 'n')]) + '</div>')
page_board('M10Palette', 'Command palette with live controls', P2, cp, active='Overview', caption='Palette: Ctrl Shift F, live switches right in the results')

rx = (header('Devices', '', 'Settings › Devices', tools()) + row(search('^Living.*(lamp|light)$', w=520), btn('Pattern', 'ton', 'Regex'), gap=10) + '<div style="height:16px"></div>'
      + grid('1.3fr 1fr', card(row(*[pill(x, 'p') for x in ['^', 'Living', '.*', '(', 'lamp', '|', 'light', ')', '$']], gap=6), row(*[chip(x) for x in ['Starts with', 'Any text', 'One of', 'Ends with', 'Digit', 'Ignore case']], gap=8),
                               note('Matches 3 of 42 devices.', 'g', 'CheckCircle'), title='Pattern workbench'),
             lst([('Lightbulb', 'Living room light', 'Match', '', 'g'), ('Lamp', 'Living room lamp', 'Match', '', 'g'), ('Lightbulb', 'Living room ceiling light', 'Match', '', 'g')], 'Matches')))
page_board('M10Regex', 'Pattern workbench on every search', P2, rx, caption='Pattern workbench: build the pattern from chips, see matches live')

ctx = over(header('Living room', '', '', tools()) + grid(3, *[card(ico(i, t), f'<b class="h3">{n}</b>', pad=20) for i, n, t in [('Lightbulb', 'Ceiling', 'w'), ('Lamp', 'Lamp', 'w'), ('Television', 'TV', 'p')]]),
           f'<div style="position:absolute;left:320px;top:280px;animation:pop .25s both">' + menu([('Pencil', 'Edit', 'E'), ('ContentCopy', 'Copy', 'Ctrl C'), ('History', 'History'), ('ShareVariant', 'Share'), ('HelpCircleOutline', 'Help for this'), '-', ('Delete', 'Remove', 'danger')], 'Ceiling') + '</div>')
page_board('M10Context', 'Context menu on every element', P2, ctx, active='Overview', caption='Context menu: right-click anything, it pops open in place')

gf = (header('New automation', 'Guided', 'Settings › Automations', tools()) + steps(['When', 'If', 'Then', 'Name'], 0) + '<div style="height:16px"></div>'
      + grid('1.4fr 1fr', card(field('When', 'The sun sets'), field('Offset', '−15 minutes'), row(btn('Back', 'txt'), '<span class="grow"></span>', btn('Next', 'fill')), title='Step 1'),
             card(ico('HelpCircle', 't'), '<b class="h3">Offset</b>', '<span class="onv">Run a little earlier or later than sunset. Negative means before.</span>', btn('Read more', 'txt'), title='Help for this control')))
page_board('M10Guided', 'Guided forms and per-control help', P2, gf, caption='Guided forms: a stepper with help for the focused control')

ext = (header('Extensions', '4 installed', 'Settings › Extensions', row(btn('Add extension', 'fill', 'Plus'), tools(), gap=10))
       + grid('1.3fr 1fr', lst([('PuzzleOutline', 'Weather cards', 'v1.4 · built in', switch(1), 'p'), ('PuzzleOutline', 'Dim sum timer', 'v0.9 · built in', switch(1), 't'), ('PuzzleOutline', 'Room planner', 'v2.0 · added', switch(0), 'w')], 'Installed'),
              card(ico('ShieldAlert', 'w'), '<b class="h3">Room planner wants new permissions</b>', *[row(I('CheckCircleOutline', 18), x) for x in ['Read areas and devices', 'Write files in its folder']],
                   row(btn('Deny', 'txt'), '<span class="grow"></span>', btn('Allow', 'fill')), title='Consent')))
page_board('M10Extensions', 'Extension manager and permission consent', P2, ext, caption='Extensions: a manager list, consent asked when permissions change')

blank = (header('New dashboard', 'Start from something', 'Settings › Dashboards', tools())
         + grid(3, *[card(f'<div class="thumb" style="height:140px">{I(i, 40)}</div>', f'<b class="h3">{n}</b>', f'<span class="sm mu">{d}</span>', pad=18) for i, n, d in
                     [('ViewDashboard', 'By area', 'One section per room'), ('Lightbulb', 'Lights only', 'Every light, grouped'), ('LightningBolt', 'Energy', 'Usage and solar'),
                      ('Cellphone', 'Phone first', 'Big buttons, one column'), ('Tablet', 'Wall tablet', 'Clock and weather'), ('FileOutline', 'Blank', 'Nothing yet')]]))
page_board('M10Starts', 'Starting points for a blank editor', P2, blank, caption='Starting points: six thumbnails, blank last')

sc = over(header('Backups', '', '', tools()) + tiles([('BackupRestore', 'Today 03:00', '1.2 GB')]),
          dialog('Delete every backup?', col(note('This cannot be undone. 14 backups, 18 GB.', 'e', 'AlertOctagon'), field('Type DELETE to confirm', 'DELE', raw=False),
                                             row('<span class="kbd">Hold Shift</span>', '<span class="sm mu">and press Delete</span>', gap=8)),
                 'AlertOctagon', 'e', actions=btn('Cancel', 'txt') + btn('Delete all', 'fill')))
page_board('M10Super', 'Two-key super confirmation', P2, sc, caption='Super confirmation: a typed word and a held key')

lockw = (header('Lock this page', 'Choose how to unlock it', 'Settings › Locks', tools()) + steps(['Method', 'Set up', 'Test', 'Done'], 0) + '<div style="height:16px"></div>'
         + grid(3, *[opt(i, n, d, s, t) for i, n, d, s, t in [('Numeric', 'PIN', '4 to 8 digits', 0, 'p'), ('FormTextboxPassword', 'Password', 'Any length', 0, 'p'), ('Fingerprint', 'Passkey', 'Face or finger', 1, 't'),
                                                             ('ShieldKey', 'Authenticator code', '6 digits', 0, 'w'), ('Pattern' if False else 'Gesture', 'Pattern', 'Draw a shape', 0, 'p'), ('KeyChain', 'Passkey and PIN', 'Both needed', 0, 'g')]]))
page_board('M10LockWizard', 'Toy lock wizard, six credential mixes', P2, lockw, caption='Lock wizard: six ways to unlock, picked as big cards')

unl = over(header('Developer tools', '', '', tools()),
           dialog('Unlock Developer tools', col(f'<div style="display:grid;place-items:center;height:120px;animation:breathe 2s infinite">{ico("Fingerprint", "t", 88, 28, 44)}</div>',
                                                '<span class="onv" style="text-align:center">Touch your passkey</span>', lst([('Numeric', 'Use PIN instead', '', I('ChevronRight', 20), 'p'), ('ShieldKey', 'Use authenticator', '', I('ChevronRight', 20), 'w'), ('Lifebuoy', 'Get help', 'Support ticket', I('ChevronRight', 20), 'n')])),
                  'LockOpenVariant', 't', actions=btn('Cancel', 'txt')))
page_board('M10Unlock', 'Unlock prompt and the unlock ladder', P2, unl, active='Developer', caption='Unlock: passkey first, then the ladder of fallbacks')

tk = (header('Support tickets', 'Recovery desk', 'Settings › Locks', row(btn('New ticket', 'fill', 'Plus'), tools(), gap=10))
      + table(['Ticket', 'Who', 'Asked for', 'Status', ''], [[f'<b>{a}</b>', avatar(b, t, 30), c, pill(d, dt), btn('Open', 'txt', size='sm')] for a, b, t, c, d, dt in
                                                          [('#14', 'AL', 'g', 'Unlock Settings', 'Waiting', 'w'), ('#13', 'SK', 'w', 'Reset PIN', 'Approved', 'g'), ('#12', 'AL', 'g', 'New passkey', 'Closed', 'n')]], ['80px', '80px', '1.4fr', '1fr', '80px']))
page_board('M10Tickets', 'Support Tickets recovery desk', P2, tk, caption='Tickets: who asked, for what, and where it stands')

auth = (header('Authenticator', 'Codes for your accounts', 'Settings › Locks', row(btn('Add account', 'fill', 'Plus'), tools(), gap=10))
        + grid(3, *[card(row(ico(i, t), f'<b class="grow">{n}</b>', ib('ContentCopy')), f'<div class="mono" style="font-size:34px;letter-spacing:4px">{c}</div>', bar(p, t), pad=20) for i, n, c, p, t in
                    [('Home', 'Home Assistant', '482 913', 70, 'p'), ('Github', 'Forge', '120 455', 70, 't'), ('Email', 'Mail', '993 201', 70, 'w')]]))
page_board('M10Authenticator', 'Built-in authenticator', P2, auth, caption='Authenticator: big codes with a draining timer bar')

qr = over(header('Authenticator', '', '', tools()),
          dialog('Pair an authenticator', grid('200px 1fr', '<div style="width:200px;height:200px;border-radius:20px;background:repeating-conic-gradient(var(--on) 0 25%,var(--s1) 0 50%) 0 0/20px 20px;animation:pop .5s both"></div>',
                                               col(*[row(pill(str(n), 'p'), x) for n, x in [(1, 'Open your authenticator app'), (2, 'Scan this code'), (3, 'Type the 6 digits it shows')]], field('Code', '482 9'))),
                 'QrcodeScan', 'p', w=640, actions=btn('Cancel', 'txt') + btn('Pair', 'fill')))
page_board('M10QR', 'QR pairing for an authenticator', P2, qr, caption='QR pairing: the code and three numbered steps')

# ---------------- 11: tools ----------------
hist = (header('Version history', 'Living room dashboard', 'Dashboards', row(btn('Restore', 'fill', 'Restore'), tools(), gap=10))
        + grid('1fr 1.3fr', events([('Now', 'Moved the TV card', 'You'), ('10:12', 'Added Lamp', 'You'), ('Yesterday', 'Renamed to Living room', 'Alex'), ('Monday', 'Created', 'You')]),
               card(code('- type: tile\n  entity: light.lamp\n+ - type: media\n+   entity: media_player.tv'), row(pill('2 changes', 'p'), pill('Local only', 't')), title='Compare with now')))
page_board('M11History', 'Local version history', P3, hist, active='Overview', caption='History: a timeline and a diff with now')

exp = (header('Export everything', '', 'Settings › System', tools())
       + grid('1fr 1fr', card(*[row(I('CheckboxMarked', 22), f'<span class="grow">{n}</span>', f'<span class="sm mu">{s}</span>') for n, s in [('Dashboards', '6'), ('Automations', '24'), ('Settings', 'All'), ('Wording file', '1')]], title='What', gap=10),
              card(row(*[chip(x, i == 1) for i, x in enumerate(['JSON', 'YAML', 'CSV', 'Markdown', 'PDF', 'ZIP'])], gap=8), bar(64), '<span class="sm mu">Packing… 64%</span>', btn('Export', 'fill', 'Download'), title='Format')))
page_board('M11Export', 'Export everything, every format', P3, exp, caption='Export: what on the left, format and progress on the right')

bulk = (header('Entities', '42', 'Settings', tools()) + table(['Entity', 'Area', 'Status'], [[f'<b>{a}</b>', b, pill(c, t)] for s, a, b, c, t in
                                                                                              [(1, 'Ceiling', 'Living room', 'On', 'g'), (1, 'Lamp', 'Living room', 'Off', 'n'), (0, 'Hall', 'Hall', 'On', 'g'), (1, 'Porch', 'Outside', 'Unavailable', 'e')]], ['1.4fr', '1fr', '1fr'], sel={0, 1, 3})
        + actionbar(abtn('Area', 'Sofa'), abtn('Label', 'Label'), abtn('Hide', 'EyeOff'), abtn('Delete', 'Delete'), note='3 selected'))
page_board('M11Bulk', 'Bulk actions on any list', P3, bulk, caption='Bulk: tick rows, a floating bar rises with the actions')

chg = (header('Changelog', '', 'Settings › About', row(field('From', '1 Nov'), field('To', '12 Nov'), tools(), gap=10))
       + events([('12 Nov', 'Tab strip floats and collapses', 'New'), ('10 Nov', 'Dashboard tools dialog', 'New'), ('7 Nov', 'Faster pattern search', 'Better'), ('3 Nov', 'Fixed toast overlap on phones', 'Fixed')]))
page_board('M11Changelog', 'Changelog viewer with date range', P3, chg, caption='Changelog: a date range and a timeline')

hlp = (header('Help', 'Works offline', '', tools()) + row(search('How do I…', w=520), gap=10) + '<div style="height:16px"></div>'
       + grid('1fr 1.4fr', lst([('BookOpenVariant', 'Getting started', '5 min', '', 'p'), ('BookOpenVariant', 'Locks and unlock', '4 min', '', 't'), ('BookOpenVariant', 'Pattern search', '3 min', '', 'w')], 'Articles'),
              card('<div class="h2">Pattern search</div>', '<p class="onv" style="margin:0;line-height:1.6">Every search box has a Pattern button. Build a pattern from chips and see the matches as you go.</p>', row(pill('Offline', 'g'), pill('Updated 10 Nov')))))
page_board('M11Help', 'Offline help articles', P3, hlp, active='Notifications', caption='Help: articles that open without a connection')

nc = (header('Notifications', '3 new', '', row(btn('Mark all read', 'txt'), tools(), gap=10))
      + lst([('Update', 'Updates ready', '4 updates · 2 min ago', btn('View', 'ton', size='sm'), 'p'), ('DoorOpen', 'Front door left open', '10 min ago', btn('Lock', 'ton', size='sm'), 'w'), ('CheckCircle', 'Backup finished', '03:00', '', 'g')])
      + f'<div style="position:absolute;right:40px;bottom:40px;animation:barup .5s both;transform:none">' + note('Lights out in the kitchen.  Undo', 'p', 'Lightbulb') + '</div>')
page_board('M11Notifications', 'Notification centre and toasts', P3, nc, active='Notifications', caption='Notifications: a centre list and a toast sliding in')

conv = (header('File converter', 'Local only, nothing uploaded', 'Tools', tools())
        + grid('1fr 80px 1fr', card(f'<div class="thumb" style="height:160px">{I("FileImage", 44)}</div>', '<b>photo.heic</b>', '<span class="sm mu">3.1 MB</span>', title='From'),
               f'<div style="display:grid;place-items:center">{I("ArrowRightBold", 40)}</div>',
               card(row(*[chip(x, i == 0) for i, x in enumerate(['PNG', 'JPG', 'WebP', 'PDF'])], gap=8), busy(10), '<span class="sm mu">Converting…</span>', title='To')))
page_board('M11Converter', 'Universal local file converter', P3, conv, extra=('FileSwap', 'Converter'), caption='Converter: from, to, and a shimmer while it works')

b64 = (header('Base64', '', 'Tools', tools(), tabs=(['Encode', 'Decode', 'File'], 0))
       + grid(2, card(code('Hello, dim sum!'), title='Text'), card(code('SGVsbG8sIGRpbSBzdW0h'), row(btn('Copy', 'ton', 'ContentCopy'), pill('URL safe', 't')), title='Base64')))
page_board('M11Base64', 'Base64 toolkit', P3, b64, extra=('CodeBraces', 'Base64'), caption='Base64: text and result side by side')

oll = (header('Ollama models', 'Local AI', 'Tools', row(btn('Pull model', 'fill', 'Download'), tools(), gap=10))
       + grid('1.3fr 1fr', lst([('Robot', 'llama3.2:3b', '2.0 GB · in use', pill('Running', 'g'), 'g'), ('Robot', 'qwen2.5:7b', '4.7 GB', btn('Start', 'ton', size='sm'), 'p'), ('Robot', 'mistral:7b', f'Downloading', f'<span style="width:120px">{busy(8)}</span>', 'w')], 'Models'),
              card(ring(38, 'GPU memory', 't'), kv([('Model', 'llama3.2:3b'), ('Speed', '41 tokens/s')]), title='Now')))
page_board('M11Ollama', 'Local Ollama suite manager', P3, oll, extra=('Robot', 'Ollama'), caption='Ollama: models as rows, the running one with its load')

edt = (header('External editor', '', 'Tools', tools())
       + grid(2, card(field('Editor', 'Visual Studio Code', 'MicrosoftVisualStudioCode'), swrow('Open YAML in the editor', 'Instead of the built-in one'), title='Editor'),
              card(field('Forge', 'github.com/you/home'), field('Branch', 'main'), row(btn('Publish', 'fill', 'Upload'), live('Up to date')), title='Publish')))
page_board('M11Editor', 'External editor and publishing to a forge', P3, edt, extra=('CodeTags', 'Editor'), caption='Editor and forge: two cards, one live state')

mc = (header('Minecraft server', 'Survival · 1.21', 'Tools', row(btn('Stop', 'out', 'Stop'), tools(), gap=10)) + stats(('3 / 10', 'Players', 'p', 'AccountGroup'), ('19.8', 'Ticks per second', 'g', 'Speedometer'), ('2.1 GB', 'Memory', 't', 'Memory'))
      + '<div style="height:16px"></div>' + grid('1fr 1.3fr', lst([('Account', 'Alex', 'Overworld', btn('Kick', 'txt', size='sm'), 'g'), ('Account', 'Sam', 'Nether', btn('Kick', 'txt', size='sm'), 'w')], 'Players'),
                                                  card(code('[12:01] Alex joined the game\n[12:04] Sam has made the advancement [Hot Stuff]'), field('Command', '/time set day', mono=True), title='Console', action=live())))
page_board('M11Minecraft', 'Minecraft server manager', P3, mc, extra=('Cube', 'Minecraft'), caption='Minecraft: stats, players and a live console')

mw = (header('World generator', '', 'Tools › Minecraft', tools())
      + grid('1fr 1.3fr', card(field('Seed', 'dimsum2026', mono=True), field('Type', 'Large biomes'), swrow('Structures', 'Villages and temples'), btn('Generate', 'fill', 'Earth'), title='World'),
             card('<div style="height:300px;border-radius:20px;background:conic-gradient(from 30deg,#5b8c5a,#c9b37e,#4a7fb0,#5b8c5a,#8fae6b,#5b8c5a);animation:fade 1.2s both"></div>', title='Map preview')))
page_board('M11World', 'Minecraft world generator', P3, mw, extra=('Cube', 'Minecraft'), caption='World generator: settings and a map preview')

drw = (header('Drawing board', '', 'Tools', tools())
       + card(row(*[ib(i, i == 'Pencil') for i in ['CursorDefault', 'Pencil', 'Marker', 'Eraser', 'ShapeOutline', 'FormatText', 'Undo', 'Redo']], gap=4),
              '<svg viewBox="0 0 900 380" style="width:100%;height:380px;border-radius:16px;background:var(--s2)"><path d="M60 300 C 200 80, 360 340, 520 140 S 820 120, 860 260" fill="none" stroke="var(--e)" stroke-width="6" stroke-linecap="round" style="stroke-dasharray:2000;animation:draw 2s ease-out both"/><rect x="580" y="200" width="200" height="120" rx="20" fill="none" stroke="var(--t)" stroke-width="5"/></svg>'))
page_board('M11Draw', 'Drawing and annotation board', P3, drw, extra=('Draw', 'Drawing'), caption='Drawing: a tool pill and a stroke that draws itself')

prog = (header('Restoring a backup', '', 'Settings › Backups', tools())
        + grid(2, card(steps(['Check', 'Stop', 'Restore', 'Start'], 2), bar(62), '<span class="sm mu">Restoring files… 62%</span>', title='Progress, where you started it'),
               card(note('Starting failed: the Z-Wave stick is missing.', 'e', 'AlertCircle'), row(btn('Try again', 'fill', 'Refresh'), btn('Start without it', 'ton'), btn('Logs', 'txt')), title='Recovery, where it broke')))
page_board('M11Progress', 'Progress where it started, recovery where it broke', P3, prog, caption='Progress and recovery: shown in place, never in a far-off page')

# ---------------- Motion editor ----------------
curve = ('<svg viewBox="0 0 300 220" style="width:100%;height:220px;border-radius:16px;background:var(--s2)">'
         '<path d="M20 200 L280 20" stroke="var(--out)" stroke-dasharray="4 6"/>'
         '<path d="M20 200 C 110 200, 60 20, 280 20" fill="none" stroke="var(--p)" stroke-width="5" stroke-linecap="round" style="stroke-dasharray:500;--len:500;animation:draw 1.6s ease-out both"/>'
         '<line x1="20" y1="200" x2="110" y2="200" stroke="var(--t)" stroke-width="2"/><line x1="280" y1="20" x2="60" y2="20" stroke="var(--t)" stroke-width="2"/>'
         '<circle cx="110" cy="200" r="9" fill="var(--t)"/><circle cx="60" cy="20" r="9" fill="var(--t)"/></svg>')
kinds = lst([('CardOutline', 'Cards rising in', '420 ms · stagger 40 ms', switch(1), 'p'), ('Overscan', 'Dialogs popping', '260 ms', switch(1), 't'), ('ArrowExpandUp', 'Sheets and bars', '320 ms', switch(1), 'w'),
             ('ChartLine', 'Charts drawing', '1.2 s', switch(1), 'g'), ('TabPlus', 'Tab switches', '200 ms', switch(1), 'p'), ('Bell', 'Toasts', '300 ms', switch(0), 'n')], 'Every animated element')
prev = ('<div style="height:150px;border-radius:20px;background:var(--s2);position:relative;overflow:hidden">'
        '<div style="position:absolute;left:24px;top:40px;width:70px;height:70px;border-radius:22px;background:var(--p);animation:motionx 1.6s cubic-bezier(.3,0,.2,1) infinite alternate"></div></div>'
        '<style>@keyframes motionx{to{transform:translateX(420px) rotate(90deg)}}@media (prefers-reduced-motion:reduce){[style*=motionx]{animation:none!important}}</style>')
mot = (header('Animation and transitions', 'Tune every movement in the app', 'Settings › Appearance', row(btn('Export', 'out', 'Download'), tools(), gap=10), tabs=(['Type', 'Fills', 'Colour', 'Fonts', 'Motion'], 4))
       + row(seg(['Calm', 'Standard', 'Expressive', 'Playful', 'Mine'], 2), '<span class="grow"></span>', row('<b>All motion</b>', switch(1), gap=8), row('<b>Speed</b>', f'<span style="width:160px">{slider(50)}</span>', '<span class="mono sm">1.0×</span>', gap=8), gap=16)
       + '<div style="height:16px"></div>'
       + grid('1fr 1.15fr 1fr', kinds,
              card(curve, row(*[chip(x, i == 1) for i, x in enumerate(['Linear', 'Emphasized', 'Spring', 'Bounce'])], gap=6), grid(2, field('Duration', '420 ms'), field('Delay', '0 ms'), field('Stagger', '40 ms'), field('Distance', '18 px'), gap=10), title='Cards rising in'),
              card(prev, note('Reduced motion is on in the system, so the app stays still whatever is set here.', 'w', 'MotionPause'), row(btn('Reset', 'txt'), btn('Save as mine', 'ton', 'ContentSave')), title='Live preview')))
page_board('M11Motion', 'Animation and transition editor', P3, mot, caption='Motion editor: profiles, a master switch and speed, every element kind, a curve editor and a live preview')

# ---------------- Phone: every feature, moved not removed ----------------
P4 = 'phone'
grab = '<div style="width:40px;height:4px;border-radius:2px;background:var(--out);margin:0 auto 12px"></div>'
sh = lambda *parts: f'<div class="sheet">{grab}' + ''.join(parts) + '</div>'
ovf = menu([('FormatPaint', 'Edit appearance'), ('History', 'Version history'), ('ShareVariant', 'Share'), ('LockOutline', 'Lock this page'), ('HelpCircleOutline', 'Help'), ('Regex', 'Pattern workbench')], 'More on this page', w=300)
ph1 = phone(row(search('Search', w=250), ib('DotsVertical', True)) + f'<div style="position:absolute;right:16px;top:150px;animation:pop .3s both">{ovf}</div>', 'Devices', 'Settings')
ph2 = phone(search('dark', 'Palette', 330), 'Command palette', 'Search',
            sheet=sh(lst([('ThemeLightDark', 'Theme', 'Appearance', seg(['L', 'D', 'A'], 1), 'p'), ('WeatherNight', 'Dark background', 'Appearance', switch(1), 't'), ('ArrowRight', 'Go to Appearance', '', '', 'n')])))
ph3 = phone(search('^Living.*$', w=330), 'Devices', 'Settings', back=True,
            sheet=sh('<b class="h3">Pattern workbench</b>', row(*[pill(x, 'p') for x in ['^', 'Living', '.*', '$']], gap=6), row(*[chip(x) for x in ['Starts with', 'Any', 'Ends']], gap=6), note('3 matches', 'g', 'CheckCircle')))
phone_board('M12PhoneMore', 'Toolbars fold into a menu, panels become sheets', P4, [ph1, ph2, ph3], caption='Phone: the tool pill folds into More, the palette and pattern workbench open as sheets')

ph4 = phone(f'<div style="display:grid;place-items:center;height:200px;animation:breathe 2s infinite">{ico("Fingerprint", "t", 96, 30, 48)}</div><span class="onv" style="text-align:center">Touch your passkey</span>', 'Unlock', 'Settings',
            sheet=sh(lst([('Numeric', 'Use PIN instead', '', I('ChevronRight', 20), 'p'), ('ShieldKey', 'Use authenticator', '', I('ChevronRight', 20), 'w'), ('Lifebuoy', 'Get help', 'Support ticket', I('ChevronRight', 20), 'n')])))
ph5 = phone(''.join([card(row(ico(i, t, 36, 12, 18), f'<b class="grow">{n}</b>', ib('ContentCopy')), f'<div class="mono" style="font-size:28px;letter-spacing:3px">{c}</div>', bar(70, t), pad=16) for i, n, c, t in [('Home', 'Home Assistant', '482 913', 'p'), ('Github', 'Forge', '120 455', 't')]]), title='Authenticator', active='Settings', back=True)
ph6 = phone(card(I('CheckboxMarked', 22), '<b>Ceiling</b>', '<span class="sm mu">Living room · On</span>', pad=14, gap=4) + card(I('CheckboxMarked', 22), '<b>Porch</b>', '<span class="sm mu">Outside · Unavailable</span>', pad=14, gap=4),
            'Entities', 'Settings', back=True, sheet=sh(row(*[col(ico(i, 'p', 44, 14, 22), f'<span class="xs">{n}</span>', gap=4, style='align-items:center') for i, n in [('Sofa', 'Area'), ('Label', 'Label'), ('EyeOff', 'Hide'), ('Delete', 'Delete')]], style='justify-content:space-around')))
phone_board('M12PhoneLocks', 'Locks, codes and bulk actions on a phone', P4, [ph4, ph5, ph6], caption='Phone: the unlock ladder in a sheet, tables become cards, bulk actions in a bottom bar')

ph7 = phone(seg(['Calm', 'Std', 'Expr', 'Play'], 2) + row('<b class="grow">All motion</b>', switch(1)) + kinds, 'Motion', 'Settings', back=True)
ph8 = phone(card(curve, row(*[chip(x, i == 1) for i, x in enumerate(['Linear', 'Emph', 'Spring'])], gap=6), pad=16) + grid(2, field('Duration', '420 ms'), field('Stagger', '40 ms'), gap=10), 'Cards rising in', 'Settings', back=True)
ph9 = phone(stats(('3 / 10', 'Players', 'p', 'AccountGroup'), ('19.8', 'TPS', 'g', 'Speedometer')) + card(code('[12:01] Alex joined'), field('Command', '/time set day', mono=True), pad=16, title='Console', action=live()), 'Minecraft', 'Pages', back=True)
phone_board('M12PhoneMotion', 'Motion editor and tools on a phone', P4, [ph7, ph8, ph9], caption='Phone: the motion editor stacks into a list and a detail, tools keep every control')

write_index('Home Assistant Material, modern: Features', [(P1, 'Language, playfulness and appearance'), (P2, 'Everywhere features: tabs, palette, patterns, menus, locks'), (P3, 'Tools: history, export, converters, Minecraft, drawing, motion editor'), (P4, 'On a phone: every feature moved, none removed')], 'M09Language')
