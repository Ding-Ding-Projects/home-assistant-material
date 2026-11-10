"""Polish pass, canvas 12: the pattern workbench, the element menu and the locks, on a phone and
in a wide window. Run through build_polish.py."""
from polish_lib import *

P = '12-polish'

FLAGS = [('g', 'Find all matches', True), ('i', 'Ignore case', True), ('m', 'Multi-line', False), ('s', 'Dot matches line breaks', False),
         ('u', 'Unicode', True), ('v', 'Unicode sets', False), ('y', 'Sticky', False), ('d', 'Group positions', False)]
TABS = ['Build', 'Test', 'Replace', 'Test cases', 'Performance', 'Use in code', 'Library', 'Engine']
PAT = '<span class="mono bl">/<span style="color: var(--p)">\\b</span>kitchen<span style="color: var(--heat)">(_\\w+)?</span><span style="color: var(--p)">\\b</span>/<span class="mu">giu</span></span>'


def flag_pills(compact=False):
    on = ''.join(f.upper() if False else f for f, _, s in FLAGS if s)
    return (f'<button class="chip sel" aria-label="Flags: {", ".join(n for _, n, s in FLAGS if s)}. Change the flags" style="height: 32px">'
            f'{I("TuneVariant", "s")}<span class="mono">{on}</span>{I("MenuDown", "s")}</button>')


def wb_head_phone():
    return pbar('Pattern workbench', False, ib('HelpCircleOutline', 'Help for the workbench'), ib('Close', 'Close the workbench'), sub='Opened from Search entities')


def wb_tabs_phone(sel):
    first = TABS[:3]
    items = ''.join(f'<button class="pt{" sel" if t == sel else ""}" role="tab" aria-selected="{str(t == sel).lower()}" style="height: 36px; padding: 0 12px">{t}</button>' for t in first)
    more = '<button class="pt" aria-haspopup="menu" aria-label="More sections: Test cases, Performance, Use in code, Library, Engine" style="height: 36px; padding: 0 10px">More' + I('MenuDown', 's') + '</button>'
    return f'<div class="row" role="tablist" aria-label="Workbench sections" style="gap: 2px; flex: none">{items}{more}</div>'


def wb_footer_phone(primary='Use pattern'):
    return (f'<footer class="col" style="gap: 8px; padding: 8px 16px 12px; background: var(--sl1); flex: none; border-top: 1px solid var(--outv)">'
            f'<span class="bs mu">Searches as you type. Nothing changes until you choose Use.</span>'
            f'<div class="row" style="gap: 4px">{ib("DotsVertical", "More: copy or export the pattern")}<span class="grow"></span>'
            f'{btn("Cancel", "text", None, True)}{btn(primary, "fill", None, True)}</div></footer>')


def pattern_field(focus=True, err=''):
    return mfield('Pattern', PAT, None, focus, err)


def mode_row():
    return row(seg(['Text', 'Pattern'], 'Pattern', 'Search mode'), '<span class="grow"></span>', flag_pills(), gap=8)


# ---------- 1. Workbench, phone ----------
build_rows = ''.join(f'<button class="li" style="min-height: 48px; padding: 6px 12px; background: var(--sl1)"><span class="mono ll" style="width: 44px; color: var(--p)">{c}</span><span class="col grow"><span class="bm">{t}</span></span>{I("Plus", "s")}</button>' for c, t in [('\\b', 'Word edge'), ('\\w+', 'One or more letters or digits'), ('( )?', 'Optional group'), ('[ ]', 'Any one of')])
p1 = phone(wb_head_phone()
           + pbody(mode_row(), pattern_field(), wb_tabs_phone('Build'),
                   '<span class="ll mu">Building blocks</span>', build_rows, gap=12, pad='0 16px 12px', style='overflow: hidden')
           + wb_footer_phone(), 'Build, keyboard down. Three sections in view, the other five under More. The flags collapse into one chip beside the mode switch.', h=720)

flag_rows = ''.join(f'<div class="li" style="min-height: 52px; padding: 4px 8px"><span class="mono ll" style="width: 20px; color: var(--p)">{f}</span><span class="bm grow">{n}</span>{sw(s, n)}</div>' for f, n, s in FLAGS)
p2 = phone(wb_head_phone() + pbody(mode_row(), pattern_field(False), pad='0 16px 12px') + scrim()
           + sheet('<div class="row"><h2 class="tm grow">Flags</h2>' + btn('Done', 'text', None, True) + '</div>', f'<div class="col" style="gap: 0">{flag_rows}</div>',
                   '<span class="bs mu">Unicode sets is off in browsers that do not support it, with the reason under the switch.</span>', label='Flags', gap=4),
           'Flags as a sheet: one switch per flag, with its letter and its plain name. The switches never wrap.', h=720)

