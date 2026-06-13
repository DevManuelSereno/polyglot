# i18n Examples

Quick reference for common patterns. See [patterns.md](patterns.md) for detailed rules.

## Library Patterns

### next-intl
```tsx
import { useTranslations } from 'next-intl';
const t = useTranslations('namespace');
<h1>{t('key')}</h1>
```

### react-i18next
```tsx
import { useTranslation } from 'react-i18next';
const { t } = useTranslation('namespace');
<h1>{t('key')}</h1>
```

### vue-i18n
```vue
<template>
  <h1>{{ $t('namespace.key') }}</h1>
</template>
```

### react-intl
```tsx
import { useIntl } from 'react-intl';
const intl = useIntl();
<h1>{intl.formatMessage({ id: 'namespace.key' })}</h1>
```

## Common Patterns

### Interpolation
```tsx
// Before
<p>Hello, {user.name}!</p>

// After
<p>{t('greeting', { name: user.name })}</p>

// Translation
{ "greeting": "Hello, {name}!" }
```

### Pluralization
```tsx
// Before
<span>{count === 1 ? '1 item' : `${count} items`}</span>

// After (i18next)
<span>{t('items', { count })}</span>

// Translation
{ "items_one": "{{count}} item", "items_other": "{{count}} items" }
```

### Attributes
```tsx
// Before
<input placeholder="Enter name" aria-label="Name field" />

// After
<input placeholder={t('namePlaceholder')} aria-label={t('nameAriaLabel')} />
```

### Conditional
```tsx
// Before
{show ? 'Yes' : 'No'}

// After
{show ? t('yes') : t('no')}
```

### Rich Text (react-i18next)
```tsx
// Before
<p>Click <a href="/help">here</a> for help</p>

// After
<p>{t('helpLink', { link: (chunks) => <a href="/help">{chunks}</a> })}</p>

// Translation
{ "helpLink": "Click <link>here</link> for help" }
```
