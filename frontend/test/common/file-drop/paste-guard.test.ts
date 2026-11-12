import { describe, expect, it } from "vitest";
import {
  isEditablePath,
  mediaFilesFromPaste,
  nameForPastedFile,
} from "../../../src/common/file-drop/paste-guard";

// Protects the paste rule: a pasted picture, video or audio file is added to
// the media library, but never when the paste belongs to a text field, a text
// area, a rich text area, a code editor, or a page that already handled it.

const png = () => new File(["x"], "image.png", { type: "image/png" });

const paste = (path: Element[], files: File[], defaultPrevented = false) => ({
  defaultPrevented,
  clipboardData: { files },
  composedPath: () => path,
});

describe("which pastes add media", () => {
  it("takes a picture pasted on the page", () => {
    const files = mediaFilesFromPaste(paste([document.body], [png()]));
    expect(files).toHaveLength(1);
  });

  it("ignores text files and keeps only media", () => {
    const text = new File(["x"], "a.txt", { type: "text/plain" });
    const video = new File(["x"], "a.mp4", { type: "video/mp4" });
    expect(
      mediaFilesFromPaste(paste([document.body], [text, video])).map(
        (file) => file.name
      )
    ).toEqual(["a.mp4"]);
  });

  it("ignores a paste with no files", () => {
    expect(mediaFilesFromPaste(paste([document.body], []))).toEqual([]);
  });

  it("ignores a paste a page already handled", () => {
    expect(mediaFilesFromPaste(paste([document.body], [png()], true))).toEqual(
      []
    );
  });

  it.each([
    ["an input", () => document.createElement("input")],
    ["a text area", () => document.createElement("textarea")],
    ["a select", () => document.createElement("select")],
    [
      "a rich text area",
      () => {
        const div = document.createElement("div");
        div.setAttribute("contenteditable", "true");
        return div;
      },
    ],
    ["a code editor element", () => document.createElement("ha-code-editor")],
    [
      "a CodeMirror editor",
      () => {
        const div = document.createElement("div");
        div.className = "cm-content";
        return div;
      },
    ],
  ])("ignores a paste inside %s", (_name, make) => {
    const target = make();
    expect(
      mediaFilesFromPaste(paste([target, document.body], [png()]))
    ).toEqual([]);
    expect(isEditablePath([target])).toBe(true);
  });

  it("finds an editable control higher up the path, across a shadow root", () => {
    const input = document.createElement("input");
    const inner = document.createElement("span");
    expect(isEditablePath([inner, input, document.body])).toBe(true);
    expect(isEditablePath([inner, document.body])).toBe(false);
  });
});

describe("naming a pasted file", () => {
  it("gives the generic image name a time stamp of its own", () => {
    const named = nameForPastedFile(png(), new Date(2026, 10, 11, 9, 5, 7));
    expect(named.name).toBe("pasted-20261111-090507.png");
    expect(named.type).toBe("image/png");
  });

  it("keeps a real name", () => {
    const file = new File(["x"], "holiday.jpg", { type: "image/jpeg" });
    expect(nameForPastedFile(file)).toBe(file);
  });
});
