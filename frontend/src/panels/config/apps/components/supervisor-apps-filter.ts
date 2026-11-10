import type { IFuseOptions } from "fuse.js";
import { fuseSearch } from "../../../../resources/fuseMultiTerm";
import type { StoreAddon } from "../../../../data/supervisor/store";

export function filterAndSort(addons: StoreAddon[], filter: string) {
  const options: IFuseOptions<StoreAddon> = {
    keys: ["name", "description", "slug"],
    isCaseSensitive: false,
    minMatchCharLength: Math.min(filter.length, 2),
    threshold: 0.2,
    ignoreDiacritics: true,
  };
  return fuseSearch(addons, filter, options);
}
