import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Focused component/Hook regression harness, not a browser or React renderer.
// Ref proxies reject render-phase access. Separate render/commit steps let us
// check that discarded renders cannot publish callbacks or trip snapshots.
function harness() {
  let committed = [], draft, index = 0, phase = 'idle', rerender = false;
  const next = make => {
    const at = index++;
    if (!draft[at]) draft[at] = make();
    return [draft[at], at];
  };
  const sameDeps = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const effect = (fn, deps) => {
    const [entry] = next(() => ({ kind: 'effect' }));
    entry.next = fn; entry.nextDeps = deps;
  };
  const hooks = {
    createContext: value => ({ Provider: 'provider', value }),
    useContext: context => context.value,
    useState(initial) {
      const [entry, at] = next(() => ({ kind: 'state', value: typeof initial === 'function' ? initial() : initial }));
      return [entry.value, update => {
        const target = phase === 'render' ? draft[at] : committed[at];
        const value = typeof update === 'function' ? update(target.value) : update;
        if (!Object.is(value, target.value)) {
          target.value = value;
          if (phase === 'render') rerender = true;
        }
      }];
    },
    useRef(initial) {
      const [entry] = next(() => ({ kind: 'ref', value: new Proxy({ current: initial }, {
        get(target, key) { if (key === 'current') assert.notEqual(phase, 'render', 'ref read during render'); return target[key]; },
        set(target, key, value) { if (key === 'current') assert.notEqual(phase, 'render', 'ref write during render'); target[key] = value; return true; },
      }) }));
      return entry.value;
    },
    useMemo(fn, deps) {
      const [entry] = next(() => ({ kind: 'memo' }));
      if (!sameDeps(entry.deps, deps)) { entry.value = fn(); entry.deps = deps; }
      return entry.value;
    },
    useEffect: effect,
    useLayoutEffect: effect,
  };
  return {
    hooks,
    render(render, props = {}, { commit = true, node = {} } = {}) {
      draft = committed.map(entry => ({ ...entry }));
      let tree;
      try {
        for (let pass = 0; ; pass++) {
          assert(pass < 12, 'scope reset must settle without an infinite render');
          phase = 'render'; index = 0; rerender = false; tree = render(props);
          if (!rerender) break;
        }
        phase = 'commit';
        if (commit) {
          committed = draft;
          visit(tree, value => { if (value.props?.ref) value.props.ref.current = node; });
          for (const entry of committed) if (entry.kind === 'effect' && !sameDeps(entry.deps, entry.nextDeps)) {
            entry.cleanup?.(); entry.cleanup = entry.next(); entry.deps = entry.nextDeps;
          }
        }
        return tree;
      } finally { phase = 'idle'; draft = undefined; }
    },
    unmount() { for (const entry of committed) if (entry.kind === 'effect') entry.cleanup?.(); committed = []; },
  };
}
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
function visit(tree, fn) {
  if (Array.isArray(tree)) { tree.forEach(value => visit(value, fn)); return; }
  if (!tree || typeof tree !== 'object') return;
  fn(tree); visit(tree.props?.children, fn);
}
function find(tree, predicate) { let result; visit(tree, value => { if (!result && predicate(value)) result = value; }); assert(result, 'expected rendered element'); return result; }
const byType = (tree, type) => find(tree, value => value.type === type);
const compileCache = new Map();
function loader(mocks) {
  const modules = new Map();
  const load = file => {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    let code = compileCache.get(file);
    if (!code) {
      code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
      } }).outputText;
      compileCache.set(file, code);
    }
    const module = { exports: {} }; modules.set(file, module);
    new Function('require', 'module', 'exports', code)(name => {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      const target = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null;
      assert(target, `unexpected external module: ${name}`);
      return load(/\.tsx?$/.test(target) ? target : `${target}.ts`);
    }, module, module.exports);
    return module.exports;
  };
  return load;
}
const theme = { usePalette: () => ({ sky: '#eef' }), useThemedStyles: create => create({}) };
const native = { View: 'View', Text: 'Text', StyleSheet: { create: value => value, absoluteFill: {} } };
const noop = () => {};
function travelFixture() {
  let count = 0, failLink = false;
  const calls = [];
  let data = {
    selectedTrip: { id: 'trip-a', startsOn: '2026-11-23', endsOn: '2026-11-25', role: 'owner' },
    canEdit: true, items: [], bookings: [],
    places: [{ id: 'cafe', title: 'カフェ', note: '場所のメモ', status: 'want', location: '', openingHours: '', reservationStatus: 'not_needed' }],
  };
  const actions = {
    createItem(input) { const id = `new-${++count}`; calls.push(['create', id]); data = { ...data, items: [...data.items, { id, ...input }] }; return id; },
    updateItem(id, input) { calls.push(['update', id]); data = { ...data, items: data.items.map(item => item.id === id ? { ...item, ...input } : item) }; },
    deleteItem(id) { calls.push(['delete', id]); data = { ...data, items: data.items.filter(item => item.id !== id) }; },
    updatePlace(id, input) { calls.push(['link', id]); if (failLink) throw new Error('リンク保存失敗'); data = { ...data, places: data.places.map(place => place.id === id ? { ...place, ...input } : place) }; },
  };
  return { calls, get data() { return data; }, set data(value) { data = value; }, set failLink(value) { failLink = value; }, snapshot: () => ({ ...data, ...actions }) };
}
function composerFixture() {
  const r = harness(), f = travelFixture();
  const load = loader({ react: r.hooks, '@/data/travel-provider': { useTravel: f.snapshot } });
  const { useItineraryComposer } = load('src/hooks/use-itinerary-composer.ts');
  return { r, f, render: options => r.render(useItineraryComposer, {}, options) };
}
const source = { kind: 'place', id: 'cafe' };
const emptySlot = { day: '2026-11-23', beforeKey: null, afterKey: null };
function ready(c) { c.render().toggle(); let ui = c.render(); ui.select(source); return c.render(); }

