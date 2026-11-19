# TTC transit

Reads the Toronto Transit Commission's public information and shows current delays, next
departures, elevators and escalators out of service, and vehicles near a stop. It adds entities,
automation triggers and conditions, a page, eight dashboard cards and a Transit dashboard.

> **State.** The integration is written and its tests pass against saved public answers. The
> page, the cards, the dashboard and the automation editors are written and type-checked, but
> **nothing has been seen in a browser or in a real build yet**, and nothing has run against the
> live feeds beyond a handful of requests made to learn their shape.

Contains information licensed under the Open Government Licence - Toronto. Every entity carries
this attribution, and the page and cards show it.

## What it reads

| Feed | Address | Used for | How often |
| --- | --- | --- | --- |
| Live service alerts, the feed behind the agency's own alerts page | `https://alerts.ttc.ca/api/alerts/live-alerts` | Route alerts, elevator and escalator outages, general alerts | Once a minute for alerts. Every 3 minutes for elevators and escalators, reusing a recent alerts answer so the feed is asked once |
| Next vehicle arrival predictions | `https://retro.umoiq.com/service/publicJSONFeed` with `command=predictions&a=ttc&stopId=<stop>` | Next departures at the chosen stops | Every 45 seconds, one request per chosen stop |
| The same service, `command=vehicleLocations&a=ttc&r=<route>` | | Vehicles near a stop | Every 25 seconds, **only while a card or the page is showing them**. Never when nobody is looking |
| The same service, `command=routeList` and `command=routeConfig` | | Route names, the stops of a route, and stop positions | Route names once a day. Stops while choosing them. Stop positions once per route while vehicles are shown |

No key and no account are needed.

## What is sent

Only the chosen stop numbers and route numbers, and the agency code `ttc`. Nothing about the home
is sent: no location, no address, no identifier. The requests name the project in their user agent
and carry no contact details. No request is made at all when nothing is being watched.

## Polite polling

- Each request has a 20 second timeout.
- After an error the wait doubles each time, up to 15 minutes. A refusal (403, 429 or 503) waits
  at least as long as the feed asks.
- The next attempt time and the last error are shown on the "information is fresh" entities and on
  the page.

## Old information

Every figure carries the time it was read (`read_at`). When the information is older than its
limit, the entities become unavailable rather than showing old figures as current. The limits are
10 minutes for alerts, 20 minutes for elevators and escalators, 3 minutes for departures and 2
minutes for vehicle positions. The page and cards dim old figures and say since when the TTC has
not answered.

## Setting it up

Three steps:

1. **What to watch.** Choose any of service alerts, elevators and escalators, and next departures.
2. **Routes and stations.** Subway lines, buses and streetcars are chosen from the real route list
   by search. If the list cannot be read, the subway lines are still offered. Stations are chosen
   from a list of rapid transit stations; a station that is not listed can be typed.
3. **Stops for next departures.** Choose from the stops of the chosen bus and streetcar routes, or
   type the number from the stop sign. Each stop is checked against the predictions service before
   it is accepted.

Options change routes, stations and stops. Reconfigure changes what is watched. Only one entry can
exist.

## What the agency does not offer

- **Next train times for the subway.** The predictions service covers buses and streetcars only.
  Asking it for a subway route returns an error, and no public feed without a key for subway next
  train times was found on the agency's developer and open data pages. Typing a subway station as a
  stop explains this rather than failing silently.
- **How many elevators a station has.** The alerts feed lists only the elevators that are out, so
  the step-free card shows the elevators that are out and the place each one cuts off, not "3 of 4
  working".
- **When an outage ends.** The alerts feed has no estimate for elevators and escalators, so none is
  shown.

## Entities

