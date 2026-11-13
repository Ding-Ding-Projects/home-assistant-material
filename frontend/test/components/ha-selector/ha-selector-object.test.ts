import { ContextProvider } from "@lit/context";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getObjectDraft,
  setObjectDraft,
  transferObjectDrafts,
  hasInvalidObjectDrafts,
} from "../../../src/common/object-editor/object-model";
import { loadDeclaredOptions } from "../../../src/data/known-options";
import type { HaObjectEditor } from "../../../src/components/object-editor/ha-object-editor";
import {
  formattersContext,
  internationalizationContext,
  registriesContext,
  statesContext,
} from "../../../src/data/context";
import type { ObjectSelector } from "../../../src/data/selector";
import type {
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../../src/types";
import type { HaObjectSelector } from "../../../src/components/ha-selector/ha-selector-object";
import type {
  FormDialogData,
  FormDialogParams,
} from "../../../src/dialogs/form/show-form-dialog";
import "../../../src/components/ha-selector/ha-selector-object";

vi.mock("../../../src/data/known-options", () => ({
  loadDeclaredOptions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/components/ha-input-helper-text", () => {
  customElements.define("ha-input-helper-text", class extends HTMLElement {});
  return {};
});

vi.mock("../../../src/components/list/ha-list-base", () => {
  customElements.define("ha-list-base", class extends HTMLElement {});
  return {};
});

vi.mock("../../../src/components/item/ha-list-item-base", () => {
  customElements.define("ha-list-item-base", class extends HTMLElement {});
  return {};
});

vi.mock("../../../src/components/ha-sortable", () => {
  customElements.define("ha-sortable", class extends HTMLElement {});
  return {};
});

vi.mock("../../../src/components/ha-yaml-editor", () => {
  customElements.define("ha-yaml-editor", class extends HTMLElement {});
  return {};
});

const selectorConfig = {
  object: {
    multiple: true,
    fields: {
      name: { selector: { text: {} } },
    },
  },
};

const getInternals = (selector: HaObjectSelector) =>
  selector as unknown as Record<string, unknown>;

interface ItemActionEvent {
  stopPropagation: () => void;
  currentTarget: {
    item?: FormDialogData;
    index?: number;
  };
}

const mountSelector = async (
  value: FormDialogData | FormDialogData[] | "",
  config: ObjectSelector = selectorConfig,
  context?: HaObjectSelector["context"]
) => {
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: {
      localize: (key: string) => key,
      locale: { language: "en" },
    } as unknown as HomeAssistantInternationalization,
  });
  new ContextProvider(host, {
    context: registriesContext,
    initialValue: { entities: {}, devices: {}, areas: {}, floors: {} },
  });
  new ContextProvider(host, { context: statesContext, initialValue: {} });
  new ContextProvider(host, {
    context: formattersContext,
    initialValue: {
      formatEntityName: () => "",
    } as unknown as HomeAssistantFormatters,
  });
  const selector = document.createElement(
    "ha-selector-object"
  ) as HaObjectSelector;
  selector.selector = config;
  selector.context = context;
  selector.value = value;
  host.append(selector);
  document.body.append(host);
  await selector.updateComplete;
  return selector;
};