test('composer renders without refs and publishes undo status after save, undo and dismissal', () => {
  const c = composerFixture(); let ui = ready(c); ui.drop(source, emptySlot); ui = c.render();
  assert.equal(ui.canUndo, true); assert.equal(ui.linkPending, false); assert.equal(ui.placedId, 'new-1');
  assert.equal(c.f.data.places.length, 1); assert.equal(c.f.data.places[0].note, '場所のメモ');
  ui.undo(); ui = c.render(); assert.equal(ui.canUndo, false); assert.equal(c.f.data.items.length, 0);
  ui.select(source); ui = c.render(); ui.drop(source, emptySlot); ui = c.render();
  assert.equal(ui.canUndo, true); ui.dismissNotice(); ui = c.render();
  assert.equal(ui.canUndo, false); assert.equal(ui.notice, ''); assert.equal(c.f.data.items.length, 1);
});

test('composer exposes a failed link, blocks other selections, and retries without creating twice', () => {
  const c = composerFixture(); c.f.failLink = true; let ui = ready(c); ui.drop(source, emptySlot); ui = c.render();
  assert.equal(ui.linkPending, true); assert.equal(ui.canUndo, false); assert.match(ui.error, /リンク保存失敗/);
  ui.select(null); ui = c.render(); assert.match(ui.error, /先に再試行/);
  ui.retry(); ui = c.render(); assert.equal(ui.linkPending, true);
  c.f.failLink = false; ui.retry(); ui = c.render();
  assert.equal(ui.linkPending, false); assert.equal(ui.canUndo, true);
  assert.equal(c.f.calls.filter(call => call[0] === 'create').length, 1);
});

test('composer reset is scoped to a committed trip or permission change', () => {
  const c = composerFixture(); let ui = ready(c); ui.drop(source, emptySlot); ui = c.render();
  const staleUndo = ui.undo;
  c.f.data = { ...c.f.data, canEdit: false }; ui = c.render();
  assert.equal(ui.enabled, false); assert.equal(ui.canUndo, false); assert.equal(ui.notice, '');
  staleUndo(); ui = c.render(); assert.equal(c.f.calls.filter(call => call[0] === 'delete').length, 0);
  c.f.data = { ...c.f.data, canEdit: true }; ui = c.render(); assert.equal(ui.enabled, false);
  ui.toggle(); ui = c.render(); ui.select({ kind: 'item', id: 'new-1' }); ui = c.render();
  c.f.data = { ...c.f.data, selectedTrip: { ...c.f.data.selectedTrip, id: 'trip-b' } }; ui = c.render();
  assert.equal(ui.enabled, false); assert.equal(ui.source, null); assert.equal(ui.pending, null); assert.equal(ui.canUndo, false);
});

