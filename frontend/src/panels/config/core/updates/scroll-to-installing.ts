/** The updates that started running since the last look; none on the first look. */
export const newlyInstalling = (
  previous: ReadonlySet<string> | undefined,
  now: readonly string[]
): string[] =>
  previous ? now.filter((entityId) => !previous.has(entityId)) : [];

/** Smooth scrolling is left out when motion is reduced. */
export const scrollBehaviorFor = (reduced: boolean): ScrollBehavior =>
  reduced ? "auto" : "smooth";
