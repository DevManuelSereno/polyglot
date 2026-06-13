---
name: polyglot
description: >
  One skill for the entire i18n journey. Creates i18n from scratch, migrates
  hardcoded strings to translation calls, OR refactors existing i18n keys
  with impact analysis. Use when creating i18n, migrating strings, or renaming
  keys/namespaces across next-intl, react-i18next, vue-i18n, react-intl,
  i18next, angular, svelte, or lingui. Does NOT translate content, change
  component architecture, or refactor non-i18n code.
when_to_use: >
  "add i18n", "create i18n", "setup i18n", "internationalize", "localize",
  "migrate strings", "hardcoded text", "translate", "i18n this component",
  "add translation keys", "configure i18n", "rename i18n keys", "refactor i18n",
  "change namespace", "rename namespace"
argument-hint: "[mode] [target]"
arguments:
  - mode
  - target
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(node *)
paths:
  - "**/*.{tsx,jsx,vue,svelte,ts,js}"
  - "**/locales/**"
  - "**/messages/**"
  - "**/i18n/**"
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_SKILL_DIR:-.claude/skills/polyglot}/scripts/validate-keys.js"
---

# Polyglot

One skill for the entire i18n journey. Three modes:

- **Create** — create i18n from scratch when your project has none
- **Migrate** — surgically migrate hardcoded strings when i18n exists
- **Refactor** — rename keys/namespaces safely with impact analysis

## Project Context

```!
echo "=== i18n Detection ==="
echo "Library:"
grep -rE "useTranslation|useTranslations|useIntl|\$t\(|formatMessage" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --include="*.vue" --include="*.svelte" -l 2>/dev/null | head -3 || echo "  Not found"
echo "Files:"
ls locales/*.json messages/*.json i18n/*.json 2>/dev/null | head -5 || echo "  Not found"
```

## Arguments

- **$mode**: `create`, `migrate`, or `refactor`. Auto-detected if omitted.
- **$target**: File(s) to process (migrate/refactor mode)

## Routing

1. Run discovery → [discovery.md](discovery.md)
2. No i18n → **Create**
3. i18n exists + user wants migrate → **Migrate**
4. i18n exists + user wants rename/refactor → **Refactor**
5. User passed explicit mode → follow it

## Scope Rules

### Create
- Create i18n architecture (providers, config, translation files)
- Follow framework conventions
- Minimal scaffolding — no over-engineering

### Migrate
- Do not modify files outside scope
- Do not create new architecture
- Do not refactor or modernize
- Do not alter business logic
- Do not touch unrelated lines

### Refactor
- **Impact analysis is mandatory** before any change
- **Explicit confirmation** required at each phase (analyze → preview → apply → validate)
- Only rename keys/namespaces — do not change component logic
- Report all cross-module dependencies

## Workflow

### Phase 1: Discover

Detect stack → [discovery.md](discovery.md). Low confidence → invoke `/i18n-analyzer`.

### Phase 2: Route

- **No i18n?** → Create
- **Migrate strings?** → Migrate
- **Rename keys/namespaces?** → Refactor

### Phase 3A: Create

Follow [create.md](create.md):
1. Recommend library based on framework
2. Install dependencies
3. Create config + translation files
4. Add provider to app root
5. Create example component

### Phase 3B: Migrate

Read reference + target + translation files. Extract: hook pattern, key convention, reusable keys.

### Phase 3C: Refactor

Follow [refactor.md](refactor.md):
1. **Impact Analysis** — find all usages, cross-module dependencies, blast radius
2. **Preview** — show exact diff, list all files to change
3. **Apply** — rename in all components + translation files
4. **Validate** — check for orphaned references, run validation

### Phase 4: Identify (Migrate only)

Find: labels, placeholders, errors, aria-labels, tooltips, buttons.
Exclude: constants, logs, identifiers, CSS, data attributes.

### Phase 5: Apply Patterns (Migrate only)

Follow [patterns.md](patterns.md): interpolation, pluralization, formatting, rich text.
Smallest change only: replace strings, add hook/import if absent.

### Phase 6: Update Translations

- **Local**: Update files directly
- **Remote**: Output keys for user

### Phase 7: Validate

Auto-runs via Stop hook. Fix errors → re-validate.

### Phase 8: Respond

```
Mode: [create|migrate|refactor]

Files changed:
- path/to/file.tsx

Changes:
- [create] created i18n config with [library]
- [migrate] migrated N strings
- [refactor] renamed X keys across Y files

Validation: ✓ passed / ✗ failed (see errors above)

Notes:
- <decisions only>
```

## Key Strategy (Migrate)

1. Check reference for equivalent keys
2. Check target (may be partially migrated)
3. Reuse when semantically equivalent

**Good**: `profile.header.title`, `profile:header.title`
**Bad**: `title`, `headerText`, `page.content.section.label.text`

## Large Files (20+ strings, Migrate mode only)

Batch by section. Ask scope. One batch at a time.

## Error Handling

| Scenario | Action |
|----------|--------|
| Detection fails | Auto-invoke `/i18n-analyzer` |
| Pattern unclear | Ask before proceeding |
| Validation fails | Fix, re-validate |
| Refactor impact too high | Abort, suggest manual approach |
| Create: user disagrees with library choice | Respect user's choice |
| Refactor: 0 usages found | Abort — target doesn't exist |

## Resources

- [discovery.md](discovery.md) — Detection + routing
- [create.md](create.md) — Scaffolding per library
- [refactor.md](refactor.md) — Safe refactoring with impact analysis
- [patterns.md](patterns.md) — Interpolation, pluralization, Bom/Ruim
- [examples.md](examples.md) — Before/after for every library
- [agents/i18n-analyzer.md](agents/i18n-analyzer.md) — Deep analysis subagent
