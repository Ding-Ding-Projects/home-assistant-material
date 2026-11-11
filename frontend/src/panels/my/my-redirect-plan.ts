import { sanitizeUrl } from "@braintree/sanitize-url";
import { createSearchParam } from "../../common/url/search-params";
import type { ParamType, Redirect } from "./ha-panel-my";

export type MyRedirectError =
  "not_supported" | "not_app" | "no_component" | "no_supervisor" | "url_error";

export interface MyRedirectContext {
  /** Query parameters of the incoming link. */
  params: Record<string, string>;
  /** The companion app has a settings screen to hand off to. */
  hasExternalSettingsScreen: boolean;
  /** The redirect's required component is loaded on this instance. */
  componentLoaded: boolean;
  /** The required component is a protocol integration with a picker. */
  isProtocolIntegration: boolean;
}

/**
 * What the panel does for an incoming link. Nothing in a plan has been
 * performed yet: a "confirm" plan is only performed after the person agrees.
 */
export type MyRedirectPlan =
  | { type: "error"; error: MyRedirectError }
  | {
      type: "confirm";
      /** What happens after the person confirms. */
      action: "navigate" | "external_app" | "protocol_picker";
      /** In-app path (or app screen) that will open, shown as text. */
      path: string;
      /** Query parameters that will be passed on, shown as text. */
      params: [string, string][];
      /** Component the destination belongs to, if any. */
      component?: string;
      /** Full URL to navigate to (navigate action only). */
      url?: string;
      navigateOutsideSpa?: boolean;
      /** Error shown after a protocol picker was started. */
      errorAfter?: MyRedirectError;
    };

const checkParamType = (type: ParamType, value: string): boolean => {
  if (type === "string" || type === "string?") {
    return true;
  }
  if (type === "url") {
    return !!value && value === sanitizeUrl(value);
  }
  return false;
};

const createRedirectParams = (
  redirect: Redirect,
  params: Record<string, string>
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, type] of Object.entries(redirect.params || {})) {
    const value = params[key];
    if (!value && type.endsWith("?")) {
      continue;
    }
    if (!value || !checkParamType(type, value)) {
      throw Error();
    }
    result[key] = value;
  }
  for (const [key, type] of Object.entries(redirect.optional_params || {})) {
    const value = params[key];
    if (value) {
      if (!checkParamType(type, value)) {
        throw Error();
      }
      result[key] = value;
    }
  }
  return result;
};

const withQuery = (path: string, query: Record<string, string>): string =>
  Object.keys(query).length ? `${path}?${createSearchParam(query)}` : path;

/** Build the destination URL exactly as the redirect always has. */
export const createMyRedirectUrl = (
  redirect: Redirect,
  params: Record<string, string>
): string => {
  // The Marketplace took over HACS, links to its integration page still say hacs
  if (
    redirect.redirect === "/config/integrations/integration" &&
    params.domain === "hacs"
  ) {
    const marketplaceParams = new URLSearchParams(
      createSearchParam(createRedirectParams(redirect, params))
    );
    marketplaceParams.set("domain", "marketplace");
    return `${redirect.redirect}?${marketplaceParams}`;
  }

  // supervisor_app/supervisor_addon use a path-based URL. Both "app" (new) and
  // "addon" (legacy) parameters are supported.
  if (redirect.redirect === "/config/app") {
    const appSlug = params.app || params.addon;
    if (appSlug) {
      const rest = { ...params };
      delete rest.app;
      delete rest.addon;
      const optional: Record<string, string> = {};
      for (const [key, type] of Object.entries(
        redirect.optional_params || {}
      )) {
        const value = rest[key];
        if (value) {
          if (!checkParamType(type, value)) {
            throw Error();
          }
          optional[key] = value;
        }
      }
      return withQuery(`/config/app/${appSlug}/info`, optional);
    }
  }

  return withQuery(redirect.redirect, createRedirectParams(redirect, params));
};

/** Split a URL into its path and the query parameters it carries. */
export const splitMyRedirectUrl = (
  url: string
): { path: string; params: [string, string][] } => {
  const index = url.indexOf("?");
  if (index === -1) {
    return { path: url, params: [] };
  }
  return {
    path: url.substring(0, index),
    params: [...new URLSearchParams(url.substring(index + 1)).entries()],
  };
};

/**
 * Decide what to show for an incoming link. Same checks, same order and same
 * destination as before; the only difference is that nothing is performed here.
 */
export const planMyRedirect = (
  redirect: Redirect | undefined,
  context: MyRedirectContext
): MyRedirectPlan => {
  if (!redirect) {
    return { type: "error", error: "not_supported" };
  }

  if (redirect.redirect === "#external-app-configuration") {
    if (context.hasExternalSettingsScreen) {
      return {
        type: "confirm",
        action: "external_app",
        path: redirect.redirect,
        params: [],
      };
    }
    return { type: "error", error: "not_app" };
  }

  if (redirect.component && !context.componentLoaded) {
    const error: MyRedirectError =
      redirect.component === "hassio" ? "no_supervisor" : "no_component";
    if (context.isProtocolIntegration) {
      return {
        type: "confirm",
        action: "protocol_picker",
        path: redirect.redirect,
        params: [],
        component: redirect.component,
        errorAfter: error,
      };
    }
    return { type: "error", error };
  }

  let url: string;
  try {
    url = createMyRedirectUrl(redirect, context.params);
  } catch (_err: any) {
    return { type: "error", error: "url_error" };
  }
  const { path, params } = splitMyRedirectUrl(url);
  return {
    type: "confirm",
    action: "navigate",
    path,
    params,
    component: redirect.component,
    url,
    navigateOutsideSpa: redirect.navigate_outside_spa,
  };
};
