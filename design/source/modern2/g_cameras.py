"""Modern remake, group 9: Cameras. An event timeline under the camera player and around-the-clock recording."""
from ui import *

begin('cameras')
P1, P2, P3 = 'timeline', 'recording', 'phone'

# Event kinds: icon, label, tone colour variable.
KINDS = {'motion': ('Run', 'Motion', '--w'), 'person': ('Walk', 'Person', '--p'),
         'doorbell': ('Doorbell', 'Doorbell', '--t'), 'sound': ('EarHearing', 'Sound', '--ok')}
EVENTS = [('person', '07:42', 'Person at the front door', '38 s'), ('motion', '09:15', 'Motion in the driveway', '1 min 10 s'),
          ('doorbell', '11:03', 'Doorbell pressed', '12 s'), ('motion', '12:48', 'Motion in the driveway', '24 s'),
          ('sound', '13:40', 'Loud sound', '6 s'), ('person', '14:32', 'Person at the front door', '2 min 4 s')]


def video(label, live_=True, h=330, extra=''):
    chip = (f'<span class="row" style="position:absolute;left:18px;top:18px;gap:8px;padding:6px 14px;border-radius:99px;background:{"var(--e)" if live_ else "rgba(0,0,0,.55)"};color:#fff;font-weight:600;font-size:13px">'
            + (f'<span style="width:8px;height:8px;border-radius:4px;background:#fff;animation:breathe 1.6s infinite"></span>Live' if live_ else f'{I("History", 16)}Recorded') + '</span>')
    return (f'<div style="position:relative;height:{h}px;border-radius:28px;overflow:hidden;background:linear-gradient(180deg,#2b3340 0%,#1b2029 60%,#11151b 100%)">'
            '<svg viewBox="0 0 1000 470" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">'
            '<path d="M0 330 L1000 290 L1000 470 L0 470Z" fill="#232a35"/><rect x="620" y="110" width="210" height="240" rx="6" fill="#2f3846"/><rect x="680" y="160" width="90" height="190" rx="4" fill="#3b4656"/>'
            '<circle cx="745" cy="260" r="5" fill="#c9b27a"/><rect x="120" y="250" width="250" height="90" rx="20" fill="#2a3240"/></svg>'
            f'{chip}<span class="mono" style="position:absolute;right:18px;top:18px;padding:6px 12px;border-radius:12px;background:rgba(0,0,0,.55);color:#fff;font-size:13px">{e(label)}</span>{extra}</div>')


def controls(live_=True):
    left = row(ib('Rewind10'), f'<span class="ib" style="background:var(--p);color:var(--onp)">{I("Pause" if live_ else "Play", 22)}</span>', ib('FastForward10'), gap=4)
    right = row(seg(['1×', '2×', '4×'], 0), ib('CameraOutline'), ib('Download'), ib('Fullscreen'), gap=6)
    mid = pill('Live now', 'g') if live_ else btn('Back to live', 'fill', 'Broadcast')
    return row(left, f'<span class="grow"></span>', mid, f'<span class="grow"></span>', right, style='margin-top:14px')


def track(zoom='24 hours', sel=None, w=1100):
    """A day track: recorded footage band, a gap, event markers, the playhead and the live edge."""
    ticks = ''.join(f'<span class="xs mu" style="position:absolute;left:{i * 100 / 6:.2f}%;top:0;transform:translateX(-50%)">{h:02d}:00</span>' for i, h in enumerate(range(0, 25, 4)))
    marks = ''
    for k, t, title, d in EVENTS:
        hh, mm = map(int, t.split(':'))
        x = (hh * 60 + mm) / 1440 * 100
        ic, lb, c = KINDS[k]
        ring = 'box-shadow:0 0 0 3px var(--surf),0 0 0 6px var(--p);' if sel == t else 'box-shadow:0 0 0 3px var(--surf);'
        marks += (f'<span title="{e(title)}" style="position:absolute;left:{x:.2f}%;top:34px;transform:translateX(-50%);width:28px;height:28px;border-radius:14px;background:var({c});color:var(--surf);display:grid;place-items:center;{ring}">{I(ic, 16)}</span>')
    now = 15.2 / 24 * 100
    return (f'<div style="position:relative;height:118px;margin-top:6px">'
            f'<div style="position:absolute;left:0;right:0;top:0;height:18px">{ticks}</div>'
            f'<div style="position:absolute;left:0;width:{now:.2f}%;top:70px;height:14px;border-radius:7px;background:var(--okc)"></div>'
            f'<div style="position:absolute;left:{2.5 / 24 * 100:.2f}%;width:{0.9 / 24 * 100:.2f}%;top:70px;height:14px;border-radius:7px;background:repeating-linear-gradient(45deg,var(--ec) 0 6px,var(--e) 6px 8px)" title="Not recorded"></div>'
            f'{marks}'
            f'<span style="position:absolute;left:{(sel_x(sel) if sel else now):.2f}%;top:24px;bottom:4px;width:3px;border-radius:2px;background:var(--on);transform:translateX(-50%)"></span>'
            f'<span class="xs" style="position:absolute;left:calc({now:.2f}% + 8px);top:90px;font-weight:600;color:var(--e)">Now</span>'
            f'<div style="position:absolute;left:{now:.2f}%;right:0;top:70px;height:14px;border-radius:7px;background:var(--s2)"></div></div>')


