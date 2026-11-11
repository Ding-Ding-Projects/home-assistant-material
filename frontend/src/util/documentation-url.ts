import { installHelpLinkDoor } from "../components/help/open-help-article";
import type { HomeAssistantConfig } from "../types";

const DOCUMENTATION_DOMAIN = "home-assistant.io";

export const DOCUMENTATION_URL = `https://www.${DOCUMENTATION_DOMAIN}`;

export const SECURE_CONNECTION_DOCUMENTATION_PATH =
  "/docs/configuration/securing/#remote-access";

export const documentationUrl = (
  { config }: Pick<HomeAssistantConfig, "config">,
  path: string
) => documentationUrlForVersion(config.version, path);

/**
 * The address of a documentation page. Clicks on it never leave the
 * interface: the help link door opens the offline copy of the article in
 * the reader instead (see components/help/open-help-article.ts).
 */
export const documentationUrlForVersion = (version: string, path: string) => {
  installHelpLinkDoor();
  return `https://${
    version.includes("b") ? "rc" : version.includes("dev") ? "next" : "www"
  }.${DOCUMENTATION_DOMAIN}${path}`;
};