test_hits = ('<div class="mono bm" style="background: var(--sl0); border-radius: 16px; padding: 12px; line-height: 22px">'
             'light.<mark style="background: var(--pc); color: var(--on-pc); border-radius: 4px">kitchen_counter</mark><br>'
             'switch.<mark style="background: var(--pc); color: var(--on-pc); border-radius: 4px">kitchen</mark><br><span class="mu">sensor.kitchenette_temp</span></div>')
p3 = phone(wb_head_phone() + pbody(mode_row(), pattern_field(), wb_tabs_phone('Test'), row(tag('2 matches', 'g'), '<span class="bs mu grow">in 3 sample lines</span>'), test_hits, pad='0 16px 8px', style='overflow: hidden')
           + keyboard(200), 'Test, keyboard up. The footer hides while typing; the field, tabs and result stay above the keyboard.', dark=True, h=720)

phone_board(P, 'WorkbenchPhone', 'Pattern workbench on a phone',
            'Below 700 px the workbench takes the whole visible screen and follows the keyboard. Order from the top: title, mode, pattern field with its flags chip, sections, content, footer.',
            [p1, p2, p3],
            [decide('Order: title bar, Text or Pattern switch, the pattern field, the section tabs, the content, then the footer.',
                    'The eight flags become one chip beside the Text or Pattern switch, showing the letters that are on. It opens a sheet of eight switches.',
                    'Three section tabs fit at 320 px: Build, Test, Replace. Test cases, Performance, Use in code, Library and Engine sit under More, which shows the chosen one\'s name when one of them is open. Nothing scrolls sideways and nothing is cut.',
                    'Footer: one line of note, then a More button holding Copy and Export on the left, Cancel and Use pattern on the right. It never wraps.'),
             changes('The flag switches move out of the header into the field chip and its sheet.',
                     'The sideways-scrolling tab row is replaced by three tabs and More; Copy and Export move under the footer\'s More button.',
                     'While the keyboard is up the footer hides; it comes back when the keyboard closes. Use stays reachable from the keyboard\'s Enter key.',
                     'Cantonese: tab names are shorter, so more tabs would fit; keep three for one layout in every language.')])

# ---------- 2. Workbench, wide ----------
flag_chips = ''.join(chip(f'<span class="mono">{f}</span> {n}', s) for f, n, s in FLAGS)
build_grid = grid(2, *[f'<button class="li" style="background: var(--sl1); min-height: 56px"><span class="mono ll" style="width: 52px; color: var(--p)">{c}</span><span class="bm grow">{t}</span>{I("Plus", "s")}</button>'
                       for c, t in [('\\b', 'Word edge'), ('\\w+', 'Letters or digits'), ('\\d{2}', 'Two digits'), ('( )?', 'Optional group'), ('[ ]', 'Any one of'), ('^ $', 'Start and end')]], gap=8)
explain = card('<h3 class="tm">How it reads</h3>', *[f'<div class="row" style="gap: 12px; align-items: flex-start"><span class="mono ll" style="width: 76px; flex: none; color: var(--p)">{k}</span><span class="bm">{v}</span></div>' for k, v in [('\\b', 'a word edge'), ('kitchen', 'the letters kitchen'), ('(_\\w+)?', 'then, if present, an underscore and more letters'), ('\\b', 'a word edge')]], style='padding: 20px; background: var(--sl1)', gap=10)
wb_dialog = (f'<section class="dlg col" role="dialog" aria-label="Pattern workbench" style="width: 880px; flex: none; gap: 16px; padding: 24px 28px">'
             + row('<div class="col grow"><h2 class="tl">Pattern workbench</h2><span class="bs mu">Opened from Search entities</span></div>', seg(['Text', 'Pattern'], 'Pattern', 'Search mode'), ib('HelpCircleOutline', 'Help'), ib('Close', 'Close'))
             + mfield('Pattern', PAT, None, True)
             + f'<div class="row" role="group" aria-label="Flags" style="gap: 6px; flex-wrap: wrap">{flag_chips}</div>'
             + tabs(TABS, 'Build', 'Workbench sections')
             + row(col('<span class="ll mu">Building blocks</span>', build_grid, gap=8, style='flex: 3; min-width: 0'), col(explain, style='flex: 2; min-width: 0'), gap=16, style='align-items: flex-start')
             + row('<span class="bs mu grow">Searches as you type. Nothing changes until you choose Use.</span>', btn('Copy', 'text', 'ContentCopy', True), btn('Export', 'text', 'Export', True), btn('Cancel', 'out', None, True), btn('Use this pattern', 'fill', None, True), gap=8)
             + '</section>')