def sel_x(t):
    hh, mm = map(int, t.split(':'))
    return (hh * 60 + mm) / 1440 * 100


def legend():
    return row(*[f'<span class="row xs" style="gap:6px"><span style="width:12px;height:12px;border-radius:6px;background:var({c})"></span>{lb}</span>' for ic, lb, c in KINDS.values()],
               '<span class="row xs" style="gap:6px"><span style="width:18px;height:10px;border-radius:5px;background:var(--okc)"></span>Recorded</span>',
               '<span class="row xs" style="gap:6px"><span style="width:18px;height:10px;border-radius:5px;background:repeating-linear-gradient(45deg,var(--ec) 0 4px,var(--e) 4px 6px)"></span>Not recorded</span>', gap=16)


def ev_rows(sel=None, n=6):
    out = []
    for k, t, title, d in reversed(EVENTS[-n:]):
        ic, lb, c = KINDS[k]
        style = 'background:var(--pc);' if t == sel else ''
        out.append(f'<div class="row" style="gap:14px;padding:10px 12px;border-radius:16px;{style}">'
                   f'<span style="width:40px;height:40px;border-radius:12px;background:var({c});color:var(--surf);display:grid;place-items:center;flex:none">{I(ic, 20)}</span>'
                   f'<div class="col grow" style="gap:0"><b>{e(title)}</b><span class="sm mu">{t} · {d}</span></div>{btn("Play", "ton", "Play", "sm")}</div>')
    return ''.join(out)


def tl_card(zoom=2, sel=None):
    return card(row('<b class="h3 grow">Today</b>', chips('Today', 'Yesterday', 'Pick a day', sel=0), seg(['1 hour', '6 hours', '24 hours'], zoom), gap=10),
                track(sel=sel), legend(), row(chips('All events', 'Motion', 'Person', 'Doorbell', 'Sound', sel=0), '<span class="grow"></span>', '<span class="sm mu">Left and right arrows move 10 s · Page keys jump between events</span>'),
                pad=20, gap=12)


live_page = (header('Front door', 'Camera · Recording around the clock to the NAS share', 'Overview › Front door', row(btn('Recording settings', 'out', 'Cog'), tools(), gap=10))
             + grid('minmax(0,1.6fr) minmax(0,1fr)', col(video('Today 15:12:44'), controls(True), tl_card(), gap=0),
                    card(ev_rows(), title='Events today', action=pill('6', 'p'), gap=4)))
page_board('CamLive', 'Live camera with the event timeline', P1, live_page, active='Overview', caption='Live view: the player, then a timeline of the day with recorded footage, gaps and every event; the list beside it plays any event')

play_page = (header('Front door', 'Playing an event from today', 'Overview › Front door', row(btn('Recording settings', 'out', 'Cog'), tools(), gap=10))
             + grid('minmax(0,1.6fr) minmax(0,1fr)', col(video('Today 14:32:05', False, extra='<span class="row" style="position:absolute;left:18px;bottom:18px;gap:8px;padding:6px 14px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff;font-size:13px">' + I('Walk', 16) + 'Person at the front door · 2 min 4 s</span>'), controls(False), tl_card(1, '14:32'), gap=0),
                    card(ev_rows('14:32'), note('Clips play from the recordings. The camera keeps recording while you watch.', 'p', 'InformationOutline'), title='Events today', action=pill('6', 'p'), gap=4)))
page_board('CamPlayback', 'Playing a recorded event', P1, play_page, active='Overview', caption='Playback: choosing an event or dragging the playhead plays the recording; Back to live returns to the live edge')

dark_page = live_page
page_board('CamLiveDark', 'Live camera, dark', P1, dark_page, active='Overview', dark=True, caption='The same view in the dark theme: event colours keep their contrast on the dark surface')

empty_page = (header('Garden', 'Camera · Not recording', 'Overview › Garden', row(btn('Recording settings', 'out', 'Cog'), tools(), gap=10))
              + grid('minmax(0,1.6fr) minmax(0,1fr)', col(video('Today 15:12:44'), controls(True),
                                                          card(row('<b class="h3 grow">Today</b>', seg(['1 hour', '6 hours', '24 hours'], 2)), track(), note('This camera is not recorded yet, so only events are shown. Set up recording to play back any moment.', 'w', 'RecordRec'), btn('Set up recording', 'fill', 'RecordRec'), pad=20, gap=12), gap=0),
                         card(ev_rows(n=3), title='Events today', gap=4)))
