---
name: polyglot
version: 1.6.0 # x-release-please-version
description: >
  One skill for the entire i18n journey. Creates i18n from scratch, migrates
  hardcoded strings to translation calls, refactors existing i18n keys
  with impact analysis, AND translates content to multiple locales.
  Use when creating i18n, migrating strings, renaming keys/namespaces, or
  translating locale files across next-intl, react-i18next, vue-i18n,
  react-intl, i18next, angular, svelte, or lingui. Does NOT change
  component architecture or refactor non-i18n code.
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
  - Bash(python *)
paths:
  - "**/*.{tsx,jsx,vue,svelte,ts,js}"
  - "**/locales/**"
  - "**/messages/**"
  - "**/i18n/**"
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_SKILL_DIR:-.claude/skills/polyglot}/scripts/validate-keys.js --hook"
---

# Polyglot

One skill for the entire i18n journey. Four modes:

- **Create** — create i18n from scratch when your project has none
- **Migrate** — surgically migrate hardcoded strings when i18n exists
- **Refactor** — rename keys/namespaces safely with impact analysis
- **Translate** — generate translations for all locales from a source file

## Project Context

```!
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --quick
```

## Arguments

- **$mode**: `create`, `migrate`, `refactor`, or `translate`. Auto-detected if omitted.
- **$target**: File(s) to process (migrate/refactor mode)

## Routing

