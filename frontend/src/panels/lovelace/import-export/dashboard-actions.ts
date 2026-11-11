import { trackActivityAnnouncements } from "../../../common/activity/activity-announcer";
import {
  activityStore,
  finishActivity,
  startActivity,
} from "../../../common/activity/activity-store";
import { modeText } from "../../../common/language-mode/language-mode";
import { navigate } from "../../../common/navigate";
import type { LocalizeKeys } from "../../../common/translations/localize";
import {
  fetchFrontendSystemData,
  saveFrontendSystemData,
} from "../../../data/frontend";
import type {
  LovelaceConfig,
  LovelaceRawConfig,
} from "../../../data/lovelace/config/types";
import { fetchConfig, saveConfig } from "../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import type { LovelaceDashboard } from "../../../data/lovelace/dashboard";
import {
  createDashboard,
  deleteDashboard,
  fetchDashboards,
} from "../../../data/lovelace/dashboard";
import { getPanelTitleFromUrlPath } from "../../../data/panel";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import { showToast } from "../../../util/toast";
import { expandLovelaceConfigStrategies } from "../strategies/get-strategy";
import type {
  DashboardFileSettings,
  ParsedDashboardImport,
} from "./dashboard-file";
import {
  appendViewToConfig,
  buildDashboardEnvelope,
  buildViewEnvelope,
  configIsAsImported,
  exportFileName,
  pickNewDashboardUrlPath,
  removeImportedView,
} from "./dashboard-file";

/** The generated pages that can be turned into an editable dashboard. */
export const GENERATED_PAGES = [
  "home",
  "light",
  "security",
  "climate",
  "maintenance",
] as const;

export const isGeneratedPage = (urlPath: string): boolean =>
  (GENERATED_PAGES as readonly string[]).includes(urlPath);

const T = "ui.panel.lovelace.import_export";

const key = (suffix: string) => `${T}.${suffix}` as LocalizeKeys;

/** The element that shows toasts and dialogs, with the newest `hass`. */
export interface ImportExportContext {
  hass: HomeAssistant;
  element: HTMLElement;
}

/**
 * The element toasts and dialogs are fired from. Undo and Retry can run from
 * the activity tray after the page that started the work was left; the
 * page's element is then disconnected and its events reach nobody, so the
 * app root is used instead.
 */
const hostElement = (ctx: ImportExportContext): HTMLElement =>
  ctx.element.isConnected
    ? ctx.element
    : ((document.querySelector("home-assistant") as HTMLElement | null) ??
      document.body);

const currentHass = (ctx: ImportExportContext): HomeAssistant =>
  (hostElement(ctx) as { hass?: HomeAssistant }).hass ?? ctx.hass;

const isNotFound = (err: unknown): boolean =>
  (typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "not_found") ||
  /not.?found/i.test(errorText(err));

const errorText = (err: unknown): string =>
  err instanceof Error
    ? err.message
    : typeof err === "object" && err && "message" in err
      ? String((err as { message: unknown }).message)
      : "";

/**
 * The plain configuration of a generated page. The strategy is expanded into
 * the cards and views it shows today.
 */
export const generatedPageConfig = async (
  hass: HomeAssistant,
  urlPath: string
): Promise<LovelaceConfig> => {
  let raw: LovelaceRawConfig;
  if (urlPath === "home") {
    const [home, security] = await Promise.all([
      fetchFrontendSystemData(hass.connection, "home").catch(() => undefined),
      fetchFrontendSystemData(hass.connection, "security").catch(
        () => undefined
      ),
    ]);
    raw = {
      strategy: {
        type: "home",
        alert_entities: security?.alert_entities,
        favorite_entities: home?.favorite_entities,
        hide_welcome_message: home?.hide_welcome_message,
        hide_suggested_entities: home?.hide_suggested_entities,
        shortcuts: home?.shortcuts,
      },
    };
  } else if (urlPath === "security") {
    const security = await fetchFrontendSystemData(
      hass.connection,
      "security"
    ).catch(() => undefined);
    raw = {
      views: [
        {
          strategy: {
            type: "security",
            alert_entities: security?.alert_entities,
            favorite_entities: security?.favorite_entities,
          },
        },
      ],
    };
  } else {
    raw = { views: [{ strategy: { type: urlPath } }] };
  }
  return expandLovelaceConfigStrategies(raw, hass);
};

const downloadJson = (data: unknown, fileName: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  fileDownload(URL.createObjectURL(blob), fileName);
};

