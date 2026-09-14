import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
function load(file, mocks, extra = '', define = {}) {
  const { code } = transformSync(readFileSync(file, 'utf8') + extra, { loader: 'tsx', format: 'cjs', jsx: 'automatic', define });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const noop = () => undefined;
const element = (tag) => ({ children, accessibilityLabel }) => React.createElement(tag, { 'aria-label': accessibilityLabel }, children);
const native = { Platform: { OS: 'web' }, StyleSheet: { create: (x) => x }, View: element('div'), Text: element('span'), Pressable: element('button') };
const palette = new Proxy({}, { get: () => '#000000' });
const theme = { usePalette: () => palette, useThemedStyles: (create) => create(palette) };

test('iPhone uses device-verified transparent C artwork; maskable/store assets remain opaque', async () => {
  const reference = await sharp(readFileSync('assets/brand/symbol.svg'), { density: 384 }).resize(180, 180).png({ compressionLevel: 9, palette: false }).toBuffer();
  for (const path of ['/icons/apple-touch-icon-transparent.png', '/icons/apple-touch-icon.png', '/apple-touch-icon.png', '/apple-touch-icon-v2.png']) {
    const file = `public${path}`;
    assert.deepEqual(readFileSync(file), reference, path);
    assert.equal((await sharp(file).stats()).isOpaque, false, path);
  }
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  for (const path of manifest.icons.map((icon) => icon.src)) {
    const file = `public${path}`;
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.channels, 4, path);
    assert.equal(metadata.hasAlpha, true, path);
    assert.equal(metadata.density, 384, path);
    assert.equal((await sharp(file).stats()).isOpaque, true, path);
    const pixels = await sharp(file).raw().toBuffer();
    assert.deepEqual([...pixels.subarray(0, 4)], [255, 255, 255, 255], path);
  }
  assert.equal((await sharp('assets/brand/icon.png').metadata()).hasAlpha, false);
});

test('production rejects saved demo state and demo activation; development, preview and staging retain it', async () => {
  for (const [dev, preview, flag, expected] of [[false, false, 'false', false], [false, false, '', false], [true, false, 'false', true], [false, true, 'false', true], [false, false, 'true', true]]) {
    const values = new Map([['tabi.demo-active', '1']]);
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
    const previous = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
    globalThis.localStorage = globalThis.sessionStorage = storage;
    const effects = [], states = [];
    try {
      const hooks = { ...React, createContext: () => ({ Provider: 'provider' }), useEffect: (fn) => effects.push(fn), useCallback: (fn) => fn, useMemo: (fn) => fn(), useState: (initial) => { const index = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[index], (value) => { states[index] = value; }]; } };
      const { AuthProvider } = load('src/auth/auth-provider.tsx', {
        react: hooks, 'react-native': native,
        'expo-constants': { __esModule: true, default: { expoConfig: { extra: { preview } } }, ExecutionEnvironment: {} },
        'expo-auth-session/providers/google': { useIdTokenAuthRequest: () => [null, null, noop] },
        'expo-secure-store': {}, 'expo-web-browser': { maybeCompleteAuthSession: noop },
      }, '', { __DEV__: String(dev), 'process.env.EXPO_PUBLIC_ENABLE_DEMO': JSON.stringify(flag) });
      const value = AuthProvider({}).props.value;
      assert.equal(value.demoEnabled, expected);
      effects.forEach((fn) => fn());
      await new Promise(setImmediate);
      assert.equal(states[0], expected, 'restored demo state');
      assert.equal(values.has('tabi.demo-active'), expected);
      values.delete('tabi.demo-active'); states[0] = false;
      value.startDemo();
      assert.equal(states[0], expected, 'direct demo activation');
      assert.equal(values.has('tabi.demo-active'), expected);
    } finally { globalThis.localStorage = previous.localStorage; globalThis.sessionStorage = previous.sessionStorage; }
  }
});

test('mobile file controls use selection labels; desktop retains drop instructions', () => {
  for (const desktop of [false, true]) {
    const { FileDrop } = load('src/components/file-drop.web.tsx', { '@/hooks/use-desktop': { useDesktop: () => desktop } });
    const html = renderToStaticMarkup(React.createElement(FileDrop, { label: 'カバー画像をドロップ', selectLabel: 'カバー画像を選択', hint: '画像1枚', accept: 'image/*', onFiles: noop }));
    assert.equal(html.includes('ドロップ'), desktop);
    assert.ok(html.includes('カバー画像を選択'));
    assert.ok(html.includes('type="file"'));
  }
});

