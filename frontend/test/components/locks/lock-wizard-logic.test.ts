import { describe, expect, it } from "vitest";
import {
  buildLockSummary,
  passwordRules,
  tryNewLock,
} from "../../../src/components/locks/lock-wizard-logic";

describe("passwordRules", () => {
  it("checks the length bounds", () => {
    expect(passwordRules("abc", "", 4, 200).lengthOk).toBe(false);
    expect(passwordRules("abcd", "", 4, 200).lengthOk).toBe(true);
    expect(passwordRules("a".repeat(201), "", 4, 200).lengthOk).toBe(false);
  });

  it("does not report a match before the repeat is typed", () => {
    const rules = passwordRules("abcd", "", 4, 200);
    expect(rules.repeatTyped).toBe(false);
    expect(rules.matchOk).toBe(false);
    expect(rules.ok).toBe(false);
  });

  it("is ok only when long enough and repeated exactly", () => {
    expect(passwordRules("abcd", "abcd", 4, 200).ok).toBe(true);
    expect(passwordRules("abcd", "abce", 4, 200).ok).toBe(false);
    expect(passwordRules("abc", "abc", 4, 200).ok).toBe(false);
  });
});

describe("buildLockSummary", () => {
  it("lists the factors of the policy in order and holds no secret", () => {
    const summary = buildLockSummary({
      policy: "password_pin_totp",
      duration: { kind: "minutes", minutes: 15 },
      onStart: true,
    });
    expect(summary.factors).toStrictEqual(["password", "pin", "totp"]);
    expect(summary.duration).toStrictEqual({ kind: "minutes", minutes: 15 });
    expect(Object.keys(summary).sort()).toStrictEqual([
      "duration",
      "factors",
      "onStart",
    ]);
  });
});

describe.skipIf(!globalThis.crypto?.subtle)("tryNewLock", () => {
  const input = {
    key: "k",
    label: "Kitchen lights",
    policy: "pin" as const,
    duration: { kind: "surface" as const },
    pin: "2468",
  };

  it("accepts the PIN it was made with", async () => {
    expect(await tryNewLock(input, { pin: "2468" }, 1)).toBe("ok");
  });

  it("refuses another PIN", async () => {
    expect(await tryNewLock(input, { pin: "1357" }, 1)).toBe("wrong");
  });

  it("reports input that cannot make a lock as invalid", async () => {
    expect(await tryNewLock({ ...input, pin: "12" }, { pin: "12" }, 1)).toBe(
      "invalid"
    );
  });
});
