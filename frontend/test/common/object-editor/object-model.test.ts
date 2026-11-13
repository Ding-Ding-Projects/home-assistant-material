import { describe, expect, it } from "vitest";
import {
  addEntry,
  convertNode,
  moveEntry,
  nodeFromValue,
  outputValue,
  removeEntry,
  rootFromValue,
  uniqueKey,
  validateNode,
} from "../../../src/common/object-editor/object-model";

describe("object model round trip", () => {
  const samples: unknown[] = [
    {},
    [],
    "text",
    "",
    0,
    -3.5,
    1e21,
    true,
    false,
    null,
    { zeta: 1, alpha: [1, "two", { three: null }], mid: { deep: { x: true } } },
    [{ a: 1 }, [1, 2, [3]], "{{ states('sensor.x') }}", null],
    { template: "{% if a %}b{% endif %}", plain: "hello", __proto__x: 1 },
  ];

  samples.forEach((sample, index) => {
    it(`keeps sample ${index} unchanged`, () => {
      const result = validateNode(nodeFromValue(sample));
      expect(result.valid).toBe(true);
      expect(result.value).toEqual(sample);
    });
  });

  it("keeps key order", () => {
    const result = validateNode(nodeFromValue({ b: 1, a: 2, c: 3 }));
    expect(Object.keys(result.value as object)).toEqual(["b", "a", "c"]);
  });

  it("shows templates as templates and leaves them untouched", () => {
    const node = nodeFromValue({ a: "{{ 1 + 1 }}", b: "{% x %}", c: "plain" });
    expect(node.entries.map((entry) => entry.node.type)).toEqual([
      "template",
      "template",
      "text",
    ]);
  });

  it("starts an empty field as an empty dictionary", () => {
    [undefined, null, ""].forEach((value) => {
      const root = rootFromValue(value);
      expect(root.type).toBe("dict");
      expect(root.entries).toHaveLength(0);
    });
  });
});

describe("validation", () => {
  it("flags empty and duplicate keys and does not hide the value rule", () => {
    const root = nodeFromValue({ a: 1, b: 2 });
    root.entries[1].key = "a";
    let result = validateNode(root);
    expect(result.valid).toBe(false);
    expect(result.errors.get(root.entries[0].id)).toBe("duplicate_key");
    expect(result.errors.get(root.entries[1].id)).toBe("duplicate_key");

    root.entries[1].key = "  ";
    result = validateNode(root);
    expect(result.errors.get(root.entries[1].id)).toBe("empty_key");

    root.entries[1].key = "b";
    expect(validateNode(root).valid).toBe(true);
  });

  it("flags number text that does not parse", () => {
    const root = nodeFromValue({ n: 5 });
    root.entries[0].node.text = "abc";
    const result = validateNode(root);
    expect(result.valid).toBe(false);
    expect(result.errors.get(root.entries[0].node.id)).toBe("invalid_number");
    root.entries[0].node.text = "";
    expect(validateNode(root).valid).toBe(false);
    root.entries[0].node.text = " 12.5 ";
    expect(validateNode(root).value).toEqual({ n: 12.5 });
  });

  it("flags errors inside nested lists", () => {
    const root = nodeFromValue({ list: [{ a: 1 }] });
    root.entries[0].node.entries[0].node.entries[0].key = "";
    expect(validateNode(root).valid).toBe(false);
  });
});

describe("type conversion", () => {
  it("converts text to number and back", () => {
    const text = nodeFromValue("5");
    const number = convertNode(text, "number");
    expect(validateNode(number).value).toBe(5);
    expect(validateNode(convertNode(number, "text")).value).toBe("5");
  });

  it("starts a number from zero when the text is not a number", () => {
    expect(
      validateNode(convertNode(nodeFromValue("abc"), "number")).value
    ).toBe(0);
  });

  it("converts yes/no words", () => {
    expect(
      validateNode(convertNode(nodeFromValue("true"), "boolean")).value
    ).toBe(true);
    expect(
      validateNode(convertNode(nodeFromValue("No"), "boolean")).value
    ).toBe(false);
    expect(
      validateNode(convertNode(nodeFromValue("maybe"), "boolean")).value
    ).toBe(false);
    expect(validateNode(convertNode(nodeFromValue(true), "text")).value).toBe(
      "true"
    );
    expect(validateNode(convertNode(nodeFromValue(2), "boolean")).value).toBe(
      true
    );
  });

  it("wraps a single value in a one-item list and unwraps it again", () => {
    const list = convertNode(nodeFromValue("x"), "list");
    expect(validateNode(list).value).toEqual(["x"]);
    expect(validateNode(convertNode(list, "text")).value).toBe("x");
  });

  it("turns a dictionary into the list of its values", () => {
    const list = convertNode(nodeFromValue({ a: 1, b: "two" }), "list");
    expect(validateNode(list).value).toEqual([1, "two"]);
  });

  it("starts empty when there is no sensible conversion", () => {
    expect(
      validateNode(convertNode(nodeFromValue([1, 2]), "dict")).value
    ).toEqual({});
    expect(
      validateNode(convertNode(nodeFromValue("x"), "null")).value
    ).toBeNull();
    expect(
      validateNode(convertNode(nodeFromValue(null), "list")).value
    ).toEqual([]);
  });

  it("keeps a template string through text and template", () => {
    const template = nodeFromValue("{{ a }}");
    expect(validateNode(convertNode(template, "text")).value).toBe("{{ a }}");
  });

  it("keeps the node id so the row stays in place", () => {
    const node = nodeFromValue(1);
    expect(convertNode(node, "text").id).toBe(node.id);
  });
});

describe("editing", () => {
  it("adds entries with unused keys", () => {
    const root = nodeFromValue({ key: 1 });
    addEntry(root);
    addEntry(root);
    expect(root.entries.map((entry) => entry.key)).toEqual([
      "key",
      "key_2",
      "key_3",
    ]);
    expect(validateNode(root).valid).toBe(true);
    expect(uniqueKey([], "a")).toBe("a");
  });

  it("adds list items without keys, removes and moves", () => {
    const root = nodeFromValue(["a", "b", "c"]);
    addEntry(root);
    expect(validateNode(root).value).toEqual(["a", "b", "c", ""]);
    removeEntry(root, 3);
    expect(moveEntry(root, 0, 1)).toBe(true);
    expect(validateNode(root).value).toEqual(["b", "a", "c"]);
    expect(moveEntry(root, 0, -1)).toBe(false);
    expect(moveEntry(root, 2, 1)).toBe(false);
  });
});

describe("output value", () => {
  it("gives no value for an empty optional field", () => {
    expect(outputValue({}, false)).toBeUndefined();
    expect(outputValue([], false)).toBeUndefined();
    expect(outputValue({}, true)).toEqual({});
    expect(outputValue({ a: 1 }, false)).toEqual({ a: 1 });
    expect(outputValue(0, false)).toBe(0);
  });
});
