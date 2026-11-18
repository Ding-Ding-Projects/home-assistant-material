# Canvas 40: search from the top bar

One board, drawn as real screens of the app in its dark theme at phone width (390 px).

| Board | What it shows |
| --- | --- |
| `Main.dc.html` | Interactive. Personal settings scrolled halfway down, in three moments: the search button resting in the top bar, the search open in the bar with a match marked on the page, and the same button on a list page filtering in place. A rules card sits beside them |

## Why

The page search sits at the top of the content, so on a long page it scrolls away and the reader has to scroll back up to use it. The top bar never scrolls.

## Rules the board carries

- The search button is in the top bar of every page that has a search. It is always one tap away.
- Opening it never moves the page to the top. Closing it leaves the page where it is and keeps the words typed.
- Settings pages jump to the nearest match and mark it, with previous and next, across tabs too. List pages filter in place.
- It is the same search as before, with its pattern builder. Only its place changes; the search field at the top of the content goes away.
- The button and its controls are 44 px targets. The field in the bar is 40 px tall.
- Keyboard: the slash key opens it, Escape closes it, Enter goes to the next match. On a wide window the field opens in the bar at a fixed 360 px.

## Status

Design reference. Nothing here is shipped behaviour until it is built and seen in a real build.
