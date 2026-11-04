#!/usr/bin/env node

/**
 * detect-conventions.js — Auto-detect i18n conventions in a codebase
 *
 * Two modes:
 *   --quick  Fast stack detection (~200 tokens) — for dynamic context
 *   (deep)   Full convention analysis (~2k tokens) — for Phase 1
 *
 * Quick mode detects:
 *   1. i18n library in use
 *   2. Translation files, their layout and locales
 *   3. Storage: local, remote, or remote with a local mirror
 *   4. The project's conventions file (.claude/polyglot-conventions.md)
 *
 * Deep mode additionally detects (sampling the target first):
 *   5. Namespace pattern (Namespace.Section.key), root and leaf casing
 *   6. Hook usage: direct, translators received or passed to helpers
 *   7. Schema integration: createXSchema(t) factories and schemas still to migrate
 *   8. Key naming casing in translation files
 *
 * Usage:
 *   node detect-conventions.js                         # Deep mode, JSON
 *   node detect-conventions.js --quick                 # Quick mode, compact JSON
 *   node detect-conventions.js --target <path>         # Sample this folder/file first
 *   node detect-conventions.js "src/app/[locale]/(dashboard)/vehicle"   # same as --target
 *   node detect-conventions.js --files 20              # Minimum sample size
 *   node detect-conventions.js --verbose               # Markdown output
 *   node detect-conventions.js --output file.json      # Save to file
 *   node detect-conventions.js --help                  # Show help
 */

const fs = require('fs');
const path = require('path');
const {
  findSourceFiles,
  findTranslationFiles,
  summarizeTranslationFiles,
  flattenKeys,
  readFileSafe,
  readConventionsFile,
  findTranslatorVars,
  findTranslatorParams,
  findPassedTranslators,
  CONVENTIONS_PATH,
} = require('./lib/i18n-project');

const VERSION = '1.6.0';

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  quick: false,
  files: 10,
  verbose: false,
  output: null,
  target: null,
  help: false,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--quick') {
    options.quick = true;
  } else if (args[i] === '--files' && args[i + 1]) {
    options.files = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--verbose') {
    options.verbose = true;
  } else if (args[i] === '--output' && args[i + 1]) {
    options.output = args[i + 1];
    i++;
  } else if (args[i] === '--target' && args[i + 1]) {
    options.target = args[i + 1];
    i++;
  } else if (args[i] === '--help') {
    options.help = true;
  } else if (!args[i].startsWith('--') && !options.target) {
    options.target = args[i];
  }
}

if (options.help) {
  console.log(`
detect-conventions.js — Auto-detect i18n conventions

Usage:
  node detect-conventions.js [options] [target]

Options:
  --quick           Fast stack detection (~200 tokens)
  --target <path>   File or folder to sample first (App Router paths with
                    [locale] and (group) are taken literally; quote them)
  --files <count>   Minimum number of files to analyze in deep mode (default: 10)
  --verbose         Output human-readable markdown instead of JSON
  --output <file>   Save output to file
  --help            Show this help message

Examples:
  node detect-conventions.js --quick
  node detect-conventions.js --target "src/app/[locale]/(dashboard)/vehicle"
  node detect-conventions.js --files 20 --verbose
`);
  process.exit(0);
}

// ============================================================================
// HELPERS
// ============================================================================

