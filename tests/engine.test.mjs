import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeYard,
  buildAnalysis,
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