states = col(
    card('<span class="ll">Valid</span>', mfield('Pattern', PAT), row(tag('Valid', 'g'), '<span class="bs mu">Ready to use</span>'), style='padding: 20px', gap=10),
    card('<span class="ll">Error</span>', mfield('Pattern', '<span class="mono bl">/kitchen(_\\w+/</span>', err='A group is opened at character 8 and never closed.'), style='padding: 20px', gap=10),
    card('<span class="ll">Could be slow</span>', mfield('Pattern', '<span class="mono bl">/(\\w+)+$/</span>'), note('Nested repeats can take very long on long text. The search stops after 50 ms and says so.', '', 'TimerSand'), style='padding: 20px', gap=10),
    gap=16, style='width: 400px; flex: none')
wide_board(P, 'WorkbenchWide', 'Pattern workbench in a wide window',
           'A dialog of 880 px over the page. All eight flags and all eight sections are in view; the field states sit beside it.',
           row(window(f'<div class="row" style="padding: 40px; justify-content: center; background: var(--scrim); align-items: flex-start">{wb_dialog}</div>', label='Workbench over a page'), states, gap=32, style='align-items: flex-start'),
           [decide('At 700 px and wider the flags are chips with their letter and name, wrapping to a second row when needed.', 'All eight sections are tabs in one row; at 700 to 900 px they wrap, never scroll.'),
            decide('Errors name the character where the problem starts and sit under the field, in the error colour, read out by screen readers.', 'Copy and Export are text buttons on the left of Cancel and Use, so the main action stays at the far right.')])

# ---------- 3. Element menu, phone ----------
card_el = lambda ring=False: (f'<div class="card col" style="padding: 20px; gap: 8px; background: var(--pc); color: var(--on-pc); position: relative">'
                              f'<div class="row" style="gap: 10px">{I("LightbulbGroup")}<span class="tm grow">Kitchen lights</span>{sw(True, "Kitchen lights")}</div><span class="bm">3 of 4 on, 70%</span>'
                              + (f'<span aria-hidden="true" style="position: absolute; left: 140px; top: 22px; width: 72px; height: 72px; border-radius: 36px; '
                                 f'background: conic-gradient(var(--p) 0 62%, transparent 62% 100%); -webkit-mask: radial-gradient(circle, transparent 30px, #000 31px); mask: radial-gradient(circle, transparent 30px, #000 31px)"></span>' if ring else '') + '</div>')
home_bits = (pbar('Home', False, ib('Magnify', 'Search everything'), '<button class="av" aria-label="Account, Sam">S</button>')
             + pbody(card_el(True), grid(2, tile('Thermometer', 'Living room', '21.4°'), tile('Lock', 'Front door', 'Locked'), gap=10), tile('Television', 'Television', 'Off'), gap=12))
p4 = phone(home_bits + '<div class="row" role="status" style="position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); gap: 8px; background: var(--inv); color: var(--on-inv); padding: 8px 14px; border-radius: 20px">'
           + I('GestureTap', 's') + '<span class="ll">Keep holding</span></div>',
           'Holding: a ring fills under the finger over 600 ms, with a short buzz when it completes. Lifting early cancels with nothing opened.', h=640)

menu_items = [('FormatPaint', 'Edit appearance'), ('ContentCopy', 'Copy text'), ('AccountVoice', 'Read aloud'), ('LockOutline', 'Lock this card'), ('Magnify', 'Search everything for Kitchen lights')]
mi = lambda items: ''.join(f'<button class="mi">{I(i, "s")}<span class="bm grow">{t}</span></button>' for i, t in items)
p5 = phone(home_bits + scrim() + sheet(row(f'<span class="lead" style="background: var(--pc); color: var(--on-pc)">{I("LightbulbGroup", "s")}</span>', '<div class="col grow"><span class="tm">Kitchen lights</span><span class="bs mu">Card on Home</span></div>'),
                                       wfind('Search this menu', 44), f'<div class="col" style="gap: 0">{mi(menu_items)}</div>', label='Tools for Kitchen lights', gap=10),
           'Recognised: a bottom sheet names the element, then its search, then the tools. Swipe down or tap outside to close.', h=640)
