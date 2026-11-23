const { test, expect } = require('@playwright/test');

async function assertReadableProjects(page) {
  await expect(page.locator('.case')).toHaveCount(5);
  for (const card of await page.locator('.case').all()) {
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
}

for (const mode of ['no JavaScript', 'reduced motion', 'missing GSAP', 'missing plugin', 'mobile']) {
  test(`content remains accessible: ${mode}`, async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      javaScriptEnabled: mode !== 'no JavaScript',
      reducedMotion: mode === 'reduced motion' ? 'reduce' : 'no-preference',
      viewport: { width: mode === 'mobile' ? 390 : 1440, height: 900 }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (mode === 'missing GSAP') await page.route('**/gsap.min.js', route => route.abort());
    if (mode === 'missing plugin') await page.route('**/ScrollTrigger.min.js', route => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('customers.', { timeout: 6000 });
    await assertReadableProjects(page);
    await expect(page.locator('[data-n="30"]')).toHaveText('30+');
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('desktop animation initializes, scrolls through projects and respects live motion changes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#work')).toHaveClass(/is-animated/);
  await page.evaluate(() => {
    const trigger = ScrollTrigger.getAll().find(t => t.vars.pin);
    window.scrollTo(0, trigger.end);
  });
  await expect.poll(async () => page.locator('.case').last().evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1441);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#work')).not.toHaveClass(/is-animated/);
  await assertReadableProjects(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#work')).toHaveClass(/is-animated/);
  expect(errors).toEqual([]);
});
