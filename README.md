# Planning Excellence Center

Static GitHub Pages control tower for vessel planning performance, WI-based NVV/data-accuracy control, POW-aware potential rehandles, and independent Yard Intelligence.

## V4 scope

- Separate Vessel Work List and Yard Inventory analysis paths.
- Global Terminal / Planner / Vessel filters remain visible across every workspace.
- Overview command center with planning, NVV, rehandle, yard, and attention summaries.
- Manual Short Steaming Yes/No by vessel. SS is diagnostic only and excluded from combined NVV KPI numerator/denominator.
- NVV logic from WI discharge FCL only:
  - MTY and restow excluded.
  - Import = local POD + Import category + GEN_TRUCK.
  - HLC ITT = Transship + GEN/Truck routing; local POD allowed.
  - Normal transshipment = non-local POD + Transship + specific next-vessel visit.
- Vessel-ranked NVV command view and container drill-down.
- Rehandle control evaluates stack retrieval conflicts within the same POW using move time, queue and sequence. Cross-POW stack demand is shown separately and is not counted as a rehandle.
- Independent Yard Intelligence with Overview, Aging & Dwell, Blocks & Position, Outbound Visits, Attention, and Container Explorer.
- Yard reports population only; it does not label occupancy without a capacity denominator.
- FCL without Outbound Visit is a Yard data-completeness KPI and is kept separate from WI NVV compliance.
- Local IndexedDB history with filters, record comparison, JSON backup/import and print-friendly executive/detail reports.
- Light / dark themes, all processing in the browser, no runtime network calls.

## Run locally

Serve the `dist` directory with any static server.

## Test

```bash
npm test
npm run check
```

## GitHub Pages

The repository workflow deploys the `dist` directory after changes reach `main`.
