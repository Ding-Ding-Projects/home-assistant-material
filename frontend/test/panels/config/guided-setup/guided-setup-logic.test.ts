import { describe, expect, it } from "vitest";
import {
  buildSummary,
  canJumpTo,
  decorateField,
  draftKey,
  leafFields,
  loadDraft,
  maskYaml,
  saveDraft,
  stepStatus,
  validateAll,
  withoutSecrets,
} from "../../../../src/panels/config/guided-setup/guided-setup-logic";
import type { DraftStorage } from "../../../../src/panels/config/guided-setup/guided-setup-logic";

const fields: any[] = [
  { name: "name", required: true, selector: { text: {} } },
  {
    name: "port",
    required: false,
    selector: { number: { min: 1, max: 100, step: 1 } },
  },
  {
    name: "password",
    required: false,
    selector: { text: { type: "password" } },
  },
  {
    type: "expandable",
    name: "auth",
    schema: [
      { name: "token", selector: { text: { type: "password" } } },
      { name: "user", selector: { text: {} } },
    ],
  },
  {
    name: "mode",
    selector: {
      select: {
        options: [
          { value: "a", label: "a" },
          { value: "b", label: "b" },
        ],
      },
    },
  },
];

const memory = (): DraftStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

describe("guided setup logic", () => {
  const leaves = leafFields(fields);

  it("nests expandable fields under their name", () => {
    expect(leaves.map((leaf) => leaf.path.join("."))).toContain("auth.token");
  });

  it("reports required, range, integer and choice problems", () => {
    const errors = validateAll(leaves, { port: 1.5, mode: "z" });
    expect(errors.name.key).toBe("field_required");
    expect(errors.port.key).toBe("field_not_integer");
    expect(errors.mode.key).toBe("field_not_allowed");
    expect(validateAll(leaves, { name: "x", port: 500 }).port.key).toBe(
      "field_too_large"
    );
    expect(validateAll(leaves, { name: "x", port: 0 }).port.key).toBe(
      "field_too_small"
    );
    expect(validateAll(leaves, { name: "x", port: 5, mode: "a" })).toEqual({});
  });

  it("never puts a secret value into the summary", () => {
    const lines = buildSummary(
      leaves,
      { name: "n", password: "hunter2", auth: { token: "abc" } },
      (leaf) => leaf.name
    );
    expect(JSON.stringify(lines)).not.toContain("hunter2");
    expect(JSON.stringify(lines)).not.toContain("abc");
    expect(lines.filter((line) => line.secret)).toHaveLength(2);
  });

  it("masks secret lines of the YAML preview", () => {
    const yaml =
      "sensor:\n  - name: n\n    password: hunter2\n    token: abc\n";
    const masked = maskYaml(yaml, leaves, "(hidden)");
    expect(masked).not.toContain("hunter2");
    expect(masked).not.toContain("abc");
    expect(masked).toContain("name: n");
  });

  it("keeps secrets out of drafts and lists what to ask again", () => {
    const storage = memory();
    const data = {
      name: "n",
      password: "hunter2",
      auth: { token: "abc", user: "u" },
    };
    saveDraft(
      storage,
      draftKey("x", null),
      { step: "options", entityDomain: null, data },
      leaves,
      5
    );
    const raw = storage.map.get(draftKey("x", null)) ?? "";
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("abc");
    const draft = loadDraft(storage, draftKey("x", null));
    expect(draft?.data).toEqual({ name: "n", auth: { user: "u" } });
    expect(draft?.clearedSecrets.sort()).toEqual(["auth.token", "password"]);
    expect(withoutSecrets(data, leaves).password).toBeUndefined();
  });

  it("rejects a damaged draft", () => {
    const storage = memory();
    storage.setItem("k", "{not json");
    expect(loadDraft(storage, "k")).toBeUndefined();
    storage.setItem("k", JSON.stringify({ version: 2 }));
    expect(loadDraft(storage, "k")).toBeUndefined();
  });

  it("lets only reached steps be jumped to and flags option problems", () => {
    const ctx = {
      current: "review" as const,
      furthest: "review" as const,
      errorCount: 0,
      saved: false,
    };
    expect(canJumpTo("about", ctx)).toBe(true);
    expect(canJumpTo("done", ctx)).toBe(false);
    expect(
      canJumpTo("review", { ...ctx, current: "about", furthest: "options" })
    ).toBe(false);
    expect(stepStatus("options", { ...ctx, errorCount: 2 })).toBe("error");
    expect(stepStatus("about", { ...ctx, saved: true })).toBe("locked");
  });

  it("draws a bounded number as a slider and a short choice as a list", () => {
    const [, number, , , select] = fields.map(decorateField) as any[];
    expect(number.selector.number.mode).toBe("slider");
    expect(select.selector.select.mode).toBe("list");
    const unbounded = { name: "x", selector: { number: { min: 0 } } } as any;
    expect(decorateField(unbounded)).toBe(unbounded);
  });
});
