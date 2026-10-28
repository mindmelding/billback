#!/usr/bin/env node
/**
 * Build single-file billback.html that works offline via file://
 * Inlines PDF.js, all ES modules, and styles into one self-contained HTML file
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('📦 Building single-file billback.html...\n');

// Read all source files
console.log('Reading source files...');
const uploadHtml = readFileSync(join(rootDir, 'app/upload.html'), 'utf-8');
const resultsHtml = readFileSync(join(rootDir, 'app/results.html'), 'utf-8');

// Read all JS modules
const parser = readFileSync(join(rootDir, 'src/parser.js'), 'utf-8');
const engine = readFileSync(join(rootDir, 'src/engine.js'), 'utf-8');
const rates = readFileSync(join(rootDir, 'src/rates.js'), 'utf-8');
const meterReadSchedule = readFileSync(join(rootDir, 'src/meterReadSchedule.js'), 'utf-8');
const optOutTiming = readFileSync(join(rootDir, 'src/optOutTiming.js'), 'utf-8');
const actionPlan = readFileSync(join(rootDir, 'src/actionPlan.js'), 'utf-8');
const calendar = readFileSync(join(rootDir, 'src/calendar.js'), 'utf-8');

console.log('✓ Source files read\n');

// Bundle all JS modules into a single inline script
// Remove export statements and make everything global
console.log('Bundling JavaScript modules...');

// Function to convert exports to global assignments
function convertExports(code) {
  return code
    // Remove multiline imports first (with optional whitespace and newlines)
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?/g, '')
    // Remove single-line imports
    .replace(/import\s+.+\s+from\s+['"][^'"]+['"]\s*;?/g, '')
    // Handle async function exports: export async function name(...) { -> window.name = async function(...) {
    .replace(/export\s+async\s+function\s+(\w+)\s*\(/g, 'window.$1 = async function(')
    // Handle function exports: export function name(...) { -> window.name = function(...) {
    .replace(/export\s+function\s+(\w+)\s*\(/g, 'window.$1 = function(')
    // Handle const exports: export const name = -> window.name =
    .replace(/export\s+const\s+(\w+)\s*=/g, 'window.$1 =')
    // Remove export { ... } statements (including multiline)
    .replace(/export\s*\{[\s\S]*?\}\s*;?/g, '');
}

const bundledJS = `
// ===== BUNDLED MODULES =====

// ----- rates.js -----
${convertExports(rates)}

// ----- meterReadSchedule.js -----
${convertExports(meterReadSchedule)}

// ----- optOutTiming.js -----
${convertExports(optOutTiming)}

// ----- parser.js -----
${convertExports(parser)}

// ----- engine.js -----
${convertExports(engine)}

// ----- actionPlan.js -----
${convertExports(actionPlan)}

// ----- calendar.js -----
${convertExports(calendar)}

// ===== END BUNDLED MODULES =====
`.trim();

console.log('✓ JavaScript bundled\n');

// Extract styles from upload.html
const uploadStyleMatch = uploadHtml.match(/<style>([\s\S]+?)<\/style>/);
const uploadStyles = uploadStyleMatch ? uploadStyleMatch[1] : '';

// Extract styles from results.html
const resultsStyleMatch = resultsHtml.match(/<style>([\s\S]+?)<\/style>/);
const resultsStyles = resultsStyleMatch ? resultsStyleMatch[1] : '';

// Combine styles
const combinedStyles = uploadStyles + '\n\n/* Results page styles */\n' + resultsStyles;

console.log('Building single HTML file...');

// Create the single-file HTML
// We'll use a tab-based UI with upload and results sections
const singleFileHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Billback - SDG&E Bill Savings</title>
<style>
${combinedStyles}

/* Tab navigation */
.tabs {
  display: none; /* Hidden initially, shown after upload */
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}
.tab-button {
  background: none;
  border: none;
  padding: 12px 16px;
  font-family: var(--font);
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-2);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab-button.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.tab-content {
  display: none;
}
.tab-content.active {
  display: block;
}
</style>
</head>
<body>

<!-- Upload tab -->
<div id="upload-tab" class="tab-content active">
${uploadHtml.match(/<body[^>]*>([\s\S]+)<\/body>/)[1]
  .replace(/<script[\s\S]+?<\/script>/g, '')
  .replace(/href="results\.html"/g, 'onclick="showResults(); return false;" href="#"')}
</div>

<!-- Results tab -->
<div id="results-tab" class="tab-content">
${resultsHtml.match(/<body[^>]*>([\s\S]+)<\/body>/)[1]
  .replace(/<script[\s\S]+?<\/script>/g, '')
  .replace(/window\.history\.back\(\)/g, 'showUpload()')}
</div>

<!-- PDF.js (inline version) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
// Initialize PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
</script>

<!-- Bundled application code -->
<script>
${bundledJS}

// Analytics tracking function (fails silently if PostHog unavailable)
const IS_PRODUCTION = false; // Always false for static builds
function trackEvent(eventName, props = {}) {
  if (window.posthog) {
    // Only send anonymous, non-identifying properties
    // No PII, no exact dollar amounts, no account numbers, no addresses
    posthog.capture(eventName, {
      ...props,
      site: 'billback',
      llc: 'mindmelding',
      is_test: !IS_PRODUCTION
    });
  }
}

// Tab navigation
function showResults() {
  document.getElementById('upload-tab').classList.remove('active');
  document.getElementById('results-tab').classList.add('active');
  window.scrollTo(0, 0);
}

function showUpload() {
  document.getElementById('results-tab').classList.remove('active');
  document.getElementById('upload-tab').classList.add('active');
  window.scrollTo(0, 0);
}

// Make functions global
window.showResults = showResults;
window.showUpload = showUpload;
window.trackEvent = trackEvent;
</script>

<!-- PostHog Analytics (inline, fails silently if blocked) -->
<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

// Initialize PostHog (fails silently if offline)
try {
  if (typeof posthog !== 'undefined') {
    posthog.init('phc_dummy_for_offline', {
      api_host: 'https://app.posthog.com',
      autocapture: false,
      disable_session_recording: true,
      loaded: function() { /* PostHog loaded */ },
      request_batching: true
    });
  }
} catch (e) {
  console.log('PostHog unavailable (offline mode)');
}
</script>

</body>
</html>`;

// Write the output
mkdirSync(join(rootDir, 'dist'), { recursive: true });
const outputPath = join(rootDir, 'dist/billback.html');
writeFileSync(outputPath, singleFileHtml, 'utf-8');

console.log('✓ Single-file build complete\n');
console.log(`📄 Output: dist/billback.html`);
console.log(`📦 Size: ${(singleFileHtml.length / 1024).toFixed(1)} KB`);
console.log('\n✅ Build successful!');
console.log('\nYou can now open dist/billback.html directly in a browser (file://) or serve it statically.');
