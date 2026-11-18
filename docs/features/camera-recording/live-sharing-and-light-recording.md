# Shared live view, provider rate limits and light recording

Commit `327dbe009`. Design: canvas 38 camera boards (the sheet when its provider says no, and the
recording amount per camera).

## The problem

A cloud doorbell refused live video with "too many requests", and the message covered the
camera sheet's header, with the Live mark on top of the first word.

The recorder was not the cause: it never sends a provider command for a camera with no stream
address. The browser was. The player started again every time the tab was looked at, even after a
refusal; every card and sheet showing a camera opened its own provider session; and dashboard
cards started live video for cameras that were not on screen.

## One live view per camera

- There is one shared live session per camera in a tab.
- After a refusal for too many requests, nothing asks again by itself for 60 seconds, then 2
  minutes, then 5 minutes, remembered per camera. "Try now" is there for a person.
- Video starts only for a camera that is on screen. A provider-only camera on a dashboard shows a
  still with "Start live video" until it is tapped.

## The camera sheet

The picture area keeps its 16:9 place and every state is drawn inside it: starting, limited with a
countdown, offline, other error. The Live mark is in its own row and shows only when video really
plays. The provider's own words are one tap away.

## Light recording

"Light" keeps video only around something being seen. It keeps a small rolling buffer and moves
the claimed pieces, with no decoding and no extra processor.

- Defaults: 10 seconds before and 30 seconds after, both adjustable.
- Back-to-back events merge, and a clip is capped at ten minutes.
- "All day" stays the default and every existing camera stays on it.
- A camera with nothing that can tell an event refuses Light and says why.
- Per camera the choice is All day, Light or Off, with a sentence for each and a small day strip
  showing what Light kept (board).

## Cameras that only offer live video through their provider

These now keep event clips and pictures instead, on the same timeline and under the same limits.
Round-the-clock recording of such a camera is not built, on purpose: the only route in the image
would hand the provider's sign-in secrets to another program, and the provider's small request
allowance is the very thing being protected.

## Verification

- Server part: 46 tests pass (24 before). Browser part: 27 new tests.
- Not verified: nothing was seen in a browser, and no real cloud camera or running video program
  was used. The wording arrived with `a5bbfa5da`.
- Not proven against a real provider camera: the countdown after a real refusal, the shared
  session across a real dashboard, and light recording clips from a real event.
