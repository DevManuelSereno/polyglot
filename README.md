# i18n Maintainer

> Surgical i18n migration with minimal diffs for production codebases.

A Claude Code / opencode skill that turns hardcoded strings into i18n calls — and nothing else.

## Features

- **Auto-detects** i18n library, storage, and conventions with confidence levels
- **Minimal diffs** — only touches what's needed
- **7-phase workflow** — structured, repeatable, predictable
- **Auto-validation** — hooks validate translation files automatically
- **Error handling** — clear fallbacks for every failure mode
- **8+ libraries** — next-intl, react-i18next, vue-i18n, react-intl, i18next, angular, svelte, lingui

## Installation

```bash
# Claude Code (personal)
cp -r i18n-skill ~/.claude/skills/i18n-maintainer

# Claude Code (project)
cp -r i18n-skill /path/to/project/.claude/skills/i18n-maintainer

# opencode
cp -r i18n-skill /path/to/project/.opencode/skills/i18n-maintainer
```

## Usage

```bash
# With arguments
/i18n-maintainer src/Settings.tsx src/Profile.tsx

# Auto-detect (Claude invokes automatically)
Add i18n to src/components/Settings.tsx

# Deep analysis
/i18n-analyzer
```

## Structure

```
i18n-maintainer/
├── SKILL.md              # Core instructions (134 lines)
├── discovery.md          # Stack detection with confidence levels
├── patterns.md           # Interpolation, pluralization, formatting
├── examples.md           # Quick reference patterns
├── agents/
│   └── i18n-analyzer.md  # Auto-invoked when detection fails
├── scripts/
│   └── validate-keys.js  # Validates translation files (auto-run via hook)
├── README.md
└── LICENSE
```

## Workflow (7 Phases)

1. **Discover** — detect stack with confidence levels
2. **Analyze** — read reference + target + translation files
3. **Identify** — find hardcoded strings
4. **Migrate** — apply patterns (interpolation, pluralization, etc.)
5. **Update** — modify translation files or output keys
6. **Validate** — auto-run via hook, fix errors
7. **Respond** — structured summary

## Error Handling

| Scenario | Action |
|----------|--------|
| Detection fails | Auto-invoke `/i18n-analyzer` |
| Pattern unclear | Ask before proceeding |
| Validation fails | Fix errors, re-validate |
| Reference missing | Detect from project files |
| Files missing | Ask user for storage method |

## What It Handles

- Simple strings (labels, buttons, titles)
- String interpolation (`"Hello, {name}"`)
- Pluralization (`"1 item"` / `"5 items"`)
- Date/number/currency formatting
- Rich text and inline components
- JSX contexts (children, attributes, aria-labels)
- Large modules (20+ strings — proposes batching)

## What It Does NOT Do

- Set up i18n from scratch
- Refactor existing i18n code
- Improve translations or wording
- Change component architecture
- Modify files outside scope

## Confidence Levels

Every detection reports confidence:

- **High** — found imports + config + multiple examples
- **Medium** — found one signal or inferred from code
- **Low** — guessed from patterns, needs confirmation

If any detection is Low confidence, the skill asks before proceeding.

## Contributing

Contributions welcome:
- Additional library examples (Solid, Qwik, etc.)
- More validation rules
- Translations of this README
- Feedback from real-world usage

## License

MIT
