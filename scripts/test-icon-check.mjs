import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildIconCheck } from './build-icon-check.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'tabi-icon-check-'));
try {
  const { base, variants } = await buildIconCheck(root, true);
  const scopes = new Set();
  for (const variant of variants) {
    const scope = `${base}/${variant.key}/`;
    const dir = path.join(root, scope.slice(1));
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.webmanifest'), 'utf8'));
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.equal(manifest.id, scope);
    assert.equal(manifest.start_url, scope);
    assert.equal(manifest.scope, scope);
    assert.ok(html.includes(`rel="apple-touch-icon" href="${manifest.icons[0].src}"`));
    assert.ok(!html.includes('serviceWorker'));
    scopes.add(manifest.id);
  }
  assert.equal(scopes.size, 3);
  assert.deepEqual(await readFile(path.join(root, base, 'a/icon.png')), await readFile('scripts/fixtures/konogoro-touch.png'));
  assert.deepEqual(await readFile(path.join(root, base, 'b/icon.png')), await readFile('public/icons/apple-touch-icon.png'));
  assert.equal((await sharp(path.join(root, base, 'c/icon.png')).stats()).isOpaque, false);
  await buildIconCheck(root, false);
  assert.deepEqual(await readdir(root), []);
  console.log('Icon comparison: isolated identities, original controls, transparent candidate, production cleanup passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
