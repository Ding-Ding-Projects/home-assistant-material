global.window = (global.window ?? {}) as any;
if (!global.navigator) {
  Object.defineProperty(global, "navigator", {
    value: {},
    configurable: true,
    writable: true,
  });
}

global.__DEMO__ = false;
global.__MAPLIBRE_WORKER_URL__ = "/frontend_latest/maplibre-gl-worker.test.js";
global.__STATIC_PATH__ = "/static/";
global.__DEV__ = false;
global.__HASS_URL__ = "";

// Build-time values the bundler defines. Components that read them threw an
// unhandled error in every test that rendered them.
const buildGlobals = global as unknown as Record<string, unknown>;
buildGlobals.__MATERIAL_BUILD__ ??= "";
buildGlobals.__VERSION__ ??= "test";
buildGlobals.__BUILD_TIME__ ??= "2026-01-01T00:00:00.000Z";

// The test browser's form internals lack the validity and form-value methods
// that form-associated components call on every update. They do nothing here:
// no test depends on native form validation.
if (typeof HTMLElement !== "undefined") {
  const original = HTMLElement.prototype.attachInternals;
  if (typeof original === "function") {
    HTMLElement.prototype.attachInternals = function attachInternals(
      this: HTMLElement
    ) {
      const internals = original.call(this) as unknown as Record<
        string,
        unknown
      >;
      for (const name of ["setValidity", "setFormValue"]) {
        if (typeof internals[name] !== "function") {
          internals[name] = () => undefined;
        }
      }
      for (const name of ["checkValidity", "reportValidity"]) {
        if (typeof internals[name] !== "function") {
          internals[name] = () => true;
        }
      }
      if (!internals.validity) {
        Object.defineProperty(internals, "validity", {
          configurable: true,
          value: { valid: true },
        });
      }
      if (typeof internals.validationMessage !== "string") {
        Object.defineProperty(internals, "validationMessage", {
          configurable: true,
          value: "",
        });
      }
      return internals as unknown as ElementInternals;
    };
  }
}
