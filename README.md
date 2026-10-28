# Billback

Cut your SDG&E bill, with the paperwork done for you. Upload your SDG&E bills, get personalized savings and an action pack where each step takes one tap, one signature or one short call.

**Status:** MVP development (Oct 2026). Client-side processing, savings engine, opt-out timing, and calendar export complete. Nothing is live yet.

## 🚀 Quick Start (Use Today!)

The ready-to-use static build is in `dist/`. To use it right now:

```bash
cd dist
python3 -m http.server 8000
# Open http://localhost:8000 in your browser
```

See `dist/README.md` for full instructions and deployment options.

**Raw file URL (for download, not direct use):**
```
https://raw.githubusercontent.com/mindmelding/billback/cursor/single-file-build-e2e-67c4/dist/index.html
```

## Core Architecture: 100% Client-Side

**Your bill data never leaves your device.** Everything runs in your browser:
- PDF.js extracts text from uploaded PDFs (no server upload)
- `parser.js` parses bill data using deterministic regex patterns
- `engine.js` calculates savings across providers and behaviors
- `optOutTiming.js` generates specific opt-out/switch dates with verified rules
- `actionPlan.js` creates a dated timeline with sources
- `calendar.js` exports .ics files and calendar links
- Results stored in browser sessionStorage only, with "Delete My Data" button

**No backend, no API, no data transmission.** Static site on Cloudflare Pages with rate tables as static JSON/JS.

## What's here
- `app/upload.html`: Bill upload page with client-side PDF extraction and analysis
- `app/results.html`: Results page with savings metrics, action timeline, and calendar export
- `src/`: Client-side modules (all ES modules, run in browser):
  - `rates.js`: SDG&E, CEA, and SDCP rate tables (dated and sourced)
  - `parser.js`: Deterministic text parser for SDG&E bills
  - `engine.js`: Savings calculations, provider comparisons, behavioral actions, NEM true-up projections
  - `optOutTiming.js`: Opt-out/switch timing with specific dates, deadlines, and cost implications
  - `actionPlan.js`: Dated action timeline generator
  - `calendar.js`: .ics generation, Google/Outlook links, Markdown/plain text export
- `data/`: Example figures from one real Oceanside bill (renters, rooftop solar on NEM 2.0, Clean Energy Alliance), with no personal details.
- `test/fixtures/`: Redacted test bills
- `brand/`: logo (SVG, PNG exports, social card) and the style kit in `brand/style-kit/` (tokens, `bb-` components, live preview). See `brand/README.md`.
- `research/screenshots/`: CEA opt-down and opt-out form screens, captured 2026-10-28 with dummy values only.
- `research/`: Findings, sources, and opt-out timing rules (dated and verified)

## Run it locally

### Prerequisites
- Node.js 18+ (for tests only; the app itself runs in any modern browser)
- A static web server (e.g., `python3 -m http.server` or VS Code Live Server extension)

### Setup
```bash
npm install  # For running tests
```

### Run tests
```bash
npm test
```

Tests cover:
- Savings engine calculations (rate comparisons, annual cost extrapolation, NEM projections)
- Deterministic bill parser (extracts account, usage, NEM data, gas)
- CARE/FERA eligibility checks
- Opt-out timing calculations (solar true-up coordination, CEA tier changes, deadlines)

### Run locally (development)
No build step required. Just serve the `app/` directory:

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: Node.js http-server
npx http-server -p 8000

# Option 3: VS Code Live Server extension
# Right-click app/upload.html → "Open with Live Server"
```

Then open `http://localhost:8000/app/upload.html` in your browser.

**How it works:**
1. Upload 1-3 SDG&E bill PDFs
2. PDF.js extracts text in your browser
3. Parser analyzes bills (deterministic regex, no LLM)
4. Engine calculates savings across providers and actions
5. Opt-out timing module generates specific dates with verified rules
6. Results page shows timeline with calendar export and "Delete My Data" button

Everything happens in your browser. No server, no uploads, no storage.

### Deploy (Cloudflare Pages)
Ready for static deployment:

