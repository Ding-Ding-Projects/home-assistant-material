import { describe, expect, it } from "vitest";
import {
  classifyRepairFailure,
  issueKey,
} from "../../../src/dialogs/repairs-flow/repair-failure";

// A failed repair gets one of two sentences. The stronger one, "it broke
// something else", must only appear when the instance really reports issues
// that were not there before the attempt, never as a guess.
describe("classifyRepairFailure", () => {
  it("is a plain failure when the same issues remain", () => {
    expect(classifyRepairFailure(["a:1", "b:2"], ["a:1", "b:2"])).toBe(
      "failed"
    );
  });

  it("is a plain failure when issues went away", () => {
    expect(classifyRepairFailure(["a:1", "b:2"], ["a:1"])).toBe("failed");
  });

  it("says something broke when a new issue appeared", () => {
    expect(classifyRepairFailure(["a:1"], ["a:1", "c:3"])).toBe("failed_broke");
  });

  it("never guesses without both lists", () => {
    expect(classifyRepairFailure(undefined, ["a:1"])).toBe("failed");
    expect(classifyRepairFailure(["a:1"], undefined)).toBe("failed");
    expect(classifyRepairFailure(undefined, undefined)).toBe("failed");
  });

  it("names an issue by its integration and its id", () => {
    expect(issueKey({ domain: "hassio", issue_id: "unsupported_os" })).toBe(
      "hassio:unsupported_os"
    );
  });
});
