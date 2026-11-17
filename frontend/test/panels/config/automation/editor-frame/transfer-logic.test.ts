import { dump, load } from "js-yaml";
import { describe, expect, test } from "vitest";
import {
  detectPrivateContent,
  exportFileName,
  exportYaml,
  findMissingReferences,
  parseImport,
  validateSceneConfig,
} from "../../../../../src/panels/config/automation/editor-frame/transfer-logic";

const AUTOMATION = {
  id: "1700000000",
  alias: "Evening lights",
  description: "",
  mode: "single",
  triggers: [{ trigger: "sun", event: "sunset" }],
  conditions: [],
  actions: [{ action: "light.turn_on", target: { entity_id: "light.porch" } }],
};

describe("exportYaml", () => {
  test("one item reads back exactly as the stored config", () => {
    expect(load(exportYaml([AUTOMATION]))).toEqual(AUTOMATION);
  });

  test("equals what the YAML view dumps", () => {
    expect(exportYaml([AUTOMATION])).toBe(dump(AUTOMATION, { noRefs: true }));
  });

  test("several items are one list", () => {
    const parsed = load(exportYaml([AUTOMATION, { ...AUTOMATION, id: "2" }]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });
});

describe("exportFileName", () => {
  test.each([
    ["Evening lights", "automation", 1, "evening-lights.yaml"],
    ["  Café  - Lights!! ", "automation", 1, "cafe-lights.yaml"],
    ["晚間燈光", "automation", 1, "晚間燈光.yaml"],
    ["", "script", 1, "script.yaml"],
    [undefined, "scene", 1, "scene.yaml"],
    ["!!!", "automation", 1, "automation.yaml"],
    ["Anything", "automation", 3, "automations.yaml"],
  ] as const)("%s", (name, kind, count, expected) => {
    expect(exportFileName(name, kind, count)).toBe(expected);
  });

  test("is cut to a sensible length without a trailing dash", () => {
    const name = exportFileName(`${"a".repeat(59)} b`, "automation");
    expect(name).toBe(`${"a".repeat(59)}.yaml`);
  });
});

describe("detectPrivateContent", () => {
  test("finds webhook ids, secret-like fields and coordinates", () => {
    const findings = detectPrivateContent([
      {
        triggers: [{ trigger: "webhook", webhook_id: "abc123" }],
        actions: [
          { action: "rest_command.x", data: { api_key: "k", password: "p" } },
          { action: "x", data: { latitude: 51.5, longitude: -0.1 } },
        ],
      },
    ]);
    expect(findings).toEqual([
      { kind: "webhook", count: 1 },
      { kind: "secret", count: 2 },
      { kind: "location", count: 2 },
    ]);
  });

  test("ignores an ordinary automation and empty values", () => {
    expect(detectPrivateContent([AUTOMATION])).toEqual([]);
    expect(
      detectPrivateContent([{ actions: [{ data: { token: "" } }] }])
    ).toEqual([]);
  });
});

describe("parseImport", () => {
  test("accepts one automation", () => {
    const result = parseImport(
      exportYaml([AUTOMATION]),
      "automation",
      new Set()
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0].summary).toEqual({
        name: "Evening lights",
        triggers: 1,
        conditions: 0,
        actions: 1,
      });
      expect(result.items[0].idClash).toBe(false);
      expect(result.items[0].config.id).toBe("1700000000");
    }
  });

  test("accepts a list", () => {
    const text = exportYaml([AUTOMATION, { ...AUTOMATION, id: "2" }]);
    const result = parseImport(text, "automation", new Set());
    expect(result.ok && result.items.map((i) => i.index)).toEqual([0, 1]);
  });

  test("gives a clashing id a fresh one by dropping it", () => {
    const result = parseImport(
      exportYaml([AUTOMATION]),
      "automation",
      new Set(["1700000000"])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].idClash).toBe(true);
      expect(result.items[0].originalId).toBe("1700000000");
      expect("id" in result.items[0].config).toBe(false);
    }
  });

  test("reads the scripts file form as one script per key", () => {
    const result = parseImport(
      "wake_up:\n  alias: Wake up\n  sequence:\n    - action: light.turn_on\nnap:\n  sequence: []\n",
      "script",
      new Set(["nap"])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.map((i) => i.originalId)).toEqual(["wake_up", "nap"]);
      expect(result.items.map((i) => i.idClash)).toEqual([false, true]);
    }
  });

  test.each([
    ["", "empty"],
    ["   \n", "empty"],
    ["[]", "empty"],
    ["a: [unclosed", "invalid_yaml"],
    ["just text", "not_config"],
    ["- 1\n- 2", "not_config"],
    ["alias: No parts", "not_config"],
    ["automation:\n  - alias: x\n    triggers: []", "not_config"],
    ["blueprint:\n  name: B\n  domain: automation\n  input: {}", "not_config"],
  ])("refuses %j with %s", (text, reason) => {
    const result = parseImport(text, "automation", new Set());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(reason);
    }
  });

  test("refuses a script given where an automation is expected", () => {
    const result = parseImport("sequence: []", "automation", new Set());
    expect(result.ok).toBe(false);
  });

  test("names the item that cannot be imported in a list", () => {
    const result = parseImport(
      "- alias: ok\n  triggers: []\n- alias: bad",
      "automation",
      new Set()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toContain("item 2");
    }
  });
});

