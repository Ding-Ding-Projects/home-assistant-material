# File converter

Code: `frontend/src/panels/config/tools/converter/`, `frontend/src/common/converter/`.

## What it does

Tools, Convert changes a file or pasted text into another form, in the browser. Nothing is
uploaded, nothing is fetched at run time, and no script, font or service is loaded from outside
the page. The categories and their status chips follow what works on the device in use: Ready,
Limited or Unavailable, with the reason beside it.

- **Images**: PNG, JPEG and WebP, with quality and size options.
- **Data**: JSON, YAML, CSV, TSV and Markdown tables.
- **Text**: Base64 and its decoding, hex and its decoding, URL encoding and decoding, line endings
  (LF, CRLF, CR) and letter case.
- **Archives**: ZIP and TAR (ustar) to read and write, GZIP of a single file, and TAR.GZ.
  Conversions between them, a set of dropped files packed into one archive, and a list of what an
  archive holds with a download for each file.
- **Documents and PDF**: plain text or Markdown to PDF, one or more pictures to PDF (one per
  page), Word (`.docx`) to plain text or Markdown, and plain text or Markdown to `.docx`.
- **Audio**: any sound the browser can decode, written as 16-bit WAV (mono or stereo, chosen
  sample rate), and WebM Opus or MP4 audio when this browser can write them.
- **Video** (status Limited): one still picture from a video the browser can play, as PNG or
  JPEG, and the video's length and size.

Several files dropped or chosen together can be packed into an archive, or, if they are all
pictures, into one PDF.

## How each part works

- **Archives** (`archive.ts`, `zip.ts`, `tar.ts`, `streams.ts`). The ZIP reader and writer are
  our own code: local headers, central directory, CRC-32, UTF-8 names, store and deflate. Deflate
  and gzip use the browser's `CompressionStream` and `DecompressionStream`, which is why
  GZIP and TAR.GZ are offered only where those exist; ZIP and TAR can still be written
  uncompressed without them. Encrypted ZIPs, ZIP64, split archives and unusual compression
  methods are refused with a clear message.
- **Archive safety.** Before anything is unpacked the central directory is checked: at most
  5,000 entries, at most 100 MB unpacked in all, and a compression ratio of at most 200 once past
  1 MB (the zip bomb guard). Unpacking is stopped at the size the archive itself declares, and
  every checksum is verified. Paths that climb (`..`), absolute paths, drive letters, UNC paths
  and names with control, zero-width, direction-override or other deceiving characters make the
  whole archive refused. A saved name has those characters stripped, trailing dots and spaces
  removed, Windows device names (con, nul, com1 and so on) prefixed, and a long name is cut with
  its extension kept. Names are shown inside `<bdi>`. The TAR reader accepts a pax `size` only as
  a non-negative integer, applies pax records to the next file header only, and requires the read
  position to grow on every header. The ZIP end record is only accepted when its comment length
  reaches the end of the file and the directory it names ends where the record starts, so a
  record forged inside the comment is ignored. Links and device files in a
  TAR, and symbolic links in a ZIP, are skipped and counted, never followed. Nothing is written
  anywhere except into a download the person asks for.
- **PDF writing** (`pdf.ts`, `layout.ts`, `pdf-fonts.ts`, `pdf-canvas.ts`). Text is typeset by
  our own layout (wrapping, headings, lists, quotes, code, rules, page breaks, at most 500 pages)
  and written with the 14 standard PDF fonts, so it is real, searchable text. A character the
  standard fonts cannot draw (Chinese, for one) sends the whole document through the canvas:
  the browser draws the pages with the fonts of the device and they are embedded as JPEG
  pictures. Such a PDF is pictures of text, is not searchable, and says so on the page.
  Pictures go in one per page: a JPEG with no Exif segment and no rotation is embedded byte for
  byte (DCT); anything else, including a photo that carries location or camera details, is
  decoded, drawn on white and written again as a JPEG without that metadata. Only compressed
  bytes are kept (the total is capped at 150 MB) and each canvas is released after use. The JPEG
  header reader takes the orientation from the first Exif segment only and refuses frames that
  are not 8 bit or have no height.
- **Word** (`docx.ts`). Reading takes the paragraphs, headings, lists (bullet or numbered, from
  the numbering part), quotes and tables from `word/document.xml`; deleted text of tracked changes
  is left out. A document that declares a doctype or an entity is refused, the main part is
  limited to 8 MB, and list levels are clamped to 0 to 4. Markdown written from a document
  escapes line starts, brackets and angle brackets so the text cannot become live Markdown.
  Writing builds a minimal package (content types, relationships, styles,
  numbering, document) that Word and LibreOffice open. Pictures, comments, headers, footnotes
  and page layout are not carried over, and the result page says so.
