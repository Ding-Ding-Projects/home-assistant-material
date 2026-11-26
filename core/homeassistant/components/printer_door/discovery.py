"""Passive LAN discovery of Bambu Lab printers.

Bambu Lab printers announce themselves with SSDP style NOTIFY packets sent over
UDP to the multicast group 239.255.255.250 on ports 1990 and 2021. Each packet
carries the printer's current IP address in ``Location`` and its serial number in
``USN``. One shared listener per Home Assistant instance reads those packets while
at least one printer is configured, and:

- moves a configured printer to its new address when its serial number shows up
  somewhere else (printers are matched by serial number only, never by address);
- offers an unknown printer in Discovered, so only the access code is needed.

Nothing is ever sent to the network: the listener only receives.
"""

import asyncio
import contextlib
from dataclasses import dataclass
import ipaddress
import logging
import re
import socket
from typing import Any, override

from homeassistant.config_entries import (
    SOURCE_IGNORE,
    SOURCE_INTEGRATION_DISCOVERY,
    ConfigEntry,
)
from homeassistant.const import CONF_HOST
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import discovery_flow
from homeassistant.util.hass_dict import HassKey

from .const import CONF_SERIAL, DOMAIN

_LOGGER = logging.getLogger(__name__)

MULTICAST_GROUP = "239.255.255.250"
DISCOVERY_PORTS = (1990, 2021)
MAX_PACKET = 4096

CONF_MODEL = "model"

DATA_DISCOVERY: HassKey[PrinterDiscovery] = HassKey(f"{DOMAIN}_discovery")

_SERIAL_RE = re.compile(r"^[A-Za-z0-9]{6,32}$")


@dataclass(frozen=True)
class PrinterAnnouncement:
    """One printer announcement read from a NOTIFY packet."""

    host: str
    serial: str
    model: str | None
    name: str | None


def parse_notify(data: bytes) -> PrinterAnnouncement | None:
    """Read a Bambu Lab NOTIFY packet, or return None for anything else."""
    text = data.decode("utf-8", errors="replace")
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines[0].upper().startswith("NOTIFY"):
        return None
    headers: dict[str, str] = {}
    for line in lines[1:]:
        key, sep, value = line.partition(":")
        if sep:
            headers[key.strip().lower()] = value.strip()

    is_bambu = (
        "devmodel.bambu.com" in headers or "bambulab" in headers.get("nt", "").lower()
    )
    if not is_bambu:
        return None

    host = _read_host(headers.get("location", ""))
    serial = headers.get("usn", "").strip()
    if host is None or not _SERIAL_RE.match(serial):
        return None
    return PrinterAnnouncement(
        host=host,
        serial=serial,
        model=headers.get("devmodel.bambu.com") or None,
        name=headers.get("devname.bambu.com") or None,
    )


def _read_host(location: str) -> str | None:
    """Return the IP address in a Location header, which is usually a bare IP."""
    value = location.strip()
    if "://" in value:
        value = value.split("://", 1)[1]
    value = value.split("/", 1)[0]
    if value.count(":") == 1:
        value = value.split(":", 1)[0]
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return None
    if address.is_unspecified or address.is_multicast or address.is_loopback:
        return None
    return str(address)


