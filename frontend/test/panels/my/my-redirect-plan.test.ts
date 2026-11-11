import { describe, expect, it } from "vitest";
import type { Redirect } from "../../../src/panels/my/ha-panel-my";
import {
  createMyRedirectUrl,
  escapeForDisplay,
  lookupMyRedirect,
  planMyRedirect,
  splitMyRedirectUrl,
} from "../../../src/panels/my/my-redirect-plan";

const context = (overrides = {}) => ({
  params: {},
  hasExternalSettingsScreen: false,
  componentLoaded: true,
  isProtocolIntegration: false,
  ...overrides,
});

const integration: Redirect = {
  redirect: "/config/integrations/integration",
  params: { domain: "string", search: "string?" },
};

// Written as code points so the source holds no raw invisible characters.
const ch = (code: number) => String.fromCharCode(code);

describe("planMyRedirect", () => {
  it("refuses an unknown redirect as before", () => {
    expect(planMyRedirect(undefined, context())).toEqual({
      type: "error",
      error: "not_supported",
    });
  });

  it("shows the destination and never a navigation for a known redirect", () => {
    const plan = planMyRedirect(
      integration,
      context({ params: { domain: "hue" } })
    );
    expect(plan).toMatchObject({
      type: "confirm",
      action: "navigate",
      path: "/config/integrations/integration",
      params: [["domain", "hue"]],
    });
  });

  it("shows exactly the parameters that are passed on", () => {
    const params = { domain: "hue", search: "bridge", ignored: "x" };
    const plan = planMyRedirect(integration, context({ params }));
    if (plan.type !== "confirm") {
      throw new Error("expected a confirmation");
    }
    expect(plan.params).toEqual(splitMyRedirectUrl(plan.url!).params);
    expect(plan.params).toEqual([
      ["domain", "hue"],
      ["search", "bridge"],
    ]);
    expect(plan.url).toBe(createMyRedirectUrl(integration, params));
  });

  it("keeps the parameter checks: a missing required parameter is an error", () => {
    expect(planMyRedirect(integration, context())).toEqual({
      type: "error",
      error: "url_error",
    });
  });

  it("keeps the url parameter check", () => {
    const redirect: Redirect = {
      redirect: "/config/blueprint/dashboard/import",
      params: { blueprint_url: "url" },
    };
    expect(
      planMyRedirect(
        redirect,
        context({
          params: { blueprint_url: ["java", "script:alert(1)"].join("") },
        })
      )
    ).toEqual({ type: "error", error: "url_error" });
  });

  it("keeps the component checks", () => {
    const redirect: Redirect = { component: "calendar", redirect: "/calendar" };
    expect(
      planMyRedirect(redirect, context({ componentLoaded: false }))
    ).toEqual({ type: "error", error: "no_component" });
    expect(
      planMyRedirect(
        { component: "hassio", redirect: "/config/apps" },
        context({ componentLoaded: false })
      )
    ).toEqual({ type: "error", error: "no_supervisor" });
  });

  it("waits for confirmation before a protocol picker starts", () => {
    const redirect: Redirect = {
      component: "zha",
      redirect: "/config/zha/add",
    };
    expect(
      planMyRedirect(
        redirect,
        context({ componentLoaded: false, isProtocolIntegration: true })
      )
    ).toMatchObject({
      type: "confirm",
      action: "protocol_picker",
      errorAfter: "no_component",
    });
  });

  it("waits for confirmation before handing off to the app", () => {
    const redirect: Redirect = { redirect: "#external-app-configuration" };
    expect(
      planMyRedirect(redirect, context({ hasExternalSettingsScreen: true }))
    ).toMatchObject({ type: "confirm", action: "external_app" });
    expect(planMyRedirect(redirect, context())).toEqual({
      type: "error",
      error: "not_app",
    });
  });

  it("keeps the app special case and its path", () => {
    const redirect: Redirect = {
      redirect: "/config/app",
      params: { app: "string" },
      optional_params: { repository_url: "url" },
    };
    const plan = planMyRedirect(
      redirect,
      context({ params: { addon: "core_ssh" } })
    );
    expect(plan).toMatchObject({
      type: "confirm",
      path: "/config/app/core_ssh/info",
      params: [],
    });
  });

  it("keeps the HACS fallback to the Marketplace", () => {
    const plan = planMyRedirect(
      integration,
      context({ params: { domain: "hacs" } })
    );
    expect(plan).toMatchObject({
      type: "confirm",
      params: [["domain", "marketplace"]],
    });
  });

  describe("app slug", () => {
    const appRedirect: Redirect = {
      redirect: "/config/app",
      params: { app: "string" },
      optional_params: { repository_url: "url" },
    };
    const planFor = (params: Record<string, string>) =>
      planMyRedirect(appRedirect, context({ params }));

    it("refuses a slug with dot segments", () => {
      for (const app of [
        "..",
        ".",
        "../../profile/security",
        "a/../b",
        "a.b",
      ]) {
        expect(planFor({ app })).toEqual({ type: "error", error: "url_error" });
      }
    });

    it("refuses a slug with a query, a fragment, a slash or an escape", () => {
      for (const app of [
        "core_ssh?x=1",
        "core_ssh#top",
        "a/b",
        "a%2Fb",
        "a b",
      ]) {
        expect(planFor({ app })).toEqual({ type: "error", error: "url_error" });
      }
    });

    it("accepts an ordinary slug and shows its resolved path", () => {
      expect(planFor({ app: "a0d7b954_ssh-2" })).toMatchObject({
        type: "confirm",
        path: "/config/app/a0d7b954_ssh-2/info",
      });
    });
  });

  describe("display data", () => {
    const oauth: Redirect = {
      redirect: "/auth/external/callback",
      navigate_outside_spa: true,
      params: { error: "string?", code: "string?", state: "string" },
    };

    it("never carries the value of a masked parameter", () => {
      const plan = planMyRedirect(
        oauth,
        context({ params: { code: "SECRET-CODE-1", state: "SECRET-STATE-2" } })
      );
      if (plan.type !== "confirm") {
        throw new Error("expected a confirmation");
      }
      const { url, ...display } = plan;
      const shown = JSON.stringify(display);
      expect(shown).not.toContain("SECRET-CODE-1");
      expect(shown).not.toContain("SECRET-STATE-2");
      expect(plan.maskedParams).toEqual(["code", "state"]);
      // The link itself still passes them on, and still needs the person.
      expect(url).toContain("SECRET-CODE-1");
      expect(plan.action).toBe("navigate");
    });

    it("masks a parameter whose name looks like a secret", () => {
      const redirect: Redirect = {
        redirect: "/config/logs",
        params: { api_token: "string?", search: "string?" },
      };
      const plan = planMyRedirect(
        redirect,
        context({ params: { api_token: "hunter2", search: "wifi" } })
      );
      if (plan.type !== "confirm") {
        throw new Error("expected a confirmation");
      }
      expect(JSON.stringify({ ...plan, url: undefined })).not.toContain(
        "hunter2"
      );
      expect(plan.params).toEqual([
        ["api_token", ""],
        ["search", "wifi"],
      ]);
    });

    it("shows control and direction override characters as U+XXXX", () => {
      expect(
        escapeForDisplay(
          [
            "a",
            ch(0x202e),
            "b",
            ch(0),
            "c",
            ch(0x200b),
            "d",
            ch(0x2066),
            "e",
          ].join("")
        )
      ).toBe("aU+202EbU+0000cU+200BdU+2066e");
      const plan = planMyRedirect(
        integration,
        context({ params: { domain: `hu${ch(0x202e)}e\n` } })
      );
      expect(plan).toMatchObject({
        params: [["domain", "huU+202EeU+000A"]],
      });
    });
  });

  describe("inherited names", () => {
    const inherited = [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
    ];

    it("are not redirects", () => {
      const redirects = { calendar: { redirect: "/calendar" } };
      expect(lookupMyRedirect(redirects, "calendar")).toBeDefined();
      for (const name of inherited) {
        expect(lookupMyRedirect(redirects, name)).toBeUndefined();
      }
      expect(lookupMyRedirect(undefined, "calendar")).toBeUndefined();
    });

    it("are not read as parameter values", () => {
      for (const name of inherited) {
        const redirect: Redirect = {
          redirect: "/config/logs",
          params: { [name]: "string" },
        };
        expect(planMyRedirect(redirect, context({ params: {} }))).toEqual({
          type: "error",
          error: "url_error",
        });
      }
      expect(
        planMyRedirect(
          {
            redirect: "/config/logs",
            optional_params: { toString: "string" as const },
          },
          context({ params: {} })
        )
      ).toMatchObject({ type: "confirm", params: [] });
    });
  });

  it("flags redirects that leave the single page app", () => {
    const redirect: Redirect = {
      redirect: "/auth/external/callback",
      navigate_outside_spa: true,
      params: { state: "string" },
    };
    expect(
      planMyRedirect(redirect, context({ params: { state: "s" } }))
    ).toMatchObject({ type: "confirm", navigateOutsideSpa: true });
  });
});
