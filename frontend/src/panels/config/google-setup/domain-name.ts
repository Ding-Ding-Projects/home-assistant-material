/**
 * The name to show for an integration whose translated name is not available.
 * `domainToName` falls back to the raw domain, such as `google_drive`; this
 * turns that into words (`Google Drive`) so no raw identifier shows as a name.
 */
export const tidyDomain = (domain: string): string =>
  domain
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * The shown name of an integration: its translated name when there is one,
 * otherwise a tidied form of its domain.
 */
export const integrationDisplayName = (
  translated: string,
  domain: string
): string =>
  !translated || translated === domain ? tidyDomain(domain) : translated;
