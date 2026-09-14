import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const module = { exports: {} };
const js = ts.transpileModule(readFileSync('src/utils/trip-transition.web.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', js)(module, module.exports);
const { createTripTransitionController } = module.exports;
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup({ reduced = false, supported = true, automatic = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://tabi.test/', pretendToBeVisual: true });
  const { document } = dom.window;
  const listeners = new Set();
  dom.window.matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) });
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 300, height: 200 }]; };
  const named = () => [...document.querySelectorAll('[style]')].map((el) => [el, el.style.getPropertyValue('view-transition-name')]).filter(([, name]) => name);
  const home = () => { dom.window.history.replaceState({}, '', '/'); document.body.innerHTML = '<div id="trip-list-ready" data-testid="home-scroll">' + ['a', 'b'].map((id) => `<button id="button-${id}"><div id="trip-ticket-${id}"><div data-testid="trip-ticket-cover"></div><span data-testid="trip-ticket-title">Trip ${id}</span></div></button>`).join('') + '</div>'; };
  const detail = (id = 'a') => { dom.window.history.replaceState({}, '', `/trips/${id}/itinerary`); document.body.innerHTML = `<main id="trip-workspace-${id}"><div data-testid="trip-hero-cover"></div><h1 data-testid="trip-name">Trip ${id}</h1></main>`; };
  const transitions = [];
  if (supported) document.startViewTransition = (update) => {
    const ready = deferred(), finished = deferred();
    const record = { old: named(), new: [], skipped: false, update: undefined };
    let work;
    record.update = () => work ??= Promise.resolve().then(update).then(() => { record.new = named(); ready.resolve(); if (record.skipped) finished.resolve(); }, (error) => { ready.reject(error); finished.reject(error); });
    record.finish = () => { finished.resolve(); };
    record.failReady = () => ready.reject(new Error('snapshot rejected'));
    record.transition = { ready: ready.promise, finished: finished.promise, skipTransition: () => { record.skipped = true; void record.update().then(() => finished.resolve()); } };
    transitions.push(record);
    if (automatic) void record.update();
    return record.transition;
  };
  home();
  const controller = createTripTransitionController(document);
  const cleanup = controller.install();
  return { dom, document, home, detail, named, transitions, controller, listeners, cleanup, setReduced: (value) => { reduced = value; listeners.forEach((fn) => fn()); }, close: () => { cleanup(); dom.window.close(); } };
}

