---
name: i18n-migrator
description: >
  Migrates hardcoded UI strings into i18n translation calls (t(), useTranslations,
  $t, formatMessage) with minimal, surgical diffs. Use when the user asks to add
  i18n, internationalize, localize, or migrate/extract hardcoded strings or text in
  a component or file — across next-intl, react-i18next, vue-i18n, react-intl,
  i18next, angular, svelte, or lingui. Does NOT set up i18n from scratch or refactor
  existing i18n code.
when_to_use: >
  "add i18n", "migrate strings", "hardcoded text", "translate", "localize",
  "i18n this component", "add translation keys"
argument-hint: "[target] [reference]"
arguments:
  - target
  - reference
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash(node *)
paths:
  - "**/*.{tsx,jsx,vue,svelte,ts,js}"
  - "**/locales/**"
  - "**/messages/**"
  - "**/i18n/**"
hooks:
  PostToolUse:
    - matcher: "Edit|Write|MultiEdit"
      hooks:
        - type: command
          command: "node ${CLAUDE_SKILL_DIR}/scripts/validate-keys.js"
---

# i18n Migrator

Surgical i18n migration. Make the minimum correct change. Consistency > optimization.

## Project Context

```!
echo "=== i18n Detection ==="
echo "Library:"
grep -rE "useTranslation|useTranslations|useIntl|\$t\(|formatMessage" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --include="*.vue" --include="*.svelte" -l 2>/dev/null | head -3 || echo "  Not found"
echo "Files:"
find locales messages i18n -name "*.json" -o -name "*.yaml" 2>/dev/null | head -5 || echo "  Not found"
```

## Arguments

- **$target**: File(s) to migrate
- **$reference**: Already-migrated file to follow as pattern

If not provided, ask the user.

## Scope Rules

- Do not modify files outside scope
- Do not create new architecture
- Do not refactor or modernize
- Do not alter business logic
- Do not touch unrelated lines

## Workflow

### Phase 1: Discover

Detect stack → see [discovery.md](discovery.md)

If detection fails or confidence is Low, invoke `/i18n-analyzer` automatically.

### Phase 2: Analyze

Read reference (if provided) + target + translation files.

Extract: hook pattern, key convention, existing keys, reusable keys.

### Phase 3: Identify

Find hardcoded strings: labels, placeholders, errors, aria-labels, tooltips, buttons.

Exclude: constants, logs, identifiers, CSS, data attributes.

### Phase 4: Migrate

Follow [patterns.md](patterns.md):
- Interpolation (never concatenate)
- Pluralization (delegate to library)
- Formatting (use library utilities)
- Rich text (use Trans or equivalent)

Make smallest change: replace strings, add hook/import if absent, preserve formatting.

### Phase 5: Update Translations

- **Local**: Update files directly
- **Remote**: Output keys for user to add

### Phase 6: Validate

Validation runs automatically via hook. If it fails:
1. Report errors to user
2. Fix any missing keys in translation files
3. Re-run validation before completing

### Phase 7: Respond

```
Files changed:
- path/to/file.tsx

Changes:
- migrated N strings to t() calls
- reused: [key.one, key.two]
- added: [key.three]
- namespace: <ns>

New keys (if remote):
  key.three: "Text" (en)
  key.three: "Texto" (pt-br)

Validation: ✓ passed / ✗ failed (errors fixed)

Notes:
- <decisions only>
```

## Key Strategy

1. Check reference for equivalent keys
2. Check target (may be partially migrated)
3. Reuse when semantically equivalent

**Good**: `profile.header.title`, `profile:header.title`, `profile_header_title`
**Bad**: `title`, `headerText`, `page.content.section.label.text`

## Large Files (20+ strings)

Propose batching by section. Ask for scope. Process one batch at a time.

## Error Handling

| Scenario | Action |
|----------|--------|
| Detection fails | Auto-invoke `/i18n-analyzer` |
| Pattern unclear | Ask before proceeding |
| Validation fails | Fix errors, re-validate |
| Reference not provided | Detect from project files |
| Translation files missing | Ask user for storage method |

## Resources

- [discovery.md](discovery.md) — Stack detection with confidence levels
- [patterns.md](patterns.md) — Interpolation, pluralization, formatting
- [examples.md](examples.md) — Quick reference patterns
