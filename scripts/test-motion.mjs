import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head><style>:root { --modal-close-dur: 20ms; --dropdown-close-dur: 20ms; }</style></head><body><main></main></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
let reduced = false;
const mediaListeners = new Set();
globalThis.matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) });
const resizes = new Set();
globalThis.ResizeObserver = class {
  targets = new Set();
  constructor(callback) { this.callback = callback; resizes.add(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); resizes.delete(this); }
};
const require = createRequire(import.meta.url);
const cache = new Map();
// Only source-module timers are virtual. React's scheduler remains real so a
// slow CI runner cannot finish a 20ms exit before the next assertion runs.
let now = 0, nextTimer = 0;
const timers = new Map();
const setTimer = (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; };
const clearTimer = (id) => timers.delete(id);
function advance(ms) {
  const until = now + ms;
  let count = 0;
  for (;;) {
    const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    assert(++count < 1000, 'timers must settle');
    timers.delete(next[0]); now = next[1].at; next[1].callback();
  }
  now = until;
}
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', js)((name) => {
    if (name.endsWith('.css')) return {};
    if (name === 'react-native') return {
      Platform: { OS: 'web' }, Modal: ({ visible, children }) => visible ? children : null,
      View: React.forwardRef(function View({ children, ...props }, ref) { return React.createElement('div', { ...props, ref }, children); }),
    };
    const paths = {
      '@/utils/detail-motion.web': 'src/utils/detail-motion.web.ts',
      './detail-origin.web': 'src/utils/detail-origin.web.ts',
      './motion-presence.web': 'src/components/motion-presence.web.tsx',
      '@/hooks/use-reduced-motion': 'src/hooks/use-reduced-motion.ts',
      '@/utils/motion': 'src/utils/motion.ts',
      '@/utils/web-motion': 'src/utils/web-motion.ts',
    };
    return paths[name] ? load(paths[name]) : require(name);
  }, module, module.exports, setTimer, clearTimer);
  return module.exports;
}
const { MotionPresence } = load('src/components/motion-presence.web.tsx');
const { MotionModal } = load('src/components/motion-modal.web.tsx');
const { MotionTabs } = load('src/components/motion-tabs.web.tsx');
const { transitionMilliseconds } = load('src/utils/web-motion.ts');
const root = createRoot(document.querySelector('main'));
const render = async (element) => act(async () => root.render(element));
const flush = async (ms = 40) => act(async () => { advance(ms); });
const surface = () => document.querySelector('[data-testid="form-sheet"]');
function editor(value, visible = true) {
  return React.createElement(MotionModal, { visible }, React.createElement('div', { 'data-testid': 'form-modal-viewport', style: { backgroundColor: 'rgba(24,42,54,.3)' } },
    React.createElement('section', { 'data-testid': 'form-sheet' }, React.createElement('input', { defaultValue: value }), React.createElement('span', { 'data-testid': 'spinner' }))));
}
const presence = (child) => React.createElement(MotionPresence, null, child);

await render(presence(editor('draft')));
assert(surface().classList.contains('is-open'));
const originalInput = surface().querySelector('input');
originalInput.value = 'unsaved input';
await render(presence(null));
assert.equal(surface().querySelector('input'), originalInput, 'exit retains editor DOM and input state');
assert(surface().classList.contains('is-closing'));
assert.equal(surface().inert, true, 'closing surface cannot receive interactions');
await render(presence(editor('reopened')));
assert(surface().classList.contains('is-open'));
assert(!surface().classList.contains('is-closing'));
await flush();
assert(surface(), 'old close callback must not remove a reopened editor');
await render(presence(null));
await flush();
assert.equal(surface(), null);
await render(presence(editor('fresh')));
assert.equal(surface().querySelector('input').value, 'fresh');
await render(editor('visible'));
await render(editor('cleared by save', false));
assert.equal(surface().querySelector('input').value, 'visible');
await flush();
assert.equal(surface(), null);
console.log('Motion: retained inputs, visible toggles and rapid reopen passed.');

// Fallback reads property lists, seconds, delays and negative delays.
assert.equal(transitionMilliseconds({ transitionProperty: 'opacity, transform', transitionDuration: '.02s, 70ms', transitionDelay: '10ms, 15ms' }), 85);
assert.equal(transitionMilliseconds({ transitionProperty: 'opacity, transform, width', transitionDuration: '20ms', transitionDelay: '-10ms, 15ms' }), 35);
assert.equal(transitionMilliseconds({ transitionProperty: 'none', transitionDuration: '1s', transitionDelay: '1s' }), 0);
await render(presence(editor('fallback')));
Object.assign(surface().style, { transitionProperty: 'opacity, transform', transitionDuration: '20ms, 70ms', transitionDelay: '10ms, 15ms' });
await render(presence(null));
await flush();
assert(surface(), 'fallback must not unmount before the longest delayed transition');
await flush(70);
assert.equal(surface(), null);
console.log('Motion: CSS delay fallback passed.');

