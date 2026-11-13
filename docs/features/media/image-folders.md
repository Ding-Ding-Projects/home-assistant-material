# Folders for the image store, and download, edit name and convert in the Manage dialog

Code, server: `core/homeassistant/components/image_upload/` (`folders.py` the folder rules and storage,
`folder_commands.py` the WebSocket commands, `__init__.py` the upload and the stored `folder` field,
`media_source.py` the browsing). Tests: `core/tests/components/image_upload/test_folders.py`.

Code, interface: `frontend/src/components/media-player/dialog-media-manage.ts` (the Manage dialog),
`dialog-media-convert.ts` (the convert dialog), `frontend/src/data/image_upload.ts` (the commands),
`frontend/src/common/media-manage/` (`download.ts`, `item-file.ts`, `names.ts`, `convert-item.ts`,
`surprise-provider.ts`), `frontend/src/common/file-drop/media-target.ts` (the folder a drop goes into).
Tests: `frontend/test/common/media-manage/`, `frontend/test/data/image_upload.test.ts`,
`frontend/test/common/file-drop/`. Strings: `ui.components.media-browser.file_management` and
`ui.drop_upload` in `en.json` and `yue-own.json`.

## Folders in the image store

The image store (the "Image upload" source in the Media browser) used to be one flat list. It now has
folders, offered the same way as in the media library: New folder, rename, move, remove, with counts.

- Images stay where they are on disk (`<config>/image/<id>/`). Their ids and their serve URLs
  (`/api/image/serve/<id>/...`) do not change, so dashboards, people and areas that use an image keep
  working after it is moved or its folder is renamed. A folder is only a stored label.
- Stored shape: each image has an optional `folder` (a path such as `holiday/2026`; empty for the top
  level). Images stored before this change have no `folder` and load in the top level, so old data stays
  valid with no migration step. The folders, empty ones included, are kept in a second store,
  `image.folders` (version 1, `{"folders": [...]}`). A folder named by an image but missing from that
  list is added when the store loads.
- Folder rules: at most 6 levels, names up to 100 characters, a path up to 255 characters; no `..` or
  `.` names, no slashes or backslashes in a name, no leading or trailing space, no control characters;
  letter case is kept, but two names that differ only in case clash. A parent must exist.

### WebSocket commands (administrator only)

| Command | What it does |
| --- | --- |
| `image/folder/list` | Every folder with `path`, `name`, `parent` and the number of `images` and `folders` directly inside it, plus the same counts for the top level (`root`). |
| `image/folder/create` | `parent` (default top level) and `name`. Answers `{path}`. |
| `image/folder/rename` | `path` and `new_name`. Its images and subfolders move with it. Answers `{path}`. |
| `image/folder/remove` | `path` and `move_to_parent` (default false). A folder that holds anything is refused with `not_empty` unless `move_to_parent` is set, which moves its images and subfolders up one level. Never deletes an image. |
| `image/move` | `image_ids` (1 to 500) and `folder` (default top level). Nothing moves when an image or the folder is unknown. |
| `image/update` | The existing command; it now also takes `folder` (checked against the folders) beside `name`. |

Stable error codes, as in the media library: `exists`, `invalid_name`, `not_found`, `not_empty`,
`not_allowed` (the top level cannot be renamed or removed) and `too_deep`.

The upload endpoint `POST /api/image/upload` takes an optional `folder` form field. An unknown folder is
refused with a 400.

### Browsing

`media-source://image_upload` lists the folders first and then the images of the top level. A folder is
`media-source://image_upload/folder/<path>` and lists its subfolders and images. The old
`media-source://image_upload/<id>` still resolves to the same image and serve URL.

## What the interface offers

In the Manage dialog, when it is showing the image store: a breadcrumb, New folder, opening a folder,
Rename and Remove for a folder, selecting images and Move (with the same folder picker as the media
library), Delete, and the counts in the confirmation when a folder is removed (its contents move up one
level; no image is deleted). The Media browser shows the folders when browsing Image upload.

Uploads go into the image folder the person is looking at: the Manage dialog's Add media, the Media
toolbar's Add media, the drop overlay and the add-media sheet. The overlay and the notification name the
folder ("Images, folder 2026"), and "Show images" opens that folder.

Not done: the picture picker of `ha-picture-upload` (choosing an existing image for a person, area or
dashboard) stays a flat list.

## Download, edit name and convert (both sources)

