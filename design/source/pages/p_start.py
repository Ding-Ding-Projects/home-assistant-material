from lib import *

P = 'start'

logo = f'<span class="sq" style="width: 72px; height: 72px; border-radius: 28px; background: var(--pc); color: var(--on-pc)">{I("HomeAssistant", "l")}</span>'
def panel(label, *kids, w=380):
    return f'<section class="dlg col" aria-label="{label}" style="flex: 1 1 {w}px; gap: 16px; padding: 32px">{"".join(kids)}</section>'

# ---------- Sign in ----------
signin = panel('Sign in', logo, '<h1 class="hs">Welcome home</h1><p class="bm mu">Sign in to Home on homeassistant.local.</p>',
               field('Username', 'sam', 'Account', 'focus'), f'<label class="field">{I("FormTextboxPassword", "s")}<span class="col grow"><span class="bs mu">Password</span><span class="bl">●●●●●●●●●●</span></span>{I("EyeOutline", "s")}</label>',
               f'<label class="row" style="gap: 12px"><input type="checkbox" checked aria-label="Keep me signed in" style="width: 20px; height: 20px; accent-color: #00639B"><span class="bm">Keep me signed in on this device</span></label>',
               row(btn('Forgot password', 'text', None, True), '<span class="grow"></span>', btn('Sign in', 'fill')),
               '<div class="div"></div>', row(btn('Use a passkey', 'out', 'Fingerprint', True), btn('Another way', 'text', None, True)),
               row(ib('Translate', 'Language: English'), ib('HumanHandsup', 'Accessibility tools'), '<span class="bs mu grow">Home Assistant Material 2026.11.1.42</span>'))
second = panel('Second step', f'<span class="sq" style="background: var(--pc); color: var(--on-pc)">{I("ShieldKey")}</span>', '<h1 class="hs">One more step</h1><p class="bm mu">Type the 6-digit code from your authenticator app.</p>',
               '<div class="row" style="gap: 8px">' + ''.join(f'<span class="field{" focus" if i == 3 else ""}" style="flex: 1; justify-content: center; padding: 0"><span class="hs mono">{c}</span></span>' for i, c in enumerate(['4', '1', '7', '', '', ''])) + '</div>',
               '<span class="bs mu">The code changes every 30 seconds. You can paste all six digits at once.</span>',
               f'<label class="row" style="gap: 12px"><input type="checkbox" aria-label="Trust this device for 30 days" style="width: 20px; height: 20px; accent-color: #00639B"><span class="bm">Trust this device for 30 days</span></label>',
               row(btn('Use a backup code', 'text', None, True), '<span class="grow"></span>', btn('Verify', 'fill')), note('After 5 wrong codes, sign-in from this address waits 5 minutes and the owner is told.', '', 'ShieldCheck'))
who = panel('Pick who you are', f'<span class="sq" style="background: var(--greenc); color: var(--green)">{I("HomeAccount")}</span>', '<h1 class="hs">You are on the home network</h1><p class="bm mu">This tablet is trusted here. Pick who is using it.</p>',
            *[f'<button class="li" style="background: var(--sl2)"><span class="av" style="background: var(--{c}); color: var(--on-{c})">{n[0]}</span><span class="col grow"><span class="ll">{n}</span><span class="bs mu">{r}</span></span>{I("ChevronRight")}</button>'
              for n, r, c in [('Sam', 'Owner, asks for a PIN', 'pc'), ('Mika', 'Administrator, asks for a PIN', 'tc'), ('Kitchen tablet', 'Dashboards only', 'sc')]],
            row(btn('Sign in with a password instead', 'text', None, True)), '<span class="bs mu">Devices away from home always sign in with a password and the second step.</span>')
bare(P, 'SignIn', 'Sign in, second step, and trusted devices', signin + second + who, style='padding: 32px; gap: 20px; align-items: stretch')

# ---------- First-run steps ----------
def step(n, icon, title, text, *kids):
    return (f'<section class="card col" aria-label="Step {n}: {title}" style="gap: 12px; padding: 24px"><div class="row" style="gap: 12px"><span class="tag p" style="height: 28px; min-width: 28px; justify-content: center">{n}</span>{I(icon)}<h2 class="tm grow">{title}</h2></div>'
            f'<p class="bm mu">{text}</p>{"".join(kids)}</section>')
