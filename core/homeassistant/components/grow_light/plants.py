"""Crop catalogue: growth stages with light hours and watering for each crop."""

from dataclasses import dataclass
from datetime import date
import json
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.util.hass_dict import HassKey

STAGES = ["germination", "seedling", "vegetative", "flowering", "fruiting", "harvest"]

CATALOGUE = Path(__file__).parent / "plants.json"
PHOTOS = Path(__file__).parent / "photos"


@dataclass(frozen=True, slots=True)
class Stage:
    """One growth stage of a crop."""

    key: str
    days: int
    light_hours: float
    water_every_days: int
    water_note: str


@dataclass(frozen=True, slots=True)
class StageNow:
    """Where a crop is on a given day."""

    stage: Stage
    day_in_stage: int
    days_since_planting: int


@dataclass(frozen=True, slots=True)
class Plant:
    """A crop with its stages, in growing order."""

    id: str
    name: str
    scientific: str
    group: str
    photoperiod: str
    note: str
    stages: tuple[Stage, ...]
    photo_author: str
    photo_license: str

    @property
    def total_days(self) -> int:
        """Days from sowing to the end of the last stage."""
        return sum(stage.days for stage in self.stages)

    def stage_on(self, planted_on: date, day: date) -> StageNow:
        """Stage on a day; after the last stage the crop stays in it."""
        since = max((day - planted_on).days, 0)
        elapsed = 0
        for stage in self.stages:
            if since < elapsed + stage.days:
                return StageNow(stage, since - elapsed + 1, since)
            elapsed += stage.days
        last = self.stages[-1]
        return StageNow(last, since - elapsed + last.days + 1, since)


_DATA_KEY: HassKey[dict[str, Plant]] = HassKey("grow_light_plants")


def load_plants() -> dict[str, Plant]:
    """Read the catalogue; run in the executor."""
    raw = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    return {
        item["id"]: Plant(
            id=item["id"],
            name=item["name"],
            scientific=item["scientific"],
            group=item["group"],
            photoperiod=item["photoperiod"],
            note=item["note"],
            stages=tuple(
                Stage(
                    key=stage["stage"],
                    days=int(stage["days"]),
                    light_hours=float(stage["light_hours"]),
                    water_every_days=int(stage["water_every_days"]),
                    water_note=stage["water_note"],
                )
                for stage in item["stages"]
            ),
            photo_author=item["photo"]["author"],
            photo_license=item["photo"]["license"],
        )
        for item in raw
    }


async def async_get_plants(hass: HomeAssistant) -> dict[str, Plant]:
    """Catalogue, read once per run."""
    if (plants := hass.data.get(_DATA_KEY)) is None:
        plants = await hass.async_add_executor_job(load_plants)
        hass.data[_DATA_KEY] = plants
    return plants
