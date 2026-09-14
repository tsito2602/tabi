import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><main></main></body>', { url: 'https://tabi.test/', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle });
let reduced = false;
const mediaListeners = new Set();
window.matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_, listener) => mediaListeners.add(listener), removeEventListener: (_, listener) => mediaListeners.delete(listener) });
Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
window.HTMLElement.prototype.getBoundingClientRect = function () {
  const top = Number(this.dataset.top ?? 40) - (this.closest('[data-testid="home-scroll"]')?.scrollTop ?? 0);
  return { x: 20, y: top, top, bottom: top + 32, left: 20, right: 320, width: 300, height: 32 };
};
const module = { exports: {} };
const js = ts.transpileModule(readFileSync('src/utils/trip-navigation.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
new Function('module', 'exports', js)(module, module.exports);
const { navigateTrip, installTripHistory } = module.exports;
const cleanupHistory = installTripHistory();
const host = document.querySelector('main');
function ticket(id = 'a', photo = true, top = 40) {
  return `<div data-testid="home-scroll"><button><section id="trip-ticket-${id}" data-top="${top}"><div data-testid="trip-ticket-art">${photo ? 'photo' : ''}</div><h2 data-testid="trip-ticket-title">Long travel title — two lines</h2></section></button></div>`;
}
function workspace(id = 'a', photo = true) {
  return `<section id="trip-workspace-${id}" data-testid="trip-workspace"><h1 data-testid="trip-title">Long travel title</h1>${photo ? '<div data-testid="trip-hero-art">photo</div>' : ''}<div data-testid="itinerary-scroll">journal</div></section>`;
}
const names = () => [...document.querySelectorAll('[style]')].map((element) => element.style.viewTransitionName).filter(Boolean);
let running;
function mockTransitions({ reject = false } = {}) {
  document.startViewTransition = (update) => {
    const before = names();
    let finish, skipped = false;
    const finished = new Promise((resolve) => { finish = resolve; });
    const updateCallbackDone = Promise.resolve().then(update);
    const ready = updateCallbackDone.then(() => { if (reject) throw new Error('snapshot unavailable'); });
    running = { before, finished, ready, updateCallbackDone, finish, skipTransition: () => { skipped = true; }, get skipped() { return skipped; } };
    void updateCallbackDone.then(() => { if (skipped || reject) finish(); });
    return running;
  };
}
const settled = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };
const complete = async () => { await running.updateCallbackDone; running.finish(); await running.finished; await settled(); };

mockTransitions();
host.innerHTML = ticket('a', true, 500);
document.querySelector('[data-testid="home-scroll"]').scrollTop = 240;
let navigations = 0;
navigateTrip('a', 'open', () => { navigations++; host.innerHTML = workspace(); });
assert.deepEqual(running.before.sort(), ['tabi-trip-art', 'tabi-trip-title']);
await running.updateCallbackDone;
assert.equal(new Set(names()).size, names().length, 'snapshot names must be unique');
assert(names().includes('tabi-trip-paper'));
assert.equal(navigations, 1);
await complete();
assert.equal(names().length, 0);
assert.equal(document.documentElement.dataset.tripTransition, undefined);
assert.equal(mediaListeners.size, 0);

navigateTrip('a', 'close', () => { host.innerHTML = ticket('a', true, 500); });
await complete();
assert.equal(document.querySelector('[data-testid="home-scroll"]').scrollTop, 240, 'return restores list position');

// A retained, hidden home is not the scroll container of the visible ticket.
host.innerHTML = `<aside aria-hidden="true">${ticket('a', true, 900)}</aside>` + ticket('a', true, 500);
document.querySelector('[aria-hidden="true"] [data-testid="home-scroll"]').scrollTop = 10;
document.querySelector('main > [data-testid="home-scroll"]').scrollTop = 240;
navigateTrip('a', 'open', () => { host.innerHTML = workspace(); });
await complete();
navigateTrip('a', 'close', () => { host.innerHTML = `<aside aria-hidden="true">${ticket('a', true, 900)}</aside>` + ticket('a', true, 500); });
await complete();
assert.equal(document.querySelector('main > [data-testid="home-scroll"]').scrollTop, 240, 'restore the visible ticket, not an old hidden screen');
assert.equal(document.querySelector('[aria-hidden="true"] [data-testid="home-scroll"]').scrollTop, 0);
host.innerHTML = ticket('a', true, 500);

// Removing the transaction flag must not restart the default route reveal.
host.classList.add('motion-page-content');
navigateTrip('a', 'open', () => { host.innerHTML = workspace().replace('data-testid="itinerary-scroll"', 'class="motion-page-content" data-testid="itinerary-scroll"'); });
await complete();
assert.equal(host.dataset.tripReveal, 'settled');
assert.equal(document.querySelector('[data-testid="itinerary-scroll"]').dataset.tripReveal, 'settled');
host.classList.remove('motion-page-content');
delete host.dataset.tripReveal;
host.innerHTML = ticket('a', true, 500);

// Retained Stack screens must lose their names before the new peer is named.
navigateTrip('a', 'open', () => { document.querySelector('[data-testid="home-scroll"]').setAttribute('aria-hidden', 'true'); host.insertAdjacentHTML('beforeend', workspace()); });
await running.updateCallbackDone;
assert.equal(document.querySelector('[aria-hidden="true"] [data-testid="trip-ticket-title"]').style.viewTransitionName, '');
assert.equal(names().filter((name) => name === 'tabi-trip-title').length, 1);
await complete();

host.innerHTML = ticket();
navigations = 0;
navigateTrip('a', 'open', () => { navigations++; host.innerHTML = workspace(); });
navigateTrip('a', 'open', () => navigations++);
await complete();
assert.equal(navigations, 1, 'double activation must not push two routes');

// Interruptions do not prevent navigation; a new navigation supersedes stale work.
host.innerHTML = ticket();
navigateTrip('a', 'open', () => { host.innerHTML = workspace(); });
window.dispatchEvent(new window.Event('pointerdown'));
await complete();
assert(running.skipped);
assert.equal(names().length, 0);
host.innerHTML = ticket('a') + ticket('b');
let stale = 0, latest = 0;
navigateTrip('a', 'open', () => stale++);
const old = running;
navigateTrip('b', 'open', () => { latest++; host.innerHTML = workspace('b'); });
await old.updateCallbackDone;
await complete();
assert.equal(stale, 0);
assert.equal(latest, 1);

// Missing artwork, reduced motion, failed snapshots, direct links and no API.
host.innerHTML = ticket('a', false);
navigateTrip('a', 'open', () => { host.innerHTML = workspace('a', false); });
await complete();
reduced = true;
let snapshots = 0;
document.startViewTransition = () => { snapshots++; throw new Error('must not animate'); };
host.innerHTML = ticket();
navigateTrip('a', 'open', () => { host.innerHTML = workspace(); });
assert.equal(snapshots, 0);
reduced = false;
mockTransitions({ reject: true });
host.innerHTML = ticket();
navigateTrip('a', 'open', () => { host.innerHTML = workspace(); });
await complete();
assert.equal(names().length, 0);
delete document.startViewTransition;
navigateTrip('a', 'close', () => { host.innerHTML = ticket('a', true, 500); });
await new Promise((resolve) => setTimeout(resolve, 60));
assert.equal(document.documentElement.dataset.tripTransition, undefined);
mockTransitions();
host.innerHTML = workspace('direct');
let direct = 0;
navigateTrip('direct', 'close', () => { direct++; host.innerHTML = ticket('direct'); });
assert.equal(direct, 1);
assert.equal(document.documentElement.dataset.tripTransition, undefined);

// Missing destination has a hard deadline and releases all names/listeners.
host.innerHTML = ticket();
navigateTrip('a', 'open', () => { host.innerHTML = '<p>Route unavailable</p>'; });
await running.updateCallbackDone;
assert(running.skipped);
await complete();
assert.equal(names().length, 0);
assert.equal(mediaListeners.size, 0);
cleanupHistory();
dom.window.close();
console.log('Trip opening: round-trip, visible scroll restoration, retained routes, settled pages, duplicate activation, interruption, supersession, no photo, reduced motion, failed snapshots, no API, direct links and deadline passed.');
