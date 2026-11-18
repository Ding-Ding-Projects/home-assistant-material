import type { CSSResultGroup } from "lit";
import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { supportsFeature } from "../../../common/entity/supports-feature";
import { formattersContext } from "../../../data/context";
import {
  shouldShowFavoriteOptions,
  type ExtEntityRegistryEntry,
} from "../../../data/entity/entity_registry";
import type { CoverEntity } from "../../../data/cover";
import {
  CoverEntityFeature,
  coverSupportsPosition,
  coverSupportsTiltPosition,
  computeCoverPositionStateDisplay,
} from "../../../data/cover";
import "../../../state-control/cover/ha-state-control-cover-buttons";
import "../../../state-control/cover/ha-state-control-cover-position";
import "../../../state-control/cover/ha-state-control-cover-tilt-position";
import type { HomeAssistantFormatters } from "../../../types";
import "../components/covers/ha-more-info-cover-favorite-positions";
import "../../../components/ha-relative-time";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";

@customElement("more-info-cover")
class MoreInfoCover extends LitElement {
  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @property({ attribute: false }) public stateObj?: CoverEntity;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  @property({ attribute: false }) public editMode?: boolean;

  private get _positionDisplay() {
    return computeCoverPositionStateDisplay(
      this.stateObj!,
      this._formatters.formatEntityAttributeValue
    );
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const supportsPosition = coverSupportsPosition(this.stateObj);

    const supportsTiltPosition = coverSupportsTiltPosition(this.stateObj);

    const showFavoriteControls = Boolean(
      this.entry &&
      (this.editMode ||
        (coverSupportsPosition(this.stateObj) &&
          shouldShowFavoriteOptions(
            this.entry.options?.cover?.favorite_positions
          )) ||
        (coverSupportsTiltPosition(this.stateObj) &&
          shouldShowFavoriteOptions(
            this.entry.options?.cover?.favorite_tilt_positions
          )))
    );

    const supportsOpenClose =
      supportsFeature(this.stateObj, CoverEntityFeature.OPEN) ||
      supportsFeature(this.stateObj, CoverEntityFeature.CLOSE) ||
      supportsFeature(this.stateObj, CoverEntityFeature.STOP);

    const supportsTilt =
      supportsFeature(this.stateObj, CoverEntityFeature.OPEN_TILT) ||
      supportsFeature(this.stateObj, CoverEntityFeature.CLOSE_TILT) ||
      supportsFeature(this.stateObj, CoverEntityFeature.STOP_TILT);

    return html`
      <p class="subline">
        ${
          this._positionDisplay ||
          html`<ha-relative-time
            .datetime=${this.stateObj.last_changed}
            capitalize
          ></ha-relative-time>`
        }
      </p>
      <div class="controls">
        ${
          supportsPosition
            ? html`
                <ha-state-control-cover-position
                  .stateObj=${this.stateObj}
                ></ha-state-control-cover-position>
              `
            : nothing
        }
        ${
          supportsTiltPosition
            ? html`
                <ha-state-control-cover-tilt-position
                  .stateObj=${this.stateObj}
                ></ha-state-control-cover-tilt-position>
              `
            : nothing
        }
        ${
          supportsOpenClose || supportsTilt
            ? html`
                <ha-state-control-cover-buttons
                  .stateObj=${this.stateObj}
                ></ha-state-control-cover-buttons>
              `
            : nothing
        }
        ${
          showFavoriteControls
            ? html`
                <ha-more-info-cover-favorite-positions
                  .stateObj=${this.stateObj}
                  .entry=${this.entry}
                  .editMode=${this.editMode}
                ></ha-more-info-cover-favorite-positions>
              `
            : nothing
        }
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [moreInfoControlStyle, moreInfoBoardStyle];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-cover": MoreInfoCover;
  }
}
