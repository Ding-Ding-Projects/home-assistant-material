import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  buildQuickControls,
  DOMAIN_EDITORS,
} from "../../../src/components/action-editors/descriptors";
import type {
  QuickContext,
  QuickControl,
} from "../../../src/components/action-editors/quick-types";
import {
  CONDITION_EDITORS,
  DEVICE_EDITORS,
  TRIGGER_EDITORS,
} from "../../../src/components/automation-editors";
import {
  ALLOWED_FIELDS,
  ALLOWED_PLAIN,
  ALLOWED_SERVICES,
  ALLOWED_TRIGGER_CONDITIONS,
} from "./all-integrations.allow";

/**
 * Walks every integration folder of the bundled Core and fails when an
 * action, trigger, condition or device automation has no tailored editor, or
 * when a field of an action is drawn as plain text although its meaning has a
 * proper control. Exceptions are listed by hand, each with a reason, in
 * `all-integrations.allow.ts`.
 */

const components = resolve(
  __dirname,
  "../../../../core/homeassistant/components"
);

interface YamlField {
  selector?: Record<string, unknown> | null;
  fields?: Record<string, YamlField>;
  default?: unknown;
  required?: boolean;
}

const unreadable: string[] = [];

const readDoc = (file: string): Record<string, any> => {
  const text = readFileSync(file, "utf8");
  if (text.trim() === "") return {};
  try {
    const doc = load(text);
    return doc && typeof doc === "object" ? (doc as Record<string, any>) : {};
  } catch (err) {
    // A file holding only comments has no document.
    if (/expected a document/.test(String(err))) return {};
    unreadable.push(`${file}: ${String(err).slice(0, 120)}`);
    return {};
  }
};

/** Every field with the section it sits in, when it sits in one. */
const flatten = (
  fields: Record<string, YamlField> | undefined,
  section?: string
): [string, YamlField, string | undefined][] =>
  Object.entries(fields ?? {}).flatMap(([key, field]) =>
    field?.fields && !field.selector
      ? flatten(field.fields, key)
      : [[key, field, section] as [string, YamlField, string | undefined]]
  );

/** Keys the service control draws itself, outside the tailored editors. */
const PICKER_KEYS = new Set(["entity_id", "device_id", "area_id"]);

const folders = existsSync(components)
  ? readdirSync(components, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith("_") &&
          !entry.name.startsWith(".")
      )
      .map((entry) => entry.name)
      .sort()
  : [];

const entries = (file: string): string[] =>
  existsSync(file)
    ? Object.keys(readDoc(file)).filter((key) => !key.startsWith("."))
    : [];

interface Folder {
  name: string;
  services: string[];
  triggers: string[];
  conditions: string[];
  device: string[];
  configFlow: boolean;
}

const inventory: Folder[] = folders.map((name) => {
  const dir = resolve(components, name);
  return {
    name,
    services: entries(resolve(dir, "services.yaml")),
    triggers: entries(resolve(dir, "triggers.yaml")),
    conditions: entries(resolve(dir, "conditions.yaml")),
    device: (["trigger", "condition", "action"] as const).filter((kind) =>
      existsSync(resolve(dir, `device_${kind}.py`))
    ),
    configFlow: existsSync(resolve(dir, "config_flow.py")),
  };
});

const serviceFields = (folder: string, service: string) =>
  flatten(
    readDoc(resolve(components, folder, "services.yaml"))[service]?.fields
  );

const buildControls = (folder: string, service: string): QuickControl[] => {
  const doc = readDoc(resolve(components, folder, "services.yaml"));
  const fields = flatten(doc[service]?.fields);
  const ctx: QuickContext = {
    action: `${folder}.${service}`,
    data: {},
    fields: Object.fromEntries(
      fields.map(([key, field]) => [
        key,
        {
          selector: (field?.selector ?? null) as Record<string, unknown> | null,
          required: field?.required,
          default: field?.default,
        },
      ])
    ),
    domainServices: entries(resolve(components, folder, "services.yaml")),
    entities: [],
  };
  return buildQuickControls(ctx);
};

