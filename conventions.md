# Project i18n Conventions

This file documents the i18n conventions detected in your project and how to configure them.

## Auto-Detection

The skill automatically detects your project's i18n conventions using `detect-conventions.js`.

For CLI usage and options, see [scripts/DETECT-CONVENTIONS.md](scripts/DETECT-CONVENTIONS.md).

---

## Skip Discovery for Established Projects

If your project has well-established i18n conventions, you can skip the discovery phase entirely, saving ~2-3k tokens and eliminating user validation round-trips.

### How to Enable

1. Create `.claude/polyglot-conventions.md` in your project root
2. Add YAML frontmatter with your conventions
3. Set `skip-discovery: true`

### Example: Next.js + next-intl + GCS

```yaml
---
library: next-intl
hook: useTranslations("namespace")
storage: remote
remote-provider: gcs
gcs-workflow: user-provides-json → merge → return-updated
key-casing: camelCase
namespace-pattern: module.section.key
sub-components: direct
locales: pt-br, ja-jp
skip-discovery: true
---
```

### Example: Next.js + next-intl + bucket with a local mirror

The app fetches one file per module from a bucket; the repo keeps the same files in `messages/features/<module>/<locale>.json` (fallback and files prepared for upload). Validation runs on the mirror.

```yaml
---
library: next-intl
hook: useTranslations("Namespace")
storage: remote
remote-provider: gcs
remote-url: https://storage.googleapis.com/my-bucket
remote-path: my-app/features/{module}/{locale}.json
local-mirror: messages/features
fallback-locale: en-us
key-casing: camelCase
namespace-pattern: Namespace.Section.key
sub-components: direct
locales: pt-br, en-us, es-es
skip-discovery: true
---
```

### Example: React + react-i18next + Local JSON

```yaml
---
library: react-i18next
hook: useTranslation("namespace")
storage: local
key-casing: camelCase
namespace-pattern: flat
sub-components: prop-drilling
locales: en, pt-BR, es
skip-discovery: true
---
```

### Example: Vue + vue-i18n + Crowdin

```yaml
---
library: vue-i18n
hook: $t("namespace.key")
storage: remote
remote-provider: crowdin
key-casing: camelCase
namespace-pattern: nested
sub-components: direct
locales: en, fr, de, ja
skip-discovery: true
---
```

### Required Fields for Skip

- `library` — which i18n library (next-intl, react-i18next, vue-i18n, etc.)
- `storage` — `local` or `remote`; `remote` plus `local-mirror` means remote with a validated local mirror
- `skip-discovery: true` — flag to skip Phase 1

### Optional Fields

- `hook` — how translations are accessed (e.g., `useTranslations("namespace")`)
- `remote-provider` — gcs, s3, crowdin, lokalise, phrase, etc.
- `local-mirror` — folder with the local copy of the remote files (e.g. `messages/features`). Keeps validation on for remote storage
- `remote-url` — base URL of the bucket/CDN, used by `remote-check.js --compare`
- `remote-path` — path pattern of a published file, e.g. `app/features/{module}/{locale}.json`
- `fallback-locale` — locale loaded when a module lacks the requested one (see [remote.md](remote.md))
- `key-casing` — camelCase, snake_case, kebab-case, PascalCase
- `namespace-pattern` — flat, nested, module.section.key
- `sub-components` — direct or prop-drilling
- `locales` — comma-separated list of active locales

### Benefits

- **Faster execution**: Skips ~2-3k tokens of discovery
- **No round-trips**: No user validation needed
- **Consistent**: Same conventions every session
- **Versionable**: File can be committed to git

### When to Use

- Project has been using i18n for weeks/months
- Conventions are well-established and unlikely to change
- You want maximum speed and minimum token usage

### When NOT to Use

- New project still establishing conventions
- Conventions change frequently
- You want the skill to auto-detect patterns

---

## Manual Override

If the auto-detection is incorrect or you want to enforce specific conventions, edit `.claude/polyglot-conventions.md` in your project root.

The skill will read this file and prioritize these conventions over detected ones.

### Template

