import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const environments = {
  staging: { branch: 'staging', worker: 'tabi-staging', database: 'tabi-staging', bucket: 'tabi-documents-staging' },
  production: { branch: 'main', worker: 'tabi', database: 'tabi', bucket: 'tabi-documents' },
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientId = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const required = (env, key) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required in Workers Builds settings`);
  return value;
};

/** Fail before installation or remote writes on a wrong branch/account/config. */
export function configuration(target, env, template, checkOnly = false) {
  if (!Object.hasOwn(environments, target)) throw new Error('Target must be staging or production');
  const expected = environments[target];
  if (env.WORKERS_CI !== '1') throw new Error('This entry point is for Workers Builds; use npm run check in the work environment');
  const branch = required(env, 'WORKERS_CI_BRANCH');
  if (!checkOnly && branch !== expected.branch) throw new Error(`Refusing ${target} deployment from ${branch}; expected ${expected.branch}`);
  if (!['1', 'true'].includes(env.SKIP_DEPENDENCY_INSTALL)) throw new Error('Set SKIP_DEPENDENCY_INSTALL=1 to avoid installing dependencies twice');
  const commit = required(env, 'WORKERS_CI_COMMIT_SHA');
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('Invalid WORKERS_CI_COMMIT_SHA');
  const account = required(env, 'CLOUDFLARE_ACCOUNT_ID');
  if (!/^[0-9a-f]{32}$/i.test(account)) throw new Error('Invalid CLOUDFLARE_ACCOUNT_ID');
  required(env, 'CLOUDFLARE_API_TOKEN');
  const databaseId = required(env, 'D1_DATABASE_ID');
  if (!uuid.test(databaseId)) throw new Error('D1_DATABASE_ID must be the existing environment database UUID');
  const webClientId = required(env, 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  const audiences = required(env, 'GOOGLE_CLIENT_IDS').split(',').map(value => value.trim());
  if (!clientId.test(webClientId) || audiences.some(value => !clientId.test(value)) || !audiences.includes(webClientId)) {
    throw new Error('GOOGLE_CLIENT_IDS must contain the environment Web Client ID and only valid Client IDs');
  }
  const origin = `https://${expected.worker}.tsito-apps.workers.dev`;
  const publicEnv = {
    EXPO_PUBLIC_API_URL: origin,
    EXPO_PUBLIC_ENABLE_DEMO: target === 'staging' ? 'true' : 'false',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: webClientId,
  };
  for (const [key, value] of Object.entries(publicEnv)) {
    if (env[key] !== undefined && env[key] !== value) throw new Error(`${key} does not match ${target}`);
  }
  if (env.ALLOWED_ORIGINS !== undefined && env.ALLOWED_ORIGINS !== origin) throw new Error(`ALLOWED_ORIGINS does not match ${target}`);
  if (template.name !== expected.worker || template.main !== 'worker/index.ts' || template.assets?.directory !== './dist'
    || template.d1_databases?.length !== 1 || template.d1_databases[0].binding !== 'DB'
    || template.d1_databases[0].database_name !== expected.database
    || template.r2_buckets?.length !== 1 || template.r2_buckets[0].binding !== 'BUCKET'
    || template.r2_buckets[0].bucket_name !== expected.bucket || template.build?.command) {
    throw new Error('Wrangler template has unexpected targets or a duplicate build command');
  }
  const config = structuredClone(template);
  config.d1_databases[0].database_id = databaseId;
  config.vars = { ...config.vars, GOOGLE_CLIENT_IDS: audiences.join(','), ALLOWED_ORIGINS: origin };
  if (/__[A-Z0-9_]+__/.test(JSON.stringify(config))) throw new Error('Unresolved Wrangler template placeholder');
  const childEnv = { ...env, ...publicEnv, GOOGLE_CLIENT_IDS: audiences.join(','), ALLOWED_ORIGINS: origin, CI: 'true', EXPO_NO_DOTENV: '1' };
  // React's tests need the development implementation. Expo export controls its
  // own production bundling; do not let a dashboard NODE_ENV break npm run check.
  delete childEnv.NODE_ENV;
  return { ...expected, target, origin, account, databaseId, commit, config, env: childEnv, checkOnly };
}

