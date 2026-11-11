import type { LocalizeKeys } from "../../../common/translations/localize";
import { showToast } from "../../../util/toast";
import type { ImportExportContext } from "./dashboard-actions";
import {
  importDashboardData,
  importErrorText,
  importViewData,
} from "./dashboard-actions";
import type { ParsedDashboardImport } from "./dashboard-file";
import {
  DASHBOARD_IMPORT_MAX_BYTES,
  parseDashboardFileText,
  routeDroppedFile,
  titleFromFileName,
  validateDashboardFile,
} from "./dashboard-file";
import { showImportViewTargetDialog } from "./show-dialog-import-view-target";

const refuse = (ctx: ImportExportContext, error: string) => {
  const hass = ctx.hass;
  showToast(ctx.element, {
    message: `${hass.localize(
      "ui.panel.lovelace.import_export.not_imported" as LocalizeKeys
    )} ${importErrorText(hass, error)}`,
    duration: 10000,
    dismissable: true,
  });
};

/** The dashboard on screen, taken from the address, when there is one. */
const currentDashboardPath = (): string | undefined => {
  const first = window.location.pathname.split("/")[1];
  return first || undefined;
};

/** Imports a parsed and checked file: a dashboard or one view. */
export const importParsedFile = async (
  ctx: ImportExportContext,
  parsed: ParsedDashboardImport
): Promise<void> => {
  if (!parsed.ok) {
    refuse(ctx, parsed.error);
    return;
  }
  if (!ctx.hass.user?.is_admin) {
    refuse(ctx, "admin_only");
    return;
  }
  if (parsed.kind === "dashboard") {
    await importDashboardData(ctx, parsed);
    return;
  }
  showImportViewTargetDialog(ctx.element, {
    currentUrlPath: currentDashboardPath(),
    onSelected: (urlPath) => {
      void importViewData(ctx, parsed, urlPath);
    },
  });
};

/** Imports a file the person chose with the file picker. */
export const importChosenFile = async (
  ctx: ImportExportContext,
  file: File
): Promise<void> => {
  if (file.size > DASHBOARD_IMPORT_MAX_BYTES) {
    refuse(ctx, "too_large");
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch (_err) {
    refuse(ctx, "unreadable");
    return;
  }
  await importParsedFile(
    ctx,
    parseDashboardFileText(file.name, text, titleFromFileName(file.name))
  );
};

/**
 * Looks at a file dropped on the app. A dashboard file is imported and
 * `true` is returned. Any other file is left alone and `false` is returned,
 * so the wording import sees it exactly as before.
 */
export const handleDroppedDashboardFile = async (
  ctx: ImportExportContext,
  file: File
): Promise<boolean> => {
  const lower = file.name.toLowerCase();
  if (file.size > DASHBOARD_IMPORT_MAX_BYTES) {
    // Only a file that names itself a dashboard is refused here.
    if (lower.endsWith(".dashboard.json") || lower.endsWith(".view.json")) {
      refuse(ctx, "too_large");
      return true;
    }
    return false;
  }
  let text: string;
  try {
    text = await file.text();
  } catch (_err) {
    return false;
  }
  const routed = routeDroppedFile(file.name, text);
  if (routed.route !== "dashboard") {
    return false;
  }
  await importParsedFile(
    ctx,
    validateDashboardFile(routed.parsed, titleFromFileName(file.name))
  );
  return true;
};
