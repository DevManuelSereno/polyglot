# Changelog

## 1.6.0 (2026-11-04)

### Features

* **detection:** `--target` samples the target first (App Router paths included); locales in locale and module folders; storage from the runtime loader (`local`, `remote`, `remote-mirror`); namespace depth and casing; translators passed to factories; `createXSchema(t)` and fixed messages
* **validation:** `validate-keys.js` rewritten — every layout, translator variables, template keys, translators passed across files, dynamic keys; ICU arguments by name; `--namespace`, `--param`, `--changed`; the Stop hook blocks only on errors in changed files
* **remote catalogs:** `remote.md`, an example loader (`examples/remote-catalog`), `remote-check.js` (what to republish, moved keys, remote vs mirror)
* **migrate:** `migrate.md` checklist and rules
* **patterns:** `useFormatter` time-zone prerequisite, zero in ICU plurals, date inputs (`examples/date-input`), explicit locale import maps
* **translate:** Claude translates by default; `pending-report.js`; review of existing translations; `translate.py` optional
