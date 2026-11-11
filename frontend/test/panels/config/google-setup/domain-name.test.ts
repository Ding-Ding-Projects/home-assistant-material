import { describe, expect, it } from "vitest";
import {
  integrationDisplayName,
  tidyDomain,
} from "../../../../src/panels/config/google-setup/domain-name";

// Step 4 of the Google setup lists the integrations. Their names are loaded
// from the translations on request, so for a moment (or for an integration
// without one) the name is the raw domain. These protect that no raw domain
// such as google_drive is ever shown as a name.

describe("tidyDomain", () => {
  it("turns a domain into words", () => {
    expect(tidyDomain("google_drive")).toBe("Google Drive");
    expect(tidyDomain("google_assistant_sdk")).toBe("Google Assistant Sdk");
    expect(tidyDomain("nest")).toBe("Nest");
  });

  it("ignores empty parts", () => {
    expect(tidyDomain("__google__mail_")).toBe("Google Mail");
    expect(tidyDomain("")).toBe("");
  });
});

describe("integrationDisplayName", () => {
  it("uses the translated name when there is one", () => {
    expect(integrationDisplayName("Google Mail", "google_mail")).toBe(
      "Google Mail"
    );
  });

  it("tidies the domain when the translation is missing or is the domain", () => {
    expect(integrationDisplayName("", "google_drive")).toBe("Google Drive");
    expect(integrationDisplayName("google_drive", "google_drive")).toBe(
      "Google Drive"
    );
  });
});