test('a discarded trip render cannot publish data to an ongoing placement', () => {
  const c = composerFixture(); const ui = ready(c), original = c.f.data;
  c.f.data = { ...original, selectedTrip: { ...original.selectedTrip, id: 'trip-b' } };
  c.render({ commit: false }); c.f.data = original;
  ui.drop(source, emptySlot);
  assert.equal(c.f.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(c.render().canUndo, true);
});

test('committed data changes are used by pointer-triggered placements', () => {
  const c = composerFixture(); let ui = ready(c);
  c.f.data = { ...c.f.data, places: c.f.data.places.map(place => ({ ...place, title: '更新したカフェ' })) }; ui = c.render();
  ui.drop(source, emptySlot); assert.equal(c.f.data.items[0].title, '更新したカフェ');
});

test('time conflicts remain unsaved until confirmed and cancelled edits do not write', () => {
  const c = composerFixture();
  c.f.data = { ...c.f.data, items: [
    { id: 'early', title: '美術館', kind: '予定', day: emptySlot.day, time: '10:00', note: 'メモ' },
    { id: 'late', title: 'ホテル', kind: '予定', day: emptySlot.day, time: '14:00', note: '' },
  ] };
  c.render().toggle(); let ui = c.render(); const move = { kind: 'item', id: 'early' }, slot = { ...emptySlot, afterKey: 'item-late' };
  ui.select(move); ui = c.render(); ui.drop(move, slot); ui = c.render(); assert(ui.pending); assert.equal(c.f.calls.length, 0);
  ui.cancel(); ui = c.render(); assert.equal(ui.pending, null); assert.equal(c.f.calls.length, 0);
  ui.select(move); ui = c.render(); ui.drop(move, slot); ui = c.render(); ui.confirmTime('15:00'); ui = c.render();
  assert.equal(ui.pending, null); assert.equal(ui.canUndo, true); assert.equal(c.f.data.items[0].time, '15:00'); assert.equal(c.f.data.items[0].note, 'メモ');
});

function sheetFixture() {
  const r = harness(), f = travelFixture();
  const load = loader({ react: r.hooks, 'react-native': native, '@/theme/theme-provider': theme, '@/constants/design': {},
    '@/data/travel-provider': { useTravel: f.snapshot }, '@/components/form-sheet': { FormSheet: 'FormSheet' },
    '@/components/date-range-picker': { DateRangePicker: 'DateRangePicker' }, '@/components/itinerary-fields': { ItineraryCategoryPicker: 'CategoryPicker' },
  });
  const { PlacePlanSheet } = load('src/components/place-plan-sheet.tsx'); const completions = [];
  return { f, r, completions, render: () => r.render(PlacePlanSheet, { placeId: 'cafe', onClose: noop, onComplete: (...args) => completions.push(args) }) };
}

test('place sheet keeps its initial draft for dirty checking and rejects a different trip', () => {
  const c = sheetFixture(); let tree = c.render(); assert.equal(tree.props.dirty, false);
  byType(tree, 'DateRangePicker').props.onChange({ startDate: '2026-11-24', startTime: '13:00' }); tree = c.render();
  assert.equal(tree.props.dirty, true); assert.equal(byType(tree, 'DateRangePicker').props.startDate, '2026-11-24');
  c.f.data = { ...c.f.data, selectedTrip: { ...c.f.data.selectedTrip, startsOn: '2026-11-22' } }; tree = c.render();
  assert.equal(tree.props.dirty, true); assert.equal(byType(tree, 'DateRangePicker').props.startDate, '2026-11-24');
  c.f.data = { ...c.f.data, selectedTrip: { ...c.f.data.selectedTrip, id: 'trip-b' } }; tree = c.render();
  assert.equal(tree.props.canSave, false); tree.props.onSave(); assert.equal(c.f.calls.length, 0);
});

test('place sheet preserves retry identity and prevents repeated save navigation', () => {
  const c = sheetFixture(); c.f.failLink = true; c.render().props.onSave(); let tree = c.render();
  assert.equal(tree.props.saveLabel, '再試行'); assert.equal(tree.props.dirty, true); assert.equal(byType(tree, 'DateRangePicker').props.disabled, true);
  c.f.failLink = false; tree.props.onSave(); tree.props.onSave();
  assert.equal(c.f.calls.filter(call => call[0] === 'create').length, 1); assert.equal(c.completions.length, 1);
});

test('place sheet still blocks mutations after permission revocation or source deletion', () => {
  for (const missing of [false, true]) {
    const c = sheetFixture(); c.render();
    c.f.data = { ...c.f.data, ...(missing ? { places: [] } : { canEdit: false }) };
    const tree = c.render(); assert.equal(tree.props.canSave, false); tree.props.onSave(); assert.equal(c.f.calls.length, 0);
  }
});

test('pointer subscriptions use committed callbacks without reattaching on every render', () => {
  const r = harness(), calls = []; let callbacks, attaches = 0, detaches = 0;
  const load = loader({ react: r.hooks, '@/utils/planner-pointer.web': { attachPlannerPointer(node, handlers) { attaches++; callbacks = handlers; return () => { detaches++; }; } } });
  const { PlannerDrag } = load('src/components/planner-drag.web.tsx');
  const props = name => ({ enabled: true, source: null, onSelect: () => calls.push(name), onDrop: () => calls.push(name), onDay: () => calls.push(name) });
  r.render(PlannerDrag, props('first')); callbacks.start(source);
  r.render(PlannerDrag, props('discarded'), { commit: false }); callbacks.drop(source, emptySlot);
  r.render(PlannerDrag, props('latest')); callbacks.day(emptySlot.day); callbacks.cancel();
  assert.deepEqual(calls, ['first', 'first', 'latest', 'latest']); assert.equal(attaches, 1);
  r.render(PlannerDrag, { ...props('off'), enabled: false }); assert.equal(detaches, 1);
  r.unmount(); assert.equal(detaches, 1);
});

function arrivalFixture() {
  const r = harness(), values = [], timings = [], delays = []; let starts = 0, stops = 0, interrupts = 0;
  class Value {
    constructor(initial) { this.value = initial; values.push(this); }
    setValue(next) { this.value = next; }
    stopAnimation() {}
    interpolate(options) { return { value: this, options }; }
  }
  const motion = () => ({ start() { starts++; }, stop() { stops++; } });
  const Animated = { Value, View: 'AnimatedView', timing(value, options) { timings.push(options); return motion(); }, delay(ms) { delays.push(ms); return motion(); }, sequence: motion, parallel: motion };
  const load = loader({ react: r.hooks, '@/theme/theme-provider': theme, 'react-native': { ...native, Animated, Easing: { bezier: (...values) => values }, Platform: { OS: 'web' } } });
  const { ItineraryArrivalRow } = load('src/components/itinerary-arrival-row.tsx');
  return { r, values, timings, delays, get starts() { return starts; }, get stops() { return stops; }, get interrupts() { return interrupts; },
    render: props => r.render(ItineraryArrivalRow, { reduced: false, onLayout: noop, onInterrupt() { interrupts++; }, ...props }),
  };
}

test('arrival values remain stable across renders, preserve timings, and stop on interruption', () => {
  const c = arrivalFixture(); let tree = c.render({ waiting: true }); const initial = [...c.values];
  assert.equal(c.values.length, 3); assert.equal(tree.props.children[1].props.style.opacity, 0);
  tree = c.render({ entering: true, sequence: 1 }); c.render({ entering: true, sequence: 1, children: 'updated' });
  assert.deepEqual(c.values, initial); assert.equal(c.starts, 1); assert.deepEqual(c.timings.map(t => t.duration), [560, 360, 420]);
  tree.props.onTouchStart(); assert.equal(c.interrupts, 1); assert.deepEqual(c.values.map(v => v.value), [1, 1, 0]);
  c.r.unmount(); assert.equal(c.stops, 1);
});

test('reduced motion keeps the arrival visible with no spatial animation', () => {
  const c = arrivalFixture(); const tree = c.render({ waiting: true, entering: true, reduced: true, sequence: 1 });
  assert.equal(tree.props.children[1].props.style.opacity, c.values[1]); assert.deepEqual(c.values.map(v => v.value), [1, 1, 1]);
  assert.deepEqual(c.timings.map(t => t.duration), [0, 0, 0]); assert.deepEqual(c.delays, [900]); c.r.unmount();
});
