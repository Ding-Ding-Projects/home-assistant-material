# Canvas 41: TTC transit integration

Two boards, drawn as real screens of the app in its dark theme at phone width (390 px), for an integration that reads the Toronto Transit Commission's public information.

| Board | What it shows |
| --- | --- |
| `Main.dc.html` | Interactive. Setting it up in three steps (what to watch, routes and stations, stops for next departures), its own page (your routes with their status, next departures, elevators and escalators out), the dashboard tile, what automations get, and what the page says when the information is old or missing |
| `Dashboard.dc.html` | A ready-made transit dashboard made of separate cards (a major alert banner, subway line status, a departures board, "leave by", alerts on your routes, step-free status of your stations, vehicles near your stop, a line's last 24 hours), the automation triggers the integration offers with one filled in, and the entities it creates |

## Rules the boards carry

- Public information only, read and never written. Nothing about the home is sent: only the stop and route numbers that were chosen.
- Every figure shows when it was read. Old figures are dimmed and say so; they are never shown as live. An entity says whether the information is fresh.
- A prediction is called a prediction and an estimate an estimate. Times are 24-hour.
- The agency's own words for an alert are shown as written; the short status beside them is the integration's.
- It asks politely: once a minute at most, less when nothing is being watched, and it backs off when refused.
- Triggers fire once per thing that happened (one departure, one alert, one outage), not on every refresh.
- Rows are 56 to 60 px, targets 44 px, the largest type 28 px.

## Status

Design reference. Nothing here is shipped behaviour until it is built and seen in a real build.
