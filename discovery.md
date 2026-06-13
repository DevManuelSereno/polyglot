# Discovery Protocol

Detect the project's i18n stack automatically. Report confidence level for each detection.

## Detection Steps

### 1. Detect i18n Library

Search for imports and config files:

| Library | Signals | Confidence |
|---------|---------|------------|
| next-intl | `import { useTranslations } from 'next-intl'`, `next-intl.config.*` | High |
| react-i18next | `import { useTranslation } from 'react-i18next'`, `i18next.config.*` | High |
| i18next | `import i18n from 'i18next'`, `i18next.config.*` | High |
| react-intl / FormatJS | `import { useIntl, FormattedMessage } from 'react-intl'` | High |
| vue-i18n | `import { useI18n } from 'vue-i18n'`, `$t()` in templates | High |
| @angular/localize | `$localize`, `ng extract-i18n`, `angular.json` i18n config | High |
| svelte-i18n | `import { _ } from 'svelte-i18n'`, `$_()` in templates | High |
| lingui | `import { t } from '@lingui/macro'`, `lingui.config.*` | High |

**Fallback**: If no library detected, ask user which i18n system is in use.

### 2. Detect Translation Storage

Search for translation files:

- **Local files**: glob for `**/*.json`, `**/*.yaml`, `**/*.yml`, `**/*.po`, `**/*.properties` inside `locales`, `messages`, `i18n`, `lang`, `translations`, `public`
- **Config files**: `i18n.config.*`, `i18next.config.*`, `next-intl.config.*`, `lingui.config.*`
- **CMS/remote**: if no local files found, ask user

**Confidence**: High if files found, Low if only config found, None if nothing found

### 3. Detect Key Convention

From translation files or reference module:

- **Separator**: dot (`.`), colon (`:`), slash (`/`), underscore (`_`)
- **Structure**: flat (`page_title`), nested (`page.title`), namespaced (`page:title`)
- **Casing**: camelCase, snake_case, kebab-case

**Confidence**: High if 3+ keys analyzed, Medium if 1-2 keys, Low if inferred from code only

### 4. Detect Locales

From config files or translation file names: `en`, `en-US`, `pt-BR`, etc.

**Confidence**: High if config found, Medium if file names only

### 5. Detect Hook/Function Pattern

How translations are accessed in components:
- `const t = useTranslations()` (next-intl)
- `const { t } = useTranslation()` (react-i18next)
- `$t()` in templates (vue-i18n)
- `intl.formatMessage()` (react-intl)

**Confidence**: High if reference module found, Medium if inferred from imports

## Error Handling

If any detection step fails:
1. Report what was detected with confidence levels
2. Ask user for missing information
3. Do not proceed with Low confidence detections

## Output Format

```
## Detection Results

**Library**: [name] (confidence: High/Medium/Low)
**Storage**: [local/remote/hybrid] (confidence: High/Medium/Low)
**Key convention**: [separator] + [structure] + [casing] (confidence: High/Medium/Low)
**Locales**: [list] (confidence: High/Medium/Low)
**Hook pattern**: [pattern] (confidence: High/Medium/Low)
```
