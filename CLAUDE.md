# Billback: notes for Claude

Owner: Sean (GitHub `mindmelding`). Started in the Concept Funnel project, Oct 2026.

## What it is
A done-for-you SDG&E bill-savings service for San Diego households, renters and owners. Flow: person sends a bill PDF → we work out the savings → we return an action pack where each action is one tap, signature or call.

## Layout
- `app/` static pages, no build step. Plain HTML/CSS/JS, Linear-style white UI (Inter, accent #5e6ad2).
- `src/` client-side modules (parser, engine, rates, action plan, calendar, opt-out timing). All run in the browser.
- `data/` example JSON figures (no personal data).
- `research/` findings and sources. Update it when facts change, with dates.

## Rules
- **100% client-side architecture:** NO user data stored server-side, bill text NEVER leaves the device. PDF.js extracts text in browser, then `parser.js`, `engine.js`, `actionPlan.js`, and `calendar.js` run entirely client-side. Target is a purely static site (Cloudflare Pages) with rate tables as static JS/JSON. No backend, no API endpoints, no data transmission.
- Never put personal details in the repo: no names, addresses, account numbers or real bills. Use masked or example values.
- Never submit a form, switch a provider or sign anything for a customer. The customer always gives the final click, call or signature (PU Code 366.5; CARE income self-attestation).
- Prefill links (e.g. `optcea.communityenergysolutions.com/ui/opt/all/en-US/<acct>/<LASTNAME>/<ZIP>`) are undocumented; build them client-side and don't store the values.
- Rates change several times a year; every figure needs a date and source.
- Analytics: PostHog only (shared factory project), events snake_case object_verb with `site` and `llc` props, `is_test: true` off production. `autocapture: false`, `disable_session_recording: true`, send only anonymous non-identifying props (counts, bands, booleans, provider names; no PII, exact dollar amounts tied to person, accounts, or addresses). Each feature PR gets a Tracking section.
- Hosting: Cloudflare Pages free tier (static only). Domains, deploys, signups, spending, public posts and emails need Sean's own OK.
- Secrets never go in the repo, memory or chat.