def create_listen_socket(port: int) -> socket.socket:
    """Create a non-blocking UDP socket that shares the port with other listeners."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            with contextlib.suppress(OSError):
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        sock.bind(("", port))
        membership = socket.inet_aton(MULTICAST_GROUP) + socket.inet_aton("0.0.0.0")
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, membership)
        sock.setblocking(False)
    except OSError:
        sock.close()
        raise
    return sock


class _NotifyProtocol(asyncio.DatagramProtocol):
    """Hands every received datagram to the discovery."""

    def __init__(self, discovery: PrinterDiscovery) -> None:
        self._discovery = discovery

    @override
    def datagram_received(self, data: bytes, addr: Any) -> None:
        """Handle one packet."""
        self._discovery.async_handle_packet(data[:MAX_PACKET])


class PrinterDiscovery:
    """The shared listener, kept open while any printer entry is loaded."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Create the listener; call async_start to open it."""
        self.hass = hass
        self._transports: list[asyncio.DatagramTransport] = []
        self._users: set[str] = set()
        self._offered: set[tuple[str, str]] = set()

    @callback
    def async_add_user(self, entry_id: str) -> None:
        """Record that an entry uses the listener."""
        self._users.add(entry_id)

    @callback
    def async_remove_user(self, entry_id: str) -> bool:
        """Forget an entry; return whether any entry still uses the listener."""
        self._users.discard(entry_id)
        return bool(self._users)

    @property
    def listening(self) -> bool:
        """Whether at least one port is open."""
        return bool(self._transports)

    async def async_start(self) -> None:
        """Open one socket per discovery port. A port that cannot open is skipped."""
        for port in DISCOVERY_PORTS:
            try:
                transport = await self._async_listen(port)
            except OSError as err:
                _LOGGER.warning(
                    "Cannot listen for printer announcements on UDP port %s: %s",
                    port,
                    err,
                )
                continue
            self._transports.append(transport)

    async def _async_listen(self, port: int) -> asyncio.DatagramTransport:
        """Open one shared multicast socket."""
        sock = create_listen_socket(port)
        transport, _ = await self.hass.loop.create_datagram_endpoint(
            lambda: _NotifyProtocol(self), sock=sock
        )
        return transport

    @callback
    def async_stop(self) -> None:
        """Close every socket."""
        for transport in self._transports:
            transport.close()
        self._transports.clear()

    @callback
    def async_handle_packet(self, data: bytes) -> None:
        """Act on one received packet."""
        announcement = parse_notify(data)
        if announcement is None:
            return
        entry = self.hass.config_entries.async_entry_for_domain_unique_id(
            DOMAIN, announcement.serial
        )
        if entry is not None:
            self._async_rebind(entry, announcement)
            return
        key = (announcement.serial, announcement.host)
        if key in self._offered:
            return
        self._offered.add(key)
        discovery_flow.async_create_flow(
            self.hass,
            DOMAIN,
            context={"source": SOURCE_INTEGRATION_DISCOVERY},
            data={
                CONF_HOST: announcement.host,
                CONF_SERIAL: announcement.serial,
                CONF_MODEL: announcement.model,
                "name": announcement.name,
            },
        )

    @callback
    def _async_rebind(
        self, entry: ConfigEntry, announcement: PrinterAnnouncement
    ) -> None:
        """Move a configured printer to the address it now announces."""
        if entry.source == SOURCE_IGNORE or entry.disabled_by is not None:
            return
        if entry.data.get(CONF_HOST) == announcement.host:
            return
        _LOGGER.info(
            "Printer %s moved from %s to %s; reconnecting",
            entry.title,
            entry.data.get(CONF_HOST),
            announcement.host,
        )
        self.hass.config_entries.async_update_entry(
            entry, data={**entry.data, CONF_HOST: announcement.host}
        )
        self.hass.config_entries.async_schedule_reload(entry.entry_id)


async def async_acquire(hass: HomeAssistant, entry_id: str) -> None:
    """Make sure the shared listener runs while this entry is loaded."""
    discovery = hass.data.get(DATA_DISCOVERY)
    if discovery is None:
        discovery = hass.data[DATA_DISCOVERY] = PrinterDiscovery(hass)
        await discovery.async_start()
    discovery.async_add_user(entry_id)


@callback
def async_release(hass: HomeAssistant, entry_id: str) -> None:
    """Close the shared listener when the last entry unloads."""
    discovery = hass.data.get(DATA_DISCOVERY)
    if discovery is None:
        return
    if not discovery.async_remove_user(entry_id):
        discovery.async_stop()
        hass.data.pop(DATA_DISCOVERY, None)


async def async_find_printers(hass: HomeAssistant) -> list[PrinterAnnouncement]:
    """Collect local announcements for a bounded user-initiated setup search."""
    found: dict[str, PrinterAnnouncement] = {}

    class SearchListener(PrinterDiscovery):
        @callback
        def async_handle_packet(self, data: bytes) -> None:
            if printer := parse_notify(data):
                found[printer.serial] = printer

    listener = SearchListener(hass)
    try:
        await listener.async_start()
        if listener.listening:
            await asyncio.sleep(10)
    finally:
        listener.async_stop()
    return list(found.values())
