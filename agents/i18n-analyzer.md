---
name: i18n-analyzer
description: Deep analysis of i18n patterns in a codebase. Auto-invoked when detection fails.
context: fork
agent: Explore
allowed-tools: Read Grep Glob Bash(node *)
---

Analyze the i18n setup in this project. Report findings with confidence levels.

## Analysis Steps

1. **Detect i18n library**
   - Search package.json for i18n dependencies
   - Find imports: `useTranslations`, `useTranslation`, `useIntl`, `$t`, `formatMessage`, `translate`
   - Find config files: `i18n.config.*`, `i18next.config.*`, `next-intl.config.*`, `lingui.config.*`
   - Report confidence: High (found imports + config), Medium (found one), Low (inferred only)

2. **Find translation files**
   - Glob: `**/*.json`, `**/*.yaml`, `**/*.yml`, `**/*.po`, `**/*.properties`
   - Directories: `locales`, `messages`, `i18n`, `lang`, `translations`, `public`
   - Report: file paths, format, directory structure

3. **Identify key conventions**
   - Read 3-5 translation files
   - Analyze: separator (dot/colon/slash/underscore), structure (flat/nested/namespaced), casing
   - Report confidence: High (3+ files), Medium (1-2 files), Low (inferred from code)

4. **List available locales**
   - From config files or file names (en.json, pt-BR.json, etc.)
   - Report: locale codes, default locale if found

5. **Detect hook/function pattern**
   - How translations are accessed: `const t = useTranslations()`, `$t()`, `intl.formatMessage()`
   - Report: exact pattern with example from codebase

6. **Find reference modules**
   - List 2-3 well-migrated components that follow the pattern
   - Prefer files with 5+ translation keys

## Output Format

```
## i18n Analysis Report

**Library**: [name] (confidence: High/Medium/Low)
**Storage**: [local/remote/hybrid] (confidence: High/Medium/Low)
**Translation files**: 
  - [path1]
  - [path2]
**Locales**: [en, pt-BR, ...] (confidence: High/Medium/Low)
**Key convention**: [separator] + [structure] + [casing] (confidence: High/Medium/Low)
**Hook/Function**: [pattern] (confidence: High/Medium/Low)
**Reference modules**:
  - [module1]
  - [module2]

## Recommendations

- [suggestion 1]
- [suggestion 2]
```

## Fallback

If analysis cannot determine stack with at least Medium confidence, report what was found and list specific questions for the user.
