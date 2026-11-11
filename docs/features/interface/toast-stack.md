# Stacked toasts

Status: built, not yet seen in a running build. The queue rules and timers are covered by unit tests; no browser was used.

## What it does

Toasts are short messages shown through `showToast` (`src/util/toast.ts`) and drawn by `notification-manager`. Toasts now stack with a limit:

- Up to three toasts are visible at once. The newest sits nearest the bottom edge; each older one is drawn slightly smaller (4 % per step).
- Further toasts wait in a queue and appear, oldest first, as visible ones close. A small "N more notifications waiting" chip shows above the stack while any wait.
- Each toast has its own timer. The timer pauses while the pointer is over the toast or keyboard focus is inside it, and continues with the time that was left.
- A toast can carry one primary action button, the existing secondary action, and a close button. Pressing an action closes that toast and runs its callback.
- An identical message without an `id` arriving within two seconds of the previous one is dropped. Toasts with an `id` update in place instead, as before.
- Errors and warnings without an explicit `duration`, and progress toasts, stay until dismissed or replaced.

The public call is unchanged: `showToast(element, { message, action, duration, id, severity, progress, dismissable, bottomOffset })`.

## Where the rules live

`src/common/toast/toast-stack.ts` holds the queue: maximum visible, overflow queue, de-duplication, in-place updates and duration normalisation. It has no DOM or timers. `notification-manager.ts` renders what it reports, and `ha-toast.ts` owns the per-toast timer and pause logic.

## Accessibility and motion

- One shared polite live region in the manager announces only the toast that has just appeared (or whose announce text changed). Each stacked toast sets `silent`, so older toasts are never read out again.
- Under `prefers-reduced-motion: reduce` there is no sliding: toasts only fade, for an instant.
- Action and close buttons are at least 44 px by 44 px. The toast shows an outline while focus is inside it.
- One column from 320 px: below 450 px wide the toast spans the safe width.

## Phone bottom bar

The stack's bottom edge adds the CSS custom property `--ha-bottom-bar-height` on screens up to 870 px wide. A layout that shows a bottom tab bar must publish that height for the stack to sit above it; until a layout does, callers can keep using `bottomOffset`. No layout publishes it yet.

## Failure modes

- A toast that never closes (errors) is only removed by its close button, its action, or a call with `duration: 0` and the same `id`.
- If more than three errors arrive, the extra ones wait until a visible one is dismissed.

## Verification

- `test/common/toast/toast-stack.test.ts`: queueing, promotion, de-duplication, in-place updates, durations.
- `test/components/ha-toast.test.ts`: close reasons, pause on hover and on focus, resume with remaining time, silent mode.
- `test/managers/notification-manager-stack.test.ts`: three visible, queue chip, promotion, depth, action callback, errors, live region.
