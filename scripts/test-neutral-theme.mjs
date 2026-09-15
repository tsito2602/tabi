import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const module = { exports: {} };
const code = ts.transpileModule(readFileSync('src/constants/design.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'module', 'exports', code)(() => ({ Platform: { OS: 'web' } }), module, module.exports);
const { lightPalette, darkPalette } = module.exports;
const luminance = hex => {
  const [r, g, b] = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
for (const [name, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
  test(`${name}: ordinary text, time, metadata and selection remain readable on shared surfaces`, () => {
    for (const bg of ['canvas', 'paper', 'mist', 'soft', 'sky', 'successSurface']) {
      for (const fg of ['ink', 'slate', 'smoke', 'placeholder', 'ocean']) {
        assert(contrast(palette[fg], palette[bg]) >= 4.5, `${name}: ${fg} on ${bg}`);
      }
    }
    assert(contrast(palette.onOcean, palette.ocean) >= 4.5, 'primary button text');
    for (const color of ['danger', 'warning']) assert(contrast(palette[color], palette.paper) >= 4.5, `${color} message`);
    assert.deepEqual(Object.keys(lightPalette).sort(), Object.keys(darkPalette).sort(), 'no missing dark-mode semantic token');
  });
}
