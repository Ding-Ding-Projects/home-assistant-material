import { describe, expect, it } from "vitest";
import { emptyTone } from "../../src/components/empty-state-logic";

// Protects the choice between "nothing here yet" and "everything is hidden by
// your search or filters": the second one must offer to clear them, the first
// must not, and rows that exist are never called an empty page.

describe("emptyTone", () => {
  it("is the start tone for a page with no rows and nothing narrowing it", () => {
    expect(
      emptyTone({ dataCount: 0, searchActive: false, filtersActive: false })
    ).toBe("start");
  });

  it("is the filtered tone when a search hides every row", () => {
    expect(
      emptyTone({ dataCount: 12, searchActive: true, filtersActive: false })
    ).toBe("filtered");
  });

  it("is the filtered tone when the page's filters left no rows", () => {
    expect(
      emptyTone({ dataCount: 0, searchActive: false, filtersActive: true })
    ).toBe("filtered");
  });

  it("is the filtered tone when rows exist but the table shows none", () => {
    expect(
      emptyTone({ dataCount: 3, searchActive: false, filtersActive: false })
    ).toBe("filtered");
  });
});
