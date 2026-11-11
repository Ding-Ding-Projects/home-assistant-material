/* eslint-disable no-await-in-loop -- pictures are prepared in order */
import type { ArchiveEntry } from "./archive-types";
import { buildArchive, openArchive, uniqueEntries } from "./archive";
import {
  decodeAudio,
  encodeWav,
  MAX_WAV_BYTES,
  mixChannels,
  recordAudio,
  recorderType,
  wavSize,
} from "./audio";
import type { SniffedKind } from "./detect";
import { IMAGE_KINDS } from "./detect";
import { buildDocx, docxToMarkdown, docxToPlain, readDocx } from "./docx";
import type { InputKind, TargetId } from "./formats";
import { isArchiveTarget } from "./formats";
import { parseMarkdown, parsePlain } from "./markdown-blocks";
import type { Paper, PdfImage } from "./pdf";
import { buildImagePdf, buildTextPdf } from "./pdf";
import { prepareImageForPdf, renderTextPagesAsImages } from "./pdf-canvas";
import { drawableWithStandardFonts } from "./pdf-fonts";
import { MAX_PAGES } from "./layout";
import type { ConvertError, ConvertNote } from "./types";
import { failure } from "./types";
import { decodeUtf8Strict } from "./utf8";
import { extractVideoFrame, readVideoInfo, videoMime } from "./video";

/**
 * The conversions beyond pictures, structured text and encodings: archives,
 * PDF and Word documents, sound, and what can be done with a video. The page
 * hands in what the person chose and gets bytes, text or a list of files
 * back. Everything runs in this browser.
 */

export interface NamedFile {
  name: string;
  bytes: Uint8Array;
  sniffed: SniffedKind;
}

export interface ExtraInput {
  kind: InputKind;
  /** Name of the file, or empty for pasted text. */
  name: string;
  bytes?: Uint8Array;
  sniffed: SniffedKind;
  /** Several files chosen together. */
  files?: NamedFile[];
}

export interface ExtraOptions {
  /** How text becomes a document: plain lines, or Markdown. */
  docMode: "auto" | "plain" | "markdown";
  paper: Paper;
  audioRate: number;
  audioChannels: 1 | 2;
  /** Where in a video the picture is taken, 0 to 100 percent. */
  framePosition: number;
  quality: number;
}

export const DEFAULT_EXTRA_OPTIONS: ExtraOptions = {
  docMode: "auto",
  paper: "a4",
  audioRate: 44100,
  audioChannels: 2,
  framePosition: 10,
  quality: 85,
};

export type ExtraResult =
  | {
      ok: true;
      kind: "bytes";
      bytes: Uint8Array;
      mime: string;
      notes: ConvertNote[];
      width?: number;
      height?: number;
    }
  | { ok: true; kind: "text"; text: string; notes: ConvertNote[] }
  | {
      ok: true;
      kind: "files";
      entries: ArchiveEntry[];
      folders: number;
      notes: ConvertNote[];
    }
  | {
      ok: true;
      kind: "video-info";
      duration: number;
      width: number;
      height: number;
      notes: ConvertNote[];
    }
  | { ok: false; error: ConvertError };

/** Longest text that is typeset: the pages are capped long before this. */
const MAX_DOCUMENT_CHARACTERS = 4_000_000;

const sourceEntries = async (
  target: TargetId,
  input: ExtraInput
): Promise<
  | { ok: true; entries: ArchiveEntry[]; notes: ConvertNote[] }
  | { ok: false; error: ConvertError }
> => {
  if (input.files) {
    return {
      ok: true,
      entries: uniqueEntries(
        input.files.map((file) => ({ name: file.name, data: file.bytes }))
      ),
      notes: [],
    };
  }
  const bytes = input.bytes ?? new Uint8Array(0);
  const reopen =
    (input.kind === "archive" || input.kind === "docx") && target !== "gzip";
  if (reopen) {
    const opened = await openArchive(bytes, input.name);
    if (!opened.ok) {
      return opened;
    }
    return { ok: true, entries: opened.entries, notes: opened.notes };
  }
  return {
    ok: true,
    entries: uniqueEntries([{ name: input.name || "text.txt", data: bytes }]),
    notes: [],
  };
};

