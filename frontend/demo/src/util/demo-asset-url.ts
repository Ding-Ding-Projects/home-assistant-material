/** Resolve a sample asset alongside the demo's static files. */
export const demoAssetUrl = (path: string): string =>
  new URL(`../assets/${path}`, new URL(__STATIC_PATH__, document.baseURI)).href;
