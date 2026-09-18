import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeWiNvv,
  analyzeYard,
  buildBatchAnalysis,
  buildPlanningAnalysis,
  calculateWiRehandles,
  compactHistoryRecord,
  isPlannerPerformanceOnly,
  normalizeWiRows,
  normalizeYardRows,
  parseDelimitedText,
  parseMoveTime,
  restorePlannerMoves,
} from "../dist/engine.js";

test("planner performance export is isolated from NVV and rehandle controls", () => {
  const raw = [
    { Carrier:"L4B633S", "Carrier Name":"CMA CGM LISA MARIE", "Move Kind":"Discharge", "Conatiner Number":"DISC0000001", Length:"20", Planner:"P1", "Freight Kind":"FCL", "Move To":"EC", "Move From":"451774" },
    { Carrier:"L4B633S", "Carrier Name":"CMA CGM LISA MARIE", "Move Kind":"Load", "Conatiner Number":"LOAD0000002", Length:"40", Planner:"P2", "Freight Kind":"MTY", "Move To":"451774", "Move From":"EC" },
  ];
  assert.equal(isPlannerPerformanceOnly(raw), true);
  const result = buildPlanningAnalysis({
    terminal:"MAMED",
    planningDate:"2026-09-18",
    vessels:[{ id:"v1", fileName:"planner.txt", wiRecords:normalizeWiRows(raw), plannerOnly:true, shortSteaming:false }],
  });
  assert.equal(result.planner.totalMoves, 2);
  assert.equal(result.planner.totalLoads, 1);
  assert.equal(result.planner.totalDischarges, 1);
  assert.equal(result.planner.planners.length, 2);
  assert.equal(result.vessels[0].name, "CMA CGM LISA MARIE");
  assert.equal(result.vessels[0].visit, "L4B633S");
  assert.equal(result.vessels[0].plannerOnly, true);
  assert.equal(result.nvv.rows.length, 0);
  assert.equal(result.nvv.eligibleVesselCount, 0);
  assert.equal(result.nvv.excludedPlannerOnlyVessels, 1);
  assert.equal(result.rehandles.count, 0);
  assert.equal(result.rehandles.crossPowCount, 0);

  const batch = buildBatchAnalysis({
    terminal:"MAMED",
    planningDate:"2026-09-18",
    vessels:[{ id:"v1", fileName:"planner.txt", wiRecords:normalizeWiRows(raw), plannerOnly:true, shortSteaming:false }],
    yardRecords:[{ unit:"LOAD0000002", outboundVisit:"OTHER", position:"1A1001" }],
  });
  assert.equal(batch.yardConnection.totalLoads, 0);
});

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

test("planning history preserves planner moves while removing source WI rows", () => {
  const wi = normalizeWiRows([
    { Kind:"LOAD", "Container No.":"LOAD0000001", Planner:"P1", Sts:"FCL", Length:"40" },
    { Kind:"DSCH", "Container No.":"DISC0000002", Planner:"P2", Sts:"MTY", Length:"20" },
  ]);
  const analysis = buildPlanningAnalysis({
    terminal:"MAMED",
    planningDate:"2026-09-17",
    vessels:[{ id:"v1", fileName:"v1.txt", wiRecords:wi, shortSteaming:false }],
  });
  const saved = compactHistoryRecord(analysis);
  assert.equal(saved.planner.moves.length, 2);
  assert.equal("wiRecords" in saved.vessels[0], false);
});

test("planner moves can be restored from an earlier compact history summary", () => {
  const restored = restorePlannerMoves({
    planner:{ totalMoves:3, moves:[] },
    vessels:[{
      id:"v1", name:"TEST VESSEL", visit:"VISIT1", shortSteaming:false,
      plannerBreakdown:[
        { planner:"P1", totalMoves:2, loads:1, discharges:1, full:1, empty:1, size20:1, size40:1, size45:0 },
        { planner:"P2", totalMoves:1, loads:1, discharges:0, full:1, empty:0, size20:0, size40:0, size45:1 },
      ],
    }],
  });
  assert.equal(restored.length, 3);
  assert.equal(restored.filter(move => move.planner === "P1").length, 2);
  assert.equal(restored.filter(move => move.kind === "LOAD").length, 2);
  assert.equal(restored.filter(move => move.length === "45").length, 1);
});
