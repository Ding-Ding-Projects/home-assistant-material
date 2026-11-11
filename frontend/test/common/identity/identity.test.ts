/* eslint-disable no-bitwise -- builds binary image headers */
import { describe, expect, it } from "vitest";
import {
  cropRect,
  dataUrlBytes,
  IDENTITY_STORAGE_KEY,
  imageTypeFromBytes,
  isAcceptableLogoUrl,
  isWithinPixelCap,
  LAUNCH_NAME_KEY,
  LOGO_MAX_BYTES,
  LOGO_MAX_URL_LENGTH,
  normalizeName,
  readIdentity,
  readSharedIdentity,
  sanitizeIdentity,
  setSharedIdentity,
  writeIdentity,
} from "../../../src/common/identity/identity";

const u32 = (n: number) => [
  Math.floor(n / 16777216) % 256,
  (n >> 16) & 255,
  (n >> 8) & 255,
  n & 255,
];
const u24le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

// Real image headers that declare a size, followed by `tail` bytes of padding.
const pngHeader = (w: number, h: number) => [
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  13,
  ...ascii("IHDR"),
  ...u32(w),
  ...u32(h),
  8,
  6,
  0,
  0,
  0,
];
const jpegHeader = (w: number, h: number) => [
  0xff,
  0xd8,
  0xff,
  0xe0,
  0,
  16,
  ...ascii("JFIF\0"),
  1,
  1,
  0,
  0,
  1,
  0,
  1,
  0,
  0,
  0xff,
  0xc0,
  0,
  17,
  8,
  (h >> 8) & 255,
  h & 255,
  (w >> 8) & 255,
  w & 255,
  3,
  1,
  0x22,
  0,
  2,
  0x11,
  1,
  3,
  0x11,
  1,
];
const webpHeader = (w: number, h: number) => [
  ...ascii("RIFF"),
  0,
  0,
  0,
  0,
  ...ascii("WEBP"),
  ...ascii("VP8X"),
  10,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  ...u24le(w - 1),
  ...u24le(h - 1),
];

const urlOf = (type: string, header: number[], extra = 16): string =>
  `data:image/${type};base64,${btoa(
    String.fromCharCode(...header) + "\0".repeat(extra)
  )}`;

const PNG_OK = urlOf("png", pngHeader(64, 64));
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

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

describe("normalizeName hidden characters", () => {
  it("removes direction, zero-width and other hidden characters", () => {
    const hidden = [
      RLO,
      ZWSP,
      String.fromCharCode(0xad),
      String.fromCharCode(0x85),
      String.fromCharCode(0xfe0f),
      String.fromCharCode(0x2066),
    ].join("");
    expect(normalizeName(`Ho${hidden}me`)).toBe("Home");
  });

  it("gives an empty name when only hidden characters are left", () => {
    expect(normalizeName(`${ZWSP}${RLO} ${ZWSP}`)).toBe("");
    expect(
      sanitizeIdentity({ name: `${ZWSP}${ZWSP}`, shortName: RLO })
    ).toEqual({});
  });

  it("limits the combining marks after a letter", () => {
    const smear = "a" + String.fromCharCode(0x301).repeat(20) + "b";
    const result = normalizeName(smear);
    expect(Array.from(result).filter((c) => /\p{M}/u.test(c))).toHaveLength(2);
    expect(result.endsWith("b")).toBe(true);
  });
});