describe("findMissingReferences", () => {
  const known = {
    entities: new Set(["light.porch"]),
    devices: new Set(["dev1"]),
    areas: new Set(["kitchen"]),
  };

  test("lists entities, devices and areas this home does not have", () => {
    const missing = findMissingReferences(
      {
        triggers: [
          { trigger: "state", entity_id: ["light.porch", "light.gone"] },
        ],
        actions: [
          {
            action: "x",
            target: { entity_id: "switch.a, switch.b", area_id: "garage" },
          },
          { device_id: "dev2", domain: "d" },
          { target: { area_id: "kitchen", device_id: ["dev1", "dev3"] } },
          { entity_id: "{{ states('x') }}" },
        ],
      },
      known
    );
    expect(missing).toEqual({
      entities: ["light.gone", "switch.a", "switch.b"],
      devices: ["dev2", "dev3"],
      areas: ["garage"],
    });
  });

  test("finds nothing for an item that only uses what exists", () => {
    expect(findMissingReferences(AUTOMATION, known)).toEqual({
      entities: [],
      devices: [],
      areas: [],
    });
  });
});

describe("validateSceneConfig", () => {
  const known = new Set(["light.a", "switch.b"]);

  test("a good scene has no problems", () => {
    expect(
      validateSceneConfig(
        {
          name: "S",
          entities: {
            "light.a": { state: "on", attributes: { brightness: 3 } },
            "switch.b": "off",
          },
        },
        known
      )
    ).toEqual({
      notMapping: false,
      badEntities: [],
      badStates: [],
      missing: [],
    });
  });

  test("reports unknown entities, bad ids, bad states and a non-mapping", () => {
    const problems = validateSceneConfig(
      {
        entities: {
          "light.gone": "on",
          "not an id": "on",
          "light.a": { state: { nested: true } },
          "switch.b": { attributes: "x" },
        },
      },
      known
    );
    expect(problems.badEntities).toEqual(["not an id"]);
    expect(problems.badStates).toEqual(["light.a", "switch.b"]);
    expect(problems.missing).toEqual(["light.gone"]);
    expect(
      validateSceneConfig({ entities: ["light.a"] }, known).notMapping
    ).toBe(true);
  });

  test("a scene whose entities mapping is missing is left to the other checks", () => {
    expect(validateSceneConfig({ name: "S" }, known).notMapping).toBe(false);
  });

  test("a scene clash drops its id like an automation", () => {
    const result = parseImport(
      ["id: '5'", "name: S", "entities:", "  light.a: 'on'", ""].join("\n"),
      "scene",
      new Set(["5"])
    );
    expect(result.ok && "id" in result.items[0].config).toBe(false);
  });
});