p6 = phone('<div class="col grow" style="background: var(--sl1); position: relative">'
           + '<div class="col" style="padding: 8px 16px 12px; gap: 10px">' + row(f'<span class="lead" style="background: var(--pc); color: var(--on-pc)">{I("LightbulbGroup", "s")}</span>', '<span class="tm grow">Kitchen lights</span>', ib('Close', 'Close the tools'))
           + wfind_typed('loc')
           + f'<div class="col" style="gap: 0">{mi([("LockOutline", "Lock this card"), ("LockClock", "Lock for a while")])}</div>'
           + '<span class="bs mu">2 of 9 tools match. Enter runs the first.</span></div><span class="grow"></span>' + keyboard(220) + '</div>',
           'Typing in the search: the sheet grows to the full screen above the keyboard, so results are never under it.', dark=True, h=640)
phone_board(P, 'ElementMenuPhone', 'Element tools on a phone, opened by touch and hold',
            'On a phone the menu of an element is a bottom sheet, not a menu anchored to the finger. A hold is shown as it happens.',
            [p4, p5, p6],
            [decide('Hold for 600 ms. A ring fills around the touch point from the first 150 ms, so a hold is not mistaken for a scroll; at 600 ms the phone buzzes once (where vibration is allowed) and the sheet opens.',
                    'The sheet starts at its content height and names the element at its top, so the person knows which one they held.',
                    'Typing in the sheet search expands it to the full height above the keyboard; clearing the search lets it settle back.'),
             changes('Today the menu opens anchored at the touch point and the keyboard can cover its search. On a phone it becomes this sheet.',
                     'The long-press threshold stays 600 ms, but moving the finger more than 10 px cancels it, so scrolling never opens the menu.')])

# ---------- 4. Element menu, wide ----------
wmenu = (f'<div class="menu col" role="menu" aria-label="Tools for Kitchen lights" style="width: 320px; gap: 4px; position: absolute; left: 380px; top: 120px">'
         + wfind('Search this menu', 44)
         + ''.join(f'<button class="mi" role="menuitem">{I(i, "s")}<span class="bm grow">{t}</span><span class="kbd">{k}</span></button>' for i, t, k in
                   [('FormatPaint', 'Edit appearance', 'A'), ('ContentCopy', 'Copy text', 'C'), ('AccountVoice', 'Read aloud', 'R'), ('LockOutline', 'Lock this card', 'L'), ('Magnify', 'Search everything', 'S')])
         + '<span class="bs mu" style="padding: 6px 12px">Escape closes. Shift F10 or the menu key opens this on the focused element.</span></div>')
wpage = ('<div class="col" style="padding: 32px; gap: 16px; min-height: 520px; position: relative">'
         + '<h2 class="hs">Home</h2>' + grid(3, f'<div style="box-shadow: 0 0 0 3px var(--p); border-radius: 32px">{card_el()}</div>', tile('Thermometer', 'Living room', '21.4°'), tile('Lock', 'Front door', 'Locked'), gap=16)
         + grid(3, tile('Television', 'Television', 'Off'), tile('Fan', 'Bedroom fan', 'Off') if False else tile('AirFilter', 'Air purifier', 'Auto'), tile('Blinds', 'Blinds', 'Open'), gap=16) + wmenu + '</div>')
wide_board(P, 'ElementMenuWide', 'Element tools in a wide window',
           'Right-click, Shift F10, the menu key, or a touch and hold on a touch screen wider than 700 px. The menu is anchored beside the element it belongs to.',
           row(window(wpage, label='Home with the tools menu open'), window(wpage.replace('min-height: 520px', 'min-height: 520px'), label='The same, dark', dark=True), gap=32),
           [decide('Anchored to the element\'s right edge, flipping to the left near the window edge. The element keeps a 3 px outline while its menu is open.', 'The search is focused when the menu opens from the keyboard and not when it opens from a pointer, so typing a letter runs that tool.'),
            decide('A single letter shortcut beside each tool; the same letters in every language, shown in the menu.', 'On a wide touch screen the hold ring from the phone board is used too, then this menu.')])

# ---------- 5. Lock wizard, phone ----------
POL = ['PIN', 'Password', 'PIN and password', 'Password and one-time code', 'PIN and one-time code', 'Password, PIN and one-time code']
STEPS = ['What to lock', 'What unlocks it', 'Create each one', 'How long it lasts', 'Before you lock', 'Confirm']


