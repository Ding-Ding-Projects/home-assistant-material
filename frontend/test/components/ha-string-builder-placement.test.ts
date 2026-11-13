import { afterEach, describe, expect, it, vi } from "vitest";
import { createTextPiece } from "../../src/common/string-builder/create-piece";
import { BUILDER_PIECE_DRAG_TYPE } from "../../src/common/string-builder/drag";
import type { Piece } from "../../src/common/string-builder/types";
import "../../src/components/string-builder/ha-string-builder-editor";
import type { HomeAssistant } from "../../src/types";

const mount = async () => {
  const editor = document.createElement("ha-string-builder-editor");
  editor.hass = { localize: (key: string) => key } as HomeAssistant;
  editor.pieces = [createTextPiece("for the  action")];
  editor.addEventListener("pieces-changed", (event) => {
    editor.pieces = event.detail.pieces;
  });
  document.body.append(editor);
  await editor.updateComplete;
  const row = editor.shadowRoot!.querySelector("ha-string-builder-piece")!;
  await row.updateComplete;
  const field = row.shadowRoot!.querySelector("textarea")!;
  const chip = editor.shadowRoot!.querySelector<HTMLElement>(
    "[data-kind=datetime]"
  )!;
  return { editor, field, chip };
};

const expectInserted = (pieces: Piece[]) => {
  expect(pieces).toMatchObject([
    { kind: "text", text: "for the " },
    { kind: "datetime" },
    { kind: "text", text: " action" },
  ]);
};

afterEach(() => {
  document.querySelector("ha-string-builder-editor")?.remove();
  vi.restoreAllMocks();
});

describe("visual text placement", () => {
  it("shows the typed text and inserts a clicked piece at the caret", async () => {
    const { editor, field, chip } = await mount();
    expect(field.value).toBe("for the  action");
    field.setSelectionRange(8, 8);
    field.dispatchEvent(new Event("select"));
    chip.click();
    expectInserted(editor.pieces);
  });

  it("uses the drop location and preserves the surrounding text", async () => {
    const { editor, field, chip } = await mount();
    const dataTransfer = {
      types: [BUILDER_PIECE_DRAG_TYPE],
      setData: vi.fn(),
      effectAllowed: "",
    };
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(drag, "dataTransfer", { value: dataTransfer });
    chip.dispatchEvent(drag);
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      BUILDER_PIECE_DRAG_TYPE,
      ""
    );
    const caret = vi.fn(() => ({ offsetNode: field, offset: 8 }));
    Object.defineProperty(document, "caretPositionFromPoint", {
      value: caret,
      configurable: true,
    });
    try {
      const drop = new MouseEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
      field.dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
      expectInserted(editor.pieces);
    } finally {
      Reflect.deleteProperty(document, "caretPositionFromPoint");
    }
  });
});
