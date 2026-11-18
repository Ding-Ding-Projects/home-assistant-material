# Canvas 39: AC Defender as an integration

One board, drawn as real screens of the app in its dark theme at phone width (390 px), for bringing the separate AC Defender program into the home as an integration.

| Board | What it shows |
| --- | --- |
| `Main.dc.html` | Interactive. Setting it up from Add integration (which air conditioner, "my temperature" within the device's own limits, a safety temperature), its own page (what it is doing and why, room, set and my temperature, pause and stop, what happened, cooling time and an estimated cost), and the guards as a searchable list of switches |

## Rules the board carries

- It acts on the real climate entity. There is no pretend thermostat.
- One device per defended air conditioner. Each guard is a switch entity that automations can read and turn, with a page of its own in plain words.
- Safety guards cannot be turned off without the two-key confirmation.
- The page always says what it is doing and why, and when it will look again.
- Pausing is one press and says how long; stopping everything is separate and plain.
- Cost is an estimate from cooling time and the price table, and is labelled as an estimate.

## Reference

The behaviour comes from the separate project "Home Assistant AC Defender" (the same owner's public repository of that name), which runs as its own web application with a background worker. This canvas is about how it looks and is set up as an integration; the guards' behaviour is ported from that project's own documentation and source.

## Status

Design reference. Nothing here is shipped behaviour until it is built and seen in a real build.