function command(program, args, env, timeout) {
  console.log(`[workers-build] ${program} ${args.join(' ')}`);
  const result = spawnSync(program, args, { env, stdio: 'inherit', timeout, killSignal: 'SIGTERM' });
  if (result.error || result.status !== 0) throw new Error(`${program} failed (${result.error?.code ?? result.signal ?? result.status}); deployment stopped`);
}

export async function verifyDatabase(settings, fetcher = fetch) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${settings.account}/d1/database/${settings.databaseId}`;
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${settings.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`D1 preflight returned HTTP ${response.status}; check the build token's D1 permission`);
  const data = await response.json();
  if (!data.success || data.result?.name !== settings.database) throw new Error('D1 database does not belong to the selected environment; no schema or deployment was applied');
}

export async function verifyHttp(origin, commit, fetcher = fetch) {
  for (const [path, expectedStatus, type] of [['/', 200, 'text/html'], ['/v1/me', 401, 'application/json'], ['/sw.js', 200, 'javascript']]) {
    const url = new URL(path, origin);
    url.searchParams.set('deploy', commit);
    const response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (response.status !== expectedStatus || !(response.headers.get('content-type') ?? '').includes(type)) {
      throw new Error(`Deployment completed but HTTP verification failed for ${path} (${response.status}); inspect the deployment before retrying`);
    }
    if (path === '/v1/me' && typeof (await response.json()).error !== 'string') throw new Error('Deployment completed but API routing returned unexpected JSON');
    if (path !== '/v1/me') await response.body?.cancel();
  }
}

/** One build invocation, one installation, one complete check, one deployment. */
export async function release(settings, adapters = {}) {
  const run = adapters.run ?? command;
  const preflight = adapters.preflight ?? verifyDatabase;
  const write = adapters.write ?? ((config) => writeFileSync('.wrangler.generated.jsonc', `${JSON.stringify(config, null, 2)}\n`));
  const clean = adapters.clean ?? (() => rmSync('dist', { recursive: true, force: true }));
  const verify = adapters.verify ?? verifyHttp;
  await preflight(settings);
  run('node', ['--test', 'scripts/test-workers-build.mjs'], settings.env, 60000);
  run('npm', ['ci', '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'], settings.env, 180000);
  clean();
  // Includes the existing Web build. Do not add a second npm run build:web.
  run('npm', ['run', 'check'], settings.env, 480000);
  if (settings.checkOnly) { console.log('[workers-build] Check-only complete; no remote writes or deployment'); return; }
  write(settings.config);
  const configArgs = ['--config', '.wrangler.generated.jsonc'];
  // Preserve the current idempotent schema application; never create replacement
  // databases/buckets during release, and never write remotely before checks pass.
  run('npx', ['--no-install', 'wrangler', 'd1', 'execute', 'DB', '--remote', ...configArgs, '--file', 'worker/schema.sql'], settings.env, 60000);
  run('npx', ['--no-install', 'wrangler', 'deploy', ...configArgs, '--keep-vars'], settings.env, 120000);
  await verify(settings.origin, settings.commit);
  console.log(`[workers-build] Verified ${settings.target} deployment: ${settings.commit}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [target, option, ...extra] = process.argv.slice(2);
    if (!Object.hasOwn(environments, target) || (option && option !== '--check-only') || extra.length) throw new Error('Usage: node scripts/workers-build.mjs staging|production [--check-only]');
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Set NODE_VERSION=24 in Workers Builds');
    const settings = configuration(target, process.env, JSON.parse(readFileSync(`wrangler.${target}.jsonc`, 'utf8')), option === '--check-only');
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (head.status !== 0 || head.stdout.trim() !== settings.commit) throw new Error('Checkout SHA differs from WORKERS_CI_COMMIT_SHA');
    await release(settings);
  } catch (error) {
    console.error(`[workers-build] ${error.message}`);
    process.exitCode = 1;
  }
}
