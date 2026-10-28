#!/usr/bin/env node
/**
 * Generate a realistic PDF from the test fixture
 * This creates a PDF whose text extraction matches SDG&E bill structure
 */

import PDFDocument from 'pdfkit';
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('📄 Generating test PDF from fixture...\n');

// Read the fixture text
const fixtureText = readFileSync(
  join(rootDir, 'test/fixtures/sdge_bill_cea_solar_aug2026.txt'),
  'utf-8'
);

// Create a PDF document
const doc = new PDFDocument({
  size: 'LETTER',
  margin: 50
});

// Create output directory
mkdirSync(join(rootDir, 'test/e2e'), { recursive: true });
const outputPath = join(rootDir, 'test/e2e/test-bill.pdf');

// Pipe to file
const stream = doc.pipe(createWriteStream(outputPath));

// Add content to PDF
// Split by pages (indicated by "--- Page N ---")
const pages = fixtureText.split(/--- Page \d+ ---/);

pages.forEach((pageText, index) => {
  if (index > 0) {
    doc.addPage();
  }
  
  // Set font and size
  doc.fontSize(9);
  doc.font('Courier');
  
  // Add the text content
  // Split into lines and add them
  const lines = pageText.trim().split('\n');
  
  lines.forEach(line => {
    // Skip empty lines at the start
    if (!line.trim() && doc.y < 100) return;
    
    doc.text(line, {
      continued: false,
      lineGap: 2
    });
  });
});

// Finalize PDF
doc.end();

// Wait for stream to finish
stream.on('finish', () => {
  console.log('✓ PDF generated\n');
  console.log(`📄 Output: test/e2e/test-bill.pdf`);
  console.log(`📦 Pages: ${pages.length}`);
  console.log('\n✅ PDF generation successful!');
});

stream.on('error', (err) => {
  console.error('❌ Error generating PDF:', err);
  process.exit(1);
});
