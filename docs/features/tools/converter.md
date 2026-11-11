# File converter

Code: `frontend/src/panels/config/tools/converter/`, `frontend/src/common/converter/`.

## What it does

Tools, Convert changes a file or pasted text into another form, in the browser:

- Data: JSON, YAML, CSV, TSV and Markdown tables.
- Images: PNG, JPEG and WebP.
- Text: Base64 and its decoding, hex and its decoding, URL encoding and decoding, line endings
  (LF, CRLF, CR) and letter case.

Documents, audio, video and archives are listed as unavailable, because this build carries no
software for them.

## Limits and failure modes

Inputs are limited to 20 MB, to a nesting depth of 256 and 2,000,000 nodes, and the output to
80,000,000 characters (`common/converter/types.ts`). An input that cannot be read in the chosen
form is refused with a message and nothing is written. Everything happens in the browser; no
file is uploaded.

## Verification

Unit tests only. Not seen in a running build.