omap = '<svg viewBox="0 0 300 110" role="img" aria-label="Map with a pin where your home is" style="display: block; width: 100%; height: 110px; border-radius: 20px"><rect width="300" height="110" fill="#E4EAF0"></rect><g stroke="#fff" stroke-width="8"><path d="M0,70 L300,50"></path><path d="M130,0 L150,110"></path></g><circle cx="142" cy="60" r="28" fill="#00639B" fill-opacity=".16" stroke="#00639B" stroke-width="2"></circle><circle cx="142" cy="60" r="7" fill="#00639B"></circle></svg>'
body = (
    row('<div class="col grow" style="gap: 6px"><h1 class="hl">Setting up your home</h1><p class="bl mu">Six short steps. Each one can be changed later in Settings, and you can go back at any time.</p></div>',
        ib('Translate', 'Language: English'), ib('HumanHandsup', 'Accessibility tools'), style='align-items: flex-end')
    + track(50, 'Step 3 of 6')
    + grid(3,
           step(1, 'HandWave', 'Welcome', 'Start fresh, or bring everything back from a backup.', btn('Create my smart home', 'fill'), btn('Restore from a backup', 'out', 'BackupRestore')),
           step(2, 'AccountPlus', 'Your account', 'The first account is the owner.', field('Name', 'Sam'), field('Username', 'sam'), '<span class="bs mu">Password strength: strong. 14 characters.</span>' + track(90, 'Strong password', 'green')),
           step(3, 'MapMarker', 'Where your home is', 'For sunrise, weather and knowing who is home. It stays on this machine.', omap, row(btn('Find me', 'tonal', 'CrosshairsGps', True), btn('Search an address', 'text', None, True))),
           step(4, 'Earth', 'Country and units', 'Sets the language, units and radio rules.', select('Country', 'Canada'), frow(select('Units', 'Metric'), select('Currency', 'CAD'))),
           step(5, 'ChartBox', 'Help the project', 'All off unless you turn them on.', setting('ChartBox', 'Basic analytics', 'Version and country', sw(False, 'Basic analytics')), setting('Bug', 'Crash reports', '', sw(False, 'Crash reports'))),
           step(6, 'Devices', 'Devices found', 'These were found on your network. Add them now or later.', row(tag('Philips Hue'), tag('Sonos'), tag('Google Cast'), tag('+4'), gap=6, style='flex-wrap: wrap'), btn('Add all 7', 'tonal', 'Plus')), gap=16)
    + row(btn('Back', 'out', 'ArrowLeft'), '<span class="bs mu grow" style="text-align: center">Progress is saved after each step. Close the page and it picks up where you stopped.</span>', btn('Skip this step', 'text'), btn('Next', 'fill', 'ArrowRight'))
)
bare(P, 'OnboardingSteps', 'First run, all six steps', f'<div class="col" style="gap: 20px; width: 100%; background: var(--sl0); border-radius: 32px; padding: 40px">{body}</div>', w=1440, style='padding: 12px')

# ---------- Preparing page ----------
def stage(icon, title, sub, state):
    c = {'done': 'greenc', 'now': 'pc', 'wait': 'sl3'}[state]
    ic = 'Check' if state == 'done' else icon
    return f'<div class="row" style="gap: 12px; padding: 6px 0"><span class="lead" style="background: var(--{c}); color: var(--on)">{I(ic)}</span><span class="col grow"><span class="ll{" mu" if state == "wait" else ""}">{title}</span><span class="bs mu">{sub}</span></span></div>'
left = panel('Preparing', logo, '<h1 class="hl">Preparing Home Assistant</h1><p class="bl mu">The first start downloads the latest version. On a Raspberry Pi 5 this takes about 8 minutes.</p>', track(62, '62 percent'),
             '<span class="row bm" style="gap: 8px"><b>62%</b><span class="mu">about 3 minutes left, 31 MB per second</span></span>',
             stage('Download', 'Downloading Home Assistant Material 2026.11.1.42', '412 of 660 MB, from this project’s images', 'now'), stage('PackageDown', 'Unpacking', 'Waiting', 'wait'), stage('Play', 'Starting for the first time', 'Waiting', 'wait'),
             row(btn('Restore from a backup instead', 'out', 'BackupRestore'), btn('Use a different network', 'text', 'Wifi')), w=560)
right = panel('Details', '<h2 class="tm">What is happening</h2>',
              '<div class="col mono" style="background: var(--sl2); border-radius: 20px; padding: 16px; gap: 2px; font-size: 12px; line-height: 20px"><span>23:04:10 Network is up, 192.168.1.10</span><span>23:04:11 Time is in sync</span><span>23:04:12 Reading the version feed of this project</span><span>23:04:14 Core 2026.11.1.42, supervisor 2026.11.0.42</span><span>23:04:15 Pulling the core image, layer 9 of 14</span></div>',
              kv(('This machine', 'Raspberry Pi 5, 8 GB'), ('Address', 'http://homeassistant.local:8123'), ('Operating system', '18.5.42'), ('Storage free', '241 GB')),
              note('You can close this page. It opens the welcome step by itself when everything is ready.'),
              row(ib('Translate', 'Language: English'), ib('HumanHandsup', 'Accessibility tools'), '<span class="grow"></span>', btn('Copy the details', 'text', 'ContentCopy', True)), w=440)
bare(P, 'Landing', 'The preparing page, before the first start', left + right, style='padding: 32px; gap: 20px; align-items: stretch')
