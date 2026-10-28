#!/usr/bin/env node
/**
 * Generate a test SDG&E bill PDF whose PDF.js y-coordinate reconstruction
 * matches a real bill: multi-column TOU dashboard, Unicode minus with a
 * space ('− 139'), Baseline Adjustment Credit, 10-row NEM YTD table.
 *
 * No personal data — masked/example values only.
 */

import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const MINUS = '\u2212'; // U+2212 MINUS SIGN, as PDF.js extracts from real bills

const NEM_ROWS = [
  ['11/26/2025', '83', `${MINUS} 139`, '28', `${MINUS} 28`, '28.27'],
  ['12/29/2025', '161', `${MINUS} 97`, '50', '114', '56.33'],
  ['01/28/2026', '115', `${MINUS} 67`, '37', '85', '41.76'],
  ['02/27/2026', '107', `${MINUS} 147`, '9', `${MINUS} 31`, '28.90'],
  ['03/30/2026', '83', `${MINUS} 29`, `${MINUS} 163`, `${MINUS} 109`, '20.69'],
  ['04/29/2026', '31', `${MINUS} 56`, `${MINUS} 157`, `${MINUS} 182`, '8.72'],
  ['05/29/2026', '30', `${MINUS} 49`, `${MINUS} 127`, `${MINUS} 146`, '7.49'],
  ['06/29/2026', '85', '21', `${MINUS} 100`, '6', '26.95'],
  ['07/29/2026', '310', '199', '116', '625', '178.96'],
  ['08/27/2026', '355', '193', '76', '624', '177.17']
];

function writeSameY(doc, y, items) {
  for (const [x, text] of items) {
    doc.text(String(text), x, y, { lineBreak: false });
  }
}

export function generateTestPdf(outputPath) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(outputPath), { recursive: true });
    const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
    const stream = doc.pipe(createWriteStream(outputPath));
    doc.font(FONT);
    doc.fontSize(9);

    let y = 50;
    const line = (text, x = 50) => {
      doc.text(text, x, y, { lineBreak: false });
      y += 14;
    };

    line('ACCOUNT NUMBER 1234 5678 9012 3         DATE MAILED Sep 2, 2026');
    line('SERVICE FOR');
    line('JANE SAMPLE');
    line('123 EXAMPLE ST');
    line('OCEANSIDE, CA 92000');
    line('No payment is due.');
    line('Your account will true-up on Oct 28, 2026.');
    line('Your account has a balance of $445.71');
    line('Current Account Balance                       $445.71');
    line('Cycle: 19');
    line('Rate: Time of Use - TOU-DR1-Residential     Climate Zone: Coastal');
    line('Billing Period: 7/30/26 - 8/27/26     Total Days: 29');
    line('Total Usage: 624');
    line('13 Therms');
    line('Total Gas Service                            $33.08');
    line('Total Current Charges                        $445.71');
    line('Your electric energy is provided by CLEAN ENERGY ALLIANCE.');
    line('CCA Account Number: 123456789012');
    line('Clean Impact Plus 624 kWh X $0.001');

    y += 8;
    line('Community Choice Aggregation (CCA) Electric Generation Charges');
    line('Generation On-Peak Summer 355 kWh X $0.55397');
    line('Generation Off-Peak Summer 193 kWh X $0.22298');
    line('Generation Super Off-Peak Summer 76 kWh X $0.04914');
    line('Total CCA Electric Generation Charges        $244.02');
    line('Baseline Adjustment Credit                   $0.00');

    y += 10;
    line('Net Metering Account Summary');
    // Real PDF.js y-reconstructed payment line — no "NEM Year-to-Date Balance"
    writeSameY(doc, y, [
      [50, 'Previous NEM YTD Balance'],
      [220, '$354.22'],
      [280, 'Payment Received'],
      [390, '8/21/26'],
      [450, 'THANK YOU'],
      [530, '- 354.22'],
    ]);
    y += 14;
    line('(Continued on next page)');
    line('Excess Credit Transfer                       -16.28');
    line('Current Charges                              + 461.99');
    line('CCA Electric Generation                      244.02');
    line('California Climate Credit                    -49.36');
    line('YTD Net Metering Charges/Credits              $    267.40');
    line('Non-Bypassable Charges                        $    318.89');

    y += 10;
    line('Net Energy Metering');
    line('Version: 2.0     System Size: 3.44 kW     True-Up Date: 10/28/2026');

    // Dashboard TOU line: same y so PDF.js reconstructs one line:
    // "Time of Use - Electricity Summer kWh On-Peak 355 Off-Peak 193 Super Off-Peak 76"
    y += 16;
    writeSameY(doc, y, [
      [50, 'Time of Use - Electricity'],
      [210, 'Summer'],
      [270, 'kWh'],
      [310, 'On-Peak'],
      [370, '355'],
      [410, 'Off-Peak'],
      [470, '193'],
      [510, 'Super Off-Peak'],
      [600, '76']
    ]);
    y += 22;

    if (y > 520) {
      doc.addPage();
      y = 50;
    }

    line('Net Energy Metering Summary');
    line('Current Rate:   Time of Use - TOU-DR1-Residential    Start Date: 10/29/2025    System Size: 3.44 kW');
    line('Meter Number:   12345002                             True-Up Date: 10/28/2026  Version: 2.0');

    y += 6;
    writeSameY(doc, y, [
      [50, 'Bill Date'],
      [130, 'On-Pk'],
      [190, 'Off-Pk'],
      [260, 'Super-Off-Pk'],
      [360, 'Total'],
      [420, 'NEM']
    ]);
    y += 12;

    for (const row of NEM_ROWS) {
      writeSameY(doc, y, [
        [50, row[0]],
        [130, row[1]],
        [190, row[2]],
        [260, row[3]],
        [360, row[4]],
        [420, row[5]]
      ]);
      y += 14;
    }

    y += 10;
    line('YTD Totals                                   575.24');
    line('YTD Net Metering Charges/Credits              $    267.40');
    line('Non-Bypassable Charges                        $    318.89');
    line('Current Account Balance                       $    445.71');

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain || process.argv[1]?.includes('generate-test-pdf')) {
  const outputPath = join(rootDir, 'test/e2e/test-bill.pdf');
  generateTestPdf(outputPath)
    .then((p) => {
      console.log(`PDF generated: ${p}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
