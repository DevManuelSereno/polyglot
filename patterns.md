# i18n Patterns Reference

## String Interpolation

When a hardcoded string contains dynamic values, never concatenate — use the interpolation mechanism of the detected i18n library.

**Detect the interpolation pattern** from the reference module or translation files:
- ICU / named: `"Hello, {name}"` → `t('greeting', { name })`
- Positional: `"Hello, %s"` → `t('greeting', name)` (avoid if ICU is available)
- Template: `` `Hello, ${name}` `` → must be converted to interpolation

**Rules:**
- Never split a sentence into multiple `t()` calls joined by concatenation.
- If the reference module uses ICU MessageFormat, follow it exactly.
- If interpolation is used in the reference module, replicate the same variable naming style.
- Watch for implicit concatenation in JSX: `<p>Hello, {user.name}</p>` is interpolation, not two strings.

## Pluralization

When a string changes based on a count, use the pluralization mechanism detected in the project.

**Detect the pluralization pattern** from translation files or the reference module:
- **ICU MessageFormat**: `"You have {count, plural, one {# item} other {# items}}"`
- **Key suffix**: `items.one`, `items.other` (or `items_singular`, `items_plural`)
- **Object form** (i18next): `{ "items_one": "{{count}} item", "items_other": "{{count}} items" }`

**Rules:**
- Never use `count === 1 ? t('singular') : t('plural')` in code — this breaks for languages with complex plural rules.
- Always delegate plural logic to the i18n library.
- If the reference module has pluralized keys, replicate the exact same pattern.

## Formatting (Dates, Numbers, Currencies)

When a hardcoded string contains formatted values, use the formatting mechanism of the detected i18n library.

**Detect the formatting pattern** from the reference module:
- **next-intl**: `useFormatter()` → `formatter.dateTime()`, `formatter.number()`
- **react-intl**: `<FormattedMessage>` with `values` + `Intl` API, or `useIntl().formatDate()`
- **i18next**: custom formatters via `i18next.services.formatter`
- **Native**: `Intl.DateTimeFormat`, `Intl.NumberFormat` wrapped in a helper

**Rules:**
- Do not format dates/numbers inline with `toLocaleDateString()` if the project has a formatting utility.
- Follow the existing formatting pattern from the reference module exactly.

## Rich Text and Inline Components

When a translated string contains markup, links, or inline components, use the mechanism detected in the project.

**Detect the rich text pattern** from the reference module:
- **Component-based**: `<Trans>` (react-i18next, react-intl), `<FormattedMessage>` with JSX children
- **Tag-based**: `"Click <link>here</link>"` → `t('cta', { link: (chunks) => <a href="...">{chunks}</a> })`
- **HTML injection**: `dangerouslySetInnerHTML` with sanitized translations (rare, flag as risk)

**Rules:**
- Never hardcode markup inside a translation key unless the project already does this.
- If the reference module uses `<Trans>` or equivalent, replicate the exact pattern.
- Do not split a rich text sentence into multiple keys.

## JSX Contexts

Strings appear in different positions in JSX. Each has specific handling:

| Context | Example | Handling |
|---------|---------|----------|
| Text content | `<p>Hello</p>` | Replace text with `{t('key')}` |
| Attribute | `<input placeholder="Name" />` | Replace value with `{t('key')}` |
| Attribute (string) | `<img alt="Logo" />` | Replace value with `{t('key')}` |
| Conditional text | `{show ? 'Yes' : 'No'}` | Replace each branch: `{show ? t('yes') : t('no')}` |
| Template literal | `` `Hello ${name}` `` | Convert to interpolation: `t('greeting', { name })` |
| Object value | `{ label: 'Save' }` | Replace value: `{ label: t('save') }` |
| Nested JSX | `<p>Click <b>here</b></p>` | See Rich Text section |

**Rules:**
- Migrate all user-visible strings regardless of context.
- Do not skip aria-labels, titles, or placeholders — they are user-visible.
- Exclude: CSS class names, data attributes, event handler names, non-visible debug strings.

## Large Files Strategy

When a module has many hardcoded strings (20+):

1. Count total hardcoded strings in the target module.
2. If more than 20, propose batching by logical section (e.g., header, form, footer).
3. Ask the user if they want all strings migrated or a specific subset.
4. Process one batch at a time.

**Rules:**
- Do not silently skip strings. If a string is not migrated, note it in the response.
- If a module is too large to analyze in one pass, say so and propose a strategy.
