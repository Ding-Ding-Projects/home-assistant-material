# Updating an integration whose domain changed

Some integrations change their manifest domain between versions. The files of an install live in
`custom_components/<domain>`, so a plain update would leave the old folder and its configuration
entries behind. The Marketplace handles this in `repositories/integration.py`
(`core/homeassistant/components/marketplace/`).

## What happens on an update

When the new manifest names another domain than the installed one, the install looks for a
bridge release and otherwise decides by whether configuration entries of the old domain exist.

1. **A bridge release exists.** A bridge is the newest release between the installed version and
   the target that carries both domains: ZIP assets `<old_domain>.zip` and `<new_domain>.zip`, or,
   for a repository without ZIP releases, a tree that holds `custom_components/<old>` and
   `custom_components/<new>`. The Marketplace installs that release instead of the target, each
   part into its own folder, remembers the old domain (`previous_domain` in the stored data),
   marks a restart as required and raises a repair issue that explains the move. The target stays
   the pending update, so the next update continues after the integration migrated its entries.
2. **No bridge, no entries of the old domain.** The new domain is installed normally and the
   folder of the old domain is removed, unless it is a symlink or belongs to another repository.
3. **No bridge, but entries of the old domain exist.** Nothing is changed. A fixable repair issue
   names both domains and says the entries have to be removed and added again under the new
   domain. Confirming it installs the new domain and keeps the old folder until no entries of it
   remain.

## Removing the old folder

At startup and after every install, a repository with a `previous_domain` removes the old folder
once no configuration entries of that domain are left. A symlink is never removed, and neither is
a folder another installed repository owns. Uninstalling the repository removes both folders.

## Failure modes

- A bridge that does not download or does not pass the manifest check puts the old folder back
  and leaves the installed version unchanged.
- A failed install of the new domain returns the repository to the old domain.
- The existing checks apply to both domains: valid domain names, domain owned by another
  repository, replacing a built-in integration needs confirmation, download size limits.

## Verification

`core/tests/components/marketplace/test_domain_change.py` covers the bridge from assets and from a
tree, a failed bridge, both no-bridge cases, the confirmed install, the startup cleanup, the
symlink and the shared-folder protections, the uninstall and the repair flow. It was not tried on
a live instance.
