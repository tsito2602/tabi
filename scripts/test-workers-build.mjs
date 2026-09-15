import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { configuration, release, verifyDatabase, verifyHttp } from './workers-build.mjs';

const templates = Object.fromEntries(['staging', 'production'].map(target => [target, JSON.parse(readFileSync(new URL(`../wrangler.${target}.jsonc`, import.meta.url), 'utf8'))]));
const base = {
  WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging', WORKERS_CI_COMMIT_SHA: 'a'.repeat(40),
  SKIP_DEPENDENCY_INSTALL: '1', CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'test-token-not-a-secret', D1_DATABASE_ID: '00000000-0000-0000-0000-000000000001',
  GOOGLE_CLIENT_IDS: 'test.apps.googleusercontent.com', EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'test.apps.googleusercontent.com',
};
const settings = (overrides = {}, checkOnly = false) => configuration('staging', { ...base, ...overrides }, templates.staging, checkOnly);
function harness({ fail, preflightError, verifyError } = {}) {
  const events = [], commands = [];
  return { events, commands, adapters: {
    preflight: async () => { events.push('preflight'); if (preflightError) throw new Error('preflight'); },
    run: (program, args, env) => { const label = `${program} ${args.join(' ')}`; events.push(label); commands.push({ program, args, env }); if (label.includes(fail ?? '\0')) throw new Error('command failed'); },
    clean: () => events.push('clean'), write: () => events.push('config'),
    verify: async () => { events.push('verify'); if (verifyError) throw new Error('HTTP verification failed'); },
  } };
}

test('environment bindings and OAuth origins remain separated', () => {
  for (const [target, branch, name, bucket] of [['staging', 'staging', 'tabi-staging', 'tabi-documents-staging'], ['production', 'main', 'tabi', 'tabi-documents']]) {
    const s = configuration(target, { ...base, WORKERS_CI_BRANCH: branch }, templates[target]);
    assert.equal(s.config.name, name);
    assert.equal(s.config.d1_databases[0].database_name, name);
    assert.equal(s.config.r2_buckets[0].bucket_name, bucket);
    assert.equal(s.config.vars.ALLOWED_ORIGINS, s.env.EXPO_PUBLIC_API_URL);
    assert.equal(s.env.EXPO_PUBLIC_ENABLE_DEMO, target === 'staging' ? 'true' : 'false');
    assert.equal(s.config.d1_databases[0].database_id, base.D1_DATABASE_ID);
    assert(!JSON.stringify(s.config).includes(base.CLOUDFLARE_API_TOKEN));
  }
  assert.equal(templates.staging.d1_databases[0].database_id, '__D1_DATABASE_ID__', 'never modify the source template');
});

