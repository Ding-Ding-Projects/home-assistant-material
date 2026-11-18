# Camera recording and the event timeline

Code: `core/homeassistant/components/camera_recording/`, `frontend/src/components/ha-camera-timeline.ts`,
`frontend/src/data/camera_recording.ts`, `frontend/src/dialogs/more-info/controls/more-info-camera.ts`.
Design: `design/canvases/32-modern-cameras`, drawn by `design/source/modern2/g_cameras.py`.

## What it does

Cameras are recorded around the clock in short MP4 files, and the camera view shows a timeline of
the day under the player, in the style of a doorbell camera app: recorded footage, gaps, and every
motion, person, vehicle, animal, doorbell and sound event of the camera's device. Choosing an event
or a moment on the timeline plays the recording from that moment; **Back to live** returns to the
live picture.

## Setting it up

Settings › Devices and services › Add integration › **Camera recording** opens a guided setup:

1. **Where should recordings go?** A disk or folder on this computer, an external or USB disk, a
   Windows shared folder, an SSH server with SFTP, or an SSH server with SCP.
2. **Connection.** The details for the chosen place. A private key file can be uploaded for SSH.
3. **Connection test.** Before anything is saved, Home Assistant reaches the server, signs in,
   opens (and creates) the folder, writes a small file, reads it back, compares it, deletes it and
   reads the free space. Each step is shown with ✅ or ❌ and the reason; the setup only moves on
   when every step passes.
4. **Cameras.** Every camera is offered, all chosen by default.
5. **How long to keep recordings.** An age limit in days, an optional space limit in GB, how many
   hours of recent recordings stay on this computer for fast playback, and the length of each file.
   The form estimates how many days fit in the free space at about 2 Mbit/s per camera.

Several destinations can be set up; a camera can be recorded to more than one. Cameras and limits
change later under the integration's **Configure** button.

## How recording works

- One `ffmpeg` process per camera reads the camera's stream source, copies the video as it is (no
  re-encoding) and converts audio to AAC, writing one MP4 file per segment. Files are cut on the
  clock (every 5 minutes by default) and named by their start time in UTC, for example
  `20261115T151000Z.mp4`.
- A folder or disk destination is written in place. For a share or an SSH server, segments are
  written to `camera_recording/<entry>/<camera>/` in the configuration folder first and copied
  every 10 seconds to `<camera>/<YYYY-MM-DD>/<file>` at the destination, so recording never waits
  for the network. When the destination cannot be reached, segments wait and are copied once it
  is back; the status shows how many are waiting and why.
- When ffmpeg stops (the camera reboots, the network drops), it is started again after 2, 5, 10,
  30 and then 60 seconds. A camera without a stream source is retried every minute and shown as
  having no stream.
- The oldest recordings are removed first when the age limit or the space limit is reached, at
  the destination and here. Copies kept here for fast playback are removed once they are older
  than the playback buffer.
- Stopping Home Assistant (or unloading the integration) finishes the open segment cleanly.

## Entities

Each destination is a device called **Camera recording** with:

- a **recording** binary sensor per camera (on while ffmpeg writes), with the recorder state and
  its last problem as attributes;
- a **Record** switch per camera, which pauses and resumes recording and stays off across restarts;
- **Space used** and **Waiting to copy** sensors.

## The timeline

- The day can be changed with the arrows beside its name; 1, 6 and 24 hour zooms centre on the
  playhead.
- Green is recorded footage, red stripes are moments the camera was set up for recording but
  nothing was recorded. A camera that is not recorded shows its events and a link to set recording
  up.
- Event markers that would overlap are drawn as one marker with a count; hovering lists them.
- Chips filter the event kinds; the list under the timeline plays any event from 5 seconds before
  it starts.
- The track is a slider: left and right arrows move 10 seconds, Page Up and Page Down jump between
  events, Home goes to the start of the window and End returns to live.
- Events come from the camera's device: binary sensors with the motion, moving, occupancy,
  presence or sound device classes, and event entities with the doorbell or motion device classes.
  Words in the entity id or name (person, vehicle, animal, doorbell, sound) refine the kind.

While a recording plays, the controls offer back and forward 10 seconds, pause, 1×, 2× and 4×
speed, and a download of the file being played. Playback moves to the next file on its own.

## WebSocket and HTTP

- `camera_recording/segments` with `entity_id`, `start_time` and `end_time` (at most 8 days):
  whether the camera is recorded, whether it is recording now, and its segments. Needs read access
  to the camera.
- `camera_recording/status` (admin): every destination with its cameras, space, last copy and
  problem.
- `camera_recording/pause` (admin) with `entry_id`, an optional `entity_id` and `paused`.
- `GET /api/camera_recording/segment/<entry_id>/<entity_id>/<file>` plays one segment. Use a path
  signed with `auth/sign_path`. A segment no longer kept here is fetched back from the destination
  into a small cache first.

## Limits

- Video is copied as the camera sends it. A camera that sends H.265 records fine, but plays back
  only in browsers that can play H.265.
- SMB uses the `smbprotocol` library with NTLM or Kerberos sign-in. SSH host keys are not checked,
  the same as the SFTP backup location.
- Private keys protected by a passphrase are not supported.

## See also

[`event-clips-and-live-recording.md`](event-clips-and-live-recording.md): each event has its own record and Play appears only with a real clip, clips are copied in from the camera service, and live video is recorded around each event (proven only against a pretend camera service, never a real camera).

[`live-sharing-and-light-recording.md`](live-sharing-and-light-recording.md): one shared live view per camera, the calm "limited" state when a provider refuses, light recording and event clips for provider-only cameras.
