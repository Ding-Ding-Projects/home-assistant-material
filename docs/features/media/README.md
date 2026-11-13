# Media

| File | Feature | State (see `../../feature-status.md`) |
| --- | --- | --- |
| [`drop-anywhere.md`](drop-anywhere.md) | Drop pictures, video and audio anywhere in the window to add them to the media library or the image store, with a notification that opens them | See the file |
| [`image-folders.md`](image-folders.md) | Folders for the image store, and Download, Edit name, Convert and a surprise zip in the Manage dialog | See the file |

## Picker navigation and search scope

The media selection dialog now keeps a horizontally scrollable breadcrumb trail.
Previously visited locations retain their displayed titles during that dialog session;
a picker opened directly at a nested location uses a localized level label until that
location is visited. Selecting an ancestor jumps there without playing or selecting media.
The configured minimum navigation level is preserved, so an image-only picker cannot
escape its source root. Closing the dialog clears the trail's title cache.

Search-capable sources identify the provider of their search. Sources without search
explicitly label their filter as limited to loaded items in the current folder. This does
not imply that a provider supports whole-library search or that unloaded items are searched.

Late browse and refresh responses are ignored after a newer navigation or dialog removal.
A failed parent lookup does not replace a successfully loaded folder. Fast back navigation
falls back to fetching when the parent cache has not loaded yet.

Verification: focused navigation tests protect multi-level jumps, minimum-level restrictions,
repeated/out-of-range navigation, and media ID/type title-key collisions. Navigation plus
existing media-management and image-upload suites passed (46 tests); focused ESLint and
Prettier checks passed. Browser interaction and screen-reader checks have not been run.

## Device-local media favorites and recent selections

Media picker dialogs now offer a star on eligible media items and a Favorites and recent
selections sheet. Favorites and recents are scoped to the signed-in account and instance
in browser storage. They do not sync across devices. Up to 50 favorites and 20 recent
selections are retained; repeated selections move to the front. Clear recent selections
removes the local history without changing favorites or media files.

A shortcut opens the item's containing folder, not playback. The provider is queried again,
so cached playback capabilities are never trusted. Shortcuts are limited to the same player
and the picker's configured source root. Deleted or unavailable content uses the existing
browse error flow. Clicking a star or closing the shortcut sheet does not select an item or
close the parent picker.

Only stable IDs/types, titles, player IDs, and navigation paths are retained. Artwork URLs,
provider payloads, and capability flags are not stored. Network URLs (including RTSP/FTP),
credential-bearing addresses, query/fragment-bearing IDs, manual-entry items, and generated
speech are excluded, including percent-encoded variants. Reads and writes share a 524,288-character
serialized limit; oversized writes leave the previous saved value intact. Unknown storage versions and
malformed records are ignored; blocked/full browser storage reports a warning without
preventing media selection.

Verification: 57 focused media/navigation tests passed, including shortcut storage
validation, bounded/deduplicated history, ID/type and player separation, restricted-root
navigation, account/instance isolation, and exclusion of signed URLs and speech. Focused
ESLint and Prettier checks passed; dialog Lit analysis reported no problems. Full typecheck
is blocked by missing generated gallery/icon/translation metadata. Browser and screen-reader
interaction checks remain unverified, including narrow-screen star placement and sheet
focus restoration.
