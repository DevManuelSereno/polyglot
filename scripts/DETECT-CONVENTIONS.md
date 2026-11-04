# detect-conventions.js

CLI tool for auto-detecting i18n conventions in your project.

## Usage

```bash
# Quick mode: Fast stack detection (~200 tokens, ~100ms)
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --quick

# Deep mode: Full convention analysis (~2k tokens, ~1s)
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js

# Deep mode with verbose markdown output
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --verbose

# Sample a target first (quote App Router paths: [locale] and (group) are literal)
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --target "src/app/[locale]/(dashboard)/orders"

# Analyze at least 20 files instead of 10
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --files 20

# Save output to file
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js --output .claude/.polyglot-conventions.json
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--quick` | Fast stack detection only | false |
| `--target <path>` | File or folder sampled first (also accepted as a bare argument). A mangled path such as `/orders` is resolved by suffix, preferring routes with `[dynamic]`/`(group)` segments | - |
| `--files <count>` | Minimum number of files to analyze | 10 |
| `--verbose` | Output human-readable markdown | JSON |
| `--output <file>` | Save output to file | stdout |
| `--help` | Show help message | - |

## Detection Modes

### Quick Mode

Runs automatically when the skill loads. Detects:
- i18n library in use (source patterns + `package.json`)
- Translation files, their layout and locales:
  - `flat` — `messages/en.json`
  - `locale-dir` — `messages/en/common.json`
  - `module-dir` — `messages/features/<module>/en.json` (namespace as the JSON root)
- Storage type: `local`, `remote` or `remote-mirror` (see below)
- The conventions file (`.claude/polyglot-conventions.md`) and whether it skips discovery

Output: ~200 tokens

### Deep Mode

Runs during Phase 1, Step 3. Samples the target first — files that call the hook and files that receive a translator (column factories, schema factories) — then fills the sample with files spread across the project. Additionally detects:
- Namespace pattern: depth of the full key (`namespace + key`), root casing (e.g. PascalCase) and leaf casing (e.g. camelCase)
- Hook usage: files that call the hook, receive a translator (`tColumns: TFunction`) or pass one along
- Schema integration: `createXSchema(t)` factories, and Zod files with fixed messages (review them: migrate only messages that reach the screen)
- Key naming casing in translation files, and whether each file has the namespace as its root

### Storage detection

Only the files that load the catalog at runtime (`getRequestConfig`, i18next backends, `createI18n`…) and the local modules they import are inspected. An unused helper that fetches from a bucket does not make the project remote.

| Type | Meaning | Validation |
|------|---------|------------|
| `local` | Translation files bundled from the repo | Validate them |
| `remote` | Fetched at runtime; nothing local | Nothing local to validate |
| `remote-mirror` | Fetched at runtime, plus local files that mirror what is published | Validate the local mirror (`localMirror`) |

The conventions file overrides detection: `storage: remote` with `local-mirror: <dir>` means `remote-mirror`.

Output: ~2k tokens

## Installation Paths

The script works in both installation scenarios:

| Installation | Path | Variable |
|-------------|------|----------|
| **Global** (all projects) | `~/.claude/skills/polyglot/` | `${CLAUDE_SKILL_DIR}` → `~/.claude/skills/polyglot` |
| **Project** (single project) | `.claude/skills/polyglot/` | `${CLAUDE_SKILL_DIR}` → `.claude/skills/polyglot` |

The `${CLAUDE_SKILL_DIR}` variable is automatically resolved by Claude Code.

## Manual Execution

```bash
# Navigate to skill directory
cd ~/.claude/skills/polyglot  # or .claude/skills/polyglot for project-level

# Quick mode
node scripts/detect-conventions.js --quick

# Deep mode with verbose output
node scripts/detect-conventions.js --verbose

# Analyze 20 files
node scripts/detect-conventions.js --files 20
```

## Troubleshooting

### "No files with i18n usage found"
- Ensure your project has components that use i18n hooks
- Check if the script is running from the project root
- Try increasing the file count: `--files 20`

### "Only X files analyzed"
- Increase the sample size: `--files 20`
- The warning indicates low confidence in detection

### Path Issues

**Problem:** The script can't find `${CLAUDE_SKILL_DIR}`

**Solution 1:** Run via Claude Code (automatic)
```bash
/polyglot migrate src/components/Settings.tsx
```

**Solution 2:** Navigate to skill directory manually
```bash
# For global installation
cd ~/.claude/skills/polyglot
node scripts/detect-conventions.js

# For project installation
cd .claude/skills/polyglot
node scripts/detect-conventions.js
```

**Solution 3:** Set environment variable manually
```bash
export CLAUDE_SKILL_DIR=~/.claude/skills/polyglot
node ${CLAUDE_SKILL_DIR}/scripts/detect-conventions.js
```
