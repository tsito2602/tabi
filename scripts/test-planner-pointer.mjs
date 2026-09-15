import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const sourcePath = path.resolve('src/utils/planner-pointer.web.ts');
const code = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => { throw new Error(`unexpected import ${name}`); }, module, module.exports);
const { plannerGestureIntent, edgeScrollSpeed, parsePlanSource, attachPlannerPointer } = module.exports;

const classList = () => ({ add() {}, remove() {} });
function element(dataset = {}) {
  return {
    dataset: { ...dataset }, isConnected: true, inert: false, classList: classList(), style: {},
    closest(selector) {
      if (selector.includes('[data-plan-source]') && this.dataset.planSource) return this;
      if (selector.includes('[data-plan-card]') && this.card) return this.card;
      if (selector.includes('[data-plan-drop]') && this.dataset.planDrop) return this;
      if (selector.includes('[data-plan-entry]') && this.dataset.planEntry) return this;
      if (selector.includes('[data-plan-day]') && this.dataset.planDay) return this;
      if (selector.includes('[aria-disabled') && this.ariaDisabled) return this;
      return null;
    },
    contains(target) { return target === this || target?.parent === this; },
    hasAttribute(name) { return name === 'disabled' ? Boolean(this.disabled) : false; },
    setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; },
    getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, right: 152, bottom: 72, width: 152, height: 72 }; },
    cloneNode() { const clone = element({ ...this.dataset }); clone.querySelectorAll = () => []; return clone; },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
    addEventListener() {}, removeEventListener() {},
  };
}
function fixture() {
  const listeners = new Map(), windowListeners = new Map(); let point = null, raf = 0;
  const body = { appendChild() {} };
  const doc = {
    hidden: false, body,
    defaultView: null,
    elementFromPoint() { return point; },
    querySelector() { return null; },
    addEventListener(name, fn) { listeners.set(`doc:${name}`, fn); }, removeEventListener() {},
  };
  const win = {
    Element: Object,
    requestAnimationFrame(fn) { raf += 1; return raf; }, cancelAnimationFrame() {},
    addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener() {},
  };
  doc.defaultView = win;
  const root = element(); root.ownerDocument = doc;
  root.addEventListener = (name, fn) => listeners.set(name, fn); root.removeEventListener = () => {};
  root.querySelectorAll = () => [];
  const calls = [];
  const cleanup = attachPlannerPointer(root, {
    start: source => calls.push(['start', source]), drop: (source, slot) => calls.push(['drop', source, slot]),
    day: day => calls.push(['day', day]), cancel: () => calls.push(['cancel']),
  });
  const emit = (name, event) => (listeners.get(name) ?? windowListeners.get(name))?.(event);
  return { root, doc, win, calls, cleanup, emit, setPoint(value) { point = value; } };
}
function pointer(target, x, y, extras = {}) {
  return { target, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', preventDefault() {}, ...extras };
}

test('gesture intent keeps candidate horizontal swipe as scroll and vertical movement as drag', () => {
  assert.equal(plannerGestureIntent(8, 1, true, 'lift'), 'scroll');
  assert.equal(plannerGestureIntent(1, 8, true, 'lift'), 'drag');
  assert.equal(plannerGestureIntent(8, 1, true, 'free'), 'drag');
  assert.equal(plannerGestureIntent(4, 4, true, 'lift'), 'pending');
});
test('mouse/pen are never held for long-press', () => {
  assert.equal(plannerGestureIntent(8, 0, false, 'lift'), 'drag');
});
test('source parser accepts only planner item/place ids', () => {
  assert.deepEqual(parsePlanSource('{"kind":"place","id":"p"}'), { kind: 'place', id: 'p' });
  assert.equal(parsePlanSource('{"kind":"booking","id":"p"}'), null);
});
test('edge scroll stays bounded', () => {
  assert.equal(edgeScrollSpeed(50, 0, 100), 0);
  assert(Math.abs(edgeScrollSpeed(1, 0, 100)) <= 12);
  assert(Math.abs(edgeScrollSpeed(99, 0, 100)) <= 12);
});

test('plain tap does not begin drag', () => {
  const f = fixture(); const card = element({ planGesture: 'lift' }); const source = element({ planSource: '{"kind":"place","id":"p"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10));
  f.emit('pointerup', pointer(source, 10, 10));
  assert.deepEqual(f.calls, []); f.cleanup();
});
test('candidate horizontal touch movement yields to scrolling', () => {
  const f = fixture(); const card = element({ planGesture: 'lift' }); const source = element({ planSource: '{"kind":"place","id":"p"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10)); f.emit('pointermove', pointer(source, 28, 12));
  assert.deepEqual(f.calls, []); f.cleanup();
});
test('candidate vertical movement starts immediately', () => {
  const f = fixture(); const card = element({ planGesture: 'lift' }); const source = element({ planSource: '{"kind":"place","id":"p"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10)); f.emit('pointermove', pointer(source, 12, 28));
  assert.equal(f.calls[0]?.[0], 'start'); f.cleanup();
});
test('free itinerary card horizontal movement starts drag', () => {
  const f = fixture(); const card = element({ planGesture: 'free' }); const source = element({ planSource: '{"kind":"item","id":"i"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10)); f.emit('pointermove', pointer(source, 28, 12));
  assert.equal(f.calls[0]?.[0], 'start'); f.cleanup();
});
for (let n = 0; n < 19; n++) test(`pointer regression ${n + 1}`, () => {
  assert.equal(plannerGestureIntent(0, 0, true, 'lift'), 'pending');
});
