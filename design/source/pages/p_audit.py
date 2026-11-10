"""Polish pass, canvas 14: the decisions the audit asked for before any code. Run through
build_polish.py."""
from polish_lib import *

P = '14-decisions'
mi = lambda items: ''.join(f'<button class="mi">{I(i, "s")}<span class="bm grow">{t}</span></button>' for i, t in items)


def bottom_bar(sel='Home', tabs_n=7):
    items = [('ViewDashboard', 'Home'), ('Magnify', 'Search'), ('TabPlus', f'Pages, {tabs_n}'), ('HumanHandsup', 'Access'), ('Menu', 'Menu')]
    out = ''
    for ic, lab in items:
        s = lab.split(',')[0] == sel
        badge = f'<span class="lm" style="position: absolute; top: -2px; right: -6px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--p); color: var(--on-p); display: grid; place-items: center; padding: 0 4px">{tabs_n}</span>' if lab.startswith('Pages') else ''
        icon = I('CheckboxMultipleOutline') if lab.startswith('Pages') else I(ic)
        out += (f'<a href="#{lab}" class="col" style="flex: 1; align-items: center; gap: 4px; padding: 10px 0 12px; color: {"var(--on)" if s else "var(--onv)"}">'
                f'<span style="position: relative; width: 56px; height: 32px; border-radius: 16px; display: grid; place-items: center; {"background: var(--sc)" if s else ""}">{icon}{badge}</span>'
                f'<span class="lm">{lab.split(",")[0]}</span></a>')
    return f'<nav class="row" aria-label="Main" style="flex: none; background: var(--sl2); border-top: 1px solid var(--outv)">{out}</nav>'


home = lambda: pbar('Good evening, Sam', False, '<button class="av" aria-label="Account, Sam">S</button>') + pbody(
    f'<section class="card col" style="background: var(--pc); color: var(--on-pc); padding: 20px; gap: 8px"><div class="row" style="gap: 10px">{I("LightbulbGroup")}<span class="tm grow">Living room</span>{sw(True, "Living room lights")}</div><span class="dl" style="font-size: 44px; line-height: 52px">80%</span></section>',
    grid(2, tile('Thermometer', 'Inside', '21.4°'), tile('Lock', 'Front door', 'Locked'), gap=10), gap=12, style='overflow: hidden')

# ---------- 22. Reaching search, accessibility and New tab on a phone ----------
a1 = phone(home() + bottom_bar(), 'A bottom bar with five places: Home, Search, Pages, Access, Menu. Each is 64 px wide or more and sits under the thumb.', h=640)
a2 = phone('<div class="col grow" style="background: var(--sl1)">' + '<div class="col" style="padding: 12px 16px; gap: 10px">'
           + '<div class="find" style="height: 48px; box-shadow: inset 0 0 0 2px var(--p); padding-right: 4px"><span class="row grow" style="gap: 10px">' + I('ArrowLeft', 's') + '<span class="bm" style="color: var(--on)">kitch</span></span>' + ib('Regex', 'Build a pattern search') + '</div>'
           + '<span class="ll mu">Entities</span>' + mi([('LightbulbGroup', 'Kitchen lights'), ('Thermometer', 'Kitchen temperature')])
           + '<span class="ll mu">Pages and commands</span>' + mi([('ViewDashboard', 'Open dashboard Kitchen'), ('Cog', 'Settings, Areas, Kitchen')]) + '</div><span class="grow"></span>' + keyboard(200) + '</div>',
           'Search everything opens full screen with the keyboard; the pattern button stays in the field.', h=640)
a3 = phone(home() + scrim() + sheet('<h3 class="tm">Accessibility</h3>', '<div class="col" style="gap: 0">'
                                     + ''.join(f'<div class="li" style="min-height: 52px; padding: 4px 8px">{I(i, "s")}<span class="bm grow">{t}</span>{sw(o, t)}</div>' for i, t, o in
                                               [('MotionPauseOutline', 'Reduce motion', False), ('ContrastCircle', 'More contrast', True), ('FormatSize', 'Larger text', False), ('AccountVoice', 'Read aloud on hold', False)])
                                     + '</div>', btn('All accessibility tools', 'text', 'ChevronRight', True), label='Accessibility', gap=6, bottom=78) + '<div style="position: absolute; left: 0; right: 0; bottom: 0">' + bottom_bar('Access') + '</div>',
           'Access opens the accessibility panel as a sheet above the bar.', dark=True, h=640)
