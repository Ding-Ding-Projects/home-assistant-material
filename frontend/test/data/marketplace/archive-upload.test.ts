import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import type { ArchiveEntry } from "../../../src/common/converter/archive-types";
import { writeZip } from "../../../src/common/converter/zip";
import {
  archiveErrorMessage,
  inspectArchive,
  uploadArchiveItem,
  uploadErrorMessage,
} from "../../../src/data/marketplace/archive-upload";
import { ArchiveReadError } from "../../../src/data/marketplace/archive-zip";

const entry = (path: string, text = ""): ArchiveEntry => ({
  path,
  data: new TextEncoder().encode(text),
  dir: false,
  modified: Date.UTC(2024, 0, 1),
});

const blobOf = async (entries: ArchiveEntry[], name: string) => {
  const zip = await writeZip(entries);
  // A file chosen on the device, read in pieces
  return Object.assign(new NodeBlob([zip]), { name }) as unknown as Blob & {
    name: string;
  };
};

const localize = (key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

describe("inspectArchive", () => {
  it("finds what is in a file that has no history folder", async () => {
    const file = await blobOf(
      [
        entry("demo-main/README.md", "# demo"),
        entry(
          "demo-main/custom_components/demo_x/manifest.json",
          JSON.stringify({ domain: "demo_x", name: "Demo X", version: "1.0" })
        ),
        entry(
          "demo-main/custom_components/demo_x/__init__.py",
          "x".repeat(2000)
        ),
      ],
      "demo-main.zip"
    );

    const result = await inspectArchive(file);

    expect(result.entryCount).toBe(3);
    expect(result.git).toBeUndefined();
    expect(
      result.items.map((item) => [item.kind, item.name, item.version])
    ).toEqual([["integration", "Demo X", "1.0"]]);
  });

  it("reads the history folder when the file carries it", async () => {
    const file = await blobOf(
      [
        entry("x/.git/HEAD", "ref: refs/heads/main\n"),
        entry(
          "x/.git/config",
          '[remote "origin"]\n\turl = git@github.com:o/x.git\n'
        ),
        entry("x/themes/t.yaml", "Tee:\n  primary-color: red\n"),
      ],
      "x.zip"
    );

    const result = await inspectArchive(file);

    expect(result.git).toEqual({
      folder: "x",
      branch: "main",
      origin: "git@github.com:o/x.git",
    });
    expect(result.items.map((item) => item.kind)).toEqual(["theme"]);
  });

  it("refuses a file that is not an archive", async () => {
    const file = Object.assign(
      new NodeBlob(["just some text, long enough to be looked at"]),
      { name: "notes.zip" }
    ) as unknown as Blob;

    await expect(inspectArchive(file)).rejects.toMatchObject({
      code: "not_zip",
    });
  });
});

describe("archiveErrorMessage", () => {
  it("names the limit that was passed", () => {
    expect(
      archiveErrorMessage(new ArchiveReadError("too_big"), localize)
    ).toContain("50 MB");
  });

  it("names the entry that was refused", () => {
    expect(
      archiveErrorMessage(new ArchiveReadError("unsafe_path", "../x"), localize)
    ).toContain("../x");
  });

  it("does not pretend to know an error from somewhere else", () => {
    expect(archiveErrorMessage(new Error("boom"), localize)).toBe(
      "ui.panel.marketplace.common.unknown_error"
    );
  });
});

describe("uploadArchiveItem", () => {
  it("sends the fields before the archive, to the endpoint of the Marketplace", async () => {
    const fetchWithAuth = vi.fn(
      async (_path: string, init?: Record<string, any>) => {
        const sent: [string, unknown][] = [
          ...(init!.body as FormData).entries(),
        ];
        return new Response(
          JSON.stringify({
            kind: "theme",
            name: "T",
            path: "themes/t",
            sent: sent.map(([name]) => name),
          }),
          { headers: { "content-type": "application/json" } }
        );
      }
    );
    const file = new File(["zip"], "x.zip");

    const result = await uploadArchiveItem({ fetchWithAuth }, file, "x.zip", {
      kind: "theme",
      source: "themes",
    });

    expect(fetchWithAuth).toHaveBeenCalledWith(
      "/api/marketplace/upload",
      expect.objectContaining({ method: "POST" })
    );
    expect((result as unknown as { sent: string[] }).sent).toEqual([
      "kind",
      "source",
      "file",
    ]);
  });

  it("rejects with what the server said", async () => {
    const fetchWithAuth = vi.fn(
      async () =>
        new Response(JSON.stringify({ translation_key: "upload_not_zip" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
    );

    await expect(
      uploadArchiveItem({ fetchWithAuth }, new File(["x"], "x.zip"), "x.zip", {
        kind: "theme",
        source: "t",
      })
    ).rejects.toMatchObject({
      status_code: 400,
      body: { translation_key: "upload_not_zip" },
    });
  });
});

describe("uploadErrorMessage", () => {
  it("translates what the server explained", () => {
    expect(
      uploadErrorMessage(
        {
          status_code: 400,
          body: {
            translation_domain: "marketplace",
            translation_key: "upload_target_exists",
            translation_placeholders: { path: "themes/x" },
            message: "english",
          },
        },
        localize
      )
    ).toContain(
      "component.marketplace.exceptions.upload_target_exists.message"
    );
  });

  it("says the file could not be sent when there was no answer", () => {
    expect(uploadErrorMessage({ status_code: undefined }, localize)).toBe(
      "ui.panel.marketplace.dialog_custom_repositories.file.upload_failed"
    );
  });
});
