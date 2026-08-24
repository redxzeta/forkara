# Rebranding Forkara for a downstream fork

Use this guide to give a downstream distribution its own repository, package, product, and visual
identity without erasing Forkara's provenance or accidentally breaking existing installations.
Treat the rebrand as a reviewed identity migration, not a global search-and-replace.

## Decide the identity map first

Record the old and new value, owner, and compatibility decision for each surface before editing:

| Surface       | Current source of truth                         | Decide explicitly                                     |
| ------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Repository    | `redxzeta/forkara` links and metadata           | owner, repository slug, support and release URLs      |
| Packages      | `@forkara/*` workspace names                    | package scope, published CLI name, import migration   |
| Product       | Forkara display copy                            | product name, short name, website and support copy    |
| Desktop       | `packages/shared/src/desktopIdentity.ts`        | display names, bundle IDs, schemes and update channel |
| Compatibility | `synara`, `.synara` and `SYNARA_*` names        | preserve, alias, or migrate with a rollback plan      |
| Visuals       | `assets/` and application `public/` directories | logo variants, icons, favicons and screenshots        |

## Non-negotiable guardrails

- Preserve [the license](../LICENSE), copyright notices, the README `Origins` section, historical
  changelog entries, archived documentation, and upstream attribution. Those records describe where
  the code came from; they are not current product copy.
- Do not rename third-party provider products, protocols, package dependencies, or quoted historical
  names merely because a search found them.
- Treat `synara`, `.synara`, URL schemes, bundle IDs, update channels, executable names, database
  locations, and every `SYNARA_*` environment variable as compatibility identifiers. Keep them unless
  the fork ships aliases, data migration, update migration, tests, and a rollback path.
- Change source assets and packaging configuration, then regenerate outputs. Do not hand-edit
  `dist/`, `dist-electron/`, packaged applications, installers, or update manifests.

## Repository and documentation

- Update repository, issue, support, download, and release URLs in [README](../README.md),
  [CONTRIBUTING](../CONTRIBUTING.md), current files under [`docs/`](./), and [GitHub templates and
  workflows](../.github/).
- Review [CHANGELOG](../CHANGELOG.md) and [`docs/archive/`](./archive/) for current calls to action,
  but preserve historical names and claims in their original context.
- Review user-facing copy in [`apps/web`](../apps/web/), [`apps/desktop`](../apps/desktop/),
  [`apps/server`](../apps/server/), and [`apps/marketing`](../apps/marketing/). Keep provider-owned
  names and compatibility terminology distinct from first-party product copy.

## Package and application metadata

- Inventory the root [`package.json`](../package.json), every `apps/*/package.json`, every
  `packages/*/package.json`, and [`scripts/package.json`](../scripts/package.json).
- If the `@forkara/*` scope changes, update workspace package names, dependencies, TypeScript imports,
  build filters, scripts, and the lockfile together. A partial scope rename leaves the workspace
  unbuildable.
- Review the repository metadata and `bin` map in [`apps/server/package.json`](../apps/server/package.json).
  The `synara` and `synara-restore-migration-backup` binaries are compatibility names, so rename them
  only with aliases and release/migration coverage.
- Review the desktop `productName` in
  [`apps/desktop/package.json`](../apps/desktop/package.json) and metadata in web/marketing HTML and
  manifests.

## Desktop, runtime, and release identity

- Start with [`packages/shared/src/desktopIdentity.ts`](../packages/shared/src/desktopIdentity.ts),
  which owns display names, bundle IDs, URL schemes, update channels, user-data names, and default
  home-directory names.
- Audit [`scripts/lib/desktop-platform-build-config.ts`](../scripts/lib/desktop-platform-build-config.ts)
  for executable names, Linux desktop identity, macOS descriptions/helper paths, icons, and the
  Windows installer GUID. Changing a stable GUID or bundle/update identity can create a parallel
  installation or strand existing users.
