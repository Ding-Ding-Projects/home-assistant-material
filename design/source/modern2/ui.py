"""Modern Home Assistant board kit: the components every redrawn board is made of.

The look follows canvas 23 (the modern remake): one navigation pane, tonal
surfaces instead of grey boxes, 28 px cards, pill controls, one tools pill and
one floating action bar per page.
"""
import html as H
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MDI = json.load(open(os.path.join(HERE, 'mdi.json')))
OUT = os.path.join(HERE, 'project')
MISSING = set()


def begin(folder):
    """Start a new canvas: boards go to out/<folder>/."""
    global OUT
    OUT = os.path.join(HERE, 'out', folder)
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    BOARDS.clear()


def I(name, size=20, cls=''):
    path = MDI.get(name)
    if path is None:
        MISSING.add(name)
        path = MDI['HelpCircleOutline']
    return (f'<svg class="i {cls}" width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true">'
            f'<path d="{path}"/></svg>')


def e(text):
    return H.escape(str(text), quote=True)


CSS = open(os.path.join(HERE, 'kit.css')).read()

# Tones: (background variable, foreground variable).
TONE = {'p': ('--pc', '--onpc'), 't': ('--tc', '--ontc'), 'g': ('--okc', '--ok'), 'w': ('--wc', '--w'),
        'e': ('--ec', '--e'), 'n': ('--s2', '--onv')}
CYCLE = 'ptgw'


def tone(t):
    b, f = TONE[t]
    return f'background:var({b});color:var({f})'


# ---------- Small parts ----------

def ico(icon, t='p', size=44, r=14, isz=22):
    return f'<div class="ico" style="{tone(t)};width:{size}px;height:{size}px;border-radius:{r}px">{I(icon, isz)}</div>'


def btn(label, kind='fill', icon=None, size=''):
    return f'<span class="btn {kind} {size}">{I(icon, 18) if icon else ""}{e(label)}</span>'


def ib(icon, on=False):
    return f'<span class="ib{" on" if on else ""}">{I(icon, 20)}</span>'


def chip(label, sel=False, icon=None):
    return f'<span class="chip{" sel" if sel else ""}">{I(icon, 16) if icon else ""}{e(label)}</span>'


def chips(*labels, sel=0):
    return '<div class="row wrap" style="gap:8px">' + ''.join(chip(l, i == sel) for i, l in enumerate(labels)) + '</div>'


def pill(label, t='n'):
    return f'<span class="pill" style="{tone(t)}">{e(label)}</span>'


def seg(labels, sel=0):
    return ('<div class="seg">' + ''.join(f'<span class="{"on" if i == sel else ""}">{e(l)}</span>' for i, l in enumerate(labels)) + '</div>')


def switch(on=True):
    return f'<span class="sw{" on" if on else ""}"><span></span></span>'


def field(label, value='', icon=None, wide=False, mono=False, raw=False):
    v = f'<span class="{"mono" if mono else ""}" style="color:var(--on)">{value if raw else e(value)}</span>' if value else ''
    return (f'<label class="fld{" grow" if wide else ""}"><span class="flab">{e(label)}</span>'
            f'<span class="fin">{I(icon, 18) if icon else ""}{v}</span></label>')


def search(placeholder='Search', kbd=None, w=None):
    st = f'width:{w}px' if w else ''
    k = f'<span class="kbd">{e(kbd)}</span>' if kbd else f'<span class="kbd" title="Pattern workbench">.*</span>'
    return f'<div class="field" style="{st}">{I("Magnify", 20)}<span class="grow">{e(placeholder)}</span>{k}</div>'


def slider(pct=60, t='p'):
    return (f'<div class="sl"><span style="width:{pct}%;background:var({TONE[t][1]})"></span>'
            f'<i style="left:calc({pct}% - 10px);background:var({TONE[t][1]})"></i></div>')


def bar(pct, t='p'):
    return f'<div class="bar"><span style="width:{pct}%;background:var({TONE[t][1]})"></span></div>'


def avatar(text, t='t', size=40):
    return f'<span class="av" style="{tone(t)};width:{size}px;height:{size}px;font-size:{size * .36:.0f}px">{e(text)}</span>'


