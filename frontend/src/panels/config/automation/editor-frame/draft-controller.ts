import type { ReactiveController, ReactiveControllerHost } from "lit";
import {
  discardEditorDraft,
  getEditorDraft,
  listEditorDrafts,
  saveEditorDraft,
} from "../../../../data/editor-drafts";
import type {
  EditorDraft,
  EditorDraftKind,
} from "../../../../data/editor-drafts";
import type { HomeAssistant } from "../../../../types";
import {
  configHash,
  decideDraftOffer,
  DRAFT_DELAY_MS,
  formatDraftTime,
  isNewDraftId,
  newDraftId,
} from "./draft-logic";
import { draftText } from "./draft-strings";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

/** What the editor tells the controller about itself. */
export interface DraftBinding {
  hass(): HomeAssistant | undefined;
  kind(): EditorDraftKind;
  /** The id of the item being edited; undefined for a new, unsaved item. */
  itemId(): string | undefined;
  config(): Record<string, any> | undefined;
  dirty(): boolean;
  readOnly(): boolean;
  /** Put a draft's config into the editor as an unsaved change. */
  apply(config: Record<string, any>): void;
}

export interface DraftOfferState {
  draft: EditorDraft;
  liveChanged: boolean;
  live: Record<string, any> | undefined;
  /** How many other imported items are still waiting as drafts. */
  more: number;
}

// Imported drafts already taken into an editor in this session.
const adoptedIds = new Set<string>();

const RETRY_TOO_SOON_MS = 1200;

/**
 * Autosaves what is being edited as a draft on the instance, offers a draft
 * back after a crash, and removes it when the item is saved or discarded. It
 * never touches the live item: only the editor's own Save does that, and a
 * draft that cannot be stored never interrupts editing.
 */
export class DraftController implements ReactiveController {
  public status: DraftStatus = "idle";

  public savedAt?: string;

  public offer?: DraftOfferState;

  private _timer?: number;

  private _checkedKey?: string;

  private _newId?: string;

  private _baseline?: Record<string, any>;

  private _hasStored = false;

  /** Set while an item that was imported with several others is being edited. */
  public importedDisabled = false;

  private _token = 0;

  private _listeners = new Set<() => void>();

  public constructor(
    private _host: ReactiveControllerHost,
    private _binding: DraftBinding
  ) {
    this._host.addController(this);
  }

