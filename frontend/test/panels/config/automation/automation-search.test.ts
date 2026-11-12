import { describe, expect, it } from "vitest";
import type {
  SearchResolver,
  SearchStep,
} from "../../../../src/panels/config/automation/search/automation-search";
import {
  ancestorsOf,
  entitiesInTemplate,
  filterListItems,
  flattenAutomation,
  searchSteps,
  subtreeMatches,
  summarizeEntities,
} from "../../../../src/panels/config/automation/search/automation-search";

// Protects the search of the automation editor: every step is found at every
// nesting depth, a match keeps its ancestors, entities are collected from
// fields, targets and templates, a bad pattern never runs, and reading the
// configuration never changes it.

const RESOLVER: SearchResolver = {
  describe: (kind, item) =>
    kind === "action" && item.action === "light.turn_on"
      ? "Turn on light"
      : undefined,
  typeLabel: (kind, item) => {
    if (kind === "action" && "choose" in item) {
      return "Choose";
    }
    if (kind === "action" && "repeat" in item) {
      return "Repeat";
    }
    if (kind === "condition" && item.condition === "template") {
      return "Template";
    }
    return undefined;
  },
  entityTexts: (entityId) =>
    entityId === "light.kitchen"
      ? ["Kitchen ceiling", "Kitchen", "Ground floor"]
      : [],
  deviceTexts: (id) => (id === "dev1" ? ["Hallway sensor"] : []),
  areaTexts: (id) => (id === "area1" ? ["Garden"] : []),
  labelTexts: (id) => (id === "lbl1" ? ["Holiday"] : []),
  serviceTexts: (service) =>
    service === "light.turn_on" ? ["Turn on", "Light: Turn on"] : [],
  entityRegistryId: (id) =>
    id === "reg-uuid-1" ? "binary_sensor.door" : undefined,
  entityExists: (id) => id !== "sensor.gone",
};

const makeConfig = () => ({
  alias: "Evening",
  triggers: [
    { trigger: "state", entity_id: "binary_sensor.motion", to: "on" },
    { trigger: "state", entity_id: ["sensor.temp", "sensor.gone"] },
    // A device trigger keeps an entity registry id.
    { trigger: "device", device_id: "dev1", entity_id: "reg-uuid-1" },
  ],
  conditions: [
    {
      condition: "or",
      conditions: [
        { condition: "state", entity_id: "input_boolean.guest", state: "on" },
        {
          condition: "not",
          conditions: [
            {
              condition: "template",
              value_template:
                "{{ is_state('person.alice', 'home') and states.sun.sun.state == 'x' }}",
            },
          ],
        },
      ],
    },
  ],
  actions: [
    {
      alias: "Pick a scene",
      choose: [
        {
          alias: "Bright",
          conditions: [
            { condition: "numeric_state", entity_id: "sensor.lux", below: 5 },
          ],
          sequence: [
            {
              action: "light.turn_on",
              target: {
                entity_id: "light.kitchen",
                area_id: "area1",
                label_id: "lbl1",
              },
              data: { brightness_pct: 80, effect: "rainbow" },
            },
          ],
        },
        { conditions: [], sequence: [{ delay: { seconds: 5 } }] },
      ],
      default: [{ action: "notify.send", data: { message: "default branch" } }],
    },
    {
      if: [{ condition: "state", entity_id: "input_number.mode", state: "2" }],
      then: [
        { action: "script.turn_on", target: { entity_id: "script.then_one" } },
      ],
      else: [
        {
          repeat: {
            count: 3,
            sequence: [
              { action: "switch.toggle", target: { entity_id: "switch.deep" } },
            ],
          },
        },
      ],
    },
    {
      parallel: [
        { action: "light.turn_off", target: { entity_id: "light.parallel" } },
        {
          sequence: [
            { wait_template: "{{ states('sensor.waited') == 'ok' }}" },
          ],
        },
      ],
    },
    {
      wait_for_trigger: [
        { trigger: "state", entity_id: "binary_sensor.wait_trigger", to: "on" },
      ],
    },
    {
      repeat: {
        while: [
          { condition: "state", entity_id: "input_boolean.loop", state: "on" },
        ],
        sequence: [
          {
            action: "persistent_notification.create",
            data: { message: "{{ state_attr('sensor.attr', 'unit') }}" },
          },
        ],
      },
    },
    { condition: "state", entity_id: "input_boolean.guard", state: "off" },
  ],
});

type Config = ReturnType<typeof makeConfig>;

const find = (steps: SearchStep[], path: string) => {
  const step = steps.find((entry) => entry.path === path);
  if (!step) throw new Error(`no step at ${path}`);
  return step;
};

