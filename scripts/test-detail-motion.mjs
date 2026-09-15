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
    const record = { element: this, frames, options, finished, cancel: () => { record.cancelled = true; reject(new Error('cancelled')); }, finish: resolve };
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
  const sections = f.records.filter(record => record.element !== f.surface && 'transform' in record.frames[0]);
  const fades = f.records.filter(record => record.element !== f.surface && 'opacity' in record.frames[0]);
  assert.equal(sections.length, 4, 'header, title, time and note are semantic blocks');
  assert(sections.every(record => record.options.delay >= surfaceAnimation.options.duration), 'content waits for the surface');
  assert(sections.every(record => record.frames[0].transform.includes('20px')), 'all contents rise from below');
  assert.equal(fades.length, sections.length, 'every item has an independent fade track');
  assert(fades.every((record, index) => record.frames[0].opacity === '0' && record.options.delay === sections[index].options.delay), 'fade and slide start together');
  assert(fades.every((record, index) => record.options.easing !== sections[index].options.easing && record.options.duration < sections[index].options.duration), 'opacity appears gently while position keeps settling');
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
  const blocks = f.records.filter(record => record.element !== f.surface && 'transform' in record.frames[0]);
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
{
  const f = fixture(); let closed = 0;
  f.motion.setOpen(true, false, () => {});
  const expandedFrom = f.records.find(record => record.element === f.surface).frames[0];
  await f.finish();
  const at = f.records.length;
  f.motion.setOpen(false, false, () => closed++);
  const exiting = f.records.slice(at), returning = exiting.find(record => record.element === f.surface);
  assert.equal(returning.frames.length, 3, 'return has contraction followed by a short handoff');
  assert.equal(returning.frames[1].transform, expandedFrom.transform, 'close targets the opening origin');
  assert.equal(returning.frames[1].clipPath, expandedFrom.clipPath, 'close restores the same source outline');
  assert.equal(returning.frames[1].opacity, returning.frames[0].opacity, 'surface stays visible through contraction');
  assert.equal(returning.frames.at(-1).opacity, '0', 'only the origin handoff fades away');
  assert.equal(returning.frames[1].offset, .84);
  exiting.filter(record => record !== returning).forEach(record => record.finish()); await flush();
  assert.equal(closed, 0, 'finishing the content must not unmount the returning surface');
  returning.finish(); await flush(); assert.equal(closed, 1);
  f.close();
}
{
  const f = fixture(); let closed = 0;
  f.motion.setOpen(true, false, () => {}); await f.finish();
  // Model releasing the grip after pulling a sheet, not from its settled pose.
  f.surface.style.transform = 'translate3d(0px, 140px, 0px) scale(.96)';
  f.doc.querySelector('h2').style.opacity = '.35';
  f.doc.querySelector('h2').style.transform = 'translate3d(0px, 9px, 0px)';
  const at = f.records.length;
  f.motion.setOpen(false, false, () => closed++);
  const exit = f.records.slice(at);
  assert.equal(exit.find(record => record.element === f.surface).frames[0].transform, 'translate3d(0px, 140px, 0px) scale(.96)', 'close continues from the finger position');
  assert.equal(Number(exit.find(record => record.element.tagName === 'H2').frames[0].opacity), .35, 'partly revealed content cannot flash during a close');
  await f.finish(); assert.equal(closed, 1); f.close();
}
console.log('Detail motion: floating stagger, opaque inverse contraction, handoff completion, interrupted/dragged close, fallback and cleanup passed.');

// The same controller covers utility sheets without duplicating their fields.
for (const kind of ['form', 'picker']) {
  const f = fixture(); let closed = 0;
  f.doc.querySelector('#note').style.opacity = '.45';
  f.motion.setOpen(true, false, () => {}, kind);
  assert.equal(f.surface.dataset.sheetMotionKind, kind);
  const moves = f.records.filter(r => r.element !== f.surface && 'transform' in r.frames[0]);
  const fades = f.records.filter(r => r.element !== f.surface && 'opacity' in r.frames[0]);
  assert(moves.every(r => r.frames[0].transform.includes('16px')));
  assert.equal(new Set(moves.map(r => r.options.delay)).size, moves.length);
  assert.equal(fades.find(r => r.element.id === 'note').frames.at(-1).opacity, '0.45', 'disabled-looking controls retain their resting opacity');
  await f.finish();
  const count = f.records.length;
  f.motion.setOpen(true, false, () => {}, kind);
  assert.equal(f.records.length, count, 'selection and ordinary updates do not restart entrance');
  f.motion.setOpen(false, false, () => closed++, kind); await f.finish();
  assert.equal(closed, 1, 'utility sheets wait for the reverse transition'); f.close();
}
{
  const f = fixture(); f.motion.setOpen(true, false, () => {}, 'form');
  const input = f.doc.createElement('input'); f.surface.append(input); input.focus();
  assert(f.records.every(r => r.cancelled), 'typing settles pending motion immediately');
  await f.finish(); f.close();
}
{
  const f = fixture(), fill = f.doc.querySelector('[data-testid="form-sheet-fill"]');
  fill.innerHTML = '<header data-testid="sheet-header">Connections</header><div data-testid="sheet-content-scroll"><div><section id="arrival">Arrival</section><button id="option">Auto</button><section id="calendar"><button>1</button><button>2</button></section></div></div><footer data-testid="sheet-footer">Save</footer>';
  const blocks = detailContentBlocks(fill);
  assert.deepEqual(blocks.map(e => e.id || e.tagName), ['HEADER','arrival','option','calendar','FOOTER']);
  assert(!blocks.some(a => blocks.some(b => a !== b && a.contains(b))), 'no parent/child double animation or individual calendar cells'); f.close();
}
{
  const f = fixture(); f.motion.setOpen(true, false, () => {}); await f.finish();
  const count = f.records.length; f.motion.setOpen(true, false, () => {}, 'form');
  const changed = f.records.slice(count);
  assert.equal(changed.find(r => r.element === f.surface).frames[0].transform, 'none', 'editing changes content without collapsing back to the item');
  assert(changed.some(r => r.element !== f.surface && r.frames[0].opacity === '0')); await f.finish(); f.close();
}
console.log('Utility sheets: shared motion, ordered controls, focus, no replay, picker grouping, opacity and mode changes passed.');

