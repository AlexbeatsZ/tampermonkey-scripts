# AI Conversation Navigator maintenance and release

Read this document before changing script identity, update metadata or bookmark storage.

## Maintenance

AlexbeatsZ independently maintains this customized script in `AlexbeatsZ/tampermonkey-scripts`. The supplied script and the repository's previous `102.0.1` version were identical. Version `102.0.2-local` makes the maintainer and repository explicit without changing runtime behavior. Future local releases increment the numeric version and keep the `-local` suffix.

The homepage, source and support metadata point to this repository. Both `@updateURL` and `@downloadURL` point to:

`https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/ai-conversation-navigator.user.js`

The existing MIT license declaration remains in the userscript. `imports.json` records the original import; it is historical provenance, not the current release source.

## Installed-script continuity

Keep `@name AI Conversation Navigator` and the legacy `@namespace https://greasyfork.org` for the existing installed script. The namespace is an identity field, not a network endpoint. Do not change it merely to display the current maintainer; author, homepage, source and support metadata provide that information.

Keep existing GM storage keys (`acn_` and `acn_debug_enabled`), bookmark format and expiry behavior unless a separate data migration is implemented. A namespace/name migration requires an explicit installation and bookmark migration plan.

For an installation already using this repository's Raw update URL, a normal update check can fetch the new version. Otherwise, install the Raw URL over the existing script once and confirm the update settings. Browser installation is separate from GitHub publication.

## Release validation

- Run `tools/validate.ps1`.
- Confirm the new version is numerically newer, all repository metadata resolves to this repository, and matches/grants/storage keys are retained.
- For metadata-only releases, compare the runtime body with the supplied script; browser functional retesting is unnecessary when the body is unchanged.
- Commit and push the scoped changes, then verify the unauthenticated Raw URL returns the published version and content.
