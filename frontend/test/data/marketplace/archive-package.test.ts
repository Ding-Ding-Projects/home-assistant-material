import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { ArchiveEntry } from "../../../src/common/converter/archive-types";
import { writeZip } from "../../../src/common/converter/zip";
import { sha256, toHex } from "../../../src/common/util/sha256";
import {
  PackageError,
  parsePackageManifest,
} from "../../../src/data/marketplace/archive-package";
import {
  inspectArchive,
  isArchiveFileName,
} from "../../../src/data/marketplace/archive-upload";

const encode = (text: string) => new TextEncoder().encode(text);

const FILES: Record<string, string> = {
  "custom_components/demo_x/__init__.py": "# demo",
  "custom_components/demo_x/manifest.json": JSON.stringify({
    domain: "demo_x",
    name: "Demo X",
    version: "1.0.0",
  }),
};

const manifestOf = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 1,
    kind: "integration",
    domain: "demo_x",
    version: "1.0.0",
    title: "Demo X",
    description: "A demo",
    source: { repository: "owner/repo", path: "integrations/demo_x" },
    update_url: "https://example.com/index.json",
    files: Object.fromEntries(
      Object.entries(FILES).map(([path, text]) => [
        path,
        toHex(sha256(encode(text))),
      ])
    ),
    ...changes,
  });

const entry = (path: string, text: string): ArchiveEntry => ({
  path,
  data: encode(text),
  dir: false,
  modified: Date.UTC(2024, 0, 1),
});

const packageBlob = async (
  manifest: string,
  files: Record<string, string> = FILES,
  name = "demo_x.hapkg"
) => {
  const zip = await writeZip([
    entry("hapkg.json", manifest),
    ...Object.entries(files).map(([path, text]) => entry(path, text)),
  ]);
  return Object.assign(new NodeBlob([zip]), { name }) as unknown as Blob & {
    name: string;
  };
};

describe("parsePackageManifest", () => {
  it("reads a good manifest", () => {
    const manifest = parsePackageManifest(manifestOf());
    expect(manifest).toMatchObject({
      kind: "integration",
      name: "demo_x",
      version: "1.0.0",
      title: "Demo X",
      source: { repository: "owner/repo", path: "integrations/demo_x" },
      updateUrl: "https://example.com/index.json",
    });
  });

  it.each([
    ["an unknown format", { format: 2 }, "format"],
    ["a kind that is not installable", { kind: "app" }, "invalid"],
    ["an empty version", { version: "" }, "invalid"],
    ["a file without a checksum", { files: { "a.py": "nope" } }, "invalid"],
    [
      "an update address that is not https",
      { update_url: "http://x.com/i" },
      "update_url",
    ],
  ])("refuses %s", (_name, changes, code) => {
    expect(() => parsePackageManifest(manifestOf(changes))).toThrowError(
      expect.objectContaining({ code })
    );
  });

  it("refuses text that is not JSON", () => {
    expect(() => parsePackageManifest("{")).toThrow(PackageError);
  });
});

describe("inspectArchive with a package", () => {
  it("verifies the checksums and reports where the package came from", async () => {
    const result = await inspectArchive(await packageBlob(manifestOf()));

    expect(result.packageError).toBeUndefined();
    expect(result.package).toMatchObject({
      title: "Demo X",
      version: "1.0.0",
      verified: true,
      source: { repository: "owner/repo" },
    });
    expect(result.items.map((item) => item.kind)).toEqual(["integration"]);
  });

  it("refuses a file that does not match its checksum", async () => {
    const file = await packageBlob(manifestOf(), {
      ...FILES,
      "custom_components/demo_x/__init__.py": "# changed",
    });
    const result = await inspectArchive(file);

    expect(result.package).toBeUndefined();
    expect(result.packageError?.code).toBe("checksum");
  });

  it("refuses a file the manifest does not list", async () => {
    const file = await packageBlob(manifestOf(), {
      ...FILES,
      "custom_components/demo_x/extra.py": "surprise",
    });

    expect((await inspectArchive(file)).packageError?.code).toBe("unlisted");
  });

  it("refuses a kind that does not match what the package holds", async () => {
    const file = await packageBlob(manifestOf({ kind: "theme", name: "x" }));

    expect((await inspectArchive(file)).packageError?.code).toBe("kind");
  });

  it("leaves a plain ZIP file alone", async () => {
    const zip = await writeZip(
      Object.entries(FILES).map(([path, text]) => entry(path, text))
    );
    const file = Object.assign(new NodeBlob([zip]), {
      name: "demo.zip",
    }) as unknown as Blob & { name: string };

    const result = await inspectArchive(file);

    expect(result.package).toBeUndefined();
    expect(result.packageError).toBeUndefined();
    expect(result.items).toHaveLength(1);
  });
});

describe("isArchiveFileName", () => {
  it.each([
    ["demo.hapkg", true],
    ["Demo.ZIP", true],
    ["notes.txt", false],
    ["hapkg", false],
  ])("%s", (name, expected) => {
    expect(isArchiveFileName(name)).toBe(expected);
  });
});
