import { describe, expect, it } from "vitest";
import type { HaFormSchema } from "../../../src/components/ha-form/types";
import {
  buildSummary,
  describeStepProgress,
  isSecretField,
  parseLiveErrorId,
  toLiveErrorId,
  validateField,
  validateTouchedFields,
} from "../../../src/dialogs/config-flow/step-flow-form-helpers";

const numberField: HaFormSchema = {
  name: "port",
  required: true,
  selector: { number: { min: 1, max: 65535 } },
};

describe("validateField", () => {
  it("flags an empty required field only", () => {
    expect(validateField(numberField, "")).toEqual({ code: "required" });
    expect(validateField({ ...numberField, required: false }, "")).toBe(
      undefined
    );
  });

  it("checks number range from the selector", () => {
    expect(validateField(numberField, 0)).toEqual({
      code: "below_min",
      min: 1,
    });
    expect(validateField(numberField, 70000)).toEqual({
      code: "above_max",
      max: 65535,
    });
    expect(validateField(numberField, 8123)).toBe(undefined);
    expect(validateField(numberField, "abc")).toEqual({ code: "not_a_number" });
  });

  it("checks the legacy integer range", () => {
    const field: HaFormSchema = { name: "n", type: "integer", valueMin: 2 };
    expect(validateField(field, 1)).toEqual({ code: "below_min", min: 2 });
  });

  it("checks select options, but not when custom values are allowed", () => {
    const field: HaFormSchema = {
      name: "mode",
      selector: {
        select: {
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      },
    };
    expect(validateField(field, "b")).toBe(undefined);
    expect(validateField(field, "c")).toEqual({ code: "invalid_option" });
    const custom: HaFormSchema = {
      name: "mode",
      selector: { select: { options: ["a"], custom_value: true } },
    };
    expect(validateField(custom, "zzz")).toBe(undefined);
  });
});

describe("validateTouchedFields", () => {
  it("only reports touched, visible fields", () => {
    const schema = [numberField];
    expect(
      validateTouchedFields(schema, { port: 0 }, new Set(), new Set())
    ).toEqual({});
    expect(
      validateTouchedFields(schema, { port: 0 }, new Set(["port"]), new Set())
    ).toEqual({ port: { code: "below_min", min: 1 } });
    expect(
      validateTouchedFields(
        schema,
        { port: 0 },
        new Set(["port"]),
        new Set(["port"])
      )
    ).toEqual({});
  });
});

describe("live error ids", () => {
  it("round trips and ignores server errors", () => {
    const id = toLiveErrorId({ code: "below_min", min: 1 });
    expect(parseLiveErrorId(id)).toEqual({ code: "below_min", min: 1 });
    expect(parseLiveErrorId("cannot_connect")).toBe(undefined);
  });
});

describe("secrets", () => {
  it("detects password selectors and secret-like names", () => {
    expect(
      isSecretField({ name: "x", selector: { text: { type: "password" } } })
    ).toBe(true);
    expect(isSecretField({ name: "api_key", type: "string" })).toBe(true);
    expect(isSecretField({ name: "host", type: "string" })).toBe(false);
  });

  it("never puts a secret value in the summary", () => {
    const schema: HaFormSchema[] = [
      { name: "host", type: "string" },
      { name: "password", selector: { text: { type: "password" } } },
      { name: "ssl", type: "boolean" },
    ];
    const entries = buildSummary(
      schema,
      { host: "nas.local", password: "hunter2", ssl: false },
      new Set()
    );
    expect(entries).toEqual([
      { name: "host", kind: "text", text: "nas.local" },
      { name: "password", kind: "secret" },
      { name: "ssl", kind: "boolean", bool: false },
    ]);
    expect(JSON.stringify(entries)).not.toContain("hunter2");
  });
});

describe("wider secret detection and structured values", () => {
  it.each([
    "pin",
    "passphrase",
    "key",
    "access_code",
    "psk",
    "otp",
    "credentials",
    "private_key",
  ])("treats %s as secret", (name) => {
    expect(isSecretField({ name, type: "string" })).toBe(true);
  });

  it("treats a one-time-code autocomplete as secret", () => {
    expect(
      isSecretField({
        name: "x",
        selector: { text: { autocomplete: "one-time-code" } },
      })
    ).toBe(true);
    expect(isSecretField({ name: "keypad_name", type: "string" })).toBe(false);
  });

  it("says how many entries an object or list of objects has", () => {
    const schema: HaFormSchema[] = [
      { name: "extra", selector: { object: {} } },
      { name: "rows", selector: { object: {} } },
      { name: "tags", type: "string" },
    ];
    const entries = buildSummary(
      schema,
      {
        extra: { password: "hunter2", a: 1 },
        rows: [{ pin: "1234" }, { pin: "5678" }, { pin: "9" }],
        tags: ["a", "b"],
      },
      new Set()
    );
    expect(entries).toEqual([
      { name: "extra", kind: "entries", count: 2 },
      { name: "rows", kind: "entries", count: 3 },
      { name: "tags", kind: "text", text: "a, b" },
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/hunter2|1234/);
  });
});

describe("validateField edge cases", () => {
  it("treats null as empty and an optionless select as valid", () => {
    expect(
      validateField({ name: "a", type: "string", required: true }, null)
    ).toEqual({
      code: "required",
    });
    expect(validateField({ name: "a", type: "string" }, null)).toBe(undefined);
    expect(
      validateField({ name: "a", selector: { select: { options: [] } } }, "x")
    ).toBe(undefined);
    expect(
      validateField(
        { name: "a", selector: { select: { options: ["b"] } } },
        "x"
      )
    ).toEqual({ code: "invalid_option" });
  });
});

describe("describeStepProgress", () => {
  it("never invents a total", () => {
    expect(describeStepProgress(2, null)).toEqual({
      number: 2,
      final: undefined,
    });
    expect(describeStepProgress(3, true)).toEqual({ number: 3, final: true });
    expect(describeStepProgress(0, true)).toBe(undefined);
  });
});
