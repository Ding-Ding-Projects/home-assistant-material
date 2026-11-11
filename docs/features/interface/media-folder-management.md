# Media folder management

The Manage dialog on the Media page creates, opens, renames, moves and deletes
folders as well as files in the local media directories.

## Behaviour

- **Add media** uploads into the folder that is open in the dialog. **New
  folder** creates a folder there.
- A breadcrumb shows where you are. Folders open in place; the crumbs go back up
  as far as the folder the dialog was opened on.
- Each row has a checkbox, the name (a folder name opens the folder, a file name
  toggles the checkbox) and an overflow menu with **Rename**, **Move** and
  **Delete**. Rename works for files and folders. Renaming a file keeps it a
  media file: the new name must still end in a media extension.
- **Move** shows a folder picker for the same media directory. Moving into the
  folder an item is already in, or into the item itself, is not offered.
- Multi-select delete and move work on files and folders together.
- Deleting a folder asks for confirmation. A folder that holds something says how
  many files and subfolders will go with it, then asks a second time (the folder
  name must be typed for a single folder). An empty folder is deleted after one
  confirmation.
- Every change refreshes the list and the Media page behind the dialog.
- The image upload source keeps the old behaviour: files only, upload and delete.
- On a phone the actions sit in a wrapping row under the title, every target is
  at least 44 px high and long names wrap.

## Server commands

All commands are administrator only and work only inside a configured media
directory. Each answers with `media_content_id` (the new item) unless noted.

| Command | Data | Result |
| --- | --- | --- |
| `media_source/local_source/create_folder` | `parent_media_content_id`, `name` | the new folder |
| `media_source/local_source/rename` | `media_content_id`, `new_name` | the renamed item |
| `media_source/local_source/move` | `media_content_id`, `destination_media_content_id` | the moved item |
| `media_source/local_source/folder_info` | `media_content_id` | `files`, `folders` held inside |
| `media_source/local_source/remove_folder` | `media_content_id`, optional `recursive` | `files`, `folders` removed (the folder itself counts as one folder) |

A non-empty folder is only removed with `recursive: true`. Removing a single file
still uses `media_source/local_source/remove`.

### Error codes

`not_found`, `exists`, `invalid_name`, `not_empty`, `not_allowed`; a bad media
content ID answers `invalid_format`.

### Safety

- Names are checked with the upload rule plus: no path separators, no `.` or
  `..`, no leading dot, no surrounding spaces, no control characters, at most 255
  characters.
- Every parent and destination is resolved to its real path and must stay inside
  the media directory. A link that leads outside is refused, and a link itself is
  never renamed, moved or removed through these commands.
- The media directory itself cannot be renamed, moved or removed.
- A name that already exists is never overwritten.
- All file work runs in the executor.

## Verification state

Server tests are in `core/tests/components/media_source/test_local_source.py`;
they were byte-compiled only and have not been run. The pure helper tests are in
`frontend/test/data/media_source_folders.test.ts`. The dialog has not been seen in
a running build.
