# Safety cutoff

Safety cutoff is a helper that cuts power to pumps, lights and similar loads when a leak sensor turns on or a load stays too high, and keeps them off until you press Reset. It suits a grow shelf with a water pump and light plugs.

## Set up

Add it from Settings, Devices and services, Helpers, Safety cutoff.

| Option | Meaning |
| --- | --- |
| Name | Name of the helper and its device. |
| Leak sensors | One or more binary sensors. When any turns on, the cutoff trips. |
| Switches to cut | Switches, lights or input booleans that are turned off on a trip. |
| Power sensor | Optional. A sensor with the power device class to watch. |
| Power limit | Watts. The cutoff trips when the power sensor stays above it. |
| For longer than | Seconds the power must stay above the limit. Shorter spikes are ignored. |
| Cut on power limit | When on, a power trip switches everything off. When off, a power trip only latches and notifies. |
| Notify | Notify services to call on a trip and on a reset. The list is built from the notify services that exist; you can also type one such as `notify.mobile_app_phone`. |

## Behavior

- A trip is latched. It stays tripped until you press Reset, even after the leak dries.
- While tripped, any listed switch that is turned back on is turned off again.
- A leak always cuts. If a power trip is already latched and a leak then appears, the cause becomes leak, everything is cut and a notification is sent.
- Reset is refused with an error while any leak sensor is still on.
- The Armed switch controls cutting. When it is off, a trip is still latched, recorded and notified, but nothing is switched off. Turning it back on while tripped cuts immediately.
- An unknown or unavailable sensor is not treated as a leak.
- The latch and the Armed state survive a restart. On start, a latched cutoff cuts again, and a sensor that is already wet trips it.

## Entities

| Entity | Description |
| --- | --- |
| Tripped (binary sensor, problem) | On while latched. Attributes `cause` and `since`. |
| Cause (sensor, enum) | `leak`, `power` or `none`. |
| Reset (button) | Clears the trip when every leak sensor is dry. |
| Armed (switch) | Whether a trip cuts the switches. |

## Event

Each new trip fires `safety_cutoff_tripped` with `entry_id`, `name`, `cause`, `cut` (whether switches were turned off) and `entities` (the switches that were cut).

## Failure modes

- A notify service that does not exist is logged as a warning and does not stop the cutoff.
- A cutoff only acts on entities Home Assistant can reach. If a switch is unavailable it cannot be turned off; check the Tripped sensor and the switch state.
- This helper is a convenience layer in software. It does not replace a hardware leak shutoff or a fused supply.

## Verification

Tests live in `core/tests/components/safety_cutoff` and cover the flow, leak trips, repeated cutting, power trips and short spikes, reset rules, the Armed switch and restore after a restart.
