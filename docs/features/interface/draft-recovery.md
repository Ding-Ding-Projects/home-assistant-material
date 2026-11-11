# Draft recovery for editors (design, not built)

Status: designed only. Nothing in this note is implemented.

## What exists today

The automation editor uses `PreventUnsavedMixin` and asks for confirmation when
the person navigates away inside the app with unsaved changes. Nothing protects
a crash, a reload or a closed tab: the changes are lost.

## Why it was not built in this pass

The editors keep their working copy in several places at once (the form state,
the YAML editor, sub-editors per trigger, condition and action, and the
dirty-tracking in the mixin). A draft saved from one of them can disagree with
the others, and restoring it silently into the wrong layer would overwrite
what the person sees. A safe version needs one agreed "current config" getter
and setter per editor, which is a change inside each editor and not a shared
addition.

## Proposed design

- A small helper `draft-store` keeps one entry per editor kind and item id in
  `localStorage`: the configuration object, the time it was saved, and the
  version of the saved item it was based on.
- A draft is written a few seconds after the last change while the editor is
  dirty, and removed on a successful save, on Discard, and when the editor is
  closed with a confirmed "leave without saving".
- Size cap: a draft larger than 200 KB is not stored.
- Expiry: a draft older than 24 hours is deleted when it is looked up.
- Secrets: a draft is never stored when `isSecretName` (see
  `common/secret-fields.ts`) matches any key in the configuration, or when
  `maskYamlSecrets` would change the YAML text. In that case nothing is stored
  and the editor shows no restore offer.
- On open, if a draft exists and differs from the saved item, a banner says
  "Restore unsaved changes from <time>?" with Restore and Discard. Nothing is
  applied until the person chooses Restore. If the saved item changed after the
  draft was based on it, the banner says so.
- Keyboard reachable, 44 px targets, localized, fits 320 px.

## What each editor must provide first

A getter for the whole current configuration, a setter that replaces it
through the same path as loading a saved item, and a dirty flag it already
has. Only then can the helper be adopted without touching editor internals.
