import { describe, expect, it } from "vitest";
import {
  GO_BACK_LIMIT_MS,
  parsePendingGoBack,
  resolvePendingGoBack,
} from "../../../../src/panels/config/core/updates/update-history";

// Protects the one-time report about a way back across the reload: the page
// that started it is replaced by the older build's page, so the result has to
// come from a stored record.

describe("pending way back", () => {
  const pending = { version: "2026.11.1.490", startedAt: 1000 };

  it("is done once the installed version is the target", () => {
    expect(resolvePendingGoBack(pending, "2026.11.1.490", 2000)).toBe("done");
  });

  it("stays pending for fifteen minutes, then fails", () => {
    expect(resolvePendingGoBack(pending, "x", 1000 + GO_BACK_LIMIT_MS)).toBe(
      "pending"
    );
    expect(
      resolvePendingGoBack(pending, "x", 1000 + GO_BACK_LIMIT_MS + 1)
    ).toBe("failed");
  });

  it("reads back only a well formed record", () => {
    expect(parsePendingGoBack(JSON.stringify(pending))).toEqual(pending);
    expect(parsePendingGoBack("nope")).toBeUndefined();
    expect(parsePendingGoBack('{"version":1}')).toBeUndefined();
  });
});
