# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: billback.spec.js >> Billback E2E Flow >> should process bill PDF and export calendar with correct dates
- Location: test/e2e/billback.spec.js:70:3

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  locator('button:has-text("Analyze My Bills")')
Expected: enabled
Received: disabled
Timeout:  5000ms

Call log:
  - Expect "toBeEnabled" locator('button:has-text("Analyze My Bills")') with timeout 5000ms
  - waiting for locator('button:has-text("Analyze My Bills")')
    14 × locator resolved to <button disabled type="button" id="analyzeBtn" class="btn primary">↵    Analyze My Bills↵  </button>
       - unexpected value "disabled"

```

```yaml
- button "Analyze My Bills" [disabled]
```

# Test source

```ts
  28  |     
  29  |     server = createServer((req, res) => {
  30  |       let filePath = pathJoin(distPath, req.url === '/' ? 'index.html' : req.url);
  31  |       
  32  |       try {
  33  |         const stat = statSync(filePath);
  34  |         if (stat.isDirectory()) {
  35  |           filePath = pathJoin(filePath, 'index.html');
  36  |         }
  37  |         
  38  |         const ext = extname(filePath);
  39  |         const contentTypes = {
  40  |           '.html': 'text/html',
  41  |           '.js': 'application/javascript',
  42  |           '.css': 'text/css',
  43  |           '.json': 'application/json',
  44  |           '.png': 'image/png',
  45  |           '.jpg': 'image/jpeg',
  46  |           '.pdf': 'application/pdf',
  47  |         };
  48  |         
  49  |         const content = readFileSync(filePath);
  50  |         res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
  51  |         res.end(content);
  52  |       } catch (e) {
  53  |         res.writeHead(404);
  54  |         res.end('Not found');
  55  |       }
  56  |     });
  57  |     
  58  |     server.listen(port);
  59  |     serverUrl = `http://localhost:${port}`;
  60  |     console.log(`Test server started at ${serverUrl}`);
  61  |   });
  62  |   
  63  |   test.afterAll(async () => {
  64  |     if (server) {
  65  |       server.close();
  66  |       console.log('Test server stopped');
  67  |     }
  68  |   });
  69  |   
  70  |   test('should process bill PDF and export calendar with correct dates', async ({ page, context }) => {
  71  |     // Set longer timeout for this test
  72  |     test.setTimeout(90000);
  73  |     
  74  |     // Capture console logs for debugging
  75  |     const consoleLogs = [];
  76  |     page.on('console', msg => {
  77  |       const text = msg.text();
  78  |       consoleLogs.push(text);
  79  |       console.log(`Browser console [${msg.type()}]:`, text);
  80  |     });
  81  |     
  82  |     // Capture errors
  83  |     page.on('pageerror', error => {
  84  |       console.error('Browser error:', error.message);
  85  |       console.error('Stack:', error.stack);
  86  |     });
  87  |     
  88  |     // Capture failed requests
  89  |     page.on('requestfailed', request => {
  90  |       console.error('Failed request:', request.url(), request.failure());
  91  |     });
  92  |     
  93  |     // Navigate to the app via HTTP server
  94  |     await page.goto(serverUrl);
  95  |     
  96  |     // Take initial screenshot
  97  |     await page.screenshot({ path: join(__dirname, 'screenshots/01-upload-page.png'), fullPage: true });
  98  |     
  99  |     // Wait for page to load
  100 |     await page.waitForLoadState('domcontentloaded');
  101 |     
  102 |     // Verify privacy banner is visible
  103 |     await expect(page.locator('.privacy-banner')).toBeVisible();
  104 |     
  105 |     // Find file input
  106 |     const fileInput = page.locator('input[type="file"]');
  107 |     await expect(fileInput).toBeAttached();
  108 |     
  109 |     // Upload the test PDF
  110 |     const pdfPath = join(rootDir, 'test/e2e/test-bill.pdf');
  111 |     await fileInput.setInputFiles(pdfPath);
  112 |     
  113 |     // Trigger the change event manually (Playwright might not do this automatically)
  114 |     await page.evaluate(() => {
  115 |       const input = document.querySelector('input[type="file"]');
  116 |       const event = new Event('change', { bubbles: true });
  117 |       input.dispatchEvent(event);
  118 |     });
  119 |     
  120 |     // Wait a moment for the file to be processed
  121 |     await page.waitForTimeout(1000);
  122 |     
  123 |     // Take screenshot after file selected
  124 |     await page.screenshot({ path: join(__dirname, 'screenshots/02-file-selected.png'), fullPage: true });
  125 |     
  126 |     // Wait for the "Analyze My Bills" button to be enabled
  127 |     const analyzeButton = page.locator('button:has-text("Analyze My Bills")');
> 128 |     await expect(analyzeButton).toBeEnabled({ timeout: 5000 });
      |                                 ^ Error: expect(locator).toBeEnabled() failed
  129 |     await page.screenshot({ path: join(__dirname, 'screenshots/03-ready-to-analyze.png'), fullPage: true });
  130 |     
  131 |     await analyzeButton.click();
  132 |     
  133 |     console.log('Analyze button clicked, waiting for navigation...');
  134 |     
  135 |     // Wait for navigation to results.html
  136 |     try {
  137 |       await page.waitForURL('**/results.html', { timeout: 60000 });
  138 |       console.log('Successfully navigated to results page');
  139 |     } catch (e) {
  140 |       console.log('Failed to navigate, checking console logs:');
  141 |       consoleLogs.forEach(log => console.log('  -', log));
  142 |       await page.screenshot({ path: join(__dirname, 'screenshots/04-timeout.png'), fullPage: true });
  143 |       throw new Error(`Navigation timeout: ${e.message}`);
  144 |     }
  145 |     
  146 |     // Take screenshot of results page
  147 |     await page.screenshot({ path: join(__dirname, 'screenshots/04-results-page.png'), fullPage: true });
  148 |     
  149 |     // Verify we're on the results page
  150 |     const pageContent = await page.textContent('body');
  151 |     
  152 |     // Check for critical dates in the results
  153 |     // Nov 19, 2026 - CEA tier change deadline
  154 |     const hasNov19 = pageContent.includes('Nov 19') || pageContent.includes('November 19') || pageContent.includes('11/19');
  155 |     
  156 |     // Nov 27, 2026 - CCA opt-out notice deadline
  157 |     const hasNov27 = pageContent.includes('Nov 27') || pageContent.includes('November 27') || pageContent.includes('11/27');
  158 |     
  159 |     // May 28, 2027 - Switch date
  160 |     const hasMay28 = pageContent.includes('May 28') || pageContent.includes('5/28');
  161 |     
  162 |     // Log what we found
  163 |     console.log('Date checks:');
  164 |     console.log('- Nov 19 (CEA tier deadline):', hasNov19);
  165 |     console.log('- Nov 27 (CCA opt-out notice):', hasNov27);
  166 |     console.log('- May 28 (switch date):', hasMay28);
  167 |     
  168 |     // Assert critical dates are present
  169 |     expect(hasNov19 || hasNov27, 'Should show November deadlines').toBeTruthy();
  170 |     
  171 |     // Look for calendar export button
  172 |     const calendarButton = page.locator('button, a', { 
  173 |       hasText: /Calendar|\.ics|Download.*iCal/i 
  174 |     }).first();
  175 |     
  176 |     // Take screenshot before calendar export
  177 |     await page.screenshot({ path: join(__dirname, 'screenshots/05-before-calendar-export.png'), fullPage: true });
  178 |     
  179 |     // Verify calendar button exists
  180 |     await expect(calendarButton).toBeVisible({ timeout: 5000 });
  181 |     
  182 |     // Set up download listener before clicking
  183 |     const downloadPromise = page.waitForEvent('download');
  184 |     
  185 |     // Click to download calendar
  186 |     await calendarButton.click();
  187 |     
  188 |     // Wait for download
  189 |     const download = await downloadPromise;
  190 |     
  191 |     // Save the downloaded file
  192 |     const downloadPath = join(__dirname, 'test-calendar.ics');
  193 |     await download.saveAs(downloadPath);
  194 |     
  195 |     // Read and validate the .ics file
  196 |     const icsContent = readFileSync(downloadPath, 'utf-8');
  197 |     
  198 |     // Parse with ical.js
  199 |     const jcalData = ICAL.parse(icsContent);
  200 |     const comp = new ICAL.Component(jcalData);
  201 |     const vevents = comp.getAllSubcomponents('vevent');
  202 |     
  203 |     console.log(`\nCalendar validation:`);
  204 |     console.log(`- Total events: ${vevents.length}`);
  205 |     
  206 |     // Check that we have events
  207 |     expect(vevents.length).toBeGreaterThan(0);
  208 |     
  209 |     // Check for specific dates in events
  210 |     let foundNov19 = false;
  211 |     let foundNov27 = false;
  212 |     let foundMay28 = false;
  213 |     let hasAlarms = false;
  214 |     
  215 |     vevents.forEach((vevent) => {
  216 |       const event = new ICAL.Event(vevent);
  217 |       const summary = event.summary;
  218 |       const startDate = event.startDate.toString();
  219 |       
  220 |       console.log(`- Event: ${summary}`);
  221 |       console.log(`  Date: ${startDate}`);
  222 |       
  223 |       // Check dates
  224 |       if (startDate.includes('2026-11-19')) foundNov19 = true;
  225 |       if (startDate.includes('2026-11-27')) foundNov27 = true;
  226 |       if (startDate.includes('2027-05-28')) foundMay28 = true;
  227 |       
  228 |       // Check for alarms
```