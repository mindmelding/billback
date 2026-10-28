# Billback

Cut your SDG&E bill, with the paperwork done for you. Upload your SDG&E bills, get personalized savings and an action pack where each step takes one tap, one signature or one short call.

Status: MVP development (Oct 2026). Upload flow, savings engine, and data-driven results in progress. Nothing is live yet.

## What's here
- `app/upload.html`: Bill upload page with client-side PDF extraction (PDF.js)
- `app/index.html`: Results page (being converted from prototype to data-driven)
- `src/`: Backend savings engine and bill parser
  - `rates.js`: SDG&E, CEA, and SDCP rate tables (dated and sourced)
  - `parser.js`: Deterministic text parser for SDG&E bills
  - `extraction.js`: LLM fallback for difficult bills
  - `engine.js`: Savings calculations, provider comparisons, behavioral actions
  - `worker.js`: Cloudflare Worker API
- `data/`: Example figures from one real Oceanside bill (renters, rooftop solar on NEM 2.0, Clean Energy Alliance), with no personal details.
- `test/fixtures/`: Redacted test bills
- `research/sdge-savings.md`: demand, competitors, money paths, the savings levers

## Run it locally

### Prerequisites
- Node.js 18+ (for tests and local dev)
- (Optional) OpenAI or Anthropic API key for LLM fallback extraction

### Setup
```bash
npm install
```

### Run tests
```bash
npm test
```

Tests cover:
- Savings engine calculations (rate comparisons, annual cost extrapolation)
- Deterministic bill parser (extracts account, usage, NEM data, gas)
- CARE/FERA eligibility checks

### Run locally (development)
```bash
# Set up environment (optional, for LLM fallback)
echo "LLM_PROVIDER=openai" >> .dev.vars
echo "LLM_API_KEY=your-key-here" >> .dev.vars
echo "LLM_MODEL=gpt-4" >> .dev.vars

# Start dev server
npm run dev
```

Then open `http://localhost:8787/app/upload.html` in your browser.

**How it works locally:**
1. Upload 1-3 SDG&E bill PDFs
2. PDF.js extracts text in your browser
3. Worker parses bills (deterministic parser first, LLM fallback if needed)
4. Engine calculates savings across providers and behavioral changes
5. Results page shows personalized action pack

### Deploy (Cloudflare Workers + Pages)
Not ready for deployment yet. When ready:
```bash
# Set secrets (never commit these)
wrangler secret put LLM_API_KEY
wrangler secret put LLM_PROVIDER
wrangler secret put LLM_MODEL

# Deploy worker
npm run deploy

# Deploy Pages (front-end)
# Connect app/ folder to Cloudflare Pages
```

## Key architecture decisions

### 1. Deterministic parser first, LLM fallback
SDG&E bills are structured text PDFs. We use regex patterns to extract most fields (account, usage, rates, NEM data) with no LLM cost. LLM (OpenAI/Anthropic) is used only as a fallback for difficult bills, and personal info is stripped before sending.

**Why:** Privacy, speed, and cost. A deterministic parser is free, instant, and never sees personal data leave the browser until extraction succeeds.

### 2. Net Metering YTD table = nearly full year from one bill
For solar customers, SDG&E prints a 10-12 month Net Metering summary table on every bill showing On-Peak/Off-Peak/Super Off-Peak kWh for each month. **One recent bill gives us nearly a full year of TOU usage history**, making annual cost estimates far more accurate than extrapolating from 3 non-consecutive months.

**Impact:** High-confidence provider comparisons from a single bill for solar households.

### 3. Gas included
SDG&E bills include gas usage and charges. We parse gas therms and cost, and provide gas-specific savings (thermostat setback, water heater temp, weatherstripping).

### 4. True-up alerts
For NEM customers, we parse the true-up date and current balance, then show an urgent alert if true-up is <60 days away. This is a high-value, time-sensitive result that competitors don't surface.

### 5. All rates dated and sourced
Per CLAUDE.md requirements, every rate in `rates.js` has an `effectiveDate` and `source`. Rates change several times a year; we document when each table was last updated.

## Data flow
```
Bill PDF → (browser: PDF.js extracts text) → POST /api/upload
  → deterministic parser → success? → return bill data
  → failed? → strip personal info → LLM fallback → validate → return bill data

Bill data + household → POST /api/calculate
  → identify current plan (SDG&E/CEA/SDCP, rate schedule)
  → use NEM YTD table if available (10-12 months)
  → calculate annual cost on current plan
  → compare to all alternative providers
  → calculate behavioral savings (electric + gas)
  → check CARE/FERA eligibility
  → generate NEM true-up alert
  → return savings report

Savings report → (browser) → render results page
```

## Testing
Fixture: `test/fixtures/sdge_bill_cea_solar_aug2026.txt`
- CEA Clean Impact Plus customer, solar NEM 2.0, Aug 2026 bill
- 10 months of NEM history included
- Gas usage: 13 therms
- All personal data redacted

Tests validate:
- Parser extracts all fields correctly (account, TOU usage, NEM data, gas)
- Engine calculates costs matching fixture amounts
- Provider comparisons show CEA costs more than SDG&E for solar homes
- CARE/FERA eligibility thresholds work
- Behavioral savings are calculated

## Key findings so far
- For solar homes, a community power provider can cost more than SDG&E. In the example household, CEA cost about $420–460 more over one solar year, mostly in summer 4–9 pm.
- The CEA (and likely SDCP) opt form takes the account lookup details in its URL, so a prefilled link skips the first screen. The person still picks the option and confirms they're the account holder.
- By law (PU Code 366.5) and CARE rules, the person gives the final click or signature for provider switches, discounts and plan changes.
- Net Metering YTD table shows 10-12 months of TOU usage in one bill, enabling high-confidence annual estimates.

## Next steps (remaining for MVP)
- Convert `app/index.html` results page to render from engine output
- Add analytics (PostHog: events like `bill_upload_started`, `results_viewed`, `action_clicked`)
- Handle Green Button CSV/XML uploads as alternative to PDFs
- Add manual correction UI for failed extractions
- Deploy to Cloudflare Workers + Pages
- Test end-to-end with more real bills
