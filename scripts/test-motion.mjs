import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head><style>:root { --modal-close-dur: 20ms; --dropdown-close-dur: 20ms; }</style></head><body><main></main></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true });
let reduced = false;
const mediaListeners = new Set();
globalThis.matchMedia = () => ({ matches: reduced, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) });
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => {
    // Native Modal is a platform boundary; exercise the real web presence,
    // state orchestration and DOM classes with its visibility contract.
    if (name === 'react-native') return { Platform: { OS: 'web' }, Modal: ({ visible, children }) => visible ? children : null };
    if (name === './motion-presence.web') return load('src/components/motion-presence.web.tsx');
    if (name === '@/hooks/use-reduced-motion') return load('src/hooks/use-reduced-motion.ts');
    if (name === '@/utils/motion') return load('src/utils/motion.ts');
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { MotionPresence } = load('src/components/motion-presence.web.tsx');
const { MotionModal } = load('src/components/motion-modal.web.tsx');
const root = createRoot(document.querySelector('main'));
const render = async (element) => act(async () => root.render(element));
const flush = async () => act(async () => new Promise((done) => setTimeout(done, 40)));
const surface = () => document.querySelector('[data-testid="form-sheet"]');
function editor(value, visible = true) {
  return React.createElement(MotionModal, { visible }, React.createElement('section', { 'data-testid': 'form-sheet' }, React.createElement('input', { defaultValue: value })));
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
assert(surface(), 'old close timer must not remove a reopened editor');
await render(presence(null));
await flush();
assert.equal(surface(), null, 'exit cleanup eventually unmounts the editor');
await render(presence(editor('fresh')));
assert.equal(surface().querySelector('input').value, 'fresh', 'completed close resets editor state');

// A persistently mounted form freezes its old contents when visible turns false.
await render(editor('visible'));
await render(editor('cleared by save', false));
assert(surface().classList.contains('is-closing'));
assert.equal(surface().querySelector('input').value, 'visible');
await flush();
assert.equal(surface(), null);
await render(editor('again'));
assert(surface().classList.contains('is-open'));

// OS preference changes are observed during the session, not only at startup.
reduced = true;
await act(async () => { for (const fn of mediaListeners) fn(); });
await render(presence(editor('reduced')));
await render(presence(null));
await flush();
assert.equal(surface(), null);
await act(async () => root.unmount());
assert.equal(mediaListeners.size, 0, 'all preference listeners are cleaned up');
dom.window.close();
console.log('Motion lifecycle: conditional exit, retained input, rapid reopen, visible toggles, reduced motion and cleanup passed.');
