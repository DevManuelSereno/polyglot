/**
 * Tests for the Node scripts, run against the fixtures:
 *   local-flat     messages/<locale>.json, an unused remote helper (must stay "local")
 *   remote-mirror  App Router target, bucket loader, module-per-file mirror, legacy locale folder
 *
 * Run: node --test scripts/test/
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPTS = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

function run(script, args, cwd) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const json = (script, args, fixture) => JSON.parse(run(script, args, path.join(FIXTURES, fixture)).out.replace(/^Analyzing.*\n/m, ''));

/** A throwaway git repository with a copy of a fixture. */
function gitCopy(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-'));
  fs.cpSync(path.join(FIXTURES, fixture), dir, { recursive: true });
  const git = (...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  return dir;
}

const edit = (file, fn) => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// detect-conventions.js

test('quick: flat layout, unused remote helper stays local', () => {
  const r = json('detect-conventions.js', ['--quick'], 'local-flat');
  assert.equal(r.lib, 'next-intl');
  assert.deepEqual(r.locales, ['en', 'pt-BR']);
  assert.equal(r.storage, 'local');
});

test('quick: locale folders and module folders, remote with a mirror', () => {
  const r = json('detect-conventions.js', ['--quick'], 'remote-mirror');
  assert.deepEqual(r.locales, ['en-us', 'pt-br']);
  assert.equal(r.storage, 'remote-mirror');
  assert.equal(r.provider, 'gcs');
  assert.ok(r.layouts.some(l => l.startsWith('module-dir:messages/features')));
  assert.ok(r.layouts.some(l => l.startsWith('locale-dir:messages')));
});

test('target: App Router path taken literally, mangled path resolved by suffix', () => {
  const exact = json('detect-conventions.js', ['--quick', '--target', 'src/app/[locale]/(dashboard)/orders'], 'remote-mirror');
  assert.equal(exact.target.resolved, 'exact');
  const mangled = json('detect-conventions.js', ['--quick', '/orders'], 'remote-mirror');
  assert.equal(mangled.target.path, path.join('src', 'app', '[locale]', '(dashboard)', 'orders'));
});

test('deep: namespaces, translators received, schema factories and fixed messages', () => {
  const r = json('detect-conventions.js', ['--target', 'src/app/[locale]/(dashboard)/orders'], 'remote-mirror');
  const c = r.conventions;
  assert.equal(c.namespace.rootCasing, 'PascalCase');
  assert.equal(c.namespace.casing, 'camelCase');
  assert.ok(c.hookUsage.stats.receivesT >= 1);
  assert.deepEqual(c.schemas.factories, ['createOrderSchema']);
  assert.equal(c.schemas.stats.fixedMessages, 1);
  assert.equal(c.storage.localMirror, path.join('messages', 'features'));
  assert.equal(c.keyNaming.fileRoot, 'namespace');
});

// validate-keys.js

test('validate: every layout read, passed translators and template keys count as usage', () => {
  const r = run('validate-keys.js', [], path.join(FIXTURES, 'remote-mirror'));
  assert.equal(r.code, 2, r.out); // orphans only
  assert.match(r.out, /Locales: en-us, pt-br \| Files: 6/);
  assert.doesNotMatch(r.out, /ERRORS/);
  assert.doesNotMatch(r.out, /OrdersPage\.(Table|status|Form)/); // tColumns, status.${s}, schema t
  assert.match(r.out, /Orphan: "Common\.save"/);
});

test('validate: flat layout with a directory argument', () => {
  const r = run('validate-keys.js', ['messages'], path.join(FIXTURES, 'local-flat'));
  assert.equal(r.code, 0, r.out);
});

test('validate --hook: only changed files, errors only, exit 2', () => {
  const dir = gitCopy('remote-mirror');
  assert.equal(run('validate-keys.js', ['--hook'], dir).code, 0);
  edit(path.join(dir, 'messages/features/orders/pt-br.json'), d => { d.OrdersPage.extra = 'x'; });
  const r = run('validate-keys.js', ['--hook'], dir);
  assert.equal(r.code, 2);
  assert.match(r.out, /en-us: Missing key "OrdersPage\.extra"/);
});

test('validate: ICU arguments compared by name', () => {
  const dir = gitCopy('remote-mirror');
  edit(path.join(dir, 'messages/features/orders/en-us.json'), d => { d.OrdersPage.Form.validation.quantity = 'At most {limit}'; });
  assert.match(run('validate-keys.js', [], dir).out, /ICU arguments differ/);
});

// remote-check.js

test('remote-check --since: changes per module and keys moved between modules', () => {
  const dir = gitCopy('remote-mirror');
  for (const locale of ['en-us', 'pt-br']) {
    let moved;
    edit(path.join(dir, `messages/features/orders/${locale}.json`), d => { moved = d.OrdersPage.Table.Columns.total; delete d.OrdersPage.Table.Columns.total; });
    edit(path.join(dir, `messages/features/common/${locale}.json`), d => { d.Common.total = moved; });
  }
  const r = run('remote-check.js', ['--since', 'HEAD'], dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /orders: OrdersPage\.Table\.Columns\.total → common: Common\.total/);
});

test('remote-check --since: nothing to republish', () => {
  const r = run('remote-check.js', ['--since', 'HEAD'], gitCopy('remote-mirror'));
  assert.equal(r.code, 0);
});

// pending-report.js

test('pending-report: identical, missing, and variable mismatches', () => {
  const dir = gitCopy('remote-mirror');
  edit(path.join(dir, 'messages/features/orders/en-us.json'), d => {
    d.OrdersPage.title = 'Pedidos';
    delete d.OrdersPage.status.closed;
    d.OrdersPage.Form.validation.quantity = 'At most {limit}';
  });
  const r = run('pending-report.js', ['--source', 'pt-br', '--module', 'orders', '--same', 'Total'], dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /`OrdersPage\.title` \| Pedidos \| same as source/);
  assert.match(r.out, /`OrdersPage\.status\.closed` \| Fechado \| missing/);
  assert.match(r.out, /variables \{limit\} ≠ source \{max\}/);
  assert.doesNotMatch(r.out, /Columns\.total/);
});