const runArchive = async (
  target: TargetId,
  input: ExtraInput
): Promise<ExtraResult> => {
  const source = await sourceEntries(target, input);
  if (!source.ok) {
    return source;
  }
  if (target === "extract") {
    const files = source.entries.filter((entry) => !entry.dir);
    if (!files.length) {
      return failure("archive_empty");
    }
    return {
      ok: true,
      kind: "files",
      entries: files,
      folders: source.entries.length - files.length,
      notes: source.notes,
    };
  }
  const built = await buildArchive(
    source.entries,
    target as "zip" | "tar" | "tar-gz" | "gzip"
  );
  if (!built.ok) {
    return built;
  }
  return {
    ok: true,
    kind: "bytes",
    bytes: built.bytes,
    mime: built.mime,
    notes: source.notes,
  };
};

const imagePdf = async (
  files: readonly NamedFile[],
  paper: Paper
): Promise<ExtraResult> => {
  const images: PdfImage[] = [];
  for (const file of files) {
    const prepared = await prepareImageForPdf(file.bytes, file.sniffed);
    if (!prepared.ok) {
      return {
        ok: false,
        error: {
          ...prepared.error,
          detail: prepared.error.detail ?? file.name,
        },
      };
    }
    images.push(prepared.image);
    if (images.length > MAX_PAGES) {
      return failure("pdf_too_many_pages");
    }
  }
  return {
    ok: true,
    kind: "bytes",
    bytes: await buildImagePdf(images, paper),
    mime: "application/pdf",
    notes: [],
  };
};

const textOf = (
  input: ExtraInput
): { ok: true; text: string } | { ok: false; error: ConvertError } => {
  const decoded = decodeUtf8Strict(input.bytes ?? new Uint8Array(0));
  if (!decoded.ok) {
    return failure("invalid_utf8", { position: decoded.offset });
  }
  if (decoded.text.trim() === "") {
    return failure("empty");
  }
  if (decoded.text.length > MAX_DOCUMENT_CHARACTERS) {
    return failure("document_text_too_large", {
      detail: "4 million characters",
    });
  }
  return { ok: true, text: decoded.text };
};

const blocksOf = (
  text: string,
  name: string,
  mode: ExtraOptions["docMode"]
) => {
  const markdown =
    mode === "markdown" || (mode === "auto" && /\.(md|markdown)$/i.test(name));
  return markdown ? parseMarkdown(text) : parsePlain(text);
};

const runPdf = async (
  input: ExtraInput,
  options: ExtraOptions
): Promise<ExtraResult> => {
  if (input.kind === "image-set" && input.files) {
    return imagePdf(input.files, options.paper);
  }
  if (input.kind === "image") {
    return imagePdf(
      [
        {
          name: input.name,
          bytes: input.bytes ?? new Uint8Array(0),
          sniffed: input.sniffed,
        },
      ],
      options.paper
    );
  }
  const text = textOf(input);
  if (!text.ok) {
    return text;
  }
  const blocks = blocksOf(text.text, input.name, options.docMode);
  const notes: ConvertNote[] = [];
  if (drawableWithStandardFonts(text.text)) {
    const built = await buildTextPdf(blocks, options.paper);
    if (built.truncated) {
      notes.push({ code: "pdf_truncated", count: MAX_PAGES });
    }
    return {
      ok: true,
      kind: "bytes",
      bytes: built.bytes,
      mime: "application/pdf",
      notes,
    };
  }
  // The standard fonts cannot draw some of these characters: the browser
  // draws the pages with this device's fonts, and they go in as pictures.
  const drawn = await renderTextPagesAsImages(blocks, options.paper);
  if (!drawn.ok) {
    return drawn;
  }
  notes.push({ code: "pdf_pictures_of_text" });
  if (drawn.truncated) {
    notes.push({ code: "pdf_truncated", count: MAX_PAGES });
  }
  return {
    ok: true,
    kind: "bytes",
    bytes: await buildImagePdf(drawn.images, options.paper),
    mime: "application/pdf",
    notes,
  };
};

