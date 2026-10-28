# Billback brand

Updated 2026-10-28.

## Logo
- `billback-mark.svg`: the mark. An indigo (#5e6ad2) rounded square with a white "B" whose lower bowl is a return arrow.
- `billback-lockup.svg`: the mark, the wordmark and the tagline "Get your power bill back."
- `billback-logo-sheet.png`: the logo sheet, with sizes and backgrounds.
- `png/`: exports. The mark comes at 16, 32, 64, 180 (Apple touch), 192 and 512 px. There's also the lockup at 2x and a 1200×630 social card.

Use the mark alone at 32px and below. Keep clear space equal to the arrow's height on every side. Don't recolor, outline or set it on photos.

## Style kit
`style-kit/` holds the design system, built from patterns in similar apps on Mobbin (Rocket Money, Wise, Monzo, Monarch, Origin, Oyster, Octopus Energy, Tesla, Walmart, Xero).

- `tokens.css` / `tokens.json`: color, type, space, radius, motion. One light theme. Text colors pass WCAG AA on white.
- `components.css`: buttons, status chips and dots, segmented control, cards, metric strip, savings receipt, price compare, action list, steps, progress, upload zone, prefilled form, time-of-use meter, callouts, toast, trust line. Every class is prefixed `bb-`.
- `index.html`: the living preview, covering principles, logo, color, type, components, the three core screens, voice, and Mobbin references with links. Open it in a browser.
- `preview.png`, `preview-phone.png`: screenshots of the preview.

### Color meanings
| Token | Meaning |
|---|---|
| `--bb-accent` indigo | We did this for you: prefilled, ready, primary action |
| `--bb-save` green | Money the customer gets back or keeps |
| `--bb-you` amber | A step only the customer can take (call, signature, tick) |
| `--bb-over` red | Money leaving that doesn't have to (today's bill, CCA premium) |

### Use in a page
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/brand/style-kit/tokens.css">
<link rel="stylesheet" href="/brand/style-kit/components.css">
<body class="bb">…</body>
```

`app/upload.html` and `app/results.html` import `tokens.css` and `components.css` and use the `bb-` classes. `npm run build` copies the needed CSS and brand assets into `dist/brand/` with relative paths.