phone_board(P, 'PhoneReach', 'Search, accessibility and New tab on a phone',
            'Audit 1: below 700 px there is no tab bar, so these could not be reached by touch. Decision: a bottom bar.', [a1, a2, a3],
            [decide('Bottom bar below 700 px: Home, Search, Pages (with the count of open pages), Access, Menu. The rail and the top tab bar are not drawn at that width.',
                    'Menu opens the drawer with every destination, Developer tools and Settings, the same order as the rail.',
                    'New tab is the first row of the Pages sheet (next board), not a sixth button.'),
             decide('The bar hides while the keyboard is up and while scrolling down; it returns on any scroll up.',
                    'Cantonese labels are two characters each and fit; Both mode shows the English label only, with the Cantonese in the accessible name.')])

# ---------- 23. Tabs on a phone ----------
pagecard = lambda t, ic, cur=False: (f'<div class="col" style="gap: 6px; padding: 10px; border-radius: 20px; background: {"var(--pc)" if cur else "var(--sl2)"}; color: {"var(--on-pc)" if cur else "var(--on)"}">'
                                      f'<div class="row" style="gap: 6px">{I(ic, "s")}<span class="ll grow" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{t}</span>'
                                      f'<button class="ib" style="width: 32px; height: 32px" aria-label="Close {t}">{I("Close", "s")}</button></div>'
                                      f'<div aria-hidden="true" style="height: 64px; border-radius: 12px; background: var(--sl0); opacity: .7"></div></div>')
t1 = phone(home() + scrim() + sheet(row('<h3 class="tm grow">7 open pages</h3>', btn('Close others', 'text', None, True)),
                                    row(wfind('Search open pages', 44), round_btn('Plus', 'New tab', 't', 44), gap=8),
                                    grid(2, pagecard('Home', 'ViewDashboard', True), pagecard('Energy', 'LightningBolt'), pagecard('Map', 'Map'), pagecard('Activity', 'FormatListBulleted'), gap=8),
                                    '<span class="bs mu">3 more below. Swipe a page sideways to close it; Undo appears for 5 seconds.</span>', label='Open pages', gap=10, top=96, bottom=78) + '<div style="position: absolute; left: 0; right: 0; bottom: 0">' + bottom_bar('Pages') + '</div>',
           'Pages: a search of the open pages, then the pages two to a row, each with its close button in reach of the thumb.', h=640)
t2 = phone(home() + '<div class="row" role="status" style="position: absolute; left: 12px; right: 12px; bottom: 80px; gap: 8px; background: var(--inv); color: var(--on-inv); padding: 6px 6px 6px 16px; border-radius: 16px">'
           + '<span class="bm grow">Energy closed</span>' + btn('Undo', 'text', None, True, 'color: var(--pc)') + '</div>' + bottom_bar(),
           'After a close: a toast with Undo above the bar.', h=640)
t3 = phone(pbar('Energy', False, ib('ChevronLeft', 'Previous page, Home'), ib('ChevronRight', 'Next page, Map')) + pbody(
    '<div class="row" style="gap: 6px; justify-content: center">' + ''.join(f'<span style="width: {16 if i == 1 else 6}px; height: 6px; border-radius: 3px; background: {"var(--p)" if i == 1 else "var(--outv)"}"></span>' for i in range(7)) + '</div>',
    card('<span class="ll">Today</span><span class="dm">12.4 kWh</span><span class="bs mu">From the grid 8.1, solar 4.3</span>', style='padding: 20px', gap=4), gap=12) + bottom_bar('Pages'),
           'Switching: swipe along the top bar, or the arrows; dots show where you are among open pages.', dark=True, h=640)
phone_board(P, 'PhoneTabs', 'Open pages on a phone, with one hand', 'Audit 2: how open pages are shown, switched and closed on a phone.', [t1, t2, t3],
            [decide('Pages opens a sheet from the bottom: a search of the open pages (with the pattern workbench button) and New tab first, then the open pages as cards, two to a row, with Close others.',
                    'Searching narrows the cards as you type; Close matching and Close the rest act on the result, with Undo.', 'A page closes with its close button or a sideways swipe; Undo stays 5 seconds.'),
             decide('Switching without the sheet: swipe the top bar left or right, or use its arrow buttons; never a swipe on the page body, which belongs to cards and sliders.', 'The order is the same as the tab bar on a wide window.')])

