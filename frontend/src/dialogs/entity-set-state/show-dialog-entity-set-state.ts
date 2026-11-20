import { fireEvent } from "../../common/dom/fire_event";
import type { ValueKind } from "../../data/entity-details";

export interface EntitySetStateDialogParams {
  /** The dialog's title, already in the chosen language mode. */
  title: string;
  /** The value being changed. */
  value: unknown;
  /** The editor that fits the value. */
  kind: ValueKind;
  /** Called with the new value when the person presses Set by hand. */
  submit: (value: unknown) => void;
  /** Called when the dialog closes without a new value. */
  cancel?: () => void;
}

export const loadEntitySetStateDialog = () =>
  import("./dialog-entity-set-state");

/**
 * Asks for one new value of a state or attribute. Resolves with the value, or
 * with undefined when the dialog is closed without one. Nothing is written by
 * this dialog: the caller confirms and writes.
 */
export const showEntitySetStateDialog = (
  element: HTMLElement,
  params: Omit<EntitySetStateDialogParams, "submit" | "cancel">
) =>
  new Promise<{ value: unknown } | undefined>((resolve) => {
    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-entity-set-state",
      dialogImport: loadEntitySetStateDialog,
      dialogParams: {
        ...params,
        submit: (value: unknown) => resolve({ value }),
        cancel: () => resolve(undefined),
      } satisfies EntitySetStateDialogParams,
    });
  });
