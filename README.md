# Prunest

Free garden calculators and planning tools. **Measure your garden. Plan what to buy and when to plant.**

Primary domain: https://prunest.com

| Path | Tool |
| --- | --- |
| `/raised-bed-soil-calculator` | Soil for rectangular, circular and corner beds; up to three bag sizes and bulk compared on cost; mix split; weight from a supplied density; hand-off to plant spacing |
| `/mulch-calculator` | Rectangles, circles, triangles and rings; net area, volume, coverage per bag; up to three bag sizes and bulk compared; same area at other depths |
| `/plant-spacing-calculator` | Straight or staggered rows, scaled plan, seeds and packets needed from the germination rate, plant cost; hand-off to a sowing schedule |
| `/seed-starting-calculator` | Dates from up to three reference dates and seed packet offsets, succession sowings, harvest dates from days to maturity, timeline, `.ics` export |

Plus `/`, `/about`, `/contact`, `/privacy`, `/terms`, a real `404`, `sitemap.xml` and `robots.txt`.

## Stack

- Astro (static output, TypeScript strict), Tailwind CSS v4 through `@tailwindcss/vite`
- Browser-side TypeScript, no framework. No server functions, database, auth, or third-party requests
- Cloudflare Workers Static Assets (`wrangler.jsonc`, assets only, no Worker script)

## Commands

```sh
npm install
npm run dev       # Astro dev server
npm run check     # type checks (astro check)
npm test          # unit tests (vitest)
npm run build     # production build into dist/
npm run preview   # serve dist/ with wrangler dev (same routing and 404s as production)
npm run verify    # check + test + build
npm run e2e       # browser smoke test of dist/ (add `-- firefox` or `-- webkit`)
npm run deploy    # build + wrangler deploy
```

Node 22.12 or newer.

## Layout

```
src/lib/      Pure calculation code, SI units internally. No DOM. Unit tested.
  units.ts geometry.ts soil.ts mulch.ts spacing.ts dates.ts parse.ts format.ts
src/ui/       Shared browser UI: measurement fields with unit conversion, validation,
              repeating rows, tool shell (example / reset / print / save), SVG diagrams
src/tools/    One file per tool: builds the form, calls src/lib, renders results
src/layouts/  Base (head, SEO, header, footer), ToolLayout (tool shell + print header), Page
src/pages/    One .astro file per URL, plus robots.txt, sitemap.xml and conditional ads.txt
integrations/ Build step that writes dist/sw.js (offline copy of the site)
src/config/site.ts   Site identity, tool list, optional integrations
tests/        Vitest suites with hand-worked expected values; tests/e2e/ browser smoke test
.github/      Checks workflow: types, unit tests, build, then Chromium, Firefox and WebKit
```

Rules the code follows:

- Calculation logic never touches the DOM; UI code never does arithmetic beyond formatting.
- Values are kept at full precision. Rounding happens only for display and for whole bags or bulk steps.
- Switching a unit converts the number so the physical measurement is unchanged, and remembers the exact value so a round trip returns the original.
- Invalid input is rejected with an inline message. Nothing is silently replaced with a default.
- Dates are plain calendar dates (`{y, m, d}`), so timezones and daylight saving cannot shift results.

## Offline and install

After one visit, the browser keeps a copy of every page, script, style and font (about 26 files), so the calculators open and work with no signal. `integrations/offline.mjs` writes `dist/sw.js` at build time; its cache name is a hash of the built files, so each deploy replaces the old copy. Pages are fetched network-first (4 s timeout) so updates arrive; hashed assets are served from the copy. Only Prunest's own files are handled; ads and analytics always go to the network. `manifest.webmanifest` lets visitors add Prunest to a home screen, with shortcuts to each calculator. Social preview images (`og-*.png`) are not cached.

## Shared tool features

Every tool has: try an example, reset, imperial/metric switch, inline validation, optional inputs in collapsible sections (they open by themselves when they hold values or an error), a collapsible calculation breakdown, print layout, save on this device, and **copy link to this plan** (the plan is encoded in the URL fragment, which is never sent to the server). On phones a bar at the bottom shows the headline result while the form is being edited. Headings use Zilla Slab, self-hosted from the build (no third-party font requests).

## Configuration

Everything optional is **off** unless a real value is set at build time. Copy `.env.example` to `.env` locally, or set the variables in Cloudflare (Worker > Settings > Build > Variables and secrets).

