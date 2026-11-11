import {
  mdiClockOutline,
  mdiCallSplit,
  mdiRepeat,
  mdiSwapHorizontal,
  mdiTimerSand,
  mdiWeatherSunsetDown,
} from "@mdi/js";
import { assert, type } from "superstruct";
import { modeText } from "../../common/language-mode/language-mode";
import type { LocalizeFunc } from "../../common/translations/localize";
import { baseTriggerStruct } from "../../panels/config/automation/structs";
import { scriptConfigStruct } from "../../panels/config/script/script-config-struct";
import { baseActionStruct } from "../../data/script";
import type { StartingPoint } from "./ha-starting-points";

export type AutomationStartingPointId =
  "sunset" | "daily" | "state" | "delay" | "choose" | "repeat";

export type ScriptStartingPointId =
  "notify" | "wait_sunset" | "wait_state" | "delay" | "choose" | "repeat";

export interface AutomationStartingPointConfig {
  alias: string;
  triggers: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

export interface ScriptStartingPointConfig {
  alias: string;
  sequence: Record<string, unknown>[];
}

interface StartingPointDefinition<Id extends string, Config> {
  id: Id;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  /** Builds the configuration; the alias and message text are localized. */
  build: (localize: LocalizeFunc) => Config;
}

const PREFIX = "ui.components.starting_points.";

export const AUTOMATION_STARTING_POINT_HEADING_KEY = `${PREFIX}automation_heading`;
export const SCRIPT_STARTING_POINT_HEADING_KEY = `${PREFIX}script_heading`;
const MESSAGE_KEY = `${PREFIX}notification_message`;

const text = (localize: LocalizeFunc, key: string): string =>
  modeText(localize as any, key as any);

const notify = (localize: LocalizeFunc): Record<string, unknown> => ({
  action: "persistent_notification.create",
  data: {
    title: text(localize, `${PREFIX}notification_title`),
    message: text(localize, MESSAGE_KEY),
  },
});

const delayStep = (
  duration: Record<string, number>
): Record<string, unknown> => ({ delay: duration });

/** Steps that wait, then tell the person. They name no entity. */
const delayThenNotify = (localize: LocalizeFunc) => [
  delayStep({ minutes: 5 }),
  notify(localize),
];

const chooseStep = (localize: LocalizeFunc): Record<string, unknown> => ({
  choose: [
    {
      conditions: [{ condition: "time", after: "12:00:00" }],
      sequence: [notify(localize)],
    },
  ],
  default: [notify(localize)],
});

const repeatStep = (): Record<string, unknown> => ({
  repeat: {
    sequence: [delayStep({ seconds: 30 })],
    until: [
      {
        condition: "template",
        value_template: "{{ repeat.index >= 3 }}",
      },
    ],
  },
});

const sunsetTrigger = (): Record<string, unknown> => ({
  trigger: "sun",
  event: "sunset",
  offset: 0,
});

// The person picks the entity in the editor; none is named here.
const stateTrigger = (): Record<string, unknown> => ({
  trigger: "state",
  entity_id: [],
});

const def = <Id extends string, Config>(
  id: Id,
  icon: string,
  build: (localize: LocalizeFunc) => Config,
  kind: "automation" | "script"
): StartingPointDefinition<Id, Config> => ({
  id,
  icon,
  titleKey: `${PREFIX}${kind}_${id}_title`,
  descriptionKey: `${PREFIX}${kind}_${id}_description`,
  build,
});

const automation = (
  id: AutomationStartingPointId,
  icon: string,
  trigger: () => Record<string, unknown>,
  actions: (localize: LocalizeFunc) => Record<string, unknown>[]
) =>
  def(
    id,
    icon,
    (localize): AutomationStartingPointConfig => ({
      alias: text(localize, `${PREFIX}automation_${id}_title`),
      triggers: [trigger()],
      actions: actions(localize),
    }),
    "automation"
  );

const script = (
  id: ScriptStartingPointId,
  icon: string,
  sequence: (localize: LocalizeFunc) => Record<string, unknown>[]
) =>
  def(
    id,
    icon,
    (localize): ScriptStartingPointConfig => ({
      alias: text(localize, `${PREFIX}script_${id}_title`),
      sequence: sequence(localize),
    }),
    "script"
  );

/**
 * Examples for an empty automation. None names an entity that might be
 * missing; the state example leaves the entity for the person to pick.
 */
export const AUTOMATION_STARTING_POINTS = [
  automation("sunset", mdiWeatherSunsetDown, sunsetTrigger, (l) => [notify(l)]),
  automation(
    "daily",
    mdiClockOutline,
    () => ({ trigger: "time", at: "07:00:00" }),
    (l) => [notify(l)]
  ),
  automation("state", mdiSwapHorizontal, stateTrigger, (l) => [notify(l)]),
  automation("delay", mdiTimerSand, sunsetTrigger, delayThenNotify),
  automation("choose", mdiCallSplit, sunsetTrigger, (l) => [chooseStep(l)]),
  automation("repeat", mdiRepeat, sunsetTrigger, () => [repeatStep()]),
];

/** Examples for an empty script, built the same way. */
export const SCRIPT_STARTING_POINTS = [
  script("notify", mdiClockOutline, (l) => [notify(l)]),
  script("wait_sunset", mdiWeatherSunsetDown, (l) => [
    {
      wait_for_trigger: [sunsetTrigger()],
      timeout: { hours: 24 },
      continue_on_timeout: false,
    },
    notify(l),
  ]),
  script("wait_state", mdiSwapHorizontal, (l) => [
    { wait_for_trigger: [stateTrigger()] },
    notify(l),
  ]),
  script("delay", mdiTimerSand, delayThenNotify),
  script("choose", mdiCallSplit, (l) => [chooseStep(l)]),
  script("repeat", mdiRepeat, () => [repeatStep()]),
];

const toCards = (
  items: StartingPointDefinition<string, unknown>[],
  localize: LocalizeFunc
): StartingPoint[] =>
  items.map((item) => ({
    id: item.id,
    title: text(localize, item.titleKey),
    description: text(localize, item.descriptionKey),
    icon: item.icon,
  }));

export const automationStartingPoints = (
  localize: LocalizeFunc
): StartingPoint[] => toCards(AUTOMATION_STARTING_POINTS, localize);

export const scriptStartingPoints = (localize: LocalizeFunc): StartingPoint[] =>
  toCards(SCRIPT_STARTING_POINTS, localize);

/** The configuration for a chosen automation starting point, or undefined. */
export const automationConfigForStartingPoint = (
  id: string,
  localize: LocalizeFunc
): AutomationStartingPointConfig | undefined =>
  AUTOMATION_STARTING_POINTS.find((item) => item.id === id)?.build(localize);

/** The configuration for a chosen script starting point, or undefined. */
export const scriptConfigForStartingPoint = (
  id: string,
  localize: LocalizeFunc
): ScriptStartingPointConfig | undefined =>
  SCRIPT_STARTING_POINTS.find((item) => item.id === id)?.build(localize);

// Loose versions of the existing structs: they check the shared fields of a
// trigger and of an action and ignore the fields each kind adds.
const triggerShape = type(baseTriggerStruct.schema);
const actionShape = type(baseActionStruct.schema);
/**
 * Throws when the configuration is not valid for an automation (a non-empty
 * list of triggers and of actions, each with the shared fields) or for a
 * script (checked with the script config struct).
 */
export const validateStartingPointConfig = (
  kind: "automation" | "script",
  config: AutomationStartingPointConfig | ScriptStartingPointConfig
): void => {
  if (kind === "script") {
    const { sequence } = config as ScriptStartingPointConfig;
    assert(config, scriptConfigStruct);
    if (!sequence.length) {
      throw new Error("A script starting point needs at least one step");
    }
    for (const step of sequence) {
      assert(step, actionShape);
    }
    return;
  }
  const { alias, triggers, actions } = config as AutomationStartingPointConfig;
  if (!alias || !triggers.length || !actions.length) {
    throw new Error("An automation starting point needs all three parts");
  }
  for (const trigger of triggers) {
    assert(trigger, triggerShape);
  }
  for (const action of actions) {
    assert(action, actionShape);
  }
};
