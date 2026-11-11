"""Builds docs/site/data.js for the project page: the feature list, one article per feature, the
recent changes and the version the page documents.

Run from the repository root: python3 docs/site/build_site.py
The feature list below is written by hand on purpose. tests: check_site.py fails when a feature
the project owes a page is missing from it.
"""
import json
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))

# state: built (seen working in a running build), partly, written (in code, not yet seen
# running), designed (a board exists, no code yet), na (does not apply to this product).
# try: where on this page the feature can be used now, as tab:anchor.
F = [
 # Language, voice and personal choices
 ('language', 'Language', 'Language modes', 'Three ways to read every word: English, playful Hong Kong Cantonese, or both together. Both keeps the main label large and puts the second language small beside it, so narrow screens never crowd.', 'Settings, Language. Every label on this page changes at once and the choice is kept in this browser.', 'designed', 'The product saves the choice and shows it in a preview; most of its interface follows later.', 'settings:language'),
 ('funny-emoji', 'Language', 'Playfulness levels and dialog emoji', 'Two sliders from 1 (fully serious) to 5 (as playful as it gets), one for English and one for Cantonese, both starting at 5. They change the voice of messages, never their facts. A separate switch adds one emoji to dialog titles, never to buttons or names.', 'Settings, Language. Toasts, empty states and dialogs on this page change at every level.', 'written', 'Written as part of the Personal settings page; not yet seen running.', 'settings:language'),
 ('personal-vocabulary', 'Language', 'Your own wording file', 'A JSON file of your own words replaces the shipped wording everywhere text is shown. It is checked in full first (size, nesting, duplicate and unsafe keys, lengths, control characters); a file that fails changes nothing. Only the checked entries are kept, in this browser.', 'Settings, Your wording. Choose a file, or drop it anywhere on the page. The same checks as the product run here.', 'built', 'Built and seen working: a 324-entry file loaded and labels changed.', 'settings:wording'),
 ('school-mode', 'Language', 'School mode', 'One switch that keeps the wording plain, playfulness at 1, sounds off and the surprise hidden, for a classroom or a shared screen.', 'Settings, Modes. Turning it on sets those values and shows what it changed.', 'designed', 'Designed; not built.', 'settings:modes'),
 ('narration', 'Language', 'Read aloud and voices', 'Any text can be read aloud with a voice you pick, from the element menu or the accessibility tools. Secrets are never read.', 'Right-click any text and choose Read aloud, or pick a voice in Settings, Sound and voice. Uses your browser\'s own voices.', 'designed', 'Designed; not built.', 'settings:sound'),
 ('scheduled-settings', 'Language', 'Scheduled settings', 'Settings can change on a schedule, such as dark theme in the evening or low stimulation on school nights, and say on the setting when a schedule is in charge.', 'Settings, Schedule. A dark-theme schedule runs while the page is open.', 'designed', 'Designed; not built.', 'settings:schedule'),
 ('adhd-modes', 'Language', 'Focus modes', 'Low stimulation softens colour, shortens animation and silences sounds. Focus spotlight dims everything but the control that has the keyboard focus.', 'Settings, Modes. Both work on this page.', 'written', 'Written as part of the Personal settings page; not yet seen running.', 'settings:modes'),
 ('dim-sum', 'Language', 'Dim sum surprise', 'Now and then, a small dim sum card appears with its name and a line about it. It can be turned off and never covers work.', 'Settings, Modes, then Show me one now. Names only: this page loads nothing from other sites, so it has no photos.', 'designed', 'Designed; not built.', 'settings:modes'),
 ('dim-sum-photo-source', 'Language', 'Public dim sum photos', 'Dim sum pictures come only from one public photo catalogue, credited, with a clear state when a picture cannot load.', 'Not on this page: it loads nothing from other sites, and says so where the surprise appears.', 'designed', 'Designed; not built.', 'settings:modes'),
 ('display-name', 'Language', 'Renaming and your own logo', 'The product can be renamed and given another logo colour and shape; the change shows everywhere the name and logo do.', 'Settings, Name and logo. The page title and the mark at the top change.', 'designed', 'Designed; not built.', 'settings:identity'),
 # Look and layout
 ('material-design', 'Look', 'Material Design 3', 'Material Design 3 colour roles, shapes, type scale and components, light and dark, with the product\'s own tokens.', 'The whole page, built from the same tokens as the product\'s design boards.', 'partly', 'Partly built: colours, typeface, rail, floating pane, cards and pill tabs.', 'home:top'),
 ('workflow-navigation', 'Look', 'Navigation that follows the work', 'Destinations are tabs; the current one is always marked; you can always see where you are and go back.', 'The tab strip at the top, or at any edge you choose.', 'partly', 'Partly built: rail and pill tabs on wide screens.', 'home:top'),
 ('motion', 'Look', 'Motion with a reduced-motion path', 'Motion follows Material Design 3, and every animation has a still version when reduced motion is on, from the system or from Settings.', 'Settings, Appearance, Reduce motion; your system setting is followed too.', 'designed', 'Designed; not built.', 'settings:appearance'),
 ('live-charts', 'Look', 'Live charts', 'Charts that update in place with a smooth line, a hairline that follows the pointer and the value under it.', 'Home, This visit: a live chart of what you do on this page.', 'designed', 'Designed; not built.', 'home:live'),
 ('appearance-editor', 'Look', 'Edit the appearance of any element', 'Right-click any element and change its colour, background, corners, size and weight, beside the element, with undo per change.', 'Right-click anything, then Edit appearance. Changes are kept in this browser and listed in History.', 'built', 'Built and seen working in a running instance.', 'home:top'),
 ('color-picker', 'Look', 'Colour picker and translator', 'Pick any colour and read it as hex, RGB and HSL, with its contrast against light and dark text.', 'Tools, Colour.', 'partly', 'Partly built beside the appearance editor.', 'tools:colour'),
 ('logo-customization', 'Look', 'Logo customization', 'The logo\'s shape and colour can be changed and reset.', 'Settings, Name and logo.', 'designed', 'Designed; not built.', 'settings:identity'),
 ('overlay-panels', 'Look', 'Panels and overlays', 'Panels open beside the work instead of covering it, and can be resized or closed.', 'The palette, the element menu, the appearance editor and the notification centre.', 'designed', 'Designed; not built.', 'home:top'),
 ('collapse-filters', 'Look', 'Collapsible filters and statistics', 'Filters and summary numbers fold away when not needed and remember it.', 'Features: the filter row and the counts fold away.', 'designed', 'Designed; not built.', 'features:filters'),
 ('accessibility-sizing', 'Look', 'Accessibility tools', 'Text size, contrast, reduced motion, visible focus, larger targets, keyboard help and read aloud, always one button away. Nothing is cut off at any size.', 'The accessibility button in the top bar.', 'built', 'Built on wide screens and seen working.', 'settings:accessibility'),
 ('functional-ui', 'Look', 'Every control works, every empty state says why', 'No control is a picture of a control. An empty list says why it is empty and what to do.', 'Every list on this page, such as History and Notifications before anything happens.', 'partly', 'Partly built.', 'history:top'),
 # Finding and doing
 ('onboarding-wizard', 'Finding', 'First-run setup', 'A short setup on first start that does real work (language, appearance, the first device), with Back, Next, skip and resume.', 'The first visit opens a short welcome; Settings, Start again reopens it.', 'designed', 'Designed; the upstream first-run setup runs today.', 'settings:start'),
 ('extension-support', 'Finding', 'Extensions', 'Extensions with a manifest, permissions you agree to, limits, and a searchable manager.', 'Not on this page: it runs no code from others. The design board shows the manager.', 'designed', 'Designed; not built.', 'design:top'),
 ('tabs', 'Finding', 'Every tab open, the New tab catalog', 'Every page starts open as a tab. A tab you close stays closed until you reopen it from New tab, which lists every page with a search. The strip can sit on any edge.', 'The tab strip: close, pin, move, New tab, Open every tab, and the strip position in Settings, Tabs.', 'built', 'Built for pages on wide screens and seen working.', 'home:top'),
 ('regex-search', 'Finding', 'Pattern workbench on every search', 'Every search field has a button that opens a regular expression workbench: build, test, explain, and use the pattern.', 'Every search on this page has the workbench button, and Tools, Pattern workbench opens it full size.', 'partly', 'Partly built: every search field (38 places) has the button.', 'tools:regex'),
 ('command-palette', 'Finding', 'Command palette on Ctrl Shift F', 'Ctrl Shift F lists every page, setting, article and action, with live controls in the results, and takes you to the exact element.', 'Press Ctrl Shift F, or the search button in the top bar.', 'built', 'The quick bar is rebound to Ctrl Shift F.', 'home:top'),
 ('context-menus', 'Finding', 'A menu on every element', 'Right-click, Shift F10, the menu key or a long press opens the element\'s own menu, with its own search.', 'Any element on this page.', 'partly', 'Partly built and seen working.', 'home:top'),
 ('menu-shortcuts', 'Finding', 'Shortcuts shown in menus', 'Every menu item with a shortcut shows it, and the shortcut works.', 'The element menu shows its letter keys.', 'partly', 'Partly built.', 'home:top'),
 ('rich-controls', 'Finding', 'Live controls in results', 'Where a value is shown, it can be changed right there.', 'Palette results for settings are switches and choices you can change without leaving the palette.', 'designed', 'Designed; not built.', 'home:top'),
 ('guided-forms', 'Finding', 'Guided forms', 'Forms that explain each field, check as you type and put errors where they happen.', 'Support, New ticket.', 'designed', 'Designed; not built.', 'support:new'),
 ('info-icon-guidance', 'Finding', 'An information button on every control', 'Every setting has a small information button that explains it.', 'Every setting on this page.', 'designed', 'Designed; not built.', 'settings:top'),
 ('settings-explanations', 'Finding', 'Settings that explain themselves', 'Each setting says what it does, its default and what it reaches today, with its own Reset.', 'Every setting on this page.', 'written', 'Written as the Personal settings page; not yet seen running.', 'settings:top'),
 ('blank-editors', 'Finding', 'Starting points for blank editors', 'An empty editor offers a few starting points instead of a blank box.', 'Support, New ticket offers starting points.', 'designed', 'Designed; not built.', 'support:new'),
 # Safety and locks
 ('super-confirmation', 'Safety', 'Two-step confirmation', 'Anything that cannot be undone asks twice: first what will happen, then the name typed or a long hold.', 'Settings, Reset everything, and History, Clear.', 'built', 'Built and seen working in a running instance.', 'settings:reset'),
 ('element-locks', 'Safety', 'Locks on any element, for fun', 'Lock any element with a PIN so it cannot be changed by accident. A lock is a speed bump for fun, not security.', 'Right-click anything, then Lock this element. Locks are kept in this browser.', 'partly', 'Partly built and seen working.', 'settings:locks'),
 ('support-tickets', 'Safety', 'Support desk', 'A support desk for forgotten lock PINs and other trouble: what happened, what to try, and a ticket kept locally.', 'Support.', 'designed', 'Designed; not built.', 'support:top'),
 ('unlock-ladder', 'Safety', 'Waits after wrong tries', 'After wrong tries the next try waits a little longer each time: 5 seconds, 15 seconds, 1 minute, 5 minutes.', 'Try a wrong PIN on a lock on this page.', 'partly', 'Partly built and seen working.', 'settings:locks'),
 ('authenticator', 'Safety', 'Built-in authenticator', 'One-time codes from a secret you add, shown with the time left, kept on this device.', 'Tools, Authenticator: add a secret and see its codes.', 'designed', 'Designed; not built.', 'tools:otp'),
 ('qr-pairing', 'Safety', 'QR pairing for one-time codes', 'A QR code to add a one-time code secret to an app.', 'Not yet on this page: drawing the QR code locally is still to build. The secret can be copied instead.', 'designed', 'Designed; not built.', 'tools:otp'),
 ('honest-monetization', 'Safety', 'Free, with nothing to buy', 'Everything is free. There is no paid tier, no advert and no tracking, and nothing nags.', 'This page has no analytics, no cookies and no requests to other sites.', 'built', 'Built and seen working in a running instance.', 'home:free'),
 # Records
 ('local-history', 'Records', 'History of your changes', 'Every change you make here is listed, newest first, and can be undone.', 'History.', 'partly', 'Partly built and seen working.', 'history:top'),
 ('exports', 'Records', 'Export in every format', 'Lists and settings export as JSON, CSV, Markdown and plain text.', 'Settings, Export, and the export button on Features and History.', 'partly', 'Partly built and seen working.', 'settings:export'),
 ('bulk-actions', 'Records', 'Bulk actions', 'Select many items and act on them together, with a preview first.', 'History: select many and undo them; Notifications: clear many.', 'designed', 'Designed; not built.', 'history:top'),
 ('changelog', 'Records', 'Changelog', 'What changed, newest first, searchable.', 'Changes.', 'built', 'Built and seen working in a running instance.', 'changes:top'),
 ('offline-docs', 'Records', 'Help that works offline', 'Every feature has an article that works without the internet.', 'Articles: one per feature, all inside this page.', 'partly', 'Partly built.', 'articles:top'),
 ('rendered-provider-text', 'Records', 'Release notes shown as text, not code', 'Notes from upstream projects are shown formatted, never as raw markup.', 'Changes shows each change as formatted text.', 'designed', 'Designed; not built.', 'changes:top'),
 ('notifications', 'Records', 'Notifications and their centre', 'Messages never block the page; each also lands in a centre where it can be read again.', 'The bell in the top bar.', 'partly', 'Partly built and seen working.', 'home:top'),
 # Tools
 ('file-converter', 'Tools', 'File converter', 'Convert files locally: here, JSON, CSV and YAML-style text between each other.', 'Tools, Convert.', 'designed', 'Designed; not built.', 'tools:convert'),
 ('base64-tools', 'Tools', 'Base64 toolkit', 'Encode and decode Base64 text and files, with URL-safe and padding options.', 'Tools, Base64.', 'built', 'Built and seen working in a running instance.', 'tools:base64'),
 ('ollama-suite', 'Tools', 'Local AI models', 'Manage local Ollama models from the product.', 'Not on this page: it would need a server on your machine. The design board shows it.', 'designed', 'Designed; not built.', 'design:top'),
 ('progress-recovery', 'Tools', 'Progress where it started', 'Long work shows its progress where it was started, and a failure shows how to recover where it happened.', 'Tools, Convert shows its progress and errors in place.', 'designed', 'Designed; not built.', 'tools:convert'),
 # Evidence and the page itself
 ('completeness-parity', 'Evidence', 'What is and is not done', 'Every feature has an honest state, from designed to seen working.', 'Features: every feature with its state in the product.', 'built', 'The status page in the repository.', 'features:top'),
 ('front-provenance', 'Evidence', 'Version and updated-at on the first screen', 'The version and the date and time it was made are shown on the first screen.', 'The foot of every tab.', 'built', 'Built.', 'home:top'),
 ('deploy-assistant', 'Tools', 'Deploy Assistant', 'A desktop app that deploys Home Assistant Material in one click to Docker on this computer, an SSH host, VirtualBox or VMware, writes Raspberry Pi cards, manages every instance with backups, and keeps all images downloaded.', 'Deploy Assistant: download it, or try the real window running as a demo.', 'written', 'Docker on this computer was run end to end in a test: two instances, backup, restore and removal. SSH, VirtualBox, VMware and writing a real card are written and not yet seen working.', 'deploy:top'),
 ('product-evidence', 'Evidence', 'Real pictures of the product', 'Pictures of the product are taken from running builds, never mockups.', 'Home and the feature articles use pictures from running builds.', 'built', 'Pictures are in docs/screenshots.', 'home:built'),
 ('design-reference-parity', 'Evidence', 'The design in the repository', 'Every page is drawn as a board, and the build is compared with its board.', 'Design.', 'built', '212 boards on 16 canvases.', 'design:top'),
 ('nothing-cut-off', 'Evidence', 'Nothing cut off at any size', 'Every surface is checked at phone and wide sizes, larger text and both languages, with nothing cut off.', 'This page works from 320 px wide, at 200% text, in both languages.', 'partly', 'Checked for the built surfaces.', 'home:top'),
 ('picture-gallery', 'Evidence', 'Picture gallery', 'A gallery of pictures from running builds.', 'Design, Pictures.', 'partly', 'Pictures are in docs/screenshots.', 'design:pictures'),
 ('landing-site', 'Page', 'This page', 'A project page that carries every feature it can, on its own content and in your browser.', 'All of it.', 'built', 'This page.', 'home:top'),
 ('phone-site', 'Page', 'Works on a phone', 'From 320 px wide, with no sideways scroll and touch targets of at least 44 px.', 'Open this page on a phone.', 'built', 'This page.', 'home:top'),
 ('installer-download-button', 'Page', 'Download', 'A download button that points only at a published release file.', 'Deploy Assistant: one button per system, each pointing at a file of the newest Deploy Assistant release.', 'built', 'The Deploy Assistant is released with Setup.exe, a .deb and zips; the product itself is a container and operating system images.', 'deploy:top'),
 ('feature-articles', 'Page', 'One article per feature', 'Each feature has its own article with what it does, how to use it here, its state, and articles to read next.', 'Articles.', 'built', 'This page.', 'articles:top'),
 ('vendored-fonts', 'Page', 'Fonts served from this page', 'The typeface is served from this page, checked by its SHA-256 sums, and never loaded from another site.', 'Google Sans Flex, from this page.', 'built', 'scripts/vendor-fonts.sh.', 'home:top'),
 ('shared-link-embed', 'Page', 'A real picture when the link is shared', 'Pasting the link in a chat shows a picture of the product.', 'This page carries its preview picture and tags.', 'built', 'This page.', 'home:top'),
 ('homepage-link', 'Page', 'Linked from the repository', 'The repository links to this page.', 'The README links here.', 'built', 'README.', 'home:top'),
 ('status-hub', 'Page', 'Status', 'Where the project stands, live.', 'Features and Changes show where the project stands at the version below.', 'partly', 'The status page in the repository.', 'features:top'),
 ('dim-sum-code-names', 'Page', 'Dim sum names for releases', 'Each release gets a dim sum name.', 'Changes lists releases with their names when they have one.', 'designed', 'Designed; not built.', 'changes:top'),
 ('vocabulary-unlock-boundary', 'Page', 'Plain words in public', 'This public page uses plain words only. Your own wording file is the only way other words appear, and only in your browser.', 'Settings, Your wording.', 'built', 'The product follows the same rule.', 'settings:wording'),
 ('private-site-app', 'Page', 'Packaged page for private projects', 'Private projects ship their page as a packaged app instead of a website.', 'Not needed: this project is public, so its page is a website.', 'na', 'Not applicable: the repository is public.', 'home:top'),
 ('site-kept-current', 'Page', 'Kept current with the repository', 'This page is rebuilt from the repository whenever it changes.', 'Built by docs/site/build_site.py and published on every change.', 'built', 'pages.yml.', 'home:top'),
]


