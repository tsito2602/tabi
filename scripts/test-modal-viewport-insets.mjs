import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const module = { exports: {} };
const source = readFileSync('src/utils/modal-viewport-insets.web.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('module', 'exports', js)(module, module.exports);
const { modalBottomOcclusion, trackModalViewportInsets } = module.exports;

assert.equal(modalBottomOcclusion(844, null), 0, 'no visual viewport keeps the safe area');
assert.equal(modalBottomOcclusion(844, { height: 844, offsetTop: 0, scale: 1 }), 0, 'focus with no keyboard cannot remove padding');
assert.equal(modalBottomOcclusion(844, { height: 430, offsetTop: 24, scale: 1 }), 390, 'keyboard inset includes viewport panning');
assert.equal(modalBottomOcclusion(844, { height: 810, offsetTop: 20, scale: 1 }), 14, 'partial occlusion preserves the remaining safe area');
assert.equal(modalBottomOcclusion(844, { height: 844, offsetTop: 20, scale: 1 }), 0, 'overscroll cannot produce negative padding');
assert.equal(modalBottomOcclusion(844, { height: 430, offsetTop: 0, scale: 2 }), 0, 'pinch zoom is not mistaken for a keyboard');
assert.equal(modalBottomOcclusion(844, { height: NaN, offsetTop: 0, scale: 1 }), 0, 'invalid geometry never becomes a CSS value');

const frames = new Map(); let sequence = 0;
const visual = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
const win = Object.assign(new EventTarget(), {
  innerHeight: 844, visualViewport: visual,
  requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; },
  cancelAnimationFrame: (id) => frames.delete(id),
});
const root = () => {
  const values = new Map();
  return { ownerDocument: { defaultView: win }, style: { setProperty: (k, v) => values.set(k, v), removeProperty: (k) => values.delete(k) }, value: () => values.get('--modal-bottom-occlusion') };
};
const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach((fn) => fn()); };
const parent = root(), child = root();
const stopParent = trackModalViewportInsets(parent), stopChild = trackModalViewportInsets(child);
assert.equal(parent.value(), '0px', 'initial inset is synchronous');
visual.height = 430; visual.offsetTop = 24;
visual.dispatchEvent(new Event('resize')); visual.dispatchEvent(new Event('scroll')); win.dispatchEvent(new Event('resize'));
assert.equal(frames.size, 2, 'bursts are batched once per mounted modal');
flush(); assert.equal(parent.value(), '390px'); assert.equal(child.value(), '390px');
stopChild(); assert.equal(child.value(), undefined);
visual.height = 844; visual.offsetTop = 0; visual.dispatchEvent(new Event('resize')); flush();
assert.equal(parent.value(), '0px', 'keyboard dismissal restores padding without blurring an input');
assert.equal(child.value(), undefined, 'unmounted nested picker cannot receive updates');
win.innerHeight = 390; visual.height = 390; win.dispatchEvent(new Event('resize')); flush();
assert.equal(parent.value(), '0px', 'rotation follows the new layout viewport');
visual.dispatchEvent(new Event('scroll')); assert.equal(frames.size, 1);
stopParent(); assert.equal(frames.size, 0, 'unmount cancels a pending frame');
visual.dispatchEvent(new Event('resize')); win.dispatchEvent(new Event('resize'));
assert.equal(frames.size, 0, 'listeners are removed on unmount');
assert.doesNotThrow(() => trackModalViewportInsets({ ownerDocument: { defaultView: null } })());
console.log('Modal insets: focus, keyboard/panning/dismissal, partial inset, zoom, nested isolation, rotation, batching and cleanup passed.');
