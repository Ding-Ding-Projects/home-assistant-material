import { HELP_INTEGRATIONS_INDEX_URL } from "./help-article-path";

let domains: Promise<ReadonlySet<string>> | undefined;

/**
 * The integration domains that have a bundled help article. Read once from
 * the offline bundle; an unreadable bundle means no domain has one.
 */
export const loadHelpIntegrationDomains = (): Promise<ReadonlySet<string>> => {
  if (!domains) {
    domains = (async () => {
      try {
        const response = await fetch(HELP_INTEGRATIONS_INDEX_URL);
        if (!response.ok) {
          return new Set<string>();
        }
        const data = (await response.json()) as {
          integrations?: { domain: string }[];
        };
        return new Set((data.integrations ?? []).map((i) => i.domain));
      } catch (_err) {
        return new Set<string>();
      }
    })();
  }
  return domains;
};