page_board('CamNoRecording', 'Timeline before recording is set up', P1, empty_page, active='Overview', caption='Without recording: events still show on the timeline, with one button into guided setup')

# ---------------- Recording setup ----------------
STEPS = ['Where', 'Connection', 'Test', 'Cameras', 'Keep for', 'Done']
DEST = [('Harddisk', 'A disk or folder on this computer', 'The data disk, or any folder Home Assistant can write to', 'p'),
        ('Usb', 'An external or USB disk', 'Pick it from the disks Home Assistant can see', 'p'),
        ('FolderNetwork', 'A Windows shared folder', 'A share on a PC or NAS, reached with a user name and password', 't'),
        ('ServerNetwork', 'An SSH server (SFTP)', 'Any computer or NAS with SSH, using a password or a key', 'g'),
        ('ConsoleNetwork', 'An SSH server (SCP)', 'For servers that allow copying with SCP but not SFTP', 'w')]


def wiz(cur, body, sub):
    return (header('Record cameras around the clock', sub, 'Settings › Devices and services › Add integration', tools())
            + steps(STEPS, cur) + f'<div style="margin-top:22px">{body}</div>')


w1 = wiz(0, grid('minmax(0,1.5fr) minmax(0,1fr)',
                 col(*[card(row(ico(i, t), col(f'<b class="h3">{e(n)}</b>', f'<span class="sm mu">{e(d)}</span>', gap=2, style='flex:1'), f'<span style="width:22px;height:22px;border-radius:11px;border:2px solid var({"--p" if k == 2 else "--out"});display:grid;place-items:center">' + (f'<span style="width:12px;height:12px;border-radius:6px;background:var(--p)"></span>' if k == 2 else '') + '</span>', gap=16), pad=18,
                            style='outline:2px solid var(--p)' if k == 2 else '') for k, (i, n, d, t) in enumerate(DEST)], gap=10),
                 card(note('Recording never stops while a segment is being copied. Each camera writes short segments here first, then they move to where you choose.', 'p', 'InformationOutline'),
                      kv([('Segment length', '5 minutes'), ('Format', 'MP4, copied from the camera without re-encoding'), ('Kept here for fast playback', '6 hours')]),
                      row(btn('Back', 'txt'), '<span class="grow"></span>', btn('Next', 'fill', 'ArrowRight')), title='How it works')), 'Step 1 of 6 · Where should recordings go?')
page_board('RecWhere', 'Guided setup: where recordings go', P2, w1, caption='Step 1: five destinations in plain words; the chosen one is outlined')

w2 = wiz(2, grid('minmax(0,1fr) minmax(0,1fr)',
                 card(field('Server', 'nas.local'), field('Share', 'Cameras'), field('Folder in the share', 'home-assistant'), field('User name', 'recorder'), field('Password', '••••••••••'), field('Domain (optional)', ''), title='Windows shared folder'),
                 card(*[row(I(ic, 22), f'<span class="grow">{x}</span>', pill(s, t)) for ic, x, s, t in
                        [('CheckCircle', 'Reach nas.local on port 445', 'Done', 'g'), ('CheckCircle', 'Sign in as recorder', 'Done', 'g'), ('CheckCircle', 'Open the share Cameras', 'Done', 'g'),
                         ('CheckCircle', 'Write, read back and delete a test file', 'Done', 'g'), ('CheckCircle', 'Free space', '1.2 TB', 'g')]],
                      note('About 18 days of recordings fit at the current camera settings.', 'g', 'Harddisk'),
                      row(btn('Test again', 'ton', 'Refresh'), '<span class="grow"></span>', btn('Back', 'txt'), btn('Next', 'fill', 'ArrowRight')), title='Connection test', gap=12)),
         'Step 3 of 6 · Checking the connection')
page_board('RecTest', 'Guided setup: connection test', P2, w2, caption='Steps 2 and 3: the connection form, then a test that writes, reads back and removes a real file before anything is saved')

w2e = wiz(2, grid('minmax(0,1fr) minmax(0,1fr)',
                  card(field('Server', '192.168.1.40'), field('Port', '22'), field('User name', 'cams'), seg(['Password', 'Key file'], 1), field('Key file', '/config/.ssh/id_ed25519', mono=True), field('Folder on the server', '/srv/cameras', mono=True), title='SSH server (SFTP)'),
                  card(*[row(I(ic, 22), f'<span class="grow">{x}</span>', pill(s, t)) for ic, x, s, t in
                         [('CheckCircle', 'Reach 192.168.1.40 on port 22', 'Done', 'g'), ('CheckCircle', 'Sign in with the key', 'Done', 'g'), ('AlertCircle', 'Write to /srv/cameras', 'Permission denied', 'e')]],
                       note('The user cams cannot write to /srv/cameras. On the server run: sudo chown cams /srv/cameras', 'e', 'AlertCircle'),
                       row(btn('Test again', 'fill', 'Refresh'), '<span class="grow"></span>', btn('Back', 'txt')), title='Connection test', gap=12)),
          'Step 3 of 6 · A test that found a problem')
