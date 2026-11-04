# polyglot

> One skill for the entire i18n journey — from zero to fully localized.

**Before:**
```tsx
// src/components/Settings.tsx — 47 hardcoded strings, 0 i18n
export default function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      <p>Configure your preferences</p>
      <label>Language</label>
      <button>Save changes</button>
    </div>
  );
}
```

**After `/polyglot`:**
```tsx
// src/components/Settings.tsx — 0 hardcoded strings, fully localized
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const t = useTranslations('settings');
  return (
    <div>
      <h1>{t('header.title')}</h1>
      <p>{t('header.subtitle')}</p>
      <label>{t('form.languageLabel')}</label>
      <button>{t('form.saveButton')}</button>
    </div>
  );
}
```

**Diff: 4 lines changed. Zero architecture touched. Zero refactors.**

---

Polyglot is a Claude Code / opencode skill that handles the full i18n lifecycle:

- **No i18n yet?** → Creates it from scratch (library, config, provider, translation files)
- **i18n exists?** → Surgically migrates hardcoded strings with minimal diffs
- **Need to rename keys?** → Safely refactors with impact analysis and validation
- **Need translations?** → Translates pending keys in every locale and reviews existing translations
- **Translations in a bucket/CDN?** → Validates the local mirror, lists what to publish, compares the remote with it

It auto-detects your project's state and routes to the right workflow. No manual configuration needed.

## Install

```bash
git clone https://github.com/DevManuelSereno/polyglot.git
cp -r polyglot ~/.claude/skills/polyglot
```

Works with Claude Code, opencode, and any Agent Skills-compatible tool. Optimized for Claude, GPT-4, Kimi, Qwen, Llama, and other major LLMs.

### Installation Paths

The skill works in both installation scenarios:

| Installation | Path | Use Case |
|-------------|------|----------|
| **Global** | `~/.claude/skills/polyglot/` | Available in all your projects |
| **Project** | `.claude/skills/polyglot/` | Specific to one project |

The skill uses `${CLAUDE_SKILL_DIR}` internally, which automatically resolves to the correct path regardless of installation location. No configuration needed.

## Use

```bash
# Auto-detect (recommended)
/polyglot

# Force a mode
/polyglot create
/polyglot migrate src/Settings.tsx src/Profile.tsx
/polyglot migrate "src/app/[locale]/(dashboard)/orders"   # quote App Router paths
/polyglot refactor bloqueio block
/polyglot translate pt-br → en-us, es-es
```

Or just ask naturally: *"Add i18n to my app"*, *"Migrate strings in Settings.tsx"*, *"Rename bloqueio namespace to block"*, or *"Translate my locale files to English and Spanish"*

## What it does

### Create mode (no i18n yet)
- Recommends library based on your framework
- Installs dependencies
- Creates config, translation files, provider
- Adds example component

### Migrate mode (i18n exists)
- Walks an 8-point checklist on the target and the shared components it imports: hardcoded text, where each file came from (copies of other projects), labels passed by prop, validation messages, numbers and dates, date inputs, locale codes passed to libraries ([migrate.md](migrate.md))
- Replaces with `t()` calls following existing patterns; new keys carry the original text
- Turns schemas into `createXSchema(t)` factories only for messages that reach the screen
- Updates translation files (or the local mirror of a remote catalog) and tests that mock the i18n library
- Validates automatically

### Refactor mode (rename keys/namespaces)
- Analyzes impact across entire codebase
- Shows blast radius and cross-module dependencies
- Requires explicit confirmation before applying
- Renames keys/namespaces safely
- Validates for orphaned references

### Translate mode (generate translations)
- Lists pending translations (missing, empty, still identical to the source) with `pending-report.js`, as a Markdown report someone can also translate from
- Claude translates in the files: only values change; `{variables}`, ICU plurals (including `=0` where a locale needs it) and brand names are preserved
- Reviews existing translations in the same files and proposes fixes
- Validates with `validate-keys.js`
- Optional: bulk machine translation with `translate.py` (Google, DeepL, ChatGPT)

### Remote catalogs (bucket/CDN with a local mirror)
- One file per module and locale, namespace as the JSON root, fallback locale, tolerant catalog — guide in [remote.md](remote.md), example loader with next-intl wiring in [examples/remote-catalog/](examples/remote-catalog/)
- `remote-check.js --since <ref>`: what to republish, including keys moved between modules
- `remote-check.js --compare`: remote vs local mirror (missing files, different texts, invalid JSON)

