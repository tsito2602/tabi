import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
function load(path) {
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => name === './detail-origin.web' ? load('src/utils/detail-origin.web.ts') : {}, module, module.exports);
  return module.exports;
}
const { createDetailMotion, detailPose } = load('src/utils/detail-motion.web.ts');
const flush = () => new Promise(setImmediate);
assert.deepEqual(detailPose({ left: 20, top: 300, width: 350, height: 100 }, { left: 0, top: 100, width: 390, height: 700 }, 12), { transform: 'translate3d(0px, -100px, 0px)', clipPath: 'inset(300px 20px round 12px)', opacity: '1' });
function fixture() {
  const dom = new JSDOM('<!doctype html><style>[data-detail-motion]{transform:none;opacity:1;clip-path:inset(0px)}</style><button id="source"><span data-testid="detail-source-title">美術館</span><span data-testid="detail-source-time">10:00</span></button><div id="viewport"><section id="surface"><div data-testid="form-sheet-fill"><div data-testid="detail-dismiss-handle"></div><h2 data-testid="detail-target-title">美術館</h2><span data-testid="detail-target-time">10:00</span></div></section></div>', { pretendToBeVisual: true });
  const { document: doc } = dom.window;
  dom.window.matchMedia = () => ({ matches: false });
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.isConnected ? [this.getBoundingClientRect()] : []; };
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'source') return rect(20, 300, 350, 100);
    if (this.closest('#source')) return rect(32, 320, 120, 24);
    if (this.id === 'surface') return rect(0, 100, 390, 620);
    if (this.dataset.testid?.startsWith('detail-target')) return rect(24, 200, 330, 38);
    return rect(0, 0, 390, 844);
  };
  const records = [];
  dom.window.HTMLElement.prototype.animate = function (frames, options) {
    let resolve, reject;
    const finished = new Promise((a,b) => { resolve = a; reject = b; });
    const record = { element: this, frames, options, finished, cancel: () => reject(new Error('cancelled')), finish: resolve };
    records.push(record); return record;
  };
  const source = doc.querySelector('#source'), surface = doc.querySelector('#surface'), viewport = doc.querySelector('#viewport');
  const origin = { element: source, rect: source.getBoundingClientRect(), radius: 12, labels: ['title','time'].map((key) => { const label = source.querySelector(`[data-testid="detail-source-${key}"]`); return { key, text: label.textContent, rect: label.getBoundingClientRect(), style: { fontSize: '17px', lineHeight: '24px', color: 'rgb(24, 42, 54)' } }; }) };
  let dismissed = 0;
  const motion = createDetailMotion(surface, viewport, origin, () => dismissed++);
  const finish = async () => { records.forEach((record) => record.finish()); await flush(); };
  return { dom, doc, motion, records, source, surface, finish, dismissed: () => dismissed, close: () => { motion.dispose(); dom.window.close(); } };
}
{
  const f = fixture(); let completed = 0;
  f.motion.setOpen(true, false, () => completed++);
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 2);
  assert.equal(f.records.find((record) => record.element === f.surface).frames[0].opacity, '1', 'the expanding surface stays opaque');
  await f.finish();
  assert.equal(completed, 0);
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 0);
  assert.equal(f.doc.querySelector('h2').style.visibility, '');
  f.motion.setOpen(false, false, () => completed++); await f.finish();
  assert.equal(completed, 1);
  f.close();
}
{
  const f = fixture(); let closed = 0;
  f.motion.setOpen(true, false, () => {});
  const stopClose = f.motion.setOpen(false, false, () => closed++);
  stopClose(); f.motion.setOpen(true, false, () => {}); await f.finish();
  assert.equal(closed, 0, 'an interrupted close cannot remove a reopened dialog');
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 0);
  f.close();
}
{
  const f = fixture(); let closed = 0;
  f.motion.setOpen(true, false, () => {}); await f.finish();
  f.source.remove();
  f.motion.setOpen(false, false, () => closed++);
  assert.equal(f.records.at(-2).frames.at(-1).transform, 'translate3d(0px, 16px, 0px)', 'deleted origin falls back to a short fade, never a stale position');
  await f.finish(); assert.equal(closed, 1); f.close();
}
for (const supported of [true, false]) {
  const f = fixture(); let closed = 0;
  if (!supported) f.surface.animate = undefined;
  f.motion.setOpen(true, supported, () => {});
  f.motion.setOpen(false, supported, () => closed++);
  assert.equal(closed, 1); assert.equal(f.records.length, 0);
  f.close();
}
{
  const f = fixture();
  f.doc.querySelector('h2').textContent = '別の情報';
  f.motion.setOpen(true, false, () => {});
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 1, 'only semantically equal information is shared');
  f.motion.suspend(); await f.finish();
  assert.equal(f.surface.hasAttribute('data-detail-motion'), false);
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 0);
  f.close();
}
console.log('Detail motion: origin geometry, opaque surface, matching labels, completion, interruption, deleted origin, reduced/unsupported motion and cleanup passed.');
