import { expect, it } from "vitest";
import "../../../../src/panels/config/support/ha-config-support";
import {
  emptyTicketStore,
  readTickets,
  withTicket,
  writeTickets,
} from "../../../../src/common/locks/support-tickets";
import {
  newExtra,
  readExtras,
  writeExtras,
} from "../../../../src/panels/config/support/ticket-view-logic";
import type { DialogBoxParams } from "../../../../src/dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../src/types";

it("preserves a support ticket and its notes until destructive confirmation", async () => {
  const store = withTicket(emptyTicketStore(), "Demo door lock", "", 10);
  writeTickets(store);
  const extras = { "0001": newExtra(10) };
  writeExtras(extras);
  const page = document.createElement("ha-config-support");
  page.hass = { localize: (key: string) => key } as unknown as HomeAssistant;
  const button = Object.assign(document.createElement("button"), {
    ticketNumber: "0001",
  });
  let confirmation: DialogBoxParams | undefined;
  page.addEventListener("show-dialog", (ev) => {
    confirmation = (ev as CustomEvent).detail.dialogParams;
  });
  let pending: Promise<void> | undefined;
  button.onclick = (event) => {
    pending = page["_remove"](event);
  };
  button.click();
  expect(confirmation?.destructive).toBe(true);
  expect(confirmation?.text).toBe("Demo door lock");
  expect(readTickets()).toEqual(store);
  confirmation!.cancel!();
  await pending;
  expect(readTickets()).toEqual(store);
  expect(readExtras()).toEqual(extras);
  button.click();
  confirmation!.confirm!();
  await pending;
  expect(readTickets().tickets).toEqual([]);
  expect(readExtras()).toEqual({});
});
