/* Integration check (requires Playwright): node tests/receipt-ocr-offline.cjs
 * No HTTP server. Fresh browser context, offline from the first page load.
 * Optional: TILIWEB_TEST_BROWSER=msedge; TILIWEB_TEST_INDEX=absolute/path/index.html
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: process.env.TILIWEB_TEST_BROWSER || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const network = [], errors = [];
    context.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    const index = process.env.TILIWEB_TEST_INDEX || path.resolve(__dirname, '..', 'index.html');
    await page.goto(pathToFileURL(index).href);
    await page.evaluate(() => {
      const period = getPeriodById(getSettings().currentPeriodId);
      period.startDate = '2026-01-01'; period.endDate = '2026-12-31'; savePeriod(period);
    });
    assert.equal(await page.evaluate(() => !!window.TiliWebLocalOcr), false, 'OCR should load lazily');
    await page.locator('#btnReceiptOcr').click();
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 700;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black'; ctx.font = '32px monospace';
      ['RAUTAKAUPPA OY', '18.10.2026 12:34', '', 'Tarvikkeet        125,50',
        'YHTEENSA          125,50', 'ALV 25,5%          25,50', 'KORTTI            125,50']
        .forEach((line, i) => ctx.fillText(line, 50, 70 + i * 65));
      return canvas.toDataURL().split(',')[1];
    });
    const file = { name: 'offline-receipt.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('[data-file]').setInputFiles(file);
      await page.waitForFunction(() => !document.querySelector('[data-accept]').disabled, {}, { timeout: 150000 });
      assert.match(await page.locator('[data-status]').textContent(), /Tunnistus valmis/);
      assert.equal(await page.locator('[data-date-choice]').inputValue(), '2026-10-18');
      assert.equal(await page.locator('[data-amount]').inputValue(), '125,50');
      assert.equal(await page.locator('[data-vat]').inputValue(), '25,50');
      if (attempt === 0) { await page.locator('[data-close]').click(); await page.locator('#btnReceiptOcr').click(); }
    }
    await page.locator('[data-accept]').click();
    const state = await page.evaluate(() => TilitinApp.getState());
    assert.equal(state.entries[0].amountDebit, 125.5);
    assert.equal(state.entries[0].vatAmount, 25.5);
    assert.equal(state.entries[1].amountCredit, 125.5);
    assert.deepEqual(network, [], 'OCR must not request external resources');
    assert.deepEqual(errors, []);
    console.log('PASS: file://, fresh offline browser, real OCR twice, date/total/VAT, balanced draft, no network requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