# ---------- 24. Pick tool on touch ----------
p1 = phone(home() + '<div class="row" role="status" style="position: absolute; left: 12px; right: 12px; top: 72px; gap: 8px; background: var(--inv); color: var(--on-inv); padding: 10px 14px; border-radius: 16px">'
           + I('CursorDefaultClick', 's') + '<span class="bm grow">Tap the element to change</span>' + btn('Cancel', 'text', None, True, 'color: var(--pc); height: 32px') + '</div>' + bottom_bar(),
           'Pick on: a bar says what to do and how to stop. Nothing is chosen yet.', h=640)
p2 = phone(pbar('Good evening, Sam', False) + pbody(
    '<div style="position: relative; border-radius: 32px; box-shadow: 0 0 0 3px var(--p)">' + f'<section class="card col" style="background: var(--pc); color: var(--on-pc); padding: 20px; gap: 8px"><div class="row" style="gap: 10px">{I("LightbulbGroup")}<span class="tm grow">Living room</span>{sw(True, "Living room lights")}</div><span class="dl" style="font-size: 44px; line-height: 52px">80%</span></section>'
    + '<span class="tag p" style="position: absolute; left: 16px; top: -12px">Card</span></div>', grid(2, tile('Thermometer', 'Inside', '21.4°'), tile('Lock', 'Front door', 'Locked'), gap=10), gap=16)
           + '<footer class="col" style="gap: 8px; padding: 12px 16px; background: var(--sl1); border-top: 1px solid var(--outv)"><span class="bm">Card: Living room</span>'
           + row(btn('Bigger', 'text', 'ArrowExpandAll', True), btn('Smaller', 'text', 'ArrowCollapse', True), '<span class="grow"></span>', btn('Edit this', 'fill', None, True), gap=4) + '</footer>',
           'First tap only outlines and names the element. Bigger and Smaller step out to its parent or in to its parts. Edit this confirms.', h=640)
p3 = phone(pbar('Appearance of Card', False, ib('Close', 'Close')) + pbody(seg(['Colour', 'Shape', 'Type'], 'Colour', 'Section'),
                                                                        setting('Palette', 'Background', 'Primary container', ''), setting('FormatColorHighlight', 'Text colour', 'On primary container', ''), gap=10),
           'Then the appearance editor opens for exactly that element.', dark=True, h=640)
phone_board(P, 'PickTouch', 'Choosing an element by touch', 'Audit 3: the pick tool previews on hover; on touch the first tap selected blindly. Decision: tap to outline, then confirm.', [p1, p2, p3],
            [decide('First tap outlines and names; a second tap on the same element, or Edit this, confirms. A tap elsewhere moves the outline.', 'Bigger and Smaller walk the element tree one level, so a small part or a whole section can be chosen.'),
             changes('Hover preview stays for mouse users; on touch the confirm step is required.', 'The instruction bar is a status message, read out when the tool starts.')])

# ---------- 25. Replacing the browser's blocking boxes ----------
ALERTS = [('Filter categories', 'alert', 'Failed to delete'), ('YAML editor', 'alert', 'Error converting to YAML'), ('Automation trace', 'prompt', 'Paste a trace'), ('Script trace', 'prompt', 'Paste a trace'),
          ('Ignored integration card', 'alert', 'Could not stop ignoring'), ('Google Assistant settings', 'alert', 'Two save errors'), ('Alexa settings', 'alert', 'Save error'),
          ('Download decrypted backup', 'alert', 'Error message'), ('Cloud webhooks', 'alert', 'Two errors'), ('Dashboard raw editor', 'confirm', 'Unsaved changes'),
          ('Add entities to view', 'alert', 'Saving failed'), ('Save dashboard', 'alert', 'Saving failed'), ('Custom panel', 'confirm', 'Load from another site?'), ('Custom panel', 'alert', 'Unable to load'),
          ('Sign out', 'alert', 'Log out failed'), ('Onboarding', 'alert', 'Three errors'), ('Onboarding analytics', 'alert', 'Failed to save'), ('Backup download', 'confirm', 'Download?')]
