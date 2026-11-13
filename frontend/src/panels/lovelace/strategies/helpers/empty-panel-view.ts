import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import type { HomeAssistant } from "../../../../types";
import type { EmptyStateCardConfig } from "../../cards/types";

/**
 * The view of a generated panel (Lights, Climate, Security) when the home has
 * nothing to show in it: an icon, what belongs here, how to add some, and for
 * an administrator a button to the integrations page.
 */
export const generateEmptyPanelView = (
  hass: HomeAssistant,
  icon: string,
  title: string,
  content: string
): LovelaceViewConfig => ({
  type: "panel",
  cards: [
    {
      type: "empty-state",
      icon,
      content_only: true,
      title,
      content,
      ...(hass.user?.is_admin
        ? {
            buttons: [
              {
                icon: "mdi:puzzle",
                text: hass.localize(
                  "ui.panel.lovelace.strategy.empty_panel.add_button"
                ),
                appearance: "filled" as const,
                variant: "brand" as const,
                tap_action: {
                  action: "navigate" as const,
                  navigation_path: "/config/integrations",
                },
              },
            ],
          }
        : {}),
    } as EmptyStateCardConfig,
  ],
});