const hasService = (folder: string, service: string): boolean => {
  const editor = DOMAIN_EDITORS[folder];
  return (
    editor !== undefined &&
    (service in editor.controls || "*" in editor.controls)
  );
};

/** What kind of control a selector type needs, or undefined when any will do. */
const expectedKinds = (type: string): string[] | undefined => {
  switch (type) {
    case "color_rgb":
    case "color_temp":
      return ["color", "swatches", "selector", "slider", "stepper"];
    case "time":
      // A time selector that holds a length of time is drawn as a duration.
      return ["time", "selector", "duration"];
    case "date":
      return ["date", "selector"];
    case "datetime":
      return ["datetime", "selector"];
    case "duration":
      return ["duration", "selector", "slider", "stepper"];
    case "entity":
      return ["entities", "selector"];
    case "device":
    case "area":
    case "config_entry":
    case "icon":
    case "media":
    case "location":
    case "language":
    case "country":
      return ["selector"];
    default:
      return undefined;
  }
};

/** Key names that mean a proper control even when the selector is plain text. */
const NAME_MEANINGS: [RegExp, string][] = [
  [/(^|_)(color|colour)(_|$)/, "colour"],
  [/(^|_)(time|start_time|end_time)$/, "time"],
  [/(^|_)date$/, "date"],
  [/(^|_)(datetime|date_time)$/, "date and time"],
  [/(^|_)duration$/, "duration"],
  [/(^|_)icon$/, "icon"],
  [/(^|_)(location|gps|coordinates)$/, "location"],
  [/(^|_)(entity|entities)$/, "entity"],
  [/(^|_)device(_id)?$/, "device"],
  [/(^|_)area(_id)?$/, "area"],
  [/(^|_)(media|media_id|media_content_id)$/, "media"],
];

const secretName = /(^|_)(password|passcode|pin|secret|token|code)$/;

const kindOf = (controls: QuickControl[], key: string) =>
  controls.find((control) => control.key === key);

const totals = {
  folders: folders.length,
  services: 0,
  fields: 0,
  triggers: 0,
  conditions: 0,
  device: 0,
  allowedServices: 0,
  allowedFields: 0,
  allowedPlain: 0,
  allowedTriggerConditions: 0,
  selectorRows: 0,
  plainByNature: 0,
};