const settingsFor = (
  hass: HomeAssistant,
  urlPath: string,
  dashboard?: LovelaceDashboard
): DashboardFileSettings => ({
  title: dashboard?.title ?? getPanelTitleFromUrlPath(hass, urlPath) ?? urlPath,
  icon: dashboard?.icon,
  url_path: urlPath,
  require_admin: dashboard?.require_admin ?? false,
  show_in_sidebar: dashboard?.show_in_sidebar ?? true,
});

/** Downloads one dashboard as a file. Generated pages are exported expanded. */
export const exportDashboard = async (
  ctx: ImportExportContext,
  urlPath: string,
  options: { rawConfig?: LovelaceRawConfig; dashboard?: LovelaceDashboard } = {}
): Promise<void> => {
  const hass = currentHass(ctx);
  try {
    let dashboard = options.dashboard;
    if (!dashboard) {
      dashboard = (await fetchDashboards(hass).catch(() => [])).find(
        (item) => item.url_path === urlPath
      );
    }
    let config: LovelaceConfig;
    if (!options.rawConfig && isGeneratedPage(urlPath)) {
      config = await generatedPageConfig(hass, urlPath);
    } else {
      const raw =
        options.rawConfig ??
        (await fetchConfig(
          hass.connection,
          urlPath === "lovelace" ? null : urlPath,
          false
        ));
      config = await expandLovelaceConfigStrategies(raw, hass);
    }
    const settings = settingsFor(hass, urlPath, dashboard);
    downloadJson(
      buildDashboardEnvelope(settings, config),
      exportFileName(settings.title, "dashboard")
    );
  } catch (err) {
    showToast(hostElement(ctx), {
      message: hass.localize(key("export.failed"), { error: errorText(err) }),
      duration: 8000,
      dismissable: true,
    });
  }
};

/** Downloads one view (tab) of a dashboard as a file. */
export const exportView = async (
  ctx: ImportExportContext,
  urlPath: string,
  rawConfig: LovelaceRawConfig | undefined,
  viewIndex: number
): Promise<void> => {
  const hass = currentHass(ctx);
  try {
    const config = rawConfig
      ? await expandLovelaceConfigStrategies(rawConfig, hass)
      : await generatedPageConfig(hass, urlPath);
    const view = config.views[viewIndex] as LovelaceViewConfig | undefined;
    if (!view) {
      throw new Error("no view");
    }
    const dashboardTitle =
      getPanelTitleFromUrlPath(hass, urlPath) ??
      (await fetchDashboards(hass).catch(() => [])).find(
        (item) => item.url_path === urlPath
      )?.title;
    const viewTitle = view.title ?? view.path ?? dashboardTitle ?? "view";
    downloadJson(
      buildViewEnvelope(view, dashboardTitle),
      exportFileName(
        dashboardTitle ? `${dashboardTitle} ${viewTitle}` : viewTitle,
        "view"
      )
    );
  } catch (err) {
    showToast(hostElement(ctx), {
      message: hass.localize(key("export.failed"), { error: errorText(err) }),
      duration: 8000,
      dismissable: true,
    });
  }
};

const takenUrlPaths = (
  hass: HomeAssistant,
  dashboards: LovelaceDashboard[]
): Set<string> => {
  const taken = new Set<string>(["lovelace"]);
  dashboards.forEach((item) => taken.add(item.url_path));
  Object.keys(hass.panels).forEach((path) => taken.add(path));
  return taken;
};

/** The address a new dashboard would get right now, for showing. */
export const previewDashboardUrlPath = async (
  hass: HomeAssistant,
  title: string,
  preferred: string | undefined
): Promise<string> => {
  const dashboards = await fetchDashboards(hass).catch(() => []);
  return pickNewDashboardUrlPath(
    title,
    preferred,
    takenUrlPaths(hass, dashboards)
  );
};

// Imports and copies run one at a time. Each one reads the list of
// dashboards when it starts, so two at once would pick the same address.
let importQueue: Promise<unknown> = Promise.resolve();

const inSequence = <T>(task: () => Promise<T>): Promise<T> => {
  const run = importQueue.then(task, task);
  importQueue = run.catch(() => undefined);
  return run;
};

// Work that is already running, by name, so a repeated press adds nothing.
const busyWork = new Set<string>();

const runOnce = async (
  name: string,
  work: () => Promise<void>
): Promise<void> => {
  if (busyWork.has(name)) {
    return;
  }
  busyWork.add(name);
  try {
    await work();
  } finally {
    busyWork.delete(name);
  }
};

/**
 * Saves the default page for everyone who has no personal default. The
 * stored system data is read again first, so a change made elsewhere since
 * the page was opened is kept.
 */
