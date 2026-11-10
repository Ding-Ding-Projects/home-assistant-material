import { describe, expect, it } from "vitest";
import {
  findInPage,
  plainRanges,
  textRanges,
  visibleTextNodes,
} from "../../../src/common/page/find-in-page";

// Protects search this page: where matches are found, that it reads through
// component boundaries, and that hidden text and a bad pattern mark nothing.

describe("plainRanges", () => {
  it("finds every occurrence, ignoring case", () => {
    expect(plainRanges("li", "Light in the Living room")).toEqual([
      [0, 2],
      [13, 15],
    ]);
  });

  it("does not overlap matches", () => {
    expect(plainRanges("aa", "aaaa")).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it("finds nothing for an empty text", () => {
    expect(plainRanges("", "anything")).toEqual([]);
  });
});

describe("textRanges", () => {
  it("reads text between slashes as a pattern", () => {
    expect(textRanges("/k\\w+n/i", "Kitchen and garden")).toEqual([[0, 7]]);
  });

  it("treats other text as plain", () => {
    expect(textRanges("a.c", "abc a.c")).toEqual([[4, 7]]);
  });
});

describe("findInPage", () => {
  const page = () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <h1>Devices</h1>
      <p>Kitchen light</p>
      <p hidden>Kitchen secret</p>
      <p aria-hidden="true">Kitchen decoration</p>
      <style>.kitchen { color: red }</style>
      <section class="tools">Kitchen tools</section>
    `;
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).innerHTML =
      "<span>Kitchen sensor</span>";
    root.append(host);
    document.body.append(root);
    return root;
  };

  it("reads into components and leaves hidden text out", () => {
    const root = page();
    const texts = visibleTextNodes(root).map((node) => node.data.trim());
    expect(texts).toEqual([
      "Devices",
      "Kitchen light",
      "Kitchen tools",
      "Kitchen sensor",
    ]);
    root.remove();
  });

  it("marks each match as a range on its text", () => {
    const root = page();
    const ranges = findInPage(root, "kitchen", (element) =>
      element.classList.contains("tools")
    );
    expect(ranges.map((range) => range.toString())).toEqual([
      "Kitchen",
      "Kitchen",
    ]);
    root.remove();
  });

  it("marks nothing for a pattern that is not valid", () => {
    const root = page();
    expect(findInPage(root, "/(/")).toEqual([]);
    expect(findInPage(root, "   ")).toEqual([]);
    root.remove();
  });
});