def wiz_head(step):
    return (pbar('Lock Kitchen lights', False, ib('Close', 'Cancel locking'), sub=f'Step {step + 1} of 6, {STEPS[step]}')
            + f'<div style="padding: 0 16px 8px">{stepper(6, step)}</div>')


def wiz_foot(next_label='Next', back=True):
    return (f'<footer class="row" style="gap: 8px; padding: 12px 16px; flex: none; border-top: 1px solid var(--outv); background: var(--sl1)">'
            + (btn('Back', 'text', None, True) if back else '') + '<span class="grow"></span>' + btn(next_label, 'fill', None, True) + '</footer>')


radios = ''.join(f'<label class="li" style="min-height: 48px; padding: 4px 12px; background: {"var(--sc)" if p == "PIN and one-time code" else "var(--sl1)"}"><input type="radio" name="pol" {"checked" if p == "PIN and one-time code" else ""} style="width: 20px; height: 20px; accent-color: #00639B"><span class="bm grow">{p}</span></label>' for p in POL)
w1 = phone(wiz_head(1) + pbody('<h3 class="tm">What unlocks it</h3>', f'<div class="col" role="radiogroup" aria-label="What unlocks it" style="gap: 6px">{radios}</div>', pad='4px 16px 12px') + wiz_foot(),
           'Step 2. Six ways in, one per row, never two columns at 320 px.', h=680)
w2 = phone(wiz_head(2) + pbody(row(tag('1 of 2', 'p'), '<span class="tm">PIN</span>', gap=8), '<span class="bm mu">Choose a PIN of 4 to 12 digits.</span>', pin_dots(6, 4),
                               keypad(size=52, gap=8), row(btn('Type it instead', 'text', 'Keyboard', True), style='justify-content: center'), pad='4px 16px 8px', gap=8) + wiz_foot(),
           'Step 3, credential 1 of 2. Each credential is made in the order it will be asked for; the one-time code comes second.', h=680)
ack = '<label class="row bm" style="gap: 12px; padding: 4px"><input type="checkbox" checked style="width: 20px; height: 20px; accent-color: #00639B"><span>I understand this is just for fun</span></label>'
w3 = phone(wiz_head(4) + pbody('<h3 class="tm">Before you lock</h3>', toy(), recovery(), ack, kv(('Unlocks with', 'PIN and one-time code'), ('Unlock lasts', 'This page only')), pad='4px 16px 12px') + wiz_foot('Next'),
           'Step 5. The plain disclosure and the recovery line, with the acknowledgement that enables Next.', dark=True, h=680)
phone_board(P, 'LockWizardPhone', 'Lock wizard on a phone',
            'Beside the element on a wide window, the wizard becomes a full-height sheet on a phone. A segmented line and the step name show progress.',
            [w1, w2, w3],
            [decide('Six steps: what to lock, what unlocks it, create each credential in order, how long an unlock lasts, the disclosure and recovery line, confirm.',
                    'Progress: a six-segment line under the title, and "Step 3 of 6, Create each one" as the title\'s second line. Read out on every step change.',
                    'Back is a text button on the left; the main button on the right is Next, then Create lock on the last step.'),
             changes('On a phone the anchored panel becomes a full-height sheet from the bottom; the element stays named in the title.',
                     'The acknowledgement checkbox moves from the confirm step to step 5, beside the words it acknowledges.',
                     'Cantonese: the step name can need two lines; the title bar grows rather than truncating it.')])

# ---------- 6. Lock wizard, wide ----------
wiz_panel = lambda step, content, w=560: (
    f'<section class="dlg col" role="dialog" aria-label="Lock Kitchen lights" style="width: {w}px; flex: none; gap: 20px; padding: 24px">'
    + row('<div class="col grow"><h2 class="tl">Lock Kitchen lights</h2><span class="bs mu">Step ' + str(step + 1) + ' of 6</span></div>', ib('Close', 'Cancel locking'))
    + row(f'<div style="width: 180px; flex: none">{vsteps(STEPS, step)}</div>', col(*content, gap=12, style='flex: 1; min-width: 0'), gap=24, style='align-items: flex-start')
    + row(btn('Back', 'text', None, True), '<span class="grow"></span>', btn('Next', 'fill', None, True)) + '</section>')
