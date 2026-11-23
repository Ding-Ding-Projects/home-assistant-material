# Event clips: Play only with a real clip, and live video recorded around events

Commits `02856a9e3` (event records and copying clips), `7115ff26f` (live recording around
events), `23225de03` and `090bf8e62` (last-seen line, light recording picker). Design: canvas 38,
board `Events.dc.html` (`62c70ce1c`).

Code: `core/homeassistant/components/camera_recording/` (`events.py`, `live.py`, `manager.py`,
`websocket.py`), `frontend/src/components/ha-camera-timeline.ts`,
`frontend/src/data/camera_recording.ts`,
`frontend/src/panels/config/camera-recording/ha-config-camera-recording.ts`.

## The problem

A doorbell could list two events, each with a Play button, and nothing was behind either. The
button only asked whether the camera was being recorded at all, never whether a file existed for
that event. A camera that streams only through its service could not be recorded at all.

## Each event has its own record

| State | What the row shows |
| --- | --- |
| Saved | Play, and where the clip came from |
| Being saved | Progress, no Play |
| Not kept | One plain line with the reason, no Play |

Play appears only when a file is really on disk. The reasons are codes, shown as one line each:
recording is off, the service said too many requests, it timed out, the camera cannot do this,
storage is full, storage is unreachable, the clip was removed, no media was found, or it failed.
Only the kind of error is used to pick a code. The text of a service error can carry addresses, so
it is never stored or logged.

Two reports of one event (the integration's event and its media list) count as one event when
they are within 30 seconds. A clip that has not turned up 10 minutes after its event is given up
on. At most 400 records are kept per camera.

## No more silence

Nothing used to be logged when a clip could not be saved. A failure is now logged once with its
reason code, counted, and shown as the camera's last problem, without any of the service's own
error text. A first saved clip would also have crashed on a missing key; fixed in `02856a9e3`.

## Clips the service already keeps

For a camera that streams only through its service, the short clip the service already keeps is
copied in through the integration that holds the sign-in. The sign-in never moves.

## Live video recorded around each event

A camera that streams only through its service is recorded by the home itself each time something
is seen.

- About 40 seconds of its live video per event (default 40; the constants allow 10 to 120).
- The bundled streaming program is handed only the connection handshake, through a one-time
  address on this machine that works once, for 30 seconds, from this machine only. Sign-in, tokens
  and service addresses never leave the integration that holds them.
- One live session per camera at a time.
- A budget of 12 clips an hour by default (the constants allow 1 to 30).
- After the service says "too many requests", nothing asks again until the wait is over (the
  related live view backoff is in
  [`live-sharing-and-light-recording.md`](live-sharing-and-light-recording.md)).
- Whichever clip arrives first wins, the service's own short clip or the home's recording. Each
  row says where its clip came from.
- "All day" is not offered for such a camera, and the page says so.

## Other camera changes in this range

- The camera sheet says when an offline camera was last seen.
- Light recording has a picker for what counts as "something was seen".
- The camera recording page now follows the language mode (it ignored it before, `ecc3e18ef`).

## Recording check and test clip (`a3cb56d37`, in no released build yet)

Each camera on the camera recording page has a **Recording check** that answers "will this camera
actually record?" in one place:

- **Streaming program:** set up and ready; not set up; runs elsewhere, so it cannot record here; or
  Home Assistant uses HTTPS, which this does not support yet.
- **Streams only through its service:** yes or no.
- **Last event heard**, **Last clip** (recorded here or from the camera service, its length, and
  whether it was cut short) and **Last problem** (or none).
- **Clips left this hour**, as "count of total".
- **Record a 10 second test clip now** runs the whole route once and reports "saved, seconds,
  size" or "not saved" with the reason. The button notes that it uses one live view from the
  camera service, so a test counts against the clips of the hour whether it succeeds or not
  (`async_test_clip` in `manager.py`, websocket command `camera_recording/test_clip`). A test is
  refused when the camera is busy, over its hourly limit, or not able to record live.

The integration look of 18 November fixed two faults on this page: the "kept for N days", clip
length and live clips per hour sliders (and "Longest live view kept" and "Snapshots that repeat"
in the per-camera watched settings) sat on top of their labels, and in both-language mode a failed
test clip repeated its reason in both languages inside each half of the sentence. The sentence is
now composed per language.

## Verification and what is not proven

- **Proven end to end only against a pretend camera service in a container:** 10.3 seconds from
  event to a saved 10.00 second clip, the temporary stream removed afterwards, and no handshake
  text in the log. Tests: `test_event_clips.py`, `test_live.py`, `test_live_e2e.py`.
- **Never run against a real camera.** Whether a real camera service accepts the handshake, and
  what its request allowance allows, can only be proven by the owner with a real doorbell.
- Not seen in a browser: the event list states, the offline last-seen line (still listed as
  unseen at `ecc3e18ef`), and the language mode on this page in both-language mode.
- Both commits are in build 523, which was only exercised by a page-load pass and a real update
  run; neither exercised a camera.
- **Integration look, 18 November, on a local build of the tree with a demo camera (390 px, dark,
  both-language mode):** the recording check showed every line above, and the page followed the
  language mode. The test clip was pressed: "not saved. The home could not save the video." The
  streaming program was present, so the "not set up" reason was not provoked; the demo camera's
  live offer failed, which gave the general failure reason. The clips left this hour went from 12
  to 11, as designed. The slider and reason fixes were seen on the last build of that look. A saved
  test clip, the event rows and the camera sheet were not seen. A release carrying this was
  dispatched for `a3cb56d37` and is not yet verified.
- On 22 November, **Record a 10 second test clip now** saved a video from a synthetic camera
  streaming colour bars through its provider. The ordinary download returned a 26,062-byte
  H.264 MP4. Frame decoding confirmed seven colour bands at 320 × 240, 15 fps, for 10.000
  seconds. The normal player retrieved the segment, but that Chromium build lacked H.264
  playback support. Disabling the isolated streaming program displayed **Not set up** and
  disabled the button. Re-enabling it restored **Set up and ready** without a restart.
  The test used generated video. Physical cameras and provider account limits remain unverified.

## Cameras that need a data channel in the offer

Some cloud cameras, Nest among them, accept a live offer only when its media sections come
in the order audio, video, data channel, and only when a data channel is present. The
streaming program's own offer has neither. Before this change a Nest doorbell refused every
live offer, the streaming program then read the refusal as an answer with no ICE
credentials, and each event ended as **No clip kept: failed**.

The live offer endpoint now reshapes the offer for any camera whose WebRTC client
configuration asks for a data channel: it orders the sections audio, video, other, adds a
bundled data-channel section, and maps the camera's answer back to the original order
without the added section. An answer that still has no ICE credentials is refused with a
clear failure instead of being passed on. The first refusal from each camera is logged once
with the camera's own reason.

Verification: unit tests cover the offer order, the added data channel, the restored answer
and the pass-through of an unexpected answer. A real Nest doorbell has not yet been tested
with this build.
