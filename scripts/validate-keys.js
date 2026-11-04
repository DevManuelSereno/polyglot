#!/usr/bin/env node

/**
 * Validates i18n keys in translation files and in code.
 *
 * Translation files (any of the three layouts, see lib/i18n-project.js):
 * - Parse errors and empty values
 * - Missing keys across locales (each locale's catalog vs the union)
 * - ICU argument names that differ between locales
 *
 * Code (tests and mocks are skipped: they often mock the i18n library):
 * - Follows each translator variable (`const tForm = useTranslations("Page.Form")`)
 * - Template keys (`t(`status.${s}`)`) cover every key under their prefix
 * - Translators passed to other files (`getColumns({ tColumns })`,
 *   `createSchema(tForm)`) keep their namespace there; unresolved ones match
 *   catalog keys by suffix
 * - `t(variable)` / `t(MAP[id])`: keys of that namespace are "dynamic", not orphans
 * - Keys used in code but missing from the catalog → error
 * - Keys in the catalog not found in code → warning (orphan)
 *
 * Usage:
 *   node validate-keys.js [locales-dir] [source-dir] [options]
 *
 * Options:
 *   --namespace <NS>    Report only keys under this namespace (repeatable)
 *   --param <var=NS>    Namespace of a translator parameter the script cannot resolve
 *   --changed           Only report problems in files changed in git (code and translations)
 *   --hook              Stop-hook mode: --changed, errors only, exit 2 on errors
 *   --quiet             Do not list orphans and dynamic namespaces, only count them
 *
 * Exit codes:
 * 0 = all valid (or nothing local to validate)
 * 1 = errors found
 * 2 = warnings only (in --hook mode: errors found)
 * 3 = no translation files found
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  TRANSLATION_DIRS,
  findSourceFiles,
  findTranslationFiles,
  flattenKeys,
  readFileSafe,
  readConventionsFile,
  findTranslatorDecls,
  findTranslatorVars,
  findTranslatorParamDecls,
  findPassedTranslators,
} = require('./lib/i18n-project');

// ============================================================================
// ARGUMENTS
// ============================================================================

const options = { localesDir: null, sourceDir: null, namespaces: [], params: {}, changed: false, hook: false, quiet: false };
const argv = process.argv.slice(2);
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--namespace' && argv[i + 1]) options.namespaces.push(argv[++i]);
  else if (a === '--param' && argv[i + 1]) { const [k, v] = argv[++i].split('='); options.params[k] = v; }
  else if (a === '--changed') options.changed = true;
  else if (a === '--hook') { options.hook = true; options.changed = true; options.quiet = true; }
  else if (a === '--quiet') options.quiet = true;
  else if (a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else positional.push(a);
}
options.localesDir = positional[0] || null;
options.sourceDir = positional[1] || ['src', 'app'].find(d => fs.existsSync(d)) || '.';

const out = options.hook ? console.error : console.log;

// ============================================================================
// HELPERS
// ============================================================================

const isTestFile = f => /\.(test|spec|stories)\.[jt]sx?$|[/\\](__tests__|__mocks__|mocks?)[/\\]/.test(f);
const toPascal = name => name.replace(/(^|[-_.\s])(\w)/g, (_, __, c) => c.toUpperCase());
const rel = f => path.relative('.', f);

function loadFile(file) {
  const content = readFileSafe(file);
  if (file.endsWith('.json')) return JSON.parse(content);
  if (file.endsWith('.yaml') || file.endsWith('.yml')) {
    try { return require('js-yaml').load(content); } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') throw new Error('YAML parsing requires js-yaml (npm install js-yaml)');
      throw e;
    }
  }
  return null; // .po / .properties: not validated
}

/** Argument names of an ICU message (`{count, plural, one {# item} other {# items}}` → count). */
function icuArgs(message) {
  const names = new Set();
  let i = 0;
  function skipQuoted() {
    if (message[i + 1] === "'") { i += 2; return; }
    const end = message.indexOf("'", i + 1);
    i = end === -1 ? message.length : end + 1;
  }
  function parseMessage(nested) {
    while (i < message.length) {
      const c = message[i];
      if (c === "'" && /[{}'#]/.test(message[i + 1] || '')) skipQuoted();
      else if (c === '{') { i++; parseArg(); }
      else if (c === '}' && nested) { i++; return; }
      else i++;
    }
  }
  function readUntil(stops) {
    const start = i;
    while (i < message.length && !stops.includes(message[i])) i++;
    return message.slice(start, i).trim();
  }
  function parseArg() {
    const name = readUntil([',', '}']);
    if (name && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) names.add(name);
    if (message[i] === '}') { i++; return; }
    i++;
    const type = readUntil([',', '}']);
    if (message[i] === '}') { i++; return; }
    i++;
    if (/^(plural|select|selectordinal)$/.test(type)) {
      while (i < message.length) {
        readUntil(['{', '}']);
        if (message[i] === '}') { i++; return; }
        i++;
        parseMessage(true);
      }
    } else {
      let depth = 1;
      while (i < message.length && depth > 0) { if (message[i] === '{') depth++; else if (message[i] === '}') depth--; i++; }
    }
  }
  parseMessage(false);
  return names;
}

function changedFiles() {
  try {
    const run = cmd => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean);
    const top = run('git rev-parse --show-toplevel')[0];
    const files = [...run('git diff --name-only HEAD'), ...run('git ls-files --others --exclude-standard')];
    return new Set(files.map(f => path.relative('.', path.join(top, f))));
  } catch {
    return null; // not a git repository: report everything
  }
}

// ============================================================================
// CATALOG
// ============================================================================

/**
 * Builds one flat catalog per locale. Module-per-file and flat files keep their
 * own roots; files in a locale folder are nested under their name (as
 * `order-details.json` → `OrderDetails` when the code uses that namespace).
 */
function buildCatalogs(entries, codeRoots, errors, warnings) {
  const catalogs = {};
  const origin = {}; // locale → key → file
  for (const entry of entries) {
    let data;
    try { data = loadFile(entry.file); } catch (e) { errors.push(`${rel(entry.file)}: Parse error - ${e.message}`); continue; }
    if (data == null) continue;
    let prefix = '';
    if (entry.layout === 'locale-dir') {
      const base = entry.module;
      const pascal = toPascal(base);
      const rootsInFile = Object.keys(data);
      prefix = rootsInFile.length === 1 && codeRoots.has(rootsInFile[0]) ? ''
        : codeRoots.has(pascal) ? pascal : codeRoots.has(base) ? base : base === 'index' ? '' : base;
    }
    const flat = flattenKeys(data, prefix);
    const catalog = (catalogs[entry.locale] = catalogs[entry.locale] || {});
    const from = (origin[entry.locale] = origin[entry.locale] || {});
    for (const [key, value] of Object.entries(flat)) {
      if (key in catalog && from[key] !== entry.file) warnings.push(`${entry.locale}: "${key}" defined in ${rel(from[key])} and ${rel(entry.file)}`);
      catalog[key] = value;
      from[key] = entry.file;
    }
  }
  return { catalogs, origin };
}

// ============================================================================
// CODE USAGE
// ============================================================================

/** Local import specifier → file path (relative, `@/`, extensionless, index). */
function resolveImport(fromFile, spec) {
  let base = null;
  if (spec.startsWith('.')) base = path.join(path.dirname(fromFile), spec);
  else if (spec.startsWith('@/')) base = path.join(fs.existsSync('src') ? 'src' : '.', spec.slice(2));
  else if (spec.startsWith('~/')) base = path.join(fs.existsSync('src') ? 'src' : '.', spec.slice(2));
  if (!base) return null;
  for (const c of [base, ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'].map(e => base + e)]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  }
  return null;
}

function importsOf(file, content) {
  const map = {}; // imported name → file
  const re = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content))) {
    const target = resolveImport(file, m[3]);
    if (!target) continue;
    if (m[1]) map[m[1]] = target;
    for (const part of (m[2] || '').split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) map[name.replace(/^type\s+/, '')] = target;
    }
  }
  return map;
}

