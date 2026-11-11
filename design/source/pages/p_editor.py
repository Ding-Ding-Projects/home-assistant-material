"""Canvas 21: the dashboard editor's Dashboard tools dialog, drawn from
frontend/src/panels/lovelace/editor/dashboard-tools-dialog. Run through build_polish.py:
  python3 build_polish.py p_editor 21-dashboard-editor "Dashboard editor: Dashboard tools"
"""
from polish_lib import *

P = '21-dashboard-editor'

TABS = ['Outline', 'Replace', 'Check', 'Templates', 'Statistics']
WIDTHS = ['Full', 'Phone', 'Tablet', 'Desktop']


def cb(on, label):
    return (f'<span class="row" style="gap: 10px">{I("CheckboxMarked" if on else "CheckboxBlankOutline")}'
            f'<span class="row" style="gap: 8px">{label}</span></span>')


def ctype(t):
    return f'<code class="bs" style="color: var(--p)">{t}</code>'


def crow(on, t, label, ents=0, depth=0, nested=False):
    pad = depth * 24
    body = row(ctype(t), f'<span class="bm">{label}</span>', gap=8)
    lead = f'<span class="row" style="gap: 8px; padding-inline-start: 34px; color: var(--onv)">{body}</span>' if nested else cb(on, body)
    tail = f'<span class="bs mu">{ents} {"entity" if ents == 1 else "entities"}</span>' if ents and not nested else ''
    return f'<div class="row" style="gap: 12px; min-height: 36px; padding-inline-start: {pad}px">{lead}{tail}</div>'


def sec(t):
    return f'<div class="ls mu" style="text-transform: uppercase; letter-spacing: .04em; margin-top: 8px">{t}</div>'


def vhead(t, path, strategy=False):
    extra = tag('Made by a strategy') if strategy else ''
    return row(f'<a class="tm" style="color: var(--p); text-decoration: underline">{t}</a>', f'<code class="bs mu">/{path}</code>', extra, gap=10)


def dialog(tab, *body, w=760, sub='Work on the whole dashboard at once. Every change can be undone from the toolbar.', notice=''):
    top = (seg(TABS, tab, 'Tools')
           + row('<span class="bs mu">Preview width</span>', seg(WIDTHS, 'Full', 'Preview width'), gap=10))
    return (f'<div class="m3 col" role="dialog" aria-label="Dashboard tools" style="width: {w}px; border-radius: 28px; background: var(--sl3); padding: 24px; gap: 14px; box-shadow: var(--e3)">'
            + row('<div class="col grow" style="gap: 4px"><h2 class="hs">Dashboard tools</h2>'
                  f'<span class="bm mu">{sub}</span></div>', ib('Close', 'Close'))
            + top + notice + ''.join(body)
            + row('<span class="grow"></span>', btn('Close', 'text')) + '</div>')


def editbar():
    return (f'<div class="row" style="gap: 6px; padding: 12px 20px; background: var(--sl2)">'
            f'<span class="tl grow">Editing Home, Living room</span>'
            f'{ib("Undo", "Undo")}{ib("Redo", "Redo")}{ib("Toolbox", "Dashboard tools", "sel")}{ib("DotsVertical", "More")}'
            f'{btn("Done", "filled", None, True)}</div>')


def behind(dialog_html, h=820):
    return window(editbar(), f'<div class="col" style="position: relative; height: {h}px; padding: 24px; gap: 16px">'
                  + grid(3, *[f'<div style="height: 140px; border-radius: 20px; background: var(--sl1)"></div>' for _ in range(6)], gap=16)
                  + f'<div style="position: absolute; inset: 0; background: rgba(0,0,0,.32)"></div>'
                  f'<div style="position: absolute; inset: 0; display: grid; place-items: center">{dialog_html}</div></div>',
                  label='Dashboard in edit mode')