1. Run discovery → [discovery.md](discovery.md)
2. No i18n → **Create**
3. i18n exists + user wants migrate → **Migrate**
4. i18n exists + user wants rename/refactor → **Refactor**
5. i18n exists + user wants translations → **Translate**
6. User wants to move translations to a bucket/CDN, or storage is `remote-mirror` → follow [remote.md](remote.md) alongside the mode
7. User passed explicit mode → follow it

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
- A new key carries the **original text**, exactly; text fixes are a separate, approved decision
- Exception: a schema may become a `createXSchema(t)` factory when a message that reaches the screen must be translated ([migrate.md](migrate.md#rule-2-schema-factories-are-allowed))
- Copied/vendored files: check where a file came from **before** proposing a change; editing a copy is a divergence the user decides

### Refactor
- **Impact analysis is mandatory** before any change
- **Explicit confirmation** required at each phase (analyze → preview → apply → validate)
- Only rename keys/namespaces — do not change component logic
- Report all cross-module dependencies

### Translate
- Claude translates directly in the translation files; `translate.py` is optional (only when the user asks for a machine-translation backend)
- Only values change: never rename, add or remove keys
- Always preserve `{interpolation}` variables and ICU syntax from source
- Fixing an existing translation is a proposal; apply after approval

## Workflow

### Phase 1: Discover

Load this skill at the start of every target (each module, page or batch), not only the first one: the checklists below are what catch the strings a quick scan misses.

**Step 1: Check for conventions file**
- The Project Context above reports it (`conventions`). The file is `.claude/polyglot-conventions.md`.
- If it exists, its conventions are **already confirmed**:
  - Load them; they override anything detected
  - Do **not** ask for confirmation and do **not** invoke `/i18n-analyzer`
  - With `skip-discovery: true`, skip Steps 2-4 and go to Phase 2
  - Without it, run Step 3 on the target only, to read its local patterns
- If it does not exist, proceed to Step 2

**Step 2: Fast Scan**
- The Project Context above already ran `detect-conventions.js --quick`: library, locales, layouts, storage (~200 tokens)

**Step 3: Convention Detection**
- Run `node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --target "<target>"`
- **Quote the target**: App Router paths (`src/app/[locale]/(group)/page`) lose their segments otherwise. If the argument reached you mangled (e.g. `/vehicle`), the script still resolves it by suffix and warns.
- The target's files are sampled first (including column/schema factories that receive a translator), then the sample is filled from across the project
- Reports: namespace depth with root and leaf casing, hook usage (call the hook / receive a translator / pass one along), schemas (`createXSchema(t)` factories and schemas with fixed messages to review), storage

**Step 4: Present to User** (only without a conventions file)
- Show detected conventions and ask: "Do these conventions match your project? [Y/n/edit]"
- Offer to save `.claude/polyglot-conventions.md` so future runs skip this step

Low confidence and no conventions file → invoke `/i18n-analyzer`. If you already gathered the context in this session, present it instead of re-running the analysis.

**Storage types** (from detection or the conventions file):
- `local` — translation files live in the repo; edit them
- `remote` — fetched at runtime (bucket, TMS); output keys/JSON for the user to upload
- `remote-mirror` — remote, plus local files in the repo that mirror what is published (fallback or files prepared for upload). Edit and **validate the local mirror**; the user publishes

### Phase 2: Route

- **No i18n?** → Create
- **Migrate strings?** → Migrate
- **Rename keys/namespaces?** → Refactor
- **Generate translations?** → Translate

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

### Phase 3D: Translate

1. Detect the source locale (the most complete one) and the files; ask for target locales if not specified
2. List what is pending:
   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/pending-report.js --source <locale> [--module <m>] [--same "ID,Total"]
   ```
   Missing, empty, or still identical to the source. Texts that are genuinely the same in both languages go in `--same`
3. **Translate** the pending values in each target file:
   - keep `{variables}`, `#` and the plural/select structure; translate only the text inside options
   - check plural categories per target locale (`=0` where needed, see [patterns.md](patterns.md#pluralization))
   - do not translate brand/product names or native language names
   - follow the terms already used in the same file and in the project's other modules (glossary); reuse an existing translation of the same source text
   - short interface tone
4. **Review existing translations** in the same files while there — report, do not silently change:
   - wrong term (e.g. "Seriousness" for severity), text still in another language, typos, inconsistent terms across modules, capitalization out of the file's style
   - propose each fix with key, current and suggested text; apply what the user approves
5. **Validate**: `validate-keys.js --namespace <NS>` (same keys, same ICU arguments in every locale) and `pending-report.js` again; when the project has an ICU parser (`intl-messageformat`), parse every changed message
6. Remote storage: list the files to publish (`remote-check.js --since <ref>`)

**Optional — machine translation backend**: if the user asks for bulk machine translation, `python ${CLAUDE_SKILL_DIR}/scripts/translate.py --source <locale> --targets <locales> --dir <dir> --draft --validate` (Google/DeepL/ChatGPT). Review its output with steps 4–5.

### Phase 4: Identify (Migrate only)

Walk the full checklist in [migrate.md](migrate.md#phase-4-identify) on the target **and on the shared components it imports**:

1. Hardcoded text: labels, placeholders (example dates included), errors, aria-labels, tooltips, buttons, toasts, fallbacks like `t("x") || "Text"`
2. Where each file came from (copy of another project or UI library?) — before proposing anything
3. Components with label props: does the consumer pass every label?
4. Validation messages: library defaults leaking in its language, fixed messages, and which ones reach the screen
5. Numbers, dates, currency: `toFixed`, `String(n)`, fixed-locale `toLocale*`/`Intl`
6. Date input fields: mask, parsing and placeholder in the locale's order
7. Locale codes passed to libraries (`pt-br` vs `pt-BR`)
8. Shared components imported by the target

Exclude: constants, logs, identifiers, CSS, data attributes, API field names, brand names.
Present findings with a proposed decision each; apply after approval.

### Phase 5: Apply Patterns (Migrate only)

Follow [patterns.md](patterns.md): interpolation, pluralization, formatting, rich text, date inputs.
Smallest change only: replace strings, add hook/import if absent. Rules in [migrate.md](migrate.md#phase-5-rules): original text in the new key, schema factories only for messages that reach the screen, update tests that mock the i18n library.

### Phase 6: Update Translations (All modes except Create)

- **New keys go to every locale**: the source text in the source locale and, until translated, the same source text in the other locales (the catalog stays complete; nothing breaks at runtime)
- Then either translate now (Phase 3D, if the user wants) or hand over the pending list: `pending-report.js --source <locale> --output <file>` writes a Markdown report with instructions that someone else can translate from
- Tests that mock the i18n library with labels: add the new keys ([migrate.md](migrate.md#rule-4-tests-that-mock-the-i18n-library))
- **Local**: edit the translation files
- **Remote with local mirror** (`remote-mirror`): edit and validate the mirror files; the user publishes. List what to publish with `node ${CLAUDE_SKILL_DIR}/scripts/remote-check.js --since <ref>` (including keys moved between modules: publish both, the receiving one first), and after publishing compare with `--compare`. See [remote.md](remote.md)
- **Remote** (no mirror): output keys/JSON for the user to upload to the TMS or bucket

### Phase 7: Validate

The Stop hook runs `validate-keys.js --hook`: only files changed in git, errors only (missing keys in a locale, keys used in code but missing from the catalog). Fix errors → re-validate.

Before reporting, run the full check on the target's namespaces:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/validate-keys.js --namespace <Namespace>
```

- Reads every local layout (`messages/en.json`, `messages/en/*.json`, `messages/features/<module>/en.json`) and, for remote storage, the `local-mirror`
- Follows each translator variable, template keys (`t(`status.${s}`)`) and translators passed to column/schema factories
- **Orphans** are keys not found in code: list them, do not delete without the user's approval
- **Dynamic** namespaces (`t(variable)`, `t(MAP[id])`) are not orphans: check by hand which keys the variable can take
- A translator the script cannot resolve: `--param tColumns=Page.Table.Columns`

Also:
- **Tests are not validation**: screen tests often mock the i18n library with their own labels, so a missing key still passes them. The validator skips test files on purpose
- **Format only the files you changed**: pass the file list to the formatter (`biome format --write <files>`, `prettier --write <files>`), never a folder — it reformats files outside the task
- Run the project's type check and build when the task touched code (schemas, props)

### Phase 8: Respond

```
Mode: [create|migrate|refactor|translate]

Files changed:
- path/to/file.tsx

Changes:
- [create] created i18n config with [library]
- [migrate] migrated N strings
- [refactor] renamed X keys across Y files
- [translate] translated N keys to M locales; K existing translations flagged for review

Validation: ✓ passed / ✗ failed (see errors above)

Notes:
- <decisions only>
```

## Key Strategy (Migrate)

1. Check reference for equivalent keys
2. Check target (may be partially migrated)
3. Reuse when semantically equivalent
4. With a remote catalog, moving a key to another module (e.g. into `common`) means republishing both modules — say so and list them (`remote-check.js --since`)

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
| Translate: variables lost or ICU broken | Restore from source; re-run `validate-keys.js` |
| Translate: text identical to source | Translate, or add to `--same` if genuinely the same |
| translate.py (optional): Python or API key missing | Guide setup (`uv run`, or `pip install -r scripts/requirements.txt`), or translate directly instead |

## Optional: Machine Translation Tool

`scripts/translate.py` translates whole files through Google (free), DeepL or ChatGPT, preserving `{variables}`. It is not part of the default flow: use it only when the user asks for bulk machine translation, with `--draft`, and review the result as in Phase 3D steps 4–5. Setup and options: `uv run ${CLAUDE_SKILL_DIR}/scripts/translate.py --help`, or [README.md](README.md#translation-tool).

## Resources

- [discovery.md](discovery.md) — Detection + routing
- [conventions.md](conventions.md) — Auto-detection + manual override
- [create.md](create.md) — Scaffolding per library
- [migrate.md](migrate.md) — Migrate checklist (Phase 4) and rules (Phase 5)
- [refactor.md](refactor.md) — Safe refactoring with impact analysis
- [remote.md](remote.md) — Remote catalog (bucket/CDN) with a local mirror, moving from local, publishing
- [scripts/remote-check.js](scripts/remote-check.js) — What to republish; remote vs mirror comparison
- [patterns.md](patterns.md) — Interpolation, pluralization, Good/Bad
- [examples.md](examples.md) — Before/after for every library
- [agents/i18n-analyzer.md](agents/i18n-analyzer.md) — Deep analysis subagent
- [scripts/pending-report.js](scripts/pending-report.js) — Pending translations report
- [scripts/translate.py](scripts/translate.py) — Optional machine translation (multi-backend)
- [scripts/validate-keys.js](scripts/validate-keys.js) — Key validation
- [scripts/detect-conventions.js](scripts/detect-conventions.js) — Convention detection