```bash
# No build step needed - just deploy the app/ folder directly to Cloudflare Pages

# Via Cloudflare Dashboard:
# 1. Connect your GitHub repo
# 2. Set build output directory to: app/
# 3. Leave build command empty (no build needed)
# 4. Deploy
```

No secrets, no worker, no API keys needed. Just static HTML/CSS/JS.

## Key architecture decisions

### 1. 100% Client-Side Processing
Everything runs in the user's browser. Bill PDFs are read with PDF.js, parsed with regex, and analyzed with static rate tables—all without sending data anywhere. This ensures absolute privacy and eliminates server costs.

**Why:** Privacy first. Users should never have to trust us with their bill data because we literally never see it.

### 2. Deterministic Parser (No LLM)
SDG&E bills are structured text PDFs. We use regex patterns to extract fields (account, usage, rates, NEM data, gas) with no LLM. Manual correction form provided for edge cases.

**Why:** Privacy, speed, and cost. A deterministic parser is free, instant, and never sees personal data leave the browser. LLM fallback was removed from the default flow per privacy requirements.

### 3. Net Metering YTD table = nearly full year from one bill
For solar customers, SDG&E prints a 10-12 month Net Metering summary table on every bill showing On-Peak/Off-Peak/Super Off-Peak kWh for each month. **One recent bill gives us nearly a full year of TOU usage history**, making annual cost estimates far more accurate than extrapolating from 3 non-consecutive months.

**Impact:** High-confidence provider comparisons from a single bill for solar households.

### 4. Opt-Out Timing with Verified Rules
The `optOutTiming.js` module calculates specific action dates, deadlines, and cost implications for:
- CCA tier changes (CEA Clean Impact Plus → Clean Impact with Dec 31, 2026 relief credit deadline)
- CCA opt-out back to SDG&E (coordinated with solar true-up dates to avoid interim true-up)
- CARE/FERA enrollment timing
- Seasonal thermostat changes (before Jun 1 TOU summer season)

Rules are dated, sourced in `research/opt-out-timing-rules.md`, and labeled as verified or unverified. For solar customers, switching CCAs triggers an interim true-up (SDG&E NEM 2.0 tariff Section 5.3), so we recommend switching within 60 days after the annual true-up to minimize disruption.

**Why:** "Switch providers" without specific timing is not actionable. Users need to know WHEN, WHY, and what it costs to go early or late.

### 5. Gas included
SDG&E bills include gas usage and charges. We parse gas therms and cost, and provide gas-specific savings (thermostat setback, water heater temp, weatherstripping).

### 6. True-up alerts
For NEM customers, we parse the true-up date and current balance, project remaining months using NEM YTD history, then show an urgent alert if true-up is <60 days away with the projected balance range.

### 7. All rates dated and sourced
Per CLAUDE.md requirements, every rate in `rates.js` and every timing rule in `optOutTiming.js` has an `effectiveDate` and `source`. Rates and rules change; we document when each was last updated and verified.

### 8. Privacy-First Analytics
PostHog configured with `autocapture: false` and `disable_session_recording: true`. Events send only anonymous, non-identifying properties:
- ✓ Counts, bands, booleans (e.g., `bill_count: 2`, `has_solar: true`)
- ✓ Provider names (e.g., `provider: "CEA"`)
- ✗ Exact dollar amounts tied to a person
- ✗ Account numbers, addresses, ZIP codes
- ✗ Any PII

Each event includes `is_test: true` for non-production environments.

## Data flow (100% Client-Side)
```
Bill PDF (user's device)
  → PDF.js extracts text (browser)
  → parser.js deterministic regex (browser)
  → validate billing period (browser)
  → engine.js calculates savings (browser)
  → optOutTiming.js calculates action dates (browser)
  → actionPlan.js generates timeline (browser)
  → calendar.js generates .ics (browser)
  → results stored in sessionStorage (browser only)
  → user can delete with one click

NO server communication. NO uploads. NO storage outside browser.
```

## Tracking (PostHog Events)

All events send only anonymous, non-identifying properties. Configured with `autocapture: false` and `disable_session_recording: true`.

