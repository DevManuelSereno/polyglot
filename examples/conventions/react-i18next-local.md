# React + react-i18next + Local JSON Storage

```yaml
---
library: react-i18next
hook: useTranslation("namespace")
storage: local
key-casing: camelCase
namespace-pattern: flat
sub-components: prop-drilling
locales: en, pt-BR, es
skip-discovery: true
---

# Project i18n Conventions

## Additional Notes
- Translation files in `public/locales/` directory
- Sub-components receive `t` as prop from parent
- Flat key structure: `common.save`, `form.emailLabel`
- Auto-validation runs on every session via Stop hook
```