totp = [
    row(tag('2 of 2', 'p'), '<span class="tm">One-time code</span>', gap=8),
    '<span class="bm mu">Add this secret to your authenticator app, then enter the code it shows. The secret is kept in this browser so codes can be checked.</span>',
    '<div class="mono bl" style="background: var(--sl1); border-radius: 16px; padding: 12px 16px; letter-spacing: 1px">JBSW Y3DP EHPK 3PXP</div>',
    row(btn('Open in an authenticator app', 'tonal', 'OpenInNew', True), btn('Copy', 'text', 'ContentCopy', True), style='flex-wrap: wrap'),
    mfield('Code from the app', '<span class="mono">482 913</span>', None, True), note('The code matched.', 'ok', 'Check')]
dur = ['<h3 class="tm">How long an unlock lasts</h3>'] + [f'<label class="li" style="min-height: 48px; padding: 4px 12px; background: var(--sl1)"><input type="radio" name="d" {"checked" if d == "A number of minutes" else ""} style="width: 20px; height: 20px; accent-color: #00639B"><span class="bm grow">{d}</span></label>' for d in ['This page only', 'Until the app is closed', 'A number of minutes']] + [mfield('Minutes', '15', None, True)]
anch = ('<div class="row" style="padding: 32px; gap: 0; align-items: flex-start; min-height: 600px">'
        + f'<div style="width: 300px; flex: none; margin-top: 40px; box-shadow: 0 0 0 3px var(--p); border-radius: 32px">{card_el()}</div>'
        + '<span aria-hidden="true" style="width: 24px; height: 3px; background: var(--p); margin: 100px 0 0; flex: none"></span>'
        + wiz_panel(2, totp) + '</div>')
wide_board(P, 'LockWizardWide', 'Lock wizard in a wide window',
           'Anchored beside the element, not a modal: the rest of the page stays visible and usable. A vertical step list shows progress.',
           col(window(anch, label='Wizard beside the element'), row(window('<div style="padding: 32px">' + wiz_panel(3, dur, 560) + '</div>', w=640, label='Duration step, dark', dark=True), gap=32), gap=32),
           [decide('The panel opens on the side of the element with more room, joined to it by a short line in the primary colour.', 'Steps listed on the left; finished steps can be reopened by choosing them.'),
            decide('The one-time code step shows the secret in groups of four, a button to open an authenticator app, and the QR code once that is built (see the locks still to build board).', 'Minutes take whole numbers from 1 to 1440; the error says exactly that.')])

# ---------- 7. Unlock, phone ----------
uhead = lambda sub: pbar('Unlock Kitchen lights', False, ib('Close', 'Cancel'), sub=sub)
steps_chips = lambda cur: row(*[f'<span class="tag{" p" if i == cur else (" g" if i < cur else "")}">{"✓ " if i < cur else ""}{t}</span>' for i, t in enumerate(['PIN', 'Code'])], gap=6)
u1 = phone(uhead('Step 1 of 2') + pbody(steps_chips(0), '<span class="bm mu" style="text-align: center">Enter the PIN</span>', pin_dots(6, 3), keypad(size=60, gap=10),
                                        row(btn('Shuffle keys', 'text', 'Shuffle', True, 'padding: 0 8px'), '<span class="grow"></span>', btn('Type instead', 'text', 'Keyboard', True, 'padding: 0 8px')),
                                        row(btn('Cancel', 'out', None, True, 'flex: 1'), btn('Submit', 'fill', None, True, 'flex: 1'), gap=8), gap=10, pad='0 16px 12px'),
           'Keypad: large keys (60 px), Clear and Backspace in the bottom row, Cancel and Submit below. Shuffle and typing are one tap away.', h=700)
u2 = phone(uhead('Step 2 of 2') + pbody(steps_chips(1), '<span class="bm">One-time code</span>', mfield('Code from your authenticator app', '<span class="mono">4829</span>', None, True),
                                        '<span class="bs mu">6 digits. Codes change every 30 seconds.</span>', row(btn('Back', 'text', None, True), '<span class="grow"></span>', btn('Submit', 'fill', None, True)), gap=10, pad='0 16px 12px')
           + '<span class="grow"></span>' + keyboard(220),
           'Manual entry with the keyboard: the steps stay in view and the PIN step shows as done.', h=700)
u3 = phone(uhead('Step 1 of 2') + pbody(steps_chips(0), note('Too many tries. Wait 15 seconds.', '', 'TimerSand'), pin_dots(6, 0), keypad(size=60, gap=10, disabled=True),
                                        '<span class="bs mu" style="text-align: center">Tries in a row: 6. The next wait is 1 minute.</span>', recovery(), gap=10, pad='0 16px 12px'),
           'After wrong tries: the keys are disabled with the wait counted down, and the recovery line is shown.', dark=True, h=700)
