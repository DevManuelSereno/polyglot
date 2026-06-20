# Next.js + next-intl + GCS Remote Storage

```yaml
---
library: next-intl
hook: useTranslations("namespace")
storage: remote
remote-provider: gcs
gcs-workflow: user-provides-json → merge → return-updated
key-casing: camelCase
namespace-pattern: module.section.key
sub-components: direct
locales: pt-br, ja-jp
skip-discovery: true
---

# Project i18n Conventions

## Additional Notes
- We use ICU MessageFormat for plurals
- Zod schemas use factory functions: `createSchema(t)`
- Remote storage: GCS bucket (user provides JSONs for translation)
- Each sub-component calls useTranslations independently
```