const resolveFormDialog = async (
  selector: HaObjectSelector,
  action: "_addItem" | "_editItem",
  result: FormDialogData | null,
  item?: FormDialogData,
  index?: number
) => {
  let params: FormDialogParams | undefined;
  const dialogShown = new Promise<void>((resolve) => {
    selector.addEventListener(
      "show-dialog",
      (event) => {
        params = event.detail.dialogParams as FormDialogParams;
        if (result === null) {
          params.cancel!();
        } else {
          params.submit!(result);
        }
        resolve();
      },
      { once: true }
    );
  });

  const event: ItemActionEvent = {
    stopPropagation: vi.fn(),
    currentTarget: { item, index },
  };
  const operation = (
    getInternals(selector)[action] as (event: ItemActionEvent) => Promise<void>
  )(event);
  await Promise.all([dialogShown, operation]);
  return params!;
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("ha-selector-object form dialog flow", () => {
  it("initializes Add dialog data from the object field schema", async () => {
    const selector = await mountSelector([], {
      object: {
        multiple: true,
        fields: {
          name: {
            required: true,
            selector: { text: {} },
          },
          states: {
            required: true,
            selector: {
              text: {
                multiple: true,
              },
            },
          },
        },
      },
    });

    const params = await resolveFormDialog(selector, "_addItem", {
      name: "A",
      states: ["on"],
    });

    expect(params.data).toEqual({
      name: "",
      states: [],
    });
  });

  it("uses explicit object field defaults in Add dialog data", async () => {
    const chooseDefault = {
      active_choice: "Temperature",
      Temperature: 4000,
    };

    const selector = await mountSelector([], {
      object: {
        multiple: true,
        fields: {
          name: {
            required: true,
            selector: { text: {} },
          },
          number: {
            selector: { number: {} },
            default: 0,
          },
          boolean: {
            selector: { boolean: {} },
            default: false,
          },
          text: {
            selector: { text: {} },
            default: "",
          },
          entities: {
            selector: { entity: { multiple: true } },
            default: [],
          },
          object: {
            selector: { object: {} },
            default: {},
          },
          choose: {
            selector: {
              choose: {
                choices: {
                  Disabled: { selector: { boolean: {} } },
                  Temperature: { selector: { number: {} } },
                },
              },
            },
            default: chooseDefault,
          },
        },
      },
    });

    const params = await resolveFormDialog(selector, "_addItem", {
      name: "A",
    });

    expect(params.data).toEqual({
      name: "",
      number: 0,
      boolean: false,
      text: "",
      entities: [],
      object: {},
      choose: chooseDefault,
    });

    (params.data!.choose as { Temperature: number }).Temperature = 3000;

    expect(chooseDefault).toEqual({
      active_choice: "Temperature",
      Temperature: 4000,
    });
  });

  it("leaves unsupported required fields unset in Add dialog data", async () => {
    const selector = await mountSelector([], {
      object: {
        multiple: true,
        fields: {
          name: {
            required: true,
            selector: { text: {} },
          },
          tap_action: {
            required: true,
            selector: {
              ui_action: {
                default_action: "none",
              },
            },
          },
        },
      },
    });

    const params = await resolveFormDialog(selector, "_addItem", {
      name: "A",
      tap_action: {
        action: "none",
      },
    });

    expect(params.data).toEqual({
      name: "",
    });
  });

  it("restores the initialized empty value after an add-delete round trip", async () => {
    const selector = await mountSelector("", {
      object: {
        fields: {
          name: {
            selector: { text: {} },
          },
        },
      },
    });
    const valueChanged = vi.fn();
    selector.addEventListener("value-changed", valueChanged);

    await resolveFormDialog(selector, "_addItem", { name: "A" });

    expect(valueChanged.mock.calls[0][0].detail.value).toEqual({ name: "A" });

    selector.value = valueChanged.mock.calls[0][0].detail.value;
    await selector.updateComplete;

    const event: ItemActionEvent = {
      stopPropagation: vi.fn(),
      currentTarget: {
        index: 0,
      },
    };

    (getInternals(selector)._deleteItem as (event: ItemActionEvent) => void)(
      event
    );

    expect(valueChanged.mock.calls[1][0].detail.value).toBe("");
  });

  it("appends an item through the real Add flow", async () => {
    const first = { name: "A" };
    const selector = await mountSelector([first]);
    const valueChanged = vi.fn();
    selector.addEventListener("value-changed", valueChanged);

    await resolveFormDialog(selector, "_addItem", { name: "B" });

    expect(valueChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { value: [first, { name: "B" }] },
      })
    );
  });

  it("replaces an item at its original index through the real Edit flow", async () => {
    const first = { name: "A" };
    const second = { name: "B" };
    const selector = await mountSelector([first, second]);
    const valueChanged = vi.fn();
    selector.addEventListener("value-changed", valueChanged);

    await resolveFormDialog(
      selector,
      "_editItem",
      { name: "B updated" },
      second,
      1
    );

    const value = valueChanged.mock.calls[0][0].detail.value;
    expect(value).toEqual([first, { name: "B updated" }]);
    expect(value).toHaveLength(2);
  });

  it("leaves the array unchanged when Add or Edit is canceled", async () => {
    const first = { name: "A" };
    const selector = await mountSelector([first]);
    const valueChanged = vi.fn();
    selector.addEventListener("value-changed", valueChanged);

    await resolveFormDialog(selector, "_addItem", null);
    await resolveFormDialog(selector, "_editItem", null, first, 0);

    expect(valueChanged).not.toHaveBeenCalled();
  });
});

