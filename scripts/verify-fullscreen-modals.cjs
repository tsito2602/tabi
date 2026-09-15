/* Manual browser verification for #150; adapted from the existing
 * fullscreen-modal-verification run (34851081869). No build, installation,
 * deployment or workflow is started here. Use an already-built DEMO dist.
 *
 * node scripts/verify-fullscreen-modals.cjs --engine=webkit --cases=phone
 * Optional: TABI_PLAYWRIGHT_MODULE=/absolute/path/to/playwright
 *           TABI_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium
 *
 * Natural playback only: do not finish/cancel/pause animations, modify their
 * clock, or wrap Element.animate. A browser crash must leave a failure record.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createServer } = require('node:http');
const { parseArgs } = require('node:util');

const scenarios = {
  phone: { width: 390, dark: false, reduced: false },
  dark: { width: 390, dark: true, reduced: false },
  desktop: { width: 1440, dark: false, reduced: false },
  reduced: { width: 390, dark: false, reduced: true },
};
const { values } = parseArgs({ options: {
  engine: { type: 'string', default: 'webkit' },
  cases: { type: 'string', default: 'phone' },
  dist: { type: 'string', default: 'dist' },
  out: { type: 'string' },
  help: { type: 'boolean', default: false },
} });

async function verify(browser, engine, label, baseURL, out) {
  const { width, dark, reduced } = scenarios[label];
  const context = await browser.newContext({
    viewport: { width, height: 844 }, colorScheme: dark ? 'dark' : 'light',
    reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block',
  });
  // Never contact production APIs, sign in, or write real trip data.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return /^https?:$/.test(url.protocol) && url.origin !== baseURL ? route.abort() : route.continue();
  });
  // Observe entry keyframes without changing animation playback or its clock.
  await context.addInitScript(() => {
    window.__sheetEntries = [];
    new MutationObserver(records => {
      for (const { target } of records) {
        const animation = target.getAnimations().find(animation =>
          animation.effect.getKeyframes().some(frame => frame.clipPath));
        if (animation) window.__sheetEntries.push(animation.effect.getKeyframes()[0]);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-detail-motion'] });
  });
  const page = await context.newPage();
  const result = { engine, label, playback: 'natural', status: 'running', phase: 'startup', errors: [], evidence: [] };
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('crash', () => result.errors.push('PAGE_CRASH'));
  const sheet = () => page.locator('[data-testid="form-sheet"]:visible,[data-testid="picker-sheet"]:visible,[data-testid="note-editor"]:visible').last();
  // The longest existing reveal is 280 + 420 + 640 = 1340 ms.
  // Wait for real playback, without touching the Web Animations API.
  const settle = () => page.waitForTimeout(reduced ? 100 : 1600);
  async function shape(name) {
    result.phase = name;
    await sheet().waitFor();
    await settle();
    const state = await sheet().evaluate(el => {
      const viewport = el.closest('[data-testid="form-modal-viewport"],[data-testid="detail-modal-viewport"],[data-testid="note-modal-viewport"],[data-testid="modal-viewport"]');
      return { r: el.getBoundingClientRect().toJSON(), v: viewport.getBoundingClientRect().toJSON(), radius: getComputedStyle(el).borderRadius, width: innerWidth, kind: el.dataset.testid };
    });
    if (state.width < 1024) {
      for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(state.r[key] - state.v[key]) < 1.1, `${name}: ${key} must fill viewport: ${JSON.stringify(state)}`);
      assert.equal(state.radius, '0px', `${name}: no bottom-sheet corners`);
    } else assert(state.r.width < state.width * .85, `${name}: desktop remains bounded`);
    assert(state.r.height > 100 && state.r.width > 200);
    result.evidence.push({ name, ...state });
    if (label === 'phone') await page.screenshot({ path: path.join(out, `${engine}-${name}.png`), animations: 'allow' });
  }
  async function openFrom(trigger, name) {
    result.phase = name;
    await page.evaluate(() => { window.__sheetEntries = []; });
    await trigger.click();
    await shape(name);
    if (!reduced) {
      const entry = await page.evaluate(() => window.__sheetEntries[0]);
      assert(entry, `${name}: entry animation was observed`);
      assert.equal(Number(entry.opacity), 1, `${name}: surface expands opaquely from its trigger`);
      assert(entry.clipPath && entry.clipPath !== 'inset(0px)', `${name}: entry uses the trigger bounds`);
      result.evidence.push({ name: `${name}-origin`, entry });
    }
  }
  async function close(early = false) {
    const element = await sheet().elementHandle();
    await sheet().getByRole('button', { name: '閉じる', exact: true }).click({ force: early });
    await page.waitForFunction(el => !el.isConnected, element, { timeout: 2000 });
    await element.dispose();
  }
  async function nav(name) {
    await page.getByRole(width >= 1024 ? 'link' : 'tab', { name: new RegExp(name + '$') }).click();
    await settle();
  }
  try {
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'サンプルの旅行で試す', exact: true }).click();
    await page.locator('[data-testid="trip-ticket"]:visible').first().click();
    await page.getByTestId('itinerary-scroll').waitFor();
    await settle();
    const item = page.locator('[data-testid="detail-source-title"]:visible').first();
    await item.scrollIntoViewIfNeeded();
    const scroll = page.getByTestId('itinerary-scroll');
    const before = await scroll.evaluate(el => el.scrollTop);
    await item.click();
    await shape('booking-detail');
    await close();
    assert(Math.abs(await scroll.evaluate(el => el.scrollTop) - before) < 1.1, 'closing restores the itinerary scroll position');
    if (!reduced) {
      result.phase = 'close-during-reveal';
      await item.click();
      await sheet().waitFor();
      await page.waitForTimeout(360);
      const opacity = await sheet().getByTestId('sheet-header').evaluate(el => Number(getComputedStyle(el).opacity));
      assert(opacity < .99, 'the early-close case must run before the header reveal has completed');
      await close(true);
      result.evidence.push({ name: 'close-during-reveal', headerOpacity: opacity });
    }
    await openFrom(page.getByRole('button', { name: '予定を追加する', exact: true }), 'new-itinerary');
    await close();
    await nav('行きたい場所');
    await openFrom(page.getByRole('button', { name: '場所を追加', exact: true }), 'new-place');
    await close();
    const card = () => page.getByTestId('place-card').filter({ hasText: '旧市街でカフェ巡り' });
    await card().getByRole('button', { name: '旧市街でカフェ巡りの詳細を開く', exact: true }).click();
    await shape('place-detail'); await close();
    await card().getByRole('button', { name: '旧市街でカフェ巡りのステータスを変更', exact: true }).click();
    await shape('status');
    if (label === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 }); await shape('status-landscape');
      await page.setViewportSize({ width: 390, height: 844 }); await shape('status-portrait');
    }
    await close();
    await card().getByRole('button', { name: /しおりへ/ }).click();
    await shape('planning');
    await sheet().getByRole('button', { name: /^日付 / }).click();
    await shape('date-picker');
    await sheet().getByText('決定', { exact: true }).click();
    await settle(); await shape('planning-after-picker'); await close();
    await nav('予約');
    await openFrom(page.getByRole('button', { name: '予約を追加する', exact: true }), 'new-booking');
    await close();
    await page.getByRole('button', { name: 'サンプル航空 101の乗り継ぎを変更', exact: true }).click();
    await shape('connection');
    await sheet().getByRole('button', { name: '保存', exact: true }).click(); await settle();
    await page.getByRole('button', { name: '旅行メニュー', exact: true }).click();
    await settle();
    const menu = await page.getByTestId('trip-menu').boundingBox();
    assert(menu && menu.width < width && menu.height < 844 * .8, 'the three-dot menu stays compact');
    await page.getByTestId('trip-menu').getByRole('button', { name: /旅行を編集/ }).click();
    await shape('trip-editor');
    const field = sheet().getByRole('textbox').first();
    await field.fill('Fullscreen draft'); await shape('focused-editor');
    if (width < 1024) {
      result.phase = 'simulated-keyboard';
      await page.evaluate(() => {
        const viewport = window.visualViewport;
        Object.defineProperty(viewport, 'height', { configurable: true, value: 430 });
        Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 24 });
        viewport.dispatchEvent(new Event('resize'));
      });
      try {
        await shape('simulated-keyboard-viewport');
        assert.equal(Math.round((await sheet().boundingBox()).height), 430);
      } finally {
        await page.evaluate(() => {
          const viewport = window.visualViewport;
          delete viewport.height; delete viewport.offsetTop;
          viewport.dispatchEvent(new Event('resize'));
        });
      }
      await settle();
    }
    await sheet().getByRole('button', { name: '閉じる', exact: true }).click();
    const dialog = page.getByTestId('discard-dialog');
    await dialog.waitFor(); await settle();
    assert((await dialog.boundingBox()).height < 844 * .8, 'confirmation stays compact');
    await dialog.getByRole('button', { name: '編集を続ける', exact: true }).click(); await settle();
    assert.equal(await field.inputValue(), 'Fullscreen draft');
    await shape('editor-after-confirm');
    await sheet().getByRole('button', { name: '閉じる', exact: true }).click();
    await dialog.getByRole('button', { name: '変更を破棄', exact: true }).click(); await settle();
    await page.locator('[data-testid="form-sheet"]:visible').waitFor({ state: 'hidden' });
    await nav('準備');
    const addPreparation = page.getByRole('button', { name: /^(持ち物|やること)を追加する$/ });
    await openFrom(addPreparation, 'new-preparation'); await close();
    await openFrom(page.getByRole('button', { name: /を編集$/ }).first(), 'edit-preparation'); await close();
    await nav('メモ');
    await openFrom(page.getByRole('button', { name: 'メモを書く', exact: true }).last(), 'new-note');
    await page.getByTestId('note-body').fill('Fullscreen memo\nRetained content');
    await shape('note-editor');
    await sheet().getByRole('button', { name: '完了', exact: true }).click(); await settle();
    await page.getByTestId('note-editor').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Fullscreen memoを開く', exact: true }).click();
    await shape('existing-note');
    assert((await page.getByTestId('note-body').inputValue()).includes('Retained content'));
    await sheet().getByRole('button', { name: '完了', exact: true }).click(); await settle();
    assert.equal(await page.locator('[data-detail-motion]').count(), 0);
    assert.equal(await page.locator('.detail-motion-label').count(), 0, 'no detached title/time copies');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(result.errors, []);
    result.status = 'passed';
    console.log(`PASS ${engine}/${label}: natural playback; fullscreen, nested picker, interrupted close, draft and memo checks`);
  } catch (error) {
    result.status = 'failed'; result.failure = String(error.stack || error);
    console.error(`FAIL ${engine}/${label} at ${result.phase}: ${error.message}`);
    // A screenshot can itself fail after a crash; never lose the original failure.
    await page.screenshot({ path: path.join(out, `${engine}-${label}-failure.png`), animations: 'allow', timeout: 3000 }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(out, `${engine}-${label}.json`), JSON.stringify(result, null, 2) + '\n');
    await context.close().catch(() => {});
  }
  return result.status === 'passed';
}

async function main() {
  if (values.help) {
    console.log('Use an existing isolated DEMO build; no build/install/deploy occurs.\nnode scripts/verify-fullscreen-modals.cjs --engine=webkit --cases=phone [--dist=dist] [--out=/tmp/evidence]\nEngines: webkit,chromium. Cases: phone,dark,desktop,reduced (comma separated).\nPlaywright must already be installed; TABI_PLAYWRIGHT_MODULE can point to it.\nSimulated visualViewport does not verify a real mobile keyboard or safe-area insets.');
    return;
  }
  const engines = values.engine.split(','), cases = values.cases.split(',');
  assert(engines.length && engines.every(engine => ['webkit', 'chromium'].includes(engine)), 'unsupported engine');
  assert(cases.length && cases.every(label => Object.hasOwn(scenarios, label)), 'unsupported case');
  const root = path.resolve(values.dist);
  assert(fs.existsSync(path.join(root, 'index.html')), 'Existing demo dist/index.html is required; this script does not build it.');
  const out = values.out ? path.resolve(values.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'tabi-fullscreen-'));
  fs.mkdirSync(out, { recursive: true });
  const playwright = require(process.env.TABI_PLAYWRIGHT_MODULE || 'playwright');
  const server = createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(400); res.end(); return; }
      if (pathname.startsWith('/api/')) { res.writeHead(503); res.end('Demo-only verification'); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(400); res.end(); }
  });
  let failures = 0;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    for (const engine of engines) {
      let browser;
      try {
        const executablePath = engine === 'chromium' ? process.env.TABI_CHROMIUM_EXECUTABLE : undefined;
        browser = await playwright[engine].launch({ executablePath });
        for (const label of cases) if (!await verify(browser, engine, label, baseURL, out)) failures++;
      } catch (error) {
        failures++;
        fs.writeFileSync(path.join(out, `${engine}-incomplete.json`), JSON.stringify({ engine, status: 'incomplete', error: String(error.stack || error) }, null, 2) + '\n');
        console.error(`INCOMPLETE ${engine}: ${error.message}`);
      } finally { await browser?.close().catch(() => {}); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`Evidence: ${out}`);
  assert.equal(failures, 0, 'all requested cases must complete; missing browsers are not a pass');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
