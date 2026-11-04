/**
 * i18n-project.js — Shared helpers for detect-conventions.js and validate-keys.js
 *
 * Finds translation files in the common layouts, recognizes locale codes,
 * reads `.claude/polyglot-conventions.md` and maps translator variables
 * (`const tForm = useTranslations("Page.Form")`) to their namespaces.
 *
 * Supported translation layouts (inside messages/, locales/, i18n/…):
 *   flat         messages/en.json, messages/pt-BR.json
 *   locale-dir   messages/en/common.json, messages/pt-br/page.json
 *   module-dir   messages/features/<module>/en.json (namespace as the JSON root)
 */

const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.claude', '.turbo', 'out'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];
const TRANSLATION_DIRS = [
  'locales', 'messages', 'i18n', 'lang', 'translations', 'public/locales',
  'src/locales', 'src/messages', 'src/i18n/locales', 'src/i18n/messages', 'src/lang',
];
const TRANSLATION_EXTENSIONS = ['.json', '.yaml', '.yml', '.po', '.properties'];
const CONVENTIONS_PATH = path.join('.claude', 'polyglot-conventions.md');

// en, pt-BR, pt-br, pt_BR, zh-Hant, zh-Hant-TW, es-419. Three-letter codes only
// with a region, so folder names like "api" or "app" are not taken as locales.
const LOCALE_RE = /^(?:[a-z]{2}|[a-z]{3}(?=[-_]))(?:[-_](?:[a-z]{4}))?(?:[-_](?:[a-z]{2}|\d{3}))?$/i;

function isLocaleCode(name) {
  return LOCALE_RE.test(name);
}

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function walkFiles(dir, { extensions, maxDepth = Infinity, ignoreDirs = IGNORE_DIRS } = {}) {
  const results = [];
  function walk(current, depth) {
    let items;
    try { items = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        if (depth < maxDepth && !ignoreDirs.includes(item.name)) walk(fullPath, depth + 1);
      } else if (item.isFile() && (!extensions || extensions.includes(path.extname(item.name)))) {
        results.push(fullPath);
      }
    }
  }
  walk(dir, 0);
  return results;
}

function findSourceFiles(root = '.') {
  return walkFiles(root, { extensions: SOURCE_EXTENSIONS });
}

/**
 * Translation files with their locale and layout.
 * Returns [{ file, dir, locale, layout, module }] — `module` is the folder name
 * (module-dir) or the file name (locale-dir); null for flat files.
 */
function findTranslationFiles(dirs = TRANSLATION_DIRS) {
  const results = [];
  const seen = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const file of walkFiles(dir, { extensions: TRANSLATION_EXTENSIONS, maxDepth: 4 })) {
      const resolved = path.resolve(file);
      if (seen.has(resolved)) continue;
      const base = path.basename(file, path.extname(file));
      const parent = path.basename(path.dirname(file));
      let entry = null;
      if (isLocaleCode(base)) {
        entry = path.dirname(file) === path.normalize(dir)
          ? { locale: base, layout: 'flat', module: null }
          : { locale: base, layout: 'module-dir', module: parent };
      } else if (isLocaleCode(parent)) {
        entry = { locale: parent, layout: 'locale-dir', module: base };
      }
      if (entry) {
        seen.add(resolved);
        results.push({ file, dir, ...entry });
      }
    }
  }
  return results;
}

function summarizeTranslationFiles(entries) {
  const locales = [...new Set(entries.map(e => e.locale))].sort();
  const layouts = {};
  for (const e of entries) {
    const root = e.layout === 'module-dir' ? path.dirname(path.dirname(e.file)) : e.dir;
    const key = `${e.layout}:${root}`;
    if (!layouts[key]) layouts[key] = { layout: e.layout, root, files: 0, modules: new Set() };
    layouts[key].files++;
    if (e.module) layouts[key].modules.add(e.module);
  }
  return {
    locales,
    layouts: Object.values(layouts).map(l => ({ layout: l.layout, root: l.root, files: l.files, modules: l.modules.size })),
  };
}

function flattenKeys(obj, prefix = '') {
  const keys = {};
  for (const [key, value] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(keys, flattenKeys(value, fullKey));
    } else {
      keys[fullKey] = value;
    }
  }
  return keys;
}

