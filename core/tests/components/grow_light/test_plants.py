"""Tests for the crop catalogue and stage counting."""

from datetime import date

import pytest

from homeassistant.components.grow_light.plants import (
    PHOTOS,
    STAGES,
    Plant,
    Stage,
    load_plants,
)

PLANT = Plant(
    id="test_crop",
    name="Test crop",
    scientific="Testus cropus",
    group="vegetable",
    photoperiod="day_neutral",
    note="",
    stages=(
        Stage("germination", 5, 0, 1, ""),
        Stage("seedling", 10, 16, 2, ""),
        Stage("harvest", 20, 12, 3, ""),
    ),
    photo_author="Someone",
    photo_license="CC0",
)
SOWN = date(2026, 11, 1)


@pytest.mark.parametrize(
    ("day", "stage", "day_in_stage", "since"),
    [
        pytest.param(date(2026, 10, 30), "germination", 1, 0, id="before-sowing"),
        pytest.param(date(2026, 11, 1), "germination", 1, 0, id="sowing-day"),
        pytest.param(date(2026, 11, 5), "germination", 5, 4, id="last-germination"),
        pytest.param(date(2026, 11, 6), "seedling", 1, 5, id="first-seedling"),
        pytest.param(date(2026, 12, 5), "harvest", 20, 34, id="last-day"),
        pytest.param(date(2026, 12, 10), "harvest", 25, 39, id="past-the-end"),
    ],
)
def test_stage_on(day: date, stage: str, day_in_stage: int, since: int) -> None:
    """Stages are counted from the sowing day and the last one lasts."""
    now = PLANT.stage_on(SOWN, day)
    assert (now.stage.key, now.day_in_stage, now.days_since_planting) == (
        stage,
        day_in_stage,
        since,
    )


def test_catalogue_is_complete() -> None:
    """Every crop has ordered, valid stages and a bundled photo."""
    plants = load_plants()
    assert len(plants) >= 60
    for plant in plants.values():
        keys = [stage.key for stage in plant.stages]
        assert keys, plant.id
        assert keys == sorted(keys, key=STAGES.index), plant.id
        assert plant.group in ("vegetable", "legume"), plant.id
        assert plant.photoperiod in ("long_day", "short_day", "day_neutral"), plant.id
        for stage in plant.stages:
            assert stage.days >= 1, plant.id
            assert 0 <= stage.light_hours <= 24, plant.id
            assert stage.water_every_days >= 1, plant.id
        assert (PHOTOS / f"{plant.id}.jpg").is_file(), plant.id
        assert plant.photo_author and plant.photo_license, plant.id


@pytest.mark.parametrize(
    "plant_id",
    [
        "mung_bean",
        "radish",
        "sugar_snap_pea",
        "spinach",
        "carrot",
        "lettuce",
        "adzuki_bean",
    ],
)
def test_crops_in_use_are_listed(plant_id: str) -> None:
    """The crops grown at home are in the catalogue."""
    assert plant_id in load_plants()
