# Grow light

A helper that keeps a plug on for a set number of hours each day and switches it off while a door
is open. It can also follow a crop: pick one of the catalogue's vegetables or legumes and the light
hours and watering follow the crop's growth stage, counted from the day it was sown.

Add it from **Settings > Devices & services > Helpers > Create helper > Grow light**. Boards:
[`design/canvases/43-grow-light`](../../../design/canvases/43-grow-light/README.md).

## Settings

| Setting | What it does |
| --- | --- |
| Name | The name of the grow light and its entities. |
| Plug or switch | The `switch`, `light` or `input_boolean` that powers the light. |
| Crop | Optional. A searchable list of the crop catalogue, each row with a photo of the plant, its group, day-length type, days to the end and the photo credit. "None, set my own hours" keeps the fixed hours below. |
| Sown or planted on | The day the growth stage is counted from. Defaults to today. |
| Start time | When the light turns on each day. Watering is due at this time too. |
| Hours per day | Used only without a crop. 0.5 to 24 hours in half-hour steps. A window that passes midnight works, for example 20:00 for 8 hours ends at 04:00. 24 means always on. |
| Pause when open | Optional door or window sensors (`binary_sensor`). |
| Water every | Days between waterings without a crop; 0 means no watering schedule. With a crop the stage sets it. |
| Watering pump or valve | Optional `switch` or `input_boolean`. When set, the helper waters by itself when watering is due. |
| Watering run | How many minutes the pump or valve runs each time. |

All of them except the name can be changed later from the helper's **Options**; the helper reloads
with the new settings.

## How it behaves

- Inside the on hours, with every door closed, the plug is turned on.
- When the on hours end, the plug is turned off.
- When any listed door opens (its state is `on`), the plug is turned off at once.
- When the last open door closes, the plug is turned back on **only if it is still inside the on
  hours**. Closing a door outside the on hours leaves the light off.
- With a crop, the on hours each day are the light hours of the stage the crop is in on the day the
  window starts. Germination usually has 0 hours, so the light stays off until the seedlings are
  due; the next window start after a stage change brings the new hours. After the last stage the
  crop stays in it.
- Watering is due at the start time, every so many days after the last watering (the first one on
  the sowing day). With a pump or valve, the helper turns it on for the watering run and records
  the watering. Without one, press **Watered** after watering by hand. Watering ignores the doors
  and stops while the schedule switch is off.
- The helper only switches the plug when something changes: the on hours start or end, a door
  opens or closes, the schedule switch changes, Home Assistant starts, or the plug comes back
  online after being unavailable. Switching the plug by hand is left alone until the next change.
- A door that is `unavailable` or `unknown` counts as closed.

## Entities

| Entity | What it shows |
| --- | --- |
| Switch **Schedule** | Turns the helper on or off. Turning it off switches the plug off and stops all automatic switching and watering until it is turned on again. Its state is kept across restarts. |
| Sensor **Status** | `on`, `paused` (a door is open), `off_hours` or `schedule_off`. The `open_doors` attribute lists the doors open now. |
| Sensor **Next change** | When the on hours next start or end. Empty while the schedule is off or when the light is on all day or not at all. |
| Sensor **Growth stage** | Only with a crop. The stage, with the crop's photo as its picture, and attributes for the day in the stage, days since sowing, today's light hours, watering interval and note, and every stage of the crop. |
| Sensor **Next watering** | When watering is next due; empty without a watering schedule. `watering` is true while the pump runs. |
| Sensor **Last watered** | The last watering, by hand or by the pump. Kept across restarts. |
| Button **Watered** | Records a watering done by hand. |

## Crop catalogue

The catalogue is `core/homeassistant/components/grow_light/plants.json`, with one photo per crop in
`photos/` and the photo credits in `photos/CREDITS.md`. The photos are bundled and served by Home
Assistant itself at `/grow_light/photos/<crop>.jpg`, so the picker works without internet access.

