import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const sourcePath = path.resolve('src/utils/planner-pointer.web.ts');
const code = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => { throw new Error(`unexpected import ${name}`); }, module, module.exports);
const { PLANNER_LONG_PRESS_MS, plannerGestureIntent, edgeScrollSpeed, parsePlanSource, attachPlannerPointer } = module.exports;
const css = readFileSync(path.resolve('src/redesign.css'), 'utf8');

const classList = () => ({ add() {}, remove() {} });
function element(dataset = {}) {
  return {
    dataset: { ...dataset }, isConnected: true, inert: false, isCard: false, sourceChild: null, card: null, parent: null, classList: classList(), style: {},
    closest(selector) {
      if (selector.includes('[data-plan-source]') && this.dataset.planSource) return this;
      if (selector.includes('[data-plan-card]') && this.isCard) return this;
      if (selector.includes('[data-plan-card]') && this.card) return this.card;
      if (selector.includes('[data-plan-drop]') && this.dataset.planDrop) return this;
      if (selector.includes('[data-plan-entry]') && this.dataset.planEntry) return this;
      if (selector.includes('[data-plan-day]') && this.dataset.planDay) return this;
      if (selector.includes('[aria-disabled') && this.ariaDisabled) return this;
      return this.parent?.closest?.(selector) ?? null;
    },
    contains(target) {
      for (let node = target; node; node = node.parent) if (node === this) return true;
      return false;
    },
    hasAttribute(name) { return name === 'disabled' ? Boolean(this.disabled) : false; },
    setAttribute() {}, removeAttribute() {}, remove() {},
    querySelector(selector) { return selector.includes('[data-plan-source]') ? this.sourceChild : null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, right: 152, bottom: 72, width: 152, height: 72 }; },
    cloneNode() { const clone = element({ ...this.dataset }); clone.isCard = this.isCard; return clone; },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
    addEventListener() {}, removeEventListener() {},
  };
}
function fixture() {
  const listeners = new Map(), windowListeners = new Map(), registrations = [], timers = new Map(); let point = null, raf = 0, timerId = 0;
  const body = { appendChild() {} };
  const doc = {
    hidden: false, body,
    defaultView: null,
    elementFromPoint() { return point; },
    querySelectorAll() { return []; },
    addEventListener(name, fn) { listeners.set(`doc:${name}`, fn); }, removeEventListener() {},
  };
  const win = {
    Element: Object,
    requestAnimationFrame() { raf += 1; return raf; }, cancelAnimationFrame() {},
    setTimeout(fn) { timerId += 1; timers.set(timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener() {},
  };
  doc.defaultView = win;
  const root = element(); root.ownerDocument = doc;
  root.addEventListener = (name, fn, options) => { listeners.set(name, fn); registrations.push([name, options]); }; root.removeEventListener = () => {};
  root.querySelectorAll = () => [];
  const calls = [];
  const cleanup = attachPlannerPointer(root, {
    start: source => calls.push(['start', source]), drop: (source, slot) => calls.push(['drop', source, slot]),
    day: day => calls.push(['day', day]), cancel: () => calls.push(['cancel']),
  });
  const emit = (name, event) => (listeners.get(name) ?? windowListeners.get(name))?.(event);
  const fireHold = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  return { root, doc, calls, cleanup, emit, registrations, fireHold, setPoint(value) { point = value; } };
}
function pointer(target, x, y, extras = {}) {
  return { target, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', preventDefault() {}, ...extras };
}
function candidate(f, source = { kind: 'place', id: 'p' }) {
  const card = element({ planGesture: 'lift', planSource: JSON.stringify(source) }); card.isCard = true; card.parent = f.root;
  const target = element(); target.card = card; target.parent = card;
  return { card, target };
}
function scheduledItem(f, id = 'i') {
  const card = element({ planGesture: 'free' }); card.isCard = true; card.parent = f.root;
  const hiddenHandle = element({ planSource: JSON.stringify({ kind: 'item', id }) }); hiddenHandle.parent = card; card.sourceChild = hiddenHandle;
  const target = element(); target.card = card; target.parent = card;
  return { card, hiddenHandle, target };
}

test('touch waits for long press while mouse or pen can drag from movement', () => {
  assert.equal(plannerGestureIntent(8, 1, true, 'lift'), 'scroll');
  assert.equal(plannerGestureIntent(1, 8, true, 'free'), 'scroll');
  assert.equal(plannerGestureIntent(8, 1, false, 'lift'), 'drag');
  assert.equal(plannerGestureIntent(4, 4, true, 'lift'), 'pending');
  assert.equal(PLANNER_LONG_PRESS_MS, 280);
});
test('candidate dock keeps horizontal scrolling before the hold', () => {
  assert.match(css, /\.planner-card-frame\[data-plan-gesture="lift"\]\s*\{[^}]*touch-action:\s*pan-x;/s);
});
test('planner observes pointerdown in capture phase before nested Pressable responders', () => {
  const f = fixture();
  assert(f.registrations.some(([name, options]) => name === 'pointerdown' && options === true));
  f.cleanup();
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
  const f = fixture(), { target } = candidate(f);
  f.emit('pointerdown', pointer(target, 10, 10)); f.emit('pointerup', pointer(target, 10, 10));
  assert.deepEqual(f.calls, []); f.cleanup();
});
test('movement before long press cancels drag intent and leaves scrolling alone', () => {
  const f = fixture(), { target } = candidate(f);
  f.emit('pointerdown', pointer(target, 10, 10)); f.emit('pointermove', pointer(target, 10, 28)); f.fireHold();
  assert.deepEqual(f.calls, []); f.cleanup();
});
test('long press starts candidate drag so the card can follow the finger', () => {
  const f = fixture(), { target } = candidate(f);
  f.emit('pointerdown', pointer(target, 10, 10)); f.fireHold();
  assert.deepEqual(f.calls[0], ['start', { kind: 'place', id: 'p' }]); f.cleanup();
});
test('existing scheduled item can be long-pressed from anywhere on its card while editing', () => {
  const f = fixture(), { target } = scheduledItem(f, 'scheduled');
  f.emit('pointerdown', pointer(target, 10, 10)); f.fireHold();
  assert.deepEqual(f.calls[0], ['start', { kind: 'item', id: 'scheduled' }]); f.cleanup();
});
test('nested Pressable losing its capture does not cancel the planner drag', () => {
  const f = fixture(), { hiddenHandle, target } = scheduledItem(f, 'scheduled');
  f.emit('pointerdown', pointer(target, 10, 10)); f.fireHold();
  f.emit('lostpointercapture', pointer(hiddenHandle, 10, 10));
  assert.deepEqual(f.calls, [['start', { kind: 'item', id: 'scheduled' }]]); f.cleanup();
});
test('mouse movement on an existing scheduled item starts without waiting for hold', () => {
  const f = fixture(), { target } = scheduledItem(f, 'scheduled');
  f.emit('pointerdown', pointer(target, 10, 10, { pointerType: 'mouse' }));
  f.emit('pointermove', pointer(target, 28, 12, { pointerType: 'mouse' }));
  assert.equal(f.calls[0]?.[0], 'start'); f.cleanup();
});


test('the fullscreen editor allows dragging, while a nested modal blocks it', () => {
  const f = fixture(), { target } = candidate(f);
  const editor = element(); f.root.parent = editor;
  f.doc.querySelectorAll = () => [editor];
  f.emit('pointerdown', pointer(target, 20, 30)); f.fireHold();
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  f.emit('pointercancel', pointer(target, 20, 30));
  const nestedModal = element();
  f.doc.querySelectorAll = () => [editor, nestedModal];
  f.emit('pointerdown', pointer(target, 20, 30)); f.fireHold();
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  f.cleanup();
});
