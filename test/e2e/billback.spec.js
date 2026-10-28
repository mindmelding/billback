/**
 * E2E: upload generated SDG&E-layout PDF → analyze → results + .ics
 * Runs against npm run build output in dist/, served over HTTP.
 */

import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, statSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import ICAL from 'ical.js';
import { generateTestPdf } from '../../scripts/generate-test-pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

test.describe('Billback E2E Flow', () => {
  let server;
  let serverUrl;
  let pdfPath;

  test.beforeAll(async () => {
    pdfPath = join(rootDir, 'test/e2e/test-bill.pdf');
    await generateTestPdf(pdfPath);

    const distPath = join(rootDir, 'dist');
    const port = 8765;

    server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = join(distPath, urlPath === '/' ? 'index.html' : urlPath);

      try {
        const stat = statSync(filePath);
        if (stat.isDirectory()) {
          filePath = join(filePath, 'index.html');
        }
        const ext = extname(filePath);
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.jpg': 'image/jpeg',
          '.pdf': 'application/pdf',
        };
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise((resolve) => server.listen(port, resolve));
    serverUrl = `http://localhost:${port}`;
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('should process bill PDF and export calendar with correct dates', async ({ page }) => {
    test.setTimeout(90000);

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const shotDir = '/opt/cursor/artifacts/screenshots';
    mkdirSync(shotDir, { recursive: true });

    await page.goto(serverUrl);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.privacy-banner')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: join(shotDir, 'upload_desktop_1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(shotDir, 'upload_mobile_390.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles(pdfPath);

    const analyzeButton = page.locator('button:has-text("Analyze My Bills")');
    await expect(analyzeButton).toBeEnabled({ timeout: 10000 });
    await analyzeButton.click();

    await page.waitForURL('**/results.html', { timeout: 60000 });
    await page.waitForSelector('#results', { state: 'visible', timeout: 15000 });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: join(shotDir, 'results_desktop_1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(shotDir, 'results_mobile_390.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });

    const pageContent = await page.textContent('body');

    expect(pageContent).toContain('Nov 13, 2026');
    expect(pageContent).toContain('Nov 19, 2026');
    expect(pageContent).toContain('Nov 27, 2026');
    expect(pageContent).toContain('May 28, 2027');
    expect(pageContent).not.toContain('Nov 12, 2026');
    expect(pageContent).not.toContain('Nov 18, 2026');
    expect(pageContent).not.toContain('Nov 26, 2026');
    expect(pageContent).not.toContain('May 27, 2027');

    expect(pageContent.toLowerCase()).toMatch(/true-up projection/);
    expect(pageContent).toMatch(/last cycle's charges/);
    expect(pageContent).toMatch(/Previous balance \$354\.22 paid 8\/21/);
    expect(pageContent).toMatch(/this cycle's charges \$461\.99/);
    expect(pageContent).not.toMatch(/already paid/);
    expect(pageContent).not.toMatch(/True-up remainder about \$91/);
    expect(pageContent).not.toMatch(/\$563/);
    expect(pageContent).not.toMatch(/\$615/);
    expect(pageContent).not.toMatch(/\$1,377/);
    expect(pageContent).toMatch(/\$1,\d{3}–1,\d{3}/);
    expect(pageContent).toMatch(/Based on one bill/);
    expect(pageContent).toMatch(/CCA generation/);
    expect(pageContent).toMatch(/Climate Credit/);
    expect(pageContent).not.toMatch(/SDCP/i);

    const calendarButton = page.locator('button, a', {
      hasText: /Calendar|\.ics|Download.*iCal/i
    }).first();
    await expect(calendarButton).toBeVisible({ timeout: 5000 });

    const downloadPromise = page.waitForEvent('download');
    await calendarButton.click();
    const download = await downloadPromise;
    const downloadPath = join(__dirname, 'test-calendar.ics');
    await download.saveAs(downloadPath);

    const icsContent = readFileSync(downloadPath, 'utf-8');
    expect(icsContent).toContain('DTSTART;VALUE=DATE:20261113');
    expect(icsContent).toContain('DTSTART;VALUE=DATE:20261119');
    expect(icsContent).toContain('DTSTART;VALUE=DATE:20261127');
    expect(icsContent).toContain('DTSTART;VALUE=DATE:20270528');
    expect(icsContent).not.toMatch(/\(in \d+ days\)/i);

    const requiredDates = ['20261113', '20261119', '20261127', '20270528'];
    for (const yyyymmdd of requiredDates) {
      const veventBlock = icsContent.split('BEGIN:VEVENT').find((block) =>
        block.includes(`DTSTART;VALUE=DATE:${yyyymmdd}`)
      );
      expect(veventBlock, `VEVENT for ${yyyymmdd}`).toBeTruthy();
      expect(veventBlock).toContain('TRIGGER:-P7D');
      expect(veventBlock).toContain('TRIGGER:-P1D');
    }

    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    expect(vevents.length).toBeGreaterThanOrEqual(4);

    expect(pageErrors, `page errors: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});