kind = {'alert': ('Toast with Details', 'g'), 'confirm': ('Dialog, two buttons', 'p'), 'prompt': ('Dialog with a field', 'a')}
at = table([('Where', 4), ('Today', 2), ('What it says', 4), ('Becomes', 3)], [[w, f'<span class="mono bs">{k}()</span>', s, tag(*kind[k])] for w, k, s in ALERTS], 'The places')
ex_toast = ('<div class="row" role="status" style="gap: 10px; background: var(--inv); color: var(--on-inv); padding: 8px 8px 8px 16px; border-radius: 16px; width: 380px">'
            + I('AlertCircle', 's') + '<span class="bm grow">The dashboard could not be saved.</span>' + btn('Details', 'text', None, True, 'color: var(--pc)') + btn('Retry', 'text', None, True, 'color: var(--pc)') + '</div>')
ex_confirm = dlg('Leave without saving?', '<span class="bm">Your changes to the Kitchen dashboard YAML are not saved.</span>', actions=btn('Stay', 'text', None, True) + btn('Leave without saving', 'tonal', None, True), w=380, more=False)
ex_prompt = dlg('Open a trace', '<span class="bm mu">Paste a trace that was downloaded earlier.</span>', mfield('Trace', '<span class="mono bs">{"trace": ...</span>', None, True), actions=btn('Cancel', 'text', None, True) + btn('Open', 'fill', None, True), w=380, more=False)
wide_board(P, 'AlertReplacements', 'Replacing the browser\'s blocking boxes', 'Audit 4: the browser\'s alert, confirm and prompt boxes stop the whole page and cannot be styled or read out well. Each becomes one of three kinds.',
           row(col(at, gap=12, style='flex: 1; min-width: 0'), col('<span class="ll mu">alert() becomes a toast</span>', ex_toast, '<span class="ll mu">confirm() becomes a dialog</span>', ex_confirm, '<span class="ll mu">prompt() becomes a dialog with a field</span>', ex_prompt, gap=12, style='width: 400px; flex: none'), gap=32, style='align-items: flex-start'),
           [decide('Errors: a toast that stays until dismissed, with Details (the full message) and Retry where retrying makes sense.', 'Wording: say what failed in plain words first; the technical message goes in Details.'),
            decide('Confirms: the safe choice on the left as a text button, the action on the right, named by what it does ("Leave without saving"), never OK.', 'Prompts: a dialog with a labelled field, focused, and Open or Save disabled until the field is valid.'),
            decide('18 calls are listed from the current code; the audit counted 22, so the others are the same calls repeated in one file. Each row becomes one change.', 'Nothing here is destructive enough for the two-step confirmation; those are on the next board.')])

# ---------- 26. Two-step confirmation on a phone ----------
d1 = phone(pbar('Thread', True) + pbody(group('Network', setting('TransitConnectionVariant', 'Home network', '12 devices', ''), setting('Restore', 'Reset the Thread network', 'Every device leaves and must be added again', btn('Reset', 'tonal', None, True)))) + scrim()
           + sheet(f'<span class="sq" style="background: var(--errc); color: var(--on-errc); width: 48px; height: 48px; border-radius: 16px">{I("Alert")}</span>', '<h3 class="tl">Reset the Thread network?</h3>',
                   '<ul class="col bm" style="gap: 6px; margin: 0; padding-left: 20px"><li>All 12 devices leave the network.</li><li>Each has to be added again by hand.</li><li>This cannot be undone.</li></ul>',
                   row(btn('Cancel', 'text', None, True), '<span class="grow"></span>', btn('Continue', 'tonal', None, True)), label='Step 1 of 2', gap=10),
           'Step 1: what will happen, in a list. Continue is tonal, not the error colour yet.', h=700)
d2 = phone(pbar('Thread', True) + pbody('<span></span>') + scrim() + sheet('<h3 class="tl">Type the network name to reset it</h3>', '<span class="bm mu">The network is called <b class="mono">Home network</b>.</span>',
                                                                          mfield('Network name', '<span class="mono">Home netw</span>', None, True),
                                                                          row(btn('Back', 'text', None, True), '<span class="grow"></span>', btn('Reset network', 'err', None, True, 'opacity: .38')), label='Step 2 of 2', gap=10)
           + keyboard(200).replace('flex: none;', 'flex: none; position: absolute; left: 0; right: 0; bottom: 0;'),
           'Step 2: type the name. Reset network stays disabled until it matches exactly.', h=700)