const runAudio = async (
  target: TargetId,
  input: ExtraInput,
  options: ExtraOptions
): Promise<ExtraResult> => {
  const bytes = input.bytes ?? new Uint8Array(0);
  const decoded = await decodeAudio(bytes, options.audioRate);
  if (!decoded.ok) {
    return decoded;
  }
  const notes: ConvertNote[] = [];
  const source = decoded.audio.channels;
  if (source.length > 2 && options.audioChannels === 2) {
    notes.push({ code: "audio_extra_channels", count: source.length });
  }
  const channels = mixChannels(source, options.audioChannels);
  if (target === "wav") {
    if (wavSize(channels[0]?.length ?? 0, channels.length) > MAX_WAV_BYTES) {
      return failure("audio_wav_too_large");
    }
    return {
      ok: true,
      kind: "bytes",
      bytes: encodeWav(channels, decoded.audio.sampleRate),
      mime: "audio/wav",
      notes,
    };
  }
  const mime = recorderType(target === "audio-webm" ? "webm" : "mp4");
  if (!mime) {
    return failure("audio_encoder_missing");
  }
  const recorded = await recordAudio(channels, decoded.audio.sampleRate, mime);
  if (!recorded.ok) {
    return recorded;
  }
  notes.push({ code: "audio_realtime" });
  return {
    ok: true,
    kind: "bytes",
    bytes: recorded.bytes,
    mime: recorded.mime,
    notes,
  };
};

const runVideo = async (
  target: TargetId,
  input: ExtraInput,
  options: ExtraOptions
): Promise<ExtraResult> => {
  const bytes = input.bytes ?? new Uint8Array(0);
  const mime = videoMime(bytes);
  if (target === "video-info") {
    const read = await readVideoInfo(bytes, mime);
    if (!read.ok) {
      return read;
    }
    return { ok: true, kind: "video-info", ...read.info, notes: [] };
  }
  const frame = await extractVideoFrame(
    bytes,
    mime,
    options.framePosition / 100,
    target === "video-png" ? "png" : "jpeg",
    options.quality
  );
  if (!frame.ok) {
    return frame;
  }
  return {
    ok: true,
    kind: "bytes",
    bytes: new Uint8Array(await frame.blob.arrayBuffer()),
    mime: frame.blob.type,
    width: frame.width,
    height: frame.height,
    notes: [{ code: "video_frame_at", count: Math.round(frame.at) }],
  };
};

/** Runs a conversion that the structured and text converters do not cover. */
export const runExtra = async (
  target: TargetId,
  input: ExtraInput,
  options: ExtraOptions
): Promise<ExtraResult> => {
  try {
    if (isArchiveTarget(target)) {
      return await runArchive(target, input);
    }
    switch (target) {
      case "pdf":
        return await runPdf(input, options);
      case "docx": {
        const text = textOf(input);
        if (!text.ok) {
          return text;
        }
        return {
          ok: true,
          kind: "bytes",
          bytes: await buildDocx(
            blocksOf(text.text, input.name, options.docMode),
            options.paper
          ),
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          notes: [],
        };
      }
      case "doc-text":
      case "doc-markdown": {
        const read = await readDocx(input.bytes ?? new Uint8Array(0));
        if (!read.ok) {
          return read;
        }
        return {
          ok: true,
          kind: "text",
          text:
            target === "doc-text"
              ? docxToPlain(read.blocks)
              : docxToMarkdown(read.blocks),
          notes: [{ code: "docx_features_dropped" }],
        };
      }
      case "wav":
      case "audio-webm":
      case "audio-mp4":
        return await runAudio(target, input, options);
      case "video-png":
      case "video-jpeg":
      case "video-info":
        return await runVideo(target, input, options);
      default:
        return failure("write_failed");
    }
  } catch (_err) {
    return failure("write_failed");
  }
};

/** Whether every file of a set is a picture the converter can read. */
export const allImages = (files: readonly NamedFile[]): boolean =>
  files.length > 0 && files.every((file) => IMAGE_KINDS.includes(file.sniffed));