describe("logo picture content", () => {
  it("refuses a picture whose bytes are not the declared type", () => {
    // A GIF header inside a data URL that says png.
    const gif = `data:image/png;base64,${btoa("GIF89a\u0001\u0000\u0001\u0000")}`;
    expect(isAcceptableLogoUrl(gif)).toBe(false);
    expect(sanitizeIdentity({ logo: { kind: "image", dataUrl: gif } })).toEqual(
      {}
    );
    expect(isAcceptableLogoUrl(PNG_OK)).toBe(true);
  });

  it("reads the size from the header and refuses a picture over 192 pixels", () => {
    expect(isAcceptableLogoUrl(urlOf("png", pngHeader(192, 192)))).toBe(true);
    expect(isAcceptableLogoUrl(urlOf("png", pngHeader(193, 192)))).toBe(false);
    expect(isAcceptableLogoUrl(urlOf("png", pngHeader(192, 193)))).toBe(false);
    expect(isAcceptableLogoUrl(urlOf("png", pngHeader(0, 10)))).toBe(false);
    // Tiny files that declare a huge picture.
    expect(isAcceptableLogoUrl(urlOf("png", pngHeader(100000, 100000)))).toBe(
      false
    );
    expect(isAcceptableLogoUrl(urlOf("jpeg", jpegHeader(192, 192)))).toBe(true);
    expect(isAcceptableLogoUrl(urlOf("jpeg", jpegHeader(60000, 60000)))).toBe(
      false
    );
    expect(isAcceptableLogoUrl(urlOf("webp", webpHeader(192, 192)))).toBe(true);
    expect(isAcceptableLogoUrl(urlOf("webp", webpHeader(16000, 16000)))).toBe(
      false
    );
    expect(isAcceptableLogoUrl(urlOf("webp", webpHeader(10, 4000)))).toBe(
      false
    );
  });

  it("refuses a picture with no readable size", () => {
    expect(
      isAcceptableLogoUrl(urlOf("png", pngHeader(64, 64).slice(0, 18), 0))
    ).toBe(false);
    expect(
      isAcceptableLogoUrl(urlOf("jpeg", [0xff, 0xd8, 0xff, 0xe0, 0, 2]))
    ).toBe(false);
  });

  it("refuses an overlong text before reading it", () => {
    const long = `data:image/png;base64,${"A".repeat(LOGO_MAX_URL_LENGTH)}`;
    expect(isAcceptableLogoUrl(long)).toBe(false);
  });

  it("caps the number of pixels of a picked picture", () => {
    expect(isWithinPixelCap(4000, 4000)).toBe(true);
    expect(isWithinPixelCap(20000, 20000)).toBe(false);
    expect(isWithinPixelCap(0, 10)).toBe(false);
  });

  it("recognises a file by its first bytes", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(imageTypeFromBytes(png)).toBe("image/png");
    expect(imageTypeFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg"
    );
    expect(
      imageTypeFromBytes(new TextEncoder().encode("<svg"))
    ).toBeUndefined();
  });
});

describe("storage events from other tabs", () => {
  it("announces a change made in another tab", () => {
    let announced = 0;
    const listener = () => {
      announced += 1;
    };
    window.addEventListener("ha-identity-changed", listener);
    window.dispatchEvent(
      new StorageEvent("storage", { key: IDENTITY_STORAGE_KEY })
    );
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    window.removeEventListener("ha-identity-changed", listener);
    expect(announced).toBe(1);
  });
});

describe("logo pictures", () => {
  it("accepts only png, jpeg and webp data within the size limit", () => {
    const small = urlOf("png", pngHeader(64, 64), 300);
    expect(isAcceptableLogoUrl(small)).toBe(true);
    expect(
      isAcceptableLogoUrl(`data:image/svg+xml;base64,${"A".repeat(40)}`)
    ).toBe(false);
    expect(isAcceptableLogoUrl("https://example.com/logo.png")).toBe(false);
    expect(isAcceptableLogoUrl(["java", "script:alert(1)"].join(""))).toBe(
      false
    );
    const big = urlOf("webp", webpHeader(64, 64), LOGO_MAX_BYTES + 10);
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

// The identity stored for everyone was written by another administrator, so
// it is input: it is validated like a local value, and a browser with its own
// choice keeps it.
describe("identity stored for everyone", () => {
  it("keeps only valid fields of a shared value", () => {
    setSharedIdentity({
      name: "Shared \n House",
      logo: { kind: "image", dataUrl: "https://example.com/x.png" },
    });
    expect(readSharedIdentity()).toEqual({ name: "Shared House" });
    setSharedIdentity({});
  });

  it("is used unless this browser has its own choice", () => {
    window.localStorage.clear();
    setSharedIdentity({ name: "Shared" });
    expect(readIdentity().name).toBe("Shared");
    writeIdentity({ name: "Mine" });
    expect(readIdentity().name).toBe("Mine");
    writeIdentity({});
    expect(readIdentity().name).toBe("Shared");
    setSharedIdentity({});
    expect(readIdentity()).toEqual({});
  });

  it("merges field by field, so a local name keeps the shared logo", () => {
    window.localStorage.clear();
    setSharedIdentity({ name: "Shared", logo: { kind: "mark", mark: "bulb" } });
    writeIdentity({ name: "Mine" });
    expect(readIdentity()).toEqual({
      name: "Mine",
      logo: { kind: "mark", mark: "bulb" },
    });
    writeIdentity({});
    setSharedIdentity({});
  });

  it("keeps the name in effect for the launch screen", () => {
    window.localStorage.clear();
    setSharedIdentity({ name: "Shared" });
    expect(window.localStorage.getItem(LAUNCH_NAME_KEY)).toBe("Shared");
    writeIdentity({ name: "Mine" });
    expect(window.localStorage.getItem(LAUNCH_NAME_KEY)).toBe("Mine");
    writeIdentity({});
    expect(window.localStorage.getItem(LAUNCH_NAME_KEY)).toBe("Shared");
    setSharedIdentity({});
    expect(window.localStorage.getItem(LAUNCH_NAME_KEY)).toBeNull();
  });
});
