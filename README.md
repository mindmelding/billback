# Billback

Cut your SDG&E bill, with the paperwork done for you. A person sends one bill; we send back their before/after savings and an action pack where each saving takes one tap, one signature or one short call.

Status: prototype (Oct 2026). Nothing is live.

## What's here
- `app/index.html`: the action pack page (static, no build step). Results chart, before/after, and 9 actions with prefilled forms, call scripts, thermostat setup, a CARE/FERA checker and a rate-hike comment.
- `data/`: example figures from one real Oceanside bill (renters, rooftop solar on NEM 2.0, Clean Energy Alliance), with no personal details. Used by the prototype dashboards.
- `research/sdge-savings.md`: demand, competitors, money paths, the savings levers, what a service can and can't do for people, and the CEA form prefill finding.

## Run it
Open `app/index.html` in a browser. No dependencies.

## Key findings so far
- For solar homes, a community power provider can cost more than SDG&E. In the example household, CEA cost about $420–460 more over one solar year, mostly in summer 4–9 pm.
- The CEA (and likely SDCP) opt form takes the account lookup details in its URL, so a prefilled link skips the first screen. The person still picks the option and confirms they're the account holder.
- By law (PU Code 366.5) and CARE rules, the person gives the final click or signature for provider switches, discounts and plan changes.
