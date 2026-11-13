import { describe, expect, it, vi } from "vitest";
import { DialogLovelaceResourceDetail } from "../../src/panels/config/lovelace/resources/dialog-lovelace-resource-detail";

const internals = (element: DialogLovelaceResourceDetail) =>
  element as unknown as {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _sourceChanged: (event: unknown) => void;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _filePicked: (event: unknown) => void;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _updateResource: () => Promise<void>;
    _file?: File;
    _open: boolean;
    _error?: { base: string };
  };
const setup = () => {
  const element = new DialogLovelaceResourceDetail();
  element.hass = { localize: (key: string) => key } as never;
  const createResource = vi.fn().mockResolvedValue(undefined);
  const updateResource = vi.fn().mockResolvedValue(undefined);
  element.showDialog({ allowUpload: true, createResource, updateResource });
  internals(element)._sourceChanged({
    detail: { value: "upload" },
    stopPropagation: vi.fn(),
  });
  return { element, createResource, updateResource };
};
const pick = (element: DialogLovelaceResourceDetail, file: File) =>
  internals(element)._filePicked({
    currentTarget: { files: [file], value: "selected" },
  });

describe("resource file dialog", () => {
  it("does not save when picking or cancelling", () => {
    const { element, createResource } = setup();
    pick(element, new File(["export {};"], "card.js"));
    expect(createResource).not.toHaveBeenCalled();
    element.closeDialog();
    expect(createResource).not.toHaveBeenCalled();
  });
  it("passes the selected file only after explicit Create", async () => {
    const { element, createResource } = setup();
    const file = new File(["body{}"], "style.css");
    pick(element, file);
    await internals(element)._updateResource();
    expect(createResource).toHaveBeenCalledWith(
      { url: "/api/lovelace/resources/upload/style.css", res_type: "css" },
      file
    );
    expect(internals(element)._open).toBe(false);
  });
  it("keeps the selected file and dialog open after a failed attempt", async () => {
    const { element, createResource } = setup();
    createResource.mockRejectedValueOnce(new Error("Try again"));
    const file = new File(["export {};"], "card.mjs");
    pick(element, file);
    await internals(element)._updateResource();
    expect(internals(element)._file).toBe(file);
    expect(internals(element)._open).toBe(true);
    expect(internals(element)._error?.base).toBe("Try again");
    await internals(element)._updateResource();
    expect(createResource).toHaveBeenCalledTimes(2);
  });
  it("does not submit an invalid file", async () => {
    const { element, createResource } = setup();
    pick(element, new File([], "empty.js"));
    await internals(element)._updateResource();
    expect(createResource).not.toHaveBeenCalled();
    expect(internals(element)._error?.base).toContain("upload_empty");
  });
  it("does not update uploaded resources", async () => {
    const { element, createResource, updateResource } = setup();
    element.showDialog({
      resource: {
        id: "saved",
        type: "module",
        url: "/api/lovelace/resources/upload/id.js",
        uploaded: true,
      },
      createResource,
      updateResource,
    });
    await internals(element)._updateResource();
    expect(updateResource).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });
});
