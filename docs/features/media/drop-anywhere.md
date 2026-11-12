# Drop files anywhere to add media

Also: choose files with a picker, or paste them (see "Touch screens, the picker and paste").

Code: `frontend/src/common/file-drop/` (`drop-routing.ts`, `drop-convert.ts`, `media-target.ts`,
`drop-upload-queue.ts`, `file-drop-controller.ts`, `add-media.ts`, `paste-guard.ts`, `format-bytes.ts`),
`frontend/src/util/upload-with-progress.ts`, `frontend/src/components/file-drop/ha-add-media-sheet.ts`, `frontend/src/components/file-drop/ha-drop-upload-overlay.ts`, mounted once
in `frontend/src/layouts/home-assistant-main.ts`. Tests: `frontend/test/common/file-drop/`.
Strings: `ui.drop_upload` in `en.json` and `yue-own.json`.

## What it does

An administrator can drag pictures, video or audio from their computer onto the window, on any page,
and drop them anywhere.

- While the files are over the window an overlay says what will happen: "Drop to add to your media",
  how many files, and where they go. When every file is a picture the overlay also offers
  a second, smaller zone, "Images" (the pictures used for people, areas and dashboards). The media
  library is the larger default; dropping on the "Images" zone sends the pictures to the image store.
  If the person is looking at the image store in the Media browser, the image zone is the default.
- Files go to the media library root. If the person is on the Media browser inside a local folder, they
  go into that folder.
- Each drop is one entry in the activity tray ("Adding 3 files to Media") with a progress count and
  Cancel. A drop made while another is uploading waits its turn.
- When it finishes a toast says what was added, with "Show in Media" (opens that folder in the Media
  browser) or "Show images" (opens the image store in the Media browser). A Media browser or Manage
  dialog that is open refreshes itself.
- Files that were not sent are named with the reason in a second, warning toast. Failures name the file
  and the reason the upload gave.

## One router, and who wins

`drop-routing.ts` is the whole rule, a pure function:

1. A page or component that already handled the event owns the drop. The router sees the event after the
   page: it did `preventDefault` (router does nothing) or it stopped the event so the window never sees
   it (the router takes its overlay down at once). This covers `ha-file-upload` (backup upload, restore,
   file selector, picture upload, firmware), the converter, Base64 and drawing tools, the identity
   logo area and the personal wording card.
2. A drop with no picture, video or audio file keeps the older path unchanged: a single dashboard file
   is imported as a dashboard, anything else goes to the personal wording import. The older "Drop to
   import" indicator is shown for those drags.
3. A drop with at least one picture, video or audio file is a media drop. Someone who is not an
   administrator gets one calm toast, "Only an administrator can add media", and nothing is sent (the
   server also requires administrator rights).
4. In a media drop each file is checked against the server's limits: type (the type the browser reports
   decides, never the name), 2 GB for the media library, 50 MB for the image store, which takes
   JPEG, PNG and GIF. A file the chosen place cannot take as it is is converted first when a
   conversion exists (next section) and skipped with a reason when it does not. Two dropped
   files with the same name: the second is skipped. A name that already exists in the folder is never
   overwritten: it is skipped and the toast says nothing was replaced. The server remains the authority.

Drags that carry no files (text, links, tab reordering) are never touched. The overlay never takes the
pointer or focus (it is a non-interactive top layer element, so it also shows above an open dialog),
Escape takes it away, and the existing "Add media" buttons are unchanged. Reduced motion removes its
fade. The overlay is a polite live region.

## Large files

The media library takes files up to 2 GB and the image store pictures up to 50 MB. Both limits are
set on the server (`MAX_UPLOAD_SIZE` in `media_source/local_source.py`, `MAX_SIZE` in
`image_upload/__init__.py`) and in the interface (`MEDIA_MAX_BYTES` and `IMAGE_MAX_BYTES` in
`drop-routing.ts`) and must be changed together.

- The server never holds an upload in memory: aiohttp writes file fields of a multipart request to
  a temporary file, and the copy into the media folder is chunked and runs in an executor. The
  image store reads the stored file in chunks too. Pillow's decompression-bomb guard stays on: a
  picture with an absurd pixel count is refused with a clear error.
