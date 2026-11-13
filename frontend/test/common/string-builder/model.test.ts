import { describe, expect, it } from "vitest";
import {
  createPiece,
  createTextPiece,
} from "../../../src/common/string-builder/create-piece";
import { insertPiece } from "../../../src/common/string-builder/insert-piece";
import { parseTemplate } from "../../../src/common/string-builder/parse";
import { escapeText, quote } from "../../../src/common/string-builder/quote";
import { serializePieces } from "../../../src/common/string-builder/serialize";
import type { Piece } from "../../../src/common/string-builder/types";

const strip = (pieces: Piece[]): unknown =>
  JSON.parse(
    JSON.stringify(pieces, (key, value) => (key === "id" ? undefined : value))
  );

const make = <T extends Piece>(kind: T["kind"], changes: Partial<T>): T =>
  ({ ...createPiece(kind), ...changes }) as T;

const roundTrip = (pieces: Piece[]) => {
  const template = serializePieces(pieces);
  const parsed = parseTemplate(template);
  expect(parsed.structured).toBe(true);
  expect(strip(parsed.pieces)).toEqual(strip(pieces));
  expect(serializePieces(parsed.pieces)).toBe(template);
  return template;
};

describe("inserting a visual piece", () => {
  it("splits existing text at the caret and preserves both sides", () => {
    const text = createTextPiece("for the  action");
    const state = make("state", { entity: "sensor.example" });
    const result = insertPiece([text], state, {
      pieceId: text.id,
      offset: 8,
    });
    expect(serializePieces(result)).toBe(
      "for the {{ states('sensor.example') }} action"
    );
    expect(result[0].id).toBe(text.id);
    expect(result[1]).toBe(state);
    expect(result[2].id).not.toBe(text.id);
  });

  it("inserts at either end and never splits a surrogate pair", () => {
    const text = createTextPiece("a😀z");
    const time = createPiece("datetime");
    const positions = (offset: number) =>
      insertPiece([text], time, { pieceId: text.id, offset });
    expect(positions(0)[0]).toBe(time);
    expect(positions(5)[1]).toBe(time);
    expect(positions(2)[0]).toMatchObject({ text: "a😀" });
    expect(positions(2)[2]).toMatchObject({ text: "z" });
  });
});

describe("string builder text escaping", () => {
  it("quotes backslashes and single quotes", () => {
    expect(quote("it's a\\b")).toBe("'it\\'s a\\\\b'");
  });

  it("keeps template delimiters in plain text as literals", () => {
    expect(escapeText("a {{ b }} {% c %} {# d")).toBe(
      "a {{ '{{' }} b }} {{ '{%' }} c %} {{ '{#' }} d"
    );
  });

  it("escapes a trailing brace that could join the next piece", () => {
    expect(
      serializePieces([createTextPiece("x{"), createPiece("datetime")])
    ).toBe("x{{ '{' }}{{ now().strftime('%H:%M') }}");
  });

  it("round trips text with delimiters", () => {
    roundTrip([createTextPiece("keep {{ this }} and {% that %} and {# those")]);
    roundTrip([createTextPiece("{{{")]);
  });
});

describe("string builder serialising", () => {
  it("writes the documented template functions", () => {
    expect(
      serializePieces([
        createTextPiece("Fridge is at "),
        make("state", { entity: "sensor.fridge", withUnit: true }),
      ])
    ).toBe("Fridge is at {{ states('sensor.fridge', with_unit=True) }}");
    expect(
      serializePieces([make("state", { entity: "sensor.a", fallback: "n/a" })])
    ).toBe("{{ states('sensor.a') if has_value('sensor.a') else 'n/a' }}");
    expect(serializePieces([make("datetime", { format: "%A" })])).toBe(
      "{{ now().strftime('%A') }}"
    );
    expect(
      serializePieces([
        make("elapsed", {
          entity: "binary_sensor.door",
          source: "last_changed",
          style: "minutes",
        }),
      ])
    ).toBe(
      "{{ ((as_timestamp(now()) - as_timestamp(states.binary_sensor.door.last_changed)) / 60) | int }}"
    );
    expect(
      serializePieces([
        make("number", {
          entity: "sensor.t",
          op: "multiply",
          operand: 1.8,
          decimals: 1,
        }),
      ])
    ).toBe(
      "{{ (states('sensor.t') | float * 1.8) | round(1) if is_number(states('sensor.t')) else 'unknown' }}"
    );
  });

  it("writes a comparison as an if block", () => {
    const condition = make("condition", {
      leftEntity: "light.hall",
      op: "is",
      right: { mode: "literal", literal: "on", entity: "" },
      thenPieces: [createTextPiece("lit")],
      elsePieces: [createTextPiece("dark")],
    });
    expect(serializePieces([condition])).toBe(
      "{% if is_state('light.hall', 'on') %}lit{% else %}dark{% endif %}"
    );
  });

  it("never writes anything that changes state", () => {
    const all = [
      make("state", { entity: "a.b", withUnit: true, fallback: "x" }),
      make("attribute", { entity: "a.b", attribute: "c", fallback: "x" }),
      make("name", { entity: "a.b", what: "area" }),
      make("elapsed", { entity: "a.b", direction: "until", source: "state" }),
      make("count", { entities: ["a.b", "a.c"] }),
    ];
    expect(serializePieces(all)).not.toMatch(
      /call_service|set_state|turn_on|turn_off|\.service/
    );
  });
});