def kv(pairs):
    return ('<div class="kv">' + ''.join(f'<span class="mu">{e(k)}</span><b>{v}</b>' for k, v in pairs) + '</div>')


def code(text, lang=''):
    lines = text.strip('\n').split('\n')
    body = ''.join(f'<div><i>{n + 1}</i>{e(l) or "&nbsp;"}</div>' for n, l in enumerate(lines))
    return f'<div class="code">{body}</div>'


def stat(value, label, t=None, icon=None):
    st = tone(t) if t else ''
    i = I(icon, 20) if icon else ''
    return (f'<div class="stat" style="{st}"><div class="row" style="gap:8px">{i}<span class="xs lbl" style="color:inherit;opacity:.8">{e(label)}</span></div>'
            f'<b>{value}</b></div>')


def stats(*items):
    return '<div class="grid" style="grid-template-columns:repeat(%d,1fr)">' % len(items) + ''.join(stat(*i) for i in items) + '</div>'


def spark(points, t='p', h=120, fill=True, w=600):
    n = len(points)
    mx, mn = max(points), min(points)
    rng = (mx - mn) or 1
    xy = [(i * w / (n - 1), h - 8 - (p - mn) / rng * (h - 16)) for i, p in enumerate(points)]
    d = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in xy)
    col = f'var({TONE[t][1]})'
    area = f'<path d="{d} L{w},{h} L0,{h} Z" fill="{col}" opacity=".12"/>' if fill else ''
    return (f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="none" style="width:100%;height:{h}px;display:block" aria-hidden="true">'
            f'{area}<path d="{d}" fill="none" stroke="{col}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>')


def bars(values, t='p', h=140, labels=None):
    mx = max(values) or 1
    cells = ''.join(f'<div class="col" style="flex:1;gap:6px;align-items:center;justify-content:flex-end"><span class="vbar" style="animation-delay:{.25 + i * .04:.2f}s;width:70%;height:{v / mx * (h - 22):.0f}px;border-radius:8px 8px 4px 4px;background:var({TONE[t if i % 3 else "t"][1]});opacity:{.55 + .45 * (v / mx):.2f}"></span>'
                    + (f'<span class="xs mu">{e(labels[i])}</span>' if labels else '') + '</div>' for i, v in enumerate(values))
    return f'<div class="row" style="height:{h}px;gap:4px;align-items:stretch">{cells}</div>'


def timeline(rows):
    """rows: (label, [(start%, end%, tone, text)])"""
    out = ''
    for label, segs in rows:
        s = ''.join(f'<span style="left:{a}%;width:{b - a}%;{tone(t)}">{e(x)}</span>' for a, b, t, x in segs)
        out += f'<div class="tl"><span class="sm">{e(label)}</span><div class="tlr">{s}</div></div>'
    return f'<div class="col" style="gap:10px">{out}</div>'


def ring(pct, label, t='p', size=120):
    r = 46
    c = 2 * 3.1416 * r
    return (f'<div style="position:relative;width:{size}px;height:{size}px"><svg viewBox="0 0 100 100" width="{size}" height="{size}" aria-hidden="true">'
            f'<circle cx="50" cy="50" r="{r}" fill="none" stroke="var(--s3)" stroke-width="8"/>'
            f'<circle cx="50" cy="50" r="{r}" fill="none" stroke="var({TONE[t][1]})" stroke-width="8" stroke-linecap="round" stroke-dasharray="{c * pct / 100:.1f} {c:.1f}" transform="rotate(-90 50 50)"/></svg>'
            f'<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><b style="font-size:{size * .2:.0f}px">{e(label)}</b></div></div>')


# ---------- Blocks ----------

def card(*parts, pad=22, gap=14, style='', title=None, action=''):
    head = (f'<div class="row" style="gap:10px;margin-bottom:2px"><b class="h3 grow">{e(title)}</b>{action}</div>' if title else '')
    return f'<div class="card col" style="padding:{pad}px;gap:{gap}px;{style}">{head}{"".join(parts)}</div>'


