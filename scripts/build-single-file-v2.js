#!/usr/bin/env node
/**
 * Build single-file billback.html with inline modules
 * Uses a more reliable approach: inline all modules as data URLs or inline scripts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('📦 Building single-file billback.html (v2)...\n');

// Read source files
console.log('Reading source files...');
const uploadHtml = readFileSync(join(rootDir, 'app/upload.html'), 'utf-8');

// Read all JS modules as text
const modules = {
  'parser.js': readFileSync(join(rootDir, 'src/parser.js'), 'utf-8'),
  'engine.js': readFileSync(join(rootDir, 'src/engine.js'), 'utf-8'),
  'rates.js': readFileSync(join(rootDir, 'src/rates.js'), 'utf-8'),
  'meterReadSchedule.js': readFileSync(join(rootDir, 'src/meterReadSchedule.js'), 'utf-8'),
  'optOutTiming.js': readFileSync(join(rootDir, 'src/optOutTiming.js'), 'utf-8'),
  'actionPlan.js': readFileSync(join(rootDir, 'src/actionPlan.js'), 'utf-8'),
  'calendar.js': readFileSync(join(rootDir, 'src/calendar.js'), 'utf-8'),
};

console.log('✓ Source files read\n');

// Create inline module loader
const inlineModuleSystem = `
<script type="module">
// Inline module system - modules are defined below
const modules = new Map();
const moduleExports = new Map();

// Module loader
function defineModule(name, code) {
  modules.set(name, code);
}

async function loadModule(name) {
  if (moduleExports.has(name)) {
    return moduleExports.get(name);
  }
  
  const code = modules.get(name);
  if (!code) {
    throw new Error(\`Module \${name} not found\`);
  }
  
  const exports = {};
  const module = { exports };
  
  // Create a function from the module code
  const moduleFunction = new Function('exports', 'module', 'require', code);
  
  // Simple require function for inter-module dependencies
  const require = async (path) => {
    const moduleName = path.replace('../src/', '').replace('./', '');
    return await loadModule(moduleName);
  };
  
  await moduleFunction(exports, module, require);
  
  const result = Object.keys(module.exports).length > 0 ? module.exports : exports;
  moduleExports.set(name, result);
  return result;
}

// Define all modules inline
${Object.entries(modules).map(([name, code]) => `
defineModule('${name}', \`
${code.replace(/`/g, '\\`').replace(/\$/g, '\\$')}
\`);
`).join('\n')}

// Now load and use the modules
(async function() {
  try {
    const parser = await loadModule('parser.js');
    const engine = await loadModule('engine.js');
    const rates = await loadModule('rates.js');
    
    // Make them global for the upload script
    window.parseSDGEBillText = parser.parseSDGEBillText;
    window.validateBillingPeriod = parser.validateBillingPeriod;
    window.generateSavingsReport = engine.generateSavingsReport;
    window.rates = rates;
    
    console.log('Modules loaded successfully');
  } catch (error) {
    console.error('Error loading modules:', error);
  }
})();
</script>
`;

// Replace the module script tags in upload.html
let modifiedHtml = uploadHtml;

// Remove the external module imports
modifiedHtml = modifiedHtml.replace(/<script type="module">[\s\S]*?<\/script>/g, (match) => {
  if (match.includes('import {') || match.includes('import * as')) {
    return ''; // Remove module import scripts
  }
  return match; // Keep other scripts
});

// Insert the inline module system before the closing body tag
modifiedHtml = modifiedHtml.replace('</body>', `${inlineModuleSystem}</body>`);

// Write output
mkdirSync(join(rootDir, 'dist'), { recursive: true });
const outputPath = join(rootDir, 'dist/billback.html');
writeFileSync(outputPath, modifiedHtml, 'utf-8');

console.log('✓ Single-file build complete\n');
console.log(`📄 Output: dist/billback.html`);
console.log(`📦 Size: ${(modifiedHtml.length / 1024).toFixed(1)} KB`);
console.log('\n✅ Build successful (v2)!');