def git(*a):
    return subprocess.run(['git', '-C', ROOT] + list(a), capture_output=True, text=True).stdout.strip()


def status_sections():
    """The status page (docs/feature-status.md) as sections of rows, so the project page can show it."""
    out, cur, head = [], None, None
    for line in open(os.path.join(ROOT, 'docs', 'feature-status.md'), encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('## '):
            cur = {'title': line[3:].strip(), 'head': [], 'rows': []}
            out.append(cur)
            head = None
        elif cur is not None and line.startswith('|'):
            cells = [c.strip().replace('`', '') for c in line.strip().strip('|').split('|')]
            if set(''.join(cells)) <= set('-: '):
                continue
            if head is None:
                head = cells
                cur['head'] = cells
            else:
                cur['rows'].append(cells)
    return [x for x in out if x['rows']]


def boards():
    """Every design board with a picture, by canvas, for the gallery on the project page."""
    from PIL import Image
    dest = os.path.join(HERE, 'boards')
    os.makedirs(dest, exist_ok=True)
    out = []
    cdir = os.path.join(ROOT, 'design', 'canvases')
    for c in sorted(os.listdir(cdir)):
        f = os.path.join(cdir, c, 'canvas.json')
        if not os.path.exists(f):
            continue
        idx = json.load(open(f))
        items = []
        for k in idx.get('order', []):
            name = k.replace('.dc.html', '')
            frame = os.path.join(ROOT, 'design', 'frames', name + '.png')
            if not os.path.exists(frame):
                continue
            webp = os.path.join(dest, name + '.webp')
            if not os.path.exists(webp) or os.path.getmtime(webp) < os.path.getmtime(frame):
                im = Image.open(frame).convert('RGB')
                if im.width > 1000:
                    im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
                im.save(webp, 'WEBP', quality=72)
            items.append({'name': name, 'title': idx['boards'][k].get('title', name)})
        out.append({'id': c, 'title': idx.get('title', c), 'boards': items})
    keep = {b['name'] + '.webp' for c in out for b in c['boards']}
    for f in os.listdir(dest):
        if f not in keep:
            os.remove(os.path.join(dest, f))
    return out


def deploy_demo():
    """Copies the Deploy Assistant's page here, so the project page can run it as a demo."""
    import shutil
    src = os.path.join(ROOT, 'deploy-assistant', 'src', 'renderer')
    dest = os.path.join(HERE, 'deploy-assistant')
    os.makedirs(os.path.join(dest, 'fonts'), exist_ok=True)
    for f in ['index.html', 'app.js', 'app.css', 'icons.js', 'mock.js']:
        shutil.copy(os.path.join(src, f), os.path.join(dest, f))
    for f in os.listdir(os.path.join(src, 'fonts')):
        shutil.copy(os.path.join(src, 'fonts', f), os.path.join(dest, 'fonts', f))
    return json.load(open(os.path.join(ROOT, 'deploy-assistant', 'package.json')))['version']


def main():
    versions = json.load(open(os.path.join(ROOT, 'versions.json')))
    log = git('log', '-40', '--format=%H%x1f%cI%x1f%s%x1f%b%x1e')
    changes = []
    for rec in log.split('\x1e'):
        rec = rec.strip()
        if not rec:
            continue
        h, d, s, b = (rec.split('\x1f') + ['', '', '', ''])[:4]
        body = '\n'.join(line for line in b.strip().splitlines() if not line.startswith(('Co-Authored-By', 'Claude-Session', 'Signed-off-by')))
        changes.append({'sha': h[:8], 'date': d, 'title': s, 'body': body.strip()})
    feats = [{'id': i, 'group': c, 'name': n, 'what': w, 'here': h, 'state': st, 'product': p, 'try': t} for i, c, n, w, h, st, p, t in F]
    ids = [f['id'] for f in feats]
    assert len(ids) == len(set(ids)), 'a feature id repeats'
    icons_all = json.load(open(os.path.join(ROOT, 'design', 'source', 'icons.json')))
    want = ['Magnify', 'Regex', 'Close', 'Plus', 'Bell', 'Cog', 'HumanHandsup', 'ThemeLightDark', 'ContentCopy', 'Export', 'Lock', 'LockOutline', 'LockOpenVariant',
            'FormatPaint', 'AccountVoice', 'Pin', 'ChevronLeft', 'ChevronRight', 'ChevronDown', 'ChevronUp', 'InformationOutline', 'Restore', 'History', 'Undo', 'DeleteOutline',
            'Check', 'CheckCircle', 'Alert', 'AlertCircle', 'ProgressClock', 'Home', 'PlayCircle', 'FormatListBulleted', 'BookOpenVariant', 'PaletteSwatch', 'Update',
            'Toolbox', 'Lifebuoy', 'Translate', 'Download', 'Upload', 'OpenInNew', 'DotsVertical', 'Backspace', 'Shuffle', 'Keyboard', 'TimerSand', 'Fullscreen',
            'Palette', 'SwapHorizontal', 'CodeBraces', 'ShieldKey', 'TicketConfirmation', 'FileSwap', 'Eyedropper', 'TabPlus', 'DragVertical', 'VolumeHigh', 'CalendarClock',
            'School', 'MotionPauseOutline', 'FormatSize', 'ContrastCircle', 'EmoticonHappyOutline', 'Docker' if 'Docker' in icons_all else 'PackageDown', 'GestureTap', 'Sleep']
    icons = {k: icons_all[k] for k in want if k in icons_all}
    data = {'icons': icons, 'version': versions['core'], 'updated': changes[0]['date'] if changes else '', 'commit': changes[0]['sha'] if changes else '',
            'repo': 'https://github.com/' + versions['repository'], 'image': 'ghcr.io/' + versions['registry_owner'] + '/home-assistant-material',
            'features': feats, 'changes': changes, 'status': status_sections(), 'canvases': boards(), 'deployVersion': deploy_demo()}
    out = os.path.join(HERE, 'data.js')
    open(out, 'w').write('// Written by build_site.py. Do not edit by hand.\nwindow.SITE = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    print(out, len(feats), 'features', len(changes), 'changes')


if __name__ == '__main__':
    main()