### Convention Detection
- Samples the target first (App Router paths with `[locale]` and `(group)` included)
- Finds locales in `messages/en.json`, `messages/en/*.json` and `messages/features/<module>/en.json`
- Detects namespace depth and casing, translators passed to column/schema factories, `createXSchema(t)` factories and schemas with fixed messages
- Detects storage from the runtime loader: local, remote, or remote with a local mirror
- Asks for validation once; a `.claude/polyglot-conventions.md` counts as confirmed (no question, no subagent)

## What it does NOT do

- Change component architecture or business logic
- Modify files outside the requested scope
- Set up translation management workflows (TMS) or upload files to a bucket — the user publishes
- Refactor non-i18n code (only renames i18n keys/namespaces)

## Supported libraries

| Library | Framework |
|---------|-----------|
| next-intl | Next.js App Router |
| react-i18next | React |
| i18next | Universal |
| react-intl | React |
| vue-i18n | Vue |
| @angular/localize | Angular |
| svelte-i18n | Svelte |
| lingui | React/Universal |

## How it works

1. **Discover** — detects your i18n stack with confidence levels (High/Medium/Low)
2. **Detect Conventions** — samples the target, then the project, to extract namespace patterns, hook usage, translators passed along, schema integration, storage
3. **Validate** — presents detected conventions to user, asks for confirmation (skipped with a conventions file)
4. **Route** — no i18n? → Create. Migrate strings? → Migrate. Rename keys? → Refactor. Generate translations? → Translate.
5. **Execute** — follows the appropriate workflow (create/migrate/refactor/translate)
6. **Validate** — the Stop hook checks the files changed in git (missing keys, keys used but not defined); the full check also lists orphans and dynamic keys
7. **Respond** — structured summary with files changed, keys added/renamed/translated, validation status

## Before/after examples

See [examples.md](examples.md) for concrete patterns across all libraries.

## Project structure

```
polyglot/
├── SKILL.md                 # Core routing + workflow
├── discovery.md             # 3-level detection (fast scan → conventions → overrides)
├── conventions.md           # Auto-detection + manual override documentation
├── create.md                # Opinionated scaffolding per library
├── migrate.md               # Migrate checklist (Phase 4) and rules (Phase 5)
├── refactor.md              # Safe refactoring with impact analysis
├── remote.md                # Remote catalog with a local mirror, publishing
├── patterns.md              # Interpolation, plurals, formatting, date inputs, Zod schemas
├── examples.md              # Before/after for every library
├── agents/
│   └── i18n-analyzer.md     # Deep analysis subagent
├── scripts/
│   ├── package.json         # Node dependencies (js-yaml), Node ≥ 18
│   ├── validate-keys.js     # Validates translation files and key usage in code
│   ├── detect-conventions.js # Auto-detects project conventions
│   ├── remote-check.js      # What to republish; remote vs local mirror
│   ├── pending-report.js    # Pending translations report
│   ├── lib/i18n-project.js  # Shared helpers (layouts, locales, translators)
│   ├── test/                # Node tests + fixtures
│   ├── translate.py         # Optional machine translation (multi-backend)
│   ├── test_translate.py    # Tests for translate.py
│   ├── requirements.txt     # Python dependencies
│   ├── translate.bat        # Windows wrapper
│   └── translate.sh         # Unix wrapper
├── examples/
│   ├── conventions/         # Example convention files
│   │   ├── next-intl-gcs.md
│   │   ├── react-i18next-local.md
│   │   └── vue-i18n-crowdin.md
│   ├── remote-catalog/      # Remote catalog loader + next-intl wiring
│   └── date-input/          # Date input in the locale's order
├── README.md
└── LICENSE
```

## Error handling

| Scenario | Action |
|----------|--------|
| Detection fails | Auto-invokes `/i18n-analyzer` subagent |
| Pattern unclear | Asks before proceeding |
| Validation fails | Fixes errors, re-validates |
| Refactor impact too high | Warns user, suggests manual approach |
| No i18n + user wants migrate | Suggests create first |
| Translation files missing | Asks for storage method |
| Translate: variables lost or ICU broken | Restores from source, re-validates |
| translate.py (optional): Python or API key missing | Guides setup, or translates directly instead |

## Translation Tool

Optional. By default Claude translates in the files (Translate mode); this Python tool is for bulk machine translation when you ask for it. It supports multiple backends and preserves interpolation variables. Review its output like any translation.

### Setup (with uv - recommended)

```bash
# Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# Run the translation tool (uv handles Python + dependencies automatically)
uv run scripts/translate.py --source pt --targets en,es
```

### Setup (with pip)

```bash
pip install -r ~/.claude/skills/polyglot/scripts/requirements.txt
python ~/.claude/skills/polyglot/scripts/translate.py --source pt --targets en,es
```

### Usage

