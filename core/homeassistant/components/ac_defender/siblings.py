"""Brother and sister: one arbiter per climate entity shared by both defenders."""

from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant

from .arbiter import AC, HEAT, Arbiter, BandError, validate_band
from .const import (
    CONF_CLIMATE,
    CONF_FLOOR,
    CONF_HEAT_CAP,
    CONF_HEAT_MODE,
    CONF_MY_TEMPERATURE,
    CONF_PLAIN_LOG,
    DEFAULT_FLOOR,
    DEFAULT_MY_TEMPERATURE,
    DOMAIN,
    DOMAIN_HEAT,
    HEAT_MODE_CAP,
    HEAT_MODE_OFF,
)

if TYPE_CHECKING:
    from .coordinator import DefenderCoordinator

ARBITERS = f"{DOMAIN}_arbiters"
MEMBERS = f"{DOMAIN}_members"
FLOOR_CLEARANCE = 1.0


def band_for(
    ac_temp: float, heat_mode: str, heat_cap: float, floor: float
) -> tuple[float, float]:
    """Return the shared comfort band: her upper limit is his lower edge."""
    low = heat_cap if heat_mode == HEAT_MODE_CAP else floor + FLOOR_CLEARANCE
    return low, ac_temp


def check_band(ac_temp: float, heat_mode: str, heat_cap: float, floor: float) -> None:
    """Raise BandError when the two could cross, be too close, or break her floor."""
    low, high = band_for(ac_temp, heat_mode, heat_cap, floor)
    validate_band(low, high, floor)


def members(hass: HomeAssistant, climate_id: str) -> dict[str, DefenderCoordinator]:
    """Return the coordinators registered for a climate entity by role."""
    return hass.data.setdefault(MEMBERS, {}).setdefault(climate_id, {})


def sibling_of(
    hass: HomeAssistant, coordinator: DefenderCoordinator
) -> DefenderCoordinator | None:
    """Return the other defender of the same climate entity, if it is set up."""
    other = HEAT if coordinator.role == AC else AC
    return members(hass, coordinator.climate_id).get(other)


def async_attach_sibling(hass: HomeAssistant, coordinator: DefenderCoordinator) -> None:
    """Register a coordinator with the arbiter of its climate entity."""
    arbiters: dict[str, Arbiter] = hass.data.setdefault(ARBITERS, {})
    arbiter = arbiters.setdefault(coordinator.climate_id, Arbiter(low=0.0, high=100.0))
    arbiter.register(coordinator.role)
    members(hass, coordinator.climate_id)[coordinator.role] = coordinator
    coordinator.arbiter = arbiter
    for member in members(hass, coordinator.climate_id).values():
        member.arbiter = arbiter
    async_update_band(hass, coordinator.climate_id)


def async_detach_sibling(hass: HomeAssistant, coordinator: DefenderCoordinator) -> None:
    """Remove a coordinator; a remaining sibling then behaves as if alone."""
    arbiters: dict[str, Arbiter] = hass.data.get(ARBITERS, {})
    if (arbiter := arbiters.get(coordinator.climate_id)) is None:
        return
    arbiter.unregister(coordinator.role)
    coordinator.arbiter = None
    group = members(hass, coordinator.climate_id)
    group.pop(coordinator.role, None)
    if not group:
        arbiters.pop(coordinator.climate_id)
        hass.data[MEMBERS].pop(coordinator.climate_id, None)


def async_update_band(hass: HomeAssistant, climate_id: str) -> None:
    """Move the shared band to match both defenders and the plain-log choice."""
    group = members(hass, climate_id)
    arbiter: Arbiter | None = hass.data.get(ARBITERS, {}).get(climate_id)
    if arbiter is None:
        return
    arbiter.plain = any(
        bool(m.entry.options.get(CONF_PLAIN_LOG, False)) for m in group.values()
    )
    ac, heat = group.get(AC), group.get(HEAT)
    if ac is None or heat is None:
        return
    low, high = band_for(ac.my_temp, heat.heat_mode, heat.my_temp, heat.floor or 0.0)
    try:
        arbiter.set_band(low, high, heat.floor)
    except BandError:
        return


def _stored(entry_data: dict, entry_options: dict, key: str, default: float | str):
    return entry_options.get(key, entry_data.get(key, default))


def sibling_band_error(
    hass: HomeAssistant,
    role: str,
    climate_id: str,
    value: float,
    *,
    heat_mode: str = HEAT_MODE_OFF,
    floor: float = DEFAULT_FLOOR,
    skip_entry_id: str | None = None,
) -> str | None:
    """Return a translation key when a new value would cross an existing sibling."""
    other_domain = DOMAIN_HEAT if role == AC else DOMAIN
    for entry in hass.config_entries.async_entries(other_domain):
        if (
            entry.entry_id == skip_entry_id
            or entry.data.get(CONF_CLIMATE) != climate_id
        ):
            continue
        data, options = dict(entry.data), dict(entry.options)
        try:
            if role == AC:
                check_band(
                    value,
                    _stored(data, options, CONF_HEAT_MODE, HEAT_MODE_OFF),
                    float(_stored(data, options, CONF_HEAT_CAP, value)),
                    float(_stored(data, options, CONF_FLOOR, DEFAULT_FLOOR)),
                )
            else:
                check_band(
                    float(
                        _stored(
                            data, options, CONF_MY_TEMPERATURE, DEFAULT_MY_TEMPERATURE
                        )
                    ),
                    heat_mode,
                    value,
                    floor,
                )
        except BandError as err:
            return str(err)
    return None
