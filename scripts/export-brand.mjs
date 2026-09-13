import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// All outputs come from this one transparent, wordmark-free vector master.
const source = await readFile('assets/brand/symbol.svg', 'utf8');
const body = source.match(/<g[\s\S]*<\/g>/)[0];
const svg = (background, scale = 1, monochrome = false) => {
  const shapes = monochrome ? body.replace(/#496B80|#D7E2E8/g, '#FFFFFF') : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>tabi</title>${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}<g transform="translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})">${shapes}</g></svg>\n`;
};
await mkdir('public', { recursive: true });
const png = async (file, input, size) => {
  let output = sharp(Buffer.from(input)).resize(size, size);
  // Store icons must have no alpha channel; in-app/adaptive artwork stays transparent.
  if (input.includes('<rect width="1024" height="1024" fill=')) output = output.removeAlpha();
  await writeFile(file, await output.png().toBuffer());
};
const light = svg('#FAFCFD');
const dark = svg('#182A36');
await writeFile('assets/brand/icon.svg', light);
await writeFile('assets/brand/icon-dark.svg', dark);
await writeFile('assets/brand/symbol-dark.svg', source);
await png('assets/brand/icon.png', light, 1024);
await png('assets/brand/icon-dark.png', dark, 1024);
await png('assets/brand/logo.png', source, 1024);
await png('assets/brand/logo-dark.png', source, 1024);
// Keep the whole mark inside the Android / maskable safe circle.
await png('assets/brand/adaptive-foreground.png', svg(null, .72), 1024);
await png('assets/brand/adaptive-monochrome.png', svg(null, .72, true), 1024);
await png('assets/brand/favicon.png', light, 48);
for (const size of [192, 512]) {
  await png(`public/icon-${size}.png`, light, size);
  await png(`public/icon-dark-${size}.png`, dark, size);
}
await png('public/icon-maskable.png', svg('#FAFCFD', .72), 512);
// Match konogoro's flat white Web Clip background. iOS owns automatic dark
// rendering; PWA metadata cannot select our native dark asset after installation.
const touch = svg('#FFFFFF');
await png('public/apple-touch-icon.png', touch, 180);
await png('public/apple-touch-icon-v2.png', touch, 180);
await png('public/apple-touch-icon-dark.png', dark, 180);
// A single SVG favicon adapts without relying on competing media icon links.
await writeFile('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><style>.bg{fill:#FAFCFD}@media(prefers-color-scheme:dark){.bg{fill:#182A36}}</style><rect class="bg" width="1024" height="1024"/>${body}</svg>\n`);
await writeFile('public/logo.svg', source);
await writeFile('public/logo-dark.svg', source);
console.log('Exported light, dark, transparent, adaptive and web ticket icons.');
