"""Constants for the Printer door integration."""

DOMAIN = "printer_door"

CONF_SERIAL = "serial"
CONF_ACCESS_CODE = "access_code"

MQTT_PORT = 8883
MQTT_USERNAME = "bblp"

EVENT_OPENED = "opened"
EVENT_CLOSED = "closed"
EVENT_OPENED_WHILE_PRINTING = "opened_while_printing"
DOOR_EVENT_TYPES = [EVENT_OPENED, EVENT_CLOSED, EVENT_OPENED_WHILE_PRINTING]

# Fired on the Home Assistant event bus for automations.
BUS_EVENT_OPENED_WHILE_PRINTING = "printer_door_opened_while_printing"

STATUS_IDLE = "idle"
STATUS_PRINTING = "printing"
STATUS_PAUSED = "paused"
STATUS_FINISHED = "finished"
STATUS_FAILED = "failed"
PRINT_STATUSES = [
    STATUS_IDLE,
    STATUS_PRINTING,
    STATUS_PAUSED,
    STATUS_FINISHED,
    STATUS_FAILED,
]