phone_board(P, 'UnlockPhone', 'Unlock prompt and PIN keypad on a phone',
            'A full-width sheet with a keypad of large keys. More than one credential is asked in order, shown as steps.',
            [u1, u2, u3],
            [decide('Key order is 1 to 9, then Clear, 0, Backspace. With Shuffle on, the ten digits change places each time the prompt opens; Clear and Backspace never move.',
                    'Typing is always allowed: "Type instead" swaps the keypad for a field and the keyboard, and back.',
                    'The wait after wrong tries is 5 seconds, then 15, then 1 minute, then 5 minutes, counted down on the note.'),
             changes('Cancel and Submit sit side by side under the keypad at equal width, rather than in a footer that the keyboard can push off screen.',
                     'The recovery line appears only after a wrong try, so the first view is calm.')])

# ---------- 8. Unlock, wide ----------
uw = (f'<section class="dlg col" role="dialog" aria-label="Unlock Kitchen lights" style="width: 680px; flex: none; gap: 20px; padding: 28px">'
      + row('<div class="col grow"><h2 class="tl">Unlock Kitchen lights</h2><span class="bs mu">PIN, then a one-time code</span></div>', ib('Close', 'Cancel'))
      + steps_chips(0)
      + row(col(pin_dots(6, 3), keypad(size=56, gap=10), gap=8, style='width: 300px; flex: none'),
            col('<span class="ll">Or type it</span>', mfield('PIN', '<span class="mono">• • •</span>', None, True), btn('Shuffle the keys', 'text', 'Shuffle', True),
                '<span class="bs mu">Keys and typing fill the same PIN. Enter submits.</span>', gap=12, style='flex: 1; min-width: 0'), gap=32, style='align-items: flex-start')
      + row('<span class="grow"></span>', btn('Cancel', 'out', None, True), btn('Submit', 'fill', None, True), gap=8) + '</section>')
uw_wait = (f'<section class="dlg col" role="dialog" aria-label="Unlock Kitchen lights, waiting" style="width: 420px; flex: none; gap: 16px; padding: 28px">'
           + '<h2 class="tl">Unlock Kitchen lights</h2>' + note('That did not match. Tries in a row: 4. Wait 15 seconds.', '', 'TimerSand') + recovery()
           + row('<span class="grow"></span>', btn('Cancel', 'out', None, True), btn('Submit', 'fill', None, True, 'opacity: .38'), gap=8) + '</section>')
wide_board(P, 'UnlockWide', 'Unlock prompt in a wide window',
           'Keypad and manual entry side by side, the credentials as ordered steps, and the waiting state.',
           row(window(f'<div class="row" style="padding: 40px; min-height: 560px; align-items: flex-start; background: var(--scrim)">{uw}</div>', label='Unlock prompt'),
               window(f'<div class="row" style="padding: 40px; min-height: 560px; align-items: flex-start">{uw_wait}</div>', w=520, label='Waiting, dark', dark=True), gap=32, style='align-items: flex-start'),
           [decide('The keypad is on by default where the screen is touch; with a mouse and keyboard the field has focus first.', 'Every step names its credential in the chip row: done steps get a tick and stay visible.'),
            decide('Submit is disabled during a wait and says why in the note above it.', 'The words "secure" and "security" never appear in the prompt.')])

# ---------- 9. List of locks, phone ----------
LOCKS = [('Kitchen lights', 'Card on Home', 'PIN and one-time code', 'Locked', 'LightbulbGroup'),
         ('Energy', 'Page', 'Password', 'Unlocked for now, 12 min', 'LightningBolt'),
         ('Front door', 'Card on Home', 'PIN', 'Locked', 'Lock')]
lrow = lambda n, w, how, st, ic, older=False: (
    f'<div class="li" style="background: var(--sl1); align-items: flex-start; padding: 12px">'
    f'<span class="lead">{I(ic, "s")}</span><span class="col grow" style="gap: 2px"><span class="ll">{n}</span><span class="bs mu">{w}, {how}</span>'
    f'<span class="row" style="gap: 6px; margin-top: 4px">{tag(st, "g" if st.startswith("Unlocked") else "")}{tag("Older lock", "a") if older else ""}</span></span>'
    + ib('DotsVertical', f'Actions for {n}') + '</div>')
