# Billback Static Build

This folder contains a ready-to-use static build of Billback that you can serve locally or deploy to any static host.

## Quick Start (Use Today!)

### Option 1: Local Python Server (Recommended)

```bash
# From the billback root directory
cd dist
python3 -m http.server 8000

# Then open in your browser:
# http://localhost:8000
```

### Option 2: Node HTTP Server

```bash
cd dist
npx http.server -p 8000

# Open: http://localhost:8000
```

### Option 3: VS Code Live Server

1. Right-click `dist/index.html` in VS Code
2. Select "Open with Live Server"

## What's Included

- `index.html` - Upload page (renamed from upload.html)
- `results.html` - Results page with action timeline and calendar export
- `src/` - All JavaScript modules (parser, engine, rates, timing, calendar)

## How To Use

1. **Start a local server** (see Quick Start above)
2. **Open in browser** (http://localhost:8000)
3. **Upload your SDG&E bill PDF** (complete monthly bill, not partial/move-in/true-up-only)
4. **Click "Analyze My Bills"**
5. **Review your personalized action timeline** with specific dates
6. **Export to calendar** (.ics file) or copy as checklist

## For Sean's Use Case

Based on the test fixture (Aug 2026 bill, CEA Clean Impact Plus, solar NEM 2.0, Cycle 19, true-up Oct 28, 2026):

**Expected action deadlines:**
- ✓ **Thu Nov 19, 2026** - CEA tier opt-down deadline (5 business days before Nov 27 read)
- ✓ **~Nov 13, 2026** - Submit CCA opt-out via CEA website
- ✓ **Fri Nov 27, 2026** - SDG&E must receive opt-out notice (6 months before switch)
- ✓ **May 28, 2027** - Return to SDG&E effective date (before June 1 summer pricing)

All dates are calculated using verified SDG&E Rule 27 timing and the Cycle 19 meter-read schedule.

## Raw GitHub URLs

Access the dist files directly from GitHub (useful for downloading to phone/tablet):

```
https://raw.githubusercontent.com/mindmelding/billback/cursor/single-file-build-e2e-67c4/dist/index.html

https://raw.githubusercontent.com/mindmelding/billback/cursor/single-file-build-e2e-67c4/dist/results.html
```

**Note:** These URLs load the raw HTML but won't work directly in a browser due to module imports. You need to serve the entire `dist/` folder.

## Privacy

- **100% client-side processing** - your bill never leaves your device
- PDF.js extracts text in your browser
- All calculations happen locally
- No uploads, no server storage
- PostHog analytics (anonymous only, fails silently if blocked)
- "Delete My Data" button clears browser sessionStorage

## Deployment Options

### Cloudflare Pages
1. Connect your GitHub repo
2. Set build output directory: `dist/`
3. Leave build command empty
4. Deploy

### Netlify / Vercel
1. Import from Git
2. Publish directory: `dist`
3. Build command: (leave empty)

### GitHub Pages
```bash
# From repo root
git subtree push --prefix dist origin gh-pages
```

## Testing

The E2E test suite is in `../test/e2e/billback.spec.js`. Run with:

```bash
npm run test:e2e
```

Tests verify:
- PDF upload and text extraction
- Bill parsing and validation
- Results page navigation
- Calendar (.ics) export
- Specific dates (Nov 19, Nov 27, May 28)

## Known Issues / TODO

- [ ] E2E test navigation timing (works manually, debugging automated test)
- [ ] Single-file bundled version (for file:// usage without server)
- [ ] Validate calendar import in actual calendar apps

## Support

For issues or questions, see the main repo README or open an issue on GitHub.
