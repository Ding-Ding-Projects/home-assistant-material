"""Shared parts for the polish pass (10 November 2026): phone frames, sheets, keypads and the
decision cards that tell the code side what each board settles.

Every board in this pass is a proposal. The code follows the board; nothing here says that a
surface is built or verified.
"""
import lib
from lib import *  # noqa: F401,F403

lib.FOOT = 'Home Assistant Material 2026.11.1, builds after 2026.11.1.50, drawn 10 November 2026'

PHONE_W = 320


def bhead(title, sub=''):
    s = f'<p class="bm mu" style="max-width: 860px">{sub}</p>' if sub else ''
    return f'<header class="col" style="gap: 6px"><h1 class="hs">{title}</h1>{s}</header>'


def phone(body, cap='', dark=False, h=640, label='Phone screen, 320 pixels wide'):
    """One phone screen at the narrowest width the product supports (320 px)."""
    d = ' dark' if dark else ''
    c = f'<figcaption class="bs mu" style="padding: 0 8px">{cap}</figcaption>' if cap else ''
    return (f'<figure class="col" style="margin: 0; gap: 12px; width: {PHONE_W}px; flex: none">'
            f'<div class="m3{d} col" role="group" aria-label="{label}" style="width: {PHONE_W}px; height: {h}px; '
            f'border-radius: 28px; overflow: hidden; background: var(--surf); color: var(--on); '
            f'box-shadow: 0 0 0 1px var(--outv), var(--e3); position: relative">{body}</div>{c}</figure>')


def pbar(title, back=True, *actions, sub=''):
    """The top bar of a phone screen."""
    b = ib('ArrowLeft', 'Back') if back else ''
    s = f'<span class="bs mu">{sub}</span>' if sub else ''
    return (f'<header class="row" style="gap: 4px; padding: 8px 4px 8px {4 if back else 16}px; min-height: 64px; flex: none">{b}'
            f'<div class="col grow" style="padding: 0 4px"><h2 class="tm" style="font-size: 18px">{title}</h2>{s}</div>{"".join(actions)}</header>')


def pbody(*kids, gap=12, pad='4px 16px 16px', style=''):
    return f'<div class="col grow" style="padding: {pad}; gap: {gap}px; min-height: 0{"; " + style if style else ""}">{"".join(kids)}</div>'


def scrim():
    return '<div aria-hidden="true" style="position: absolute; inset: 0; background: var(--scrim)"></div>'


def sheet(*kids, label='Sheet', gap=12, top=None, pad='8px 16px 16px', bottom=0):
    """A bottom sheet with its drag handle. top: distance from the top of the screen when the
    sheet is expanded; otherwise it hugs its content at the bottom."""
    pos = f'top: {top}px; ' if top is not None else ''
    grab = ('<button aria-label="Drag to resize the sheet, or press to expand it" style="align-self: center; '
            'width: 48px; height: 24px; display: flex; align-items: center; justify-content: center">'
            '<span aria-hidden="true" style="width: 32px; height: 4px; border-radius: 2px; background: var(--out)"></span></button>')
    return (f'<section class="col" role="dialog" aria-label="{label}" style="position: absolute; {pos}left: 0; right: 0; bottom: {bottom}px; '
            f'background: var(--sl1); border-radius: 28px 28px 0 0; padding: {pad}; gap: {gap}px; box-shadow: var(--e3)">'
            f'{grab}{"".join(kids)}</section>')


def keyboard(h=208):
    """Where the on-screen keyboard sits. Drawn as a labelled area, not as a keyboard."""
    return (f'<div aria-hidden="true" class="row" style="flex: none; height: {h}px; background: var(--sl4); justify-content: center; '
            f'border-top: 1px solid var(--outv)">{I("Keyboard")}<span class="bm mu" style="margin-left: 8px">On-screen keyboard</span></div>')


def decide(*items, title='What this board settles'):
    lis = ''.join(f'<li class="row bm" style="gap: 10px; align-items: flex-start"><span style="color: var(--p); margin-top: -2px">{I("CheckCircle", "s")}</span><span>{t}</span></li>' for t in items)
    return (f'<section class="card col" aria-label="{title}" style="gap: 12px; padding: 24px; background: var(--sl1)">'
            f'<h2 class="tm">{title}</h2><ul class="col" style="gap: 10px; margin: 0; padding: 0; list-style: none">{lis}</ul></section>')


def changes(*items):
    """Where the board asks the code to work differently from how it was built."""
    return decide(*items, title='Works differently from today\'s build')


def phones(*ph, gap=40):
    return f'<div class="row" style="gap: {gap}px; align-items: flex-start; flex-wrap: wrap">{"".join(ph)}</div>'


def phone_board(page, name, title, sub, ph, notes, w=1120):
    body = col(bhead(title, sub), phones(*ph), grid(2, *notes, gap=20), gap=28, style='width: 100%')
    bare(page, name, title, body, w=w, style='padding: 40px 32px; gap: 0; align-items: flex-start')


def wide_board(page, name, title, sub, content, notes=(), w=1440):
    n = grid(len(notes), *notes, gap=20) if notes else ''
    body = col(bhead(title, sub), content, n, gap=28, style='width: 100%')
    bare(page, name, title, body, w=w, style='padding: 40px 32px; gap: 0; align-items: flex-start')