l1 = phone(pbar('Locks', True, ib('Plus', 'Lock something')) + pbody(wfind('Search locks', 44), '<span class="bs mu">4 locks in this browser</span>', *[lrow(*x) for x in LOCKS],
                                                                   lrow('Settings page', 'Page', 'Shared PIN', 'Locked', 'Cog', True), gap=8),
           'Rows with their state; actions under each row\'s menu. An older shared-PIN lock is tagged and says why.', h=660)
l2 = phone(pbar('Locks', True) + pbody(wfind('Search locks', 44), *[lrow(*x) for x in LOCKS[:2]], gap=8) + scrim()
           + sheet('<span class="tm">Kitchen lights</span>', f'<div class="col" style="gap: 0">{mi([("LockOpenVariant", "Unlock"), ("Pencil", "Edit"), ("DeleteOutline", "Remove")])}</div>',
                   '<span class="bs mu">Lock again appears here while it is unlocked.</span>', label='Actions for Kitchen lights', gap=4), 'Row actions in a sheet: Unlock, Lock again, Edit, Remove.', h=660)
l3 = phone(pbar('Locks', True) + pbody(wfind('Search locks', 44), '<div class="col" style="align-items: center; gap: 12px; padding: 48px 16px; text-align: center">'
                                       + f'<span class="sq" style="background: var(--sl2)">{I("LockOpenVariant")}</span><span class="tm">Nothing is locked.</span>'
                                       + '<span class="bm mu">Hold any element and choose Lock, or open Lock in the page tools.</span></div>', gap=12),
           'Empty. With a search that matches nothing it says "No lock matches." instead.', dark=True, h=660)
phone_board(P, 'LockListPhone', 'List of locks on a phone',
            'Inside the Lock tool of the page tools. Search uses the pattern workbench; actions sit behind each row\'s menu.',
            [l1, l2, l3],
            [decide('A row shows the element, where it is, what unlocks it, and its state. Unlocked rows show the time left.', 'Older locks that share one PIN get an "Older lock" tag; their menu has only Unlock and Remove, and says to make a new lock to edit it.'),
             changes('Four inline buttons per row do not fit at 320 px; on a phone they move to a sheet from the row menu.', 'The empty state says how to make a lock instead of only "Nothing is locked."')])

# ---------- 10. List of locks, wide ----------
lt = table([('Element', 4), ('Unlocks with', 3), ('State', 3), ('', 5)],
           [[('Kitchen lights', 'Card on Home'), 'PIN and one-time code', tag('Locked'), btn('Unlock', 'tonal', None, True) + btn('Edit', 'text', None, True) + btn('Remove', 'text', None, True)],
            [('Energy', 'Page'), 'Password', tag('Unlocked, 12 min', 'g'), btn('Lock again', 'tonal', None, True) + btn('Edit', 'text', None, True) + btn('Remove', 'text', None, True)],
            [('Front door', 'Card on Home'), 'PIN', tag('Locked'), btn('Unlock', 'tonal', None, True) + btn('Edit', 'text', None, True) + btn('Remove', 'text', None, True)],
            [('Settings page', 'Page'), 'Shared PIN ' + tag('Older lock', 'a'), tag('Locked'), btn('Unlock', 'tonal', None, True) + btn('Remove', 'text', None, True)]],
           'Locks in this browser', lead=['LightbulbGroup', 'LightningBolt', 'Lock', 'Cog'])
lw = window('<div class="col" style="padding: 28px 32px; gap: 16px">' + row('<h2 class="tl grow">Locks in this browser</h2>', btn('Lock something', 'fill', 'Plus', True))
            + toolbar('Search locks', chip('Locked', False), chip('Unlocked for now', False), chip('Older locks', False))
            + lt + note('Older locks share one PIN. They still unlock and can be removed; to change one, remove it and lock the element again.', '', 'InformationOutline') + '</div>', label='List of locks')
wide_board(P, 'LockListWide', 'List of locks in a wide window',
           'Rows with Unlock or Lock again, Edit and Remove inline; search with the pattern workbench; filters for state and older locks.',
           lw, [decide('The first action changes with the state: Unlock when locked, Lock again when unlocked.', 'Remove asks once, naming the element; it is not the two-step confirmation, because nothing is lost but the lock.'),
                decide('Selecting several rows shows Unlock, Lock again and Remove for all of them in a bar above the table.', 'Older locks sort last and their row explains itself in the note under the table.')])