# ---------- 1. Outline ----------
outline = dialog(
    'Outline',
    find('Search cards, types and entities'),
    row('<span class="bs mu">2 selected</span>', btn('Select all shown', 'text', None, True), btn('Clear selection', 'text', None, True),
        btn('Duplicate', 'tonal', None, True), btn('Copy YAML', 'text', None, True), btn('Delete', 'err', None, True), gap=8),
    row(select('Move or insert into', 'Rooms › Kitchen').replace('class="field"', 'class="field" style="flex: 1"'), btn('Move here', 'fill'), gap=10),
    '<div class="col" style="gap: 2px; border-top: 1px solid var(--outv); padding-top: 10px">'
    + vhead('Home', 'home')
    + crow(True, 'entities', 'Lights', 3) + crow(False, 'tile', 'light.hall', 1)
    + crow(True, 'vertical-stack', 'Climate', 2) + crow(False, 'thermostat', 'climate.lounge', depth=1, nested=True)
    + crow(False, 'tile', 'sensor.lounge_temperature', depth=1, nested=True)
    + '</div><div class="col" style="gap: 2px; border-top: 1px solid var(--outv); padding-top: 10px">'
    + vhead('Rooms', 'rooms') + sec('Kitchen') + crow(False, 'heading', 'Kitchen') + crow(False, 'tile', 'light.kitchen', 1)
    + sec('Bedroom') + crow(False, 'media-control', 'media_player.bedroom', 1)
    + '</div><div class="col" style="gap: 2px; border-top: 1px solid var(--outv); padding-top: 10px">' + vhead('Areas', 'areas', True) + '</div>')
wide_board(P, 'DashToolsOutline', 'Dashboard tools: outline and bulk actions',
           'Opened from the toolbox button in the edit-mode toolbar. Every view, section and card, nested cards indented, with a pattern-aware search and actions on the selection.',
           behind(outline, 1060),
           [decide('Only top-level cards take a checkbox; cards inside stacks are shown for context and move with their parent.',
                   'Search matches card type, title, section, view and every entity, and accepts /pattern/flags.'),
            decide('Delete asks first and says Undo brings the cards back. Move to "New section" creates a grid section.',
                   'Clicking a view title opens that view and closes the dialog.')])

# ---------- 2. Find and replace, Check ----------
replace = dialog(
    'Replace',
    '<span class="bm">Swap one entity for another in every view, section, badge and card. Only exact entity IDs change, never names or templates.</span>',
    row(mfield('Replace entity ID', 'light.kitchen', mono=True), mfield('With entity ID', 'light.kitchen_ceiling', mono=True, focus=True), gap=12),
    '<span class="bs mu" aria-live="polite">4 places will change.</span>',
    note('light.kitchen_ceiling does not exist yet. Cards that use it will show as unavailable.', 'warn', 'AlertOutline'),
    row(btn('Replace everywhere', 'fill')), w=640)
check = dialog(
    'Check',
    '<span class="bm">4 problems found.</span>',
    ''.join(f'<div class="row" style="gap: 10px; padding: 10px 0; border-top: 1px solid var(--outv)"><span class="ll">{k}</span>'
            f'<code class="bs">{d}</code><span class="grow"></span><a class="bm" style="color: var(--p); text-decoration: underline">{v}</a></div>'
            for k, d, v in [('Entity does not exist', 'sensor.old_garage', 'Home'), ('Entity is unavailable', 'switch.fan', 'Home'),
                            ('Empty section', 'Bedroom', 'Rooms'), ('Two views share a path', 'home', 'Rooms')]), w=640)
wide_board(P, 'DashToolsReplaceCheck', 'Dashboard tools: find and replace, and the check',
           'Replacing a renamed entity across the dashboard with a live count, and the problems worth fixing before leaving edit mode.',
           row(replace, check, gap=40, style='align-items: flex-start'),
           [decide('The count updates as you type; an invalid ID says what an entity ID looks like.',
                   'A target that does not exist yet is allowed, with a warning, for entities about to be renamed.'),
            decide('The check lists missing and unavailable entities, empty views and sections, duplicate view paths and cards without a type.',
                   'Each problem links to its view.')], w=1440)

# ---------- 3. Templates, statistics, preview ----------
templates = dialog(
    'Templates',
    '<span class="bm">Save selected cards as a template, then insert copies anywhere. Templates follow your account to every dashboard.</span>',
    row(mfield('Template name', 'Room header'), btn('Save 2 cards', 'fill'), gap=12),
    select('Move or insert into', 'Rooms › New section'),
    ''.join(f'<div class="row" style="gap: 10px; padding: 10px 0; border-top: 1px solid var(--outv)"><span class="ll grow">{n}</span>'
            f'<span class="bs mu">{c}</span>{btn("Insert", "tonal", None, True)}{btn("Delete", "text", None, True)}</div>'
            for n, c in [('Room header', '2 cards'), ('Energy summary', '3 cards'), ('Doorbell', '1 card')]), w=640)
