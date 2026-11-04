#!/usr/bin/env node

/**
 * remote-check.js — Keep a remote catalog (bucket, CDN) in step with its local mirror
 *
 * For projects whose translations are fetched at runtime, one file per module
 * and locale (`<module>/<locale>.json`, namespace as the JSON root), with a
 * local mirror in the repo (e.g. `messages/features/<module>/<locale>.json`)
 * that the user publishes.
 *
 * Two checks:
 *   --since <git-ref>   What to republish: mirror files changed since the ref,
 *                       keys added/removed/changed per file, and keys that moved
 *                       from one module to another (both modules need publishing)
 *   --compare           Fetch each published file and compare it with the mirror:
 *                       missing files, keys only on one side, different texts,
 *                       invalid JSON; with a listing (GCS/S3), modules published
 *                       but absent locally
 *
 * Configuration (CLI flags override `.claude/polyglot-conventions.md`):
 *   --mirror <dir>      local-mirror:  messages/features
 *   --url <base>        remote-url:    https://storage.googleapis.com/my-bucket
 *   --path <pattern>    remote-path:   app/features/{module}/{locale}.json
 *
 * Usage:
 *   node remote-check.js --since main
 *   node remote-check.js --since HEAD~3 --module orders
 *   node remote-check.js --compare
 *   node remote-check.js --compare --module orders --locale pt-br
 *
 * Exit codes: 0 = in sync / nothing to publish, 1 = differences found, 3 = configuration missing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { flattenKeys, readConventionsFile, findTranslationFiles } = require('./lib/i18n-project');

const argv = process.argv.slice(2);
const opt = { since: null, compare: false, mirror: null, url: null, path: null, modules: [], locales: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--since') opt.since = argv[++i];
  else if (a === '--compare') opt.compare = true;
  else if (a === '--mirror') opt.mirror = argv[++i];
  else if (a === '--url') opt.url = argv[++i];
  else if (a === '--path') opt.path = argv[++i];
  else if (a === '--module') opt.modules.push(argv[++i]);
  else if (a === '--locale') opt.locales.push(argv[++i]);
  else if (a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
}

const fields = (readConventionsFile() || { fields: {} }).fields;
opt.mirror = opt.mirror || fields['local-mirror'] || null;
opt.url = (opt.url || fields['remote-url'] || '').replace(/\/+$/, '');
opt.path = opt.path || fields['remote-path'] || '{module}/{locale}.json';

if (!opt.since && !opt.compare) {
  console.log('Nothing to do: pass --since <git-ref> and/or --compare (see --help)');
  process.exit(3);
}

// ============================================================================
// MIRROR
// ============================================================================

/** Mirror files: [{ module, locale, file }] from the module-per-file layout. */
function mirrorFiles() {
  const dirs = opt.mirror ? [opt.mirror] : undefined;
  const entries = findTranslationFiles(dirs).filter(e => e.layout === 'module-dir' && e.file.endsWith('.json'));
  if (!opt.mirror && entries.length) opt.mirror = path.dirname(path.dirname(entries[0].file));
  return entries
    .filter(e => !opt.modules.length || opt.modules.includes(e.module))
    .filter(e => !opt.locales.length || opt.locales.includes(e.locale))
    .map(e => ({ module: e.module, locale: e.locale, file: e.file }));
}

const parse = text => flattenKeys(JSON.parse(text));
const leaf = key => key.split('.').pop();

// ============================================================================
// --since: what to republish
// ============================================================================

