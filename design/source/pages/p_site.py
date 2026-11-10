"""The project page (GitHub Pages) for Home Assistant Material: one markup source for the live
page in docs/site/ and for its boards on canvas 15.

Run directly to write docs/site/index.html; build_polish.py imports it to draw the boards.
"""
import os

from polish_lib import *

P = '15-site'
REPO = 'https://github.com/Ding-Ding-Projects/home-assistant-material'
RUN = 'docker run -d --name homeassistant --restart unless-stopped --network host -v /path/to/config:/config ghcr.io/ding-ding-projects/home-assistant-material:latest'

SITE_CSS = """
.site{min-height:100vh;background:var(--surf);color:var(--on);overflow-x:clip}
.wrap{max-width:1200px;margin:0 auto;padding:0 32px}
.top{display:flex;align-items:center;gap:8px;min-height:72px;flex-wrap:wrap}
.top nav{display:flex;gap:4px;flex-wrap:wrap}
.top nav a{display:inline-flex;align-items:center;height:40px;padding:0 14px;border-radius:20px;color:var(--onv);font-weight:600}
.top nav a:hover{background:var(--sl2);color:var(--on)}
.hero{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:56px;align-items:center;padding:56px 0 72px}
.hero h1{font-size:60px;line-height:66px;font-weight:500;letter-spacing:-1.5px}
.hero>*{min-width:0}
.shot{display:block;width:100%;height:auto;border-radius:24px;box-shadow:0 0 0 1px var(--outv),var(--e3);background:var(--sl0)}
.bleed{margin-right:-160px}
.sat{position:absolute;width:46%;left:-10%;bottom:-36px}
.code{display:flex;align-items:flex-start;gap:12px;background:var(--inv);color:var(--on-inv);border-radius:20px;padding:16px 12px 16px 20px}
.code pre{margin:0;flex:1;min-width:0;white-space:pre-wrap;word-break:break-all;font:13px/20px 'Roboto Mono',ui-monospace,Menlo,monospace}
.code button{color:var(--on-inv)}
.sec{padding:64px 0;display:flex;flex-direction:column;gap:28px}
.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.feat{background:var(--sl1);border-radius:32px;padding:12px 12px 24px;display:flex;flex-direction:column;gap:14px}
.feat .shot{border-radius:22px;box-shadow:0 0 0 1px var(--outv);aspect-ratio:4/3;object-fit:cover}
.feat h3,.feat p{padding:0 12px}
.tbl{width:100%;border-collapse:separate;border-spacing:0 4px}
.tbl td,.tbl th{text-align:left;padding:12px 16px}
.tbl td{background:var(--sl1)}
.tbl tr td:first-child{border-radius:16px 0 0 16px}.tbl tr td:last-child{border-radius:0 16px 16px 0}
.foot2{padding:40px 0 56px;border-top:1px solid var(--outv);display:flex;flex-direction:column;gap:12px}
.status{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;height:32px;padding:0 14px 0 10px;border-radius:16px;background:var(--amberc);color:var(--amber);font-weight:600;font-size:13px}
@media (max-width:900px){.hero{grid-template-columns:1fr;gap:32px;padding:32px 0 56px}.bleed{margin-right:-32px}.g3{grid-template-columns:1fr}.g2{grid-template-columns:1fr}.wrap{padding:0 20px}.sat{display:none}.top nav a.opt{display:none}}
@media (max-width:900px){.hero h1{font-size:48px;line-height:54px}}
@media (max-width:420px){.hero h1{font-size:38px;line-height:44px;letter-spacing:-1px}.wrap{padding:0 16px}.top .tm{font-size:15px}}
"""