/** Translator parameters of the function `fnName` in `content` (all of the file's if not found). */
function paramsOfFunction(content, fnName) {
  const def = new RegExp(`(?:function\\s+${fnName}\\b|(?:const|let)\\s+${fnName}\\s*(?::[^=]+)?=)`).exec(content);
  const scope = def ? content.slice(def.index, def.index + 1500) : content;
  return [...new Set(findTranslatorParamDecls(scope).map(d => d.name))];
}

/**
 * Translator namespaces received by other functions: when a file passes its
 * `tColumns` (namespace known) to a function — imported or defined in the same
 * file — that receives a translator, that parameter gets the namespace.
 */
function propagateTranslators(files, contents) {
  const received = {}; // file → { param: Set(namespaces) }
  const add = (file, param, ns) => {
    received[file] = received[file] || {};
    (received[file][param] = received[file][param] || new Set()).add(ns);
  };
  for (const file of files) {
    const content = contents[file];
    const decls = findTranslatorDecls(content);
    const vars = findTranslatorVars(content);
    const passed = findPassedTranslators(content, vars);
    if (!passed.length) continue;
    const imports = importsOf(file, content);
    for (const name of passed) {
      // The translator itself, not a call to it (`deleteLabel: tCommon("delete")` passes a string)
      const self = `\\b${name}\\b(?!\\s*\\()`;
      const forms = [
        { re: new RegExp(`\\b(\\w+)\\(\\s*(?:[^(){}]*?,\\s*)?${self}\\s*[,)]`, 'g'), positional: true }, // fn(a, tVar)
        { re: new RegExp(`\\b(\\w+)\\(\\s*\\{[^{}]*?(?:\\b(\\w+)\\s*:\\s*)?${self}\\s*[,}]`, 'g') }, // fn({ tVar }) / fn({ x: tVar })
        { re: new RegExp(`<(\\w+)[^>]*?\\b(\\w+)=\\{\\s*${self}\\s*\\}`, 'g') }, // <Comp x={tVar} />
      ];
      for (const form of forms) {
        let m;
        while ((m = form.re.exec(content))) {
          const callee = m[1];
          const local = new RegExp(`(?:function\\s+${callee}\\b|(?:const|let)\\s+${callee}\\s*(?::[^=]+)?=)`).test(content);
          const target = imports[callee] || (local ? file : null);
          if (!target || !contents[target]) continue;
          const params = paramsOfFunction(contents[target], callee);
          const wanted = m[2] || name;
          const param = params.find(p => p === wanted) || (form.positional && params.length === 1 ? params[0] : null);
          // The namespace the translator had where it was passed
          const decl = [...decls].reverse().find(d => d.name === name && d.index < m.index) || decls.find(d => d.name === name);
          if (param && decl) add(target, param, decl.ns);
        }
      }
    }
  }
  return received;
}

