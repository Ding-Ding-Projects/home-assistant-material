# Canvas 39: AC Defender as an integration

Two boards, drawn as real screens of the app in its dark theme at phone width (390 px), for bringing the separate AC Defender program into the home as an integration.

| Board | What it shows |
| --- | --- |
| `Main.dc.html` | Interactive. Setting it up from Add integration (which air conditioner, "my temperature" within the device's own limits, a safety temperature), its own page (what it is doing and why, room, set and my temperature, pause and stop, what happened, cooling time and an estimated cost), and the guards as a searchable list of switches |
| `Heat.dc.html` | Interactive. Its sister, Heat Defender: keeps the heating off (or no warmer than a chosen number) so the home does not get hot, with the same guards turned around and a floor temperature below which the heating is always allowed to run |

## Rules the board carries

- It acts on the real climate entity. There is no pretend thermostat.
- One device per defended air conditioner. Each guard is a switch entity that automations can read and turn, with a page of its own in plain words.
- Safety guards cannot be turned off without the two-key confirmation.
- The page always says what it is doing and why, and when it will look again.
- Pausing is one press and says how long; stopping everything is separate and plain.
- Heat Defender has a floor that cannot be switched off or set under 10 °C: below it the heating may run whatever was chosen. Freezing weather raises the floor, and with no room reading it stands down. Comfort never outranks pipes or people.
- An air conditioner and a heater in the same room never work against each other.
- Cost is an estimate from cooling time and the price table, and is labelled as an estimate.

## Reference

The behaviour comes from the separate project "Home Assistant AC Defender" (the same owner's public repository of that name), which runs as its own web application with a background worker. This canvas is about how it looks and is set up as an integration; the guards' behaviour is ported from that project's own documentation and source.

## Status

Design reference. Nothing here is shipped behaviour until it is built and seen in a real build.