describe("flattenAutomation", () => {
  const config = makeConfig();
  const flat = flattenAutomation(config, RESOLVER);
  const paths = flat.steps.map((step) => step.path);

  it("reaches every nesting form with an address", () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        "triggers[0]",
        "triggers[2]",
        "conditions[0]",
        "conditions[0].conditions[0]",
        "conditions[0].conditions[1]",
        "conditions[0].conditions[1].conditions[0]",
        "actions[0]",
        "actions[0].choose[0]",
        "actions[0].choose[0].conditions[0]",
        "actions[0].choose[0].sequence[0]",
        "actions[0].choose[1].sequence[0]",
        "actions[0].default",
        "actions[0].default[0]",
        "actions[1].if[0]",
        "actions[1].then[0]",
        "actions[1].else[0]",
        "actions[1].else[0].repeat.sequence[0]",
        "actions[2].parallel[0]",
        "actions[2].parallel[1]",
        "actions[2].parallel[1].sequence[0]",
        "actions[3].wait_for_trigger[0]",
        "actions[4].repeat.while[0]",
        "actions[4].repeat.sequence[0]",
        "actions[5]",
      ])
    );
  });

  it("gives each step its kind and parent", () => {
    expect(find(flat.steps, "actions[0].choose[0]").kind).toBe("option");
    expect(find(flat.steps, "actions[0].default").kind).toBe("default");
    expect(find(flat.steps, "actions[3].wait_for_trigger[0]").kind).toBe(
      "trigger"
    );
    expect(find(flat.steps, "actions[4].repeat.while[0]").kind).toBe(
      "condition"
    );
    const deep = find(flat.steps, "actions[1].else[0].repeat.sequence[0]");
    expect(ancestorsOf(deep).map((step) => step.path)).toEqual([
      "actions[1].else[0]",
      "actions[1]",
    ]);
    expect(deep.depth).toBe(2);
  });

  it("finds a step by the object a row shows", () => {
    const option = config.actions[0].choose![1];
    expect(flat.byItem.get(option)?.path).toBe("actions[0].choose[1]");
    expect(flat.byItem.get(config.actions[0].default as object)?.kind).toBe(
      "default"
    );
  });

  it("reads a script, which keeps its steps under sequence", () => {
    const script = flattenAutomation(
      {
        sequence: [
          { action: "light.turn_on" },
          { if: [], then: [{ delay: 1 }] },
        ],
      },
      RESOLVER
    );
    expect(script.steps.map((step) => step.path)).toEqual([
      "sequence[0]",
      "sequence[1]",
      "sequence[1].then[0]",
    ]);
  });

  it("reads the singular keys older files use", () => {
    const old = flattenAutomation(
      {
        trigger: [{ platform: "state", entity_id: "a.b" }],
        condition: [{ condition: "state", entity_id: "a.c" }],
        action: [{ action: "x.y" }],
      },
      RESOLVER
    );
    expect(old.steps.map((step) => step.path)).toEqual([
      "triggers[0]",
      "conditions[0]",
      "actions[0]",
    ]);
  });

  it("keeps nested text out of the parent step", () => {
    const parent = find(flat.steps, "actions[0]");
    expect(parent.fields.join("|")).not.toContain("rainbow");
    expect(parent.fields.join("|")).not.toContain("light.kitchen");
    const leaf = find(flat.steps, "actions[0].choose[0].sequence[0]");
    expect(leaf.fields).toContain("rainbow");
    expect(leaf.fields).toContain("80");
  });

  it("returns nothing for an empty or missing configuration", () => {
    expect(flattenAutomation(undefined).steps).toEqual([]);
    expect(flattenAutomation({}).steps).toEqual([]);
  });

  it("does not change the configuration it reads", () => {
    const frozen = makeConfig();
    const snapshot = JSON.stringify(frozen);
    const deepFreeze = (value: unknown) => {
      if (value && typeof value === "object") {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
    };
    deepFreeze(frozen);
    const result = flattenAutomation(frozen, RESOLVER);
    searchSteps(result, { query: "light", entityIds: ["light.kitchen"] });
    summarizeEntities(result, RESOLVER.entityExists);
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });
});

