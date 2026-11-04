# Migrate Guide

How to find what to migrate in a target (Phase 4) and the rules for changing it (Phase 5). Walk the whole list for every target: the categories catch strings a quick scan misses (placeholders with example dates, labels inside shared components).

## Phase 4: Identify

Run each check on the target's files, then on the shared components it imports. Record each finding with its file and line and a proposed decision; apply only after the user agrees.

### 1. Hardcoded text

Labels, placeholders, error and empty-state messages, `aria-label`/`title`/`alt`, tooltips, buttons, toast titles **and** descriptions, modal titles, table headers, summary cards.

- **Placeholders with example data**: an example name or plate can stay; an example **date** in one order (`15/12/2025`) must not — see [patterns.md](patterns.md#date-input-fields).
- **Fallbacks that hide missing keys**: `t("x") || "Text"`, `t.has(k) ? t(k) : "Text"` with a hardcoded language.
- **Enum values shown as text**: `` t(`status.${value}`) `` needs a key for every value the API can send, including legacy codes still in the data.

Exclude: constants, logs, identifiers, CSS classes, data attributes, API field names (`sort: "Title"`), brand and product names, native names of languages in a language picker.

### 2. Where the file came from

Before proposing any change to a file, check whether it is a **copy** of another project or of a UI library (vendored component, design-system copy, generated code):

- the linter/formatter ignore list (`biome.json`, `.eslintignore`, `.prettierignore`);
- the file's git history (`git log --follow --format='%h %s' -- <file>`): added in one "copy"/"port" commit, never edited;
- a project document that lists copied files or divergences.

For a copy, editing it is a **divergence from its source**: propose it as a decision (edit and record the divergence, or ask the source's owners to accept the text by prop) — never as a routine fix. Do this check during identification, not when applying.

### 3. Labels passed by prop

A component with label props and defaults in one language (`labels = { toggle: "Toggle Sidebar" }`) is translated only if **every** consumer passes **every** label. For each such component the target renders, compare the props it accepts with what the consumer passes; a missing one leaves the default on screen.

### 4. Validation messages

For each schema (Zod, Yup…) in the target, list the rules and what each shows on screen:

- **Library default messages** leak in the library's language: `.max()`, `.email()`, `.refine()` or `.regex()` without a message, `invalid_type`. Check whether the field already prevents the rule from failing (`maxLength`, a select with fixed options, a numeric input): then the message never shows.
- **Fixed messages** in the source language (`.min(1, "Name is required")`).
- **What the error component does**: many forms replace some rules with a generic text (e.g. every `too_small` becomes "Fill in the required fields") and show others as they are. Read the error component to know which.

Then decide per rule (see Rule 3 below): a message that reaches the screen needs a key; one that never does is removed, not migrated.

### 5. Numbers, dates and currency

- `toFixed(n)` shown to users: always a dot as decimal separator (`1234.50 km` in Portuguese).
- `String(n)` / template literals with numbers: no grouping, dot decimals.
- `toLocaleString("pt-BR")`, `Intl.NumberFormat("en-US")`, `toLocaleDateString` with a **fixed** locale, or with none (uses the browser's language, not the app's).
- Currency: the locale formats the number; the currency code stays whatever the data says.

Use the current locale (see [patterns.md](patterns.md#formatting-dates-numbers-currencies) for `useFormatter` and its time-zone prerequisite). `toFixed` used only to build a value sent to an API is not user-facing — leave it.

### 6. Date input fields

A text field where users type a date must follow the locale's order for the mask, the parsing and the placeholder, and must reject impossible dates. A field that displays with the locale but parses as day/month (or a mask fixed to `dd/mm/yyyy`) breaks in `en-US`. See [patterns.md](patterns.md#date-input-fields).

### 7. Locale codes passed to libraries

Routing locales are often lowercase (`pt-br`), while date pickers, `date-fns`, `dayjs`, phone inputs and similar libraries key their locale maps by BCP 47 casing (`pt-BR`) or by language only (`pt`). A lookup like `locales[locale]` silently falls back to English. Look for maps keyed by locale codes and normalize first:

```ts
const tag = new Intl.Locale(locale); // "pt-br" → language "pt", region "BR"
const key = tag.region ? `${tag.language}-${tag.region}` : tag.language; // "pt-BR"
const candidates = [key, tag.language]; // try the full tag, then the language
```

### 8. Shared components the target imports

Follow the target's imports into shared folders (`components/`, `ui/`, `lib/`) and run checks 1–7 on what it renders: an upload box, an address autocomplete, a phone field. Orphan keys in the target's namespace often point to text that moved into such a component.

Text in a shared component goes to the shared namespace (e.g. `Common.fileUpload.*`), not to the target's — and changes every screen that uses it; say so.

## Phase 5: Rules

The Migrate scope rules still hold (no refactors, no logic changes, no unrelated lines). These are the explicit exceptions and clarifications.

### Rule 1: The new key carries the original text

The value of a new key in the source locale is **exactly** the text that was on screen — same capitalization, punctuation and wording, typos included. Fixing a typo, unifying capitalization ("Total de Abastecimentos" vs "Total de abastecimentos") or improving wording is a separate decision: list it as a suggestion, apply only with approval.

For the other locales, see Translate (Phase 6): until translated, they hold the source text and go into the pending-translation report.

### Rule 2: Schema factories are allowed

Moving a schema to a factory that receives the translator — `export const createOrderSchema = (t) => z.object({…})` — changes its type and its call sites. That is **allowed in Migrate** when a validation message must be translated (Rule 3), as the minimum change:

- keep the original schema's shape and rules; only messages change;
- export the inferred type from the factory's return (`type OrderForm = z.infer<ReturnType<typeof createOrderSchema>>`);
- at call sites, build it once per translator (`useMemo(() => createOrderSchema(t), [t])`);
- give `t` a narrow type (the keys it may receive) when the project's translator type is strict;
- schemas that only validate API payloads stay as they are.

### Rule 3: Migrate a validation message only if it reaches the screen

From check 4:

| The message… | Action |
|---|---|
| reaches the screen as written (regex, `refine`, `.email()`, a max the field does not prevent) | Key + factory (Rule 2) |
| comes from the library default and reaches the screen | Add a message with a key — the default leaks the library's language |
| is replaced by the error component's generic text | Remove the fixed message (dead text); behavior unchanged |
| belongs to a rule the field already prevents (`maxLength`, fixed options) | Leave it; note it |

The same project can need both outcomes in different forms; decide per rule, not per project.

### Rule 4: Tests that mock the i18n library

When a test mocks the library with a map of labels (`vi.mock("next-intl", …)` returning `{ "Page.title": "Orders" }`), turning a hardcoded string into a key makes the test fail or, worse, pass while asserting the old text. Search the target's tests for such mocks and add the new keys with their source text. Tests never validate keys (they do not read the catalog): validation is `validate-keys.js`.