  public hostConnected(): void {
    window.addEventListener("pagehide", this._onHide);
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  public hostDisconnected(): void {
    window.removeEventListener("pagehide", this._onHide);
    document.removeEventListener("visibilitychange", this._onVisibility);
    if (this._timer !== undefined) {
      this._flush();
    }
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** The text for the quiet status, or an empty string for nothing to say. */
  public statusText(): string {
    const hass = this._binding.hass();
    if (!hass) {
      return "";
    }
    switch (this.status) {
      case "saving":
        return draftText(hass, "saving");
      case "saved":
        return draftText(hass, "saved", {
          time: formatDraftTime(this.savedAt),
        });
      case "error":
        return draftText(hass, "not_saved");
      default:
        return "";
    }
  }

  /** The id the draft of the current item is stored under. */
  public currentId(): string {
    const existing = this._binding.itemId();
    if (existing) {
      return existing;
    }
    this._newId ??= newDraftId();
    return this._newId;
  }

  /** Call whenever the editor's config changed. */
  public configChanged(): void {
    const config = this._binding.config();
    if (!config) {
      return;
    }
    const key = this._binding.itemId() ?? "new";
    if (key !== this._checkedKey) {
      this._checkedKey = key;
      this._newId = undefined;
      this._hasStored = false;
      this.importedDisabled = false;
      this._clearTimer();
      this.status = "idle";
      this.offer = undefined;
      this._baseline = this._binding.dirty()
        ? undefined
        : structuredClone(config);
      this._notify();
      void this._findDraft(key);
      return;
    }
    if (this._binding.dirty() || this._hasStored) {
      this._schedule(DRAFT_DELAY_MS);
    }
  }

  /** Call after the item was really saved. */
  public saved(): void {
    this._clearTimer();
    this._token++;
    const config = this._binding.config();
    this._baseline = config ? structuredClone(config) : undefined;
    const hass = this._binding.hass();
    if (hass && this._hasStored) {
      void discardEditorDraft(
        hass,
        this._binding.kind(),
        this.currentId()
      ).catch(() => undefined);
    }
    this._hasStored = false;
    this.status = "idle";
    this.offer = undefined;
    this._notify();
  }

  public continueDraft(): void {
    const offer = this.offer;
    if (!offer) {
      return;
    }
    if (isNewDraftId(offer.draft.item_id) && !this._binding.itemId()) {
      this._newId = offer.draft.item_id;
    }
    this.offer = undefined;
    this._hasStored = true;
    this.importedDisabled = Boolean(offer.draft.meta?.imported);
    if (isNewDraftId(offer.draft.item_id)) {
      adoptedIds.add(offer.draft.item_id);
    }
    this._binding.apply(offer.draft.config);
    this._notify();
  }

  public discardOffer(): void {
    const offer = this.offer;
    const hass = this._binding.hass();
    this.offer = undefined;
    this._notify();
    if (offer && hass) {
      void discardEditorDraft(
        hass,
        this._binding.kind(),
        offer.draft.item_id
      ).catch(() => undefined);
    }
  }

  /** A draft was restored from the history: it is now the current draft. */
  public restored(config: Record<string, any>): void {
    this._hasStored = true;
    this.offer = undefined;
    this._binding.apply(config);
    this._notify();
  }

  public liveConfig(): Record<string, any> | undefined {
    return this._baseline;
  }

  private _onHide = () => {
    if (this._timer !== undefined) {
      this._flush();
    }
  };

  private _onVisibility = () => {
    if (document.visibilityState === "hidden" && this._timer !== undefined) {
      this._flush();
    }
  };

  private _clearTimer() {
    if (this._timer !== undefined) {
      window.clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private _schedule(delay: number) {
    this._clearTimer();
    this._timer = window.setTimeout(() => this._flush(), delay);
  }

  private _notify() {
    this._host.requestUpdate();
    this._listeners.forEach((listener) => listener());
  }

  private async _findDraft(key: string): Promise<void> {
    const hass = this._binding.hass();
    if (!hass || this._binding.dirty()) {
      return;
    }
    const kind = this._binding.kind();
    const isNew = key === "new";
    try {
      let draft: EditorDraft | null = null;
      let more = 0;
      if (isNew) {
        const rows = (await listEditorDrafts(hass)).filter(
          (row) =>
            row.kind === kind &&
            isNewDraftId(row.item_id) &&
            !adoptedIds.has(row.item_id)
        );
        more = Math.max(0, rows.length - 1);
        if (rows.length) {
          draft = await getEditorDraft(hass, kind, rows[0].item_id);
        }
      } else {
        draft = await getEditorDraft(hass, kind, key);
      }
      if (!draft || this._checkedKey !== key || this._binding.dirty()) {
        return;
      }
      const live = isNew ? undefined : this._baseline;
      const decision = decideDraftOffer(draft.config, draft.base_hash, live);
      if (!decision.offer) {
        void discardEditorDraft(hass, kind, draft.item_id).catch(
          () => undefined
        );
        return;
      }
      this.offer = { draft, liveChanged: decision.liveChanged, live, more };
      this._notify();
    } catch {
      // A draft that cannot be read is simply not offered.
    }
  }

  private async _flush(): Promise<void> {
    this._clearTimer();
    const hass = this._binding.hass();
    const config = this._binding.config();
    if (!hass || !config || this._binding.readOnly() || this.offer) {
      return;
    }
    const kind = this._binding.kind();
    const id = this.currentId();
    if (!this._binding.dirty()) {
      if (this._hasStored) {
        this._hasStored = false;
        this._token++;
        this.status = "idle";
        this._notify();
        await discardEditorDraft(hass, kind, id).catch(() => undefined);
      }
      return;
    }
    const token = ++this._token;
    this.status = "saving";
    this._notify();
    const baseHash = this._baseline ? configHash(this._baseline) : null;
    try {
      const result = await saveEditorDraft(
        hass,
        kind,
        id,
        config,
        baseHash,
        this.importedDisabled ? { imported: true } : undefined
      );
      if (token !== this._token) {
        return;
      }
      if (!result.saved) {
        this.status = "saving";
        this._schedule(RETRY_TOO_SOON_MS);
        return;
      }
      this._hasStored = true;
      this.status = "saved";
      this.savedAt = result.updated ?? new Date().toISOString();
    } catch {
      if (token !== this._token) {
        return;
      }
      this.status = "error";
    }
    this._notify();
  }
}