def hero(icon, title, sub, t='p', action='', label=''):
    lab = f'<span class="lbl" style="color:inherit;opacity:.8">{e(label)}</span>' if label else ''
    return (f'<div class="hero row" style="{tone(t)}"><div class="ico" style="background:rgba(255,255,255,.55);color:inherit;width:56px;height:56px;border-radius:18px">{I(icon, 28)}</div>'
            f'<div class="col grow" style="gap:2px">{lab}<span class="h2" style="color:var(--on)">{e(title)}</span><span class="sm onv">{e(sub)}</span></div>{action}</div>')


def tile(icon, title, sub='', t='p', trail='chev', big=None):
    tr = I('ChevronRight', 20, 'mu') if trail == 'chev' else (trail or '')
    b = f'<div style="font-size:30px;font-weight:600;letter-spacing:-.02em">{e(big)}</div>' if big else ''
    return (f'<div class="tile row" style="gap:14px">{ico(icon, t)}<div class="col grow" style="gap:2px"><b>{e(title)}</b>'
            f'<span class="sm mu">{e(sub)}</span>{b}</div>{tr}</div>')


def tiles(items, cols=3):
    return (f'<div class="grid" style="grid-template-columns:repeat({cols},1fr)">'
            + ''.join(tile(*it[:3], t=it[3] if len(it) > 3 else CYCLE[i % 4]) if len(it) <= 4 else tile(*it) for i, it in enumerate(items)) + '</div>')


def lrow(icon, title, sub='', trail='', t='p', avatar_text=None):
    lead = avatar(avatar_text, t) if avatar_text else ico(icon, t, 40, 13, 20)
    return (f'<div class="lr row">{lead}<div class="col grow" style="gap:1px;min-width:0"><b>{e(title)}</b>'
            f'<span class="sm mu ell">{e(sub)}</span></div>{trail}</div>')


def lst(rows, title=None, action=''):
    inner = ''.join(lrow(*r) if isinstance(r, tuple) else r for r in rows)
    return card(f'<div class="col" style="gap:2px">{inner}</div>', title=title, action=action, pad=12, gap=8)


def table(cols, rows, widths=None, sel=None, toolbar=True, group=None):
    widths = widths or ['1fr'] * len(cols)
    tmpl = ' '.join(widths)
    tb = ''
    if toolbar:
        tb = (f'<div class="row" style="gap:10px;padding:6px 6px 14px">{search("Search " + cols[0].lower(), w=360)}'
              f'{chip("Filters", icon="FilterVariant")}{chip("Group", icon="Group")}{chip("Sort", icon="SortAscending")}<span class="grow"></span>'
              f'{ib("TableCog")}</div>')
    head = f'<div class="trh" style="grid-template-columns:40px {tmpl}"><span></span>' + ''.join(f'<span>{e(c)}</span>' for c in cols) + '</div>'
    body = ''
    if group:
        body += f'<div class="tgrp">{e(group)}</div>'
    for i, r in enumerate(rows):
        s = sel and i in sel
        body += (f'<div class="tr{" sel" if s else ""}" style="grid-template-columns:40px {tmpl}"><span class="cb{" on" if s else ""}">{I("Check", 14) if s else ""}</span>'
                 + ''.join(f'<span class="ell">{c}</span>' for c in r) + '</div>')
    return card(tb + head + body, pad=14, gap=0)


def form(sections):
    """sections: [(title, sub, [rows])]; a row is (label, help, control)."""
    out = ''
    for title, sub, rows in sections:
        rr = ''.join(f'<div class="frow row"><div class="col grow" style="gap:2px"><b>{e(l)}</b><span class="sm mu">{e(h)}</span></div>{c}</div>' for l, h, c in rows)
        out += card(f'<div class="col">{rr}</div>', title=title, pad=18, gap=6) if title else card(rr, pad=18)
    return f'<div class="col" style="gap:16px">{out}</div>'


def empty(icon, title, sub, action=''):
    return (f'<div class="col" style="align-items:center;text-align:center;padding:40px 0;gap:10px">'
            f'<div class="empty-art" style="width:88px;height:88px;border-radius:28px;background:linear-gradient(135deg,var(--pc),var(--tc));display:grid;place-items:center;color:var(--p)">{I(icon, 42)}</div>'
            f'<b class="h2" style="margin-top:8px">{e(title)}</b><span class="onv" style="max-width:460px">{e(sub)}</span>{action}</div>')