d3 = phone(pbar('Two-step sign-in', True) + pbody('<span></span>') + scrim() + sheet('<h3 class="tl">Turn off the second step?</h3>', '<span class="bm">Sign-in will ask only for your password.</span>',
                                                                                     '<div class="col" style="gap: 8px; align-items: center; padding: 8px 0"><div style="width: 88px; height: 88px; border-radius: 44px; background: conic-gradient(var(--err) 0 70%, var(--sl4) 70% 100%); display: grid; place-items: center"><span style="width: 72px; height: 72px; border-radius: 36px; background: var(--sl1); display: grid; place-items: center">' + I('GestureTap') + '</span></div><span class="bs mu">Keep holding</span></div>',
                                                                                     row(btn('Back', 'text', None, True), '<span class="grow"></span>', btn('Hold to turn off', 'err', None, True)), label='Step 2 of 2, hold', gap=10),
           'Where there is no name to type: hold the button for 2 seconds, with the ring filling.', dark=True, h=700)
phone_board(P, 'TwoStepPhone', 'Two-step confirmation on a phone', 'Audit 5: about 15 destructive actions use a single confirm. Each gets these two steps.', [d1, d2, d3],
            [decide('Step 1 lists what will happen. Step 2 asks for the name of the thing (typed) or, where there is no name, a 2 second hold.', 'The error colour appears only on the final button of step 2.'),
             decide('Applies to: energy sources, Matter fabrics, Thread reset, turning off a second sign-in step, deleting application credentials, and the other places in the audit list.', 'Screen readers: the hold also accepts a long press of Enter or Space, announced as "hold for 2 seconds".')])

# ---------- 27. Locks not built yet, part 1 ----------
tabrow = row(*[f'<button class="pt{" sel" if t == "Energy" else ""}">{I("LockOutline", "s") if t in ("Energy", "Settings") else ""}{t}</button>' for t in ['Home', 'Energy', 'Map', 'Activity', 'Settings']], gap=4)
lk_tabs = card('<h3 class="tm">Locked tabs and tab groups</h3>', tabrow, '<span class="bs mu">A locked tab cannot be closed or moved. Its page still opens; its own lock decides what can be changed there.</span>',
               row(chip('Group: Energy pages', True, 'LockOutline'), chip('Group: Rooms'), gap=6), style='padding: 24px')
lk_value = card('<h3 class="tm">Lock one appearance value</h3>', setting('Palette', 'Background', 'Primary container', ib('LockOutline', 'Lock this value')),
                setting('FormatSize', 'Text size', '16 px, locked', f'<span class="row" style="gap: 4px; color: var(--onv)">{I("Lock", "s")}</span>'), style='padding: 24px')
lk_bulk = card('<h3 class="tm">Lock many at once</h3>', row(f'<span class="ll grow">4 selected</span>', btn('Lock', 'tonal', 'LockOutline', True), btn('Unlock', 'text', 'LockOpenVariant', True), btn('Clear', 'text', None, True), style='background: var(--sc); color: var(--on-sc); border-radius: 20px; padding: 8px 8px 8px 16px'),
               '<span class="bs mu">One wizard for all four, then one lock each. Unlocking many asks once per credential.</span>', style='padding: 24px')
lk_search = card('<h3 class="tm">Locked items in search results</h3>', '<div class="col" style="gap: 2px">' + ''.join(
    f'<div class="li" style="min-height: 52px; background: var(--sl1)">{I(i, "s")}<span class="bm grow">{t}</span>{tag("Locked") if l else ""}</div>' for i, t, l in [('LightbulbGroup', 'Kitchen lights', True), ('Thermometer', 'Kitchen temperature', False)]) + '</div>',
                 '<span class="bs mu">Locked items are found and can be opened; their changes ask to unlock first.</span>', style='padding: 24px')
wide_board(P, 'LocksMore', 'Locks still to build, part 1', 'Audit 6: tabs and tab groups, single appearance values, many at once, and locked items in search.', grid(2, lk_tabs, lk_value, lk_bulk, lk_search, gap=20),
           [decide('The lock mark is the same small lock icon everywhere; it never replaces the item\'s own icon.', 'Locks stay a speed bump for fun; every surface that creates one shows the same plain disclosure.')])