def site_body(img='img/', dark=False):
    copy = (f'<button class="ib" style="width: 40px; height: 40px" aria-label="Copy the command" data-copy="{RUN}">{I("ContentCopy", "s")}</button>')
    feats = [
        ('crop-workbench', 'Pattern workbench on every search', 'Every search field opens a workbench for regular expressions: building blocks, a live test, replace, performance checks and code to copy.'),
        ('crop-element-menu', 'Tools on any element', 'Right-click, Shift F10 or the menu key on anything: edit its appearance, copy its text, read it aloud, or lock it as a speed bump for fun.'),
        ('crop-appearance', 'Your own appearance, per element', 'Pick any element and change its colour, shape and type. Changes stay in this browser and can be undone from its history.'),
    ]
    fcards = ''.join(f'<article class="feat"><img class="shot" src="{img}{f}.webp" width="800" height="600" alt="{t}, from a running build" loading="lazy"><h3 class="tl">{t}</h3><p class="bm mu">{d}</p></article>' for f, t, d in feats)
    images = ''.join(f'<tr><td class="ll">{d}</td><td class="mono bs">{f}</td></tr>' for d, f in [
        ('Raspberry Pi 5', 'haos_rpi5-64-&lt;version&gt;.img.xz'), ('Raspberry Pi 4 and 400', 'haos_rpi4-64-&lt;version&gt;.img.xz'), ('Raspberry Pi 3', 'haos_rpi3-64-&lt;version&gt;.img.xz'),
        ('VirtualBox', 'haos_ova-&lt;version&gt;.vdi.zip'), ('VMware Workstation', 'haos_ova-&lt;version&gt;.ova')])
    toggle = f'<button class="ib" id="theme" aria-label="Switch between light and dark">{I("ThemeLightDark")}</button>'
    return f'''<div class="site">
<header class="wrap top">
<a href="#top" class="tm" style="color: var(--on); margin-right: auto">Home Assistant Material</a>
<nav aria-label="Sections"><a href="#run" class="opt">Run it</a><a href="#built" class="opt">What is built</a><a href="#design" class="opt">Design</a><a href="{REPO}">GitHub</a></nav>
{toggle}
</header>
<main id="top">
<section class="wrap hero">
<div class="col" style="gap: 24px">
<span class="status">{I("ProgressClock", "s")}Early: the first part of the interface is built</span>
<h1>Home Assistant in Material Design&nbsp;3</h1>
<p class="bl mu" style="max-width: 520px">The same home automation, with a calmer interface: a floating pane, a slim rail, large type and fewer, larger cards. Built from one repository, released for Docker, Raspberry Pi and virtual machines.</p>
<div class="row" style="gap: 12px; flex-wrap: wrap"><a class="btn fill lg" href="#run">Run it in Docker</a><a class="btn out lg" href="{REPO}/releases">Releases</a></div>
</div>
<div style="position: relative"><img class="shot bleed" src="{img}home.webp" width="1440" height="900" alt="The Home page of a running build: a slim rail, pill tabs and rounded cards"></div>
</section>
<section class="wrap sec" id="run" style="padding-top: 24px">
<div class="col" style="gap: 8px"><h2 class="hl">Run it</h2><p class="bl mu" style="max-width: 720px">One container for <span class="mono">amd64</span> and <span class="mono">arm64</span>. Then open <span class="mono">http://&lt;host&gt;:8123</span>.</p></div>
<div class="code"><pre>{RUN}</pre>{copy}</div>
<div class="g2">
<div class="card col" style="gap: 10px; padding: 24px"><h3 class="tl">One step, with Docker Compose</h3><p class="bm mu">Clone the repository and run <span class="mono">host.bat</span> on Windows or <span class="mono">./host.sh</span> on Linux and macOS. It pulls the image, starts it, waits until it answers and prints the address for this machine and your network.</p></div>
<div class="card col" style="gap: 10px; padding: 24px"><h3 class="tl">Operating system images</h3><p class="bm mu">Releases that rebuilt the product attach images. Check each against <span class="mono">SHA256SUMS</span> from the same release.</p></div>
</div>
<table class="tbl"><caption class="bs mu" style="text-align: left; padding: 0 4px 4px">Files attached to a release</caption><tbody>{images}</tbody></table>
</section>
<section class="wrap sec" id="built">
<div class="col" style="gap: 8px"><h2 class="hl">What is built</h2><p class="bl mu" style="max-width: 760px">Pictures from running builds. Most of the design is not built yet; the status page says exactly what is and is not done.</p></div>
<div class="g3">{fcards}</div>
<a class="btn tonal" style="align-self: flex-start" href="{REPO}/blob/main/docs/feature-status.md">Read the status page</a>
</section>
<section class="wrap sec" id="design">
<div class="card hero g2" style="background: var(--pc); color: var(--on-pc); align-items: center">
<div class="col" style="gap: 12px"><h2 class="hl">The whole design is in the repository</h2><p class="bl">Every page, dialog and feature is drawn as a board, phone and wide window, light and dark. A board is a proposal until it is seen in a running build.</p></div>
<div class="row" style="gap: 12px; flex-wrap: wrap; justify-content: flex-end"><a class="btn fill lg" href="{REPO}/tree/main/design">Open the design</a></div>
</div>
</section>
</main>
<footer class="wrap foot2">
<p class="bs mu">Home Assistant Material is an independent project. It is not affiliated with, sponsored by or endorsed by Home Assistant, the Open Home Foundation or Nabu Casa. "Home Assistant" is a trademark of its owner and is used here only to say what this project is built from.</p>
<p class="bs mu">Apache-2.0. The typeface is Google Sans Flex under the SIL Open Font License, served from this site.</p>
</footer>
</div>'''


