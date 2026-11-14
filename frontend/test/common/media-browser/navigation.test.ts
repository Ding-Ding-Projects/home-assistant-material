import { describe, expect, it } from "vitest";
import {
  mediaNavigationKey,
  mediaNavigationAncestor,
} from "../../../src/common/media-browser/navigation";

describe("media navigation titles", () => {
  it("keeps titles separate when a provider reuses an ID for different types", () => {
    expect(
      mediaNavigationKey({
        media_content_id: "123",
        media_content_type: "album",
      })
    ).not.toBe(
      mediaNavigationKey({
        media_content_id: "123",
        media_content_type: "artist",
      })
    );
  });

  it("uses the same root key for omitted and empty fields", () => {
    expect(mediaNavigationKey({})).toBe(
      mediaNavigationKey({ media_content_id: "", media_content_type: "" })
    );
  });

  it("does not collide when IDs and types contain separators", () => {
    expect(
      mediaNavigationKey({ media_content_id: "b:c", media_content_type: "a" })
    ).not.toBe(
      mediaNavigationKey({ media_content_id: "c", media_content_type: "a:b" })
    );
  });
});

describe("media navigation ancestors", () => {
  const ids = [
    {},
    { media_content_id: "images" },
    { media_content_id: "album" },
    { media_content_id: "folder" },
  ];
  it("jumps multiple levels without mutating the original trail", () => {
    expect(mediaNavigationAncestor(ids, 1)).toEqual(ids.slice(0, 2));
    expect(ids).toHaveLength(4);
  });
  it("keeps a restricted picker inside its source root", () => {
    expect(mediaNavigationAncestor(ids, 0, 2)).toBe(ids);
    expect(mediaNavigationAncestor(ids, 1, 2)).toEqual(ids.slice(0, 2));
  });
  it("ignores repeated, fractional, and out-of-range navigation", () => {
    for (const index of [-1, 0.5, 3, 4, NaN]) {
      expect(mediaNavigationAncestor(ids, index)).toBe(ids);
    }
  });
});
