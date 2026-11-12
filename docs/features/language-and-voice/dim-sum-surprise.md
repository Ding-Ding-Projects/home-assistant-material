# Dim sum surprise

Code: `frontend/src/components/dim-sum/ha-dim-sum-surprise.ts`, `frontend/src/common/dim-sum/`,
`frontend/src/data/dim_sum.ts`, `core/homeassistant/components/dim_sum/`. Design board: `DimSum`.

## What it does

About one start in ten, one small card drops by in the bottom corner of the interface with a
picture of a dim sum dish and its name in English and Cantonese, then leaves by itself after
about six seconds.

- **The draw.** Each launch (one page load of the app shell) takes one random draw. A value
  below 0.1 shows a dish, anything else shows nothing. The draw is never repeated in the same
  launch, so moving around the app never shows a second card. A page load is a new launch.
- **Never in the way.** The card is not a dialog, never takes focus, and never delays the
  interface: it loads after the shell. Hovering over it or focusing it pauses the timer and the
  progress bar; there is a close button. It is announced once through a polite live region and
  the picture has alt text with the dish name. Reduced motion (the browser setting, the
  accessibility tool or low stimulation) removes the fade and the bar movement. The action sound
  service plays a short tone only when sounds are on, not muted and not in quiet hours.
- **When it must not appear** (`common/dim-sum/dim-sum-draw.ts`, `dim-sum-state.ts`): School mode
  is on; first-run setup or the sign in page; the connection is down or reconnecting; the server
  is starting, stopping or in recovery mode, or an update is installing; an error screen is
  showing; a dialog is open; a page has unsaved changes. While the shell is still loading or
  the connection is not up the draw waits at most five seconds and is then lost; for a dialog,
  an error or unsaved changes the draw for that launch is lost at once.
- **Language and playfulness.** The dish name follows the language mode (English, Cantonese or
  both, one language per line). The greeting line follows the two playfulness levels. The dish
  name itself is never altered.
- **It cannot be turned off.** Settings, Personal settings, Language and playfulness shows a
  "Dim sum surprise" switch that is on. Turning it off does nothing: the switch slides back on
  and a short message says so, in the chosen language and playfulness. Nothing is stored for it
  (`dim-sum-switch.ts` returns "on, nothing stored" for every request).
- **School mode** removes the card, the switch and every mention of it, as if the feature were
  not installed.

## Where the pictures come from

Nothing is bundled and no picture is committed. The server component `dim_sum` reads only the
public catalogue repository `Ding-Ding-Projects/dim-sum-photos`:

- the dish names from `catalog/index.json` on `raw.githubusercontent.com`;
- the list of published releases from `api.github.com` (only releases tagged `catalog-v1*`,
  never drafts), to find which dishes have a published picture;
- the pictures from those releases' download addresses on `github.com`.

**This is the one outbound request this feature makes.** It is a plain GET with a generic
user agent and an `Accept` header. It sends no cookie, no token, no instance name, address or
version, and nothing about the signed-in person. It runs in the background after startup, at
most once a day for the catalogue (a failure is retried after an hour), and one request per
picture that is not cached yet. The catalogue is up to 32 MiB, a release list page up to 16 MiB,
a picture up to 12 MiB; a response that is larger, is not an image type (`image/png` or a plain
byte stream) or does not start with the PNG signature is refused and never cached.

Cache, in the configuration folder's `.storage` area (never in the repository): the catalogue
with its source address, a revision (a short hash of the file) and the fetch time, and up to
48 pictures. The component works fully offline from the cache; with nothing cached and no
network it simply reports no dish and the interface shows nothing.

WebSocket command `dim_sum/random` (any signed-in person) returns
`{ id, name_en, name_yue, picture_url, content_type }` or `null`. `picture_url` is a signed path
for `/api/dim_sum/picture/<id>`, valid for five minutes, because an image cannot send a token.
The view is authenticated and serves only a cached picture for a plain lower-case id.

## Limits

- Uses the catalogue's own names (for example "Dai Pai Dong-Style Salt and Pepper Squid"), not
  shorter dim sum names.
- The catalogue is still in progress upstream, so only the dishes with a published picture are
  used.
- A real draw has a one in ten chance; verification forced the draw in a development build.

## Verification

Server: 48 tests with the network mocked (`core/tests/components/dim_sum/`). Interface: unit
tests of the decision, the switch outcome, the server-busy rule and the error-screen search
(`frontend/test/common/dim-sum/`). A development build was run in a container with the real
catalogue and seen in a headless browser at 1440x900 and 390x800: the card in English,
Cantonese and both languages; no card at a draw of 0.5 or exactly 0.1; no card and no switch in
School mode; the switch springing back with its message; the card leaving after about six
seconds, staying while hovered, closing with its button, never taking focus, and not
returning in the same launch; nothing on the sign in page. Not seen: the "must not appear"
moments other than School mode and the sign in page (dialog open, unsaved changes, connection
down, update running, error screen; covered by unit tests only), first-run setup (the test
instance was already set up), a screen reader, and the sound.
