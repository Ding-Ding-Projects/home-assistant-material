import { describe, expect, it, vi } from "vitest";
import {
  createCardElement,
  getCardElementClass,
} from "../../../../src/panels/lovelace/create-element/create-card-element";
import type { HomeAssistant } from "../../../../src/types";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __BUILD__: "modern",
    __BACKWARDS_COMPAT__: false,
    __SUPERVISOR__: false,
    __NAMESPACE__: "frontend",
  });
});

describe("printer dashboard cards", () => {
  it.each(["printer-status-card", "printer-controls-card"])(
    "creates a %s from its picker configuration and saved configuration",
    async (type) => {
      const constructor = await getCardElementClass(type);
      expect(constructor).toBeDefined();
      const stub = await constructor.getStubConfig!(
        { entities: {}, devices: {} } as HomeAssistant,
        [],
        []
      );
      expect(stub.type).toBe(type);
      expect(createCardElement(stub)).toBeInstanceOf(constructor);
      expect(createCardElement({ type, device_id: "printer" })).toBeInstanceOf(
        constructor
      );
    }
  );
});
