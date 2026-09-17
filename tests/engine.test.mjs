import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeWiNvv,
  analyzeYard,
  buildPlanningAnalysis,
  calculateWiRehandles,
  normalizeWiRows,
  normalizeYardRows,
  parseDelimitedText,
  parseMoveTime,
} from "../dist/engine.js";

test("parses quoted tab-delimited WI content", () => {
  const rows = parseDelimitedText('Kind\tContainer No.\tPlanner\r\nLOAD\t"AAAA0000001"\tDEL055\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Container No."], "AAAA0000001");
});

test("parses move time with and without colon", () => {
  assert.equal(parseMoveTime("+MO09:42"), parseMoveTime("+MO0942"));
});

test("yard reports population and FCL without outbound visit, not NVV", () => {
  const yard = normalizeYardRows([
    { "Unit Nbr":"AAAA0000001", "Frght Kind":"FCL", "O/B Actual Visit":"", Position:"Y-MED-1A1001", Dwell:20 },
    { "Unit Nbr":"BBBB0000002", "Frght Kind":"Empty", "O/B Actual Visit":"", Position:"Y-MED-1A1002", Dwell:2 },
  ]);
  const result = analyzeYard(yard);
  assert.equal(result.total, 2);
  assert.equal(result.fclWithoutOutboundVisit, 1);
  assert.equal(result.aged15, 1);
});

test("NVV import requires GEN_TRUCK and does not accept GEN_CARRIER", () => {
  const rows = normalizeWiRows([
    { Kind:"DSCH", "Container No.":"IMPT0000001", Sts:"FCL", POD:"MAMED", Cat:"Import", Line:"MAE", "Outbound Carrier":"GEN_TRUCK" },
    { Kind:"DSCH", "Container No.":"BAD00000002", Sts:"FCL", POD:"MAMED", Cat:"Import", Line:"MAE", "Outbound Carrier":"GEN_CARRIER" },
  ]);
  const result = analyzeWiNvv(rows, "MAMED");
  assert.equal(result.validImport, 1);
  assert.equal(result.outboundMismatch, 1);
});

test("HLC ITT accepts generic routing and local POD", () => {
  const rows = normalizeWiRows([
    { Kind:"DSCH", "Container No.":"ITTT0000001", Sts:"FCL", POD:"MAMED", Cat:"Transship", Line:"HLC", "Outbound Carrier":"GEN_CARRIER" },
  ]);
  const result = analyzeWiNvv(rows, "MAMED");
  assert.equal(result.validItt, 1);
  assert.equal(result.exceptionCount, 0);
});

test("normal transhipment requires a specific next-vessel visit", () => {
  const rows = normalizeWiRows([
    { Kind:"DSCH", "Container No.":"TRNS0000001", Sts:"FCL", POD:"OMSLL", Cat:"Transship", Line:"MAE", "Outbound Carrier":"NEXT123" },
    { Kind:"DSCH", "Container No.":"MISS0000002", Sts:"FCL", POD:"OMSLL", Cat:"Transship", Line:"MAE", "Outbound Carrier":"GEN_CARRIER" },
  ]);
  const result = analyzeWiNvv(rows, "MAMED");
  assert.equal(result.validTransship, 1);
  assert.equal(result.missingNvv, 1);
});

test("Short Steaming stays diagnostic but is excluded from combined NVV KPI", () => {
  const network = normalizeWiRows([{ Kind:"DSCH", "Container No.":"NETW0000001", Sts:"FCL", POD:"OMSLL", Cat:"Transship", Line:"MAE", "Outbound Carrier":"NEXT123", Planner:"P1", "Outbound Carrier Name":"NETWORK" }]);
  const ss = normalizeWiRows([{ Kind:"DSCH", "Container No.":"SSSS0000001", Sts:"FCL", POD:"OMSLL", Cat:"Transship", Line:"MAE", "Outbound Carrier":"GEN_CARRIER", Planner:"P2", "Outbound Carrier Name":"SHORT" }]);
  const result = buildPlanningAnalysis({
    terminal:"MAMED", planningDate:"2026-09-17",
    vessels:[
      { id:"n", fileName:"n.txt", wiRecords:network, shortSteaming:false },
      { id:"s", fileName:"s.txt", wiRecords:ss, shortSteaming:true },
    ],
  });
  assert.equal(result.nvv.eligibleVesselCount, 1);
  assert.equal(result.nvv.excludedShortSteamingVessels, 1);
  assert.equal(result.nvv.eligibleFcl, 1);
  assert.equal(result.nvv.valid, 1);
  assert.equal(result.nvv.exceptionCount, 0);
  assert.equal(result.nvv.rows.length, 2);
});

test("rehandle control counts same-POW blockers but separates cross-POW demand", () => {
  const wi = normalizeWiRows([
    { Kind:"LOAD", "Container No.":"LOWR0000001", Cat:"Export", "Current Position":"1A1001", "Move Time":"+MO0800", Sequence:1, "P.O.W.":"POW1", Planner:"P1" },
    { Kind:"LOAD", "Container No.":"UPPR0000002", Cat:"Export", "Current Position":"1A1002", "Move Time":"+MO1000", Sequence:2, "P.O.W.":"POW1", Planner:"P1" },
    { Kind:"LOAD", "Container No.":"XPOW0000003", Cat:"Export", "Current Position":"2A1002", "Move Time":"+MO0900", Sequence:1, "P.O.W.":"POW2", Planner:"P2" },
    { Kind:"LOAD", "Container No.":"BASE0000004", Cat:"Export", "Current Position":"2A1001", "Move Time":"+MO0830", Sequence:1, "P.O.W.":"POW1", Planner:"P1" },
  ]);
  const result = calculateWiRehandles(wi);
  assert.equal(result.count, 1);
  assert.equal(result.rows[0].targetUnit, "LOWR0000001");
  assert.ok(result.crossPowCount >= 1);
});