function collectUsage(files, contents) {
  const used = new Map(); // full key → Set(files)
  const prefixes = new Map(); // dynamic prefix → Set(files)
  const dynamicNamespaces = new Map(); // namespace → Set(files) (t(variable))
  const unresolved = new Map(); // key used through a translator of unknown namespace → Set(files)
  const received = propagateTranslators(files, contents);
  const addTo = (map, key, file) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(rel(file)); };
  const join = (ns, key) => {
    if (key.includes(':')) { const [n, k] = key.split(':'); return `${n}.${k}`; }
    return ns ? `${ns}.${key}` : key;
  };

  for (const file of files) {
    const content = contents[file];
    // Every declaration of a translator, in order: [{ name, namespaces, index }] (null = unknown namespace)
    const decls = findTranslatorDecls(content).map(d => ({ ...d, namespaces: [d.ns] }));
    const hookNames = new Set(decls.map(d => d.name));
    for (const p of findTranslatorParamDecls(content)) {
      if (hookNames.has(p.name) && !p.ns) continue;
      const fromCallers = received[file] && received[file][p.name];
      const namespaces = p.ns ? [p.ns] : options.params[p.name] ? [options.params[p.name]] : fromCallers ? [...fromCallers] : [null];
      decls.push({ name: p.name, namespaces, index: p.index });
    }
    for (const [param, ns] of Object.entries(options.params)) {
      if (!decls.some(d => d.name === param) && new RegExp(`\\b${param}\\(`).test(content)) decls.push({ name: param, namespaces: [ns], index: 0 });
    }
    if (decls.length === 0 && /(?:\$t|\bi18n\.t)\(/.test(content)) decls.push({ name: '$t', namespaces: [''], index: 0 });
    decls.sort((a, b) => a.index - b.index);

    for (const name of new Set(decls.map(d => d.name))) {
      const own = decls.filter(d => d.name === name);
      const callee = name.replace('$', '\\$');
      const call = new RegExp(`(?:^|[^\\w$.])${callee}(?:\\.(?:rich|markup|raw|has))?\\(\\s*([^)\\s,]+)`, 'g');
      let m;
      while ((m = call.exec(content))) {
        // The nearest declaration before the call (functions in one file may each declare `t`)
        const decl = [...own].reverse().find(d => d.index <= m.index) || own[0];
        const arg = m[1];
        const literal = arg.match(/^(['"])([^'"]+)\1$/) || arg.match(/^`([^`$]+)`$/);
        const template = arg.match(/^`([^`]*?)\$\{/);
        for (const ns of decl.namespaces) {
          if (literal) {
            const key = literal[2] || literal[1];
            if (ns === null) addTo(unresolved, key, file);
            else addTo(used, join(ns, key), file);
          } else if (template) {
            const prefix = template[1];
            if (ns === null) addTo(unresolved, `${prefix}*`, file);
            else addTo(prefixes, join(ns, prefix), file);
          } else if (ns !== null) {
            addTo(dynamicNamespaces, ns, file);
          }
        }
      }
    }
  }
  return { used, prefixes, dynamicNamespaces, unresolved };
}

// ============================================================================
// VALIDATION
// ============================================================================

function validate() {
  const conventions = readConventionsFile();
  const fields = conventions ? conventions.fields : {};
  const dirs = options.localesDir ? [options.localesDir] : fields['local-mirror'] ? [...new Set([fields['local-mirror'], ...TRANSLATION_DIRS])] : TRANSLATION_DIRS;

  if (options.localesDir && !fs.existsSync(options.localesDir)) {
    out(`Directory not found: ${options.localesDir}`);
    process.exit(3);
  }
  const entries = findTranslationFiles(dirs).filter(e => !/\.(po|properties)$/.test(e.file));
  if (entries.length === 0) {
    if (fields.storage === 'remote' && !fields['local-mirror']) {
      out('Remote storage without a local mirror: nothing local to validate (set local-mirror in .claude/polyglot-conventions.md to validate the files you prepare for upload)');
      process.exit(0);
    }
    out(`No translation files found in ${dirs.filter(d => fs.existsSync(d)).join(', ') || 'the usual folders'}`);
    process.exit(options.hook ? 0 : 3);
  }

  const errors = [];
  const warnings = [];
  const info = [];

  const sourceFiles = findSourceFiles(options.sourceDir).filter(f => !isTestFile(f) && !/\.d\.ts$/.test(f));
  const contents = {};
  for (const f of sourceFiles) contents[path.normalize(f)] = readFileSafe(f) || '';
  const files = Object.keys(contents);
  const codeRoots = new Set();
  for (const f of files) for (const ns of Object.values(findTranslatorVars(contents[f]))) if (ns) codeRoots.add(ns.split('.')[0]);

  const { catalogs, origin } = buildCatalogs(entries, codeRoots, errors, warnings);
  const locales = Object.keys(catalogs).sort();
  const changed = options.changed ? changedFiles() : null;
  const inScope = key => !options.namespaces.length || options.namespaces.some(ns => key === ns || key.startsWith(`${ns}.`));
  const fileChanged = f => !changed || changed.has(rel(f));

  // Translation files: empty values, missing keys, ICU arguments
  const allKeys = new Set(locales.flatMap(l => Object.keys(catalogs[l])));
  for (const locale of locales) {
    const catalog = catalogs[locale];
    for (const [key, value] of Object.entries(catalog)) {
      if (!inScope(key) || !fileChanged(origin[locale][key])) continue;
      if (typeof value === 'string' && value.trim() === '') warnings.push(`${locale}: Empty value for "${key}" (${rel(origin[locale][key])})`);
      if (value === null || value === undefined) warnings.push(`${locale}: Null value for "${key}"`);
    }
    for (const key of allKeys) {
      if (key in catalog || !inScope(key)) continue;
      const owner = locales.find(l => key in catalogs[l]);
      const where = origin[owner][key];
      const sibling = path.join(path.dirname(where), path.basename(where).replace(owner, locale));
      if (changed && !changed.has(rel(where)) && !changed.has(rel(sibling))) continue;
      errors.push(`${locale}: Missing key "${key}" (present in ${owner})`);
    }
  }
  for (const key of allKeys) {
    if (!inScope(key)) continue;
    const present = locales.filter(l => typeof catalogs[l][key] === 'string');
    if (present.length < 2) continue;
    if (changed && !present.some(l => changed.has(rel(origin[l][key])))) continue;
    const signatures = present.map(l => [...icuArgs(catalogs[l][key])].sort().join(','));
    if (new Set(signatures).size > 1) {
      warnings.push(`"${key}": ICU arguments differ — ${present.map((l, i) => `${l} {${signatures[i]}}`).join(', ')}`);
    }
  }

  // Code usage
  const { used, prefixes, dynamicNamespaces, unresolved } = collectUsage(files, contents);
  const isDefined = key => allKeys.has(key) || [...allKeys].some(k => k.startsWith(`${key}.`));
  const changedCode = files => !changed || [...files].some(f => changed.has(f));

  for (const [key, where] of used) {
    if (!inScope(key) || isDefined(key) || !changedCode(where)) continue;
    errors.push(`Code: "${key}" used in ${[...where].join(', ')} but missing from the catalog`);
  }
  for (const [key, where] of unresolved) {
    if (!changedCode(where)) continue;
    const suffix = key.endsWith('*') ? `.${key.slice(0, -1)}` : `.${key}`;
    const match = [...allKeys].some(k => (key.endsWith('*') ? k.includes(suffix) : k.endsWith(suffix) || k.includes(`${suffix}.`)));
    if (!match) warnings.push(`Code: "${key}" used through a translator with unknown namespace (${[...where].join(', ')}) and no catalog key ends with it — pass --param <var>=<Namespace>`);
  }

  if (!options.hook) {
    // A key reached through a translator of unknown namespace counts by suffix
    const matchesUnresolved = key => [...unresolved.keys()].some(k => (k.endsWith('*')
      ? key.includes(`.${k.slice(0, -1)}`)
      : key.endsWith(`.${k}`) || key.includes(`.${k}.`)));
    const isUsed = key =>
      used.has(key) ||
      [...used.keys()].some(u => key.startsWith(`${u}.`)) ||
      [...prefixes.keys()].some(p => key.startsWith(p)) ||
      matchesUnresolved(key);
    const dynamicOwner = key => [...dynamicNamespaces.keys()].find(ns => key.startsWith(`${ns}.`));
    const orphans = [];
    const dynamic = {};
    for (const key of [...allKeys].sort()) {
      if (!inScope(key) || isUsed(key)) continue;
      const owner = dynamicOwner(key);
      if (owner) (dynamic[owner] = dynamic[owner] || []).push(key);
      else orphans.push(key);
    }
    if (orphans.length) {
      if (options.quiet) warnings.push(`${orphans.length} key(s) in the catalog not found in code (run without --quiet to list)`);
      else orphans.forEach(k => warnings.push(`Orphan: "${k}" not found in code`));
    }
    for (const [ns, keys] of Object.entries(dynamic)) {
      const where = [...dynamicNamespaces.get(ns)].join(', ');
      info.push(`${ns}: ${keys.length} key(s) not used literally, but ${where} calls the translator with a variable${options.quiet ? '' : ` — ${keys.map(k => k.slice(ns.length + 1)).join(', ')}`}`);
    }
    for (const [prefix, where] of prefixes) {
      if (inScope(prefix) && ![...allKeys].some(k => k.startsWith(prefix))) warnings.push(`Code: template key "${prefix}\${…}" in ${[...where].join(', ')} matches no catalog key`);
    }
  }

  // Report
  const layouts = [...new Set(entries.map(e => `${e.layout}:${rel(e.layout === 'module-dir' ? path.dirname(path.dirname(e.file)) : e.dir)}`))];
  out(`\nValidation: ${layouts.join(', ')}`);
  out(`Locales: ${locales.join(', ')} | Files: ${entries.length} | Keys: ${allKeys.size} | Source files: ${files.length} (tests skipped)${options.namespaces.length ? ` | Namespace: ${options.namespaces.join(', ')}` : ''}${changed ? ` | Changed files only (${changed.size})` : ''}\n`);

  if (errors.length > 0) { out('❌ ERRORS:'); errors.forEach(e => out(`  ${e}`)); }
  if (!options.hook && warnings.length > 0) { out('\n⚠️  WARNINGS:'); warnings.forEach(w => out(`  ${w}`)); }
  if (!options.hook && info.length > 0) { out('\nℹ️  DYNAMIC (check by hand, not counted as orphans):'); info.forEach(i => out(`  ${i}`)); }

  if (errors.length === 0 && (options.hook || warnings.length === 0)) {
    out('✅ All translation files are valid');
    process.exit(0);
  }
  if (options.hook) process.exit(2);
  process.exit(errors.length > 0 ? 1 : 2);
}

validate();