page_board('RecTestFail', 'Guided setup: a failed test explains the fix', P2, w2e, caption='A failed step says what failed and what to do about it; Next stays off until the test passes')

cams = [('Front door', 'Cctv', 1, '1080p · about 26 GB a day'), ('Driveway', 'Cctv', 1, '1080p · about 24 GB a day'), ('Garden', 'Cctv', 0, '720p · about 12 GB a day'), ('Doorbell', 'DoorbellVideo', 1, '1080p · about 20 GB a day')]
w3 = wiz(4, grid('minmax(0,1fr) minmax(0,1fr)',
                 card(*[row(ico(i, 'p', 40, 12, 20), col(f'<b>{n}</b>', f'<span class="sm mu">{d}</span>', gap=0, style='flex:1'), switch(o)) for n, i, o, d in cams], title='Cameras to record', gap=12),
                 card(field('Keep recordings for', '14 days'), field('Never use more than', '800 GB'), field('Keep here for fast playback', '6 hours'), field('Segment length', '5 minutes'),
                      note('When either limit is reached, the oldest recordings are removed first.', 'p', 'InformationOutline'),
                      row(btn('Back', 'txt'), '<span class="grow"></span>', btn('Start recording', 'fill', 'RecordRec')), title='How long to keep them', gap=12)),
         'Steps 4 and 5 of 6 · Cameras and how long to keep recordings')
page_board('RecKeep', 'Guided setup: cameras and how long to keep', P2, w3, caption='Steps 4 and 5: choose cameras with a size estimate each, then the time and space limits')

st = (header('Camera recording', 'Recording 3 cameras to nas.local › Cameras', 'Settings › Devices and services', row(btn('Pause all', 'ton', 'Pause'), btn('Change setup', 'out', 'Cog'), tools(), gap=10))
      + stats(('3', 'Recording', 'g', 'RecordRec'), ('1', 'Off', None, 'RecordCircleOutline'), ('612 GB', 'Used of 800 GB', 'p', 'Harddisk'), ('12 s ago', 'Last copy', 't', 'Upload'))
      + table(['Camera', 'State', 'Last segment', 'Waiting to copy', 'Oldest kept'],
              [['<b>Front door</b>', pill('Recording', 'g'), '15:10, 5 min', '0', '1 Nov 15:15'], ['<b>Driveway</b>', pill('Recording', 'g'), '15:10, 5 min', '1', '1 Nov 15:15'],
               ['<b>Doorbell</b>', pill('Reconnecting', 'w'), '15:02, 3 min', '0', '1 Nov 15:15'], ['<b>Garden</b>', pill('Off', 'n'), '—', '—', '—']])
      + note('If the share cannot be reached, segments wait here and copy once it is back. Nothing is lost until the local space runs out.', 'p', 'InformationOutline'))
page_board('RecStatus', 'Recording status', P2, st, caption='Status: every camera, what is waiting to copy, space used against the limit')

# ---------------- Phone ----------------
ph1 = phone(video('15:12:44', h=210) + row(ib('Rewind10'), f'<span class="ib" style="background:var(--p);color:var(--onp)">{I("Pause", 22)}</span>', ib('FastForward10'), '<span class="grow"></span>', pill('Live now', 'g'))
            + seg(['1 hour', '6 hours', '24 hours'], 2) + f'<div style="transform:scale(.97);transform-origin:left">{track()}</div>' + f'<div class="col" style="gap:0">{ev_rows(n=3)}</div>', 'Front door', 'Home', back=True)
ph2 = phone(card(*[row(ico(i, t, 36, 12, 18), col(f'<b class="sm">{e(n)}</b>', gap=0, style='flex:1'), f'<span style="width:18px;height:18px;border-radius:9px;border:2px solid var({"--p" if k == 2 else "--out"})"></span>') for k, (i, n, d, t) in enumerate(DEST)], gap=10, pad=14)
            + btn('Next', 'fill', 'ArrowRight'), 'Where should recordings go?', 'Settings', back=True)
phone_board('CamPhone', 'Camera timeline and setup on a phone', P3, [ph1, ph2], caption='On a phone: the timeline sits under the player and the event list follows; the guided setup is one column')

write_index('Home Assistant Material, modern: Cameras', [(P1, 'Event timeline under the camera player'), (P2, 'Recording around the clock, with guided setup'), (P3, 'Cameras on a phone')], 'CamLive')
