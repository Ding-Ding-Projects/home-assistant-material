"""Helpers that write artboard sources (*.src.html) for the page boards.

Each page is described with small building blocks so that every board uses the
same spacing, type and components as the hand-written boards.
"""
import os

# The folder that holds the *.src.html artboard sources.
SRC = os.environ.get('DESIGN_SRC', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
FOOT = 'Home Assistant Material 2026.11.1.42, updated 9 November 2026 at 21:14:07 EST'
BOARDS = []  # (canvas page, name, title, width, height or None for measured)


def I(name, cls=''):
    return f"@@I:{name}{'.' + cls if cls else ''}@@"


def sw(on, label):
    return f"@@SW:{'on' if on else 'off'}|{label}@@"


def info(label):
    return f"@@INFO:{label}@@"


def btn(label, kind='tonal', icon=None, sm=False, style=''):
    st = f' style="{style}"' if style else ''
    return f'<button class="btn {kind}{" sm" if sm else ""}"{st}>{I(icon, "s") if icon else ""}{label}</button>'


def ib(icon, label, cls=''):
    return f'<button class="ib{" " + cls if cls else ""}" aria-label="{label}">{I(icon)}</button>'


def chip(label, sel=False, icon=None):
    ic = I('Check', 's') if sel and not icon else (I(icon, 's') if icon else '')
    return f'<button class="chip{" sel" if sel else ""}" aria-pressed="{str(sel).lower()}">{ic}{label}</button>'


def tag(text, tone=''):
    return f'<span class="tag{" " + tone if tone else ""}">{text}</span>'


def seg(items, sel, label):
    out = ''
    for i in items:
        c = ' class="sel"' if i == sel else ''
        out += f'<button{c} aria-pressed="{str(i == sel).lower()}">{i}</button>'
    return f'<div class="seg" role="group" aria-label="{label}">{out}</div>'


def find(placeholder, width='', grow=True):
    st = f' style="width: {width}"' if width else ''
    return (f'<div class="find{" grow" if grow and not width else ""}"{st}><span class="row grow" style="gap: 12px">{I("Magnify")}'
            f'<span class="bl">{placeholder}</span></span>'
            f'<button class="ib" style="width: 40px; height: 40px" aria-label="Build a pattern search">{I("Regex")}</button></div>')


def row(*kids, gap=12, style='', cls=''):
    return f'<div class="row{" " + cls if cls else ""}" style="gap: {gap}px{"; " + style if style else ""}">{"".join(kids)}</div>'


def frow(*kids, gap=12):
    """Fields side by side, sharing the width."""
    return row(*[f'<div class="col grow">{k}</div>' for k in kids], gap=gap, style='align-items: stretch')


def col(*kids, gap=12, style='', cls='', tagname='div', label=''):
    al = f' aria-label="{label}"' if label else ''
    return f'<{tagname} class="col{" " + cls if cls else ""}"{al} style="gap: {gap}px{"; " + style if style else ""}">{"".join(kids)}</{tagname}>'


def head(title, sub='', *actions, size='hl'):
    s = f'<p class="bl mu">{sub}</p>' if sub else ''
    return (f'<div class="row" style="gap: 12px; flex-wrap: wrap; align-items: flex-end">'
            f'<div class="col grow" style="gap: 6px; min-width: 280px"><h1 class="{size}">{title}</h1>{s}</div>{"".join(actions)}</div>')


def toolbar(placeholder, *chips, right=None):
    """A list's own search with its pattern button, filters, and the tools every list has:
    select many, choose columns, export."""
    if right is None:
        right = ib('CheckboxMultipleOutline', 'Select many') + ib('TableCog', 'Choose columns') + ib('Export', 'Export this list')
    return row(find(placeholder, width='320px'), *chips, '<span class="grow"></span>', right, style='flex-wrap: wrap')


def table(cols, data, label, lead=None):
    """cols: [(heading, css flex)], data: rows of cells; cell 0 may be (title, sub).
    lead: icon per row, or one icon for all."""
    hdr = ''.join(f'<span style="flex: {f}; min-width: 0">{h}</span>' for h, f in cols)
    pad = '<span style="width: 20px; flex: none"></span>' + ('<span style="width: 40px; flex: none"></span>' if lead else '')
    out = [f'<div class="row bs mu" style="gap: 16px; padding: 0 16px 4px">{pad}{hdr}</div>']
    for n, r in enumerate(data):
        cells = []
        for c, (h, f) in zip(r, cols):
            if isinstance(c, tuple):
                c = f'<span class="col" style="min-width: 0"><span class="ll">{c[0]}</span><span class="bs mu">{c[1]}</span></span>'
            elif cols.index((h, f)) == 0:
                c = f'<span class="ll">{c}</span>'
            cells.append(f'<span class="bm" style="flex: {f}; min-width: 0; display: flex; align-items: center; gap: 8px">{c}</span>')
        ic = ''
        if lead:
            ic = f'<span class="lead">{I(lead[n] if isinstance(lead, list) else lead)}</span>'
        box = f'<input type="checkbox" aria-label="Select row {n + 1}" style="width: 20px; height: 20px; accent-color: #00639B; flex: none">'
        out.append(f'<div class="li" role="row" style="background: var(--sl1)">{box}{ic}{"".join(cells)}</div>')
    return f'<div class="col" role="table" aria-label="{label}" style="gap: 4px">{"".join(out)}</div>'


def setting(icon, title, desc, control=''):
    """One setting: what it is, what it does, its control, and its own information button."""
    d = f'<span class="bs mu">{desc}</span>' if desc else ''
    tip = f'<button class="ib" style="width: 28px; height: 28px" aria-label="About {title}">{I("InformationOutline", "s")}</button>'
    return (f'<div class="li"><span class="lead">{I(icon)}</span><span class="col grow"><span class="row" style="gap: 2px"><span class="ll">{title}</span>{tip}</span>{d}</span>{control}</div>')


def group(title, *items, note='', style=''):
    t = f'<h2 class="tm" style="padding: 0 16px 4px">{title}</h2>' if title else ''
    n = f'<span class="bs mu" style="padding: 4px 16px 0">{note}</span>' if note else ''
    return (f'<section class="card col" aria-label="{title or "Options"}" style="gap: 4px; padding: 20px 12px{"; " + style if style else ""}">'
            f'{t}{"".join(items)}{n}</section>')


def card(*kids, label='', style='', cls='', gap=12):
    al = f' aria-label="{label}"' if label else ''
    return f'<section class="card col{" " + cls if cls else ""}"{al} style="gap: {gap}px{"; " + style if style else ""}">{"".join(kids)}</section>'


def stat(label, value, sub='', tone='', icon=None, size='hs'):
    tones = {'p': 'background: var(--pc); color: var(--on-pc)', 'g': 'background: var(--greenc); color: var(--green)',
             'a': 'background: var(--amberc); color: var(--amber)', 'e': 'background: var(--errc); color: var(--on-errc)',
             't': 'background: var(--tc); color: var(--on-tc)', 'h': 'background: var(--heatc); color: var(--heat)'}
    ic = I(icon) if icon else ''
    m = '' if tone else ' mu'
    s = f'<span class="bs{m}">{sub}</span>' if sub else ''
    return (f'<section class="card col" aria-label="{label}" style="gap: 4px; padding: 24px; {tones.get(tone, "")}">'
            f'<div class="row" style="gap: 10px">{ic}<span class="ll{m} grow">{label}</span></div><span class="{size}">{value}</span>{s}</section>')


def grid(n, *kids, gap=16, style=''):
    return f'<div style="display: grid; grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px{"; " + style if style else ""}">{"".join(kids)}</div>'


def field(label, value, icon=None, cls='', mono=False, style=''):
    ic = I(icon, 's') if icon else ''
    st = f' style="{style}"' if style else ''
    return (f'<label class="field{" " + cls if cls else ""}"{st}>{ic}<span class="col grow"><span class="bs mu">{label}</span>'
            f'<span class="bl{" mono" if mono else ""}">{value}</span></span></label>')


def select(label, value):
    return (f'<label class="field"><span class="col grow"><span class="bs mu">{label}</span><span class="bl">{value}</span></span>'
            f'{I("MenuDown")}</label>')


def note(text, tone='', icon='InformationOutline'):
    return f'<div class="note{" " + tone if tone else ""}">{I(icon)}<span class="bm">{text}</span></div>'


def fab(label, icon='Plus'):
    return f'<button class="btn fill lg rs" style="align-self: flex-end">{I(icon)}{label}</button>'


def slider(label, pct, value=''):
    return (f'<div class="slide" role="slider" tabindex="0" aria-label="{label}" aria-valuemin="0" aria-valuemax="100" '
            f'aria-valuenow="{pct}"><b style="width: {pct}%"></b><i></i>'
            + (f'<span class="ll" style="position: absolute; right: 20px">{value}</span>' if value else '') + '</div>')


def track(pct, label, tone=''):
    c = f' style="width: {pct}%; background: var(--{tone})"' if tone else f' style="width: {pct}%"'
    return f'<div class="track" role="img" aria-label="{label}"><b{c}></b></div>'


def tile(icon, title, sub, on=False, tone='pc'):
    st = f'background: var(--{tone}); color: var(--on-{tone})' if on else 'background: var(--sl2)'
    lead = 'background: var(--sl0); color: inherit' if on else ''
    return (f'<button class="li" style="{st}; min-height: 72px"><span class="lead" style="{lead}">{I(icon)}</span>'
            f'<span class="col grow"><span class="ll">{title}</span><span class="bs{"" if on else " mu"}">{sub}</span></span></button>')


def tabs(items, sel, label='Sections'):
    out = ''.join(f'<button class="pt{" sel" if i == sel else ""}" role="tab" aria-selected="{str(i == sel).lower()}">{i}</button>' for i in items)
    return f'<div class="row" role="tablist" aria-label="{label}" style="gap: 4px; flex-wrap: wrap">{out}</div>'


def shell(page, name, title, rail, tab, body, h=None, dark=False, pad='20px 48px 8px', gap=24):
    """A top-level page in the app frame. The height is measured, and is at least 900."""
    hh = h or 400
    src = (f"@@HEAD:{title}{'|dark' if dark else ''}@@\n@@SHELL:{rail}|{tab}|{hh}@@\n"
           f'<div class="col grow" style="padding: {pad}; gap: {gap}px">\n{body}\n</div>\n'
           f"@@/SHELL:{FOOT}@@\n@@TAIL:1440,{hh}@@\n")
    open(os.path.join(SRC, name + '.src.html'), 'w').write(src)
    BOARDS.append((page, name, title, 1440, h))


def surf(page, name, title, crumb, heading, body, w=1200, h=None, pad='8px 40px 40px', gap=20):
    hh = h or 400
    foot = (f'<div class="row bs mu" style="gap: 12px; flex-wrap: wrap; padding-top: 4px"><span class="grow">{FOOT}</span>'
            f'<span class="row" style="gap: 6px">{I("Translate", "s")}English, playfulness 5</span>'
            f'<span class="row" style="gap: 6px">{I("CursorDefaultClick", "s")}Right-click anything to edit its appearance or lock it</span></div>')
    body = body + foot
    src = (f"@@HEAD:{title}@@\n@@SURF:{crumb}|{heading}|{hh}@@\n"
           f'<div class="col grow" style="padding: {pad}; gap: {gap}px">\n{body}\n</div>\n'
           f"@@/SURF@@\n@@TAIL:{w},{hh}@@\n")
    open(os.path.join(SRC, name + '.src.html'), 'w').write(src)
    BOARDS.append((page, name, title, w, h))


def bare(page, name, title, body, w=1200, h=None, dark=False, style='padding: 32px; gap: 24px; align-items: flex-start; flex-wrap: wrap'):
    """A board without the app frame: dialogs side by side, or a standalone page."""
    hh = h or 400
    src = (f"@@HEAD:{title}{'|dark' if dark else ''}@@\n"
           f'<div class="row" style="min-height: {hh}px; {style}">\n{body}\n</div>\n'
           f"@@TAIL:{w},{hh}@@\n")
    open(os.path.join(SRC, name + '.src.html'), 'w').write(src)
    BOARDS.append((page, name, title, w, h))


def dlg(title, *kids, sub='', actions='', w=360, icon=None, more=True):
    """An entity dialog: header with close, name, history, settings and more; the controls; then the
    row every dialog ends with: its own search with a pattern button, edit appearance, and lock."""
    s = f'<span class="bs mu">{sub}</span>' if sub else ''
    def hb(icon_, label_):
        return f'<button class="ib" style="width: 40px; height: 40px" aria-label="{label_}">{I(icon_, "s")}</button>'
    head_ = (f'<header class="row" style="gap: 2px">{hb("Close", "Close")}'
             f'<div class="col grow" style="padding: 0 6px"><h2 class="tm">{title}</h2>{s}</div>'
             + (hb('History', 'History of ' + title) + hb('Cog', 'Settings of ' + title) + hb('DotsVertical', 'More for ' + title) if more else '') + '</header>')
    a = f'<div class="row" style="gap: 8px; justify-content: center; flex-wrap: wrap">{actions}</div>' if actions else ''
    foot = (f'<div class="row" style="gap: 4px; padding-top: 4px"><div class="find grow" style="height: 40px; padding-right: 4px"><span class="row grow" style="gap: 8px">{I("Magnify", "s")}'
            f'<span class="bs">Search this dialog</span></span><button class="ib" style="width: 32px; height: 32px" aria-label="Build a pattern search for {title}">{I("Regex", "s")}</button></div>'
            + hb('FormatPaint', 'Edit the appearance of ' + title) + hb('LockOutline', 'Lock ' + title) + '</div>')
    return (f'<section class="dlg col" role="dialog" aria-label="{title}" style="width: {w}px; flex: 1 1 {w}px; gap: 16px; padding: 16px 16px 16px">'
            f'{head_}{"".join(kids)}{a}{foot}</section>')


def big(value, sub='', tone=''):
    st = f' style="color: var(--{tone})"' if tone else ''
    s = f'<span class="bm mu">{sub}</span>' if sub else ''
    return f'<div class="col" style="align-items: center; gap: 2px; padding: 8px 0"><span class="dm"{st}>{value}</span>{s}</div>'


def round_btn(icon, label, kind='t', size=56):
    return f'<button class="ib {kind}" aria-label="{label}" style="width: {size}px; height: {size}px; border-radius: {size // 2}px">{I(icon)}</button>'


def kv(*pairs):
    out = ''.join(f'<div class="row" style="gap: 12px; padding: 6px 4px"><span class="bm mu grow">{k}</span><span class="ll">{v}</span></div>' for k, v in pairs)
    return f'<div class="col" style="gap: 0">{out}</div>'
