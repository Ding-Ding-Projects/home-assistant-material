"""Fixtures for the Printer door tests."""

from collections.abc import Callable, Generator
import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.printer_door.const import (
    CONF_ACCESS_CODE,
    CONF_SERIAL,
    DOMAIN,
)
from homeassistant.const import CONF_HOST

HOST = "192.0.2.10"
SERIAL = "TESTSERIAL0001"
ACCESS_CODE = "00000000"

DOOR_OPEN = format(1 << 23, "x")
DOOR_CLOSED = "0"
DOOR_SUPPORTED = format(1 << 12, "x")


class FakeReason:
    """A CONNACK reason code."""

    def __init__(self, text: str, value: int, is_failure: bool) -> None:
        """Create the reason."""
        self.value = value
        self.is_failure = is_failure
        self._text = text

    def __str__(self) -> str:
        """Return the reason text."""
        return self._text


SUCCESS = FakeReason("Success", 0, False)
BAD_AUTH = FakeReason("Bad user name or password", 134, True)
SERVER_BUSY = FakeReason("Server busy", 137, True)


class FakeMessage:
    """An MQTT message."""

    def __init__(self, topic: str, payload: bytes) -> None:
        """Create the message."""
        self.topic = topic
        self.payload = payload


class FakeClient:
    """A stand-in for the paho client that answers the connect at once."""

    def __init__(self, controller: FakeMqtt) -> None:
        """Register with the controller."""
        self.controller = controller
        self.on_connect: Callable[..., None] | None = None
        self.on_disconnect: Callable[..., None] | None = None
        self.on_message: Callable[..., None] | None = None
        self.published: list[tuple[str, str]] = []
        self.subscribed: list[str] = []
        self.credentials: tuple[str, str] | None = None
        self.insecure: bool | None = None
        controller.clients.append(self)

    def tls_set_context(self, context: Any) -> None:
        """Accept the TLS context."""

    def tls_insecure_set(self, value: bool) -> None:
        """Record that host name checking is off."""
        self.insecure = value

    def username_pw_set(self, username: str, password: str) -> None:
        """Record the credentials."""
        self.credentials = (username, password)

    def reconnect_delay_set(self, min_delay: int, max_delay: int) -> None:
        """Accept the backoff."""

    def connect(self, host: str, port: int, keepalive: int = 60) -> None:
        """Connect, or fail like a closed port."""
        if self.controller.connect_error:
            raise OSError("unreachable")

    def connect_async(self, host: str, port: int, keepalive: int = 60) -> None:
        """Accept the host."""

    def loop_start(self) -> None:
        """Deliver the connect result."""
        if self.on_connect is not None and not self.controller.connect_error:
            self.on_connect(self, None, {}, self.controller.reason, None)

    def loop_stop(self) -> None:
        """Stop the loop."""

    def disconnect(self) -> None:
        """Disconnect."""

    def subscribe(self, topic: str) -> None:
        """Record the subscription."""
        self.subscribed.append(topic)

    def publish(self, topic: str, payload: str) -> None:
        """Record a publish."""
        self.published.append((topic, payload))

    def send_report(self, print_data: dict[str, Any]) -> None:
        """Deliver a report from the printer."""
        assert self.on_message is not None
        self.on_message(
            self,
            None,
            FakeMessage(
                f"device/{SERIAL}/report", json.dumps({"print": print_data}).encode()
            ),
        )


class FakeMqtt:
    """Controls every fake client."""

    def __init__(self) -> None:
        """Start with a working printer."""
        self.reason: FakeReason = SUCCESS
        self.connect_error = False
        self.clients: list[FakeClient] = []

    @property
    def client(self) -> FakeClient:
        """The newest client."""
        return self.clients[-1]


@pytest.fixture
def fake_mqtt() -> Generator[FakeMqtt]:
    """Replace the paho client."""
    controller = FakeMqtt()
    with patch(
        "homeassistant.components.printer_door.link.mqtt.Client",
        side_effect=lambda *_args, **_kwargs: FakeClient(controller),
    ):
        yield controller


@pytest.fixture
def mock_config_entry() -> MockConfigEntry:
    """A configured printer."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="Printer",
        unique_id=SERIAL,
        data={CONF_HOST: HOST, CONF_SERIAL: SERIAL, CONF_ACCESS_CODE: ACCESS_CODE},
    )


@pytest.fixture(autouse=True)
def mock_discovery_listen() -> Generator[MagicMock]:
    """Keep the discovery listener off the real network."""
    with patch(
        "homeassistant.components.printer_door.discovery.PrinterDiscovery._async_listen",
        return_value=MagicMock(),
    ) as listen:
        yield listen
