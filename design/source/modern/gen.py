"""Home Assistant Material, modern remake: hand-drawn boards for the Design canvas."""
import json, os

ICONS = json.load(open(os.path.join(os.path.dirname(__file__), 'icons.json')))
OUT = os.path.join(os.path.dirname(__file__), 'project')


def I(name, size=20, cls=''):
    return (f'<svg class="i {cls}" width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true">'
            f'<path d="{ICONS[name]}"/></svg>')


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
.root{--bg:#eef2f8;--surf:#ffffff;--s1:#f5f7fb;--s2:#edf1f7;--s3:#e3e9f2;--on:#14171c;--onv:#4a505c;--mu:#6e7482;--out:#d6dbe5;
--p:#2155d6;--onp:#fff;--pc:#dce4ff;--onpc:#0b2a78;--t:#7a4fc0;--tc:#efe3ff;--ontc:#3a1a73;--w:#9a5b00;--wc:#ffe9c7;--onwc:#4d2c00;
--e:#c4321f;--ec:#ffe1dc;--ok:#1d7a45;--okc:#d4f4df;--sh:0 1px 2px rgba(20,30,60,.06),0 8px 24px rgba(20,30,60,.08);
--shl:0 2px 6px rgba(20,30,60,.08),0 24px 48px rgba(20,30,60,.16);
font-family:'Google Sans Flex','Google Sans',system-ui,sans-serif;color:var(--on);background:var(--bg);font-size:14px;line-height:1.4;
-webkit-font-smoothing:antialiased}
.root.dark{--bg:#0b0d11;--surf:#14171d;--s1:#1a1e25;--s2:#20252d;--s3:#29303a;--on:#e8eaf0;--onv:#bcc2cf;--mu:#8d94a3;--out:#323844;
--p:#a9c1ff;--onp:#06235f;--pc:#1d3d8f;--onpc:#dce4ff;--t:#d2b6ff;--tc:#432a78;--ontc:#efe3ff;--w:#ffc56b;--wc:#4a3200;--onwc:#ffe9c7;
--e:#ffb4a8;--ec:#5c160c;--ok:#7fdca0;--okc:#0f3d22;--sh:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);--shl:0 24px 48px rgba(0,0,0,.55)}
.i{fill:currentColor;flex:none;display:block}
.row{display:flex;align-items:center}.col{display:flex;flex-direction:column}.grow{flex:1;min-width:0}
.mu{color:var(--mu)}.onv{color:var(--onv)}
.disp{font-size:44px;line-height:1.08;font-weight:600;letter-spacing:-.025em}
.h1{font-size:32px;line-height:1.15;font-weight:600;letter-spacing:-.02em}
.h2{font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em}
.h3{font-size:16px;font-weight:600}
.lbl{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}
.sm{font-size:12.5px}.xs{font-size:11.5px}
.card{background:var(--surf);border-radius:28px;box-shadow:var(--sh)}
.tonal{background:var(--s2);border-radius:24px}
.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 18px;border-radius:20px;font-weight:600;font-size:14px;white-space:nowrap;border:0}
.btn.fill{background:var(--p);color:var(--onp)}.btn.ton{background:var(--pc);color:var(--onpc)}
.btn.out{box-shadow:inset 0 0 0 1.5px var(--out);color:var(--on)}.btn.txt{color:var(--p);padding:0 12px}
.btn.lg{height:52px;padding:0 24px;border-radius:26px;font-size:15px}
.btn.sm{height:32px;padding:0 12px;font-size:13px;border-radius:16px}
.ib{width:40px;height:40px;border-radius:20px;display:grid;place-items:center;color:var(--onv)}
.ib.on{background:var(--pc);color:var(--onpc)}
.chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:16px;background:var(--s2);font-size:13px;font-weight:500;color:var(--onv)}
.chip.sel{background:var(--on);color:var(--surf)}
.badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--e);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center}
.dark .badge{color:#2a0700}
.pill{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:12px;font-size:12px;font-weight:600}
.field{display:flex;align-items:center;gap:10px;height:48px;padding:0 18px;border-radius:24px;background:var(--s2);color:var(--mu)}
.kbd{font-size:11px;font-weight:600;padding:2px 7px;border-radius:7px;background:var(--surf);color:var(--onv);box-shadow:inset 0 0 0 1px var(--out)}
.dark .kbd{background:var(--s3)}
/* Navigation pane */
.nav{width:256px;flex:none;padding:14px;gap:4px}
.nav .brand{gap:12px;padding:6px 6px 14px}
.logo{width:40px;height:40px;border-radius:14px;background:linear-gradient(135deg,var(--p),var(--t));display:grid;place-items:center;color:#fff}
.dark .logo{color:#0b0d11}
.ni{display:flex;align-items:center;gap:14px;height:44px;padding:0 14px;border-radius:22px;color:var(--onv);font-weight:500;font-size:14.5px;position:relative}
.ni.act{background:var(--pc);color:var(--onpc);font-weight:600}
.ni .x{margin-left:auto;opacity:.75}
.nsec{padding:14px 14px 6px}
.nav.mini{width:76px;align-items:center}.nav.mini .ni{width:52px;justify-content:center;padding:0}
.toolpill{display:flex;align-items:center;gap:2px;padding:4px;border-radius:24px;background:var(--surf);box-shadow:var(--sh)}
.toolpill .ib{width:38px;height:38px}
.vsep{width:1px;height:22px;background:var(--out);margin:0 4px}
.tile{border-radius:24px;padding:18px;background:var(--surf);box-shadow:var(--sh)}
.ico{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none}
.annot{position:absolute;padding:10px 14px;border-radius:14px;background:#14171c;color:#fff;font-size:13px;line-height:1.35;max-width:260px;box-shadow:var(--shl)}
.annot b{color:#a9c1ff}
.dark .annot{background:#e8eaf0;color:#14171c}.dark .annot b{color:#2155d6}
.board-title{font-size:15px;font-weight:600;color:var(--mu);letter-spacing:.02em}
.tabh{display:flex;align-items:center;gap:10px;height:40px;padding:0 16px;border-radius:20px;font-weight:500;color:var(--onv);white-space:nowrap}
.tabh.act{background:var(--on);color:var(--surf)}
.menu{background:var(--surf);border-radius:22px;box-shadow:var(--shl);padding:8px;width:280px}
.mi{display:flex;align-items:center;gap:14px;height:44px;padding:0 14px;border-radius:14px;font-weight:500}
.mi.sel{background:var(--pc);color:var(--onpc)}
.msep{height:1px;background:var(--out);margin:6px 10px}
.phone{width:390px;height:844px;border-radius:44px;overflow:hidden;position:relative;background:var(--bg);box-shadow:0 0 0 10px #1b1e24,var(--shl)}
.bnav{position:absolute;left:12px;right:12px;bottom:14px;height:72px;border-radius:36px;background:var(--surf);box-shadow:var(--shl);display:flex;align-items:center;justify-content:space-around;padding:0 8px}
.bi{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11.5px;font-weight:600;color:var(--onv)}
.bi .pi{width:56px;height:30px;border-radius:15px;display:grid;place-items:center}
.bi.act{color:var(--onpc)}.bi.act .pi{background:var(--pc)}
"""


def board(name, title, w, h, body, dark=False, pad=48):
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600;700&amp;display=swap">
<style>{CSS}</style>
</helmet>
<div class="root{' dark' if dark else ''}" style="width:100%;min-height:{h}px;padding:{pad}px;position:relative;overflow:hidden">
{body}
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
    open(os.path.join(OUT, name + '.dc.html'), 'w').write(html)
    BOARDS.append((name, title, w, h))


BOARDS = []

NAV = [('Home', 'Overview'), ('Map', 'Map'), ('PlayBoxMultiple', 'Media'), ('FormatListBulleted', 'Activity'),
       ('ChartBox', 'History'), ('LightningBolt', 'Energy'), ('Calendar', 'Calendar'), ('ClipboardList', 'To-do lists')]


def nav(active='Settings', mini=False, float_=False, pinned=('Overview',)):
    items = []
    for ic, label in NAV:
        act = label == active
        pin = I('Pin', 16, 'x') if label in pinned and not mini else ''
        close = I('Close', 18, 'x') if act and not mini else ''
        items.append(f'<div class="ni{" act" if act else ""}" title="{label}">{I(ic, 22)}{"" if mini else label}{pin}{close}</div>')
    sys = []
    for ic, label, badge in [('HammerWrench', 'Developer', ''), ('Cog', 'Settings', '5'), ('Bell', 'Notifications', '2')]:
        act = label == active
        b = f'<span class="badge" style="{"position:absolute;top:4px;right:6px" if mini else "margin-left:auto"}">{badge}</span>' if badge else ''
        sys.append(f'<div class="ni{" act" if act else ""}">{I(ic, 22)}{"" if mini else label}{b}</div>')
    tog = I('ChevronDoubleRight' if mini else 'ChevronDoubleLeft', 20)
    head = (f'<div class="row" style="gap:6px;{"flex-direction:column" if mini else "justify-content:space-between"};padding:2px 2px 12px">'
            + (f'<div class="ib" style="cursor:grab" title="Drag to move">{I("Drag", 20)}</div>' if float_ else '')
            + ('' if mini else f'<div class="row" style="gap:12px"><div class="logo">{I("Home", 22)}</div><div class="col"><b style="font-size:15px">Home</b><span class="xs mu">Home Assistant</span></div></div>')
            + f'<div class="row" style="gap:2px;{"flex-direction:column" if mini else ""}"><div class="ib" title="Tab strip position">{I("DockWindow", 20)}</div><div class="ib" title="{"Expand" if mini else "Collapse"}">{tog}</div></div></div>')
    search = (f'<div class="ib" style="background:var(--s2)">{I("Magnify", 20)}</div>' if mini else
              f'<div class="field" style="height:44px;margin-bottom:10px">{I("Magnify", 20)}<span class="grow">Search</span><span class="kbd">Ctrl K</span></div>')
    sec = lambda t: '' if mini else f'<div class="nsec lbl">{t}</div>'
    foot = (f'<div class="row" style="gap:10px;padding:10px 4px 2px;{"flex-direction:column" if mini else ""}">'
            f'<div style="width:40px;height:40px;border-radius:20px;background:var(--tc);color:var(--ontc);display:grid;place-items:center;font-weight:700">TO</div>'
            + ('' if mini else '<div class="col grow"><b style="font-size:14px">Test Owner</b><span class="xs mu">Owner</span></div>')
            + f'<div class="ib">{I("Microphone", 20)}</div></div>')
    style = 'border-radius:28px;background:var(--surf);box-shadow:var(--sh)' + (';box-shadow:var(--shl)' if float_ else '')
    return (f'<div class="nav col{" mini" if mini else ""}" style="{style}">{head}{search}{sec("Pages")}{"".join(items)}'
            f'<div class="ni" style="color:var(--p)">{I("Plus", 22)}{"" if mini else "New tab"}</div>'
            f'<div class="grow"></div>{sec("System")}{"".join(sys)}{foot}</div>')


def tools(extra=''):
    return (f'<div class="toolpill">{extra}<div class="ib">{I("FormatPaint", 20)}</div><div class="ib">{I("History", 20)}</div>'
            f'<div class="ib">{I("ShareVariant", 20)}</div><div class="ib">{I("LockOutline", 20)}</div><div class="vsep"></div>'
            f'<div class="ib">{I("HelpCircleOutline", 20)}</div><div class="ib">{I("DotsVertical", 20)}</div></div>')


def header(crumb, title, sub='', right=''):
    c = f'<div class="row xs mu" style="gap:6px;margin-bottom:6px">{crumb}</div>' if crumb else ''
    s = f'<div class="onv" style="font-size:15px;margin-top:6px">{sub}</div>' if sub else ''
    return (f'<div class="row" style="gap:20px;align-items:flex-start;margin-bottom:28px"><div class="grow">{c}<div class="h1">{title}</div>{s}</div>'
            f'{right}</div>')


def frame(content, nav_html, w=1440, h=900, top=None, dark=False):
    """A window: the navigation pane and the page surface."""
    if top:
        return (f'<div class="col" style="width:{w}px;height:{h}px;gap:12px;padding:12px;background:var(--bg);border-radius:20px;overflow:hidden;box-shadow:var(--shl)">'
                f'{top}<div class="grow" style="border-radius:28px;background:var(--s1);padding:36px 44px;overflow:hidden;position:relative">{content}</div></div>')
    return (f'<div class="row" style="width:{w}px;height:{h}px;gap:12px;padding:12px;background:var(--bg);border-radius:20px;overflow:hidden;box-shadow:var(--shl);align-items:stretch">'
            f'{nav_html}<div class="grow" style="border-radius:28px;background:var(--s1);padding:36px 44px;overflow:hidden;position:relative">{content}</div></div>')


def note(x, y, html, w=340):
    return f'<div class="annot" style="left:{x}px;top:{y}px;max-width:{w}px">{html}</div>'
