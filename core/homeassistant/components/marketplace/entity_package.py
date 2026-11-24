"""Base entity of an installed package."""

from typing import TYPE_CHECKING, override

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, SIGNAL_PACKAGES_CHANGED
from .package_updates import PackageRecord

if TYPE_CHECKING:
    from .base import MarketplaceManager


class PackageEntity(Entity):
    """An entity of a package that was installed from a file."""

    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, marketplace: MarketplaceManager, key: str) -> None:
        """Initialize."""
        self.marketplace = marketplace
        self.key = key

    @property
    def record(self) -> PackageRecord:
        """Return what is known of the package."""
        return self.marketplace.package_updates.records[self.key]

    @property
    @override
    def available(self) -> bool:
        """Return if the package is still installed."""
        return self.key in self.marketplace.package_updates.records

    @property
    @override
    def device_info(self) -> DeviceInfo:
        """Return the device of the package."""
        record = self.marketplace.package_updates.records.get(self.key)
        return DeviceInfo(
            identifiers={(DOMAIN, f"package:{self.key}")},
            name=record.title if record else self.key,
            model=record.kind if record else None,
            entry_type=DeviceEntryType.SERVICE,
        )

    @override
    async def async_added_to_hass(self) -> None:
        """Follow what the package updates know."""
        await super().async_added_to_hass()

        @callback
        def _changed(key: str | None) -> None:
            if key in (None, self.key):
                self.async_write_ha_state()

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_PACKAGES_CHANGED, _changed)
        )
