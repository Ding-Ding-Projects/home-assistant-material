import {
  mdiClockOutline,
  mdiFormatListNumbered,
  mdiLightbulbOutline,
  mdiWeatherSunny,
} from "@mdi/js";
import { modeText } from "../../common/language-mode/language-mode";
import type { LocalizeFunc } from "../../common/translations/localize";
import type { StartingPoint } from "./ha-starting-points";

export interface TemplateStartingPoint {
  id: string;
  /** What the card says; resolved with `localize` through `templateStartingPoints`. */
  titleKey:
    | "ui.components.starting_points.template_time_title"
    | "ui.components.starting_points.template_lights_title"
    | "ui.components.starting_points.template_sun_title"
    | "ui.components.starting_points.template_entities_title";
  descriptionKey:
    | "ui.components.starting_points.template_time_description"
    | "ui.components.starting_points.template_lights_description"
    | "ui.components.starting_points.template_sun_description"
    | "ui.components.starting_points.template_entities_description";
  icon: string;
  /** The template put into the editor. Works on any installation. */
  template: string;
}

/**
 * Examples for an empty template editor. They name no entity that might be
 * missing: they use the current time, the light domain as a whole, the sun
 * (and say so when it is not there) and the list of all entities.
 */
export const TEMPLATE_STARTING_POINTS: TemplateStartingPoint[] = [
  {
    id: "time",
    titleKey: "ui.components.starting_points.template_time_title",
    descriptionKey: "ui.components.starting_points.template_time_description",
    icon: mdiClockOutline,
    template: `It is {{ now().strftime("%H:%M") }} on {{ now().strftime("%A, %d %B %Y") }}.`,
  },
  {
    id: "lights",
    titleKey: "ui.components.starting_points.template_lights_title",
    descriptionKey: "ui.components.starting_points.template_lights_description",
    icon: mdiLightbulbOutline,
    template: `{{ states.light | selectattr("state", "eq", "on") | list | count }} of {{ states.light | list | count }} lights are on.`,
  },
  {
    id: "sun",
    titleKey: "ui.components.starting_points.template_sun_title",
    descriptionKey: "ui.components.starting_points.template_sun_description",
    icon: mdiWeatherSunny,
    template: `{% set sun = states.sun.sun %}
{% if sun is none -%}
  There is no sun entity on this system.
{%- elif sun.state == "above_horizon" -%}
  The sun is up.
{%- else -%}
  The sun is down.
{%- endif %}`,
  },
  {
    id: "entities",
    titleKey: "ui.components.starting_points.template_entities_title",
    descriptionKey:
      "ui.components.starting_points.template_entities_description",
    icon: mdiFormatListNumbered,
    template: `This system has {{ states | count }} entities in {{ states | map(attribute="domain") | unique | list | count }} domains.`,
  },
];

export const templateStartingPoints = (
  localize: LocalizeFunc
): StartingPoint[] =>
  TEMPLATE_STARTING_POINTS.map((item) => ({
    id: item.id,
    title: modeText(localize as any, item.titleKey),
    description: modeText(localize as any, item.descriptionKey),
    icon: item.icon,
  }));

/** The template for a chosen starting point, or undefined for an unknown id. */
export const templateForStartingPoint = (id: string): string | undefined =>
  TEMPLATE_STARTING_POINTS.find((item) => item.id === id)?.template;
