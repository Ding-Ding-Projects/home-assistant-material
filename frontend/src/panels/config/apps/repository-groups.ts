/**
 * The Supervisor ships with a fixed set of app repositories: the official
 * apps, the local apps folder, and three that come pre-configured (the
 * community apps, ESPHome and Music Assistant). They cannot be removed. The
 * store's repository list mixes them with the ones a person added, so the
 * built-in ones are told apart by their slug, which the Supervisor keeps fixed
 * (see `BuiltinRepository` in the Supervisor's store constants).
 */
export const BUILTIN_REPOSITORY_SLUGS: readonly string[] = [
  "core",
  "local",
  "a0d7b954",
  "5c53de3b",
  "d5369777",
];

export interface RepositoryGroups<T extends { slug: string; name: string }> {
  /** Built in, never removable. */
  builtIn: T[];
  /** Added by the person, removable unless apps from it are installed. */
  own: T[];
}

/** Splits the store's repositories, each group sorted by name. */
export const groupRepositories = <T extends { slug: string; name: string }>(
  repositories: readonly T[],
  compare: (a: string, b: string) => number
): RepositoryGroups<T> => {
  const builtIn: T[] = [];
  const own: T[] = [];
  for (const repository of repositories) {
    (BUILTIN_REPOSITORY_SLUGS.includes(repository.slug) ? builtIn : own).push(
      repository
    );
  }
  const byName = (a: T, b: T) => compare(a.name, b.name);
  return { builtIn: builtIn.sort(byName), own: own.sort(byName) };
};
