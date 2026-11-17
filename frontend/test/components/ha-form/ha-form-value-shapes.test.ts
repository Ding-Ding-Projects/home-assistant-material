import { describe, expect, it } from "vitest";
import "../../../src/components/ha-form/ha-form-boolean";
import "../../../src/components/ha-form/ha-form-float";
import "../../../src/components/ha-form/ha-form-integer";
import "../../../src/components/ha-form/ha-form-multi_select";
import "../../../src/components/ha-form/ha-form-select";
import "../../../src/components/ha-form/ha-form-string";

// The rich controls must send the server the same data shapes as before: a
// string, an integer, a float, a boolean, the original option value, and an
// array of selected option values. Each case drives the handler the control
// uses and records the value-changed detail.

const capture = (element: HTMLElement): (() => unknown[]) => {
  const values: unknown[] = [];
  element.addEventListener("value-changed", (ev) => {
    values.push((ev as CustomEvent).detail.value);
  });
  return () => values;
};

const make = (tag: string, props: Record<string, unknown>) => {
  const element = document.createElement(tag) as HTMLElement &
    Record<string, any>;
  Object.assign(element, props);
  return element;
};

describe("ha-form-string value shape", () => {
  it("sends a string, and undefined for an emptied optional field", () => {
    const element = make("ha-form-string", {
      schema: { type: "string", name: "host" },
      data: "a",
    });
    const values = capture(element);
    element._valueChanged({ target: { value: "b" } });
    element._valueChanged({ target: { value: "" } });
    expect(values()).toEqual(["b", undefined]);
  });

  it("keeps an emptied required field as an empty string", () => {
    const element = make("ha-form-string", {
      schema: { type: "string", name: "host", required: true },
      data: "a",
    });
    const values = capture(element);
    element._valueChanged({ target: { value: "" } });
    expect(values()).toEqual([""]);
  });
});

describe("ha-form-integer value shape", () => {
  it("sends an integer from the number box", () => {
    const element = make("ha-form-integer", {
      schema: { type: "integer", name: "count" },
    });
    const values = capture(element);
    element._valueChanged({ target: { value: "12" } });
    expect(values()).toEqual([12]);
  });

  it("sends undefined for an empty box", () => {
    const element = make("ha-form-integer", {
      schema: { type: "integer", name: "count" },
      data: 3,
    });
    const values = capture(element);
    element._valueChanged({ target: { value: "" } });
    expect(values()).toEqual([undefined]);
  });

  it("step buttons send integers and stay inside the range", () => {
    const element = make("ha-form-integer", {
      schema: { type: "integer", name: "port", default: 65535 },
      data: 65534,
    });
    const values = capture(element);
    element._increment();
    element.data = 65535;
    element._increment();
    element.data = 0;
    element._decrement();
    expect(values()).toEqual([65535]);
  });

  it("the slider sends an integer", () => {
    const element = make("ha-form-integer", {
      schema: {
        type: "integer",
        name: "level",
        required: true,
        valueMin: 0,
        valueMax: 10,
      },
      data: 1,
    });
    const values = capture(element);
    element._valueChanged({ target: { value: "7" } });
    expect(values()).toEqual([7]);
  });
});

describe("ha-form-float value shape", () => {
  it("sends a float and accepts a decimal comma", () => {
    const element = make("ha-form-float", {
      schema: { type: "float", name: "latitude" },
    });
    const values = capture(element);
    element._handleInput({ target: { value: "52,5" } });
    element._handleInput({ target: { value: "-3.25" } });
    expect(values()).toEqual([52.5, -3.25]);
  });
});

describe("ha-form-boolean value shape", () => {
  it("sends a boolean", () => {
    const element = make("ha-form-boolean", {
      schema: { type: "boolean", name: "verify_ssl" },
      data: false,
    });
    const values = capture(element);
    element._valueChanged({ target: { checked: true } });
    expect(values()).toEqual([true]);
  });
});

describe("ha-form-select value shape", () => {
  it("sends the original option value, numbers included", () => {
    const element = make("ha-form-select", {
      schema: {
        type: "select",
        name: "level",
        options: [
          [1, "One"],
          [2, "Two"],
        ],
      },
    });
    const values = capture(element);
    element._valueChanged({
      detail: { value: "2" },
      stopPropagation: () => undefined,
    });
    expect(values()).toEqual([2]);
  });
});

describe("ha-form-multi_select value shape", () => {
  it("sends an array of option values", () => {
    const element = make("ha-form-multi_select", {
      schema: { type: "multi_select", name: "modes", options: ["a", "b"] },
      data: ["a"],
    });
    const values = capture(element);
    element._toggle("b", true);
    element._toggle("a", false);
    element._toggle("a", true);
    expect(values()).toEqual([["a", "b"], []]);
  });
});
