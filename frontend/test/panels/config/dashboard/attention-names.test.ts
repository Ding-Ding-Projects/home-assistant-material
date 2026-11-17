import { describe, expect, it } from "vitest";
import { summarizeUpdateNames } from "../../../../src/panels/config/dashboard/attention-names";

const more = (shown: string, count: number) => `${shown} and ${count} more`;

// The card on the Settings front lists the pending updates in one small line.
// A long unbroken list made the card wider than a phone screen, so the list is
// kept to two names and a count.
describe("summarizeUpdateNames", () => {
  it("drops the trailing word Update from each name", () => {
    expect(
      summarizeUpdateNames(
        [
          "Home Assistant Core Update",
          "Home Assistant Operating System Update",
        ],
        more
      )
    ).toBe("Home Assistant Core, Home Assistant Operating System");
  });

  it("lists at most two names and counts the rest", () => {
    expect(
      summarizeUpdateNames(
        ["A Update", "B Update", "C Update", "D Update", "E Update"],
        more
      )
    ).toBe("A, B and 3 more");
  });

  it("keeps a name that is only the word, and ignores empty ones", () => {
    expect(summarizeUpdateNames(["Updater", " ", "Update"], more)).toBe(
      "Updater, Update"
    );
  });
});