/**
 * Reads the YAML frontmatter of `.claude/polyglot-conventions.md` (flat
 * `key: value` lines only). Returns null when the file does not exist.
 */
function readConventionsFile(root = '.') {
  const filePath = path.join(root, CONVENTIONS_PATH);
  const content = readFileSafe(filePath);
  if (content === null) return null;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fields = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { path: filePath, fields };
}

const TRANSLATOR_DECL_RE =
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations|useTranslation)\(\s*(?:\{[^}]*?namespace:\s*)?(?:['"`]([\w.:-]+)['"`])?/g;

/**
 * Translator declarations in order: [{ name, ns, index }]. A call without
 * namespace maps to ''. react-i18next's `const { t } = useTranslation("ns")`
 * is included. The same name may be declared in several functions of a file.
 */
function findTranslatorDecls(content) {
  const decls = [];
  let m;
  TRANSLATOR_DECL_RE.lastIndex = 0;
  while ((m = TRANSLATOR_DECL_RE.exec(content))) decls.push({ name: m[1], ns: m[2] || '', index: m.index });
  const destructured = /const\s*\{\s*t(?:\s*:\s*(\w+))?\s*[,}][^=]*=\s*useTranslation\(\s*(?:['"`]([\w.:-]+)['"`])?/g;
  while ((m = destructured.exec(content))) decls.push({ name: m[1] || 't', ns: m[2] || '', index: m.index });
  return decls.sort((a, b) => a.index - b.index);
}

/** Translator variables declared in a file: { varName: namespace } (last declaration wins). */
function findTranslatorVars(content) {
  const vars = {};
  for (const d of findTranslatorDecls(content)) vars[d.name] = d.ns;
  return vars;
}

/**
 * Translator parameters in order: [{ name, ns, index }] — a parameter or prop
 * named `t` / `tSomething` typed as a translator, or destructured from props
 * and called. `ns` comes from a typed namespace (`useTranslations<"Navbar">`),
 * else null.
 */
function findTranslatorParamDecls(content) {
  const decls = [];
  const typed = /\b(t|t[A-Z]\w*)\??\s*:\s*(?:TFunction\b|\w*Translat\w*|ReturnType<\s*typeof\s+(?:useTranslations|getTranslations)\s*(?:<\s*['"]([\w.]+)['"]\s*>)?\s*>|\(\s*key\b)/g;
  let m;
  while ((m = typed.exec(content))) decls.push({ name: m[1], ns: m[2] || null, index: m.index });
  const destructured = /\(\s*\{([^}]*)\}\s*(?::[^)]*)?\)\s*(?:=>|\{)/g;
  while ((m = destructured.exec(content))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/[\s:=]/)[0];
      if (/^t[A-Z]\w*$|^t$/.test(name) && new RegExp(`\\b${name}\\(`).test(content) && !decls.some(d => d.name === name)) {
        decls.push({ name, ns: null, index: m.index });
      }
    }
  }
  return decls.sort((a, b) => a.index - b.index);
}

/** Names of translator parameters a file receives without declaring them as hooks. */
function findTranslatorParams(content, declared = {}) {
  const names = new Set(findTranslatorParamDecls(content).map(d => d.name));
  for (const name of Object.keys(declared)) names.delete(name);
  return [...names];
}

/** Translator variables passed as an argument or prop (`fn(tForm)`, `{ tColumns }`, `t={t}`). */
function findPassedTranslators(content, vars) {
  const passed = [];
  for (const name of Object.keys(vars)) {
    const re = new RegExp(`(?:[(,{]\\s*|=\\{\\s*)${name}\\s*[,)}](?!\\s*=>)`);
    if (re.test(content)) passed.push(name);
  }
  return passed;
}

module.exports = {
  IGNORE_DIRS,
  SOURCE_EXTENSIONS,
  TRANSLATION_DIRS,
  TRANSLATION_EXTENSIONS,
  CONVENTIONS_PATH,
  isLocaleCode,
  readFileSafe,
  walkFiles,
  findSourceFiles,
  findTranslationFiles,
  summarizeTranslationFiles,
  flattenKeys,
  readConventionsFile,
  findTranslatorDecls,
  findTranslatorVars,
  findTranslatorParamDecls,
  findTranslatorParams,
  findPassedTranslators,
};