# ---------- 28. Locks not built yet, part 2 ----------
qr = ('<div role="img" aria-label="Where the QR code goes. It is drawn by the app from the secret." style="width: 168px; height: 168px; border-radius: 20px; background: var(--sl0); box-shadow: inset 0 0 0 2px var(--outv); display: grid; place-items: center; flex: none">'
      + f'<span class="col" style="align-items: center; gap: 6px; color: var(--onv)">{I("QrcodeScan", "l")}<span class="bs">QR code</span></span></div>')
lk_qr = card('<h3 class="tm">QR code when a one-time code is set up</h3>', row(qr, col('<span class="bm">Scan with your authenticator app, or type the secret.</span>', '<div class="mono ll" style="background: var(--sl1); padding: 10px 12px; border-radius: 12px">JBSW Y3DP EHPK 3PXP</div>', mfield('Code from the app', ''), gap=10, style='flex: 1; min-width: 0'), gap=20, style='align-items: flex-start'), style='padding: 24px')
lk_support = card('<h3 class="tm">"Forgotten your password?" opens the support desk</h3>', '<span class="bm">Locks live only in this browser and cannot be recovered. The support desk says so, and shows the one way out:</span>',
                  '<ol class="col bm" style="gap: 6px; margin: 0; padding-left: 20px"><li>Open your browser\'s site settings for this address.</li><li>Clear this site\'s stored data.</li><li>Every lock is removed; nothing else on the server changes.</li></ol>',
                  row(btn('Open a support ticket', 'text', 'TicketConfirmation', True), btn('Show me how', 'tonal', None, True)), style='padding: 24px')
lk_start = window('<div class="col" style="align-items: center; justify-content: center; gap: 16px; min-height: 420px; padding: 32px; text-align: center">'
                  + f'<span class="sq" style="background: var(--pc); color: var(--on-pc)">{I("Lock")}</span><h3 class="tl">Home Assistant is locked</h3><span class="bm mu">Locked on start. Unlock to use this browser\'s session.</span>'
                  + btn('Unlock', 'fill', 'LockOpenVariant') + '<a class="bs" href="#forgot">Forgotten your password?</a></div>', label='Locked on start', dark=True)
wide_board(P, 'LocksMore2', 'Locks still to build, part 2', 'The QR code for one-time codes, the support desk from "Forgotten your password?", and locked on start.',
           row(col(lk_qr, lk_support, gap=20, style='flex: 3; min-width: 0'), col(lk_start, '<span class="bs mu">Locked on start, dark. Says it is locked, offers Unlock, and the support link.</span>', gap=10, style='flex: 2; min-width: 0'), gap=24, style='align-items: flex-start'),
           [decide('The QR code is drawn by the app from the secret on this device; nothing is sent to a service to draw it.', 'Locked on start covers the interface in this browser only and says so; it does not sign anyone out.')])

# ---------- 29. Pattern workbench gaps ----------
wb_dialect = card('<h3 class="tm">Dialects and converting</h3>', row(select('Write in', 'JavaScript'), I('ArrowRight'), select('Convert to', 'Python re')),
                  '<div class="mono bm" style="background: var(--sl1); padding: 12px; border-radius: 12px">r"\\bkitchen(?:_\\w+)?\\b", re.I</div>',
                  note('The u flag has no Python equivalent; \\w matches Unicode letters there by default.', '', 'InformationOutline'), style='padding: 24px')
wb_trace = card('<h3 class="tm">Step-by-step trace</h3>', '<div class="col mono bs" style="gap: 4px">' + ''.join(f'<span class="row" style="gap: 10px"><span class="tag{" p" if i == 3 else ""}">{i}</span><span>{t}</span></span>' for i, t in [(1, '\\b at 0: word edge, match'), (2, 'kitchen at 0 to 7: match'), (3, '(_\\w+)? at 7: _counter, match'), (4, '\\b at 15: word edge, match')]) + '</div>',
                row(ib('SkipPrevious', 'Previous step'), ib('Play', 'Play'), ib('SkipNext', 'Next step'), '<span class="bs mu">Step 3 of 4</span>'), style='padding: 24px')
