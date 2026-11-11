import { describe, expect, it } from "vitest";
import {
  beginRun,
  getErrorMessage,
} from "../../../../src/panels/config/automation/run-helpers";

describe("getErrorMessage", () => {
  it("reads the message of a websocket error object", () => {
    expect(getErrorMessage({ code: "unknown_error", message: "Boom" })).toBe(
      "Boom"
    );
  });

  it("reads Error instances and strings", () => {
    expect(getErrorMessage(new Error("Nope"))).toBe("Nope");
    expect(getErrorMessage("plain")).toBe("plain");
  });

  it("reads REST style bodies", () => {
    expect(getErrorMessage({ body: { message: "Body" } })).toBe("Body");
    expect(getErrorMessage({ body: "Raw body" })).toBe("Raw body");
  });

  it("never returns [object Object]", () => {
    expect(getErrorMessage({ code: 1 })).not.toBe("[object Object]");
  });
});

describe("beginRun", () => {
  it("allows only one run per key until released", () => {
    const release = beginRun("automation.a");
    expect(release).toBeDefined();
    expect(beginRun("automation.a")).toBeUndefined();
    expect(beginRun("automation.b")).toBeDefined();
    release!();
    expect(beginRun("automation.a")).toBeDefined();
  });
});
