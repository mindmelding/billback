# Local Testing Guide

This guide shows how to test the Billback MVP end-to-end on your local machine.

## Prerequisites
- Node.js 18+
- A browser (Chrome, Firefox, Safari)

## Setup

```bash
# Install dependencies
npm install

# Run tests
npm test
# Should show: 22 tests passing

# Start local server
npm run dev
# Worker running at http://localhost:8787
```

## Test Flow 1: Automated E2E Test

1. Open `http://localhost:8787/test/e2e-test.html`
2. Click "Run Test"
3. Watch the automated test:
   - ✓ Loads fixture
   - ✓ Parses bill (CEA Plus, 624 kWh, 10 NEM months)
   - ✓ Calculates savings ($595–870/yr)
   - ✓ Generates 7 electric actions + 3 gas actions
   - ✓ Creates true-up alert (57 days)
4. Click "→ View Results Page" to see rendered results

Expected: All checkmarks green, results page shows personalized action pack.

## Test Flow 2: Upload Real Bill

### Option A: Use Fixture as PDF
1. Convert `test/fixtures/sdge_bill_cea_solar_aug2026.txt` to PDF (copy/paste into doc, save as PDF)
2. Open `http://localhost:8787/app/upload.html`
3. Drag PDF to upload area
4. Fill optional household info (or skip)
5. Click "Analyze My Bills"
6. Should redirect to results page

### Option B: Use Your Own SDG&E Bill
1. Open `http://localhost:8787/app/upload.html`
2. Upload your SDG&E bill PDF (must be complete monthly bill, 25-35 days)
3. Fill household info
4. Click "Analyze My Bills"
5. Should show results tailored to your bill

## Expected Results

### For Fixture (CEA Solar Renter):
- **Savings:** $595–870/yr (high confidence)
- **Alert:** Solar true-up in 57 days, expect $446
- **Top provider switch:** CEA Plus → SDG&E (save $420–460/yr)
- **Electric actions:** 7 actions (thermostat, dryer, dishwasher, fans, plugs, LEDs, panels)
- **Gas actions:** 3 actions (thermostat setback, water heater, weatherstripping)
- **Badges:** "Renter", "Solar", "CEA"

### For Different Household Types:

**Non-solar SDG&E customer:**
- No NEM alert
- Different provider comparisons (SDG&E → SDCP/CEA)
- Fewer electric actions (no solar panel cleaning)

**Owner with gas:**
- Shows all gas actions (including ones requiring landlord permission)
- Water heater action visible

**SDCP customer:**
- Different provider comparison (SDCP → alternatives)
- Provider-specific savings

## Testing Rejection Cases

Upload a bill with these characteristics to test validation:

1. **Partial bill (< 25 days):** Should reject with "This bill covers X days" message
2. **Move-in bill:** Should reject with "move-in, move-out" message
3. **True-up only:** Should reject with "true-up-only statement" message

## Testing Analytics Events

Open browser console (F12) and watch for PostHog events (when key configured):

```javascript
// Should fire on upload click:
bill_upload_started { bill_count: 1, site: "billback", llc: "mindmelding", is_test: true }

// Should fire on rejection:
bill_upload_rejected { reason: "partial_bill", site: "billback", llc: "mindmelding", is_test: true }

// Should fire on successful parse:
bill_parsed_success { bill_count: 1, has_solar: true, providers: ["CEA"], site: "billback", llc: "mindmelding", is_test: true }

// Should fire when results page loads:
results_viewed { total_savings_min: 595, total_savings_max: 870, bills_analyzed: 1, nem_months_analyzed: 10, confidence: "high", has_solar: true, is_renter: true, site: "billback", llc: "mindmelding", is_test: true }

// Should fire when clicking action:
action_clicked { action_id: "thermostat", action_name: "Pre-cool...", site: "billback", llc: "mindmelding", is_test: true }
```

## Troubleshooting

**"No savings report found"**
- SessionStorage was cleared. Go back to upload page and upload again.

**"Bill parsing failed"**
- Check if bill text extracted properly (PDF.js may fail on scanned PDFs)
- Try converting to text first with `pdftotext -layout bill.pdf`

**"Bill rejected: partial bill"**
- Bill must be 25-35 days (complete monthly cycle)
- Move-in, move-out, and corrected bills are rejected
- Upload a regular monthly bill instead

**Tests failing**
- Run `npm install` to ensure dependencies are installed
- Check Node version (needs 18+)

## Screenshots

Run the e2e test and take screenshots of:
1. E2E test page showing all green checkmarks
2. Results page for CEA solar renter (from fixture)
3. Results page for different household type (if testing with real bill)

## What to Verify

- [ ] All 22 tests pass
- [ ] E2E test completes with all checkmarks green
- [ ] Results page loads and renders correctly
- [ ] Different households get different action packs
- [ ] True-up alert shows for solar homes (when <60 days)
- [ ] Gas section only shows when gas usage detected
- [ ] Confidence badges display correctly
- [ ] Provider comparisons show relevant alternatives
- [ ] Action cards are clickable (console shows event when PostHog configured)
- [ ] Rejected bills show friendly error messages