// A retained portal may change items while its previous exit is still running.
for (const kind of ['detail', 'form', 'picker']) {
  const f = fixture(); let staleClosed = 0, closed = 0;
  f.motion.setOpen(true, false, () => {}, kind); await f.finish();
  const stopClose = f.motion.setOpen(false, false, () => staleClosed++, kind);
  const next = f.doc.createElement('button'); f.doc.body.prepend(next);
  const rect = { left: 40, top: 500, width: 180, height: 56 };
  next.getBoundingClientRect = () => rect;
  stopClose();
  f.motion.setOrigin({ element: next, rect, radius: 18 });
  f.motion.setOpen(true, false, () => {}, kind); await f.finish();
  assert.equal(staleClosed, 0, 'the old close cannot unmount the new selection');
  f.motion.setOpen(false, false, () => closed++, kind);
  const frame = f.records.filter(r => r.element === f.surface).at(-1).frames[1];
  const target = detailPose(rect, f.surface.getBoundingClientRect(), 18);
  assert.equal(frame.transform, target.transform, 'return uses the current item rather than the first one');
  assert.equal(frame.clipPath, target.clipPath, 'the current item also supplies its outline');
  await f.finish(); assert.equal(closed, 1); f.close();
}
{
  const f = fixture(); let closed = 0;
  f.motion.setOpen(true, false, () => {}); await f.finish();
  f.motion.setOrigin(undefined);
  f.motion.setOpen(false, false, () => closed++);
  const frames = f.records.filter(r => r.element === f.surface).at(-1).frames;
  assert.equal(frames.length, 2, 'clearing the origin must not retain the previous item');
  assert.equal(frames.at(-1).transform, 'translate3d(0px, 16px, 0px)');
  await f.finish(); assert.equal(closed, 1); f.close();
}
for (const reason of ['resize', 'reduced', 'unsupported']) {
  const f = fixture(); let closed = 0, opacityAtClose;
  const complete = () => { closed++; opacityAtClose = f.dom.window.getComputedStyle(f.surface).opacity; };
  f.motion.setOpen(true, false, () => {}); await f.finish();
  f.motion.setOpen(false, false, complete);
  const animate = f.surface.animate;
  if (reason === 'resize') f.dom.window.dispatchEvent(new f.dom.window.Event('resize'));
  else {
    if (reason === 'unsupported') f.surface.animate = undefined;
    f.motion.setOpen(false, reason === 'reduced', complete);
  }
  assert.equal(opacityAtClose, '0', 'finishing an exit cannot reveal a full-size surface before DOM removal');
  await f.finish(); assert.equal(closed, 1, 'cancelled animations cannot complete the exit twice');
  f.surface.animate = animate;
  f.motion.setOpen(true, false, () => {}); await f.finish();
  assert.equal(f.surface.style.opacity, '', 'reopening clears the terminal hidden state');
  assert.equal(f.dom.window.getComputedStyle(f.surface).opacity, '1');
  f.close();
}
console.log('Retained modals: updated/cleared origin, obsolete exit cancellation and hidden terminal exit state passed.');

// A child portal must return focus inside its surviving parent without stealing
// it from a new modal or an input the user has already moved to.
for (const scenario of ['parent', 'reduced', 'new-modal', 'nested-new-modal', 'other-input', 'trap-container', 'hidden-modal', 'inert-source', 'removed-source', 'unfocused-modal']) {
  const f = fixture();
  const parent = f.doc.createElement('section');
  parent.setAttribute('aria-modal', 'true');
  f.doc.body.prepend(parent); parent.append(f.source);
  const reduced = scenario === 'reduced';
  f.motion.setOpen(true, reduced, () => {}, 'picker'); await f.finish();
  let expected = f.source;
  f.motion.setOpen(false, reduced, () => {
    f.motion.dispose(); f.surface.parentElement.remove();
    if (scenario === 'inert-source') { parent.setAttribute('inert', ''); expected = f.doc.body; }
    if (scenario === 'removed-source') { f.source.remove(); expected = f.doc.body; }
    if (scenario === 'trap-container') { parent.tabIndex = -1; parent.focus(); }
    if (scenario === 'other-input') {
      const input = f.doc.createElement('input'); parent.append(input); input.focus(); expected = input;
    }
    if (['new-modal', 'nested-new-modal', 'hidden-modal', 'unfocused-modal'].includes(scenario)) {
      const next = f.doc.createElement('section'); next.setAttribute('aria-modal', 'true');
      const button = f.doc.createElement('button'); next.append(button);
      (scenario === 'nested-new-modal' ? parent : f.doc.body).append(next);
      if (scenario === 'hidden-modal') next.setAttribute('aria-hidden', 'true');
      else if (scenario === 'unfocused-modal') expected = f.doc.body;
      else { button.focus(); expected = button; }
    }
  }, 'picker');
  await f.finish();
  await new Promise(resolve => f.dom.window.requestAnimationFrame(() => f.dom.window.requestAnimationFrame(resolve)));
  assert.equal(f.doc.activeElement, expected, `nested focus restoration: ${scenario}`);
  f.close();
}
console.log('Nested modal focus: parent trigger, focus traps, reduced motion, unrelated modals and new input focus passed.');