```bash
# Translate pt → en, es (Google, free, no API key needed)
# Windows:
scripts\translate.bat --source pt --targets en,es
# Unix/macOS:
./scripts/translate.sh --source pt --targets en,es

# Or directly with uv:
uv run scripts/translate.py --source pt --targets en,es

# Use DeepL (requires DEEPL_API_KEY)
uv run scripts/translate.py --source pt --targets en --backend deepl

# Use ChatGPT for context-aware translations (requires OPENAI_API_KEY)
uv run scripts/translate.py --source pt --targets en --backend chatgpt

# Mark as draft for review
uv run scripts/translate.py --source pt --targets en --draft

# Dry run (preview without writing)
uv run scripts/translate.py --source pt --targets en --dry-run

# Validate after translation
uv run scripts/translate.py --source pt --targets en --validate
```

### Backends

| Backend | Quality | Cost | API Key |
|---------|---------|------|---------|
| `google` | Good | Free | Not required |
| `deepl` | Excellent | Free tier (500k chars/mo) | `DEEPL_API_KEY` |
| `chatgpt` | Best (context-aware) | Paid | `OPENAI_API_KEY` |

## Confidence levels

Every detection reports confidence:
- **High** — imports + config + multiple examples found
- **Medium** — one signal or inferred from code
- **Low** — pattern guessed, needs confirmation

Low confidence → asks before proceeding. No bluffing.

## LLM Compatibility

### Optimized For
This skill is designed to work effectively across different LLM architectures:

**Large Context Models** (Claude, GPT-4, Kimi):
- Full progressive disclosure with multiple supporting files
- Complex routing logic with 4 modes
- Detailed impact analysis for refactor mode

**Efficient Models** (Qwen, Llama, Mistral):
- Concise SKILL.md (303 lines) with details in supporting files
- Clear phase-based workflow for step-by-step execution
- Structured output format for consistent responses

**All Models**:
- Deterministic validation via `validate-keys.js` (no hallucination risk)
- Explicit confidence levels to prevent overconfidence
- Error handling table for predictable fallbacks

### Model-Specific Notes

| Model | Strengths | Considerations |
|-------|-----------|----------------|
| **Claude** | Long context, nuanced instructions | Full feature support including hooks |
| **GPT-4** | Strong reasoning, tool use | Full feature support |
| **Kimi** | 200K+ context window | Excellent for large codebases; verify hook support |
| **Qwen** | Strong multilingual support | Ideal for i18n tasks; verify hook support |
| **Llama** | Open source, customizable | May need explicit instructions; hook support varies |
| **Mistral** | Fast inference | Good for quick migrations |

### LLM Compatibility Notes

**Hooks**: The `Stop` hook for automatic validation is fully supported in Claude Code. For other LLMs:
- If hooks are supported: Validation runs automatically
- If hooks are NOT supported: Run validation manually with:
  ```bash
  node ~/.claude/skills/polyglot/scripts/validate-keys.js
  ```
  The hook runs it with `--hook` (changed files only, errors only, exit 2 to block).

**Dynamic Context**: The `` !`command` `` syntax for auto-detection works in Claude Code and OpenAI Codex. For other LLMs, the skill will still work but may require manual context about your i18n setup.

**Variable Fallback**: The skill uses `${CLAUDE_SKILL_DIR:-.claude/skills/polyglot}` to support agents that don't define `CLAUDE_SKILL_DIR`.

### Why It Works Across Models

1. **Clear structure** — Phase-based workflow is model-agnostic
2. **Explicit rules** — No ambiguity in scope or behavior
3. **Confidence reporting** — Prevents hallucination on any model
4. **Validation script** — Deterministic checks don't depend on LLM quality
5. **Examples** — Concrete before/after patterns work universally
6. **Convention detection** — Adapts to project-specific patterns automatically

## Performance

| Operation | Time | Tokens |
|-----------|------|--------|
| Quick detection (cached) | ~0ms | ~0 |
| Quick detection (first run) | ~100ms | ~200 |
| Deep detection | ~1s | ~2k |
| Migrate (10 strings) | ~5s | ~3k |
| Refactor (low risk) | ~10s | ~5k |
| Create (full setup) | ~30s | ~8k |
| Translate (10 keys, 3 locales) | ~15s | ~4k |

**With `skip-discovery: true`**: Phase 1 is skipped entirely, saving ~2-3k tokens and ~1-2s per session.

## Supported Agents & Tools