def actionbar(*buttons, note='No unsaved changes'):
    return (f'<div class="abar"><span class="sm" style="padding:0 14px;opacity:.75">{e(note)}</span>{"".join(buttons)}</div>')


def abtn(label, icon, primary=False, dim=False):
    st = 'background:var(--surf);color:var(--on)' if primary else 'color:var(--surf)'
    if dim:
        st += ';opacity:.45'
    return f'<span class="btn" style="{st}">{I(icon, 18)}{e(label)}</span>'


def steps(labels, cur):
    out = ''
    for i, l in enumerate(labels):
        state = 'done' if i < cur else ('cur' if i == cur else '')
        mark = I('Check', 16) if i < cur else str(i + 1)
        out += f'<div class="stp {state}"><span>{mark}</span><b>{e(l)}</b></div>'
    return f'<div class="stps">{out}</div>'


def grid(cols, *parts, gap=16, align='stretch'):
    c = cols if isinstance(cols, str) else f'repeat({cols},1fr)'
    return f'<div class="grid" style="grid-template-columns:{c};gap:{gap}px;align-items:{align}">{"".join(parts)}</div>'


def row(*parts, gap=12, align='center', style=''):
    return f'<div class="row" style="gap:{gap}px;align-items:{align};{style}">{"".join(parts)}</div>'


def col(*parts, gap=12, style=''):
    return f'<div class="col" style="gap:{gap}px;{style}">{"".join(parts)}</div>'


def note(text, t='p', icon='InformationOutline'):
    return f'<div class="note row" style="{tone(t)}">{I(icon, 20)}<span class="grow sm">{text}</span></div>'


def lbl(text):
    return f'<div class="lbl">{e(text)}</div>'


# ---------- Dialogs and overlays ----------

def dialog(title, body, icon=None, t='p', w=560, actions=None, sub=''):
    ic = ico(icon, t, 48, 16, 24) if icon else ''
    acts = actions if actions is not None else btn('Cancel', 'txt') + btn('Save', 'fill')
    s = f'<span class="sm mu">{e(sub)}</span>' if sub else ''
    return (f'<div class="dlg" style="width:{w}px"><div class="row" style="gap:14px;align-items:flex-start">{ic}<div class="col grow" style="gap:2px"><b class="h2">{e(title)}</b>{s}</div>{ib("Close")}</div>'
            f'<div class="col" style="gap:14px">{body}</div><div class="row" style="gap:8px;justify-content:flex-end">{acts}</div></div>')


