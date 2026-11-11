/* eslint-disable no-await-in-loop -- chunks are read in order */
/**
 * Deflate and gzip through the browser's own compression streams. Nothing
 * is fetched; the work is done by the browser. Reading is always capped, so
 * a small file that expands to a huge one is stopped before it is held in
 * memory.
 */

/** Raw deflate, zlib-wrapped deflate (as PDF uses) and gzip. */
type Format = "deflate-raw" | "deflate" | "gzip";

/** Whether this browser can compress and decompress with the given format. */
export const compressionAvailable = (
  format: Format = "deflate-raw"
): boolean => {
  try {
    if (
      typeof CompressionStream === "undefined" ||
      typeof DecompressionStream === "undefined"
    ) {
      return false;
    }
    // Older browsers throw for formats they do not know.
    new CompressionStream(format);
    new DecompressionStream(format);
    return true;
  } catch (_err) {
    return false;
  }
};

export class StreamLimitError extends Error {}

/**
 * Pushes the bytes through a transform and collects the output. The output
 * may not be longer than `limit` bytes: past it the stream is cancelled and
 * a StreamLimitError is thrown.
 */
const run = async (
  transform: { readable: ReadableStream; writable: WritableStream },
  input: Uint8Array,
  limit: number
): Promise<Uint8Array> => {
  const writer = transform.writable.getWriter();
  // Errors of the writing side also surface on the reading side.
  const written = writer
    .write(input as BufferSource)
    .then(() => writer.close())
    .catch(() => undefined);
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = value as Uint8Array;
      total += chunk.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new StreamLimitError();
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
    await written;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
};

export const compress = (
  bytes: Uint8Array,
  format: Format = "deflate-raw"
): Promise<Uint8Array> =>
  run(new CompressionStream(format), bytes, bytes.length + 1024 * 1024);

/** Throws StreamLimitError when the result would pass `limit`. */
export const decompress = (
  bytes: Uint8Array,
  limit: number,
  format: Format = "deflate-raw"
): Promise<Uint8Array> => run(new DecompressionStream(format), bytes, limit);
