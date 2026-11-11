import { describe, expect, it } from "vitest";
import {
  encodeWav,
  mixChannels,
  readWavHeader,
  wavSize,
} from "../../../src/common/converter/audio";
import type { Capabilities } from "../../../src/common/converter/capabilities";
import {
  categoryStatus,
  targetAvailable,
} from "../../../src/common/converter/capabilities";
import { sniffContents } from "../../../src/common/converter/detect";
import {
  CATEGORIES,
  categoryOf,
  targetsFor,
} from "../../../src/common/converter/formats";
import { outputFileName } from "../../../src/common/converter/output-name";
import {
  DEFAULT_EXTRA_OPTIONS,
  runExtra,
} from "../../../src/common/converter/run";
import { writeTar } from "../../../src/common/converter/tar";
import { writeZip } from "../../../src/common/converter/zip";

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const ascii = (text: string) =>
  Uint8Array.from(text, (character) => character.charCodeAt(0));

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  compression: true,
  gzip: true,
  audioDecode: true,
  webm: false,
  mp4: false,
  video: true,
  canvas: true,
  xml: true,
  ...over,
});

describe("WAV", () => {
  it("writes 16-bit PCM and reads its own header back", () => {
    const left = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2]);
    const wav = encodeWav([left, left], 22050);
    expect(wav.length).toBe(wavSize(7, 2));
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    const header = readWavHeader(wav)!;
    expect(header).toMatchObject({
      channels: 2,
      sampleRate: 22050,
      bitsPerSample: 16,
    });
    expect(header.seconds).toBeCloseTo(7 / 22050, 8);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44 + 2 * 2, true)).toBe(0x3fff);
    // Out-of-range samples are held at the ends, not wrapped.
    expect(view.getInt16(44 + 5 * 4, true)).toBe(32767);
    expect(view.getInt16(44 + 6 * 4, true)).toBe(-32768);
  });

  it("does not read a header from something that is not a WAV", () => {
    expect(readWavHeader(enc("not a wav file".repeat(10)))).toBeUndefined();
    expect(readWavHeader(new Uint8Array(10))).toBeUndefined();
  });

  it("mixes channels to mono or stereo", () => {
    const a = Float32Array.from([1, 1]);
    const b = Float32Array.from([0, -1]);
    expect(mixChannels([a, b], 1)[0]).toEqual(Float32Array.from([0.5, 0]));
    expect(mixChannels([a], 2)).toEqual([a, a]);
    expect(mixChannels([a, b, a], 2)).toEqual([a, b]);
    expect(mixChannels([], 2)).toEqual([]);
  });
});

describe("what a file is", () => {
  it("tells sound, video and archives from their first bytes", () => {
    expect(sniffContents(ascii("RIFF\0\0\0\0WAVEfmt "))).toBe("audio");
    expect(sniffContents(ascii("RIFF\0\0\0\0AVI LIST"))).toBe("video");
    expect(sniffContents(ascii("\0\0\0\x18ftypisom"))).toBe("video");
    expect(sniffContents(ascii("\0\0\0\x18ftypM4A "))).toBe("audio");
    expect(sniffContents(ascii("OggS\0\x02"))).toBe("audio");
    expect(sniffContents(ascii("fLaC\0\0"))).toBe("audio");
    expect(sniffContents(Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0]))).toBe(
      "audio"
    );
    expect(sniffContents(Uint8Array.from([0xff, 0xfb, 0x90, 0x00, 0]))).toBe(
      "audio"
    );
    expect(sniffContents(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe(
      "video"
    );
    expect(
      sniffContents(Uint8Array.from([0x1f, 0x8b, 8, ...new Array(20).fill(0)]))
    ).toBe("gzip");
  });

  it("does not take text that starts with ID3 for a sound", () => {
    expect(sniffContents(enc("ID3,name\n1,x"))).toBe("text");
  });

  it("finds a tar by its header", () => {
    const tar = writeTar([
      { path: "a.txt", data: enc("hi"), dir: false, modified: 0 },
    ]);
    expect(sniffContents(tar)).toBe("tar");
  });
});