def window(*kids, w=None, label='Window', dark=False, style='', pad='0'):
    """A desktop browser window's content area (no browser chrome), used to show a surface in place."""
    d = ' dark' if dark else ''
    ws = f'width: {w}px; flex: none; ' if w else 'flex: 1; min-width: 0; '
    return (f'<div class="m3{d} col" role="group" aria-label="{label}" style="{ws}border-radius: 24px; overflow: hidden; background: var(--surf); '
            f'color: var(--on); box-shadow: 0 0 0 1px var(--outv), var(--e3); position: relative; padding: {pad}{"; " + style if style else ""}">{"".join(kids)}</div>')


def pin_dots(n, filled):
    dots = ''.join(f'<span style="width: 14px; height: 14px; border-radius: 7px; {"background: var(--p)" if i < filled else "box-shadow: inset 0 0 0 2px var(--out)"}"></span>' for i in range(n))
    return f'<div class="row" role="img" aria-label="{filled} of {n} digits entered" style="gap: 14px; justify-content: center; padding: 8px 0">{dots}</div>'


def keypad(order=('1', '2', '3', '4', '5', '6', '7', '8', '9'), last=('Clear', '0', 'Backspace'), size=64, disabled=False, gap=12):
    """The large-key PIN keypad: nine digits, then Clear, 0 and Backspace."""
    dis = ' disabled aria-disabled="true"' if disabled else ''
    op = '; opacity: .38' if disabled else ''

    def key(k):
        if k == 'Clear':
            inner, lab, bg = '<span class="ll">Clear</span>', 'Clear', 'var(--sl3)'
        elif k == 'Backspace':
            inner, lab, bg = I('Backspace'), 'Backspace', 'var(--sl3)'
        else:
            inner, lab, bg = f'<span class="hs">{k}</span>', k, 'var(--sc)'
        return (f'<button{dis} aria-label="{lab}" style="height: {size}px; border-radius: {size // 2}px; background: {bg}; color: var(--on-sc); '
                f'display: flex; align-items: center; justify-content: center{op}">{inner}</button>')
    keys = ''.join(key(k) for k in list(order) + list(last))
    return f'<div role="group" aria-label="PIN keypad" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: {gap}px">{keys}</div>'


def stepper(n, cur, label='Progress'):
    """A segmented progress line: done, current, to do."""
    segs = ''.join(f'<span style="flex: 1; height: 4px; border-radius: 2px; background: {"var(--p)" if i < cur else ("var(--pc)" if i == cur else "var(--sl4)")}"></span>' for i in range(n))
    return f'<div class="row" role="img" aria-label="{label}: step {cur + 1} of {n}" style="gap: 4px">{segs}</div>'


def vsteps(items, cur):
    """A vertical step list for wide windows."""
    out = []
    for i, t in enumerate(items):
        if i < cur:
            mark = f'<span class="sq" style="width: 28px; height: 28px; border-radius: 14px; background: var(--p); color: var(--on-p)">{I("Check", "s")}</span>'
            cls = ''
        elif i == cur:
            mark = f'<span class="sq ll" style="width: 28px; height: 28px; border-radius: 14px; background: var(--pc); color: var(--on-pc)">{i + 1}</span>'
            cls = ' style="color: var(--on)"'
        else:
            mark = f'<span class="sq ll" style="width: 28px; height: 28px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--out); color: var(--onv)">{i + 1}</span>'
            cls = ' class="mu"'
        out.append(f'<li class="row" style="gap: 12px; padding: 6px 0">{mark}<span class="ll"{cls}>{t}</span></li>')
    return f'<ol class="col" aria-label="Steps" style="gap: 2px; margin: 0; padding: 0; list-style: none">{"".join(out)}</ol>'


def recovery():
    return note('Forgot it? Clear this site\'s storage in your browser to remove every lock.', '', 'Lifebuoy')


def toy():
    return note('This lock is just for fun. It is a speed bump, not security, and does not protect anything from anyone else who uses this browser.', '', 'EmoticonHappyOutline')


def mfield(label, value, icon=None, focus=False, err='', mono=False, trailing=''):
    """A text field with an optional error line under it."""
    ic = I(icon, 's') if icon else ''
    e = f'<span class="bs" role="alert" style="color: var(--err); padding: 4px 16px 0" >{err}</span>' if err else ''
    cls = ' bad' if err else (' focus' if focus else '')
    st = ''
    return (f'<div class="col"><label class="field{cls}"{st}>{ic}<span class="col grow"><span class="bs{" mu" if not err else ""}"{" style=\"color: var(--err)\"" if err else ""}>{label}</span>'
            f'<span class="bl{" mono" if mono else ""}">{value}</span></span>{trailing}</label>{e}</div>')


def wfind(placeholder, h=48):
    """A search field with the pattern workbench button inside it."""
    return (f'<div class="find grow" style="height: {h}px; padding-right: 4px"><span class="row grow" style="gap: 10px">{I("Magnify", "s")}'
            f'<span class="bm">{placeholder}</span></span><button class="ib" style="width: 40px; height: 40px" aria-label="Build a pattern search">{I("Regex", "s")}</button></div>')


def wfind_typed(text, h=44):
    """A focused search field with typed text: Clear, then the pattern workbench button. Every
    search field keeps the workbench button, typed into or not."""
    return (f'<div class="find" style="height: {h}px; padding-right: 4px; box-shadow: inset 0 0 0 2px var(--p)"><span class="row grow" style="gap: 10px">{I("Magnify", "s")}'
            f'<span class="bm" style="color: var(--on)">{text}</span></span>'
            f'<button class="ib" style="width: 36px; height: 36px" aria-label="Clear the search">{I("Close", "s")}</button>'
            f'<button class="ib" style="width: 36px; height: 36px" aria-label="Build a pattern search">{I("Regex", "s")}</button></div>')
