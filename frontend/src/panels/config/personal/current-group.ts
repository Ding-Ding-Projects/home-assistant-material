/**
 * Picks the group to mark as the one in view: the first group, in page order,
 * that currently intersects the reading area. Returns undefined when none is
 * in view, so the marker is cleared instead of left on a stale group.
 */
export const pickCurrentGroup = (
  order: readonly string[],
  visible: ReadonlySet<string>
): string | undefined => order.find((id) => visible.has(id));
