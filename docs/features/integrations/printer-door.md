# Printer door

The Printer door integration watches a Bambu Lab 3D printer over your local network. It reports whether the printer's door or cover is open, the print status and progress, and fires events so an automation can alert you when a door opens in the middle of a print.

It is a local push integration: the printer sends its state over MQTT, nothing goes through a cloud service.

## Requirements

- A Bambu Lab printer with LAN access enabled.
- The printer's IP address, for example `192.0.2.10`.
- The printer's serial number.
- The LAN access code, shown in the printer's network settings.

## Setup

Go to Settings, Devices and services, Add integration, and choose Printer door. Enter a name, the IP address, the serial number and the access code. The form connects to the printer to check the details before it saves anything. Each serial number can be added once.

If you change the access code on the printer, Home Assistant asks for the new one through a repair step (reauthentication).

## Entities

All entities belong to one device per printer.

| Entity | Description |
| --- | --- |
| Door (binary sensor, door) | On when any door or cover the printer reports is open. Attributes list `front`, `top`, `left` and `right`, and `door_detection` (whether the printer has door sensors). |
| Print status (sensor) | `idle`, `printing`, `paused`, `finished` or `failed`, from the printer's G-code state. Preparing and slicing count as printing. |
| Print progress (sensor) | Percent complete as the printer reports it. |
| Door events (event) | `opened`, `closed` and `opened_while_printing`. An opening during a print fires `opened` and `opened_while_printing`. |
| Door open count today (sensor) | Number of openings since local midnight. It restarts at zero after a Home Assistant restart. |
| Last opened (sensor, timestamp) | When a door last opened while Home Assistant was watching. |

The first reading after Home Assistant connects only records the door state. A door that was already open is not counted as an opening.

## Automations

An opening during a print also fires the event `printer_door_opened_while_printing` on the Home Assistant event bus, with the data `entry_id`, `name`, `door` and `progress`. Use it as an event trigger, or use the Door events entity.

## Connection and security

- The printer talks MQTT over TLS on port 8883 with the user `bblp` and the access code as the password.
- The printer uses a self-signed certificate, so certificate verification is switched off for this one connection only. Other connections in Home Assistant are not affected. Anyone able to intercept traffic on your local network could impersonate the printer, so use the integration on a network you trust.
- The access code is stored in the config entry and is never written to the log.
- The integration reconnects with a growing delay (1 to 60 seconds) after a lost link. All entities are unavailable while the printer is disconnected. A refused access code starts reauthentication.

## Limits and verification

Door decoding follows the way Bambu Studio reads the printer's `stat` bits. The printer maker does not document it. The integration is covered by automated tests with a mocked MQTT client. It has not been tried against a real printer.