| Entity | Kind | One per | State and attributes |
| --- | --- | --- | --- |
| Status | Sensor, enum | Route | `regular`, `slow`, `delay`, `detour`, `reduced_service`, `no_service`. The alerts in effect, with the agency's own text, are in `alerts` |
| Problem | Binary sensor, problem | Route | On when the status is not regular |
| Next departure, Second departure, Third departure | Sensor, timestamp | Stop | The predicted time; route, direction, vehicle and `predicted: true` in the attributes |
| Minutes to next departure | Sensor, duration | Stop | Whole minutes until the next predicted departure |
| Elevators out, Escalators out | Sensor | Station | A count; the outages with the agency's text in `outages` |
| Step-free | Binary sensor | Station | On when no elevator is reported out. The feed cannot say whether a station is accessible at all |
| Alerts | Sensor | Network | The number of alerts in effect, with counts by kind |
| New alert | Event | Network | Fires once for each alert that was not there before. Event types: `route`, `elevator`, `escalator`, `general` |
| Service alerts are fresh, Elevator information is fresh, Departures are fresh | Binary sensor, diagnostic | Network | On while that feed's information is recent enough. Last error, failures and next attempt are in the attributes |

There is one device per route, per stop, per station and for the network. Each device links to the
TTC transit page.

## Automation triggers

Each trigger compares an answer with the previous one, so it fires **once for each thing that
happened**, not on every refresh. What is already true when the automation starts does not fire.

| Trigger | Fires |
| --- | --- |
| Route gets a delay (`ttc.route_delayed`) | When a route in regular service gets any problem. For one route, or for every chosen route |
| Route is back to regular service (`ttc.route_resumed`) | When a route with a problem is back to regular |
| Next departure is within (`ttc.departure_within`) | Once for each departure, when its predicted time first drops to the chosen number of minutes or less |
| Time to leave (`ttc.time_to_leave`) | Once for each departure, when it is time to walk to the stop; `leave_by` is in the trigger data |
| Elevator or escalator goes out or comes back (`ttc.lift_changed`) | Once for each outage that starts, ends, or both, at one station or any |
| New alert is posted (`ttc.new_alert`) | Once for each new alert, optionally of one kind |

Conditions: **Route has a problem** (`ttc.route_has_problem`) and **Station is step-free**
(`ttc.station_is_step_free`). Old or missing information does not pass either condition.

The automation editor has tailored controls for each trigger, condition and action.

## Actions

- `ttc.refresh` reads the feeds again now.
- `ttc.get_departures` returns the predicted departures at any stop number, read now. It accepts an
  optional route and limit.

## The page

Settings, TTC transit. It has four sections: Now, Alerts, Lifts and Stops, with search in the top
bar. All times use the 24-hour clock. The "Add the transit dashboard" button creates a dashboard
that uses the Transit dashboard strategy.

## Dashboard cards

| Card | Shows |
| --- | --- |
| `ttc-alert-banner` | The most serious alert on your routes, as a banner |
| `ttc-subway` | The status of each chosen subway line |
| `ttc-departures` | Predicted departures at a stop, by route and direction |
| `ttc-leave-by` | When to leave to catch the next departure, with a walking time |
| `ttc-route-alerts` | Alerts on your routes, in the agency's own words |
| `ttc-step-free` | Elevators and escalators out at your stations, and "Not step-free to ..." when the agency's text names the place an elevator cuts off |
| `ttc-vehicles` | Vehicles of the stop's routes within 2.5 km, on a schematic strip, with "Positions as reported N seconds ago". Tapping opens the app's own map with the stop and the vehicles. The card asks for positions only while it is showing |
| `ttc-line-history` | A route's last 24 hours, drawn from the recorded status sensor, with the time spent in each status |

Each card has a visual editor. The **Transit** dashboard, offered in the new dashboard dialog,
builds these cards each time it opens from the routes, stops and stations the integration watches,
so it follows changes made in the integration's options.

## Verification

- Core tests in `core/tests/components/ttc/`. They use saved public answers and never contact the
  network. They cover the setup flow, the coordinators (timeouts, server errors, refusals,
  malformed answers, going stale and recovering), every entity kind, triggers firing once,
  conditions, actions, page data, vehicle positions only while subscribed, and diagnostics.
- Not yet verified: anything in a browser, the cards, the dashboard, the device page link, and
  behaviour against the live feeds over time.
