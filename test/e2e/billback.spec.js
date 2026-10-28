/**
 * E2E test for Billback single-file app
 * Tests the full flow: PDF upload → parse → results → calendar export
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ICAL from 'ical.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

test.describe('Billback E2E Flow', () => {
  let server;
  let serverUrl;
  
  test.beforeAll(async () => {
    // Start a simple HTTP server for the dist folder
    const { createServer } = await import('http');
    const { readFileSync, statSync } = await import('fs');
    const { join: pathJoin, extname } = await import('path');
    
    const distPath = join(rootDir, 'dist');
    const port = 8765;
    
    server = createServer((req, res) => {
      let filePath = pathJoin(distPath, req.url === '/' ? 'index.html' : req.url);
      
      try {
        const stat = statSync(filePath);
        if (stat.isDirectory()) {
          filePath = pathJoin(filePath, 'index.html');
        }
        
        const ext = extname(filePath);
        const contentTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.pdf': 'application/pdf',
        };
        
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(content);
      } catch (e) {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(port);
    serverUrl = `http://localhost:${port}`;
    console.log(`Test server started at ${serverUrl}`);
  });
  
  test.afterAll(async () => {
    if (server) {
      server.close();
      console.log('Test server stopped');
    }
  });
  
  test('should process bill PDF and export calendar with correct dates', async ({ page, context }) => {
    // Set longer timeout for this test
    test.setTimeout(90000);
    
    // Capture console logs for debugging
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      console.log(`Browser console [${msg.type()}]:`, text);
    });
    
    // Capture errors
    page.on('pageerror', error => {
      console.error('Browser error:', error.message);
      console.error('Stack:', error.stack);
    });
    
    // Capture failed requests
    page.on('requestfailed', request => {
      console.error('Failed request:', request.url(), request.failure());
    });
    
    // Navigate to the app via HTTP server
    await page.goto(serverUrl);
    
    // Take initial screenshot
    await page.screenshot({ path: join(__dirname, 'screenshots/01-upload-page.png'), fullPage: true });
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Verify privacy banner is visible
    await expect(page.locator('.privacy-banner')).toBeVisible();
    
    // Find file input
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    
    // Upload the test PDF
    const pdfPath = join(rootDir, 'test/e2e/test-bill.pdf');
    await fileInput.setInputFiles(pdfPath);
    
    // Trigger the change event manually (Playwright might not do this automatically)
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]');
      const event = new Event('change', { bubbles: true });
      input.dispatchEvent(event);
    });
    
    // Wait a moment for the file to be processed
    await page.waitForTimeout(1000);
    
    // Take screenshot after file selected
    await page.screenshot({ path: join(__dirname, 'screenshots/02-file-selected.png'), fullPage: true });
    
    // Wait for the "Analyze My Bills" button to be enabled
    const analyzeButton = page.locator('button:has-text("Analyze My Bills")');
    await expect(analyzeButton).toBeEnabled({ timeout: 5000 });
    await page.screenshot({ path: join(__dirname, 'screenshots/03-ready-to-analyze.png'), fullPage: true });
    
    await analyzeButton.click();
    
    console.log('Analyze button clicked, waiting for navigation...');
    
    // Wait for navigation to results.html
    try {
      await page.waitForURL('**/results.html', { timeout: 60000 });
      console.log('Successfully navigated to results page');
    } catch (e) {
      console.log('Failed to navigate, checking console logs:');
      consoleLogs.forEach(log => console.log('  -', log));
      await page.screenshot({ path: join(__dirname, 'screenshots/04-timeout.png'), fullPage: true });
      throw new Error(`Navigation timeout: ${e.message}`);
    }
    
    // Take screenshot of results page
    await page.screenshot({ path: join(__dirname, 'screenshots/04-results-page.png'), fullPage: true });
    
    // Verify we're on the results page
    const pageContent = await page.textContent('body');
    
    // Check for critical dates in the results
    // Nov 19, 2026 - CEA tier change deadline
    const hasNov19 = pageContent.includes('Nov 19') || pageContent.includes('November 19') || pageContent.includes('11/19');
    
    // Nov 27, 2026 - CCA opt-out notice deadline
    const hasNov27 = pageContent.includes('Nov 27') || pageContent.includes('November 27') || pageContent.includes('11/27');
    
    // May 28, 2027 - Switch date
    const hasMay28 = pageContent.includes('May 28') || pageContent.includes('5/28');
    
    // Log what we found
    console.log('Date checks:');
    console.log('- Nov 19 (CEA tier deadline):', hasNov19);
    console.log('- Nov 27 (CCA opt-out notice):', hasNov27);
    console.log('- May 28 (switch date):', hasMay28);
    
    // Assert critical dates are present
    expect(hasNov19 || hasNov27, 'Should show November deadlines').toBeTruthy();
    
    // Look for calendar export button
    const calendarButton = page.locator('button, a', { 
      hasText: /Calendar|\.ics|Download.*iCal/i 
    }).first();
    
    // Take screenshot before calendar export
    await page.screenshot({ path: join(__dirname, 'screenshots/05-before-calendar-export.png'), fullPage: true });
    
    // Verify calendar button exists
    await expect(calendarButton).toBeVisible({ timeout: 5000 });
    
    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent('download');
    
    // Click to download calendar
    await calendarButton.click();
    
    // Wait for download
    const download = await downloadPromise;
    
    // Save the downloaded file
    const downloadPath = join(__dirname, 'test-calendar.ics');
    await download.saveAs(downloadPath);
    
    // Read and validate the .ics file
    const icsContent = readFileSync(downloadPath, 'utf-8');
    
    // Parse with ical.js
    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    console.log(`\nCalendar validation:`);
    console.log(`- Total events: ${vevents.length}`);
    
    // Check that we have events
    expect(vevents.length).toBeGreaterThan(0);
    
    // Check for specific dates in events
    let foundNov19 = false;
    let foundNov27 = false;
    let foundMay28 = false;
    let hasAlarms = false;
    
    vevents.forEach((vevent) => {
      const event = new ICAL.Event(vevent);
      const summary = event.summary;
      const startDate = event.startDate.toString();
      
      console.log(`- Event: ${summary}`);
      console.log(`  Date: ${startDate}`);
      
      // Check dates
      if (startDate.includes('2026-11-19')) foundNov19 = true;
      if (startDate.includes('2026-11-27')) foundNov27 = true;
      if (startDate.includes('2027-05-28')) foundMay28 = true;
      
      // Check for alarms
      const valarms = vevent.getAllSubcomponents('valarm');
      if (valarms.length > 0) {
        hasAlarms = true;
        console.log(`  Alarms: ${valarms.length}`);
      }
    });
    
    console.log(`\nDate coverage:`);
    console.log(`- Nov 19, 2026: ${foundNov19}`);
    console.log(`- Nov 27, 2026: ${foundNov27}`);
    console.log(`- May 28, 2027: ${foundMay28}`);
    console.log(`- Has alarms: ${hasAlarms}`);
    
    // Assert we found expected dates
    expect(foundNov19 || foundNov27, 'Calendar should include November 2026 deadlines').toBeTruthy();
    expect(hasAlarms, 'Calendar events should have reminder alarms').toBeTruthy();
    
    // Take final screenshot
    await page.screenshot({ path: join(__dirname, 'screenshots/06-final-state.png'), fullPage: true });
    
    console.log('\n✅ E2E test passed!');
    console.log('Screenshots saved to test/e2e/screenshots/');
  });
});
