# Vue 3 + vue-i18n + Crowdin Remote Storage

```yaml
---
library: vue-i18n
hook: $t("namespace.key")
storage: remote
remote-provider: crowdin
key-casing: camelCase
namespace-pattern: nested
sub-components: direct
locales: en, fr, de, ja
skip-discovery: true
---

# Project i18n Conventions

## Additional Notes
- Translation files managed in Crowdin
- Use `$t()` in templates, `t()` in script setup
- Nested key structure: `common.actions.save`
- Sub-components call `$t()` directly (global composable)
- Sync with Crowdin via CLI before releases
```
