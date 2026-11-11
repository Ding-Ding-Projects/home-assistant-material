import { describe, expect, it } from "vitest";
import type { Redirect } from "../../../src/panels/my/ha-panel-my";
import {
  createMyRedirectUrl,
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
