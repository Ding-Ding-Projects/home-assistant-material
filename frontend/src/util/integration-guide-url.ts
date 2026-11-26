import { sanitizeHttpUrl } from "../common/url/sanitize-http-url";
import type { IntegrationManifest } from "../data/integration";

const ATLAS =
  "https://ding-ding-projects.github.io/home-assistant-integrations-documentation/integrations/";

// Published separately from the components bundled with Core.
const PACKAGE_GUIDES = new Set([
  "bin_day",
  "countdown",
  "edge_tts",
  "github_releases",
  "hello_package",
  "seed_tray",
  "sun_hours",
]);

type GuideManifest = Pick<
  IntegrationManifest,
  "domain" | "is_built_in" | "documentation"
>;

export const integrationGuideUrl = (manifest?: GuideManifest) => {
  if (!manifest) {
    return undefined;
  }
  if (
    /^[a-z0-9_]+$/.test(manifest.domain) &&
    (manifest.is_built_in || PACKAGE_GUIDES.has(manifest.domain))
  ) {
    return `${ATLAS}${manifest.domain}/`;
  }
  return sanitizeHttpUrl(manifest.documentation);
};
