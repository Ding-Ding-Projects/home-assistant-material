# Printer door

The Printer door integration watches a Bambu Lab 3D printer over your local network. It reports whether the printer's door or cover is open, the print status and progress, and fires events so an automation can alert you when a door opens in the middle of a print.

It is a local push integration: the printer sends its state over MQTT, nothing goes through a cloud service.

## Requirements

- A Bambu Lab printer with LAN access enabled.
- The printer's IP address, for example `192.0.2.10`.
- The printer's serial number.
- The LAN access code, shown in the printer's network settings.

## Setup

Go to Settings, Devices and services, Add integration, and choose Printer door. Choose **Find a printer on my network** to listen for ten seconds, then select a printer and confirm its LAN access code. Choose **Enter address manually** to supply its name, address, serial number and access code. The **Test connection before adding** option checks these details and lets you review success before creating the entry. The form connects to the printer to check the details before it saves anything. Each serial number can be added once.

If you already have one printer set up, other Bambu Lab printers on the same network appear in Discovered by themselves (see below). Choose Configure, confirm the name and enter the access code; the address and serial number are filled in for you.

If you change the access code on the printer, Home Assistant asks for the new one through a repair step (reauthentication).

## Automatic discovery and address changes

Bambu Lab printers announce themselves on the local network every few seconds with SSDP style NOTIFY packets: UDP multicast to `239.255.255.250` on ports 1990 and 2021. Each announcement carries the printer's current IP address (`Location`), its serial number (`USN`), its model (`DevModel.bambu.com`) and its name (`DevName.bambu.com`).

While at least one printer is configured, the integration listens for these announcements with one shared listener. It only receives; it never sends anything to the network.

- **Address changes.** Printers are matched by serial number, never by address. When a configured printer announces itself at a new address (for example after the router hands out a new DHCP lease), the stored address is updated and the printer reconnects at once. An info line in the log records the old and new address. The access code is never logged.
- **New printers.** A serial number that is not configured yet starts a discovery flow, so the printer shows up in Discovered with its name and model. Only the access code is needed. Each printer and address is offered once while the listener runs; ignoring it in Discovered keeps it hidden.
- **Ports in use.** The listener shares its ports with other programs (address reuse). If a port still cannot be opened, a warning is logged and discovery continues on the other port. Manual setup and the existing printers keep working either way.
- **Limits.** Continuous discovery starts after the first printer is configured. Both continuous discovery and the setup search see printers on the same network segment as Home Assistant (multicast does not cross routers). Home Assistant in a container needs host networking to receive the announcements. Reserving a fixed address for each printer in the router is still the most reliable setup.

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

Door decoding follows the way Bambu Studio reads the printer's `stat` bits. The printer maker does not document it. The integration is covered by automated tests with a mocked MQTT client and synthetic discovery packets (no real sockets). It has not been tried against a real printer.