describe("what is offered", () => {
  it("lists every format of every category once", () => {
    const all = CATEGORIES.flatMap((category) => category.targets);
    expect(new Set(all).size).toBe(all.length);
    for (const target of all) {
      expect(CATEGORIES.some((c) => c.id === categoryOf(target))).toBe(true);
    }
  });

  it("offers archives for files, sets of files and archives", () => {
    expect(targetsFor("set")).toEqual(["zip", "tar", "tar-gz"]);
    expect(targetsFor("image-set")).toContain("pdf");
    expect(targetsFor("archive")).toContain("extract");
    expect(targetsFor("docx")).toContain("doc-markdown");
    expect(targetsFor("audio")).toContain("wav");
    expect(targetsFor("video")).toContain("video-png");
    expect(targetsFor("text")).toContain("docx");
    expect(targetsFor("text")).toContain("pdf");
    // Reading a PDF is not offered, so no PDF input has such a target.
    expect(targetsFor("binary")).not.toContain("doc-text");
  });

  it("lists a sound format only when this device can write it", () => {
    expect(targetAvailable("wav", caps())).toBe(true);
    expect(targetAvailable("audio-webm", caps())).toBe(false);
    expect(targetAvailable("audio-webm", caps({ webm: true }))).toBe(true);
    expect(targetAvailable("audio-mp4", caps({ mp4: true }))).toBe(true);
    expect(targetAvailable("wav", caps({ audioDecode: false }))).toBe(false);
    expect(targetAvailable("tar-gz", caps({ compression: false }))).toBe(false);
    expect(targetAvailable("zip", caps({ compression: false }))).toBe(true);
  });

  it("says Ready, Limited or Unavailable for each category", () => {
    expect(categoryStatus("images", caps()).state).toBe("ready");
    expect(categoryStatus("archives", caps()).state).toBe("ready");
    expect(categoryStatus("archives", caps({ compression: false }))).toEqual({
      state: "limited",
      reason: "archives_no_compression",
    });
    expect(categoryStatus("audio", caps())).toEqual({
      state: "limited",
      reason: "audio_wav_only",
    });
    expect(categoryStatus("audio", caps({ webm: true })).state).toBe("ready");
    expect(categoryStatus("audio", caps({ audioDecode: false }))).toEqual({
      state: "unavailable",
      reason: "audio_no_decoder",
    });
    expect(categoryStatus("video", caps())).toEqual({
      state: "limited",
      reason: "video_frames_only",
    });
    expect(categoryStatus("video", caps({ video: false })).state).toBe(
      "unavailable"
    );
  });
});

describe("file names", () => {
  it("names the new outputs", () => {
    expect(outputFileName("notes.txt", "pdf")).toBe("notes.pdf");
    expect(outputFileName("notes.md", "docx")).toBe("notes.docx");
    expect(outputFileName("report.docx", "doc-markdown")).toBe("report.md");
    expect(outputFileName("a.zip", "tar-gz")).toBe("a.tar.gz");
    expect(outputFileName("song.mp3", "wav")).toBe("song.wav");
    expect(outputFileName("clip.mp4", "video-jpeg")).toBe("clip.jpg");
    // A gzip keeps the whole name so the original can be told afterwards.
    expect(outputFileName("data.csv", "gzip")).toBe("data.csv.gz");
  });
});