def site_html():
    css = open(os.path.join(os.path.dirname(__file__), '..', 'm3.css')).read().strip()
    dark_vars = css.split('.m3.dark{', 1)[1].split('}', 1)[0]
    fonts = ''.join(f"@font-face{{font-family:'Google Sans Flex';font-style:normal;font-weight:400 700;font-display:swap;src:url(fonts/GoogleSansFlex-{s}.woff2) format('woff2');unicode-range:{r}}}\n"
                    for s, r in [('latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'),
                                 ('latin-ext', 'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF')])
    body = site_body()
    import re
    import json
    icons = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'icons.json')))
    body = re.sub(r'@@I:([A-Za-z0-9]+)(?:\.([a-z ]+))?@@', lambda m: f'<svg class="ic{" " + m.group(2) if m.group(2) else ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="{icons[m.group(1)]}"></path></svg>', body)
    script = """<script>
(function(){var r=document.documentElement.querySelector('.m3'),k='ham-theme',s=null;try{s=localStorage.getItem(k)}catch(e){}
function set(d){r.classList.toggle('dark',d)}
set(s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches);
document.getElementById('theme').addEventListener('click',function(){var d=!r.classList.contains('dark');set(d);try{localStorage.setItem(k,d?'dark':'light')}catch(e){}});
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){b.setAttribute('aria-label','Copied')})})});
})();
</script>"""
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home Assistant Material</title>
<meta name="description" content="Home Assistant with a Material Design 3 interface. Docker images, Raspberry Pi and virtual machine images, and the whole design in the open.">
<meta name="color-scheme" content="light dark">
<style>
{fonts}{css}
{SITE_CSS}
:where(.m3) a:hover{{color:inherit}}
</style>
</head>
<body class="m3">
{body}
{script}
</body>
</html>
'''.replace('<body class="m3">', '<body>').replace('<div class="site">', '<div class="m3 site">', 1)


def board_body(img, dark=False, w=1440):
    d = ' dark' if dark else ''
    return f'<style>{SITE_CSS}</style><div class="m3{d}" style="width: 100%">{site_body(img, dark)}</div>'


if __name__ == '__main__':
    out = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs', 'site', 'index.html'))
    html = site_html()
    # The theme script looks for the element that carries the m3 class.
    html = html.replace("document.documentElement.querySelector('.m3')", "document.querySelector('.m3')")
    open(out, 'w').write(html)
    print(out, len(html))
else:
    IMG = '../../../docs/site/img/'
    bare(P, 'SiteWide', 'Project page, wide, light', board_body(IMG), w=1440, style='padding: 0; gap: 0; display: block')
    bare(P, 'SiteWideDark', 'Project page, wide, dark', board_body(IMG, True), w=1440, style='padding: 0; gap: 0; display: block')
    bare(P, 'SitePhone', 'Project page, phone, light', board_body(IMG), w=360, style='padding: 0; gap: 0; display: block')
    bare(P, 'SitePhoneDark', 'Project page, phone, dark', board_body(IMG, True), w=360, style='padding: 0; gap: 0; display: block')