const I18N_USAGE = /useTranslations?\(|getTranslations\(|useIntl\(|\$t\(|formatMessage|svelte-i18n|@lingui|\bi18n\.t\(/;

const LIBRARY_PATTERNS = [
  { name: 'next-intl', dep: 'next-intl', patterns: [/useTranslations\(/, /getTranslations\(/, /from ['"]next-intl/] },
  { name: 'react-i18next', dep: 'react-i18next', patterns: [/useTranslation\(/, /from ['"]react-i18next['"]/] },
  { name: 'i18next', dep: 'i18next', patterns: [/from ['"]i18next['"]/, /i18next\.config/] },
  { name: 'react-intl', dep: 'react-intl', patterns: [/useIntl/, /FormattedMessage/, /react-intl/] },
  { name: 'vue-i18n', dep: 'vue-i18n', patterns: [/useI18n/, /\$t\(/, /vue-i18n/] },
  { name: '@angular/localize', dep: '@angular/localize', patterns: [/\$localize/, /ng extract-i18n/] },
  { name: 'svelte-i18n', dep: 'svelte-i18n', patterns: [/svelte-i18n/, /\$_\(/] },
  { name: 'lingui', dep: '@lingui/core', patterns: [/@lingui/, /lingui\.config/] },
];

const CONFIG_PREFIXES = ['i18n.config.', 'next-intl.config.', 'i18next.config.', 'lingui.config.', 'crowdin.', 'lokalise.', '.phrase', 'locize.'];

const REMOTE_PROVIDERS = [
  { name: 'gcs', re: /storage\.googleapis\.com|storage\.cloud\.google\.com|@google-cloud\/storage/i },
  { name: 's3', re: /amazonaws\.com|@aws-sdk\/client-s3|\bs3:\/\//i },
  { name: 'crowdin', re: /crowdin/i },
  { name: 'lokalise', re: /lokalise/i },
  { name: 'phrase', re: /phrase(app)?\.com|\.phrase/i },
  { name: 'locize', re: /locize/i },
];

// Files that load the catalog at runtime (where a remote source would be fetched)
const LOADER_RE = /getRequestConfig\(|i18next-http-backend|i18next-resources-to-backend|i18next-locize-backend|\bcreateI18n\(|setLocaleMessage\(|loadLocaleMessages/;
const FETCH_RE = /\bfetch\(|\baxios[.(]|i18next-http-backend|loadPath|i18next-locize-backend/;

const rel = f => path.relative('.', f) || '.';

function readPackageJson() {
  try { return JSON.parse(readFileSafe('package.json') || 'null'); } catch { return null; }
}

function detectCasing(str) {
  if (/^[a-z][a-zA-Z0-9]*$/.test(str)) return 'camelCase';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(str)) return /^[A-Z0-9]+$/.test(str) && str.length > 1 ? 'UPPER_CASE' : 'PascalCase';
  if (/^[a-z][a-z0-9_]*$/.test(str)) return 'snake_case';
  if (/^[a-z][a-z0-9-]*$/.test(str)) return 'kebab-case';
  if (/^[A-Z][A-Z0-9_]*$/.test(str)) return 'UPPER_SNAKE_CASE';
  return 'unknown';
}

function dominant(values) {
  if (values.length === 0) return { value: 'unknown', rate: 0, counts: {} };
  const counts = values.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const [value, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { value, rate: n / values.length, counts };
}

const confidenceOf = rate => (rate >= 0.8 ? 'high' : rate >= 0.6 ? 'medium' : 'low');

/**
 * Resolves the target literally (brackets and parentheses are not globs). When
 * the path does not exist — e.g. the shell or the argument parser dropped
 * `[locale]/(group)` — it looks for source paths ending with what is left.
 */
function resolveTarget(raw, sourceFiles) {
  if (!raw) return null;
  const cleaned = raw.replace(/^['"]|['"]$/g, '');
  if (fs.existsSync(cleaned)) return { input: raw, path: path.normalize(cleaned), resolved: 'exact' };
  const tail = path.normalize(cleaned).replace(/^[./\\]+/, '').replace(/[/\\]+$/, '');
  if (!tail) return { input: raw, path: null, resolved: 'not-found' };
  const dirs = new Set();
  for (const file of sourceFiles) {
    const relFile = rel(file);
    if (relFile === tail || relFile.endsWith(`${path.sep}${tail}`)) dirs.add(relFile);
    let dir = path.dirname(relFile);
    while (dir && dir !== '.') {
      if (dir === tail || dir.endsWith(`${path.sep}${tail}`)) dirs.add(dir);
      dir = path.dirname(dir);
    }
  }
  const candidates = [...dirs];
  if (candidates.length === 1) return { input: raw, path: candidates[0], resolved: 'suffix-match' };
  // A mangled argument lost its [dynamic] or (group) segments: prefer the one candidate that has them
  const routed = candidates.filter(c => /[[(]/.test(c));
  if (routed.length === 1) return { input: raw, path: routed[0], resolved: 'suffix-match', candidates };
  return { input: raw, path: null, resolved: candidates.length ? 'ambiguous' : 'not-found', candidates: candidates.slice(0, 5) };
}

function isUnder(file, target) {
  const r = path.relative(target, file);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

function findConfigFiles(sourceFiles) {
  const roots = fs.readdirSync('.').filter(f => CONFIG_PREFIXES.some(p => f.startsWith(p)));
  const nested = sourceFiles.filter(f => CONFIG_PREFIXES.some(p => path.basename(f).startsWith(p)));
  return [...new Set([...roots, ...nested.map(rel)])];
}

/** Resolves `./x` / `../x` / `@/x` imports of a file to existing source files. */
function localImports(file, content) {
  const out = [];
  const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(content))) {
    const spec = m[1] || m[2];
    let base = null;
    if (spec.startsWith('.')) base = path.join(path.dirname(file), spec);
    else if (spec.startsWith('@/')) base = path.join(fs.existsSync('src') ? 'src' : '.', spec.slice(2));
    if (!base) continue;
    for (const candidate of [base, ...['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'].map(e => base + e)]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { out.push(candidate); break; }
    }
  }
  return out;
}

// ============================================================================
// STACK (quick + deep)
// ============================================================================

function detectLibrary(i18nFiles) {
  const scores = {};
  for (const file of i18nFiles) {
    const content = readFileSafe(file);
    if (!content) continue;
    for (const lib of LIBRARY_PATTERNS) {
      if (lib.patterns.some(p => p.test(content))) scores[lib.name] = (scores[lib.name] || 0) + 1;
    }
  }
  const pkg = readPackageJson();
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  for (const lib of LIBRARY_PATTERNS) {
    if (deps[lib.dep]) scores[lib.name] = (scores[lib.name] || 0) + 3;
  }
  // next-intl and react-i18next imply the generic patterns of their base libraries
  if (scores['next-intl'] && scores['react-i18next'] && !deps['react-i18next']) delete scores['react-i18next'];
  let best = null;
  let bestScore = 0;
  for (const [name, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = name; }
  }
  return { name: best || 'unknown', score: bestScore };
}

/**
 * Storage type:
 *   local          translation files are bundled from the repo
 *   remote         the runtime loader fetches translations over the network
 *   remote-mirror  remote, plus local files in the repo (fallback or files
 *                  prepared for upload) — validate the local ones
 *   unknown
 * Only files that actually load the catalog (and what they import) count, so
 * an unused remote helper does not turn a local project into a remote one.
 */
function detectStorage(sourceFiles, translationEntries, conventions) {
  const loaders = sourceFiles.filter(f => LOADER_RE.test(readFileSafe(f) || ''));
  const inspected = new Set();
  let fetches = false;
  let provider = null;
  const evidence = [];
  for (const loader of loaders) {
    const content = readFileSafe(loader) || '';
    for (const file of [loader, ...localImports(loader, content)]) {
      if (inspected.has(file)) continue;
      inspected.add(file);
      const text = readFileSafe(file) || '';
      if (FETCH_RE.test(text)) {
        fetches = true;
        evidence.push(rel(file));
        const p = REMOTE_PROVIDERS.find(rp => rp.re.test(text));
        if (p && !provider) provider = p.name;
      }
    }
  }
  for (const config of findConfigFiles(sourceFiles)) {
    const p = REMOTE_PROVIDERS.find(rp => rp.re.test(path.basename(config)) || rp.re.test(readFileSafe(config) || ''));
    if (p) { provider = provider || p.name; evidence.push(config); }
  }
  const remote = fetches || Boolean(provider);
  const hasLocal = translationEntries.length > 0;
  let type = remote ? (hasLocal ? 'remote-mirror' : 'remote') : hasLocal ? 'local' : 'unknown';
  let source = 'detected';

  const fields = conventions ? conventions.fields : {};
  if (fields.storage) {
    type = fields.storage === 'remote' && fields['local-mirror'] ? 'remote-mirror' : fields.storage;
    provider = fields['remote-provider'] || provider;
    source = 'conventions-file';
  }
  const mirror = fields['local-mirror'] || null;
  return {
    type,
    provider: provider || (remote ? 'http' : null),
    localMirror: type === 'remote-mirror' ? mirror || pickMirror(translationEntries) : null,
    loaders: loaders.map(rel),
    evidence,
    source,
    workflow: type === 'local' ? 'direct-file-edit' : type === 'remote-mirror' ? 'edit-local-mirror → validate → user publishes' : type === 'remote' ? 'generate-json → user uploads' : 'unknown',
    confidence: source === 'conventions-file' ? 'high' : type === 'unknown' ? 'low' : loaders.length ? 'high' : 'medium',
  };
}

/** The local folder that mirrors the remote files: the module-per-file layout when present. */
function pickMirror(entries) {
  const layouts = summarizeTranslationFiles(entries).layouts.sort((a, b) => b.files - a.files);
  const moduleDir = layouts.find(l => l.layout === 'module-dir');
  return (moduleDir || layouts[0] || {}).root || null;
}

function describeConventions(conventions) {
  if (!conventions) return null;
  return {
    path: conventions.path,
    skipDiscovery: conventions.fields['skip-discovery'] === 'true',
    storage: conventions.fields.storage || null,
    localMirror: conventions.fields['local-mirror'] || null,
  };
}

// ============================================================================
// QUICK MODE
// ============================================================================

function runQuickDetection() {
  const sourceFiles = findSourceFiles('.');
  const i18nFiles = sourceFiles.filter(f => I18N_USAGE.test(readFileSafe(f) || ''));
  const library = detectLibrary(i18nFiles);
  const entries = findTranslationFiles();
  const summary = summarizeTranslationFiles(entries);
  const conventions = readConventionsFile();
  const storage = detectStorage(sourceFiles, entries, conventions);
  const target = resolveTarget(options.target, sourceFiles);

  const result = {
    lib: library.name,
    conf: library.score >= 5 ? 'high' : library.score >= 2 ? 'medium' : library.score >= 1 ? 'low' : 'none',
    files: (target && target.path ? i18nFiles.filter(f => isUnder(f, target.path)) : i18nFiles).slice(0, 3).map(rel),
    locales: summary.locales,
    layouts: summary.layouts.map(l => `${l.layout}:${l.root}${l.modules ? ` (${l.modules} modules)` : ''}`),
    storage: storage.type,
    conventions: describeConventions(conventions),
    hasI18n: library.score >= 1,
  };
  if (storage.provider) result.provider = storage.provider;
  if (target) result.target = target;
  return result;
}

// ============================================================================
// DEEP MODE
// ============================================================================

/** Full keys used in code (`namespace.key`), following each translator variable. */
function collectUsedKeys(files) {
  const fullKeys = [];
  const namespaces = [];
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    const vars = findTranslatorVars(content);
    const names = Object.keys(vars);
    for (const name of names) {
      if (vars[name]) namespaces.push(vars[name]);
      const call = new RegExp(`\\b${name}(?:\\.(?:rich|markup|raw|has))?\\(\\s*(['"\`])([^'"\`$]+)\\1`, 'g');
      let m;
      while ((m = call.exec(content))) fullKeys.push(vars[name] ? `${vars[name]}.${m[2]}` : m[2]);
    }
    // A translator received as a parameter has no known namespace: its keys would skew the depth
    if (names.length === 0 && findTranslatorParams(content).length === 0) {
      const plain = /(?:\$t|\bt|i18n\.t)\(\s*(['"`])([^'"`$]+)\1/g;
      let m;
      while ((m = plain.exec(content))) fullKeys.push(m[2]);
    }
  }
  return { fullKeys, namespaces };
}

function detectNamespace(files) {
  const { fullKeys, namespaces } = collectUsedKeys(files);
  if (fullKeys.length === 0 && namespaces.length === 0) {
    return { pattern: 'unknown', separator: 'unknown', depth: 0, rootCasing: 'unknown', casing: 'unknown', confidence: 'low', examples: [] };
  }
  const keys = fullKeys.length ? fullKeys : namespaces;
  const separator = keys.filter(k => k.includes(':')).length > keys.length / 2 ? 'colon' : 'dot';
  const split = k => k.split(/[.:]/);
  const depths = keys.map(k => split(k).length);
  const depth = Math.round(depths.reduce((a, b) => a + b, 0) / depths.length);
  const leaf = dominant(keys.map(k => detectCasing(split(k).pop())));
  const root = dominant(keys.filter(k => split(k).length > 1).map(k => detectCasing(split(k)[0])));
  const pattern = depth <= 1 ? 'flat' : depth === 2 ? 'namespace.key' : 'Namespace.Section.key';
  return {
    pattern,
    separator,
    depth,
    maxDepth: Math.max(...depths),
    rootCasing: root.value,
    casing: leaf.value,
    confidence: confidenceOf(leaf.rate),
    namespaces: [...new Set(namespaces)].slice(0, 8),
    examples: [...new Set(keys)].sort((a, b) => split(b).length - split(a).length).slice(0, 5),
  };
}

/**
 * How components get translators: calling the hook, receiving a translator as
 * a parameter/prop (column factories, schema factories, helpers), or passing
 * one along.
 */
function detectHookUsage(files) {
  let direct = 0, receives = 0, passes = 0;
  const examples = { direct: [], receives: [], passes: [] };
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    const vars = findTranslatorVars(content);
    const params = findTranslatorParams(content, vars);
    const passed = findPassedTranslators(content, vars);
    if (Object.keys(vars).length) { direct++; if (examples.direct.length < 3) examples.direct.push(path.basename(file)); }
    if (params.length) { receives++; if (examples.receives.length < 3) examples.receives.push(`${path.basename(file)} (${params.join(', ')})`); }
    if (passed.length) { passes++; if (examples.passes.length < 3) examples.passes.push(`${path.basename(file)} (${passed.join(', ')})`); }
  }
  if (direct + receives === 0) return { primary: 'unknown', subComponents: 'unknown', confidence: 'low', stats: { direct: 0, receivesT: 0, passesT: 0 } };
  const primary = direct >= receives ? 'direct' : 'prop-drilling';
  return {
    primary,
    subComponents: receives > 0 ? 'direct + translators passed to helpers/factories' : 'direct',
    confidence: confidenceOf(Math.max(direct, receives) / (direct + receives)),
    stats: { direct, receivesT: receives, passesT: passes },
    examples,
  };
}

/**
 * Zod schemas: factories that receive a translator (`createXSchema(t)`),
 * schemas with fixed messages (candidates to migrate — only if the message
 * reaches the screen) and schemas without messages.
 */
function detectSchemas(files) {
  const factories = [];
  const fixedMessages = [];
  let withoutMessages = 0;
  let zodFiles = 0;
  const factoryRe = /(?:const|function)\s+(\w*Schema\w*)\s*=?\s*(?:async\s*)?\(\s*(?:t|t[A-Z]\w*)\s*[:,)]/g;
  const fixedRe = /\.(?:min|max|length|email|url|regex|refine|superRefine|nonempty|int|positive|nonnegative|uuid|startsWith|endsWith)\([^()]*?['"`][^'"`]{3,}['"`]|\b(?:message|error|required_error|invalid_type_error)\s*:\s*['"`][^'"`]{3,}/;
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content || !/\bz\.(?:object|string|number|enum|array)\(/.test(content)) continue;
    zodFiles++;
    let m;
    let isFactory = false;
    factoryRe.lastIndex = 0;
    while ((m = factoryRe.exec(content))) { factories.push(m[1]); isFactory = true; }
    if (fixedRe.test(content)) fixedMessages.push(rel(file));
    else if (!isFactory) withoutMessages++;
  }
  if (zodFiles === 0) return { detected: false, confidence: 'high' };
  return {
    detected: true,
    library: 'zod',
    pattern: factories.length ? 'factory-function' : fixedMessages.length ? 'fixed-messages' : 'no-messages',
    factories: [...new Set(factories)].slice(0, 5),
    toMigrate: fixedMessages.slice(0, 10),
    stats: { files: zodFiles, factories: factories.length, fixedMessages: fixedMessages.length, withoutMessages },
    confidence: 'high',
    note: fixedMessages.length ? 'Fixed messages are candidates for createXSchema(t) only if they reach the screen' : undefined,
  };
}

function detectKeyNaming(entries) {
  const json = entries.filter(e => e.file.endsWith('.json'));
  if (json.length === 0) return { casing: 'unknown', rootCasing: 'unknown', confidence: 'low' };
  const byLocale = json.reduce((acc, e) => { (acc[e.locale] = acc[e.locale] || []).push(e); return acc; }, {});
  const [, sample] = Object.entries(byLocale).sort((a, b) => b[1].length - a[1].length)[0];
  const leaves = [];
  const roots = [];
  for (const entry of sample) {
    let parsed;
    try { parsed = JSON.parse(readFileSafe(entry.file)); } catch { continue; }
    for (const key of Object.keys(flattenKeys(parsed))) leaves.push(detectCasing(key.split('.').pop()));
    if (entry.layout !== 'locale-dir') {
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object') roots.push(detectCasing(key));
      }
    }
  }
  const leaf = dominant(leaves);
  const root = dominant(roots);
  const namespaceRoot = sample.some(e => e.layout === 'module-dir') && root.value === 'PascalCase';
  return {
    casing: leaf.value,
    rootCasing: root.value,
    fileRoot: namespaceRoot ? 'namespace' : 'keys',
    confidence: confidenceOf(leaf.rate),
    stats: leaf.counts,
  };
}

function runDeepDetection() {
  const sourceFiles = findSourceFiles('.');
  const target = resolveTarget(options.target, sourceFiles);
  const i18nFiles = sourceFiles.filter(f => I18N_USAGE.test(readFileSafe(f) || ''));
  const warnings = [];

  let sample = [];
  let scope = sourceFiles;
  if (target && target.path) {
    scope = sourceFiles.filter(f => isUnder(f, target.path));
    // Target files that call the hook or receive a translator (column/schema factories, helpers)
    sample = scope.filter(f => {
      const content = readFileSafe(f) || '';
      return I18N_USAGE.test(content) || findTranslatorParams(content).length > 0;
    }).slice(0, 200);
    if (target.resolved === 'suffix-match') warnings.push(`Target "${target.input}" not found as typed; using ${target.path}`);
  } else if (target) {
    warnings.push(`Target "${target.input}" ${target.resolved}${target.candidates ? `: ${target.candidates.join(', ')}` : ''} — sampling the whole project`);
  }
  if (sample.length < options.files) {
    // Fill the sample with files spread across the project, not the first folder alphabetically
    const rest = i18nFiles.filter(f => !sample.includes(f));
    const step = Math.max(1, Math.floor(rest.length / Math.max(1, options.files - sample.length)));
    for (let i = 0; i < rest.length && sample.length < options.files; i += step) sample.push(rest[i]);
  }
  if (sample.length === 0) { console.error('No files with i18n usage found.'); process.exit(1); }
  console.error(`Analyzing ${sample.length} files${target && target.path ? ` (target: ${target.path})` : ''}...`);

  const entries = findTranslationFiles();
  const summary = summarizeTranslationFiles(entries);
  const conventions = readConventionsFile();
  if (i18nFiles.length && summary.locales.length === 0) warnings.push('i18n is used but no translation files were found locally');
  if (conventions && conventions.fields['skip-discovery'] === 'true') warnings.push(`${CONVENTIONS_PATH} has skip-discovery: true — confirmation and /i18n-analyzer are not needed`);

  return {
    target,
    filesAnalyzed: sample.length,
    locales: summary.locales,
    layouts: summary.layouts,
    conventionsFile: describeConventions(conventions),
    conventions: {
      library: detectLibrary(i18nFiles).name,
      namespace: detectNamespace(sample),
      hookUsage: detectHookUsage(sample),
      storage: detectStorage(sourceFiles, entries, conventions),
      schemas: detectSchemas(scope),
      keyNaming: detectKeyNaming(entries),
    },
    warnings,
  };
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function formatQuickMarkdown(result) {
  return [
    '# i18n Stack Detection', '',
    `## Library: ${result.lib}`,
    `- Confidence: ${result.conf}`,
    '',
    `## Storage: ${result.storage}${result.provider ? ` (${result.provider})` : ''}`,
    `## Locales: ${result.locales.length > 0 ? result.locales.join(', ') : 'None detected'}`,
    ...result.layouts.map(l => `- ${l}`),
    '',
    `## Conventions file: ${result.conventions ? `${result.conventions.path}${result.conventions.skipDiscovery ? ' (skip-discovery)' : ''}` : 'none'}`,
    '',
    `## i18n Files: ${result.files.length}`,
    ...result.files.map(f => `- ${f}`),
  ].join('\n');
}

function formatDeepMarkdown(result) {
  const c = result.conventions;
  const lines = ['# Convention Detection Report', ''];
  if (result.target) lines.push(`Target: ${result.target.path || `not found (${result.target.input})`}`, '');
  lines.push(`Library: ${c.library}`);
  lines.push(`Locales: ${result.locales.join(', ') || 'none'}`);
  result.layouts.forEach(l => lines.push(`- ${l.layout}: ${l.root} (${l.files} files${l.modules ? `, ${l.modules} modules` : ''})`));
  lines.push('');
  const ns = c.namespace;
  lines.push('## Namespace Pattern');
  lines.push(`- Pattern: ${ns.pattern} (separator: ${ns.separator}, depth: ${ns.depth}, max ${ns.maxDepth || ns.depth})`);
  lines.push(`- Casing: ${ns.rootCasing} roots, ${ns.casing} leaves`);
  lines.push(`- Confidence: ${ns.confidence}`);
  if (ns.examples.length > 0) lines.push(`- Examples: ${ns.examples.join(', ')}`);
  lines.push('');
  const hook = c.hookUsage;
  lines.push('## Hook Usage');
  lines.push(`- Primary: ${hook.primary}`);
  lines.push(`- Sub-components: ${hook.subComponents}`);
  lines.push(`- Stats: ${hook.stats.direct} call the hook, ${hook.stats.receivesT} receive a translator, ${hook.stats.passesT} pass one along`);
  if (hook.examples && hook.examples.receives.length) lines.push(`- Receive: ${hook.examples.receives.join(', ')}`);
  lines.push('');
  const storage = c.storage;
  lines.push('## Storage');
  lines.push(`- Type: ${storage.type}${storage.provider ? ` (${storage.provider})` : ''} [${storage.source}]`);
  if (storage.localMirror) lines.push(`- Local mirror (validated): ${storage.localMirror}`);
  if (storage.evidence.length) lines.push(`- Evidence: ${storage.evidence.join(', ')}`);
  lines.push(`- Workflow: ${storage.workflow}`);
  lines.push('');
  const schema = c.schemas;
  lines.push('## Schema Integration');
  if (schema.detected) {
    lines.push(`- ${schema.library}: ${schema.pattern} (${schema.stats.files} files, ${schema.stats.factories} factories, ${schema.stats.fixedMessages} with fixed messages)`);
    if (schema.factories.length) lines.push(`- Factories: ${schema.factories.join(', ')}`);
    if (schema.toMigrate.length) lines.push(`- Fixed messages: ${schema.toMigrate.join(', ')}`);
    if (schema.note) lines.push(`- Note: ${schema.note}`);
  } else { lines.push('- Not detected'); }
  lines.push('');
  const naming = c.keyNaming;
  lines.push('## Key Naming (translation files)');
  lines.push(`- Leaves: ${naming.casing}; roots: ${naming.rootCasing}${naming.fileRoot ? `; file root: ${naming.fileRoot}` : ''}`);
  lines.push(`- Confidence: ${naming.confidence}`);
  lines.push('');
  if (result.conventionsFile) lines.push(`Conventions file: ${result.conventionsFile.path}`, '');
  if (result.warnings.length > 0) { lines.push('## Warnings'); result.warnings.forEach(w => lines.push(`- ${w}`)); lines.push(''); }
  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  let result;

  if (options.quick) {
    result = runQuickDetection();
  } else {
    result = { version: VERSION, timestamp: new Date().toISOString(), ...runDeepDetection() };
  }

  const output = options.verbose
    ? (options.quick ? formatQuickMarkdown(result) : formatDeepMarkdown(result))
    : JSON.stringify(result, null, 2);

  if (options.output) {
    fs.writeFileSync(options.output, output);
    console.log(`Output saved to ${options.output}`);
  } else {
    console.log(output);
  }
}

main();