- **Audio** (`audio.ts`). `OfflineAudioContext.decodeAudioData` decodes at the chosen sample
  rate, so there is one resampling step. WAV is written by our own encoder. WebM Opus and MP4
  are produced by `MediaRecorder`, and a format is listed only when `MediaRecorder.isTypeSupported`
  says yes. `MediaRecorder` works in real time, so those two take as long as the sound lasts
  and are limited to 5 minutes; nothing is played aloud. Decoding and recording wait at most a
  fixed time (the sound's length times 1.5 plus 10 seconds for recording), take an
  `AbortSignal`, and stop the source, the recorder and the context when it fires, so a phone that
  never answers cannot leave the page busy.
- **Video** (`video.ts`). The browser plays the video from a local object URL: seek, draw to a
  canvas, save as PNG or JPEG. Only videos the browser can play are accepted. The page waits for
  `loadedmetadata` and then always seeks, because some phones never fire `loadeddata` for a
  video that is not on the page; the pixel count is checked as well as the longest side.

## What is not offered, and why

Each reason is also shown on the page under the category.

- **Reading a PDF.** PDFs made by other programs use compressed object streams and fonts with
  custom encodings, so extracting their text reliably needs a full PDF reader. Not offered.
- **HTML to PDF.** It would need a layout engine. Use the browser's print dialog and Save as PDF.
- **`.doc`, `.odt`, RTF, Pages.** They need converter libraries this page does not carry. Save as
  `.docx` first.
- **MP3, FLAC, OGG, AAC output.** Browsers do not ship encoders for them, and a WebAssembly
  encoder would add megabytes. WAV, and WebM or MP4 where the browser can, are what is offered.
- **Converting video to another video format.** It needs an encoder such as FFmpeg, which is tens
  of megabytes and is not bundled. Nothing is downloaded at run time to make up for it.
- **7z, RAR, encrypted and ZIP64 archives.**

No dependency was added for any of this. The ZIP, TAR, GZIP, PDF, Word and WAV code is ours; the
browser supplies deflate, audio decoding, `MediaRecorder` and video playback.

## Limits and failure modes

Single inputs are limited to 20 MB (`common/converter/types.ts`), a set of files to 200 files and
100 MB in all. Structured data is limited to a nesting depth of 256 and 2,000,000 nodes, and text
output to 80,000,000 characters. Sound: compressed files up to 4 MB (WAV up to the 20 MB limit),
15 minutes, and a WAV of at most 100 MB, because decoded sound is many times larger than the
file. Text turned into a document: 4 million characters, 500 pages. An input that cannot be read
in the chosen form is refused with a message and nothing is written.

Archives, documents, sound and video run when Convert is pressed, not as options change, because
they take real work. While one runs Convert is disabled, and leaving the page or changing the
input stops a running sound conversion; pictures, data and text keep their live preview.

A video is played from a `blob:` URL; a deployment whose Content Security Policy does not allow
`media-src blob:` would make video details and pictures fail with "this browser cannot play this
video".

## Verification

Unit tests in `frontend/test/common/converter/`:

- ZIP, TAR and GZIP: round trips, interoperability with another ZIP reader and with Node's gzip,
  long and non-ASCII TAR names, tampered checksums, encrypted and ZIP64 refusal, the zip bomb and
  a lying size, unsafe paths.
- Hostile inputs (`hostile-inputs.test.ts`): a TAR with a negative pax size, a ZIP end record
  forged in the comment, JPEG segment order, quadratic Markdown patterns with timing guards,
  doctype and entity refusal, list levels, Markdown escaping, deceiving names and font widths.
- Layout, PDF structure (the cross-reference table points at real objects), JPEG header reading,
  Word write then read, tables, tracked-change text, invalid XML characters.
- WAV encoding and header, channel mixing, file sniffing, which formats are offered, status chips
  per capability, file names, a check that every error and remark code has a translation.

The PDFs and the Word file written by the code were also opened with an independent reader
(poppler's `pdftotext`, and an XML parser over the `.docx` parts) and their text came out as
written. Audio decoding and encoding, video frame extraction, canvas-drawn PDF pages and picture
embedding need a browser and are not covered by unit tests. None of it has been seen in a running
build or on a phone.
