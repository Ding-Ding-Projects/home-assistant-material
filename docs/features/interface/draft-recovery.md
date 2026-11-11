# Draft recovery for editors

Status: built for the template editor only. Every other editor is not covered.

## What exists today

The template tool (Developer tools, Template) keeps its working text as a draft
on this device. If a newer draft is found when the tool opens, a banner offers
three choices. Nothing is ever applied on its own.

- **Restore** puts the draft into the editor and renders it.
- **Compare** shows the text in the editor now and the draft side by side as
  plain read-only text (stacked on a narrow screen).
- **Discard** deletes the draft.

The banner says when the saved template changed after the draft was started, and
that Restore then replaces what is in the editor now.

## How it works

- `frontend/src/common/drafts/draft-store.ts` keeps one `localStorage` entry per
  editor kind and item id, named `ha-draft:<kind>:<item id>`. An entry holds the
  text, the time it was saved and the base version it started from. The template
  tool uses the kind `template` and the single item id `default`, and its base
  version is a fingerprint of the template the editor opened with.
- Every storage access is guarded. Storage that is missing, blocked or full makes
  a save report "unavailable"; it never breaks the editor.
- Size cap: a draft larger than 200 KB (UTF-8 bytes) is not stored, and an
  earlier smaller draft is kept.
- Age cap: a draft older than 30 days is deleted when it is looked up or listed.
- Secrets: a kind must be declared with `registerDraftKind`. A kind that declares
  a secret field never stores anything. In any kind, a text that
  `maskYamlSecrets` would change is not stored. The template editor declares no
  secret field.
- `listDrafts` returns every readable draft, newest first, and `discardDraft`
  deletes one.
- `frontend/src/components/drafts/ha-draft-recovery.ts` is the banner. It takes
  its text from the owner and only reports Restore and Discard as events.

When the draft is saved in the template tool:

- about 300 ms after the last change, and once more when the tool is left;
- not while an earlier draft is waiting for a decision, so new typing cannot
  overwrite what is on offer;
- not when the text is empty, is the demo template, or equals the text the editor
  opened with (nothing to recover);
- cleared on Restore, Discard, an explicit Clear and Reset to demo.

## Limits to know

- The template tool already stores its working text under its own key a moment
  after each change, so a reload normally brings that text back without a draft.
  The draft covers the short gap before that write, a failed or cleared write,
  and a copy changed in another tab (the banner flags that case).
- Drafts stay in this browser. They are not synced and not sent anywhere.
- Nothing here was seen in a browser; the storage rules are covered by tests.

## Editors not covered

The automation, script and dashboard editors are not covered. They keep their
working copy in several places at once (form state, the YAML editor, sub-editors
and the dirty tracking of `PreventUnsavedMixin`). Each needs one agreed getter
for the whole current configuration and a setter that replaces it through the
same path as loading a saved item before it can use the store and banner. Other
editors that are not covered: scene, helper and blueprint editors, and the
dialogs that edit one item.