function git(cmd) {
  return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

function showAt(ref, file) {
  try {
    const top = git('rev-parse --show-toplevel').trim();
    const relToTop = path.relative(top, path.resolve(file)).split(path.sep).join('/');
    return git(`show ${ref}:${relToTop}`);
  } catch {
    return null;
  }
}

function checkSince(files) {
  try { git(`rev-parse --verify ${opt.since}`); } catch {
    console.log(`Unknown git ref: ${opt.since}`);
    process.exit(3);
  }
  // Deleted mirror files (a whole module or locale removed) also need attention in the remote
  let deleted = [];
  try {
    deleted = git(`diff --name-only --diff-filter=D ${opt.since} -- ${opt.mirror}`).split('\n').filter(f => f.endsWith('.json'));
  } catch {}

  const changes = [];
  for (const f of files) {
    const before = showAt(opt.since, f.file);
    const now = fs.readFileSync(f.file, 'utf8');
    if (before === now) continue;
    let oldKeys = {};
    let newKeys;
    try { newKeys = parse(now); } catch (e) { changes.push({ ...f, error: e.message }); continue; }
    try { if (before !== null) oldKeys = parse(before); } catch {}
    const added = Object.keys(newKeys).filter(k => !(k in oldKeys));
    const removed = Object.keys(oldKeys).filter(k => !(k in newKeys));
    const changed = Object.keys(newKeys).filter(k => k in oldKeys && oldKeys[k] !== newKeys[k]);
    if (before !== null && !added.length && !removed.length && !changed.length) continue; // formatting only
    changes.push({ ...f, isNew: before === null, added, removed, changed, oldKeys, newKeys });
  }

  // Keys that left one module and arrived in another (same leaf name or same text, same locale)
  const moves = [];
  for (const from of changes.filter(c => c.removed && c.removed.length)) {
    for (const to of changes.filter(c => c.added && c.locale === from.locale && c.module !== from.module)) {
      for (const r of from.removed) {
        const target = to.added.find(a => leaf(a) === leaf(r) || to.newKeys[a] === from.oldKeys[r]);
        if (target) moves.push({ locale: from.locale, from: `${from.module}: ${r}`, to: `${to.module}: ${target}` });
      }
    }
  }

  console.log(`\nChanges in ${opt.mirror} since ${opt.since}\n`);
  if (!changes.length && !deleted.length) {
    console.log('✅ Nothing to republish');
    return false;
  }
  const byModule = {};
  for (const c of changes) (byModule[c.module] = byModule[c.module] || []).push(c);
  for (const [module, list] of Object.entries(byModule).sort()) {
    console.log(`📦 ${module}`);
    for (const c of list.sort((a, b) => a.locale.localeCompare(b.locale))) {
      const target = opt.path.replace('{module}', module).replace('{locale}', c.locale);
      if (c.error) { console.log(`  ${c.locale}: ❌ invalid JSON — ${c.error}`); continue; }
      const counts = c.isNew ? `new file, ${c.added.length} keys` : `+${c.added.length} −${c.removed.length} ~${c.changed.length}`;
      console.log(`  ${c.locale}: ${counts} → publish ${target}`);
      for (const k of c.added.slice(0, 8)) if (!c.isNew) console.log(`      + ${k}`);
      for (const k of c.removed.slice(0, 8)) console.log(`      − ${k}`);
      for (const k of c.changed.slice(0, 8)) console.log(`      ~ ${k}`);
      const hidden = (c.isNew ? 0 : Math.max(0, c.added.length - 8)) + Math.max(0, c.removed.length - 8) + Math.max(0, c.changed.length - 8);
      if (hidden) console.log(`      … ${hidden} more`);
    }
  }
  if (moves.length) {
    console.log('\n🔀 Keys moved between modules — publish both, the receiving module first (published alone, the losing module drops the key before the new one exists):');
    for (const m of moves) console.log(`  ${m.locale}: ${m.from} → ${m.to}`);
  }
  if (deleted.length) {
    console.log('\n🗑  Deleted from the mirror — remove from the remote too, if it was published:');
    deleted.forEach(d => console.log(`  ${d}`));
  }
  return true;
}

// ============================================================================
// --compare: remote vs mirror
// ============================================================================

async function fetchText(url) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  return { status: res.status, text: res.ok ? await res.text() : null };
}