Built on the [Agent Skills](https://agentskills.io) open standard:

**Major Agents**: Claude Code, OpenAI Codex, Gemini CLI, GitHub Copilot, Cursor, VS Code

**Emerging LLMs**: Kimi, Qwen, Llama, Mistral, DeepSeek, Yi

**Other Tools**: opencode, Junie, OpenHands, Roo Code, Amp, TRAE, Kiro, and 30+ more — see [Client Showcase](https://agentskills.io/clients)

No tool-specific dependencies. The validation script is plain Node.js.

## Troubleshooting

**"No translation files found"** — Tell the skill where they are: *"Translation files are in src/i18n/locales/"*

**"Cannot detect i18n library"** — Run `/i18n-analyzer` or tell the skill: *"We use react-i18next with JSON files in locales/"*

**Validation fails** — The skill auto-fixes missing keys. If it can't, it reports exactly which keys are missing in which files.

**Keys reported as orphans but used** — Usage through a variable (`t(MAP[id])`) is listed as dynamic, not orphan. A translator the script cannot follow: `validate-keys.js --param tColumns=Page.Table.Columns`.

**Remote storage and nothing validated** — Set `local-mirror` in `.claude/polyglot-conventions.md` to validate the files you prepare for upload.

**Large files (20+ strings)** — Proposes batching by section, asks for scope confirmation.

## Recent Updates

Full history in [CHANGELOG.md](CHANGELOG.md) and [Releases](https://github.com/DevManuelSereno/polyglot/releases).

### v1.6.0 — Field-tested (November 2026)
Lessons from migrating a real Next.js app, module by module, to a bucket-hosted catalog.
- **Detection**: `--target` (App Router paths, mangled ones resolved by suffix), locales in locale folders and module folders, storage from the runtime loader (`remote-mirror`), namespace depth and casing, translators passed to factories, `createXSchema(t)` and fixed messages
- **Validation** rewritten: every layout, follows translator variables, template keys, translators passed across files, dynamic keys; ICU arguments by name; `--namespace`, `--param`, `--changed`; Stop hook only blocks on errors in changed files
- **Remote catalogs**: `remote.md`, an example loader, `remote-check.js` (republish list, moved keys, remote vs mirror)
- **Migrate**: `migrate.md` checklist and rules — file origin, labels by prop, validation messages that reach the screen, `toFixed`/fixed locales, date inputs, library locale codes, shared components; new keys keep the original text
- **Patterns**: `useFormatter` time-zone prerequisite, zero in ICU plurals per locale, date inputs, explicit locale import maps
- **Translate**: Claude translates by default; `pending-report.js`; review of existing translations; `translate.py` optional
- Conventions file counts as confirmed: no confirmation round-trip, no subagent
- Node tests with fixtures in CI; Node ≥ 18

### v1.5.0 — Translation Tool (June 2026)
- **NEW**: Python translation tool (`scripts/translate.py`) for generating locale translations
- Multi-backend support: Google (free), DeepL (API key), ChatGPT (API key)
- Automatic `{variable}` preservation across translations
- Batch translation for performance with large files
- Draft marking for review workflows
- Dry-run mode for previewing changes
- Auto-validation integration with `validate-keys.js`
- New `translate` mode in skill routing
- Comprehensive test suite (`scripts/test_translate.py`)

### v1.4.0 — Convention Detection (June 2026)
- **NEW**: Auto-detect project i18n conventions (`detect-conventions.js`)
- Detects 6 critical patterns: namespace, hook usage, sub-components, storage, schemas, key naming
- 3-level detection: Fast Scan → Convention Detection → User Overrides
- ALWAYS asks user for validation before applying detected conventions
- Windows/macOS/Linux compatible (pure Node.js, no external dependencies)
- Manual override support via `.claude/polyglot-conventions.md`
- Added sub-component translation patterns (prop drilling, context)
- Added Zod schema i18n patterns (factory functions)

### v1.3.0 — LLM Compatibility (June 2026)
- Added compatibility with Kimi, Qwen, Llama, Mistral, DeepSeek, Yi
- Model-specific optimization notes
- Fallback for `${CLAUDE_SKILL_DIR}` variable
- Hook support documentation per LLM

---

## Contributing

Fork → branch → change → PR. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…): releases, the version and `CHANGELOG.md` are generated from them by [release-please](https://github.com/googleapis/release-please). Areas that need help:
- More library examples (Solid, Qwik, Astro)
- Additional validation rules
- README translations
- Real-world usage feedback

## License

MIT

## Author

Built by [Manuel Sereno](https://manuelsereno.vercel.app)

- **Website**: [manuelsereno.vercel.app](https://manuelsereno.vercel.app)
- **GitHub**: [DevManuelSereno](https://github.com/DevManuelSereno)
- **Buy me a coffee**: [buymeacoffee.com/nelsereno](https://buymeacoffee.com/nelsereno)
