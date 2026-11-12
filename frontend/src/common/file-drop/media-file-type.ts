/**
 * Some systems hand over a chosen file without a type. A phone's file picker
 * does this for formats the phone itself cannot play (Ogg audio, for one), and
 * an upload without a media type is refused. The name still says what it is.
 */
const TYPE_BY_EXTENSION: Record<string, string> = {
  // Audio
  aac: "audio/aac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  mid: "audio/midi",
  midi: "audio/midi",
  mka: "audio/x-matroska",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
  weba: "audio/webm",
  wma: "audio/x-ms-wma",
  // Video
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  m4v: "video/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  ogv: "video/ogg",
  ts: "video/mp2t",
  webm: "video/webm",
  wmv: "video/x-ms-wmv",
  // Pictures
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

const isMediaType = (type: string): boolean =>
  /^(image|video|audio)\//i.test(type);

/** The media type a file name stands for, or nothing when it is not media. */
export const mediaTypeFromName = (name: string): string | undefined => {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return undefined;
  }
  return TYPE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()];
};

/**
 * The same file with a media type filled in from its name, when the system
 * gave none (or a general one) and the name is a known media format. A file
 * that already has a media type, or whose name says nothing, comes back as is.
 */
export const withMediaType = (file: File): File => {
  if (isMediaType(file.type)) {
    return file;
  }
  const type = mediaTypeFromName(file.name);
  if (!type) {
    return file;
  }
  return new File([file], file.name, {
    type,
    lastModified: file.lastModified,
  });
};
