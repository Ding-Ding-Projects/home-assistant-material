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
  many files and subfolders will go with it, then asks a second time: the folder
  name must be typed for a single folder, and the number of selected items for
  several items that include a non-empty folder. An empty folder is deleted after
  one confirmation. The buttons stay disabled while a confirmation is open.
- The delete is held to what was confirmed: the dialog sends the counts it showed
  and `recursive` only for a folder that held something. If the folder changed in
  the meantime, nothing is deleted and the person is told to delete it again.
- Move here stays disabled while the chosen folder is loading. When a move of
  several items stops part way, the message says how many were moved.
- Add media uploads to the folder that was open when the button was pressed.
- Manage is shown to administrators only.
- An error code the dialog does not know shows a fixed message, never the server
  text.
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
| `media_source/local_source/remove_folder` | `media_content_id`, optional `recursive`, optional `expected_files` and `expected_folders` | `files`, `folders` removed inside the folder (counted as `folder_info` counts, the folder itself not included) |

A non-empty folder is only removed with `recursive: true`. When expected counts
are given and the live counts differ, nothing is removed and the answer is
`changed`. Removing a single file still uses `media_source/local_source/remove`.

### Error codes

`not_found`, `exists`, `invalid_name`, `not_empty`, `not_allowed`, `changed`; a
bad media content ID answers `invalid_format`. An operating system error answers
`unknown_error` with a fixed message; the detail is only written to the log.

### Safety

- Names are checked with the upload rule plus: no path separators, no `.` or
  `..`, no leading dot, no surrounding spaces, no control characters, at most 255
  bytes.
- Every parent and destination is resolved to its real path and must stay inside
  the media directory. A link that leads outside is refused, and a link itself is
  never renamed, moved or removed through these commands. File upload and single
  file delete follow the same rule.
- The media directory itself cannot be renamed, moved or removed, and a location
  with a `.` component (such as `.` or `a/./b`) is refused for those commands.
- A name that already exists is never overwritten. A rename onto the same file is
  allowed only as a case-only change.
- A folder that cannot be read completely is not counted or removed.
- All file work runs in the executor.

## Verification state

Server tests are in `core/tests/components/media_source/test_local_source.py`;
they pass in a Linux container test harness. The pure helper tests are in
`frontend/test/data/media_source_folders.test.ts`. The dialog has not been seen in
a running build.
