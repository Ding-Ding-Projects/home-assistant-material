export interface ScreenSize {
  id: "phone" | "tablet" | "wall" | "desktop";
  width: number;
  height: number;
  /** How much the frame is shrunk to fit beside the others. */
  scale: number;
}

/** The screens previewed side by side, in CSS pixels. */
export const SCREENS: ScreenSize[] = [
  { id: "phone", width: 390, height: 760, scale: 0.5 },
  { id: "tablet", width: 820, height: 600, scale: 0.4 },
  { id: "wall", width: 1280, height: 800, scale: 0.3 },
  { id: "desktop", width: 1440, height: 800, scale: 0.28 },
];

/**
 * The address of one view of the dashboard that is open now, on the same
 * origin. The dashboard's own path is the first segment of the current
 * address, so this works for the default dashboard and for any other.
 */
export const viewAddress = (
  pathname: string,
  viewPath: string | undefined,
  viewIndex: number
): string => {
  const base = pathname.split("/").filter(Boolean)[0] ?? "lovelace";
  return `/${base}/${encodeURIComponent(viewPath || String(viewIndex))}`;
};
