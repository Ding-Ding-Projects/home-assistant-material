import { assert, describe, it } from "vitest";

import type { LovelaceConfig } from "../../../../src/data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../../src/data/lovelace/config/view";
import {
  cardEntities,
  checkDashboard,
  dashboardStats,
  deleteCards,
  duplicateCards,
  insertCards,
  moveCards,
  outline,
  replaceEntity,
} from "../../../../src/panels/lovelace/editor/dashboard-tools";

// These tests protect the bulk edits: a wrong index here silently deletes or
// moves the wrong card in someone's saved dashboard.

const sample = (): LovelaceConfig => ({
  views: [
    {
      title: "Home",
      path: "home",
      cards: [
        { type: "entities", entities: ["light.kitchen", "switch.fan"] },
        { type: "tile", entity: "light.hall" },
        {
          type: "vertical-stack",
          cards: [{ type: "tile", entity: "sensor.temp" }],
        },
      ],
    },
    {
      title: "Rooms",
      path: "home",
      sections: [
        {
          type: "grid",
          cards: [
            { type: "heading", heading: "Kitchen" },
            { type: "tile", entity: "light.kitchen", name: "light.kitchen" },
          ],
        },
        { type: "grid", cards: [] },
      ],
    },
    { strategy: { type: "original-states" } } as LovelaceViewConfig,
  ],
});

describe("dashboard tools", () => {
  it("finds entity IDs in entity fields and lists only", () => {
    assert.deepEqual(
      cardEntities({
        type: "entities",
        entities: ["light.a", { entity: "light.b" }],
        content: "light.c is not a reference",
      }),
      ["light.a", "light.b"]
    );
  });

  it("outlines views, sections and nested cards", () => {
    const o = outline(sample());
    assert.equal(o.length, 3);
    assert.equal(o[0].sections[0].cards.length, 4);
    assert.equal(o[0].sections[0].cards[3].depth, 1);
    assert.isFalse(o[0].sections[0].cards[3].selectable);
    assert.equal(o[1].sections[0].title, "Kitchen");
    assert.isTrue(o[2].strategy);
  });

  it("deletes several cards from one list without shifting the wrong one", () => {
    const next = deleteCards(sample(), [
      { view: 0, section: -1, card: 0 },
      { view: 0, section: -1, card: 2 },
    ]);
    const cards = (next.views[0] as LovelaceViewConfig).cards!;
    assert.deepEqual(
      cards.map((c) => c.type),
      ["tile"]
    );
  });

  it("leaves the original configuration untouched", () => {
    const config = sample();
    deleteCards(config, [{ view: 0, section: -1, card: 0 }]);
    assert.equal((config.views[0] as LovelaceViewConfig).cards!.length, 3);
  });

  it("duplicates each card right after itself", () => {
    const next = duplicateCards(sample(), [{ view: 0, section: -1, card: 1 }]);
    const cards = (next.views[0] as LovelaceViewConfig).cards!;
    assert.equal(cards.length, 4);
    assert.deepEqual(cards[1], cards[2]);
  });

  it("moves cards into a section in order", () => {
    const next = moveCards(
      sample(),
      [
        { view: 0, section: -1, card: 1 },
        { view: 0, section: -1, card: 0 },
      ],
      1,
      1
    );
    const v0 = next.views[0] as LovelaceViewConfig;
    const v1 = next.views[1] as LovelaceViewConfig;
    assert.equal(v0.cards!.length, 1);
    assert.deepEqual(
      (v1.sections![1] as { cards: { type: string }[] }).cards.map(
        (c) => c.type
      ),
      ["entities", "tile"]
    );
  });

  it("refuses to move into a strategy view", () => {
    assert.throws(() =>
      moveCards(sample(), [{ view: 0, section: -1, card: 0 }], 2, -1)
    );
  });

  it("replaces only exact entity IDs and counts them", () => {
    const { config, count } = replaceEntity(
      sample(),
      "light.kitchen",
      "light.cooking"
    );
    assert.equal(count, 3);
    assert.include(JSON.stringify(config), "light.cooking");
    assert.notInclude(JSON.stringify(config), "light.kitchen");
  });

  it("checks for problems", () => {
    const problems = checkDashboard(sample(), {
      "light.kitchen": { state: "on" },
      "switch.fan": { state: "unavailable" },
      "light.hall": { state: "off" },
    });
    const kinds = problems.map((p) => p.kind);
    assert.include(kinds, "duplicate_path");
    assert.include(kinds, "empty_section");
    assert.include(kinds, "unavailable_entity");
    assert.deepEqual(
      problems.filter((p) => p.kind === "unknown_entity").map((p) => p.detail),
      ["sensor.temp"]
    );
  });

  it("counts cards, sections and entities", () => {
    const s = dashboardStats(sample());
    assert.equal(s.views, 3);
    assert.equal(s.sections, 2);
    assert.equal(s.cards, 6);
    assert.equal(s.entities, 4);
    assert.equal(s.types[0][0], "tile");
  });

  it("inserts a template into a new section when none is chosen", () => {
    const next = insertCards(sample(), [{ type: "markdown" }], 1, -1);
    const v1 = next.views[1] as LovelaceViewConfig;
    assert.equal(v1.sections!.length, 3);
  });
});
