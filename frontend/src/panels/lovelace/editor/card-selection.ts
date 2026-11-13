import type { LocalizeFunc } from "../../../common/translations/localize";
import type { Lovelace } from "../types";
import type { LovelacePath } from "./lovelace-path";
import { parsePath, stringifyPath } from "./lovelace-path";

/**
 * The cards that are selected on the dashboard being edited. There is one
 * selection for the page: cards register here while they are in edit mode,
 * and a floating bar shows what can be done with the selection.
 */

/** What a card in edit mode gives the selection. */
export interface SelectableCard {
  /** The card's frame, used to find the cards inside a drawn box. */
  getBoundingClientRect(): DOMRect;
  path: LovelacePath;
  lovelace: Lovelace;
  localize: LocalizeFunc;
  isConnected: boolean;
  dispatchEvent(event: Event): boolean;
}

const BOX_MIN_SIZE = 6;

export const SELECTION_CHANGED_EVENT = "card-selection-changed";

class CardSelection extends EventTarget {
  private _selected = new Set<string>();

  private _cards = new Set<SelectableCard>();

  /** The dashboard configuration the selection was made in. */
  private _baseConfig?: Lovelace["config"];

  private _boxStart?: { x: number; y: number };

  private _box?: HTMLDivElement;

  private _bar?: HTMLElement;

  public get size(): number {
    return this._selected.size;
  }

  public has(path: LovelacePath): boolean {
    return this._selected.has(stringifyPath(path));
  }

  public get paths(): LovelacePath[] {
    return [...this._selected].map(parsePath);
  }

  public get lovelace(): Lovelace | undefined {
    return this._anyCard()?.lovelace;
  }

  public get localize(): LocalizeFunc | undefined {
    return this._anyCard()?.localize;
  }

  /** An element in the page that dialogs can be shown from. */
  public get host(): SelectableCard | undefined {
    return this._anyCard();
  }

  private _anyCard(): SelectableCard | undefined {
    for (const card of this._cards) {
      if (card.isConnected) {
        return card;
      }
    }
    return undefined;
  }

  public register(card: SelectableCard): void {
    this._cards.add(card);
    if (this._cards.size === 1) {
      document.addEventListener("pointerdown", this._pointerDown, true);
      document.addEventListener("keydown", this._keyDown);
    }
  }

  public unregister(card: SelectableCard): void {
    this._cards.delete(card);
    if (this._cards.size === 0) {
      document.removeEventListener("pointerdown", this._pointerDown, true);
      document.removeEventListener("keydown", this._keyDown);
      this.clear();
    }
  }

  /** Drops the selection when the dashboard changed under it, so paths never point at other cards. */
  public checkConfig(config: Lovelace["config"]): void {
    if (this._selected.size && this._baseConfig !== config) {
      this.clear();
    }
  }

  public toggle(card: SelectableCard): void {
    const key = stringifyPath(card.path);
    if (this._selected.has(key)) {
      this._selected.delete(key);
    } else {
      this._baseConfig = card.lovelace.config;
      this._selected.add(key);
    }
    this._changed();
  }

  public add(cards: SelectableCard[]): void {
    cards.forEach((card) => {
      this._baseConfig = card.lovelace.config;
      this._selected.add(stringifyPath(card.path));
    });
    this._changed();
  }

  public clear(): void {
    if (!this._selected.size) {
      return;
    }
    this._selected.clear();
    this._baseConfig = undefined;
    this._changed();
  }

  private _changed(): void {
    this.dispatchEvent(new Event(SELECTION_CHANGED_EVENT));
    if (this._selected.size) {
      this._showBar();
    } else {
      this._bar?.remove();
      this._bar = undefined;
    }
  }

  private _showBar(): void {
    if (this._bar?.isConnected) {
      return;
    }
    void import("../components/hui-card-selection-bar").then(() => {
      if (!this._selected.size || this._bar?.isConnected) {
        return;
      }
      this._bar = document.createElement("hui-card-selection-bar");
      document.body.appendChild(this._bar);
    });
  }

  private _keyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && this._selected.size) {
      this.clear();
    }
  };

  // Shift and drag draws a box; every card the box touches joins the selection.
  private _pointerDown = (ev: PointerEvent) => {
    if (!ev.shiftKey || ev.button !== 0 || ev.pointerType === "touch") {
      return;
    }
    const path = ev.composedPath();
    if (
      path.some(
        (node) =>
          node instanceof HTMLElement &&
          /^(ha-dialog|dialog|ha-bottom-sheet)$/.test(node.localName)
      )
    ) {
      return;
    }
    const target = path[0];
    if (
      target instanceof HTMLElement &&
      /^(input|textarea|select|button)$/i.test(target.tagName)
    ) {
      return;
    }
    ev.preventDefault();
    this._boxStart = { x: ev.clientX, y: ev.clientY };
    document.addEventListener("pointermove", this._pointerMove);
    document.addEventListener("pointerup", this._pointerUp);
    document.addEventListener("pointercancel", this._pointerCancel);
  };

  private _rect(ev: PointerEvent) {
    const start = this._boxStart!;
    return {
      left: Math.min(start.x, ev.clientX),
      top: Math.min(start.y, ev.clientY),
      right: Math.max(start.x, ev.clientX),
      bottom: Math.max(start.y, ev.clientY),
    };
  }

  private _pointerMove = (ev: PointerEvent) => {
    if (!this._boxStart) {
      return;
    }
    const rect = this._rect(ev);
    if (!this._box) {
      this._box = document.createElement("div");
      this._box.setAttribute("aria-hidden", "true");
      this._box.style.cssText =
        "position:fixed;z-index:9;pointer-events:none;" +
        "border:2px dashed var(--primary-color);" +
        "background:var(--ha-color-primary-container, rgba(0,0,0,.08));" +
        "opacity:.6;border-radius:var(--ha-border-radius-md, 8px);";
      document.body.appendChild(this._box);
    }
    this._box.style.left = `${rect.left}px`;
    this._box.style.top = `${rect.top}px`;
    this._box.style.width = `${rect.right - rect.left}px`;
    this._box.style.height = `${rect.bottom - rect.top}px`;
  };

  private _pointerUp = (ev: PointerEvent) => {
    const rect = this._boxStart ? this._rect(ev) : undefined;
    this._stopBox();
    if (
      !rect ||
      rect.right - rect.left < BOX_MIN_SIZE ||
      rect.bottom - rect.top < BOX_MIN_SIZE
    ) {
      return;
    }
    this.add(
      [...this._cards].filter((card) => {
        if (!card.isConnected) {
          return false;
        }
        const box = card.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.right > rect.left &&
          box.left < rect.right &&
          box.bottom > rect.top &&
          box.top < rect.bottom
        );
      })
    );
  };

  private _pointerCancel = () => this._stopBox();

  private _stopBox(): void {
    this._boxStart = undefined;
    this._box?.remove();
    this._box = undefined;
    document.removeEventListener("pointermove", this._pointerMove);
    document.removeEventListener("pointerup", this._pointerUp);
    document.removeEventListener("pointercancel", this._pointerCancel);
  }
}

export const cardSelection = new CardSelection();