test('configuration errors fail before dependency installation', () => {
  for (const key of ['WORKERS_CI_BRANCH', 'WORKERS_CI_COMMIT_SHA', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'D1_DATABASE_ID', 'GOOGLE_CLIENT_IDS', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID']) {
    assert.throws(() => settings({ [key]: '' }), new RegExp(key));
  }
  for (const overrides of [
    { WORKERS_CI: '0' }, { WORKERS_CI_BRANCH: 'main' }, { WORKERS_CI_BRANCH: 'feat/change' },
    { WORKERS_CI_COMMIT_SHA: 'bad' }, { CLOUDFLARE_ACCOUNT_ID: 'bad' }, { D1_DATABASE_ID: 'bad' },
    { SKIP_DEPENDENCY_INSTALL: 'false' }, { EXPO_PUBLIC_ENABLE_DEMO: 'false' },
    { EXPO_PUBLIC_API_URL: 'https://tabi.tsito-apps.workers.dev' }, { ALLOWED_ORIGINS: '*' },
    { GOOGLE_CLIENT_IDS: 'other.apps.googleusercontent.com' }, { GOOGLE_CLIENT_IDS: 'test.apps.googleusercontent.com,invalid' },
  ]) assert.throws(() => settings(overrides));
  assert.throws(() => configuration('other', base, templates.staging));
  assert.throws(() => configuration('staging', base, templates.production));
  assert.throws(() => configuration('staging', base, { ...templates.staging, build: { command: 'npm run build:web' } }));
  assert.throws(() => configuration('staging', base, { ...templates.staging, account_id: '__UNRESOLVED__' }));
  assert.equal(settings({ NODE_ENV: 'production' }).env.NODE_ENV, undefined);
});

test('exactly one install, complete check and deploy, with checks before writes', async () => {
  const h = harness(); await release(settings(), h.adapters);
  assert.deepEqual(h.events, [
    'preflight', 'node --test scripts/test-workers-build.mjs', 'npm ci --include=dev --prefer-offline --no-audit --no-fund',
    'clean', 'npm run check', 'config',
    'npx --no-install wrangler d1 execute DB --remote --config .wrangler.generated.jsonc --file worker/schema.sql',
    'npx --no-install wrangler deploy --config .wrangler.generated.jsonc --keep-vars', 'verify',
  ]);
  assert(!h.events.some(e => /build:web|d1 create|d1 list|r2 bucket create/.test(e)));
  assert(h.commands.every(c => c.env.EXPO_PUBLIC_ENABLE_DEMO === 'true'));
});

test('preflight, test, installation and check failures cannot write remotely', async () => {
  for (const failure of [{ preflightError: true }, { fail: 'node --test' }, { fail: 'npm ci' }, { fail: 'npm run check' }]) {
    const h = harness(failure); await assert.rejects(release(settings(), h.adapters));
    assert(!h.events.some(e => /wrangler|config|verify/.test(e)));
  }
});

test('failed schema/deploy/HTTP checks are surfaced without automated retries', async () => {
  const schema = harness({ fail: 'd1 execute' });
  await assert.rejects(release(settings(), schema.adapters));
  assert(!schema.events.some(e => e.includes('wrangler deploy')));
  const deploy = harness({ fail: 'wrangler deploy' });
  await assert.rejects(release(settings(), deploy.adapters));
  assert(!deploy.events.includes('verify'));
  const http = harness({ verifyError: true });
  await assert.rejects(release(settings(), http.adapters));
  assert.equal(http.events.filter(e => e.includes('wrangler deploy')).length, 1);
});

test('explicit bootstrap check-only may check a feature branch but cannot deploy', async () => {
  const h = harness(); await release(settings({ WORKERS_CI_BRANCH: 'ci/issue-152-workers-builds' }, true), h.adapters);
  assert(h.events.includes('npm run check'));
  assert(!h.events.some(e => /wrangler|config|verify/.test(e)));
  assert.throws(() => settings({ WORKERS_CI_BRANCH: 'ci/issue-152-workers-builds' }));
});

test('D1 preflight confirms the environment name and fails closed on API errors', async () => {
  let calls = 0;
  const s = settings();
  await verifyDatabase(s, async (url, options) => {
    calls++;
    assert(url.endsWith(`/d1/database/${base.D1_DATABASE_ID}`));
    assert.equal(options.headers.Authorization, `Bearer ${base.CLOUDFLARE_API_TOKEN}`);
    return Response.json({ success: true, result: { name: 'tabi-staging' } });
  });
  assert.equal(calls, 1);
  await assert.rejects(verifyDatabase(s, async () => Response.json({ success: true, result: { name: 'tabi' } })), /selected environment/);
  await assert.rejects(verifyDatabase(s, async () => new Response('', { status: 403 })), /D1 permission/);
  await assert.rejects(verifyDatabase(s, async () => Response.json({ success: false })), /selected environment/);
});

test('HTTP verification requires HTML, API 401 JSON and a JavaScript service worker', async () => {
  const paths = [];
  await verifyHttp(settings().origin, base.WORKERS_CI_COMMIT_SHA, async (url, options) => {
    paths.push(url.pathname); assert.equal(url.searchParams.get('deploy'), base.WORKERS_CI_COMMIT_SHA); assert.equal(options.redirect, 'error');
    if (url.pathname === '/v1/me') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return new Response('body', { headers: { 'content-type': url.pathname === '/' ? 'text/html' : 'application/javascript' } });
  });
  assert.deepEqual(paths, ['/', '/v1/me', '/sw.js']);
  await assert.rejects(verifyHttp(settings().origin, base.WORKERS_CI_COMMIT_SHA, async () => new Response('', { status: 500 })), /HTTP verification failed/);
});