- Uploads use `XMLHttpRequest` so the tray shows how much of the current file has been sent
  ("Uploading name, 42%"). Cancel aborts the request.
- A reverse proxy in front of the instance may have its own body-size limit (for example nginx
  `client_max_body_size`, which defaults to 1 MB, or a Cloudflare plan limit). Raise it to at
  least 2 GB for large uploads, or the proxy answers 413 before the file reaches the server.
- Sizes are shown in GB from 1 GB up (whole when it is a whole number), otherwise in MB.

## Automatic conversion

A file that the chosen place cannot take is converted in this browser with the product's own file
converter (the same adapters as Tools, File converter; nothing is uploaded for it) and then stored.
The file on the person's disk is never changed. The rules are in `drop-convert.ts`:

| Case | What happens |
| --- | --- |
| Image store: JPEG, PNG, GIF within 50 MB | Stored as they are |
| Image store: WebP, BMP, AVIF | Converted to PNG; if that exceeds 50 MB, JPEG at falling quality, then smaller |
| Image store: JPEG above 50 MB | Re-encoded at quality 85, 70, 55, then made smaller until it fits |
| Image store: PNG above 50 MB | Made smaller as a PNG (transparency kept) until it fits |
| Image store: SVG, TIFF, HEIC, other pictures | Skipped: no adapter here can read them |
| Media library: anything within 2 GB | Stored as it is |
| Media library: a picture above the limit | Re-encoded as above (pictures up to 256 MB are read for this) |
| Media library: audio or video above 2 GB | Skipped: the converter has no adapter for it |
| Animated GIF above the limit | Never flattened: skipped |

The stored name keeps the original base name with the new extension (`.png` or `.jpg`). A name
that already exists is skipped, never overwritten, also after a rename. A picture above the
converter's pixel budget (40 million pixels) is skipped with the reason. The tray shows
"Converting name" then "Uploading name". The result toast and the skipped list say which files were
converted, from what to what, and what was lost (resized from A×B to C×D, quality reduced to N%,
transparency replaced with white); a failed conversion skips that file only. The overlay says that
other picture types are converted automatically. The same conversion runs when a picture is chosen
in the picture upload control.

## Touch screens, the picker and paste

A phone has no drag and drop, so the same path has other ways in:

- `pickFilesToAdd({ zone? })` in `add-media.ts` opens the system file picker (pictures, video and
  audio; on a phone it also offers the camera and the photo library) and sends the chosen files
  through the same routing, conversion and queue. When every chosen file is a picture and no zone is
  given, a small sheet asks "Media" or "Images" (44 px choices, at most 320 px wide, Escape closes it
  without adding anything). Call it only from a tap or key press.
- Pasting picture, video or audio files adds them the same way, on every page. A paste inside an
  input, text area, select, rich text area or code editor, or one a page already handled, is left
  alone. A pasted `image.png` is named `pasted-YYYYMMDD-HHMMSS.png`.
- Entry points: "Add media" in the activity tray header (administrators, while the tray shows),
  "Add media" in the quick bar (command list), and an upload button in the Media browser toolbar.

## Limits

- A file that is in flight when Cancel is pressed is aborted; it may or may not have reached the server.
  Files already added stay.
- The browser reports file types only by extension, so a file with an unusual extension may be skipped
  as "not a picture, video or audio file" even if its content is.
- With several media directories configured, the library root is the first one the server lists.
- The newest file is not highlighted in the folder: the Media browser has no such option.
- Phones rarely allow dragging files from another app, so there is nothing new to use on a phone; the
  upload buttons remain.

## What was verified

Unit tests cover the routing rule (wording and dashboard files, pictures, video, audio, mixed, unknown
types, oversize, no files, a page that took the drop, a non-administrator, the image zone), the folder
and address reading, the queue (order, name clash, one failed file, Cancel) and the controller on the
window. A running build was driven with headless Edge and synthetic drag events: drops on Overview, a
Settings page and the entities table; a mixed drop; the image zone and "Show images"; a drop inside a
subfolder and a name clash; the media Manage dialog; a wording file; the converter page (took the drop,
nothing uploaded); and a second account that is not an administrator. Real operating-system file drags
and touch devices were not tried unless the section below says so.