export const saveDefaultPanel = async (
  hass: HomeAssistant,
  urlPath: string
): Promise<void> => {
  const fresh = await fetchFrontendSystemData(hass.connection, "core");
  await saveFrontendSystemData(hass.connection, "core", {
    ...(fresh ?? {}),
    default_panel: urlPath,
  });
};

/** Waits briefly until a new dashboard is known as a page, then opens it. */
const openDashboard = async (
  ctx: ImportExportContext,
  urlPath: string,
  edit: boolean
): Promise<void> => {
  for (let i = 0; i < 30 && !currentHass(ctx).panels[urlPath]; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  navigate(`/${urlPath}${edit ? "?edit=1" : ""}`);
};

interface CreatedDashboard {
  dashboard: LovelaceDashboard;
}

/** Creates a new stored dashboard and saves its configuration. */
const createDashboardWithConfig = async (
  hass: HomeAssistant,
  settings: DashboardFileSettings,
  config: LovelaceConfig,
  preferredPath?: string
): Promise<CreatedDashboard> =>
  inSequence(async () => {
    const dashboards = await fetchDashboards(hass);
    const urlPath = pickNewDashboardUrlPath(
      settings.title,
      preferredPath,
      takenUrlPaths(hass, dashboards)
    );
    const dashboard = await createDashboard(hass, {
      url_path: urlPath,
      mode: "storage",
      title: settings.title,
      icon: settings.icon,
      require_admin: settings.require_admin,
      show_in_sidebar: settings.show_in_sidebar,
    });
    try {
      await saveConfig(hass, dashboard.url_path, config);
    } catch (err) {
      // Leave nothing half made behind. When the cleanup fails too, the
      // error says which dashboard is left over.
      const cleaned = await deleteDashboard(hass, dashboard.id).then(
        () => true,
        () => false
      );
      if (!cleaned) {
        throw Object.assign(
          err instanceof Error ? err : new Error(errorText(err)),
          { leftOver: dashboard.title }
        );
      }
      throw err;
    }
    return { dashboard };
  });

export const importErrorText = (hass: HomeAssistant, error: string): string =>
  hass.localize(key(`errors.${error}`)) || hass.localize(key("errors.failed"));

/** Who sees an imported dashboard. Chosen by the person, never by the file. */
export interface ImportVisibility {
  requireAdmin: boolean;
  showInSidebar: boolean;
}

export const DEFAULT_IMPORT_VISIBILITY: ImportVisibility = {
  requireAdmin: true,
  showInSidebar: false,
};

const activityKey = (name: string) =>
  `ui.activity.import.${name}` as LocalizeKeys;

/** Ends an import activity as failed, with a way to try again. */
const failImportActivity = (
  hass: HomeAssistant,
  activityId: string,
  changedKey: string,
  err: unknown,
  retry: (() => Promise<void>) | undefined,
  values?: Record<string, string>
): void => {
  // A retry runs once per failed entry: the entry loses its Retry before the
  // work starts, so a second press or a later success cannot repeat it.
  const once = retry
    ? async () => {
        activityStore.amend(activityId, { retry: undefined });
        await retry();
      }
    : undefined;
  finishActivity(activityId, "failed", {
    message: `${importErrorText(hass, errorText(err) || "failed")} ${modeText(
      hass.localize as any,
      activityKey(changedKey),
      values
    )}`,
    details: errorText(err),
    retry: once,
  });
};

/**
 * One Undo for the toast and the tray. It runs one at a time and not again
 * once it worked, and the finished entry is amended to say so. `work`
 * returns true when the thing is undone or already gone and false when the
 * person chose to leave it.
 */
const singleUndo = (
  ctx: ImportExportContext,
  activityId: string,
  work: () => Promise<boolean>
): (() => Promise<void>) => {
  let state: "idle" | "running" | "done" = "idle";
  return async () => {
    if (state !== "idle") {
      return;
    }
    state = "running";
    try {
      const undone = await work();
      state = undone ? "done" : "idle";
      if (undone) {
        activityStore.amend(activityId, {
          undo: undefined,
          message: currentHass(ctx).localize(key("undone")),
        });
        showToast(hostElement(ctx), {
          message: currentHass(ctx).localize(key("undone")),
        });
      }
    } catch (err) {
      state = "idle";
      showToast(hostElement(ctx), {
        message: currentHass(ctx).localize(key("undo_failed"), {
          error: errorText(err),
        }),
        duration: 8000,
        dismissable: true,
      });
    }
  };
};

const showImportError = (ctx: ImportExportContext, error: string) => {
  const hass = currentHass(ctx);
  showToast(hostElement(ctx), {
    message: `${hass.localize(key("not_imported"))} ${importErrorText(hass, error)}`,
    duration: 10000,
    dismissable: true,
  });
};

/**
 * Imports a checked dashboard file as a new dashboard and offers to open it
 * or undo it. Nothing is overwritten and nothing is opened unasked.
 */
export const importDashboardData = async (
  ctx: ImportExportContext,
  parsed: Extract<ParsedDashboardImport, { ok: true; kind: "dashboard" }>,
  options: ImportVisibility = DEFAULT_IMPORT_VISIBILITY
): Promise<void> => {
  const hass = currentHass(ctx);
  if (!hass.user?.is_admin) {
    showImportError(ctx, "admin_only");
    return;
  }
  trackActivityAnnouncements(hass.localize);
  const activityId = startActivity({
    title: modeText(hass.localize as any, activityKey("dashboard_title"), {
      title: parsed.settings.title,
    }),
    kind: "import",
  });
  try {
    // The person's choices count, whatever the file says.
    const { dashboard } = await createDashboardWithConfig(
      hass,
      {
        ...parsed.settings,
        require_admin: options.requireAdmin,
        show_in_sidebar: options.showInSidebar,
      },
      parsed.config,
      parsed.settings.url_path
    );
    const undo = singleUndo(ctx, activityId, async () => {
      // Undo removes the dashboard, so first check it is still there and
      // still as it was imported. If it was edited, the person decides.
      const stillThere = (await fetchDashboards(currentHass(ctx))).some(
        (item) => item.id === dashboard.id
      );
      if (!stillThere) {
        return true;
      }
      const current = await fetchConfig(
        currentHass(ctx).connection,
        dashboard.url_path,
        true
      ).catch(() => undefined);
      if (!current || !configIsAsImported(current, parsed.config)) {
        const hassNow = currentHass(ctx);
        const sure = await showConfirmationDialog(hostElement(ctx), {
          title: hassNow.localize(key("undo_edited.title")),
          text: hassNow.localize(key("undo_edited.text")),
          confirmText: hassNow.localize(key("undo_edited.confirm")),
          dismissText: hassNow.localize("ui.common.cancel"),
          destructive: true,
        });
        if (!sure) {
          return false;
        }
      }
      try {
        await deleteDashboard(currentHass(ctx), dashboard.id);
      } catch (err) {
        if (!isNotFound(err)) {
          throw err;
        }
      }
      return true;
    });
    showToast(hostElement(ctx), {
      message: `${hass.localize(key("imported"), { title: dashboard.title })}${
        parsed.stripped ? ` ${hass.localize(key("stripped_note"))}` : ""
      }`,
      duration: 12000,
      dismissable: true,
      action: {
        text: hass.localize(key("open")),
        action: () => {
          void openDashboard(ctx, dashboard.url_path, false);
        },
      },
      secondaryAction: {
        text: hass.localize(key("undo")),
        action: undo,
      },
    });
    finishActivity(activityId, "done", {
      message: hass.localize(key("imported"), { title: dashboard.title }),
      openPath: `/${dashboard.url_path}`,
      undo: { label: hass.localize(key("undo")), run: undo },
    });
  } catch (err) {
    const leftOver = (err as { leftOver?: string } | undefined)?.leftOver;
    failImportActivity(
      hass,
      activityId,
      leftOver ? "dashboard_failed_left" : "dashboard_failed_changed",
      err,
      // Another try would make a second dashboard next to the left over one.
      leftOver ? undefined : () => importDashboardData(ctx, parsed, options),
      leftOver ? { title: leftOver } : undefined
    );
    showImportError(ctx, errorText(err) || "failed");
  }
};

/** Adds an imported view at the end of a chosen stored dashboard. */
export const importViewData = async (
  ctx: ImportExportContext,
  parsed: Extract<ParsedDashboardImport, { ok: true; kind: "view" }>,
  targetUrlPath: string
): Promise<void> => {
  const hass = currentHass(ctx);
  if (!hass.user?.is_admin) {
    showImportError(ctx, "admin_only");
    return;
  }
  trackActivityAnnouncements(hass.localize);
  const activityId = startActivity({
    title: modeText(hass.localize as any, activityKey("view_title")),
    kind: "import",
  });
  try {
    // Read and save in one step, one import at a time, so a second import
    // into the same dashboard starts from what the first one saved.
    const addedView = await inSequence(async () => {
      const raw = await fetchConfig(
        hass.connection,
        targetUrlPath === "lovelace" ? null : targetUrlPath,
        true
      );
      // A dashboard that is generated has to be a plain configuration first.
      const config = await expandLovelaceConfigStrategies(raw, hass);
      const updated = appendViewToConfig(config, parsed.view);
      await saveConfig(
        hass,
        targetUrlPath === "lovelace" ? null : targetUrlPath,
        updated
      );
      return updated.views[updated.views.length - 1];
    });
    const undo = singleUndo(ctx, activityId, async () => {
      // Remove only the added view, and only while it is still as
      // imported. Later edits to the dashboard are never overwritten.
      const path = targetUrlPath === "lovelace" ? null : targetUrlPath;
      let current: LovelaceRawConfig;
      try {
        current = await fetchConfig(currentHass(ctx).connection, path, true);
      } catch (err) {
        if (isNotFound(err)) {
          // The dashboard itself is gone, so the view is too.
          return true;
        }
        throw err;
      }
      const without = removeImportedView(current, addedView);
      if (!without) {
        showToast(hostElement(ctx), {
          message: currentHass(ctx).localize(key("undo_view_changed")),
          duration: 8000,
          dismissable: true,
        });
        return false;
      }
      await saveConfig(currentHass(ctx), path, without);
      return true;
    });
    showToast(hostElement(ctx), {
      message: `${hass.localize(key("view_imported"))}${
        parsed.stripped ? ` ${hass.localize(key("stripped_note"))}` : ""
      }`,
      duration: 12000,
      dismissable: true,
      action: {
        text: hass.localize(key("open")),
        action: () => {
          void openDashboard(ctx, targetUrlPath, false);
        },
      },
      secondaryAction: {
        text: hass.localize(key("undo")),
        action: undo,
      },
    });
    finishActivity(activityId, "done", {
      message: hass.localize(key("view_imported")),
      openPath:
        targetUrlPath === "lovelace" ? "/lovelace" : `/${targetUrlPath}`,
      undo: { label: hass.localize(key("undo")), run: undo },
    });
  } catch (err) {
    failImportActivity(hass, activityId, "view_failed_changed", err, () =>
      importViewData(ctx, parsed, targetUrlPath)
    );
    showImportError(ctx, errorText(err) || "failed");
  }
};

/**
 * Makes an editable dashboard from a generated page: expands it into plain
 * configuration, saves it as a new stored dashboard, offers to make it the
 * default page and opens it in edit mode. The generated page stays as it is.
 */
const copyGeneratedPage = async (
  ctx: ImportExportContext,
  source: { urlPath: string; title: string; rawConfig?: LovelaceRawConfig }
): Promise<void> => {
  const hass = currentHass(ctx);
  const confirmed = await showConfirmationDialog(hostElement(ctx), {
    title: hass.localize(key("edit_copy.title")),
    text: hass.localize(key("edit_copy.text")),
    confirmText: hass.localize(key("edit_copy.confirm")),
    dismissText: hass.localize("ui.common.cancel"),
  });
  if (!confirmed) {
    return;
  }
  try {
    const config = source.rawConfig
      ? await expandLovelaceConfigStrategies(source.rawConfig, hass)
      : await generatedPageConfig(hass, source.urlPath);
    const { dashboard } = await createDashboardWithConfig(
      hass,
      {
        title: hass.localize(key("edit_copy.name"), { title: source.title }),
        require_admin: false,
        show_in_sidebar: true,
      } as DashboardFileSettings,
      config
    );
    const makeDefault = await showConfirmationDialog(hostElement(ctx), {
      title: hass.localize(key("edit_copy.default_title")),
      text: hass.localize(key("edit_copy.default_text")),
      confirmText: hass.localize(key("edit_copy.default_yes")),
      dismissText: hass.localize(key("edit_copy.default_no")),
    });
    if (makeDefault) {
      try {
        await saveDefaultPanel(currentHass(ctx), dashboard.url_path);
      } catch (err) {
        showToast(hostElement(ctx), {
          message: hass.localize(key("edit_copy.default_failed"), {
            error: errorText(err),
          }),
          duration: 8000,
          dismissable: true,
        });
      }
    }
    await openDashboard(ctx, dashboard.url_path, true);
  } catch (err) {
    showToast(hostElement(ctx), {
      message: hass.localize(key("edit_copy.failed"), {
        error: errorText(err),
      }),
      duration: 0,
      dismissable: true,
    });
  }
};

/** Makes an editable copy. A repeated press while it runs does nothing. */
export const makeEditableCopy = (
  ctx: ImportExportContext,
  source: { urlPath: string; title: string; rawConfig?: LovelaceRawConfig }
): Promise<void> =>
  runOnce(`copy:${source.urlPath}`, () => copyGeneratedPage(ctx, source));