test('reservation details retain file viewing but expose mutations only in editing with permission', () => {
  for (const canEdit of [false, true]) {
    const { BookingDocuments } = load('src/components/booking-sheet.tsx', {
      '@/theme/theme-provider': theme, 'react-native': native,
      './file-drop': { FileDrop: () => React.createElement('input', { type: 'file' }) },
      'expo-document-picker': {}, 'expo-file-system': {}, 'expo-sharing': {},
      'expo-symbols': {}, '@/data/places': {},
      '@/components/toast': { useToast: () => ({ show: noop }) },
      '@/components/copy-button': {}, '@/components/form-sheet': {}, '@/components/booking-route': {}, '@/components/date-range-picker': {},
      '@/constants/design': {}, '@/data/airports': {}, '@/data/booking-match': {},
      '@/data/booking-duration': { bookingDurationLabel: () => '' },
      '@/data/booking-document-cache': { getCachedDocumentUri: () => null },
      '@/data/travel-provider': { useTravel: () => ({ canEdit }) },
      '@/utils/confirm-deletion': {}, '@/utils/dates': {},
    }, '\nexport { BookingDocuments };');
    for (const readOnly of [true, false]) {
      const html = renderToStaticMarkup(React.createElement(BookingDocuments, { bookingId: 'test', readOnly, documents: [{ id: 'doc', filename: 'ticket.pdf', size: 100 }] }));
      assert.ok(html.includes('ticket.pdfを開く'));
      assert.ok(html.includes('ticket.pdfをダウンロード'));
      assert.equal(html.includes('type="file"'), canEdit && !readOnly);
      assert.equal(html.includes('ticket.pdfを削除'), canEdit && !readOnly);
    }
  }
});


test('place itinerary actions follow actual additions across every status and preserve viewer permissions', () => {
  const placeData = load('src/data/places.ts', {});
  for (const canEdit of [false, true]) for (const status of ['want', 'planned', 'visited', 'skipped']) for (const added of [false, true]) {
    const Screen = load('src/screens/places-screen.tsx', {
      '@/theme/theme-provider': theme,
      'react-native': { ...native, ScrollView: element('div'), TextInput: element('input'), Linking: {} },
      'expo-router': { useRouter: () => ({ push: noop }) },
      'expo-symbols': { SymbolView: () => null },
      '@/components/motion-presence': { MotionPresence: ({ children }) => children },
      '@/components/place-status-icon': { PlaceStatusIcon: () => null },
      '@/components/form-sheet': {}, '@/components/floating-add-button': { FloatingAddButton: () => null },
      '@/constants/design': {}, '@/data/places': placeData,
      '@/components/place-sheet': { PlaceSheet: () => null }, '@/components/date-range-picker': {},
      '@/components/toast': { useToast: () => noop },
      '@/components/trip-header-context': { useTripHeaderHeight: () => 0 },
      '@/components/itinerary-fields': { ItineraryCategoryPicker: () => null },
      '@/data/itinerary': load('src/data/itinerary.ts', {}),
      '@/data/travel-provider': { useTravel: () => ({ canEdit, places: [{ id: 'place', title: '美術館', note: '', location: '', status, reservationStatus: 'not_needed', itineraryItemId: 'plan' }], items: added ? [{ id: 'plan', day: '2026-11-23' }] : [] }) },
    }).default;
    const html = renderToStaticMarkup(React.createElement(Screen));
    assert.equal(html.includes('しおりを見る'), added, `${status}: linked plan visible even to viewers`);
    assert.equal(html.includes('しおりへ'), !added && canEdit, `${status}: add when unlinked or deleted`);
  }
});

test('shared place sheet shows current source details from either entry point and preserves viewer access', () => {
  const placeData = load('src/data/places.ts', {});
  const place = { id: 'place', title: '美術館', note: '最新の展示メモ', location: 'ウィーン', openingHours: '10:00–18:00', status: 'planned', reservationStatus: 'confirmed', referenceLinks: [{ label: '公式サイト', url: 'https://museum.example/' }], itineraryItemId: 'plan' };
  for (const canEdit of [false, true]) for (const fromItinerary of [false, true]) {
    let sheetProps;
    const { PlaceSheet } = load('src/components/place-sheet.tsx', {
      '@/theme/theme-provider': theme,
      'react-native': { ...native, TextInput: element('input'), Linking: {} },
      'expo-symbols': { SymbolView: () => null },
      '@/constants/design': {}, '@/data/places': placeData,
      '@/components/motion-presence': { MotionPresence: ({ children }) => children },
      '@/components/place-status-icon': { PlaceStatusIcon: () => null },
      '@/components/toast': { useToast: () => noop },
      '@/utils/confirm-deletion': {},
      '@/components/form-sheet': { FormSheet: (props) => { sheetProps = props; return React.createElement('section', null, props.children); } },
      '@/components/itinerary-fields': { ItineraryCategoryPicker: () => null },
      '@/data/itinerary': load('src/data/itinerary.ts', {}),
      '@/data/travel-provider': { useTravel: () => ({ canEdit, places: [place], items: [{ id: 'plan', day: '2026-11-23', time: '' }] }) },
    });
    const html = renderToStaticMarkup(React.createElement(PlaceSheet, { place: { ...place, note: '古いメモ' }, onClose: noop, ...(fromItinerary ? { onEditSchedule: noop } : { onPlan: noop }) }));
    for (const detail of ['美術館', '最新の展示メモ', 'ウィーン', '10:00–18:00', '行く予定', '予約済み', '公式サイト', '地図を開く']) assert.ok(html.includes(detail), detail);
    assert.equal(html.includes('古いメモ'), false, 'read the source, not a stale snapshot');
    assert.equal(sheetProps.title, '場所の詳細');
    assert.equal(sheetProps.presentation, 'detail');
    assert.equal(Boolean(sheetProps.onSave), canEdit);
    assert.equal(html.includes('日時を編集'), fromItinerary && canEdit);
    assert.equal(html.includes('時刻未定'), fromItinerary);
    assert.equal(html.includes('しおりを見る'), !fromItinerary);
  }
});
