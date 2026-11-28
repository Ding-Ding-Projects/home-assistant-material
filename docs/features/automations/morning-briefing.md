# Morning briefing

A helper that sends one notification each morning summarizing the home: the weather, transit
alerts, your grow lights and anything else you pick. It leaves out empty sections and sends "All quiet." when every selected source is readable and there are no updates. Missing sources are listed explicitly, including when none could be checked. Companion app notifications include shortcuts to the first three unavailable entities.

Add it from **Settings > Devices & services > Helpers > Create helper > Morning briefing**.

## Settings

| Setting | What it does |
| --- | --- |
| Name | The name of the briefing and its entities. |
| Send at | The time of day, in 24-hour time. Defaults to 07:30. |
| Send to | One or more `notify` actions, listed from the actions Home Assistant has. Type a custom action such as `notify.mobile_app_phone` if it is not listed. |
| Weather | Optional `weather` entity. Today's daily forecast is used through the `weather.get_forecasts` action; if that fails, the current condition and temperature are used. |
| Transit alerts | Optional `sensor` or `binary_sensor` entities. Quiet states such as `ok`, `none`, `off` and `normal` are omitted. Unknown and unavailable sources are listed separately. |
| Extra entities | Optional. Each is listed as a line with its name and state (and unit). Unavailable selections are reported by name. |

All of them except the name can be changed later from the helper's **Options**.

## Grow lights

Every [Grow light](grow-light.md) helper is included automatically; there is nothing to configure.
The briefing reads each one's entities from the entity registry and reports:

- **Water today:** crops whose **Next watering** is today or earlier.
- **New stage:** crops that moved into a new growth stage today.
- **Ready to harvest:** crops in the `harvest` stage.
- **Light paused (door open):** lights whose **Status** is `paused`.

## Entities

| Entity | What it shows |
| --- | --- |
| Button **Send now** | Sends a briefing immediately, whatever the schedule or switch say. |
| Sensor **Next briefing** | When the next briefing goes out. Empty while the switch is off. |
| Sensor **Last briefing** | When the last briefing was sent, with the text in the `message` attribute. Kept across restarts. |
| Switch **Enabled** | When off, the daily briefing is skipped. Its state is kept across restarts. |

Each briefing also fires the `morning_briefing_sent` event with `name`, `message` and `sent_at`, so
automations can react to it.

## Failure modes

- A notify action that fails is logged and the other targets still receive the briefing.
- A weather entity without a forecast service falls back to its current state.
- Without any notify target the briefing is still composed, stored in **Last briefing** and fired as
  an event.

## Verification

Covered by automated tests under `core/tests/components/morning_briefing`: the flow, message
composition (weather, transit, grow lights, empty, extras), the button and the daily timer. It has
not been run in a live Home Assistant.