```markdown
# Project i18n Conventions (Manual Override)

## Namespace Pattern
- Pattern: Module.Component.key
- Separator: dot (.)
- Depth: 3 levels
- Casing: PascalCase.camelCase

## Hook Usage
- Primary: Direct hook access
- Sub-components: Prop drilling (t passed as prop)

## Storage
- Type: Remote (GCS)
- Local files: No
- Workflow: Generate JSON → user uploads to bucket

## Sub-Component Pattern
- Rule: Sub-components receive t as prop
- Do NOT call useTranslations() in sub-components

## Schema Integration
- Library: Zod
- Pattern: Factory functions (createSchema(t))
- Example: `export const createOrgSchema = (t) => z.object({...})`

## Key Naming
- Casing: camelCase for leaf keys
- Examples: `saveButton`, `emailPlaceholder`, `errorMessage`
```

---

## What Gets Detected

### 1. Namespace Pattern
Analyzes existing `useTranslations('namespace')` calls and `t('key.path')` usage to determine:
- Separator (dot, colon, slash, underscore)
- Depth (how many levels)
- Casing (camelCase, PascalCase, snake_case, etc.)

### 2. Hook Usage
Checks how components access translations:
- Direct: Component calls `useTranslations()` directly
- Prop drilling: Component receives `t` as a prop

### 3. Storage Type
Detects where translation files live:
- Local: JSON/YAML files in `locales/`, `messages/`, etc.
- Remote: GCS, S3, Crowdin, Lokalise, Phrase, etc.

### 4. Sub-Component Pattern
Analyzes how sub-components handle translations:
- Prop drilling: Parent passes `t` to children
- Direct: Each component calls the hook independently

### 5. Schema Integration
Detects if schemas (Zod, Yup) use i18n:
- Factory functions: `createSchema(t)`
- Inline: Schema calls `t()` directly

### 6. Key Naming Casing
Analyzes leaf keys in translation files to determine casing convention.

---

## Confidence Levels

| Level | Meaning | Action |
|-------|---------|--------|
| **High** | 80%+ of files match pattern | Safe to use automatically |
| **Medium** | 60-79% match | Review before using |
| **Low** | <60% match or insufficient data | Ask user for clarification |

**Note**: Without a conventions file, the skill asks for validation before applying detected conventions, regardless of confidence level. A conventions file counts as confirmed conventions: no question, no `/i18n-analyzer`.

---

## Integration with Polyglot Skill

The Polyglot skill uses these conventions in:

1. **Create mode**: Applies namespace pattern and key naming to new translation files
2. **Migrate mode**: Follows existing conventions when creating new keys
3. **Refactor mode**: Respects sub-component patterns when renaming namespaces

### Workflow

```
1. User runs: /polyglot migrate src/components/Settings.tsx
2. Skill runs: detect-conventions.js
3. Skill presents: Detected conventions + asks for validation (skipped when .claude/polyglot-conventions.md exists)
4. User confirms: Y / n / edit — and saves the conventions file
5. Skill applies: Validated conventions to migration
```

---

## Examples by Project Type

### Next.js + next-intl + GCS Remote

```json
{
  "namespace": { "pattern": "Module.Component.key", "separator": "dot", "depth": 3 },
  "hookUsage": { "primary": "direct", "subComponents": "prop-drilling" },
  "storage": { "type": "remote", "provider": "gcs", "localFiles": false },
  "schemas": { "detected": true, "library": "zod", "pattern": "factory-function" }
}
```

### React + react-i18next + Local JSON

```json
{
  "namespace": { "pattern": "flat", "separator": "dot", "depth": 2 },
  "hookUsage": { "primary": "direct", "subComponents": "direct" },
  "storage": { "type": "local", "localFiles": true },
  "schemas": { "detected": false }
}
```

### Vue + vue-i18n + Local YAML

```json
{
  "namespace": { "pattern": "nested", "separator": "dot", "depth": 3 },
  "hookUsage": { "primary": "template-global", "subComponents": "template-global" },
  "storage": { "type": "local", "localFiles": true },
  "schemas": { "detected": false }
}
```