bars = ''.join(f'<div class="row" style="gap: 10px"><code class="bs" style="width: 140px; color: var(--p)">{t}</code>'
               f'<span class="grow" style="height: 8px; border-radius: 4px; background: linear-gradient(to right, var(--p) {n * 100 // 14}%, var(--outv) {n * 100 // 14}%)"></span><span class="bs">{n}</span></div>'
               for t, n in [('tile', 14), ('entities', 5), ('heading', 4), ('thermostat', 2), ('media-control', 1)])
stats = dialog(
    'Statistics',
    grid(4, *[f'<div class="col" style="padding: 12px; border-radius: 16px; background: var(--sl1)"><strong class="hs">{v}</strong><span class="bs mu">{k}</span></div>'
              for k, v in [('Views', 3), ('Sections', 5), ('Cards', 26), ('Entities', 19)]], gap=10),
    '<h3 class="tm">Card types</h3>', f'<div class="col" style="gap: 8px">{bars}</div>', w=640)
phone_view = window(editbar(), '<div class="row" style="justify-content: center; padding: 20px; background: var(--sl1)">'
                    '<div class="col" style="width: 300px; gap: 12px; outline: 1px dashed var(--out); padding: 12px">'
                    + ''.join('<div style="height: 90px; border-radius: 18px; background: var(--sl3)"></div>' for _ in range(4)) + '</div></div>',
                    label='Phone preview width')
wide_board(P, 'DashToolsTemplatesStats', 'Dashboard tools: templates, statistics and the preview width',
           'Templates are saved with the account, so they work on every dashboard. The preview width narrows the view while editing.',
           col(row(templates, stats, gap=40, style='align-items: flex-start'), phone_view, gap=32),
           [decide('Templates live in the account settings next to favourite card types; deleting one asks first.',
                   'Phone 412 px, tablet 820 px, desktop 1440 px; the narrowed view is centred with a dashed edge, and Full turns it off.')], w=1440)

# ---------- 4. Phone ----------
ph1 = phone(pbar('Dashboard tools', True, ib('Close', 'Close')) + pbody(
    f'<div style="overflow: hidden">{seg(["Outline", "Replace", "Check"], "Outline", "Tools")}</div>', f'<div style="flex: none">{wfind("Search cards", 44)}</div>',
    row('<span class="bs mu">1 selected</span>', btn('Duplicate', 'tonal', None, True), ib('Delete', 'Delete'), gap=6),
    vhead('Home', 'home'), crow(True, 'entities', 'Lights', 3), crow(False, 'tile', 'light.hall', 1), gap=10, style='overflow: hidden'),
    'On a phone the dialog fills the screen; the bulk row keeps Duplicate and Delete, the rest are in Select all shown.', h=640)
ph2 = phone(pbar('Dashboard tools', True) + pbody(
    f'<div style="overflow: hidden">{seg(["Outline", "Replace", "Check"], "Replace", "Tools")}</div>',
    mfield('Replace entity ID', 'light.kitchen', mono=True), mfield('With entity ID', 'light.kitchen_ceiling', mono=True),
    '<span class="bs mu">4 places will change.</span>', btn('Replace everywhere', 'fill'), gap=10, style='overflow: hidden'),
    'Find and replace stacks the two fields.', h=640)
ph3 = phone(pbar('Dashboard tools', True) + pbody(
    f'<div style="overflow: hidden">{seg(["Check", "Templates", "Statistics"], "Check", "Tools")}</div>',
    '<span class="bm">2 problems found.</span>',
    note('Entity does not exist: sensor.old_garage', 'warn', 'AlertOutline'), note('Empty section: Bedroom', '', 'InformationOutline'), gap=10),
    'The check in the dark scheme.', dark=True, h=640)
phone_board(P, 'DashToolsPhone', 'Dashboard tools on a phone', 'The same dialog at 320 pixels, full screen.', [ph1, ph2, ph3],
            [decide('Tabs scroll sideways; the selected one stays in view.', 'Every control is at least 40 pixels tall.')])