describe("running conversions", () => {
  const options = { ...DEFAULT_EXTRA_OPTIONS };

  it("packs dropped files into a ZIP with distinct names", async () => {
    const result = await runExtra(
      "zip",
      {
        kind: "set",
        name: "",
        sniffed: "text",
        files: [
          { name: "a.txt", bytes: enc("one"), sniffed: "text" },
          { name: "a.txt", bytes: enc("two"), sniffed: "text" },
        ],
      },
      options
    );
    expect(result.ok && result.kind).toBe("bytes");
    if (!result.ok || result.kind !== "bytes") {
      return;
    }
    const listing = await runExtra(
      "extract",
      { kind: "archive", name: "x.zip", bytes: result.bytes, sniffed: "zip" },
      options
    );
    expect(
      listing.ok &&
        listing.kind === "files" &&
        listing.entries.map((e) => e.path)
    ).toEqual(["a.txt", "a (2).txt"]);
  });

  it("lists the files of an archive and counts folders", async () => {
    const zip = await writeZip([
      { path: "d/", data: new Uint8Array(0), dir: true, modified: 0 },
      { path: "d/x.txt", data: enc("x"), dir: false, modified: 0 },
    ]);
    const result = await runExtra(
      "extract",
      { kind: "archive", name: "x.zip", bytes: zip, sniffed: "zip" },
      options
    );
    expect(result.ok && result.kind === "files" && result.folders).toBe(1);
    expect(
      result.ok && result.kind === "files" && dec(result.entries[0].data)
    ).toBe("x");
  });

  it("refuses an archive with a path that climbs out", async () => {
    const zip = await writeZip([
      { path: "../outside.txt", data: enc("x"), dir: false, modified: 0 },
    ]);
    const result = await runExtra(
      "extract",
      { kind: "archive", name: "x.zip", bytes: zip, sniffed: "zip" },
      options
    );
    expect(result.ok ? "" : result.error.code).toBe("archive_unsafe_path");
  });

  it("converts a tar.gz to a zip", async () => {
    const targz = await runExtra(
      "tar-gz",
      { kind: "text", name: "n.txt", bytes: enc("hello"), sniffed: "text" },
      options
    );
    expect(targz.ok && targz.kind).toBe("bytes");
    if (!targz.ok || targz.kind !== "bytes") {
      return;
    }
    const zip = await runExtra(
      "zip",
      {
        kind: "archive",
        name: "n.tar.gz",
        bytes: targz.bytes,
        sniffed: "gzip",
      },
      options
    );
    expect(zip.ok && zip.kind).toBe("bytes");
    if (!zip.ok || zip.kind !== "bytes") {
      return;
    }
    const files = await runExtra(
      "extract",
      { kind: "archive", name: "n.zip", bytes: zip.bytes, sniffed: "zip" },
      options
    );
    expect(
      files.ok && files.kind === "files" && dec(files.entries[0].data)
    ).toBe("hello");
  });

  it("turns text into a PDF, plain or from Markdown, and into a Word file", async () => {
    const plain = await runExtra(
      "pdf",
      {
        kind: "text",
        name: "a.txt",
        bytes: enc("line one\nline two"),
        sniffed: "text",
      },
      options
    );
    expect(plain.ok && plain.kind === "bytes" && plain.mime).toBe(
      "application/pdf"
    );
    const fromMarkdown = await runExtra(
      "pdf",
      {
        kind: "text",
        name: "a.md",
        bytes: enc("# Title\n\ntext"),
        sniffed: "text",
      },
      options
    );
    expect(fromMarkdown.ok && fromMarkdown.kind).toBe("bytes");
    const docx = await runExtra(
      "docx",
      {
        kind: "text",
        name: "a.md",
        bytes: enc("# 標題\n\n你好 **world**"),
        sniffed: "text",
      },
      options
    );
    expect(docx.ok && docx.kind).toBe("bytes");
    if (!docx.ok || docx.kind !== "bytes") {
      return;
    }
    const back = await runExtra(
      "doc-text",
      { kind: "docx", name: "a.docx", bytes: docx.bytes, sniffed: "docx" },
      options
    );
    expect(back.ok && back.kind === "text" && back.text).toBe(
      "標題\n\n你好 world\n"
    );
  });

  it("refuses empty text and text that is not UTF-8", async () => {
    const empty = await runExtra(
      "pdf",
      { kind: "text", name: "", bytes: enc("  \n"), sniffed: "text" },
      options
    );
    expect(empty.ok ? "" : empty.error.code).toBe("empty");
    const broken = await runExtra(
      "docx",
      {
        kind: "text",
        name: "",
        bytes: Uint8Array.from([0xff, 0xfe]),
        sniffed: "text",
      },
      options
    );
    expect(broken.ok ? "" : broken.error.code).toBe("invalid_utf8");
  });

  it("refuses a sound when this device cannot decode it", async () => {
    // jsdom has no audio, which is the same answer as a browser without it.
    const result = await runExtra(
      "wav",
      {
        kind: "audio",
        name: "a.wav",
        bytes: encodeWav([new Float32Array(10)], 8000),
        sniffed: "audio",
      },
      options
    );
    expect(result.ok ? "" : result.error.code).toBe("audio_no_decoder");
  });
});
