import Tab from "@home-assistant/webawesome/dist/components/tab/tab";
import { css, type CSSResultGroup } from "lit";
import { customElement } from "lit/decorators";

@customElement("ha-tab-group-tab")
export class HaTabGroupTab extends Tab {
  static get styles(): CSSResultGroup {
    return [
      Tab.styles,
      css`
        :host {
          font-size: var(--ha-font-size-m);
          --wa-color-brand-on-quiet: var(
            --ha-tab-active-text-color,
            var(--primary-color)
          );
          --wa-color-neutral-on-quiet: var(--wa-color-brand-on-quiet);
          opacity: 0.8;

          color: inherit;

          --wa-space-l: 16px;
        }

        :host([active]:not([disabled])) {
          opacity: 1;
        }

        .tab {
          border-radius: var(--ha-border-radius-pill);
          min-height: var(--ha-space-10);
          padding-block: 0;
          font-weight: var(--ha-font-weight-medium);
          transition:
            background-color var(--ha-animation-duration-fast) ease,
            color var(--ha-animation-duration-fast) ease;
        }

        :host([active]:not([disabled])) .tab {
          background-color: var(
            --ha-tab-active-background-color,
            var(--primary-text-color)
          );
          color: var(--ha-tab-active-on-color, var(--primary-background-color));
        }

        @media (hover: hover) {
          :host(:hover:not([disabled]):not([active])) .tab {
            color: var(--wa-color-brand-on-quiet);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-group-tab": HaTabGroupTab;
  }
}
