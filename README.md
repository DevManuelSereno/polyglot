# Polyglot

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

It auto-detects your project's state and routes to the right workflow. No manual configuration needed.

## Install

```bash
git clone https://github.com/DevManuelSereno/Polyglot.git
cp -r Polyglot ~/.claude/skills/polyglot
```

Works with Claude Code, opencode, and any Agent Skills-compatible tool. Optimized for Claude, GPT-4, Kimi, Qwen, Llama, and other major LLMs.

## Use

```bash
# Auto-detect (recommended)
/polyglot

# Force a mode
/polyglot create
/polyglot migrate src/Settings.tsx src/Profile.tsx
/polyglot refactor bloqueio block
```

Or just ask naturally: *"Add i18n to my app"*, *"Migrate strings in Settings.tsx"*, or *"Rename bloqueio namespace to block"*

## What it does

### Create mode (no i18n yet)
- Recommends library based on your framework
- Installs dependencies
- Creates config, translation files, provider
- Adds example component

### Migrate mode (i18n exists)
- Finds hardcoded strings (labels, placeholders, aria-labels, tooltips, buttons)
- Replaces with `t()` calls following existing patterns
- Updates translation files or outputs keys for remote storage
- Validates automatically

### Refactor mode (rename keys/namespaces)
- Analyzes impact across entire codebase
- Shows blast radius and cross-module dependencies
- Requires explicit confirmation before applying
- Renames keys/namespaces safely
- Validates for orphaned references

### Convention Detection (NEW)
- Auto-detects namespace patterns, hook usage, sub-component patterns
- Detects schema integration (Zod factory functions)
- Detects storage type (local vs remote)
- ALWAYS asks for user validation before applying
- Supports manual overrides via `.claude/polyglot-conventions.md`

## What it does NOT do

- Translate your content (use Lokalise, Crowdin, DeepL)
- Change component architecture or business logic
- Modify files outside the requested scope
- Set up translation management workflows
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
2. **Detect Conventions** — analyzes 10 files to extract namespace patterns, hook usage, sub-component patterns, schema integration
3. **Validate** — presents detected conventions to user, asks for confirmation
4. **Route** — no i18n? → Create. Migrate strings? → Migrate. Rename keys? → Refactor.
5. **Execute** — follows the appropriate workflow (create/migrate/refactor)
6. **Validate** — auto-runs validation at end of turn (checks missing keys, orphaned references, variable consistency)
7. **Respond** — structured summary with files changed, keys added/renamed, validation status

## Before/after examples

See [examples.md](examples.md) for concrete patterns across all libraries.

## Project structure

```
polyglot/
├── SKILL.md              # Core routing + workflow (193 lines)
── discovery.md          # 3-level detection (fast scan → conventions → overrides)
├── conventions.md        # Auto-detection + manual override documentation
├── create.md             # Opinionated scaffolding per library
├── refactor.md           # Safe refactoring with impact analysis
├── patterns.md           # Interpolation, pluralization, sub-components, Zod schemas
├── examples.md           # Before/after for every library
├── agents/
│   ── i18n-analyzer.md  # Deep analysis subagent
├── scripts/
│   ├── validate-keys.js  # Auto-validates translation files
│   └── detect-conventions.js  # Auto-detects project conventions
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
- Complex routing logic with 3 modes
- Detailed impact analysis for refactor mode

**Efficient Models** (Qwen, Llama, Mistral):
- Concise SKILL.md (193 lines) for minimal context usage
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

**Dynamic Context**: The `` !`command` `` syntax for auto-detection works in Claude Code and OpenAI Codex. For other LLMs, the skill will still work but may require manual context about your i18n setup.

**Variable Fallback**: The skill uses `${CLAUDE_SKILL_DIR:-.claude/skills/polyglot}` to support agents that don't define `CLAUDE_SKILL_DIR`.

### Why It Works Across Models

1. **Clear structure** — Phase-based workflow is model-agnostic
2. **Explicit rules** — No ambiguity in scope or behavior
3. **Confidence reporting** — Prevents hallucination on any model
4. **Validation script** — Deterministic checks don't depend on LLM quality
5. **Examples** — Concrete before/after patterns work universally
6. **Convention detection** — Adapts to project-specific patterns automatically

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

**Large files (20+ strings)** — Proposes batching by section, asks for scope confirmation.

## Recent Updates

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

### v1.2.0 — Refactor Mode (June 2026)
- **NEW**: Refactor mode for safe key/namespace renaming
- 4-phase workflow: Impact Analysis → Preview → Apply → Validate
- Risk levels (Low/Medium/High) with appropriate warnings
- Orphaned reference detection in `validate-keys.js`

### v1.1.0 — Create Mode (June 2026)
- **NEW**: Create mode for setting up i18n from scratch
- Library recommendation per framework
- ESM + CommonJS examples for react-i18next and vue-i18n
- Opinionated defaults with user override support

### v1.0.0 — Initial Release (June 2026)
- Migrate mode for surgical string migration
- 8+ library support (next-intl, react-i18next, vue-i18n, etc.)
- Auto-validation via Stop hook
- Confidence-based detection

---

## Contributing

Fork → branch → change → PR. Areas that need help:
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