def over(page, *layers):
    return (f'<div style="position:relative;height:100%">{page}<div class="scrim"></div>'
            f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:24px">{"".join(layers)}</div></div>')


def menu(items, title=None, w=280):
    t = f'<div class="lbl" style="padding:8px 14px">{e(title)}</div>' if title else ''
    out = ''
    for it in items:
        if it == '-':
            out += '<div class="msep"></div>'
            continue
        icon, label, *rest = it
        sel = rest and rest[0] == 'sel'
        k = f'<span class="kbd">{e(rest[0])}</span>' if rest and rest[0] not in ('sel', 'danger') else ''
        col_ = 'color:var(--e)' if rest and rest[0] == 'danger' else ''
        out += f'<div class="mi{" sel" if sel else ""}" style="{col_}">{I(icon, 20)}<span class="grow">{e(label)}</span>{k}{I("Check", 18) if sel else ""}</div>'
    return f'<div class="menu" style="width:{w}px">{t}{out}</div>'


# ---------- Shell ----------

NAV = [('Home', 'Overview'), ('Map', 'Map'), ('PlayBoxMultiple', 'Media'), ('FormatListBulleted', 'Activity'),
       ('ChartBox', 'History'), ('LightningBolt', 'Energy'), ('Calendar', 'Calendar'), ('ClipboardList', 'To-do lists')]
SYS = [('HammerWrench', 'Developer', ''), ('Cog', 'Settings', '5'), ('Bell', 'Notifications', '2')]


def nav(active='Settings', mini=False, extra=None):
    items = list(NAV)
    if extra and extra not in [l for _, l in items] and extra not in [l for _, l, _ in SYS]:
        items.append(extra if isinstance(extra, tuple) else ('Tab', extra))
    pages = ''.join(
        f'<div class="ni{" act" if l == active else ""}">{I(ic, 22)}{"" if mini else e(l)}'
        + ('' if mini else (I('Close', 18, 'x') if l == active else (I('Pin', 16, 'x') if l == 'Overview' else ''))) + '</div>'
        for ic, l in items)
    sys_ = ''.join(
        f'<div class="ni{" act" if l == active else ""}">{I(ic, 22)}{"" if mini else e(l)}'
        + (f'<span class="badge" style="{"position:absolute;top:4px;right:6px" if mini else "margin-left:auto"}">{b}</span>' if b else '') + '</div>'
        for ic, l, b in SYS)
    tog = I('ChevronDoubleRight' if mini else 'ChevronDoubleLeft', 20)
    head = (f'<div class="row" style="gap:6px;{"flex-direction:column" if mini else "justify-content:space-between"};padding:2px 2px 12px">'
            + ('' if mini else f'<div class="row" style="gap:12px"><div class="logo">{I("Home", 22)}</div><div class="col"><b style="font-size:15px">Home</b><span class="xs mu">Home Assistant</span></div></div>')
            + f'<div class="row" style="gap:2px;{"flex-direction:column" if mini else ""}"><span class="ib">{I("DockWindow", 20)}</span><span class="ib">{tog}</span></div></div>')
    srch = (f'<span class="ib" style="background:var(--s2)">{I("Magnify", 20)}</span>' if mini else
            f'<div class="field" style="height:44px;margin-bottom:10px">{I("Magnify", 20)}<span class="grow">Search</span><span class="kbd">Ctrl K</span></div>')
    sec = (lambda t: '') if mini else (lambda t: f'<div class="nsec lbl">{t}</div>')
    foot = (f'<div class="row" style="gap:10px;padding:10px 4px 2px;{"flex-direction:column" if mini else ""}">{avatar("TO")}'
            + ('' if mini else '<div class="col grow"><b style="font-size:14px">Test Owner</b><span class="xs mu">Owner</span></div>')
            + f'<span class="ib">{I("Microphone", 20)}</span></div>')
    return (f'<div class="nav col{" mini" if mini else ""}">{head}{srch}{sec("Pages")}{pages}'
            f'<div class="ni" style="color:var(--p)">{I("Plus", 22)}{"" if mini else "New tab"}</div><div class="grow"></div>{sec("System")}{sys_}{foot}</div>')


def tools(*extra):
    ex = ''.join(ib(x) for x in extra)
    sep = '<span class="vsep"></span>' if extra else ''
    return (f'<div class="toolpill">{ex}{sep}{ib("FormatPaint")}{ib("History")}{ib("ShareVariant")}{ib("LockOutline")}'
            f'<span class="vsep"></span>{ib("HelpCircleOutline")}{ib("DotsVertical")}</div>')


def header(title, sub='', crumb='', right=None, tabs=None, back=False):
    c = f'<div class="row xs mu" style="gap:6px;margin-bottom:6px">{e(crumb)}</div>' if crumb else ''
    s = f'<div class="onv" style="font-size:15px;margin-top:6px">{e(sub)}</div>' if sub else ''
    b = f'<span class="ib" style="margin-right:4px">{I("ArrowLeft", 22)}</span>' if back else ''
    r = tools() if right is None else right
    tb = f'<div style="margin-top:18px">{seg(tabs[0], tabs[1])}</div>' if tabs else ''
    return (f'<div class="row" style="gap:20px;align-items:flex-start;margin-bottom:24px">{b}<div class="grow">{c}<div class="h1">{e(title)}</div>{s}{tb}</div>'
            f'{r}</div>')


def window(content, active='Settings', mini=False, w=1440, h=900, extra=None, bare=False):
    navh = '' if bare else nav(active, mini, extra)
    return (f'<div class="win row" style="width:{w}px;height:{h}px">{navh}'
            f'<div class="pg grow">{content}</div></div>')


def phone(content, title='', active='Home', back=False, dark=False, top=True, sheet=''):
    tp = (f'<div class="row" style="gap:8px;padding:54px 16px 10px">'
          + (f'<span class="ib">{I("ArrowLeft", 22)}</span>' if back else '')
          + f'<div class="h2 grow">{e(title)}</div>{ib("Magnify")}{ib("DotsVertical")}</div>') if top else '<div style="height:54px"></div>'
    items = [('Home', 'Home'), ('Magnify', 'Search'), ('TabPlus', 'Pages'), ('Cog', 'Settings'), ('Menu', 'Menu')]
    bn = '<div class="bnav">' + ''.join(f'<div class="bi{" act" if l == active else ""}"><span class="pi">{I(ic, 22)}</span>{l}</div>' for ic, l in items) + '</div>'
    return f'<div class="phone{" root dark" if dark else ""}">{tp}<div class="col" style="padding:0 16px;gap:12px">{content}</div>{sheet}{bn}</div>'


# ---------- Boards ----------

BOARDS = []


def board(name, title, page, content, w=1536, h=None, dark=False, caption=None, phones=False):
    if h is None:
        h = 1000 if phones else 1060
    cap = f'<div class="btitle">{e(caption or title)}</div>'
    doc = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{e(title)}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600;700&amp;display=swap">
<style>{CSS}</style>
</helmet>
<div class="root{' dark' if dark else ''}" style="width:100%;min-height:{h}px;padding:48px;position:relative;overflow:hidden">
{cap}{content}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
    open(os.path.join(OUT, name + '.dc.html'), 'w').write(doc)
    BOARDS.append((name, title, page, w, h))


def page_board(name, title, page, content, active='Settings', mini=False, dark=False, extra=None, caption=None):
    if extra:
        active = extra[1] if isinstance(extra, tuple) else extra
    board(name, title, page, window(content, active, mini, extra=extra), dark=dark, caption=caption)


def phone_board(name, title, page, phones, dark=False, caption=None):
    body = '<div class="row" style="gap:48px;align-items:flex-start;padding-left:10px">' + ''.join(phones) + '</div>'
    board(name, title, page, body, w=1440, dark=dark, caption=caption, phones=True)


def write_index(title, pages, first):
    idx = {'v': 3, 'createdOnFiles': {'v': 1, 'at': '2026-11-12T21:00:00Z'}, 'title': title,
           'launch': {'view': 'canvas', 'page': pages[0][0]}, 'pages': [{'id': p, 'name': n} for p, n in pages],
           'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
    pos = {}
    counts = {}
    for name, t, pg, w, h in BOARDS:
        fn = 'Main.dc.html' if name == first else name + '.dc.html'
        if name == first:
            os.replace(os.path.join(OUT, name + '.dc.html'), os.path.join(OUT, fn))
        x, y, rowh, c = pos.get(pg, (0, 0, 0, 0))
        if c == 3:
            x, y, rowh, c = 0, y + rowh + 200, 0, 0
        idx['boards'][fn] = {'x': x, 'y': y, 'w': w, 'h': h, 'title': t, 'expand': 'fill', 'page': pg}
        idx['order'].append(fn)
        pos[pg] = (x + w + 120, y, max(rowh, h), c + 1)
        counts[pg] = counts.get(pg, 0) + 1
    for p, n in pages:
        idx['notes']['t-' + p] = {'x': 0, 'y': -320, 'text': f'{n}. {counts.get(p, 0)} boards, modern.', 'kind': 'title1', 'maxW': 4800, 'page': p}
    json.dump(idx, open(os.path.join(OUT, 'canvas.json'), 'w'), indent=2)
    if MISSING:
        print('missing icons:', sorted(MISSING), file=sys.stderr)
    print(len(BOARDS), 'boards')


def live(text='Live'):
    return f'<span class="row sm" style="gap:8px;color:var(--ok);font-weight:600"><span class="live"></span>{e(text)}</span>'


def busy(h=8):
    return f'<div class="busy" style="height:{h}px;border-radius:{h // 2}px"></div>'
