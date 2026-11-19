import { compact, L, stepper, textBox } from "../../quick-helpers";
import type { DomainEditor } from "../../quick-types";

/**
 * Tailored editors for TTC transit. Departures can be read for any stop
 * number, not only the chosen ones. Labels live under `ttc__<field>`.
 */

const lab = (name: string) => L(`ttc__${name}`);

export const INTEGRATION_EDITORS_TTC: Record<string, DomainEditor> = {
  ttc: {
    siblings: ["refresh", "get_departures"],
    cautions: {},
    controls: {
      refresh: () => [],
      get_departures: (ctx) =>
        compact([
          textBox(ctx, "stop", lab("stop")),
          textBox(ctx, "route", lab("route")),
          stepper(ctx, "limit", lab("limit"), 1, 20, 1),
        ]),
    },
  },
};
