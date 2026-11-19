import { compact, L, scalar, slider, textBox } from "../../quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
  QuickOption,
} from "../../quick-types";

/**
 * Tailored editors for linked media. The linked file is picked by its name
 * from the owner's list; the web address is never shown. Labels live under
 * `linked_media__<field>`.
 */

const lab = (name: string) => L(`linked_media__${name}`);

/** The owner's linked files by name, once the list has been loaded. */
const filePicker = (ctx: QuickContext): QuickControl | undefined => {
  const files = ctx.linkedFiles;
  if (!files || !("file_id" in ctx.fields)) {
    return textBox(ctx, "file_id", lab("file"));
  }
  const value = scalar<string>(ctx, "file_id", "string");
  if (value === null) {
    return undefined;
  }
  const options: QuickOption[] = files.map((file) => ({
    value: file.id,
    label: file.name,
  }));
  // A stored ID that is no longer on the list stays visible and selected.
  if (value !== undefined && !files.some((file) => file.id === value)) {
    options.push({ value, label: value });
  }
  if (options.length <= 8) {
    return {
      kind: "tiles",
      key: "file_id",
      labelKey: lab("file"),
      options,
      value,
    };
  }
  return {
    kind: "selector",
    key: "file_id",
    labelKey: lab("file"),
    valueType: "list",
    selector: {
      select: {
        mode: "dropdown",
        options: options.map((option) => ({
          value: option.value,
          label: option.label ?? option.value,
        })),
      },
    },
    value,
  };
};

export const INTEGRATION_EDITORS_LINKED_MEDIA: Record<string, DomainEditor> = {
  linked_media: {
    siblings: ["fetch", "release"],
    cautions: {},
    controls: {
      fetch: (ctx) =>
        compact([
          filePicker(ctx),
          slider(ctx, "seconds", lab("seconds"), 1, 3600, 1, { unit: "s" }),
        ]),
      release: (ctx) => compact([textBox(ctx, "path", lab("path"))]),
    },
  },
};
