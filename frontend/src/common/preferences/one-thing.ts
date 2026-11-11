/**
 * One thing at a time: when an expansion panel is opened, the panels next to
 * it (the ones that share its parent) are closed. It reaches every page that
 * lays its expansion panels out side by side in one container. A panel that
 * sits alone, or in a different container, is not touched, and no other kind
 * of section is.
 */

interface PanelLike {
  expanded: boolean;
}

/** The panels to close when `opened` opens: every other open sibling. */
export const panelsToClose = <T extends PanelLike>(
  siblings: T[],
  opened: T
): T[] => siblings.filter((panel) => panel !== opened && panel.expanded);

const PANEL_TAG = "HA-EXPANSION-PANEL";

class OneThingAtATime {
  private _enabled = false;

  public setEnabled(enabled: boolean): void {
    if (enabled === this._enabled) {
      return;
    }
    this._enabled = enabled;
    if (enabled) {
      document.addEventListener("expanded-changed", this._onChanged, true);
    } else {
      document.removeEventListener("expanded-changed", this._onChanged, true);
    }
  }

  private _onChanged = (ev: Event) => {
    const target = ev.composedPath()[0] as
      (HTMLElement & PanelLike) | undefined;
    if (
      !target ||
      target.tagName !== PANEL_TAG ||
      !(ev as CustomEvent<{ expanded: boolean }>).detail?.expanded
    ) {
      return;
    }
    const siblings = Array.from(target.parentNode?.children ?? []).filter(
      (el): el is HTMLElement & PanelLike => el.tagName === PANEL_TAG
    );
    panelsToClose(siblings, target).forEach((panel) => {
      panel.expanded = false;
    });
  };
}

export const oneThingAtATime = new OneThingAtATime();
