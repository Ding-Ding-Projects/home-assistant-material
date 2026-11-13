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
