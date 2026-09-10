# Yard Control Tower

Static GitHub Pages application for matching a terminal yard inventory with a Vessel Work List.

## Current scope

- Reads the yard inventory from Excel, including reports that contain a `Source Data` sheet.
- Reads the tab-delimited Vessel Work List exported as TXT.
- Compares each planned `LOAD` container's WI `Outbound Carrier` with the yard `O/B Actual Visit`.
- Reports matched, wrong, missing, and not-in-yard NVV results with downloadable CSV detail.
- Compares the WI and yard positions without replacing the yard snapshot position.
- Simulates potential rehandles in WI move-time order using the final two digits of each yard position as the tier.
- Keeps Empty/MTY equipment out of the missing-yard-NVV count.
- Uses a manual Short Steaming selector; `GEN_CARRIER` never assigns SS automatically.
- Saves calculated history locally in IndexedDB. Uploaded source files are not stored.
- Provides a print layout for saving the overview as PDF.

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

The first version uses exact stack codes derived from the yard position and counts each unit still above a planned target once before treating it as relocated. It does not yet model 20-foot/40-foot cross-bay interference or a terminal-specific rehandle strategy. The output is therefore a planning indicator to validate against the live yard.
