# Transit

Public transit information for the home. The server side lives in
`core/homeassistant/components/ttc/`; the page is Settings, TTC transit, and the cards are in
`frontend/src/panels/lovelace/cards/hui-ttc-cards.ts`. The design is
`design/canvases/41-ttc-transit/`.

| File | Feature | State (current state: `../../../ROADMAP.md`) |
| --- | --- | --- |
| [`ttc.md`](ttc.md) | The TTC transit integration: service alerts, next departures, elevators and escalators, vehicles near a stop, a route's last 24 hours, the transit page, eight dashboard cards, a Transit dashboard, automation triggers and conditions | Core written and tested against saved public answers; the page, cards and dashboard written and type-checked, not yet seen in a browser |
