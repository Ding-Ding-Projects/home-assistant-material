import { notifyEditorPrefsChanged } from "./automation-editor-prefs";
import { analyseRelations } from "./trigger-relations";

/**
 * The trigger names shown as chips on the rows of gated steps. The manual
 * editor publishes them whenever the configuration changes; a row looks up
 * its own step by identity while it renders.
 */

let byStep = new WeakMap<object, string[]>();
let signature = "";

/** How many names a chip lists before it counts the rest. */
export const CHIP_NAMES_MAX = 2;

/** Works out the chips for a configuration and tells the rows if they moved. */
export const publishRelationChips = (config: unknown): void => {
  const relations = analyseRelations(config);
  const next = new WeakMap<object, string[]>();
  const parts: string[] = [];
  const total = relations.triggers.length;
  for (const step of relations.steps) {
    if (
      !step.gated ||
      !step.triggers.length ||
      step.triggers.length >= total ||
      !step.raw ||
      typeof step.raw !== "object"
    ) {
      continue;
    }
    next.set(
      step.raw,
      step.triggers.map((i) => {
        const trigger = relations.triggers[i];
        return trigger.id ?? trigger.title;
      })
    );
    parts.push(`${step.path}:${step.triggers.join(",")}`);
  }
  byStep = next;
  const nextSignature = parts.join("|");
  if (nextSignature !== signature) {
    signature = nextSignature;
    notifyEditorPrefsChanged();
  }
};

/** The names of the triggers that can reach a step, when a gate limits them. */
export const relationChipNames = (step: unknown): string[] | undefined =>
  step && typeof step === "object" ? byStep.get(step) : undefined;