**Read the numbers as starting points.** Day-length types and total days to harvest come from the
sources listed for each crop (mostly RHS grow-your-own pages, Wikipedia and Purdue NewCrop; several
university extension pages could not be read). The split into stages, the light hours for each
stage and the watering intervals are practical indoor-growing estimates for pots under a grow
light; the sources give watering only as general advice such as "keep the soil moist". Adjust to
your pots, soil and room: a crop can be replaced with "None, set my own hours" at any time.

Known weak spots: celery and parsnip are shown by their wild forms, collard greens by Portuguese
kale and rutabaga by a field of swede; the pepper entries borrow their stage pattern from aubergine;
asparagus is modelled on its first year only; onions differ by long-day, intermediate and short-day
variety, which the note explains.

### The 68 crops

Each stage is shown as its length in days, the grow-light hours and the days between waterings.

| Crop | Group | Day length | Stages: days, light hours, water every | Sources |
| --- | --- | --- | --- | --- |
| Adzuki bean (*Vigna angularis*) | Legume | Short-day | germination 7 d, 0 h, 2 d; seedling 12 d, 16 h, 3 d; vegetative 30 d, 16 h, 4 d; flowering 14 d, 12 h, 2 d; fruiting 35 d, 12 h, 2 d; harvest 15 d, 12 h, 5 d | [1](https://en.wikipedia.org/wiki/Adzuki_bean) |
| Arugula (*Eruca vesicaria*) | Vegetable | Long-day | germination 5 d, 0 h, 1 d; seedling 10 d, 12 h, 2 d; vegetative 14 d, 12 h, 2 d; harvest 21 d, 12 h, 2 d | [1](https://www.rhs.org.uk/vegetables/rocket/grow-your-own) |
| Asparagus (*Asparagus officinalis*) | Vegetable | Day-neutral | germination 21 d, 0 h, 1 d; seedling 60 d, 16 h, 3 d; vegetative 300 d, 14 h, 7 d; harvest 56 d, 12 h, 5 d | [1](https://www.rhs.org.uk/vegetables/asparagus/grow-your-own) |
| Beetroot (*Beta vulgaris subsp. vulgaris*) | Vegetable | Day-neutral | germination 12 d, 0 h, 1 d; seedling 14 d, 12 h, 2 d; vegetative 21 d, 14 h, 3 d; fruiting 21 d, 12 h, 4 d; harvest 7 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/beetroot) [2](https://extension.umd.edu/resource/growing-beets-home-garden) |
| Bok choy (*Brassica rapa subsp. chinensis*) | Vegetable | Long-day | germination 5 d, 0 h, 1 d; seedling 10 d, 12 h, 2 d; vegetative 20 d, 12 h, 2 d; harvest 20 d, 12 h, 2 d | [1](https://www.rhs.org.uk/vegetables/pak-choi/grow-your-own) |
| Broad bean (fava) (*Vicia faba*) | Legume | Long-day | germination 10 d, 0 h, 3 d; seedling 14 d, 15 h, 3 d; vegetative 40 d, 16 h, 3 d; flowering 14 d, 16 h, 3 d; fruiting 35 d, 16 h, 3 d; harvest 14 d, 14 h, 5 d | [1](https://www.rhs.org.uk/vegetables/broad-beans/grow-your-own) [2](https://hort.purdue.edu/newcrop/duke_energy/Vicia_faba.html) |
| Broccoli (*Brassica oleracea var. italica*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 28 d, 16 h, 2 d; vegetative 60 d, 14 h, 3 d; harvest 30 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/broccoli/grow-your-own) |
| Brussels sprouts (*Brassica oleracea var. gemmifera*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 35 d, 16 h, 2 d; vegetative 90 d, 14 h, 4 d; harvest 60 d, 12 h, 4 d | [1](https://www.rhs.org.uk/vegetables/brussels-sprouts/grow-your-own) |
| Bush green bean (*Phaseolus vulgaris*) | Legume | Day-neutral | germination 7 d, 0 h, 2 d; seedling 10 d, 16 h, 3 d; vegetative 20 d, 16 h, 3 d; flowering 10 d, 14 h, 2 d; fruiting 15 d, 14 h, 2 d; harvest 14 d, 12 h, 4 d | [1](https://hort.purdue.edu/newcrop/duke_energy/Phaseolus_vulgaris.html) |
| Butternut squash (*Cucurbita moschata*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 35 d, 14 h, 3 d; flowering 20 d, 14 h, 3 d; fruiting 60 d, 14 h, 3 d; harvest 21 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/pumpkins/grow-your-own) |
| Cabbage (*Brassica oleracea var. capitata*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 28 d, 16 h, 2 d; vegetative 60 d, 14 h, 3 d; harvest 60 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/cabbages/grow-your-own) |
| Cantaloupe (*Cucumis melo*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 25 d, 16 h, 2 d; flowering 15 d, 14 h, 2 d; fruiting 35 d, 14 h, 2 d; harvest 14 d, 14 h, 4 d | [1](https://www.rhs.org.uk/fruit/melons/grow-your-own) |
| Carrot (*Daucus carota subsp. sativus*) | Vegetable | Day-neutral | germination 14 d, 0 h, 1 d; seedling 21 d, 12 h, 2 d; vegetative 28 d, 14 h, 4 d; fruiting 28 d, 12 h, 5 d; harvest 7 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/carrots/grow-your-own) [2](https://extension.umd.edu/resource/growing-carrots-home-garden) |
| Cauliflower (*Brassica oleracea var. botrytis*) | Vegetable | Day-neutral | germination 10 d, 0 h, 1 d; seedling 42 d, 16 h, 2 d; vegetative 60 d, 14 h, 3 d; harvest 30 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/cauliflower/grow-your-own) |
| Celeriac (*Apium graveolens var. rapaceum*) | Vegetable | Day-neutral | germination 21 d, 12 h, 2 d; seedling 56 d, 14 h, 3 d; vegetative 60 d, 14 h, 3 d; fruiting 60 d, 12 h, 4 d; harvest 14 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/celeriac/grow-your-own) |
| Celery (*Apium graveolens var. dulce*) | Vegetable | Day-neutral | germination 14 d, 0 h, 1 d; seedling 56 d, 16 h, 1 d; vegetative 75 d, 14 h, 2 d; harvest 30 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/celery/grow-your-own) |
| Cherry tomato (*Solanum lycopersicum var. cerasiforme*) | Vegetable | Day-neutral | germination 8 d, 0 h, 1 d; seedling 28 d, 16 h, 2 d; vegetative 20 d, 16 h, 2 d; flowering 15 d, 14 h, 2 d; fruiting 35 d, 14 h, 1 d; harvest 45 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/tomatoes/grow-your-own) |
| Chickpea (*Cicer arietinum*) | Legume | Long-day | germination 8 d, 0 h, 3 d; seedling 14 d, 15 h, 4 d; vegetative 45 d, 16 h, 4 d; flowering 20 d, 16 h, 3 d; fruiting 40 d, 16 h, 3 d; harvest 15 d, 14 h, 6 d | [1](https://en.wikipedia.org/wiki/Chickpea) |
| Chili pepper (*Capsicum annuum*) | Vegetable | Day-neutral | germination 14 d, 0 h, 1 d; seedling 45 d, 16 h, 2 d; vegetative 35 d, 16 h, 3 d; flowering 25 d, 14 h, 3 d; fruiting 55 d, 14 h, 3 d; harvest 45 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/aubergines/grow-your-own) |
| Collard greens (*Brassica oleracea var. viridis*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 45 d, 14 h, 3 d; harvest 60 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/kale/grow-your-own) [2](https://www.rhs.org.uk/vegetables/cabbages/grow-your-own) |
| Cowpea (black-eyed pea) (*Vigna unguiculata*) | Legume | Day-neutral | germination 6 d, 0 h, 3 d; seedling 10 d, 16 h, 3 d; vegetative 25 d, 16 h, 4 d; flowering 12 d, 14 h, 3 d; fruiting 25 d, 14 h, 3 d; harvest 14 d, 12 h, 6 d | [1](https://en.wikipedia.org/wiki/Cowpea) |
| Cucumber (*Cucumis sativus*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 1 d; vegetative 21 d, 14 h, 2 d; flowering 14 d, 14 h, 2 d; fruiting 30 d, 14 h, 1 d; harvest 30 d, 14 h, 1 d | [1](https://www.rhs.org.uk/vegetables/cucumbers/grow-your-own) |
| Daikon (*Raphanus sativus var. longipinnatus*) | Vegetable | Long-day | germination 5 d, 0 h, 1 d; seedling 10 d, 12 h, 2 d; vegetative 20 d, 12 h, 3 d; fruiting 30 d, 11 h, 3 d; harvest 7 d, 11 h, 4 d | [1](https://extension.umd.edu/resource/growing-radishes-home-garden) |
| Dry common bean (kidney, black, pinto) (*Phaseolus vulgaris*) | Legume | Day-neutral | germination 7 d, 0 h, 2 d; seedling 12 d, 16 h, 3 d; vegetative 30 d, 16 h, 3 d; flowering 12 d, 14 h, 2 d; fruiting 35 d, 14 h, 2 d; harvest 20 d, 12 h, 6 d | [1](https://hort.purdue.edu/newcrop/duke_energy/Phaseolus_vulgaris.html) |
| Eggplant (*Solanum melongena*) | Vegetable | Day-neutral | germination 12 d, 0 h, 1 d; seedling 40 d, 16 h, 2 d; vegetative 30 d, 16 h, 2 d; flowering 25 d, 14 h, 2 d; fruiting 50 d, 14 h, 2 d; harvest 40 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/aubergines/grow-your-own) |
| Endive (*Cichorium endivia*) | Vegetable | Long-day | germination 7 d, 0 h, 1 d; seedling 21 d, 14 h, 2 d; vegetative 35 d, 14 h, 2 d; harvest 35 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/endive/grow-your-own) |
| Fennel (Florence) (*Foeniculum vulgare var. azoricum*) | Vegetable | Long-day | germination 10 d, 0 h, 1 d; seedling 14 d, 12 h, 2 d; vegetative 35 d, 12 h, 2 d; fruiting 28 d, 12 h, 2 d; harvest 7 d, 12 h, 3 d | [1](https://www.rhs.org.uk/vegetables/florence-fennel/grow-your-own) |
| Garden pea (*Pisum sativum*) | Legume | Long-day | germination 8 d, 0 h, 2 d; seedling 12 d, 15 h, 3 d; vegetative 25 d, 16 h, 3 d; flowering 10 d, 16 h, 2 d; fruiting 20 d, 16 h, 2 d; harvest 10 d, 14 h, 4 d | [1](https://en.wikipedia.org/wiki/Photoperiodism) |
| Garlic (*Allium sativum*) | Vegetable | Long-day | germination 21 d, 0 h, 7 d; vegetative 120 d, 12 h, 7 d; fruiting 90 d, 14 h, 6 d; harvest 14 d, 14 h, 14 d | [1](https://www.rhs.org.uk/vegetables/garlic/grow-your-own) [2](https://extension.umd.edu/resource/growing-garlic-home-garden) |
| Globe artichoke (*Cynara cardunculus var. scolymus*) | Vegetable | Day-neutral | germination 14 d, 0 h, 1 d; seedling 50 d, 16 h, 2 d; vegetative 100 d, 14 h, 4 d; flowering 30 d, 14 h, 4 d; fruiting 30 d, 14 h, 4 d; harvest 60 d, 14 h, 5 d | [1](https://www.rhs.org.uk/vegetables/globe-artichokes/grow-your-own) |
| Green onion (scallion) (*Allium fistulosum*) | Vegetable | Day-neutral | germination 10 d, 0 h, 1 d; seedling 14 d, 12 h, 2 d; vegetative 28 d, 14 h, 3 d; fruiting 7 d, 12 h, 3 d; harvest 7 d, 12 h, 4 d | [1](https://extension.umd.edu/resource/growing-onions-home-garden) [2](https://www.rhs.org.uk/vegetables/onions/grow-your-own) |
| Horseradish (*Armoracia rusticana*) | Vegetable | Day-neutral | germination 21 d, 0 h, 5 d; seedling 21 d, 12 h, 4 d; vegetative 90 d, 14 h, 5 d; fruiting 90 d, 12 h, 6 d; harvest 14 d, 12 h, 14 d | [1](https://www.rhs.org.uk/vegetables/horseradish/grow-your-own) |
| Kale (*Brassica oleracea var. sabellica*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 45 d, 16 h, 3 d; harvest 60 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/kale/grow-your-own) |
| Kohlrabi (*Brassica oleracea var. gongylodes*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 30 d, 14 h, 2 d; harvest 30 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/kohl-rabi/grow-your-own) |
| Leek (*Allium ampeloprasum var. porrum*) | Vegetable | Day-neutral | germination 14 d, 0 h, 2 d; seedling 56 d, 14 h, 3 d; vegetative 90 d, 14 h, 4 d; fruiting 30 d, 12 h, 4 d; harvest 7 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/leeks/grow-your-own) [2](https://extension.umd.edu/resource/growing-leeks-home-garden) |
| Lentil (*Lens culinaris*) | Legume | Long-day | germination 8 d, 0 h, 3 d; seedling 14 d, 15 h, 4 d; vegetative 35 d, 16 h, 4 d; flowering 18 d, 16 h, 3 d; fruiting 30 d, 16 h, 3 d; harvest 14 d, 14 h, 6 d | [1](https://en.wikipedia.org/wiki/Lentil) |
| Lettuce (*Lactuca sativa*) | Vegetable | Long-day | germination 5 d, 0 h, 1 d; seedling 14 d, 14 h, 2 d; vegetative 21 d, 14 h, 2 d; harvest 14 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/lettuce/grow-your-own) |
| Lima bean (*Phaseolus lunatus*) | Legume | Day-neutral | germination 8 d, 0 h, 2 d; seedling 10 d, 16 h, 3 d; vegetative 25 d, 16 h, 3 d; flowering 12 d, 14 h, 2 d; fruiting 20 d, 14 h, 2 d; harvest 10 d, 12 h, 5 d | [1](https://en.wikipedia.org/wiki/Lima_bean) |
| Lupin bean (white lupin) (*Lupinus albus*) | Legume | Long-day | germination 8 d, 0 h, 3 d; seedling 14 d, 15 h, 4 d; vegetative 50 d, 16 h, 4 d; flowering 20 d, 16 h, 3 d; fruiting 45 d, 16 h, 3 d; harvest 15 d, 14 h, 6 d | [1](https://en.wikipedia.org/wiki/Lupinus_albus) |
| Mung bean (*Vigna radiata*) | Legume | Short-day | germination 5 d, 0 h, 2 d; seedling 10 d, 16 h, 3 d; vegetative 20 d, 16 h, 3 d; flowering 12 d, 12 h, 2 d; fruiting 25 d, 12 h, 2 d; harvest 10 d, 12 h, 5 d | [1](https://en.wikipedia.org/wiki/Photoperiodism) |
| Mustard greens (*Brassica juncea*) | Vegetable | Long-day | germination 4 d, 0 h, 1 d; seedling 10 d, 12 h, 2 d; vegetative 20 d, 12 h, 2 d; harvest 21 d, 12 h, 2 d | [1](https://www.rhs.org.uk/vegetables/pak-choi/grow-your-own) |
| Napa cabbage (*Brassica rapa subsp. pekinensis*) | Vegetable | Long-day | germination 7 d, 0 h, 1 d; seedling 14 d, 12 h, 2 d; vegetative 35 d, 12 h, 2 d; harvest 25 d, 12 h, 2 d | [1](https://www.rhs.org.uk/vegetables/pak-choi/grow-your-own) |
| Okra (*Abelmoschus esculentus*) | Vegetable | Short-day | germination 8 d, 0 h, 1 d; seedling 30 d, 14 h, 2 d; vegetative 30 d, 13 h, 3 d; flowering 20 d, 12 h, 3 d; fruiting 25 d, 12 h, 3 d; harvest 60 d, 12 h, 3 d | [1](https://www.rhs.org.uk/vegetables/okra/grow-your-own) [2](https://en.wikipedia.org/wiki/Okra) |
| Onion (*Allium cepa*) | Vegetable | Long-day | germination 14 d, 0 h, 2 d; seedling 28 d, 12 h, 3 d; vegetative 56 d, 14 h, 4 d; fruiting 56 d, 14 h, 5 d; harvest 14 d, 14 h, 14 d | [1](https://extension.umd.edu/resource/growing-onions-home-garden) [2](https://www.rhs.org.uk/vegetables/onions/grow-your-own) |
| Parsnip (*Pastinaca sativa*) | Vegetable | Day-neutral | germination 21 d, 0 h, 2 d; seedling 21 d, 12 h, 3 d; vegetative 56 d, 14 h, 5 d; fruiting 70 d, 12 h, 6 d; harvest 14 d, 12 h, 10 d | [1](https://www.rhs.org.uk/vegetables/parsnips) |
| Peanut (*Arachis hypogaea*) | Legume | Day-neutral | germination 8 d, 0 h, 3 d; seedling 14 d, 16 h, 3 d; vegetative 35 d, 16 h, 4 d; flowering 25 d, 14 h, 3 d; fruiting 60 d, 14 h, 3 d; harvest 15 d, 12 h, 6 d | [1](https://en.wikipedia.org/wiki/Peanut) |
| Pigeon pea (*Cajanus cajan*) | Legume | Short-day | germination 8 d, 0 h, 3 d; seedling 14 d, 16 h, 4 d; vegetative 60 d, 16 h, 5 d; flowering 30 d, 12 h, 3 d; fruiting 60 d, 12 h, 3 d; harvest 20 d, 12 h, 7 d | [1](https://en.wikipedia.org/wiki/Pigeon_pea) |
| Pole bean (*Phaseolus vulgaris*) | Legume | Day-neutral | germination 7 d, 0 h, 2 d; seedling 12 d, 16 h, 3 d; vegetative 30 d, 16 h, 3 d; flowering 12 d, 14 h, 2 d; fruiting 18 d, 14 h, 2 d; harvest 30 d, 12 h, 4 d | [1](https://hort.purdue.edu/newcrop/duke_energy/Phaseolus_vulgaris.html) |
| Potato (*Solanum tuberosum*) | Vegetable | Short-day | germination 28 d, 0 h, 5 d; seedling 21 d, 14 h, 3 d; vegetative 28 d, 14 h, 3 d; flowering 14 d, 12 h, 2 d; fruiting 35 d, 12 h, 3 d; harvest 7 d, 12 h, 10 d | [1](https://extension.umd.edu/resource/growing-potatoes-home-garden) [2](https://www.rhs.org.uk/vegetables/potatoes/grow-your-own) |
| Pumpkin (*Cucurbita pepo*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 35 d, 14 h, 3 d; flowering 20 d, 14 h, 3 d; fruiting 50 d, 14 h, 3 d; harvest 21 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/pumpkins/grow-your-own) |
| Radish (*Raphanus sativus*) | Vegetable | Long-day | germination 4 d, 0 h, 1 d; seedling 7 d, 12 h, 1 d; vegetative 10 d, 12 h, 2 d; fruiting 10 d, 12 h, 2 d; harvest 3 d, 12 h, 3 d | [1](https://extension.umd.edu/resource/growing-radishes-home-garden) |
| Runner bean (*Phaseolus coccineus*) | Legume | Day-neutral | germination 10 d, 0 h, 2 d; seedling 14 d, 16 h, 2 d; vegetative 35 d, 16 h, 2 d; flowering 14 d, 14 h, 2 d; fruiting 21 d, 14 h, 2 d; harvest 30 d, 12 h, 3 d | [1](https://www.rhs.org.uk/vegetables/runner-beans/grow-your-own) |
| Rutabaga (swede) (*Brassica napus subsp. rapifera*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 14 d, 12 h, 2 d; vegetative 42 d, 13 h, 4 d; fruiting 70 d, 12 h, 4 d; harvest 14 d, 12 h, 7 d | [1](https://www.rhs.org.uk/vegetables/swede/grow-your-own) |
| Shallot (*Allium cepa Aggregatum Group*) | Vegetable | Long-day | germination 14 d, 0 h, 5 d; seedling 21 d, 12 h, 4 d; vegetative 42 d, 14 h, 5 d; fruiting 42 d, 14 h, 6 d; harvest 14 d, 14 h, 14 d | [1](https://www.rhs.org.uk/vegetables/shallots/grow-your-own) |
| Snow pea (*Pisum sativum var. saccharatum*) | Legume | Long-day | germination 8 d, 0 h, 2 d; seedling 12 d, 15 h, 3 d; vegetative 25 d, 16 h, 3 d; flowering 10 d, 16 h, 2 d; fruiting 12 d, 16 h, 2 d; harvest 14 d, 14 h, 3 d | [1](https://en.wikipedia.org/wiki/Photoperiodism) |
| Soybean (edamame) (*Glycine max*) | Legume | Short-day | germination 7 d, 0 h, 2 d; seedling 10 d, 16 h, 3 d; vegetative 30 d, 16 h, 3 d; flowering 14 d, 12 h, 2 d; fruiting 45 d, 12 h, 2 d; harvest 20 d, 12 h, 5 d | [1](https://en.wikipedia.org/wiki/Soybean) [2](https://en.wikipedia.org/wiki/Photoperiodism) |
| Spinach (*Spinacia oleracea*) | Vegetable | Long-day | germination 7 d, 0 h, 1 d; seedling 14 d, 12 h, 2 d; vegetative 21 d, 12 h, 2 d; harvest 21 d, 12 h, 2 d | [1](https://www.rhs.org.uk/vegetables/spinach/grow-your-own) |
| Sugar snap pea (*Pisum sativum var. macrocarpon*) | Legume | Long-day | germination 8 d, 0 h, 2 d; seedling 12 d, 15 h, 3 d; vegetative 28 d, 16 h, 3 d; flowering 10 d, 16 h, 2 d; fruiting 18 d, 16 h, 2 d; harvest 14 d, 14 h, 3 d | [1](https://en.wikipedia.org/wiki/Photoperiodism) |
| Sweet corn (*Zea mays*) | Vegetable | Day-neutral | germination 8 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 35 d, 14 h, 2 d; flowering 14 d, 14 h, 2 d; fruiting 21 d, 14 h, 2 d; harvest 10 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/sweetcorn/grow-your-own) |
| Sweet pepper (*Capsicum annuum*) | Vegetable | Day-neutral | germination 12 d, 0 h, 1 d; seedling 40 d, 16 h, 2 d; vegetative 30 d, 16 h, 3 d; flowering 25 d, 14 h, 3 d; fruiting 50 d, 14 h, 2 d; harvest 40 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/aubergines/grow-your-own) |
| Sweet potato (*Ipomoea batatas*) | Vegetable | Short-day | germination 21 d, 0 h, 3 d; seedling 14 d, 12 h, 2 d; vegetative 42 d, 13 h, 3 d; fruiting 60 d, 12 h, 3 d; harvest 7 d, 12 h, 10 d | [1](https://www.rhs.org.uk/vegetables/sweet-potatoes/grow-your-own) |
| Swiss chard (*Beta vulgaris subsp. vulgaris*) | Vegetable | Day-neutral | germination 10 d, 0 h, 1 d; seedling 21 d, 14 h, 2 d; vegetative 35 d, 14 h, 3 d; harvest 60 d, 14 h, 3 d | [1](https://www.rhs.org.uk/vegetables/chard/grow-your-own) |
| Tomatillo (*Physalis philadelphica*) | Vegetable | Day-neutral | germination 8 d, 0 h, 1 d; seedling 35 d, 16 h, 2 d; vegetative 30 d, 16 h, 3 d; flowering 20 d, 14 h, 3 d; fruiting 50 d, 14 h, 3 d; harvest 30 d, 14 h, 4 d | [1](https://en.wikipedia.org/wiki/Tomatillo) |
| Tomato (*Solanum lycopersicum*) | Vegetable | Day-neutral | germination 8 d, 0 h, 1 d; seedling 30 d, 16 h, 2 d; vegetative 25 d, 16 h, 2 d; flowering 20 d, 14 h, 2 d; fruiting 45 d, 14 h, 1 d; harvest 30 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/tomatoes/grow-your-own) |
| Turnip (*Brassica rapa subsp. rapa*) | Vegetable | Day-neutral | germination 5 d, 0 h, 1 d; seedling 10 d, 12 h, 2 d; vegetative 18 d, 13 h, 3 d; fruiting 21 d, 12 h, 3 d; harvest 7 d, 12 h, 5 d | [1](https://www.rhs.org.uk/vegetables/turnips/grow-your-own) |
| Watercress (*Nasturtium officinale*) | Vegetable | Long-day | germination 7 d, 0 h, 1 d; seedling 14 d, 14 h, 1 d; vegetative 28 d, 14 h, 1 d; harvest 21 d, 14 h, 1 d | [1](https://en.wikipedia.org/wiki/Watercress) |
| Watermelon (*Citrullus lanatus*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 30 d, 16 h, 3 d; flowering 20 d, 16 h, 3 d; fruiting 45 d, 16 h, 3 d; harvest 14 d, 14 h, 5 d | [1](https://en.wikipedia.org/wiki/Watermelon) |
| Zucchini (*Cucurbita pepo*) | Vegetable | Day-neutral | germination 7 d, 0 h, 1 d; seedling 21 d, 16 h, 2 d; vegetative 21 d, 14 h, 2 d; flowering 14 d, 14 h, 2 d; fruiting 30 d, 14 h, 2 d; harvest 40 d, 14 h, 2 d | [1](https://www.rhs.org.uk/vegetables/courgettes/grow-your-own) |

## Verification

- `tests/components/grow_light/test_schedule.py`: the on-hours window, including across midnight.
- `tests/components/grow_light/test_plants.py`: stage counting from the sowing day, every catalogue
  entry valid with a bundled photo, and the crops grown at home present.
- `tests/components/grow_light/test_init.py`, `test_crop.py`, `test_config_flow.py`: start-up, door
  pause and resume, door closed outside the hours, end of the window, schedule switch off,
  germination keeping the light off, seedling hours, the stage change turning the light on, the
  pump watering when due and stopping after the run, the Watered button, own watering days, and the
  setup step. Run on Linux; see `ROADMAP.md` for the latest result.
- Not yet seen in a running build with a real plug, door sensor and pump.
