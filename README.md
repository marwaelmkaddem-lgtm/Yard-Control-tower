# Yard Control Tower

Static GitHub Pages application for batch vessel-planning KPIs, WI-based NVV/rehandle control, planner trends, and optional Yard Inventory analysis.

## Current scope

- Reads multiple Vessel Work Lists in one batch from TXT, CSV, TSV, XLS, or XLSX.
- Detects each vessel and lets the user mark Short Steaming separately for every vessel.
- Calculates planner moves by planner, vessel, move kind, freight kind, and container size without requiring a yard file.
- Calculates discharge NVV directly from each WI using POD, Category, Line and Outbound Carrier; Yard Inventory is not required.
- Treats local-POD imports, non-local transhipments and HLC ITT routing separately, while excluding Empty/MTY and restow moves.
- Detects WI-based potential rehandles from current stack/tier and planned load order, labelled Possible or Probable rather than Confirmed.
- Reads optional Yard Inventory from Excel, including reports with a `Source Data` sheet, for a separate yard view and added WI/yard cross-checks.
- Keeps Planner Moves, Planner Analytics, NVV, Rehandles, Yard Inventory, and History in separate workspaces.
- Charts each planner's moves and vessel share across saved planner-vessel planning cycles, with planner, terminal and date filters.
- Saves calculated batch history locally in IndexedDB. Uploaded source files are not stored.
- Provides a print layout for saving the overview as PDF.
- Bundles the pinned SheetJS Community Edition reader locally; no runtime CDN script handles uploaded files.

## Run locally

Serve the `dist` directory with any static web server. Opening the file directly is not recommended because browser module security can block JavaScript imports.

## Test

```bash
npm test
npm run check
```

## GitHub Pages

The included workflow deploys the contents of `dist` after changes reach `main`. In repository settings, set Pages source to **GitHub Actions** if it is not already enabled.

Expected address after the first successful deployment:

`https://marwaelmkaddem-lgtm.github.io/Yard-Control-tower/`

## Rehandle calculation boundary

The WI model uses exact stack codes from `Current Position`, interprets the final two digits as tier, and checks planned `LOAD` order. A later-planned unit above an earlier target is counted once before being treated as relocated. It does not model 20-foot/40-foot cross-bay interference or a terminal-specific strategy, so results remain planning indicators to validate operationally.
