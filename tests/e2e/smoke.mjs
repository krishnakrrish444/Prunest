// Cross-browser smoke test against the production build, served the same way
// Cloudflare serves it. Run after `npm run build`:
//   npm run e2e              (chromium)
//   npm run e2e -- firefox   (or webkit)
import { spawn } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';

const engine = { chromium, firefox, webkit }[process.argv[2] ?? 'chromium'];
if (!engine) throw new Error(`Unknown browser "${process.argv[2]}". Use chromium, firefox or webkit.`);
const PORT = 8799;
const B = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} [${engine.name()}] ${msg}`);
};
const text = async (p, sel) => ((await p.textContent(sel)) ?? '').replace(/\s+/g, ' ').trim();

const server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], { stdio: 'ignore', detached: true });
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
process.on('exit', stop);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(B + '/')).ok) break;
  } catch {}
  if (i > 60) throw new Error('Preview server did not start. Did you run `npm run build`?');
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await engine.launch();
const open = async (path, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(B + path);
  if (path !== '/' && !path.startsWith('/about')) await p.waitForSelector('[data-tool][data-ready]');
  return p;
};

try {
  const expected = {
    '/raised-bed-soil-calculator': '43.16 cu ft',
    '/mulch-calculator': '39.57 cu ft',
    '/plant-spacing-calculator': '24 plant positions',
  };
  for (const [path, want] of Object.entries(expected)) {
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const p = await open(path, { viewport: vp });
      await p.check('input[value=imperial]', { force: true });
      await p.click('[data-action=example]');
      const head = await text(p, '.headline');
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(head.includes(want) && overflow <= 0 && p.errors.length === 0, `${path} @${vp.width}: example gives ${want}, no overflow, no errors (${head.slice(0, 60)})`);
      await p.context().close();
    }
  }

  // Units: switching to metric and back keeps the exact inputs and the same result.
  let p = await open('/raised-bed-soil-calculator');
  await p.check('input[value=imperial]', { force: true });
  await p.click('[data-action=example]');
  const before = await text(p, '.stats');
  await p.check('input[value=metric]', { force: true });
  await p.check('input[value=imperial]', { force: true });
  const length = await p.getByRole('textbox', { name: /^Inside length/ }).first().inputValue();
  ok((await text(p, '.stats')) === before && length === '8', 'soil: metric round trip restores 8 ft and the same volume');
  await p.getByRole('textbox', { name: /^Inside length/ }).first().fill('abc');
  ok((await p.$('.headline')) === null && (await text(p, '[data-form] .field-error:not([hidden])')).includes('not a number'), 'soil: invalid entry shows an inline error and withholds results');
  // Keyboard: Tab reaches "Try an example" and Enter runs it.
  await p.click('[data-action=reset]');
  await p.focus('[data-action=reset]');
  await p.keyboard.press('Shift+Tab');
  await p.keyboard.press('Enter');
  ok((await p.$('.headline')) !== null, 'keyboard: Try an example works from the keyboard');
  // Collapsible sections and print view.
  await p.click('.fold-btn >> nth=0');
  ok((await p.getAttribute('.fold-btn >> nth=0', 'aria-expanded')) === 'true', 'results: breakdown opens');
  await p.emulateMedia({ media: 'print' });
  const shown = await p.evaluate(() => [...document.querySelectorAll('[data-form], header, footer, [data-action]')].filter((e) => e.getClientRects().length).length);
  ok(shown === 0 && (await p.isVisible('.print-only')), 'print: controls hidden, Prunest header shown');
  await p.context().close();

  // Dates do not shift with the visitor's timezone.
  const seen = [];
  for (const timezoneId of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Pacific/Pago_Pago']) {
    p = await open('/seed-starting-calculator', { timezoneId });
    await p.fill('input[type=date]', '2027-05-10');
    const row = p.locator('[data-lines] .row-card').first();
    await row.getByRole('textbox', { name: /^Offset/ }).fill('6');
    await row.getByRole('textbox', { name: /^Up to/ }).fill('8');
    seen.push(await text(p, '.headline'));
    await p.context().close();
  }
  ok(seen.every((s) => s === seen[0]) && seen[0].includes('Mar 15, 2027') && seen[0].includes('Mar 29, 2027'), `seed: 6–8 weeks before 10 May 2027 is 15–29 Mar in UTC+14 and UTC−11 (${seen[0]})`);

  p = await open('/seed-starting-calculator');
  await p.click('[data-action=example]');
  ok((await p.locator('[data-results] tbody tr').count()) === 8 && (await p.locator('.tl-ref').count()) === 2, 'seed: example builds 8 tasks from two reference dates');
  await p.context().close();

  const r = await fetch(B + '/no-such-page');
  ok(r.status === 404, 'routing: unknown address returns 404');
} finally {
  await browser.close();
  stop();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