wb_files = card('<h3 class="tm">Search files with a preview</h3>', row(btn('Choose files', 'tonal', 'FolderOpen', True), '<span class="bs mu">configuration.yaml, automations.yaml</span>'),
                '<div class="mono bs" style="background: var(--sl1); padding: 12px; border-radius: 12px; line-height: 20px">automations.yaml:42  entity_id: light.<mark style="background: var(--pc); color: var(--on-pc)">kitchen_counter</mark><br>automations.yaml:88  target: switch.<mark style="background: var(--pc); color: var(--on-pc)">kitchen</mark></div>',
                '<span class="bs mu">Files are read in this browser and never uploaded.</span>', style='padding: 24px')
wb_enc = card('<h3 class="tm">Encoding, help and layout</h3>', row(select('Text encoding', 'UTF-8'), select('Line breaks', 'LF'), gap=10),
              setting('HelpCircleOutline', 'Help for each feature', 'An information button on every block, flag and section', ''),
              setting('DragVertical', 'Rearrange the layout', 'Drag sections by their handle, or move them with Alt and the arrow keys', btn('Reset layout', 'text', None, True)), style='padding: 24px')
wide_board(P, 'WorkbenchMore', 'Pattern workbench, gaps against the reference tool', 'Audit 7: other dialects and converting, a trace, file search, encoding, help per feature, and a layout the person can rearrange.',
           grid(2, wb_dialect, wb_trace, wb_files, wb_enc, gap=20),
           [decide('Dialects: JavaScript (the one the search runs), Python re, PCRE, .NET, Go RE2, Java. Converting always says what could not be carried over.', 'Rearranging is keyboard reachable: every section has a handle that takes Alt and the arrow keys.')])

# ---------- 30. Settings controls still to build ----------
st1 = card('<h3 class="tm">Emoji in dialogs</h3>', setting('EmoticonHappyOutline', 'Emoji in dialog titles', 'Adds one emoji to the title of a dialog. Never in buttons or errors.', sw(True, 'Emoji in dialog titles')),
           dlg('🎉 Backup finished', '<span class="bm">3.2 GB, kept on this machine.</span>', actions=btn('Done', 'fill', None, True), w=320, more=False), style='padding: 24px')
st2 = card('<h3 class="tm">Language mode reaching real text</h3>', row(col('<span class="ll mu">English, level 1</span>', '<div class="li" style="background: var(--sl1)">Your changes were saved.</div>', gap=6, style='flex: 1'),
                                                                     col('<span class="ll mu">Both, level 5</span>', '<div class="li col" style="align-items: flex-start; background: var(--sl1); gap: 2px"><span>Saved! Snug and proud.</span><span lang="yue">搞掂晒！</span></div>', gap=6, style='flex: 1'), gap=12, style='align-items: flex-start'),
           '<span class="bs mu">Both stacks the Cantonese under the English. Buttons show one language, the other in the accessible name, so they never double in width.</span>', style='padding: 24px')
st3 = card('<h3 class="tm">Quiet hours for sounds</h3>', setting('Sleep', 'Quiet hours', '22:00 to 07:00, every day', sw(True, 'Quiet hours')), row(mfield('From', '22:00'), mfield('To', '07:00'), gap=10),
           row(*[chip(d, d not in ('Sat', 'Sun')) for d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']], gap=6, style='flex-wrap: wrap'), style='padding: 24px')
st4 = card('<h3 class="tm">Scheduled settings and appearance editors</h3>', setting('CalendarClock', 'Low stimulation on school nights', 'Sun to Thu, 20:00 to 07:00', sw(True, 'Scheduled low stimulation')),
           setting('FormatPaint', 'Edit appearance on every element', 'Hold or right-click any element, then Edit appearance', btn('Try it', 'text', None, True)), style='padding: 24px')
wide_board(P, 'SettingsMore', 'Settings controls still to build', 'Audit 8: emoji in dialogs, language mode and playfulness reaching real text, quiet hours, scheduled settings, appearance editors on every element.',
           grid(2, st1, st2, st3, st4, gap=20),
           [decide('Each new setting arrives on the Personal page in its group, with the same explanation, reach line, default and Reset as the rest.', 'A schedule shows on its setting as one line ("Sun to Thu, 20:00 to 07:00") and is edited in the Schedule page.'),
            decide('Your own wording file (Profile, Localization) still wins over language mode: its entries replace the shipped words in every mode, including a word at the start of a label.', 'Quiet hours silence action sounds only; narration and alarms are not changed.')])