{
  const f = setup();
  f.document.getElementById('trip-list-ready').scrollTop = 360;
  f.controller.setSearch('ウィーン');
  let calls = 0;
  f.controller.run('open', 'a', () => { calls++; f.detail(); });
  assert.equal(f.transitions[0].old.length, 2, 'only the selected cover and title are named');
  assert(f.transitions[0].old.every(([element]) => element.closest('#trip-ticket-a')));
  await tick();
  assert.equal(calls, 1);
  assert.equal(f.transitions[0].new.length, 2);
  assert.equal(f.document.activeElement.dataset.testid, 'trip-name');
  f.transitions[0].finish(); await tick();
  assert.equal(f.named().length, 0);
  f.controller.run('close', 'a', f.home);
  await tick();
  assert.equal(f.document.getElementById('trip-list-ready').scrollTop, 360);
  assert.equal(f.document.activeElement.id, 'button-a');
  assert.equal(f.controller.getSearch(), 'ウィーン');
  f.transitions[1].finish(); await tick();
  assert.equal(f.document.documentElement.hasAttribute('data-trip-transition'), false);
  f.close();
}
for (const options of [{ reduced: true }, { supported: false }]) {
  const f = setup(options);
  let calls = 0;
  f.controller.run('open', 'a', () => { calls++; f.detail(); });
  await tick();
  assert.equal(calls, 1);
  assert.equal(f.transitions.length, 0);
  assert.equal(f.named().length, 0);
  f.close();
}
{
  const f = setup({ automatic: false });
  const calls = [];
  f.controller.run('open', 'a', () => { calls.push('a'); f.detail('a'); });
  f.controller.run('open', 'b', () => { calls.push('b'); f.detail('b'); });
  await f.transitions[1].update(); await tick();
  assert.deepEqual(calls, ['b'], 'a skipped, not-yet-started navigation cannot win later');
  assert.equal(f.document.documentElement.getAttribute('data-trip-transition'), 'open', 'late cleanup must not clear the current transition');
  f.transitions[1].finish(); await tick(); f.close();
}
{
  const f = setup();
  let calls = 0;
  f.document.startViewTransition = (update) => { queueMicrotask(update); throw new Error('unavailable snapshot'); };
  f.controller.run('open', 'a', () => { calls++; f.detail(); });
  await tick();
  assert.equal(calls, 1, 'synchronous failure and a queued callback do not duplicate navigation');
  assert.equal(f.named().length, 0);
  f.close();
}
{
  const f = setup({ automatic: false });
  let calls = 0;
  f.controller.run('open', 'a', () => { calls++; f.detail(); });
  f.transitions[0].failReady();
  await f.transitions[0].update(); await tick();
  assert.equal(calls, 1, 'snapshot rejection must not lose the route change');
  assert.equal(f.named().length, 0);
  f.transitions[0].finish(); await tick(); f.close();
}
{
  const f = setup();
  f.controller.run('open', 'a', () => { f.dom.window.history.replaceState({}, '', '/trips/a/itinerary'); f.document.body.innerHTML = '<p>Loading</p>'; });
  await tick(480);
  assert.equal(f.transitions[0].skipped, true, 'slow/failed route rendering cannot freeze a transition indefinitely');
  assert.equal(f.named().length, 0);
  assert.equal(f.document.documentElement.hasAttribute('data-trip-transition'), false);
  f.close();
}
{
  const f = setup();
  f.document.getElementById('trip-list-ready').scrollTop = 240;
  f.controller.run('open', 'a', () => f.detail()); await tick();
  f.transitions[0].finish(); await tick();
  f.home(); f.dom.window.dispatchEvent(new f.dom.window.PopStateEvent('popstate'));
  f.controller.routeDidRender('/'); await tick();
  assert.equal(f.document.getElementById('trip-list-ready').scrollTop, 240);
  assert.equal(f.transitions.length, 1, 'browser history restores context without hijacking popstate');
  f.close();
}
{
  const f = setup({ automatic: false });
  let calls = 0;
  f.controller.run('open', 'a', () => { calls++; f.detail(); });
  f.dom.window.dispatchEvent(new f.dom.window.PopStateEvent('popstate'));
  await tick();
  assert.equal(calls, 0, 'browser history supersedes a deferred click');
  f.close();
}
{
  const f = setup();
  f.controller.run('open', 'a', () => f.detail()); await tick();
  f.setReduced(true); await tick();
  assert.equal(f.transitions[0].skipped, true);
  assert.equal(f.named().length, 0);
  f.controller.setSearch('private filter');
  f.cleanup();
  assert.equal(f.controller.getSearch(), '');
  assert.equal(f.listeners.size, 0);
  f.dom.window.close();
}
{
  const f = setup();
  f.controller.routeDidRender('/');
  f.detail(); f.controller.routeDidRender('/trips/a/itinerary');
  assert.equal(f.transitions.length, 0, 'direct loads and ordinary tabs do not start a ticket journey');
  f.close();
}
{
  const f = setup();
  f.controller.routeDidRender('/');
  f.controller.run('open', 'a', () => {
    f.detail();
    // Model React's layout commit preceding the browser history effect.
    f.dom.window.history.replaceState({}, '', '/');
    f.controller.routeDidRender('/trips/a/itinerary');
  });
  await tick();
  assert.equal(f.transitions[0].skipped, false, 'a committed route is not cancelled by stale browser history');
  assert.equal(f.transitions[0].new.length, 2);
  f.transitions[0].finish(); await tick(); f.close();
}
{
  const f = setup();
  f.document.getElementById('trip-list-ready').scrollTop = 360;
  const retained = f.document.getElementById('trip-list-ready').cloneNode(true);
  f.controller.run('open', 'a', () => f.detail()); await tick();
  f.transitions[0].finish(); await tick();
  f.controller.run('close', 'a', () => {
    f.home();
    const hidden = f.document.createElement('section');
    hidden.setAttribute('aria-hidden', 'true');
    hidden.append(retained); f.document.body.prepend(hidden);
  });
  await tick();
  const live = f.document.querySelectorAll('#trip-list-ready')[1];
  assert.equal(f.transitions[1].new.length, 2, 'hidden retained screens cannot steal shared element names');
  assert.equal(live.scrollTop, 360);
  assert(live.contains(f.document.activeElement), 'focus returns to the visible copy');
  f.transitions[1].finish(); await tick(); f.close();
}
{
  const f = setup();
  f.controller.run('open', 'a', () => {
    f.detail(); f.document.querySelector('main').className = 'motion-page-content';
  });
  await tick();
  f.transitions[0].finish(); await tick();
  assert(f.document.querySelector('.motion-page-content').hasAttribute('data-trip-journey-page'), 'snapshot cleanup must not restart this page entrance');
  assert.equal(f.document.documentElement.hasAttribute('data-trip-transition'), false);
  f.close();
}
console.log('Trip transitions: shared elements, return position/focus, search, reduced motion, unsupported/failed snapshots, rapid navigation, history, timeout and cleanup passed.');

// Foreground snapshots participate in both directions, remain restricted to
// the selected ticket, and are removed on completion or interruption.
{
  const f = setup();
  const foregroundHome = () => {
    f.home();
    for (const id of ['a', 'b']) {
      const ticket = f.document.getElementById(`trip-ticket-${id}`);
      const face = f.document.createElement('div');
      face.dataset.testid = 'trip-ticket-face';
      face.append(...ticket.childNodes); ticket.append(face);
    }
  };
  const foregroundDetail = () => {
    f.detail();
    const caption = f.document.createElement('div');
    caption.dataset.testid = 'trip-hero-caption';
    caption.textContent = 'Vienna / travel dates';
    f.document.querySelector('main').append(caption);
  };
  foregroundHome();
  f.controller.run('open', 'a', foregroundDetail); await tick();
  assert(f.transitions[0].old.some(([element, name]) => name === 'tabi-trip-ticket-face' && element.closest('#trip-ticket-a')));
  assert(f.transitions[0].old.every(([element]) => element.closest('#trip-ticket-a')), 'unselected ticket foreground remains in root');
  assert(f.transitions[0].new.some(([, name]) => name === 'tabi-trip-caption'));
  f.transitions[0].finish(); await tick();
  assert.equal(f.named().length, 0);
  f.controller.run('close', 'a', foregroundHome); await tick();
  assert(f.transitions[1].old.some(([, name]) => name === 'tabi-trip-caption'));
  assert(f.transitions[1].new.some(([, name]) => name === 'tabi-trip-ticket-face'));
  f.document.dispatchEvent(new f.dom.window.Event('pointerdown')); await tick();
  assert.equal(f.transitions[1].skipped, true);
  assert.equal(f.named().length, 0, 'interrupted foreground must not retain a snapshot name');
  f.close();
}
console.log('Trip foreground: open/close capture, selected ticket isolation and interruption cleanup passed.');