Every file in the Manage dialog, for the media library and the image store, has an item menu with:

- **Download**: saves the original file under its own name (for an image the original, not a thumbnail).
  The file is read through the signed media URL or the image serve URL and saved from the browser, so no
  new server path was needed. Selecting several files shows **Download as zip**: one zip built in the
  browser with `jszip` (stored, not compressed), refused with a message when the files add up to more than
  200 MB. Folders in a selection are left out.
  On a touch device, the dialog prepares the file and then shows **Save file**. This gives the
  browser a fresh tap to start the download. When the browser supports sharing files, **Share or
  save** opens the device's share sheet with the same file.
- **Edit name**: renames a media file with the existing `media_source/local_source/rename`, or an image
  with the existing `image/update` (its id and serve URL do not change). A name that is taken in the same
  folder is refused, and a changed extension asks for confirmation first.
- **Convert**: opens a convert dialog that uses the product's own local converter (the engines of the
  File converter tool, `frontend/src/common/converter/`) to turn the file into a format the converter
  offers for it here: pictures to PNG, JPEG or WebP, sound to WAV, WebM or MP4, a picture taken from a video.
  The result is stored as a new item next to the original, named with the new extension; the original is
  untouched and a name that is taken is refused. It goes through the same upload path and limits (50 MB for
  the image store, 2 GB for the media library). The image store only keeps PNG, JPEG and GIF, so only PNG and
  JPEG are offered there, and the dialog says so. What a conversion loses is shown from the converter's own
  notes (for example that transparent areas were filled with white).

The dialog reports whether it is converting locally or uploading the copy. Cancel stops
the active step. If the upload had already begun, check the folder before retrying because
the server may have received the copy. The original remains in place.

All of these are for administrators, like the Manage dialog itself. The Media browser itself has no item
menu, so these live in the Manage dialog.

### The surprise zip

A single download has a 10 percent chance (one random draw per download) of arriving as a zip named after
the file (`photo.png.zip`). It holds the file itself, byte for byte, one dim sum picture and `dish.txt`
naming the dish in English and Cantonese, and a notification says plainly that the download came as a zip
with a dim sum picture inside. It never happens for a download of several files, never while School mode is
on, and never when no dish picture is available (then the download is the plain file).

The dish and its picture come from the dim sum feature (`fetchRandomDish` in `frontend/src/data/dim_sum.ts`,
loaded by `surprise-provider.ts`); a missing feature or a failing call means no dish. The random source is
injectable (`MediaManageDialogParams.random`) so a test can fix the draw; it is not a setting.

## What was verified

Server: 26 tests in `test_folders.py` (create, nested folders, every invalid name, clashes in any letter case,
depth, upload into a folder, move, rename carrying images and subfolders, remove empty and non-empty with
and without moving contents up, administrator only, loading the old stored shape, persistence of empty
folders, browsing, resolving, serve URLs and files unchanged); the whole `image_upload` and `media_source`
suites pass (177 tests).

Interface: unit tests for the folder addresses and names, the upload folder, the zip contents (byte for
byte), the draw (one per download, a fixed random source), School mode, a bulk download, a missing dish or
picture, the size limit, the names and the convert targets.

Browser (headless Edge, 1440x900 and 390x800 with touch, 320x700 for the dialogs; a product container with the
changed server files mounted over the image's; an image uploaded before the change was kept in the store):
new folder, upload into it, subfolder, moving one and then two images with the picker, rename, removing an
empty folder, removing a non-empty folder (warned, contents moved up, nothing deleted), the Media browser
listing the folders and the images in them, the toolbar Add media into an open folder (zone sheet and
notification name the folder, and the open list refreshes), an image stored before the change still listed
and served, and an image used as a person picture still displayed after being moved. In both sources:
Download (byte for byte), a forced surprise zip opened and its contents checked (file byte for byte, picture,
`dish.txt`) with the notification, a bulk zip with no surprise, Edit name (taken name refused, extension change
asks), Convert (PNG to JPEG in the image store, PNG to WebP in the media library; a second conversion to a name
that exists is refused). The surprise was forced through the injectable random source in a browser-check
build, with a stand-in for the dim sum feature's picture; the shipped build uses the real draw and the dim sum
feature.

Not seen in a browser: the drop overlay naming the image folder (a synthetic drag did not open the overlay;
the sheet and the notification, which use the same name, were seen), and a download refused for being over
200 MB (covered by a unit test only).