- Review [`scripts/build-desktop-artifact.ts`](../scripts/build-desktop-artifact.ts),
  [`scripts/lib/release-workspace-manifests.ts`](../scripts/lib/release-workspace-manifests.ts),
  [`scripts/release-update-policy.json`](../scripts/release-update-policy.json),
  [`scripts/prepare-release-update-feed.ts`](../scripts/prepare-release-update-feed.ts), and
  [`scripts/update-release-package-versions.ts`](../scripts/update-release-package-versions.ts).
- Keep [the release workflow](../.github/workflows/release.yml), [release documentation](./release.md),
  artifact names, signing/notarization subjects, update repository, release notes, and smoke tests in
  agreement.
- Search [`packages/shared/src/synaraHome.ts`](../packages/shared/src/synaraHome.ts),
  [`scripts/dev-runner.ts`](../scripts/dev-runner.ts), [`scripts/canary.ts`](../scripts/canary.ts),
  desktop startup, and server startup before changing storage or environment compatibility.

## Logos, icons, static assets, and screenshots

- Canonical vector marks live at [`assets/forkara-mark.svg`](../assets/forkara-mark.svg) and
  [`assets/forkara-logo.svg`](../assets/forkara-logo.svg).
- Production and development raster/icon variants live under [`assets/prod/`](../assets/prod/) and
  [`assets/dev/`](../assets/dev/). Their packaging map is
  [`scripts/lib/brand-assets.ts`](../scripts/lib/brand-assets.ts).
- Packaged desktop icons, dock variants, and entitlement property lists live in
  [`apps/desktop/resources/`](../apps/desktop/resources/). Review permission descriptions as copy,
  while preserving required entitlement keys and capabilities.
- Browser-served copies and metadata live in [`apps/web/public/`](../apps/web/public/),
  [`apps/web/index.html`](../apps/web/index.html),
  [`apps/web/src/components/ForkaraLogo.tsx`](../apps/web/src/components/ForkaraLogo.tsx),
  [`apps/marketing/public/`](../apps/marketing/public/), and
  [`apps/marketing/src/layouts/`](../apps/marketing/src/layouts/). Update every required SVG, PNG,
  ICO, Apple touch icon, and favicon variant.
- Review README, marketing, documentation, and release screenshots for visible old identity. Keep an
  old screenshot only when it is intentionally historical and labelled as such.

## Brand checks and provenance controls

[`scripts/check-brand-identity.ts`](../scripts/check-brand-identity.ts) protects approved attribution
and reviewed visual-asset digests as well as current first-party identity. A downstream fork should
adapt this guard to its policy, not delete or bypass it:

- preserve the approved license, origin, changelog, and historical-copy exceptions;
- define which retired first-party names must not return as current branding;
- review and update visual digests only after inspecting the changed image; and
- update [`scripts/check-brand-identity.test.ts`](../scripts/check-brand-identity.test.ts) alongside
  any policy change.

## Final checklist

- [ ] The identity map records repository, package, product, desktop, compatibility, and asset names.
- [ ] Current product copy and links use the downstream identity; provenance and historical records
      remain intact.
- [ ] Package scopes/imports, manifests, binaries, and lockfile agree.
- [ ] Desktop IDs, installer/update policy, storage paths, schemes, and environment compatibility are
      either preserved or covered by an explicit migration.
- [ ] Every platform icon, favicon, logo, screenshot, and static copy was reviewed at its real output
      size.
- [ ] Release artifacts and updater metadata were rebuilt from source configuration.
- [ ] Brand, documentation, package, desktop, and release validation pass in CI.

Useful inventory commands from the repository root:

```bash
rg -n -i 'forkara|synara|redxzeta/forkara' README.md CONTRIBUTING.md docs apps packages scripts .github
rg -n 'SYNARA_|@forkara/' apps packages scripts .github package.json
rg --files assets apps/web/public apps/marketing/public
```

At minimum, run `bun run brand:check`, `bun run readme:truthiness`, `bun run release:smoke`,
`bun run fmt`, `bun run lint`, and `bun run typecheck`. Rebuild and smoke-test every desktop/release
target whose identity or assets changed.
