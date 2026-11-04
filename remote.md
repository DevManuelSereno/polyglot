# Remote Catalog Guide

For apps that fetch translations at runtime from a bucket or CDN, one file per module and locale, and for moving a project from local files to that setup. An example is in [examples/remote-catalog/](examples/remote-catalog/): a framework-agnostic loader plus the next-intl wiring; the ideas apply to any library with an async loader.

## The Layout

```
<remote-url>/<prefix>/<module>/<locale>.json      published (what the app fetches)
messages/features/<module>/<locale>.json          local mirror (same files, versioned)
```

- **One file per module and locale.** A module is a screen or feature area (`orders`, `layout`); its file can hold several namespaces.
- **The namespace is the JSON root**: `{ "OrdersPage": { "title": "…" } }`. Files from different modules merge without colliding, and code keeps calling `useTranslations("OrdersPage")`.
- **Shared keys** (buttons, toasts, table labels) live in a `common` module of the app itself.
- **The local mirror** is the source of truth for review: keys are created and validated there, then published. It is versioned in git, so `remote-check.js --since` can tell what changed.

## Conventions File

```yaml
---
library: next-intl
storage: remote
remote-provider: gcs
remote-url: https://storage.googleapis.com/<bucket>
remote-path: <app>/features/{module}/{locale}.json
local-mirror: messages/features
fallback-locale: en-us
locales: en-us, pt-br, es-es
skip-discovery: true
---
```

`local-mirror` keeps `validate-keys.js` on (remote storage without a mirror has nothing local to validate). `remote-url` and `remote-path` are read by `remote-check.js`.

## Runtime Rules

The example loader ([catalog.ts](examples/remote-catalog/catalog.ts), wired into next-intl by [i18n-request.ts](examples/remote-catalog/i18n-request.ts), [missing-keys.ts](examples/remote-catalog/missing-keys.ts) and [ClientIntlProvider.tsx](examples/remote-catalog/ClientIntlProvider.tsx)) follows these rules:

1. **Discovery**: know which modules exist and in which locales — a `manifest.json` published with the files (the example), or the bucket's listing API. Cache the result briefly (seconds in development, minutes in production).
2. **Fallback locale**: a module without the requested locale loads `fallback-locale`; fallback modules are merged first, the requested locale on top.
3. **Tolerant catalog**: a missing key must not crash the screen. Warn once in development and render `Namespace.key` — on the server (`getRequestConfig`'s `onError` / `getMessageFallback`) **and** on the client provider (functions cannot cross from server to client).
4. **Last good catalog**: if a module fails to load, serve the previous complete catalog instead of a partial one.
5. **Normalize published files**: flat dotted keys become nested; a bare `{}` becomes `'{}'` so the ICU parser does not throw.
6. **Bypass caches** on fetch (`?t=<now>`, `cache: "no-store"`) so a republished file shows up within the catalog TTL.

## Moving From Local to Remote

One module at a time. Each step leaves the app working.

### 1. Loader first, no module moved

- Add the loader with the **local catalog underneath** the remote one (fallback while modules move).
- Replace the client provider with the tolerant one, passing `locale`.
- With the remote empty, every screen must look the same. Verify that before moving any module.

### 2. Per module

1. Create `<mirror>/<module>/<locale>.json` with the namespace root, and spread it into the local catalog (e.g. `messages/<locale>/index.ts`) so the local fallback stays identical. Remove the old local file of that namespace.
2. Review the module with the Migrate checklist ([SKILL.md](SKILL.md), Phase 4): hardcoded text, schemas, formatting, shared components it imports.
3. Validate: `validate-keys.js --namespace <Namespace>` (every key used exists in every locale; orphans listed, not deleted without approval).
4. The user publishes the **source locale first** (the most complete one) and the skill compares: `remote-check.js --compare --module <module>`.
5. Translations of the other locales come after (Translate mode), then the user publishes them and the skill compares again.

### 3. End

- When every module is published and compared, remove the local fallback (the `messages/` imports and `loadLocalMessages`).
- A module deferred on purpose keeps the local catalog alive; note it, and do not remove the fallback until it moves.

## Publishing

- **The user publishes**, in batches. The skill prepares the files in the mirror and lists exactly what to upload:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/remote-check.js --since <last-published-ref>
```

  It prints, per module and locale, the file to publish and the keys added, removed and changed, plus mirror files deleted since the ref.
- **A key that moves between modules** (e.g. into `common` when reusing it) means publishing **both** modules, the receiving one first: published alone, the losing module drops the key before the new one exists. `remote-check.js --since` lists these moves.
- After publishing, compare:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/remote-check.js --compare
```

  Per file: identical, not published, keys only on one side, different texts, invalid JSON. With a public listing (GCS/S3) it also reports modules published under another folder name or removed locally.

## Checking the Built Catalog

`remote-check.js` compares files. To check what the app actually serves, write a throwaway test that builds the catalog with the real loader against the real remote, for each locale, and asserts:

- no key missing compared with the local catalog, and no unexpected extra key;
- every message parses with the ICU parser (`new IntlMessageFormat(message, locale)`).

Keep it out of the regular test suite: it depends on the network and on what is published.

## Caveats

- **Local fallback under the fallback locale**: while the local catalog exists, it sits under the remote fallback too. A module published only in `fallback-locale` shows that language even to users of a locale the local files have. Publish the source locale first.
- **Folder name**: the remote folder must match the module name in the mirror; a different folder still loads (discovery finds any folder) but comparisons and republishing lists will not match it.
- **Manifest out of date**: a module published without updating the manifest is not loaded. Publish the manifest last, in the same batch. (Bucket listings avoid this but cap at 1000 keys on GCS/S3 without pagination.)
- **Tests mock the i18n library**, so they do not catch a key missing in the remote. Validation is `validate-keys.js` on the mirror plus `remote-check.js --compare`.