| Variable | Effect |
| --- | --- |
| `PUBLIC_BUSINESS_NAME`, `PUBLIC_CONTACT_EMAIL`, `PUBLIC_BUSINESS_ADDRESS` | Shown on About, Contact, Privacy and Terms. Until set, Contact says no address has been published |
| `PUBLIC_ADSENSE_CLIENT` | `ca-pub-…` ID. Loads AdSense, adds the advertising section to the privacy page, and generates `/ads.txt`. Without it there is no `ads.txt` |
| `PUBLIC_ADSENSE_SLOT_BELOW_TOOL`, `PUBLIC_ADSENSE_SLOT_IN_CONTENT` | AdSense slot IDs for the two placements |
| `PUBLIC_ADS_PORTAL_SCRIPT` | HTTPS script URL for the Ads Portal. Slots render as `<div data-ad-placement="below-tool">` and `<div data-ad-placement="in-content">` |
| `PUBLIC_CF_ANALYTICS_TOKEN` | Cloudflare Web Analytics beacon; adds the analytics section to the privacy page |
| `PUBLIC_GOOGLE_ANALYTICS_ID` | `G-…` ID. Loads Google Analytics on prunest.com only (not previews or local builds), sending page paths without query strings or `#plan=` fragments, with Google signals and ad personalisation off. Adds the matching privacy text. There is no consent banner: UK and EU rules expect consent before analytics cookies, so add a consent tool before relying on this for visitors there |

Ad slots sit below the tool and inside the supporting content only. They are never among inputs or results and are hidden in print. The privacy page is generated from the same flags, so it always matches what is enabled. If you enable AdSense for UK/EEA visitors, set up Google's consent message in the AdSense account first.

## Cloudflare setup

Nothing in this repository changes your Cloudflare account until you deploy. Before any production change, confirm you are in the right account and that the Worker name (`prunest` in `wrangler.jsonc`) is the project you intend to use: `npx wrangler whoami` and `npx wrangler deployments list`.

### 1. Connect the repository (Workers Builds)

1. Cloudflare dashboard > Workers & Pages > Create > Import a repository > pick this repo.
2. Project name `prunest` (must match `name` in `wrangler.jsonc`).
3. Build command `npm run build`. Deploy command `npx wrangler deploy`. Root directory `/`. Production branch `main`.
4. Add build variable `NODE_VERSION` = `22`, plus any `PUBLIC_*` variables above.

Each push to `main` then builds and deploys. `wrangler.jsonc` has no `main` entry, so no Worker code runs: requests are answered straight from static assets. `html_handling: auto-trailing-slash` serves `mulch-calculator.html` at `/mulch-calculator`, and `not_found_handling: 404-page` returns `404.html` with a real 404 status. There is no single-page-app fallback.

### 2. Attach the primary domain

Worker > Settings > Domains & Routes > Add > Custom domain > `prunest.com`. Cloudflare creates the DNS record for the apex. Do not delete or edit existing MX, TXT (SPF, DKIM, DMARC, site verification) or other mail records.

### 3. Permanent redirects (no Worker code)

Use Redirect Rules so every path and query string is preserved.

**www.prunest.com** (zone `prunest.com`)

1. DNS: if `www` has no record, add `AAAA  www  100::` proxied (orange cloud). If one exists, just make sure it is proxied.
2. Rules > Redirect Rules > Create:
   - When: `http.host eq "www.prunest.com"`
   - Then: Dynamic, expression `concat("https://prunest.com", http.request.uri.path)`, status 301, **Preserve query string** on.

**prunest.in** (add as its own zone in the same account)

1. DNS: `AAAA  @  100::` and `AAAA  www  100::`, both proxied. Only add these where no A/AAAA/CNAME exists for that name. Leave MX and TXT records alone.
2. Rules > Redirect Rules > Create:
   - When: `http.host in {"prunest.in" "www.prunest.in"}`
   - Then: Dynamic, `concat("https://prunest.com", http.request.uri.path)`, status 301, **Preserve query string** on.

Check after DNS has propagated:

```sh
curl -sI "https://www.prunest.com/mulch-calculator?x=1" | grep -iE "^(HTTP|location)"
curl -sI "https://prunest.in/seed-starting-calculator?x=1" | grep -iE "^(HTTP|location)"
curl -sI "https://prunest.com/nope" | head -1     # expect 404
```

Also turn on SSL/TLS > Edge Certificates > Always Use HTTPS for both zones.

## Verification

`npm run verify` runs type checks, 70 unit tests and the production build. `npm run e2e` runs the browser smoke test; GitHub Actions runs both on every push and pull request, in Chromium, Firefox and WebKit. The tests cover rectangular and circular volumes, mixed units and unit round trips, exact-fit and partial bag and bulk rounding, mulch exclusions and depth conversions, plant spacing with edge clearance and exact-fit boundaries, and date offsets, ranges, leap days, year ends and calendar export.

## Known limits

- Soil beds are rectangles or circles; mulch adds triangles and rings. Other shapes are built from sections.
- Plant spacing covers one plant type per layout (straight or staggered rows); no mixed plantings.
- Up to three reference dates per seed schedule.
- Printed diagrams are not true to scale; the labelled dimensions are authoritative.
- No plant database, regional calendars, prices, weather or accounts, by design.
