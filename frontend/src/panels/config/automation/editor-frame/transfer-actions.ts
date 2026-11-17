import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import { fileDownload } from "../../../../util/file_download";
import { showToast } from "../../../../util/toast";
import { draftText } from "./draft-strings";
import type { DraftStringKey } from "./draft-strings";
import {
  detectPrivateContent,
  exportFileName,
  exportYaml,
} from "./transfer-logic";
import type { PrivateKind, TransferKind } from "./transfer-logic";

export type ExportMode = "download" | "copy";

const PRIVATE_LABEL: Record<PrivateKind, DraftStringKey> = {
  webhook: "private_webhook",
  secret: "private_secret",
  location: "private_location",
};

/**
 * Export items as YAML, exactly as the YAML view shows them. Nothing is sent
 * anywhere: the file is built in the browser. When the content seems to hold
 * something private a notice is shown first and the person decides.
 * Returns whether anything was exported.
 */
export const exportConfigs = async (
  element: HTMLElement,
  hass: HomeAssistant,
  kind: TransferKind,
  configs: Record<string, any>[],
  mode: ExportMode
): Promise<boolean> => {
  if (configs.length === 0) {
    showToast(element, { message: draftText(hass, "export_nothing") });
    return false;
  }
  const findings = detectPrivateContent(configs);
  if (findings.length > 0) {
    const confirmed = await showConfirmationDialog(element, {
      title: draftText(hass, "private_title"),
      text: draftText(hass, "private_body", {
        items: findings
          .map((finding) => draftText(hass, PRIVATE_LABEL[finding.kind]))
          .join(", "),
      }),
      confirmText: draftText(hass, "export_anyway"),
      dismissText: draftText(hass, "cancel"),
      warning: true,
    });
    if (!confirmed) {
      return false;
    }
  }
  const text = exportYaml(configs);
  if (mode === "copy") {
    await copyToClipboard(text, element);
    showToast(element, { message: draftText(hass, "export_copied") });
    return true;
  }
  const name =
    configs.length === 1 ? (configs[0].alias ?? configs[0].name) : "";
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/yaml;charset=utf-8" })
  );
  fileDownload(url, exportFileName(name, kind, configs.length));
  return true;
};