describe("object selector action metadata", () => {
  it("renders the visual dictionary for unstructured action options", async () => {
    const selector = await mountSelector(
      { vendor: [0, false, null] },
      { object: {} }
    );
    const editor = selector.shadowRoot!.querySelector(
      "ha-object-editor"
    ) as HaObjectEditor;
    expect(editor.value).toEqual({ vendor: [0, false, null] });
  });

  it("ignores late choices for an earlier target and retains the saved value", async () => {
    let resolveFirst!: (value: {
      options: never[];
      acceptedKeys: string[];
    }) => void;
    vi.mocked(loadDeclaredOptions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const selector = await mountSelector({ voice: "legacy" }, { object: {} });
    selector.hass = { language: "en" } as never;
    selector.context = {
      known_options: {
        action: "tts.speak",
        field: "options",
        entityIds: ["tts.first"],
      },
    };
    await selector.updateComplete;
    vi.mocked(loadDeclaredOptions).mockResolvedValueOnce({
      options: [
        {
          key: "voice",
          source: "declared",
          kind: { type: "choice", choices: [{ value: "new" }] },
        },
      ],
      acceptedKeys: ["voice"],
    });
    selector.context = {
      known_options: {
        action: "tts.speak",
        field: "options",
        entityIds: ["tts.second"],
      },
    };
    await selector.updateComplete;
    await Promise.resolve();
    await selector.updateComplete;
    resolveFirst({ options: [], acceptedKeys: [] });
    await Promise.resolve();
    await selector.updateComplete;
    const editor = selector.shadowRoot!.querySelector(
      "ha-object-editor"
    ) as HaObjectEditor;
    expect(
      editor.knownOptions.find((option) => option.key === "voice")?.kind
    ).toEqual({ type: "choice", choices: [{ value: "new" }] });
    expect(selector.value).toEqual({ voice: "legacy" });
  });
});

describe("object selector invalid drafts", () => {
  it("retains an invalid visual key when a row is closed and reopened", async () => {
    const owner = {
      action: "custom.perform",
      data: { options: { saved: "value" } },
    };
    const context = { draft_owner: owner, draft_key: "options" };
    const first = await mountSelector(
      owner.data.options,
      { object: {} },
      context
    );
    const editor = first.shadowRoot!.querySelector(
      "ha-object-editor"
    ) as HaObjectEditor;
    await editor.updateComplete;
    const key = editor.shadowRoot!.querySelector(".key") as HTMLElement & {
      value: string;
    };
    key.value = "";
    key.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await editor.updateComplete;
    expect(hasInvalidObjectDrafts({ actions: [owner] })).toBe(true);
    expect(first.value).toEqual({ saved: "value" });
    first.remove();
    const reopened = await mountSelector(
      owner.data.options,
      { object: {} },
      context
    );
    const reopenedEditor = reopened.shadowRoot!.querySelector(
      "ha-object-editor"
    ) as HaObjectEditor;
    await reopenedEditor.updateComplete;
    expect(
      (
        reopenedEditor.shadowRoot!.querySelector(".key") as HTMLElement & {
          value: string;
        }
      ).value
    ).toBe("");
    expect(reopenedEditor.shadowRoot!.querySelector(".error")).not.toBeNull();
  });
});

describe("object selector immutable owner updates", () => {
  it("does not reset draft restoration when an action clone owns the same draft", async () => {
    const owner = { action: "custom.perform" };
    setObjectDraft(owner, "options", { mode: "visual", valid: true });
    const selector = await mountSelector(
      { key: "value" },
      { object: {} },
      { draft_owner: owner, draft_key: "options" }
    );
    const restored = document.createElement("ha-yaml-editor");
    getInternals(selector)._restoredYaml = restored;
    const next = { ...owner, alias: "Renamed" };
    transferObjectDrafts(owner, next);
    selector.context = { draft_owner: next, draft_key: "options" };
    await selector.updateComplete;
    expect(getObjectDraft(owner, "options")).toBe(
      getObjectDraft(next, "options")
    );
    expect(getInternals(selector)._restoredYaml).toBe(restored);
  });

  it("does not emit unchanged parsed YAML after restoration", async () => {
    const selector = await mountSelector(
      { nested: { count: 1 } },
      { object: {} }
    );
    const changes = vi.fn();
    selector.addEventListener("value-changed", changes);
    (getInternals(selector)._handleChange as (event: unknown) => void)({
      stopPropagation: vi.fn(),
      target: {
        value: { nested: { count: 1 } },
        isValid: true,
        yaml: "nested:\n  count: 1",
      },
    });
    expect(changes).not.toHaveBeenCalled();
  });
});