describe("every integration folder of Core", () => {
  it("finds the integration folders and reads every yaml file", () => {
    if (!existsSync(components)) return;
    expect(folders.length).toBeGreaterThan(1000);
    expect(unreadable).toEqual([]);
  });

  it("has a tailored editor for every service of every services.yaml", () => {
    const missing: string[] = [];
    inventory.forEach((folder) => {
      folder.services.forEach((service) => {
        totals.services += 1;
        const id = `${folder.name}.${service}`;
        if (hasService(folder.name, service)) return;
        if (id in ALLOWED_SERVICES) {
          totals.allowedServices += 1;
          return;
        }
        missing.push(id);
      });
    });
    expect(missing).toEqual([]);
  });

  it("gives every field a control, never plain text where a proper one exists", () => {
    const noControl: string[] = [];
    const plain: string[] = [];
    inventory.forEach((folder) => {
      folder.services.forEach((service) => {
        if (!hasService(folder.name, service)) return;
        const controls = buildControls(folder.name, service);
        serviceFields(folder.name, service).forEach(([key, field, section]) => {
          totals.fields += 1;
          const id = `${folder.name}.${service}.${key}`;
          if (PICKER_KEYS.has(key)) return;
          const control =
            kindOf(controls, key) ??
            (section ? kindOf(controls, section) : undefined);
          const type = Object.keys(field?.selector ?? {})[0];
          if (!control) {
            // Without a tailored control the service control draws the field
            // with its own selector. That is a real control for every type
            // except plain text, an object box or no selector at all.
            const drawn =
              type !== undefined && type !== "text" && type !== "object";
            const meaning = NAME_MEANINGS.find(([re]) => re.test(key));
            const secret =
              secretName.test(key) &&
              (field?.selector as any)?.text?.type !== "password";
            if (drawn) {
              totals.selectorRows += 1;
              return;
            }
            if (!meaning && !secret && type !== undefined) {
              totals.plainByNature += 1;
              return;
            }
            if (id in ALLOWED_FIELDS) {
              totals.allowedFields += 1;
              return;
            }
            noControl.push(
              `${id} (${type ?? "no selector"}${meaning ? `, reads as ${meaning[1]}` : secret ? ", reads as a secret" : ""})`
            );
            return;
          }
          const wanted = type ? expectedKinds(type) : undefined;
          const byName = NAME_MEANINGS.find(([re]) => re.test(key));
          const isPlain = control.kind === "text";
          const wrong =
            (wanted && !wanted.includes(control.kind)) ||
            (isPlain && byName !== undefined) ||
            (isPlain &&
              secretName.test(key) &&
              (control as { inputType?: string }).inputType !== "password" &&
              type !== "number");
          if (wrong) {
            if (id in ALLOWED_PLAIN) {
              totals.allowedPlain += 1;
              return;
            }
            plain.push(`${id} (${type ?? "no selector"} -> ${control.kind})`);
          }
        });
      });
    });
    expect(noControl).toEqual([]);
    expect(plain).toEqual([]);
  }, 120000);

  it("has an editor for every trigger and condition", () => {
    const missing: string[] = [];
    inventory.forEach((folder) => {
      folder.triggers.forEach((name) => {
        totals.triggers += 1;
        const id = `${folder.name}.${name}`;
        if (TRIGGER_EDITORS[id]) return;
        if (`trigger:${id}` in ALLOWED_TRIGGER_CONDITIONS) {
          totals.allowedTriggerConditions += 1;
          return;
        }
        missing.push(`trigger ${id}`);
      });
      folder.conditions.forEach((name) => {
        totals.conditions += 1;
        const id = `${folder.name}.${name}`;
        if (CONDITION_EDITORS[id]) return;
        if (`condition:${id}` in ALLOWED_TRIGGER_CONDITIONS) {
          totals.allowedTriggerConditions += 1;
          return;
        }
        missing.push(`condition ${id}`);
      });
    });
    expect(missing).toEqual([]);
  });

  it("has an entry for every device trigger, condition and action file", () => {
    const missing: string[] = [];
    inventory.forEach((folder) => {
      folder.device.forEach((kind) => {
        totals.device += 1;
        if (!DEVICE_EDITORS[`${folder.name}.${kind}`]) {
          missing.push(`${folder.name}.${kind}`);
        }
      });
    });
    expect(missing).toEqual([]);
  });

  it("accounts for every folder and prints the totals", () => {
    const none = inventory.filter(
      (folder) =>
        folder.services.length === 0 &&
        folder.triggers.length === 0 &&
        folder.conditions.length === 0 &&
        folder.device.length === 0 &&
        !folder.configFlow
    );
    const withWork = inventory.length - none.length;
    const lines = [
      "",
      "All integrations coverage",
      `  integration folders:            ${totals.folders}`,
      `  with actions, triggers, conditions, device automations or a setup flow: ${withWork}`,
      `  with none of those:             ${none.length}`,
      `  services (services.yaml):       ${totals.services}`,
      `  service fields checked:         ${totals.fields}`,
      `    drawn by their own selector (no tailored control needed): ${totals.selectorRows}`,
      `    plain text by nature (names, messages, ids):    ${totals.plainByNature}`,
      `  triggers:                       ${totals.triggers}`,
      `  conditions:                     ${totals.conditions}`,
      `  device automation files:        ${totals.device}`,
      `  allow-listed services:          ${totals.allowedServices}`,
      `  allow-listed fields:            ${totals.allowedFields}`,
      `  allow-listed plain controls:    ${totals.allowedPlain}`,
      `  allow-listed triggers/conditions: ${totals.allowedTriggerConditions}`,
      `  folders without actions, triggers, conditions or setup flow: ${none
        .map((folder) => folder.name)
        .join(", ")}`,
      "",
    ];
    process.stdout.write(lines.join("\n"));
    expect(withWork + none.length).toBe(totals.folders);
  });
});