**Events:**
- `bill_upload_started` - `{ bill_count }`
- `bill_upload_rejected` - `{ reason }` (e.g., "partial_bill", "move_in", "true_up_only")
- `bill_parsed_success` - `{ bill_count, has_solar, has_gas, provider }`
- `plan_viewed` - `{ action_count, has_solar, is_renter, provider }`
- `step_viewed` - `{ step_category, step_urgency }`
- `calendar_exported` - `{ step_count }`
- `checklist_exported` - `{ step_count }`
- `data_deleted` - `{}`

**Properties:**
- All events include: `{ site: "billback", llc: "mindmelding", is_test: true/false }`
- Never sent: dollar amounts, account numbers, addresses, ZIP codes, names, exact usage kWh, any PII

## Testing
Fixture: `test/fixtures/sdge_bill_cea_solar_aug2026.txt`
- CEA Clean Impact Plus customer, solar NEM 2.0, Aug 2026 bill
- True-up date: Oct 28, 2026
- 10 months of NEM history included
- Gas usage: 13 therms
- All personal data redacted (ZIP 92000, fake account/meter)

Tests validate:
- Parser extracts all fields correctly (account, TOU usage, NEM data, gas, CCA detection)
- Billing period validation rejects partial/move-in/true-up-only bills
- Engine calculates costs matching fixture amounts
- NEM true-up projection uses YTD history and projects remaining months
- Provider comparisons show CEA costs more than SDG&E for this solar home
- CARE/FERA eligibility thresholds work
- Behavioral savings calculated correctly
- Opt-out timing: CEA tier change deadline (Dec 31, 2026), solar CCA opt-out coordinated with true-up date, CARE enrollment immediate
- Calendar .ics generation with VALARM reminders and RRULE recurring events

## Key findings so far
- For solar homes, a community power provider can cost more than SDG&E. In the example household, CEA cost about $420–460 more over one solar year, mostly in summer 4–9 pm peak.
- The CEA (and likely SDCP) opt form takes the account lookup details in its URL, so a prefilled link skips the first screen. The person still picks the option and confirms they're the account holder.
- By law (PU Code 366.5) and CARE rules, the person gives the final click or signature for provider switches, discounts and plan changes.
- Net Metering YTD table shows 10-12 months of TOU usage in one bill, enabling high-confidence annual estimates.
- **Switching CCAs triggers an interim true-up** (SDG&E Electric Rule 27 Section 5.3). For solar customers, the optimal window to switch is within 60 days after the annual true-up date to avoid mid-cycle disruption.
- CEA Clean Impact relief credit ends Dec 31, 2026 → customers on Clean Impact Plus should evaluate switching down by Nov 1 to capture the final relief credit month.
- CARE/FERA enrollment takes 2-3 billing cycles but applies retroactively from application date → immediate action saves money faster.

## Current scope (Complete for client-side MVP)
- ✅ Client-side PDF extraction and bill parsing (no server upload)
- ✅ Deterministic parser for SDG&E bills (CCA detection, NEM data, gas, prorated rates)
- ✅ Billing period validation (rejects partial/move-in/true-up-only bills)
- ✅ Savings engine with provider comparisons, behavioral actions, CARE/FERA eligibility
- ✅ NEM true-up projection using YTD history
- ✅ Opt-out timing module with specific dates, deadlines, and verified rules
- ✅ Dated action timeline generation
- ✅ Calendar export (.ics with VALARM/RRULE, Google/Outlook links, Markdown checklist)
- ✅ Privacy-first analytics (PostHog with autocapture disabled, anonymous props only)
- ✅ "Delete My Data" button (clears browser sessionStorage)
- ✅ Comprehensive test suite (parser, engine, NEM, opt-out timing, calendar)

## Future enhancements (not in MVP)
- Manual correction UI for failed parser extractions
- Green Button CSV/XML upload as alternative to PDFs
- More providers (SDCP Power Base, SDG&E other TOU plans)
- Rate plan optimizer (which SDG&E TOU plan is best for your usage)
- Email/SMS reminder service (opt-in only, with user consent and backend)
- Multi-year bill history analysis
- Appliance-specific recommendations based on usage patterns
