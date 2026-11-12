import { provide } from "@lit/context";
import type { PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../../common/decorators/consume";
import { computeAreaName } from "../../../../common/entity/compute_area_name";
import { computeDeviceName } from "../../../../common/entity/compute_device_name";
import { computeDomain } from "../../../../common/entity/compute_domain";
import { computeObjectId } from "../../../../common/entity/compute_object_id";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import { getAutomationActionType } from "../../../../data/action";
import type { Condition, Trigger } from "../../../../data/automation";
import {
  describeCondition,
  describeTrigger,
} from "../../../../data/automation_i18n";
import {
  fullEntitiesContext,
  labelsContext,
  manifestsContext,
} from "../../../../data/context";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import type { DomainManifestLookup } from "../../../../data/integration";
import type { LabelRegistryEntry } from "../../../../data/label/label_registry";
import type { Action } from "../../../../data/script";
import { describeAction } from "../../../../data/script_i18n";
import type { HomeAssistant } from "../../../../types";
import type {
  FlatConfig,
  SearchResolver,
  SearchResult,
} from "./automation-search";
import {
  ancestorsOf,
  flattenAutomation,
  searchSteps,
  subtreeMatches,
  summarizeEntities,
} from "./automation-search";
import type { AutomationSearchSnapshot } from "./automation-search-context";
import { automationSearchContext } from "./automation-search-context";

const TYPE_LABEL_BASE = "ui.panel.config.automation.editor";

/**
 * Owns the search of one editor and shares it with every row and list inside
 * through a context. The editor's content goes in the default slot, so the
 * scope adds no box of its own.
 *
 * It only reads the configuration. Searching never changes it, never marks the
 * editor as modified and never saves.
 */
@customElement("ha-automation-search-scope")
export class HaAutomationSearchScope extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The automation or script being edited. */
  @property({ attribute: false }) public config?: unknown;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityReg: EntityRegistryEntry[] = [];

  @state()
  @consume({ context: labelsContext, subscribe: true })
  private _labels?: LabelRegistryEntry[];

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  private _manifests?: DomainManifestLookup;

  @state() private _query = "";

  @state() private _entityFilter: readonly string[] = [];

  @state() private _onlyMatching = false;

  @state() private _currentIndex = -1;

  @state() private _navigationToken = 0;

  @provide({ context: automationSearchContext })
  @state()
  private _snapshot?: AutomationSearchSnapshot;

  private _flat: FlatConfig = { steps: [], byItem: new Map() };

  private _result?: SearchResult;

  private _snapshotKey = "";

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (!this.hass) {
      return;
    }
    const resolver = this._resolver(
      this.hass.localize,
      this.hass.devices,
      this.hass.areas,
      this.hass.entities,
      this.hass.floors,
      this.hass.services,
      this._entityReg,
      this._labels,
      this._manifests
    );
    const flat = this._flatten(this.config, resolver);
    const filter = this._entityFilter;
    const result = this._search(flat, this._query, filter);
    const matches = result.matches;

    // Keep the same position when the configuration changes under the search.
    const currentIndex = matches.length
      ? Math.min(Math.max(this._currentIndex, 0), matches.length - 1)
      : -1;
    const entities = this._entities(flat);
    const missing = entities
      .filter((entity) => !this._exists(entity.entityId))
      .map((entity) => entity.entityId);

    const key = [
      currentIndex,
      this._navigationToken,
      this._onlyMatching,
      missing.join(","),
    ].join("|");
    const unchanged =
      this._snapshot &&
      flat === this._flat &&
      result === this._result &&
      key === this._snapshotKey;
    this._flat = flat;
    this._result = result;
    if (unchanged) {
      return;
    }
    this._snapshotKey = key;

    const current = currentIndex >= 0 ? matches[currentIndex] : undefined;
    const reveal = new Set<object>(
      current ? ancestorsOf(current).map((step) => step.item) : []
    );
    const missingSet = new Set(missing);
    this._snapshot = {
      query: this._query,
      entityFilter: filter,
      onlyMatching: this._onlyMatching,
      active: result.active,
      error: result.error,
      matches,
      matchSet: result.matchSet,
      visibleSet: result.visibleSet,
      currentIndex,
      current,
      revealSet: reveal,
      navigationToken: this._navigationToken,
      entities: entities.map((entity) => ({
        ...entity,
        missing: missingSet.has(entity.entityId),
      })),
      hasSteps: flat.steps.length > 0,
      setQuery: (query) => this._setQuery(query),
      setEntityFilter: (ids) => this._setEntityFilter(ids),
      setOnlyMatching: (value) => {
        this._onlyMatching = value;
      },
      next: () => this._step(1),
      previous: () => this._step(-1),
      clear: () => this._clear(),
      subtreeMatches: (item, query) => subtreeMatches(flat, item, query),
    };
  }

  protected render() {
    return html`<slot></slot>`;
  }

  private _setQuery(query: string) {
    if (query === this._query) {
      return;
    }
    this._query = query;
    this._currentIndex = 0;
    this._navigationToken++;
  }

  private _setEntityFilter(ids: readonly string[]) {
    this._entityFilter = [...ids];
    this._currentIndex = 0;
    this._navigationToken++;
  }

  private _clear() {
    this._query = "";
    this._entityFilter = [];
    this._currentIndex = -1;
    this._navigationToken++;
  }

  private _step(direction: 1 | -1) {
    const count = this._result?.matches.length ?? 0;
    if (!count) {
      return;
    }
    const from =
      this._currentIndex < 0 ? (direction === 1 ? -1 : 0) : this._currentIndex;
    this._currentIndex = (from + direction + count) % count;
    this._navigationToken++;
  }

  private _exists(entityId: string): boolean {
    return !!this.hass?.states?.[entityId];
  }

  private _flatten = memoizeOne(
    (config: unknown, resolver: SearchResolver): FlatConfig =>
      flattenAutomation(config, resolver)
  );

  private _search = memoizeOne(
    (
      flat: FlatConfig,
      query: string,
      entityIds: readonly string[]
    ): SearchResult => searchSteps(flat, { query, entityIds })
  );

  private _entities = memoizeOne((flat: FlatConfig) => summarizeEntities(flat));

  private _resolver = memoizeOne(
    (
      localize: HomeAssistant["localize"],
      devices: HomeAssistant["devices"],
      areas: HomeAssistant["areas"],
      entities: HomeAssistant["entities"],
      floors: HomeAssistant["floors"],
      services: HomeAssistant["services"],
      entityReg: EntityRegistryEntry[],
      labels: LabelRegistryEntry[] | undefined,
      manifests: DomainManifestLookup | undefined
    ): SearchResolver => {
      const registryIds = new Map<string, string>(
        entityReg.map((entry) => [entry.id, entry.entity_id])
      );
      const labelName = (id: string): string[] => {
        const label = labels?.find((entry) => entry.label_id === id);
        return label ? [label.name] : [];
      };
      const areaTexts = (id: string): string[] => {
        const area = areas[id];
        return area ? [computeAreaName(area) ?? ""] : [];
      };
      const deviceTexts = (id: string): string[] => {
        const device = devices[id];
        if (!device) {
          return [];
        }
        return [
          computeDeviceName(device) ?? "",
          ...(device.area_id ? areaTexts(device.area_id) : []),
        ];
      };
      const hass = () => this.hass;
      return {
        describe: (kind, item) => {
          const current = hass();
          switch (kind) {
            case "trigger":
              return describeTrigger(
                item as unknown as Trigger,
                current,
                entityReg
              );
            case "condition":
              return describeCondition(
                item as unknown as Condition,
                current,
                entityReg
              );
            case "action":
              return describeAction(
                current,
                entityReg,
                item as unknown as Action,
                undefined,
                undefined,
                manifests
              );
            default:
              return undefined;
          }
        },
        typeLabel: (kind, item) => {
          let key: string | undefined;
          if (kind === "action") {
            const type = getAutomationActionType(item as unknown as Action);
            key = type
              ? `${TYPE_LABEL_BASE}.actions.type.${type}.label`
              : undefined;
          } else if (kind === "trigger") {
            const type = item.trigger ?? item.platform;
            key =
              typeof type === "string"
                ? `${TYPE_LABEL_BASE}.triggers.type.${type}.label`
                : undefined;
          } else if (kind === "condition") {
            key =
              typeof item.condition === "string"
                ? `${TYPE_LABEL_BASE}.conditions.type.${item.condition}.label`
                : undefined;
          }
          return key ? localize(key as any) || undefined : undefined;
        },
        entityTexts: (entityId) => {
          const stateObj = hass().states[entityId];
          const entry = entities[entityId];
          const device = entry?.device_id
            ? devices[entry.device_id]
            : undefined;
          const areaId = entry?.area_id ?? device?.area_id;
          const area = areaId ? areas[areaId] : undefined;
          const floor = area?.floor_id ? floors[area.floor_id] : undefined;
          return [
            stateObj ? computeStateName(stateObj) : "",
            entry?.name ?? "",
            device ? (computeDeviceName(device) ?? "") : "",
            area ? (computeAreaName(area) ?? "") : "",
            floor?.name ?? "",
            ...(entry?.labels ?? []).flatMap(labelName),
          ];
        },
        deviceTexts,
        areaTexts,
        floorTexts: (id) => (floors[id] ? [floors[id].name] : []),
        labelTexts: labelName,
        serviceTexts: (service) => {
          const domain = computeDomain(service);
          const name = computeObjectId(service);
          return [
            localize(`component.${domain}.services.${name}.name` as any),
            services[domain]?.[name]?.name ?? "",
          ];
        },
        entityRegistryId: (id) => registryIds.get(id),
        entityExists: (entityId) => !!hass().states[entityId],
      };
    }
  );

  static styles = css`
    :host {
      display: contents;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-search-scope": HaAutomationSearchScope;
  }
}