/** Modules published under the path prefix, from a GCS/S3 XML listing (null if unavailable). */
async function listRemoteModules() {
  const prefix = opt.path.split('{module}')[0];
  try {
    const { status, text } = await fetchText(`${opt.url}/?prefix=${encodeURIComponent(prefix)}`);
    if (status !== 200 || !text || !text.includes('<Key>')) return null;
    const modules = new Map();
    const tail = opt.path.split('{module}')[1] || '';
    for (const [, key] of text.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      if (!key.startsWith(prefix) || !key.endsWith('.json')) continue;
      const parts = key.slice(prefix.length).split('/');
      if (parts.length !== tail.split('/').length) continue;
      const module = parts[0];
      const locale = parts[parts.length - 1].replace(/\.json$/, '');
      if (!modules.has(module)) modules.set(module, new Set());
      modules.get(module).add(locale);
    }
    return modules;
  } catch {
    return null;
  }
}

async function checkCompare(files) {
  if (!opt.url) {
    console.log('No remote URL: pass --url <base> or set remote-url in .claude/polyglot-conventions.md');
    process.exit(3);
  }
  console.log(`\nRemote ${opt.url}/${opt.path} vs ${opt.mirror}\n`);
  let differences = false;
  const results = await Promise.all(files.map(async f => {
    const url = `${opt.url}/${opt.path.replace('{module}', f.module).replace('{locale}', f.locale)}`;
    try { return { ...f, url, ...(await fetchText(url)) }; } catch (e) { return { ...f, url, status: 0, error: e.message }; }
  }));

  for (const r of results.sort((a, b) => `${a.module}/${a.locale}`.localeCompare(`${b.module}/${b.locale}`))) {
    const label = `${r.module}/${r.locale}`;
    if (r.error) { console.log(`❌ ${label}: ${r.error}`); differences = true; continue; }
    if (r.status === 404 || r.status === 403) { console.log(`⬜ ${label}: not published (${r.status})`); differences = true; continue; }
    if (r.status !== 200) { console.log(`❌ ${label}: HTTP ${r.status}`); differences = true; continue; }
    let remote;
    try { remote = parse(r.text); } catch (e) { console.log(`❌ ${label}: remote JSON invalid — ${e.message}`); differences = true; continue; }
    const local = parse(fs.readFileSync(r.file, 'utf8'));
    const onlyLocal = Object.keys(local).filter(k => !(k in remote));
    const onlyRemote = Object.keys(remote).filter(k => !(k in local));
    const different = Object.keys(local).filter(k => k in remote && remote[k] !== local[k]);
    if (!onlyLocal.length && !onlyRemote.length && !different.length) { console.log(`✅ ${label}: identical (${Object.keys(local).length} keys)`); continue; }
    differences = true;
    console.log(`⚠️  ${label}: ${onlyLocal.length} only local, ${onlyRemote.length} only remote, ${different.length} different`);
    for (const k of onlyLocal.slice(0, 5)) console.log(`      local only:  ${k}`);
    for (const k of onlyRemote.slice(0, 5)) console.log(`      remote only: ${k}`);
    for (const k of different.slice(0, 5)) console.log(`      different:   ${k}  (remote "${String(remote[k]).slice(0, 40)}" / local "${String(local[k]).slice(0, 40)}")`);
  }

  const listed = await listRemoteModules();
  if (listed) {
    const localModules = new Set(files.map(f => f.module));
    const extra = [...listed.keys()].filter(m => !localModules.has(m) && (!opt.modules.length || opt.modules.includes(m)));
    if (extra.length) {
      differences = true;
      console.log('\n📦 Published but not in the mirror (another folder name, or a module removed locally):');
      for (const m of extra) console.log(`  ${m}: ${[...listed.get(m)].sort().join(', ')}`);
    }
  } else {
    console.log('\n(No listing available: modules published only in the remote are not checked)');
  }
  return differences;
}

// ============================================================================
// MAIN
// ============================================================================

(async () => {
  const files = mirrorFiles();
  if (!files.length) {
    console.log(`No module files (<module>/<locale>.json) found${opt.mirror ? ` in ${opt.mirror}` : ''}: pass --mirror <dir> or set local-mirror`);
    process.exit(3);
  }
  let pending = false;
  if (opt.since) pending = checkSince(files) || pending;
  if (opt.compare) pending = (await checkCompare(files)) || pending;
  process.exit(pending ? 1 : 0);
})();
