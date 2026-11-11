# Settings that explain themselves: the General page

The General page (`Settings > System > General`) explains every control it shows and lets you put most of them back to their defaults.

## What each setting shows

An information button sits beside each setting: name, country, language, time zone, currency, unit system, location and elevation. It opens the shared `ha-setting-info` panel with four plain-language parts:

- what the setting does,
- its default,
- where it takes effect (for example, the time zone reaches dates and the clock times automations run at),
- what holds the value right now.

The button has a link to the bundled help article. It opens inside the interface and never goes to an outside address.

## Reset

Name, country, language, time zone, currency, unit system and elevation show a Reset button whenever the value differs from its default. Choosing it asks first. After you confirm, the field returns to its default in the form. The change is not stored until you choose Save, and Discard still brings back the saved values. Location has no default, so it has no Reset button.

| Setting | Default |
| --- | --- |
| Name | Home |
| Country | none |
| Language | English |
| Time zone | UTC |
| Currency | EUR |
| Unit system | Metric |
| Elevation | 0 meters |

## Where it lives

- `frontend/src/panels/config/core/general-setting-help.ts` lists each setting, its translation keys, its default and its help article.
- The text is in `en.json` and `yue-own.json` under `ui.panel.config.core.section.core.general_help`.
- `frontend/test/panels/config/core/general-setting-help.test.ts` checks that every setting the page shows has an entry, that no text is empty in English or Cantonese, and that help paths are bundled articles.

## Known limit

The "Find my ISO code" link under Currency still points to an outside page. It predates this work and was left unchanged.
