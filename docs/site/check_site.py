"""Checks the project page. Run from the repository root: python3 docs/site/check_site.py

1. Every feature the project page owes is in data.js. The list below is written by hand and must
   not be generated from data.js, so a feature dropped from the page turns this check red.
2. In Chrome: the page loads with no error, makes no request outside its own folder, every tab
   renders, and the main tools open.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REQUIRED = '''language funny-emoji personal-vocabulary school-mode narration scheduled-settings adhd-modes dim-sum
dim-sum-photo-source display-name material-design workflow-navigation motion live-charts appearance-editor color-picker
logo-customization overlay-panels collapse-filters accessibility-sizing functional-ui onboarding-wizard extension-support
tabs regex-search command-palette context-menus menu-shortcuts rich-controls guided-forms info-icon-guidance
settings-explanations blank-editors super-confirmation element-locks support-tickets unlock-ladder authenticator
qr-pairing honest-monetization local-history exports bulk-actions changelog offline-docs rendered-provider-text
notifications file-converter base64-tools ollama-suite progress-recovery completeness-parity front-provenance
product-evidence design-reference-parity nothing-cut-off picture-gallery landing-site phone-site
installer-download-button feature-articles vendored-fonts shared-link-embed homepage-link vocabulary-unlock-boundary
private-site-app status-hub dim-sum-code-names site-kept-current'''.split()

src = open(os.path.join(HERE, 'data.js')).read()
data = json.loads(src[src.index('=') + 1:].rstrip().rstrip(';'))
have = {f['id'] for f in data['features']}
missing = [r for r in REQUIRED if r not in have]
if missing:
    sys.exit('Missing from the page: ' + ', '.join(missing))
print(len(REQUIRED), 'required features present')

if '--no-browser' in sys.argv:
    sys.exit(0)
from playwright.sync_api import sync_playwright  # noqa: E402

errors, outside = [], []
base = 'file://' + HERE + '/'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'))
    for w, h in [(1440, 900), (360, 780)]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.on('request', lambda r: (not r.url.startswith(base) and not r.url.startswith('data:') and not r.url.startswith('blob:')) and outside.append(r.url))
        pg.goto(base + 'index.html')
        pg.wait_for_timeout(500)
        pg.keyboard.press('Escape')
        for t in ['home', 'run', 'deploy', 'features', 'status', 'articles', 'design', 'changes', 'tools', 'settings', 'history', 'support']:
            pg.click('#t-' + t)
            assert pg.locator('#p-' + t).inner_text().strip(), t + ' is empty'
        sw = pg.evaluate('document.documentElement.scrollWidth')
        assert sw <= w, f'sideways scroll at {w}px: {sw}'
        pg.keyboard.press('Control+Shift+F')
        assert pg.locator('#palq').is_visible(), 'palette did not open'
        pg.keyboard.press('Escape')
        pg.click('#t-features')
        pg.click('[data-regex="fsearch"]')
        assert pg.locator('#wbpat').is_visible(), 'workbench did not open'
        pg.keyboard.press('Escape')
        pg.click('[data-k="h-features"]' if pg.locator('[data-k="h-features"]').count() else '#t-features', button='right')
        pg.close()
    b.close()
if errors:
    sys.exit('Errors: ' + '; '.join(errors[:5]))
if outside:
    sys.exit('Requests outside the page: ' + ', '.join(sorted(set(outside))[:5]))
print('browser checks passed at 1440 and 360 px; no request left the page')