describe("entities of a step", () => {
  const flat = flattenAutomation(makeConfig(), RESOLVER);
  const entitiesOf = (path: string) =>
    find(flat.steps, path)
      .entities.map((entity) => entity.entityId)
      .sort();

  it("reads entity_id as a string, a list and a registry id", () => {
    expect(entitiesOf("triggers[0]")).toEqual(["binary_sensor.motion"]);
    expect(entitiesOf("triggers[1]")).toEqual(["sensor.gone", "sensor.temp"]);
    expect(entitiesOf("triggers[2]")).toEqual(["binary_sensor.door"]);
  });

  it("reads a target", () => {
    expect(entitiesOf("actions[0].choose[0].sequence[0]")).toEqual([
      "light.kitchen",
    ]);
  });

  it("keeps the entities of nested steps with the nested steps", () => {
    expect(entitiesOf("actions[1]")).toEqual([]);
    expect(entitiesOf("actions[1].else[0].repeat.sequence[0]")).toEqual([
      "switch.deep",
    ]);
  });

  it("finds entities in templates and labels them", () => {
    const template = find(
      flat.steps,
      "conditions[0].conditions[1].conditions[0]"
    );
    expect(template.entities).toEqual(
      expect.arrayContaining([
        { entityId: "person.alice", fromTemplate: true },
        { entityId: "sun.sun", fromTemplate: true },
      ])
    );
    expect(
      find(flat.steps, "actions[2].parallel[1].sequence[0]").entities
    ).toEqual([{ entityId: "sensor.waited", fromTemplate: true }]);
    expect(find(flat.steps, "actions[4].repeat.sequence[0]").entities).toEqual([
      { entityId: "sensor.attr", fromTemplate: true },
    ]);
  });

  it("lets a direct mention win over a template mention", () => {
    const direct = flattenAutomation(
      {
        actions: [
          {
            action: "x.y",
            target: { entity_id: "light.a" },
            data: { message: "{{ states('light.a') }}" },
          },
        ],
      },
      RESOLVER
    );
    expect(direct.steps[0].entities).toEqual([
      { entityId: "light.a", fromTemplate: false },
    ]);
  });

  it("finds each form of template access", () => {
    expect(
      entitiesInTemplate(
        "{{ states('a.one') }}{{ is_state('a.two','x') }}{{ state_attr(\"a.three\",'u') }}{{ states.a.four.state }}{{ states['a.five'] }}"
      ).sort()
    ).toEqual(["a.five", "a.four", "a.one", "a.three", "a.two"]);
    expect(entitiesInTemplate("states('a.one')")).toEqual([]);
    expect(entitiesInTemplate("{{ states('domain') }}")).toEqual([]);
  });

  it("scans a long template without running long", () => {
    const text = `{{ ${"states('a.b') ".repeat(200000)} }}`;
    const started = Date.now();
    expect(entitiesInTemplate(text)).toEqual(["a.b"]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("counts the steps that use each entity and marks the missing ones", () => {
    const summary = summarizeEntities(flat, RESOLVER.entityExists);
    const gone = summary.find((entity) => entity.entityId === "sensor.gone");
    expect(gone).toMatchObject({ count: 1, missing: true });
    const alice = summary.find((entity) => entity.entityId === "person.alice");
    expect(alice).toMatchObject({ fromTemplateOnly: true, missing: false });
    const kitchen = summary.find(
      (entity) => entity.entityId === "light.kitchen"
    );
    expect(kitchen?.fromTemplateOnly).toBe(false);
  });
});

describe("searchSteps", () => {
  const config: Config = makeConfig();
  const flat = flattenAutomation(config, RESOLVER);
  const matchedPaths = (query: string, entityIds: string[] = []) =>
    searchSteps(flat, { query, entityIds }).matches.map((step) => step.path);

  it("is not active without a query or a filter", () => {
    const result = searchSteps(flat, { query: "  ", entityIds: [] });
    expect(result.active).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it("matches plain text ignoring case, in values, aliases and descriptions", () => {
    expect(matchedPaths("RAINBOW")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("pick a scene")).toEqual(["actions[0]"]);
    expect(matchedPaths("bright")).toEqual(["actions[0].choose[0]"]);
    expect(matchedPaths("turn on light")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
  });

  it("matches the type of a step", () => {
    expect(matchedPaths("repeat")).toEqual([
      "actions[1].else[0]",
      "actions[4]",
    ]);
  });

  it("matches friendly names, devices, areas and labels", () => {
    expect(matchedPaths("kitchen ceiling")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("hallway sensor")).toEqual(["triggers[2]"]);
    expect(matchedPaths("garden")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("holiday")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
  });

  it("matches service names and entity ids", () => {
    expect(matchedPaths("light: turn on")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("input_number.mode")).toEqual(["actions[1].if[0]"]);
  });

  it("matches template text and entities named in a template", () => {
    expect(matchedPaths("is_state")).toEqual([
      "conditions[0].conditions[1].conditions[0]",
    ]);
    expect(matchedPaths("person.alice")).toEqual([
      "conditions[0].conditions[1].conditions[0]",
    ]);
  });

  it("matches the text of a condition written as a template string", () => {
    const withString = flattenAutomation(
      {
        actions: [
          { if: ["{{ is_state('light.x', 'on') }}"], then: [{ delay: 1 }] },
        ],
      },
      RESOLVER
    );
    const result = searchSteps(withString, {
      query: "is_state",
      entityIds: [],
    });
    expect(result.matches.map((step) => step.path)).toEqual(["actions[0]"]);
    expect(withString.steps[0].entities).toEqual([
      { entityId: "light.x", fromTemplate: true },
    ]);
  });

  it("keeps the ancestors of every match visible", () => {
    const result = searchSteps(flat, { query: "switch.deep", entityIds: [] });
    expect(result.matches.map((step) => step.path)).toEqual([
      "actions[1].else[0].repeat.sequence[0]",
    ]);
    const visible = [...result.visibleSet].map(
      (item) => flat.byItem.get(item)!.path
    );
    expect(visible.sort()).toEqual([
      "actions[1]",
      "actions[1].else[0]",
      "actions[1].else[0].repeat.sequence[0]",
    ]);
    // A sibling that does not match is not kept.
    expect(result.visibleSet.has(config.actions[2])).toBe(false);
  });

  it("finds a match inside a Choose option and in the default actions", () => {
    expect(matchedPaths("default branch")).toEqual(["actions[0].default[0]"]);
    const result = searchSteps(flat, {
      query: "default branch",
      entityIds: [],
    });
    const ancestors = ancestorsOf(result.matches[0]).map((step) => step.path);
    expect(ancestors).toEqual(["actions[0].default", "actions[0]"]);
  });

  it("matches a pattern against each value", () => {
    expect(matchedPaths("/^light\\.(kitchen|parallel)$/")).toEqual([
      "actions[0].choose[0].sequence[0]",
      "actions[2].parallel[0]",
    ]);
    expect(matchedPaths("/RAINBOW/i")).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("/RAINBOW/")).toEqual([]);
  });

  it("reports an invalid pattern and matches nothing", () => {
    const result = searchSteps(flat, { query: "/(/", entityIds: [] });
    expect(result.error).toBe("invalid");
    expect(result.matches).toEqual([]);
    expect(result.active).toBe(true);
  });

  it("does not run a pattern marked as risky", () => {
    const result = searchSteps(flat, { query: "/(a+)+$/", entityIds: [] });
    expect(result.error).toBe("risky");
    expect(result.matches).toEqual([]);
  });

  it("filters by one entity and by two", () => {
    expect(matchedPaths("", ["light.kitchen"])).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("", ["light.kitchen", "switch.deep"])).toEqual([
      "actions[0].choose[0].sequence[0]",
      "actions[1].else[0].repeat.sequence[0]",
    ]);
  });

  it("filters by an entity that only a template names, and by a missing one", () => {
    expect(matchedPaths("", ["person.alice"])).toEqual([
      "conditions[0].conditions[1].conditions[0]",
    ]);
    expect(matchedPaths("", ["sensor.gone"])).toEqual(["triggers[1]"]);
  });

  it("combines the text with the entity filter", () => {
    expect(matchedPaths("rainbow", ["light.kitchen"])).toEqual([
      "actions[0].choose[0].sequence[0]",
    ]);
    expect(matchedPaths("rainbow", ["switch.deep"])).toEqual([]);
  });

  it("keeps the ancestors of a step found by an entity", () => {
    const result = searchSteps(flat, { query: "", entityIds: ["switch.deep"] });
    expect(result.visibleSet.size).toBe(3);
  });
});

describe("the search of one list", () => {
  const config = makeConfig();
  const flat = flattenAutomation(config, RESOLVER);
  const options = config.actions[0].choose!;

  it("keeps an option when anything inside it matches", () => {
    const shown = filterListItems(flat, options, "rainbow");
    expect(shown.has(options[0])).toBe(true);
    expect(shown.has(options[1])).toBe(false);
  });

  it("keeps everything for an empty text", () => {
    expect(filterListItems(flat, options, "").size).toBe(2);
  });

  it("hides everything for an invalid pattern", () => {
    expect(filterListItems(flat, options, "/(/").size).toBe(0);
  });

  it("never hides a step it does not know", () => {
    expect(subtreeMatches(flat, {}, "anything")).toBe(true);
  });
});
