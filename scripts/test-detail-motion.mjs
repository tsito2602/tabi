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
const { createDetailMotion, detailPose, detailContentBlocks } = load('src/utils/detail-motion.web.ts');
const flush = () => new Promise(setImmediate);
assert.deepEqual(detailPose({ left: 20, top: 300, width: 350, height: 100 }, { left: 0, top: 100, width: 390, height: 700 }, 12), { transform: 'translate3d(0px, -100px, 0px)', clipPath: 'inset(300px 20px round 12px)', opacity: '1' });
function fixture() {
  const dom = new JSDOM('<!doctype html><style>[data-detail-motion]{transform:none;opacity:1;clip-path:inset(0px)}</style><button id="source"><span data-testid="detail-source-title">美術館</span><span data-testid="detail-source-time">10:00</span></button><div id="viewport"><section id="surface"><div data-testid="form-sheet-fill"><div data-testid="detail-dismiss-handle"></div><header data-testid="sheet-header">予定の詳細</header><div data-testid="form-sheet-scroll"><div><div data-testid="itinerary-item-details"><h2 data-testid="detail-target-title">美術館</h2><span data-testid="detail-target-time">10:00</span><section id="note"><p>メモ</p><p>展示を見る</p></section></div></div></div></div></section></div>', { pretendToBeVisual: true });
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
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 0, 'no detached title or time is created');
  const surfaceAnimation = f.records.find(record => record.element === f.surface);
  const sections = f.records.filter(record => record.element !== f.surface);
  assert.equal(sections.length, 4, 'header, title, time and note are semantic blocks');
  assert(sections.every(record => record.options.delay >= surfaceAnimation.options.duration), 'content waits for the surface');
  assert(sections.every(record => record.frames[0].opacity === '0' && record.frames[0].transform.includes('18px')), 'all contents rise from below');
  assert(sections.every(record => record.options.fill === 'both'), 'pending blocks do not flash before their delay');
  assert(sections.every((record, index) => index === 0 || record.options.delay > sections[index - 1].options.delay), 'each item has a distinct entrance');
  assert(!sections.some(record => record.element.tagName === 'P'), 'nested paragraphs do not animate twice');
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
  assert.equal(f.records.filter(record => record.element === f.surface).at(-1).frames.at(-1).transform, 'translate3d(0px, 16px, 0px)', 'deleted origin falls back to a short fade, never a stale position');
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
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 0, 'text matching no longer controls the animation');
  f.motion.suspend(); await f.finish();
  assert.equal(f.surface.hasAttribute('data-detail-motion'), false);
  assert.equal(f.doc.querySelectorAll('.detail-motion-label').length, 0);
  f.close();
}
{
  const f = fixture();
  const body = f.doc.querySelector('[data-testid="itinerary-item-details"]');
  for (let i = 0; i < 30; i++) { const section = f.doc.createElement('section'); section.textContent = String(i); body.append(section); }
  f.motion.setOpen(true, false, () => {});
  assert.equal(detailContentBlocks(f.doc.querySelector('[data-testid="form-sheet-fill"]')).length, 34);
  const blocks = f.records.filter(record => record.element !== f.surface);
  const delays = blocks.map(record => record.options.delay);
  assert(Math.max(...delays) <= 700, 'a long detail cannot queue seconds of delay');
  assert.equal(new Set(delays).size, blocks.length, 'long details do not collapse the later items into one simultaneous entrance');
  assert(delays.every((delay, index) => index === 0 || delay > delays[index - 1]), 'long details keep the visual reading order');
  assert.equal(f.doc.querySelector('h2').style.visibility, '');
  f.motion.suspend(); await f.finish();
  assert.equal(f.surface.hasAttribute('data-detail-motion'), false);
  f.close();
}
{
  const f = fixture(); let closed = 0;
  f.motion.setOpen(true, false, () => {});
  const at = f.records.length;
  f.motion.setOpen(false, false, () => closed++);
  assert(f.records.slice(at).every(record => record.options.delay === 0), 'closing interrupts pending section reveals immediately');
  await f.finish(); assert.equal(closed, 1); f.close();
}
{
  const f = fixture(); f.motion.setOpen(true, false, () => {});
  f.surface.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  await f.finish();
  assert.equal(f.doc.querySelector('h2').style.visibility, '', 'keyboard navigation exposes all content without waiting');
  f.close();
}
console.log('Detail motion: origin geometry, opaque surface, staged sections without shared labels, bounded delay, completion, interruption, deleted origin, reduced/unsupported motion and cleanup passed.');
