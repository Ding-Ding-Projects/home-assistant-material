"""Local MQTT link to one Bambu Lab printer.

The printer speaks MQTT over TLS on its LAN port. It serves a certificate signed by
its maker's own authority, so certificate verification is disabled for this one
connection only. The access code never appears in a log line or an error message.
"""

from collections.abc import Callable
import json
import logging
import threading
from typing import Any

import paho.mqtt.client as mqtt

from homeassistant.util import ssl as ssl_util

from .const import MQTT_PORT, MQTT_USERNAME

_LOGGER = logging.getLogger(__name__)

CONNECT_TIMEOUT = 10
_AUTH_MARKERS = ("bad user name or password", "not authorized", "not authorised")
_AUTH_VALUES = {4, 5, 134, 135}


class PrinterLinkError(Exception):
    """The printer link failed."""


class CannotConnect(PrinterLinkError):
    """The printer could not be reached."""


class InvalidAuth(PrinterLinkError):
    """The printer refused the access code."""


def is_auth_failure(reason_code: Any) -> bool:
    """Return whether a CONNACK reason code means the access code was refused."""
    if getattr(reason_code, "value", None) in _AUTH_VALUES:
        return True
    return any(marker in str(reason_code).lower() for marker in _AUTH_MARKERS)


def _new_client() -> mqtt.Client:
    """Create a TLS MQTT client for the printer. Must run in an executor."""
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    # The printer uses a self-signed certificate: verification is off for this
    # connection only, and never for any other connection in Home Assistant.
    client.tls_set_context(ssl_util.get_default_no_verify_context())
    client.tls_insecure_set(True)
    return client


def check_connection(host: str, access_code: str) -> None:
    """Connect once and disconnect. Blocking; raises CannotConnect or InvalidAuth."""
    client = _new_client()
    client.username_pw_set(MQTT_USERNAME, access_code)
    result: list[Any] = []
    done = threading.Event()

    def on_connect(
        _client: Any, _userdata: Any, _flags: Any, reason_code: Any, *_args: Any
    ) -> None:
        result.append(reason_code)
        done.set()

    client.on_connect = on_connect
    try:
        client.connect(host, MQTT_PORT, keepalive=30)
        client.loop_start()
        if not done.wait(CONNECT_TIMEOUT):
            raise CannotConnect("Timed out waiting for the printer")
    except OSError as err:
        raise CannotConnect("Cannot reach the printer") from err
    finally:
        client.loop_stop()
        try:
            client.disconnect()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Ignoring error while closing the check connection")
    reason_code = result[0]
    if is_auth_failure(reason_code):
        raise InvalidAuth("The printer refused the access code")
    if getattr(reason_code, "is_failure", False):
        raise CannotConnect("The printer refused the connection")


class PrinterLink:
    """A persistent connection that reconnects with backoff."""

    def __init__(
        self,
        host: str,
        serial: str,
        access_code: str,
        on_report: Callable[[dict[str, Any]], None],
        on_state: Callable[[bool], None],
        on_auth_failed: Callable[[], None],
    ) -> None:
        """Store the connection settings and callbacks.

        The callbacks are invoked from the MQTT thread.
        """
        self._host = host
        self._serial = serial
        self._access_code = access_code
        self._on_report = on_report
        self._on_state = on_state
        self._on_auth_failed = on_auth_failed
        self._client: mqtt.Client | None = None
        self._sequence = 1

    @property
    def _report_topic(self) -> str:
        return f"device/{self._serial}/report"

    def start(self) -> None:
        """Start connecting. Blocking because it builds the TLS context."""
        client = _new_client()
        client.username_pw_set(MQTT_USERNAME, self._access_code)
        client.reconnect_delay_set(min_delay=1, max_delay=60)
        client.on_connect = self._handle_connect
        client.on_disconnect = self._handle_disconnect
        client.on_message = self._handle_message
        self._client = client
        client.connect_async(self._host, MQTT_PORT, keepalive=30)
        client.loop_start()

    def stop(self) -> None:
        """Stop and close the connection. Blocking."""
        client, self._client = self._client, None
        if client is None:
            return
        client.on_connect = None
        client.on_disconnect = None
        client.on_message = None
        try:
            client.disconnect()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Ignoring error while disconnecting")
        client.loop_stop()

    def _handle_connect(
        self, client: Any, _userdata: Any, _flags: Any, reason_code: Any, *_args: Any
    ) -> None:
        if is_auth_failure(reason_code):
            _LOGGER.warning("The printer at %s refused the access code", self._host)
            self._on_state(False)
            self._on_auth_failed()
            return
        if getattr(reason_code, "is_failure", False):
            _LOGGER.debug("The printer refused the connection: %s", reason_code)
            self._on_state(False)
            return
        client.subscribe(self._report_topic)
        # Ask for a full report so the first state is known without waiting.
        self.request(
            {"pushing": {"sequence_id": str(self._sequence), "command": "pushall"}}
        )
        self._sequence += 1
        self._on_state(True)

    def _handle_disconnect(self, *_args: Any) -> None:
        self._on_state(False)

    def _handle_message(self, _client: Any, _userdata: Any, message: Any) -> None:
        if message.topic != self._report_topic:
            return
        try:
            report = json.loads(message.payload)
        except ValueError:
            return
        if isinstance(report, dict):
            self._on_report(report)

    def request(self, body: dict[str, Any]) -> None:
        """Publish a request to the printer."""
        if self._client is not None:
            self._client.publish(f"device/{self._serial}/request", json.dumps(body))
