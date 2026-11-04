#!/usr/bin/env node

/**
 * pending-report.js — Report of translations still pending
 *
 * Lists, per translation file, the keys whose value in a target locale is
 * missing, empty or still identical to the source locale (text copied from
 * the source while waiting for translation). The output is a Markdown report
 * someone can translate from — a person, or Claude in Translate mode.
 *
 * A text that is genuinely the same in both languages ("Total", "ID", brand
 * names) shows up too: list such texts with --same to leave them out.
 *
 * Usage:
 *   node pending-report.js --source pt-br
 *   node pending-report.js --source en --targets fr,de --module orders
 *   node pending-report.js --source pt-br --same "ID,Total,OK" --output docs/translations-pending.md
 *
 * Options:
 *   --source <locale>     Locale the others are translated from (required)
 *   --targets <a,b>       Target locales (default: every other locale found)
 *   --dir <dir>           Translation folder (default: the usual ones)
 *   --module <name>       Only this module/file (repeatable)
 *   --same <a,b>          Texts that are the same in every language (not pending)
 *   --output <file>       Write the report to a file instead of stdout
 *
 * Exit codes: 0 = nothing pending, 1 = pending translations, 3 = bad arguments
 */

const fs = require('fs');
const path = require('path');
const { findTranslationFiles, flattenKeys, readFileSafe } = require('./lib/i18n-project');

const argv = process.argv.slice(2);
const opt = { source: null, targets: [], dir: null, modules: [], same: new Set(), output: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--source') opt.source = argv[++i];
  else if (a === '--targets') opt.targets = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--dir') opt.dir = argv[++i];
  else if (a === '--module') opt.modules.push(argv[++i]);
  else if (a === '--same') argv[++i].split(',').forEach(s => opt.same.add(s.trim()));
  else if (a === '--output') opt.output = argv[++i];
  else if (a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
}
if (!opt.source) {
  console.error('Pass --source <locale> (see --help)');
  process.exit(3);
}

const ICU_VAR = /\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*[,}]/gu;
const variables = text => [...new Set([...String(text).matchAll(ICU_VAR)].map(m => m[1]))].sort();
const cell = text => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rel = f => path.relative('.', f);

// Group files by what they translate: same module (module-dir / locale-dir) or the locale file itself (flat)
const entries = findTranslationFiles(opt.dir ? [opt.dir] : undefined).filter(e => e.file.endsWith('.json'));
const groups = new Map();
for (const e of entries) {
  const id = e.layout === 'flat' ? `${rel(e.dir)}` : `${e.layout}:${e.module}`;
  if (opt.modules.length && !opt.modules.includes(e.module)) continue;
  if (!groups.has(id)) groups.set(id, { name: e.module || rel(e.dir), files: {} });
  groups.get(id).files[e.locale] = e.file;
}

const allLocales = [...new Set(entries.map(e => e.locale))].sort();
if (!allLocales.includes(opt.source)) {
  console.error(`Source locale "${opt.source}" not found (found: ${allLocales.join(', ') || 'none'})`);
  process.exit(3);
}
const targets = opt.targets.length ? opt.targets : allLocales.filter(l => l !== opt.source);

const sections = [];
const summary = [];
let pendingTotal = 0;

for (const group of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const sourceFile = group.files[opt.source];
  if (!sourceFile) continue;
  let source;
  try { source = flattenKeys(JSON.parse(readFileSafe(sourceFile))); } catch (e) {
    sections.push(`### \`${rel(sourceFile)}\`\n\n❌ Invalid JSON: ${e.message}\n`);
    continue;
  }
  const sourceCount = Object.keys(source).length;

  for (const locale of targets) {
    const file = group.files[locale];
    const label = file ? rel(file) : `${group.name} (${locale}: file missing)`;
    let target = {};
    if (file) {
      try { target = flattenKeys(JSON.parse(readFileSafe(file))); } catch (e) {
        sections.push(`### \`${label}\`\n\n❌ Invalid JSON: ${e.message}\n`);
        continue;
      }
    }
    const rows = [];
    const problems = [];
    for (const [key, text] of Object.entries(source)) {
      const value = target[key];
      if (value === undefined) rows.push([key, text, 'missing']);
      else if (typeof value === 'string' && value.trim() === '') rows.push([key, text, 'empty']);
      else if (value === text && !opt.same.has(String(text).trim())) rows.push([key, text, 'same as source']);
      else if (variables(value).join() !== variables(text).join()) problems.push(`\`${key}\`: variables {${variables(value).join(', ')}} ≠ source {${variables(text).join(', ')}}`);
    }
    const extra = Object.keys(target).filter(k => !(k in source));
    for (const k of extra) problems.push(`\`${k}\`: not in the source locale`);

    summary.push(`| \`${label}\` | ${rows.length} | ${sourceCount} | ${problems.length} |`);
    pendingTotal += rows.length;
    if (!rows.length && !problems.length) continue;

    const lines = [`### \`${label}\` — ${rows.length} to translate`, ''];
    if (rows.length) {
      lines.push(`| Key | ${opt.source} (reference) | Status |`, '|---|---|---|');
      for (const [key, text, status] of rows) lines.push(`| \`${key}\` | ${cell(text)} | ${status} |`);
      lines.push('');
    }
    if (problems.length) {
      lines.push('Also check:', ...problems.map(p => `- ${p}`), '');
    }
    sections.push(lines.join('\n'));
  }
}

const today = new Date().toISOString().slice(0, 10);
const report = [
  '# Pending Translations',
  '',
  `Generated on ${today} from the \`${opt.source}\` files. Lists, per file, the keys that are missing, empty or still identical to \`${opt.source}\` in ${targets.map(t => `\`${t}\``).join(', ')}.`,
  '',
  '## Instructions',
  '',
  `1. **Edit only the target files.** The \`${opt.source}\` file is the reference and does not change.`,
  '2. **Only values change.** Do not rename, add or remove keys; keep the order, nesting and indentation.',
  '3. **Variables and ICU:** keep `{name}`, `{count}` and the plural/select syntax exactly; translate only the text inside the options. `#` stays.',
  '4. **Do not translate** brand and product names, or the native names of languages.',
  '5. **Tone:** short, interface style; follow what is already translated in the same file.',
  '6. **Check before publishing:** each file keeps the same number of keys as the source and the same variables; valid JSON (`validate-keys.js`, and `pending-report.js` again).',
  '7. **Genuinely identical texts** (e.g. "ID", "Total") can stay; pass them with `--same` next time so they leave the report.',
  '',
  '## Summary',
  '',
  '| File | To translate | Keys in source | Other issues |',
  '|---|---|---|---|',
  ...summary,
  '',
  ...(sections.length ? ['## Details', '', ...sections] : ['Nothing pending.']),
].join('\n');

if (opt.output) {
  fs.writeFileSync(opt.output, `${report}\n`);
  console.log(`Report saved to ${opt.output} (${pendingTotal} pending)`);
} else {
  console.log(report);
}
process.exit(pendingTotal > 0 ? 1 : 0);
