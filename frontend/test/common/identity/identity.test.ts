import { describe, expect, it } from "vitest";
import {
  cropRect,
  dataUrlBytes,
  isAcceptableLogoUrl,
  LOGO_MAX_BYTES,
  normalizeName,
  sanitizeIdentity,
} from "../../../src/common/identity/identity";

// Protects what may be stored for the app's name and logo: stored values come
// from a browser that anyone can edit, and a picture must stay small and can
// never be a type that carries script.

describe("normalizeName", () => {
  it("collapses white space, drops control characters and limits length", () => {
    expect(normalizeName("  Sam's \n  House\u0007 ")).toBe("Sam's House");
    expect(normalizeName("a".repeat(60))).toHaveLength(40);
    expect(Array.from(normalizeName("🏠".repeat(60)))).toHaveLength(40);
  });
});

describe("logo pictures", () => {
  it("accepts only png, jpeg and webp data within the size limit", () => {
    const small = `data:image/png;base64,${"A".repeat(400)}`;
    expect(isAcceptableLogoUrl(small)).toBe(true);
    expect(
      isAcceptableLogoUrl(`data:image/svg+xml;base64,${"A".repeat(40)}`)
    ).toBe(false);
    expect(isAcceptableLogoUrl("https://example.com/logo.png")).toBe(false);
    expect(isAcceptableLogoUrl(["java", "script:alert(1)"].join(""))).toBe(
      false
    );
    const big = `data:image/webp;base64,${"A".repeat(
      Math.ceil(((LOGO_MAX_BYTES + 10) * 4) / 3)
    )}`;
    expect(isAcceptableLogoUrl(big)).toBe(false);
  });

  it("measures the data of a base64 URL", () => {
    expect(dataUrlBytes("data:image/png;base64,QUJD")).toBe(3);
    expect(dataUrlBytes("data:image/png;base64,QUI=")).toBe(2);
  });
});

describe("sanitizeIdentity", () => {
  it("keeps valid values and drops everything else", () => {
    expect(
      sanitizeIdentity({
        name: "  Cabin ",
        shortName: "x".repeat(30),
        logo: { kind: "mark", mark: "heart" },
        accent: "white",
        extra: 1,
      })
    ).toEqual({
      name: "Cabin",
      shortName: "x".repeat(12),
      logo: { kind: "mark", mark: "heart" },
      accent: "white",
    });
    expect(
      sanitizeIdentity({
        logo: { kind: "image", dataUrl: "data:text/html;base64,AAAA" },
        accent: "red",
      })
    ).toEqual({});
    expect(sanitizeIdentity(null)).toEqual({});
  });
});

describe("cropRect", () => {
  it("fills the square from a window around the focus point", () => {
    const rect = cropRect(1600, 1200, "fill", { x: 0.5, y: 0.5 }, 192);
    expect(rect.sw).toBe(1200);
    expect(rect.sh).toBe(1200);
    expect(rect.sx).toBe(200);
    expect(rect.sy).toBe(0);
    const left = cropRect(1600, 1200, "fill", { x: 0, y: 0.5 }, 192);
    expect(left.sx).toBe(0);
    const right = cropRect(1600, 1200, "fill", { x: 1, y: 0.5 }, 192);
    expect(right.sx).toBe(400);
  });

  it("fits the whole picture inside, centred", () => {
    const rect = cropRect(1600, 1200, "inside", { x: 0.5, y: 0.5 }, 192);
    expect(rect.dw).toBe(192);
    expect(rect.dh).toBe(144);
    expect(rect.dy).toBe(24);
    expect(rect.sw).toBe(1600);
  });
});