// Model real browser animations with explicit finish/cancel control.
const animations = new Set();
function running(target, endTime = 250) {
  let resolveFinished, rejectFinished;
  const animation = { playState: 'running', effect: { target, getComputedTiming: () => ({ endTime }) }, finished: new Promise((yes, no) => { resolveFinished = yes; rejectFinished = no; }) };
  animations.add(animation);
  return {
    finish: () => { animation.playState = 'finished'; resolveFinished(); },
    cancel: () => { animation.playState = 'idle'; rejectFinished(new Error('cancelled')); },
  };
}
dom.window.HTMLElement.prototype.getAnimations = function ({ subtree = false } = {}) {
  return [...animations].filter(({ effect }) => effect.target === this || (subtree && this.contains(effect.target)));
};
await render(presence(editor('actual duration')));
const panel = running(surface());
const backdrop = running(surface().parentElement, 350);
running(document.querySelector('[data-testid="spinner"]'), Infinity);
running(document.querySelector('[data-testid="spinner"]'), 5000);
await render(presence(null));
await flush();
assert(surface(), 'actual animation completion wins over the old 20ms timer');
await act(async () => panel.finish());
assert(surface(), 'backdrop must finish too');
await act(async () => backdrop.finish());
assert.equal(surface(), null, 'child animations must not keep an otherwise finished modal alive');
animations.clear();

await render(presence(editor('interrupted')));
const interrupted = running(surface());
await render(presence(null));
await render(presence(editor('reopened while exiting')));
await act(async () => interrupted.cancel());
assert(surface(), 'a rejected old finished promise cannot remove a reopened modal');
await render(presence(null));
assert.equal(surface(), null, 'no active animation needs no artificial wait');
animations.clear();
console.log('Motion: actual animation completion and cancellation passed.');

// A confirmation/dropdown can close before the editor underneath it.
const menu = React.createElement(MotionModal, { motion: 'dropdown' }, React.createElement('div', { 'data-testid': 'modal-viewport' }, React.createElement('section', { 'data-testid': 'trip-menu' }, 'menu')));
console.log('Motion: mounting nested surfaces');
await render(presence(React.createElement(React.Fragment, null, editor('stacked'), menu)));
console.log('Motion: mounted nested surfaces');
const outer = running(surface(), 350);
const inner = running(document.querySelector('[data-testid="trip-menu"]'), 150);
await render(presence(null));
console.log('Motion: finishing inner surface');
await act(async () => inner.finish());
console.log('Motion: inner finished');
assert(surface(), 'one completed portal cannot unmount another still exiting');
assert.equal(document.querySelector('[data-testid="trip-menu"]'), null);
await act(async () => outer.finish());
console.log('Motion: outer finished');
assert.equal(surface(), null);
animations.clear();

await render(presence(editor('preference change')));
running(surface());
await render(presence(null));
reduced = true;
await act(async () => { for (const fn of [...mediaListeners]) fn(); });
console.log('Motion: preference applied');
assert.equal(surface(), null, 'changing reduced motion during exit removes the wait');
animations.clear();
console.log('Motion: mounting StrictMode');
await render(React.createElement(React.StrictMode, null, presence(editor('strict'))));
console.log('Motion: mounted StrictMode');
await render(React.createElement(React.StrictMode, null, presence(null)));
console.log('Motion: closed StrictMode');
assert.equal(surface(), null, 'StrictMode cleanup cannot leave a retained editor');
await render(presence(React.createElement('section', { 'data-testid': 'no-modal' })));
await render(presence(null));
assert.equal(document.querySelector('[data-testid="no-modal"]'), null);
console.log('Motion: nested exits, reduced motion and StrictMode passed.');

// Observe geometry in the DOM; an unchanged ResizeObserver notification should
// leave an ongoing pill transition untouched, including dynamic tab additions.
function tab(id, selected, x) {
  return React.createElement('button', { key: id, role: 'tab', 'aria-selected': selected, style: { borderRadius: '12px' }, ref: (element) => {
    if (element) Object.defineProperties(element, { offsetLeft: { value: x, configurable: true }, offsetTop: { value: 0, configurable: true }, offsetWidth: { value: 100, configurable: true }, offsetHeight: { value: 44, configurable: true } });
  } }, id);
}
await render(React.createElement(MotionTabs, null, tab('a', true, 0), tab('b', false, 110)));
await render(React.createElement(MotionTabs, null, tab('a', false, 0), tab('b', true, 110)));
const pill = document.querySelector('.t-tabs-pill');
assert.equal(pill.style.transform, 'translate(110px, 0px)');
pill.style.transition = 'transform 2s linear';
for (const observer of resizes) observer.callback();
assert.equal(pill.style.transition, 'transform 2s linear', 'redundant resize must not cancel selection motion');
await render(React.createElement(MotionTabs, null, tab('a', false, 0), tab('b', false, 110), tab('c', true, 220)));
assert.equal(pill.style.transform, 'translate(220px, 0px)');
assert([...resizes][0].targets.has(document.querySelector('[aria-selected="true"]')), 'new tabs are observed');
await act(async () => root.unmount());
assert.equal(timers.size, 0, 'exit timers are cleaned up');
assert.equal(resizes.size, 0);
assert.equal(mediaListeners.size, 0);
dom.window.close();
console.log('Motion lifecycle: retained input, actual surface/backdrop completion, delayed fallback, nested exits, cancellation/reopen, reduced motion, StrictMode, dynamic tabs and cleanup passed.');
