const KIB = 1024;
const MIB = 1024 * 1024;
const GIB = 1024 * 1024 * 1024;

/**
 * A size for the person: gigabytes from 1 GB up (whole when it is a whole
 * number, else one decimal), megabytes below that, kilobytes under 1 MB.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes >= GIB) {
    const gigabytes = bytes / GIB;
    return Number.isInteger(gigabytes)
      ? `${gigabytes} GB`
      : `${Math.round(gigabytes * 10) / 10} GB`;
  }
  if (bytes >= MIB) {
    return `${Math.round(bytes / MIB)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / KIB))} KB`;
};
