import { assert, describe, it } from "vitest";

import type { LovelaceConfig } from "../../../../src/data/lovelace/config/types";
import {
  convertPanelViewToSections,
  getViewAddContentMode,
  isPlaceholderCard,
} from "../../../../src/panels/lovelace/views/view-add-content";

describe("getViewAddContentMode", () => {
  const base = {
    editMode: true,
    isStrategy: false,
    isPanel: true,
    cardCount: 1,
  };

  it("offers nothing outside edit mode", () => {
    assert.equal(getViewAddContentMode({ ...base, editMode: false }), "none");
  });

  it("offers the sections layout for a panel view that has a card", () => {
    assert.equal(getViewAddContentMode(base), "convert");
    assert.equal(getViewAddContentMode({ ...base, cardCount: 3 }), "convert");
  });

  it("leaves an empty panel view to its own add button", () => {
    assert.equal(getViewAddContentMode({ ...base, cardCount: 0 }), "none");
  });

  it("leaves other layouts to their own add controls", () => {
    assert.equal(getViewAddContentMode({ ...base, isPanel: false }), "none");
  });

  it("asks to take control of a generated view in every layout", () => {
    assert.equal(
      getViewAddContentMode({ ...base, isStrategy: true }),
      "take-control"
    );
    assert.equal(
      getViewAddContentMode({ ...base, isStrategy: true, isPanel: false }),
      "take-control"
    );
  });
});

describe("isPlaceholderCard", () => {
  it("recognises the generated empty state", () => {
    assert.isTrue(
      isPlaceholderCard({ type: "empty-state", content_only: true })
    );
  });

  it("keeps an empty state a person added themselves", () => {
    assert.isFalse(isPlaceholderCard({ type: "empty-state" }));
    assert.isFalse(isPlaceholderCard({ type: "markdown", content_only: true }));
  });
});

describe("convertPanelViewToSections", () => {
  it("replaces a placeholder with an empty section and keeps the page", () => {
    const config: LovelaceConfig = {
      views: [
        { title: "Home", path: "home" },
        {
          title: "Bedroom",
          path: "areas-bedroom",
          type: "panel",
          subview: true,
          cards: [{ type: "empty-state", content_only: true }],
        },
      ],
    };
    const result = convertPanelViewToSections(config, 1);
    assert.deepEqual(result.views[0], config.views[0]);
    assert.deepEqual(result.views[1], {
      title: "Bedroom",
      path: "areas-bedroom",
      subview: true,
      type: "sections",
      sections: [{ type: "grid", cards: [] }],
    });
  });

  it("moves the cards of a legacy panel view into the first section", () => {
    const config: LovelaceConfig = {
      views: [{ title: "Map", panel: true, cards: [{ type: "map" }] }],
    };
    const result = convertPanelViewToSections(config, 0);
    assert.deepEqual(result.views[0], {
      title: "Map",
      type: "sections",
      sections: [{ type: "grid", cards: [{ type: "map" }] }],
    });
  });

  it("does not change the original configuration", () => {
    const config: LovelaceConfig = {
      views: [{ type: "panel", cards: [{ type: "map" }] }],
    };
    convertPanelViewToSections(config, 0);
    assert.deepEqual(config.views[0], {
      type: "panel",
      cards: [{ type: "map" }],
    });
  });

  it("leaves a generated view and an unknown index alone", () => {
    const config: LovelaceConfig = {
      views: [{ strategy: { type: "areas" } } as any],
    };
    assert.strictEqual(convertPanelViewToSections(config, 0), config);
    assert.strictEqual(convertPanelViewToSections(config, 4), config);
  });
});