describe("string builder round trip", () => {
  it("restores every kind of piece", () => {
    roundTrip([
      createTextPiece("Buy milk, fridge is at "),
      make("state", { entity: "sensor.fridge", withUnit: true }),
    ]);
    roundTrip([make("state", { entity: "sensor.a", fallback: "n/a" })]);
    roundTrip([
      make("attribute", { entity: "climate.x", attribute: "temperature" }),
      createTextPiece(" / "),
      make("attribute", {
        entity: "climate.x",
        attribute: "humidity",
        fallback: "?",
      }),
    ]);
    roundTrip([
      make("name", { entity: "light.a", what: "name" }),
      make("name", { entity: "light.a", what: "area" }),
      make("name", { entity: "light.a", what: "floor" }),
    ]);
    roundTrip([
      createTextPiece("It is "),
      make("datetime", { format: "%A" }),
      createTextPiece(", "),
      make("datetime", { format: "%H:%M" }),
    ]);
    roundTrip([
      make("elapsed", {
        entity: "binary_sensor.door",
        direction: "since",
        source: "last_updated",
        style: "words",
        precision: 2,
      }),
      make("elapsed", {
        entity: "sensor.alarm",
        direction: "until",
        source: "state",
        style: "words",
      }),
      make("elapsed", {
        entity: "binary_sensor.door",
        direction: "since",
        source: "last_changed",
        style: "minutes",
      }),
      make("elapsed", {
        entity: "sensor.alarm",
        direction: "until",
        source: "state",
        style: "hours",
      }),
    ]);
    roundTrip([
      make("number", {
        entity: "sensor.t",
        op: "add",
        operand: 32,
        decimals: 0,
        fallback: "none",
      }),
      make("number", { entity: "sensor.t", op: "none", decimals: 2 }),
    ]);
    roundTrip([
      make("count", {
        entities: ["light.a", "light.b"],
        state: "on",
      }),
    ]);
  });

  it("restores comparisons, including one nested level", () => {
    const inner = make("condition", {
      leftEntity: "sensor.t",
      op: "between",
      leftAs: "number",
      right: { mode: "literal", literal: "10", entity: "" },
      rightEnd: { mode: "entity", literal: "", entity: "input_number.max" },
      thenPieces: [createTextPiece("mild")],
      elsePieces: [createTextPiece("extreme")],
    });
    roundTrip([
      make("condition", {
        leftEntity: "light.a",
        op: "is_not",
        right: { mode: "literal", literal: "on", entity: "" },
        thenPieces: [createTextPiece("off or other")],
      }),
      make("condition", {
        leftEntity: "sensor.msg",
        op: "contains",
        right: { mode: "entity", literal: "", entity: "input_text.word" },
        thenPieces: [createTextPiece("found")],
      }),
      make("condition", {
        leftEntity: "sensor.t",
        op: "above",
        leftAs: "number",
        right: { mode: "literal", literal: "20.5", entity: "" },
        thenPieces: [inner],
        elsePieces: [
          createTextPiece("cool "),
          make("state", { entity: "sensor.t" }),
        ],
      }),
      make("condition", {
        leftEntity: "sensor.t",
        op: "is",
        leftAs: "number",
        right: { mode: "entity", literal: "", entity: "sensor.u" },
        thenPieces: [createTextPiece("same")],
      }),
    ]);
  });

  it("parses hand written templates into text and raw pieces", () => {
    const parsed = parseTemplate(
      "Hi {{ states('sensor.a') }}, {{ trigger.to_state.state | upper }}!"
    );
    expect(parsed.structured).toBe(true);
    expect(parsed.pieces.map((piece) => piece.kind)).toEqual([
      "text",
      "state",
      "text",
      "raw",
      "text",
    ]);
    expect(serializePieces(parsed.pieces)).toBe(
      "Hi {{ states('sensor.a') }}, {{ trigger.to_state.state | upper }}!"
    );
  });

  it("keeps template features it does not model as one raw piece", () => {
    const source =
      "{% set x = 3 %}{{ x }} {% for i in range(2) %}a{% endfor %}";
    const parsed = parseTemplate(source);
    expect(parsed.structured).toBe(false);
    expect(parsed.pieces).toHaveLength(1);
    expect(serializePieces(parsed.pieces)).toBe(source);
  });

  it("keeps an unterminated template as raw", () => {
    const parsed = parseTemplate("oops {{ states('a.b'");
    expect(parsed.structured).toBe(false);
    expect(serializePieces(parsed.pieces)).toBe("oops {{ states('a.b'");
  });

  it("treats text without template syntax as one text piece", () => {
    const parsed = parseTemplate("Just words");
    expect(strip(parsed.pieces)).toEqual([
      { kind: "text", text: "Just words" },
    ]);
    expect(parseTemplate("").pieces).toEqual([]);
  });

  it("does not nest conditions deeper than one level", () => {
    const source =
      "{% if is_state('a.b', 'on') %}{% if is_state('a.c', 'on') %}{% if is_state('a.d', 'on') %}x{% endif %}{% endif %}{% endif %}";
    expect(parseTemplate(source).structured).toBe(false);
  });
});
