# Problem detector

State: Built and seen in a running build (the dashboard card, Repairs and Teleport, wide and phone). The automation step detector is built but was not seen: the test copy could not load automations.

When something on screen has a problem, the problem detector outlines that
exact element where it is and puts a **Problem found** badge on it. Selecting
the badge opens the details:

- what is wrong and where it is,
- why it matters,
- **Fix**, when the app can fix it itself (the button says what it does, such
  as "Turn this step off"),
- **How to fix it by hand**, numbered steps for when it cannot,
- **Ignore**, and a link to every problem on the Repairs page.

## What it detects so far

| Where | Problem | Fix |
| --- | --- | --- |
| Dashboard cards | The card names an entity Home Assistant does not know | Steps by hand: check the device, pick another entity, or remove the card |
| Automation steps | The step targets an entity Home Assistant does not know | Turn this step off, or the steps by hand |

A disabled step is not reported. A step inside a Choose or a sequence reports
for itself, never through the step that holds it, so only the exact step is
outlined.

## Repairs and Teleport

Problems found on other pages are kept in this browser, so Repairs lists
them after a reload too; one restored from there offers Teleport, and Fix
again once its page has run.

**Settings › System › Repairs** lists every problem found in this session
above Home Assistant's own repairs, with **Fix** where it can fix itself,
**Fix all that can be fixed**, **Ignore**, and **Teleport**. Teleport opens the
page that shows the element, jumps it into view, dims everything else
around a spotlight, and opens the details beside it. If the element is not on
the page any more, the details say so.

## The teleport transition

Every jump to an exact element plays the same transition: a ring bursts where
the person pressed and a beam streaks to the destination, then the element
materialises out of a bright blur while a scan line sweeps over it and a glow
fades. It plays for Teleport, for search results that land on a setting
(Personal settings, backup settings, the AI page) and for the dashboard
editor's card jumps. Reduce motion skips it. Code:
`frontend/src/common/dom/teleport-effect.ts`.

## Settings

**Profile › Browser** has the switches: the detector itself, the pulsing
outline (Reduce motion, from the system or the accessibility tools, always
stops it), and **Show them again** for ignored problems. Ignored problems and
the switches are kept in this browser only.

## Wording

The badge text is ordinary interface text, so a personal wording file can
rename it: an entry `"Problem found": "your words"` changes the badge, the
details title and the Repairs heading wherever that text appears.

## Code

- `frontend/src/common/problems/`: the store, the entity check, settings and Teleport.
- `frontend/src/components/problems/ha-problem-overlay.ts`: outlines, badges, details and spotlight, in one fixed layer above the page so it reaches into every shadow root.
- `frontend/src/components/problems/ha-problem-list.ts`: the list on the Repairs page.
- Detectors: `hui-card.ts` and `ha-automation-action-row.ts`.
- Tests: `frontend/test/common/problems/problems.test.ts`.
