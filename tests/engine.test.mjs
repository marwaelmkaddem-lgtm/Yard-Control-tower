import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePlannerMoves,
  analyzeYard,
  buildAnalysis,
  buildBatchAnalysis,
  calculateRehandles,
  crossCheckNvv,
  normalizeWiRows,
  normalizeYardRows,
  parseDelimitedText,
} from "../dist/engine.js";

const yard = normalizeYardRows([
  { "Unit Nbr": "AAAA0000001", "Frght Kind": "FCL", Category: "Transship", "O/B Actual Visit": "VISIT1", Position: "Y-MED-1A10A01", Dwell: 2, "Last Move": "01-Sep-26 1200" },
  { "Unit Nbr": "BBBB0000002", "Frght Kind": "FCL", Category: "Transship", "O/B Actual Visit": "OTHER", Position: "Y-MED-1A10A02", Dwell: 20, "Last Move": "01-Sep-26 1201" },
  { "Unit Nbr": "CCCC0000003", "Frght Kind": "Empty", Category: "Import", "O/B Actual Visit": "", Position: "Y-MED-1B12B01", Dwell: 1, "Last Move": "01-Sep-26 1202" },
]);

const wi = normalizeWiRows([
  { Kind: "LOAD", "Container No.": "AAAA0000001", "Outbound Carrier": "VISIT1", "Current Position": "1A10A01", "Move Time": "+MO0800", Sequence: 1 },
  { Kind: "LOAD", "Container No.": "BBBB0000002", "Outbound Carrier": "VISIT1", "Current Position": "1A10A02", "Move Time": "+MO0900", Sequence: 2 },
  { Kind: "LOAD", "Container No.": "DDDD0000004", "Outbound Carrier": "VISIT1", "Current Position": "1C14C01", "Move Time": "+MO1000", Sequence: 3 },
]);

test("parses quoted tab-delimited WI content", () => {
  const rows = parseDelimitedText('Kind\tContainer No.\tPlanner\r\nLOAD\t"AAAA0000001"\tDEL055\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Container No."], "AAAA0000001");
});

test("excludes empty equipment from missing yard NVV", () => {
  const summary = analyzeYard(yard);
  assert.equal(summary.empty, 1);
  assert.equal(summary.missingNvvFcl, 0);
});

test("classifies matching, wrong, and not-in-yard load NVVs", () => {
  const result = crossCheckNvv(yard, wi);
  assert.equal(result.matched, 1);
  assert.equal(result.wrong, 1);
  assert.equal(result.notInYard, 1);
});

test("counts a later planned unit above an earlier load as one rehandle", () => {
  const result = calculateRehandles(yard, wi);
  assert.equal(result.count, 1);
  assert.equal(result.plannedLater, 1);
  assert.equal(result.rows[0].blockerUnit, "BBBB0000002");
});

test("short steaming remains an explicit input", () => {
  const analysis = buildAnalysis({ yardRecords: yard, wiRecords: wi, terminal: "MAMED", planningDate: "2026-09-01", shortSteaming: false });
  assert.equal(analysis.shortSteaming, false);
});

test("planner moves aggregate by planner, move kind, size, and vessel", () => {
  const secondWi = normalizeWiRows([
    { Kind: "DSCH", "Container No.": "EEEE0000005", "Outbound Carrier": "VISIT2", "Outbound Carrier Name": "Second Vessel", Planner: "DEL055", Len: 20, Sts: "Empty" },
    { Kind: "LOAD", "Container No.": "FFFF0000006", "Outbound Carrier": "VISIT2", "Outbound Carrier Name": "Second Vessel", Planner: "NEW001", Len: 45, Sts: "FCL" },
  ]);
  const result = analyzePlannerMoves([
    { id: "vessel-1", fileName: "first.txt", wiRecords: wi, shortSteaming: false },
    { id: "vessel-2", fileName: "second.txt", wiRecords: secondWi, shortSteaming: true },
  ]);

  assert.equal(result.totalMoves, 5);
  assert.equal(result.networkMoves, 3);
  assert.equal(result.shortSteamingMoves, 2);
  assert.equal(result.vesselRows[1].name, "Second Vessel");
  assert.equal(result.planners.find(row => row.planner === "DEL055").vesselCount, 1);
  assert.equal(result.planners.find(row => row.planner === "NEW001").size45, 1);
});

test("batch analysis works without optional yard inventory", () => {
  const analysis = buildBatchAnalysis({
    vessels: [{ id: "vessel-1", fileName: "first.txt", wiRecords: wi, shortSteaming: true }],
    yardRecords: [],
    terminal: "MAMED",
    planningDate: "2026-09-01",
  });

  assert.equal(analysis.yardAvailable, false);
  assert.equal(analysis.planner.totalMoves, 3);
  assert.equal(analysis.planner.shortSteamingMoves, 3);
  assert.equal(analysis.yard, null);
  assert.equal(analysis.nvv, null);
  assert.equal(analysis.rehandles, null);
});

test("batch yard controls retain vessel-level NVV and rehandle results", () => {
  const analysis = buildBatchAnalysis({
    vessels: [{ id: "vessel-1", fileName: "first.txt", wiRecords: wi, shortSteaming: false }],
    yardRecords: yard,
    terminal: "MAMED",
    planningDate: "2026-09-01",
  });

  assert.equal(analysis.yardAvailable, true);
  assert.equal(analysis.nvv.wrong, 1);
  assert.equal(analysis.nvv.rows[0].vesselId, "vessel-1");
  assert.equal(analysis.rehandles.count, 1);
  assert.equal(analysis.rehandles.rows[0].vesselId, "vessel-1");
});
