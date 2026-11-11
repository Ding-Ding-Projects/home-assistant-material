/**
 * How long the next try waits after this many wrong ones in a row:
 * nothing for the first two, then 5 seconds, 15 seconds, 1 minute, and
 * 5 minutes from then on. The wait only slows down guessing; nothing is
 * ever wiped.
 */
/** The longest wait the code itself ever sets. */
export const MAX_LOCK_WAIT_MS = 300000;

export const waitForFailures = (failures: number): number => {
  if (failures < 3) {
    return 0;
  }
  if (failures === 3) {
    return 5000;
  }
  if (failures === 4) {
    return 15000;
  }
  if (failures === 5) {
    return 60000;
  }
  return MAX_LOCK_WAIT_MS;
};
