const DAY_ORDER = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

const YARD_ALIASES = {
  facility: ["facility", "terminal"],
  lastMove: ["last move", "last movement", "lastmove"],
  unit: ["unit nbr", "unit no", "unit number", "container no", "container no.", "container number", "container"],
  lineOp: ["line op", "line operator", "line"],
  freightKind: ["frght kind", "freight kind", "sts", "status"],
  category: ["category", "cat"],
  typeIso: ["type iso", "iso", "iso type"],
  inboundVisit: ["i/b actual visit", "ib actual visit", "inbound visit", "ib visit"],
  outboundVisit: ["o/b actual visit", "ob actual visit", "outbound visit", "ob visit", "nvv"],
  pod: ["pod", "port of discharge"],
  destination: ["dest", "destination"],
  dwell: ["dwell", "dwell days", "dwell time"],
  vip: ["vip customers", "vip customer", "vip"],
  position: ["position", "yard position", "current position"],
};

const WI_ALIASES = {
  outboundCarrier: ["outbound carrier", "outbound visit", "carrier"],
  outboundCarrierName: ["outbound carrier name", "vessel name"],
  kind: ["kind", "move kind"],
  unit: ["container no.", "container no", "container number", "unit nbr", "unit no"],
  length: ["len", "length", "size"],
  moveStage: ["move stage", "stage"],
  currentPosition: ["current position", "yard position", "position"],
  outboundPosition: ["outbound position", "vessel position"],
  queue: ["queue"],
  sequence: ["sequence", "seq"],
  moveTime: ["move time", "planned move time"],
  pow: ["p.o.w.", "pow", "point of work"],
  planner: ["planner"],
  weight: ["wt tns", "weight", "weight tns"],
  pod: ["pod", "port of discharge"],
  freightKind: ["sts", "status", "freight kind"],
  category: ["cat", "category"],
  lineOp: ["line", "line op", "line operator"],
};

export function normalizeHeader(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

export function canonicalContainer(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeLookup(row) {
  const lookup = new Map();
  Object.entries(row || {}).forEach(([key, value]) => lookup.set(normalizeHeader(key), value));
  return lookup;
}

function readAlias(lookup, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (lookup.has(key)) return lookup.get(key);
  }
  return "";
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(cleanText(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function titleCase(value) {
  const text = cleanText(value).toLowerCase();
  return text ? text.replace(/\b\w/g, letter => letter.toUpperCase()) : "Unspecified";
}

export function normalizeYardRows(rawRows) {
  const records = [];
  (rawRows || []).forEach((raw, index) => {
    const lookup = makeLookup(raw);
    const unit = canonicalContainer(readAlias(lookup, YARD_ALIASES.unit));
    if (!unit) return;
    records.push({
      index,
      unit,
      facility: cleanText(readAlias(lookup, YARD_ALIASES.facility)).toUpperCase(),
      lastMove: cleanText(readAlias(lookup, YARD_ALIASES.lastMove)),
      lineOp: cleanText(readAlias(lookup, YARD_ALIASES.lineOp)).toUpperCase(),
      freightKind: cleanText(readAlias(lookup, YARD_ALIASES.freightKind)).toUpperCase(),
      category: titleCase(readAlias(lookup, YARD_ALIASES.category)),
      typeIso: cleanText(readAlias(lookup, YARD_ALIASES.typeIso)).toUpperCase(),
      inboundVisit: cleanText(readAlias(lookup, YARD_ALIASES.inboundVisit)).toUpperCase(),
      outboundVisit: cleanText(readAlias(lookup, YARD_ALIASES.outboundVisit)).toUpperCase(),
      pod: cleanText(readAlias(lookup, YARD_ALIASES.pod)).toUpperCase(),
      destination: cleanText(readAlias(lookup, YARD_ALIASES.destination)).toUpperCase(),
      dwell: toNumber(readAlias(lookup, YARD_ALIASES.dwell)),
      vip: cleanText(readAlias(lookup, YARD_ALIASES.vip)),
      position: cleanText(readAlias(lookup, YARD_ALIASES.position)).toUpperCase(),
    });
  });
  return records;
}

export function normalizeWiRows(rawRows) {
  const records = [];
  (rawRows || []).forEach((raw, index) => {
    const lookup = makeLookup(raw);
    const unit = canonicalContainer(readAlias(lookup, WI_ALIASES.unit));
    const kind = cleanText(readAlias(lookup, WI_ALIASES.kind)).toUpperCase();
    if (!unit && !kind) return;
    records.push({
      index,
      unit,
      kind,
      outboundCarrier: cleanText(readAlias(lookup, WI_ALIASES.outboundCarrier)).toUpperCase(),
      outboundCarrierName: cleanText(readAlias(lookup, WI_ALIASES.outboundCarrierName)),
      length: cleanText(readAlias(lookup, WI_ALIASES.length)),
      moveStage: cleanText(readAlias(lookup, WI_ALIASES.moveStage)),
      currentPosition: cleanText(readAlias(lookup, WI_ALIASES.currentPosition)).toUpperCase(),
      outboundPosition: cleanText(readAlias(lookup, WI_ALIASES.outboundPosition)).toUpperCase(),
      queue: cleanText(readAlias(lookup, WI_ALIASES.queue)),
      sequence: toNumber(readAlias(lookup, WI_ALIASES.sequence)) ?? 0,
      moveTime: cleanText(readAlias(lookup, WI_ALIASES.moveTime)).toUpperCase(),
      pow: cleanText(readAlias(lookup, WI_ALIASES.pow)),
      planner: cleanText(readAlias(lookup, WI_ALIASES.planner)),
      weight: toNumber(readAlias(lookup, WI_ALIASES.weight)),
      pod: cleanText(readAlias(lookup, WI_ALIASES.pod)).toUpperCase(),
      freightKind: cleanText(readAlias(lookup, WI_ALIASES.freightKind)).toUpperCase(),
      category: titleCase(readAlias(lookup, WI_ALIASES.category)),
      lineOp: cleanText(readAlias(lookup, WI_ALIASES.lineOp)).toUpperCase(),
    });
  });
  return records;
}

export function parseDelimitedText(text, delimiter = "\t") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some(value => cleanText(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => cleanText(value))) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map(cleanText);
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function normalizePosition(value) {
  let text = cleanText(value).toUpperCase().replace(/\s+/g, "");
  for (const prefix of ["Y-MED-", "Y-MAMED-", "MED-", "MAMED-"]) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }
  return text;
}

export function parsePosition(value) {
  const normalized = normalizePosition(value);
  const match = normalized.match(/^(.*?)(\d{2})$/);
  if (!match || !match[1]) return { normalized, stack: "", tier: null, block: deriveBlock(normalized), usable: false };
  const tier = Number.parseInt(match[2], 10);
  const stack = match[1];
  return { normalized, stack, tier, block: deriveBlock(normalized), usable: Number.isFinite(tier) };
}

function deriveBlock(normalizedPosition) {
  const text = normalizePosition(normalizedPosition);
  const standard = text.match(/^([0-9][A-Z])/);
  if (standard) return standard[1];
  const special = text.match(/^(OOG|DMGS|PTI|BR|COST|QC\d+|[0-9]Z)/);
  return special ? special[1] : (text ? "Other" : "Unspecified");
}

export function parseMoveTime(value) {
  const text = cleanText(value).toUpperCase().replace(/^\+/, "");
  const match = text.match(/^([A-Z]{2})(\d{2})(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const day = DAY_ORDER[match[1]];
  if (day === undefined) return Number.MAX_SAFE_INTEGER;
  return day * 1440 + Number.parseInt(match[2], 10) * 60 + Number.parseInt(match[3], 10);
}

export function parseOperationalDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = cleanText(value);
  if (!text) return null;
  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso;
  const match = text.toUpperCase().match(/^(\d{1,2})[-/ ]([A-Z]{3}|\d{1,2})[-/ ](\d{2}|\d{4})(?:\s+(\d{2}):?(\d{2}))?/);
  if (!match) return null;
  const month = MONTHS[match[2]] ?? (Number.parseInt(match[2], 10) - 1);
  let year = Number.parseInt(match[3], 10);
  if (year < 100) year += 2000;
  const date = new Date(year, month, Number.parseInt(match[1], 10), Number.parseInt(match[4] || "0", 10), Number.parseInt(match[5] || "0", 10));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isEmpty(record) {
  const text = cleanText(record.freightKind).toUpperCase();
  return ["EMPTY", "MTY", "M/T", "EMPTIES"].includes(text);
}

function isReefer(record) {
  return /R/.test(cleanText(record.typeIso).toUpperCase());
}

function dwellBucket(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value <= 1) return "0–1";
  if (value <= 3) return "2–3";
  if (value <= 7) return "4–7";
  if (value <= 14) return "8–14";
  if (value <= 30) return "15–30";
  if (value <= 60) return "31–60";
  if (value <= 90) return "61–90";
  return "91+";
}

function countBy(records, accessor) {
  const counts = new Map();
  records.forEach(record => {
    const key = accessor(record) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function latestDate(records) {
  let latest = null;
  records.forEach(record => {
    const date = parseOperationalDate(record.lastMove);
    if (date && (!latest || date > latest)) latest = date;
  });
  return latest;
}

export function analyzeYard(records) {
  const units = new Map();
  const duplicates = [];
  const dwellValues = [];
  let fcl = 0;
  let empty = 0;
  let missingNvvFcl = 0;
  let nonStackPositions = 0;
  let reefer = 0;
  let aged15 = 0;
  let aged31 = 0;
  let aged91 = 0;

  records.forEach(record => {
    if (units.has(record.unit)) duplicates.push(record.unit);
    else units.set(record.unit, record);
    if (isEmpty(record)) empty += 1;
    else {
      fcl += 1;
      if (!record.outboundVisit) missingNvvFcl += 1;
    }
    const position = parsePosition(record.position);
    if (!position.usable) nonStackPositions += 1;
    if (isReefer(record)) reefer += 1;
    if (Number.isFinite(record.dwell)) {
      dwellValues.push(record.dwell);
      if (record.dwell >= 15) aged15 += 1;
      if (record.dwell >= 31) aged31 += 1;
      if (record.dwell >= 91) aged91 += 1;
    }
  });

  const dwellOrder = ["0–1", "2–3", "4–7", "8–14", "15–30", "31–60", "61–90", "91+", "Unavailable"];
  const dwellCounts = new Map(countBy(records, record => dwellBucket(record.dwell)).map(item => [item.label, item.value]));

  return {
    total: records.length,
    uniqueUnits: units.size,
    fcl,
    empty,
    reefer,
    aged15,
    aged31,
    aged91,
    missingNvvFcl,
    nonStackPositions,
    duplicateCount: duplicates.length,
    duplicateExamples: [...new Set(duplicates)].slice(0, 20),
    averageDwell: dwellValues.length ? dwellValues.reduce((sum, value) => sum + value, 0) / dwellValues.length : null,
    medianDwell: median(dwellValues),
    oldestDwell: dwellValues.length ? Math.max(...dwellValues) : null,
    snapshotLatest: latestDate(records)?.toISOString() || null,
    categories: countBy(records, record => record.category),
    lines: countBy(records, record => record.lineOp),
    blocks: countBy(records, record => parsePosition(record.position).block),
    dwellBuckets: dwellOrder.map(label => ({ label, value: dwellCounts.get(label) || 0 })),
  };
}

function vesselIdentity(loads) {
  const visits = countBy(loads, record => record.outboundCarrier).filter(item => item.label !== "Unspecified");
  const names = countBy(loads, record => record.outboundCarrierName).filter(item => item.label !== "Unspecified");
  return {
    visit: visits[0]?.label || "Unknown visit",
    name: names[0]?.label || "Unknown vessel",
    multipleVisits: visits.length > 1,
  };
}

export function crossCheckNvv(yardRecords, wiRecords) {
  const loads = wiRecords.filter(record => record.kind === "LOAD" && record.unit);
  const discharges = wiRecords.filter(record => record.kind === "DSCH" && record.unit);
  const yardByUnit = new Map();
  yardRecords.forEach(record => {
    if (!yardByUnit.has(record.unit)) yardByUnit.set(record.unit, record);
  });

  const rows = loads.map(load => {
    const yard = yardByUnit.get(load.unit);
    const expected = load.outboundCarrier;
    const actual = yard?.outboundVisit || "";
    let status = "match";
    if (!yard) status = "not-yard";
    else if (!actual) status = "missing";
    else if (!expected || actual !== expected) status = "wrong";

    const yardPosition = normalizePosition(yard?.position || "");
    const wiPosition = normalizePosition(load.currentPosition);
    const positionStatus = !yard ? "not-yard" : (!yardPosition || !wiPosition ? "unavailable" : (yardPosition === wiPosition ? "match" : "mismatch"));
    return {
      unit: load.unit,
      status,
      expectedVisit: expected,
      actualVisit: actual,
      lineOp: yard?.lineOp || load.lineOp,
      category: yard?.category || load.category,
      yardPosition,
      wiPosition,
      positionStatus,
      moveTime: load.moveTime,
      planner: load.planner,
      pow: load.pow,
      queue: load.queue,
      sequence: load.sequence,
      length: load.length,
      freightKind: load.freightKind,
    };
  });

  const matched = rows.filter(row => row.status === "match").length;
  const found = rows.filter(row => row.status !== "not-yard").length;
  const wrong = rows.filter(row => row.status === "wrong").length;
  const missing = rows.filter(row => row.status === "missing").length;
  const notInYard = rows.filter(row => row.status === "not-yard").length;
  const positionMismatch = rows.filter(row => row.positionStatus === "mismatch").length;

  return {
    vessel: vesselIdentity(loads),
    totalMoves: wiRecords.filter(record => record.unit).length,
    totalLoads: loads.length,
    totalDischarges: discharges.length,
    found,
    matched,
    wrong,
    missing,
    notInYard,
    positionMismatch,
    matchRate: found ? matched / found : 0,
    coverageRate: loads.length ? found / loads.length : 0,
    loadByFreightKind: countBy(loads, record => record.freightKind),
    loadByLength: countBy(loads, record => record.length),
    rows,
  };
}

export function calculateRehandles(yardRecords, wiRecords) {
  const loads = wiRecords.filter(record => record.kind === "LOAD" && record.unit);
  const loadByUnit = new Map(loads.map(load => [load.unit, load]));
  const yardByUnit = new Map();
  yardRecords.forEach(record => {
    if (!yardByUnit.has(record.unit)) yardByUnit.set(record.unit, record);
  });

  const stacks = new Map();
  const activeLocations = new Map();
  yardRecords.forEach(record => {
    const position = parsePosition(record.position);
    if (!position.usable || activeLocations.has(record.unit)) return;
    if (!stacks.has(position.stack)) stacks.set(position.stack, new Map());
    const tiers = stacks.get(position.stack);
    if (!tiers.has(position.tier)) tiers.set(position.tier, []);
    tiers.get(position.tier).push(record.unit);
    activeLocations.set(record.unit, { stack: position.stack, tier: position.tier });
  });

  const orderedLoads = [...loads].sort((a, b) =>
    parseMoveTime(a.moveTime) - parseMoveTime(b.moveTime)
    || a.queue.localeCompare(b.queue)
    || a.sequence - b.sequence
    || a.index - b.index
  );

  const rows = [];
  const affectedTargets = new Set();
  orderedLoads.forEach(targetLoad => {
    const location = activeLocations.get(targetLoad.unit);
    if (!location) return;
    const tiers = stacks.get(location.stack);
    const blockers = [];
    tiers.forEach((units, tier) => {
      if (tier <= location.tier) return;
      units.forEach(unit => {
        if (activeLocations.has(unit)) blockers.push({ unit, tier });
      });
    });

    blockers.sort((a, b) => b.tier - a.tier || a.unit.localeCompare(b.unit));
    blockers.forEach(blocker => {
      const blockerLoad = loadByUnit.get(blocker.unit);
      const blockerYard = yardByUnit.get(blocker.unit);
      rows.push({
        targetUnit: targetLoad.unit,
        blockerUnit: blocker.unit,
        stack: location.stack,
        targetTier: location.tier,
        blockerTier: blocker.tier,
        blockerStatus: blockerLoad ? "later-wi" : "external",
        blockerLine: blockerYard?.lineOp || "",
        blockerCategory: blockerYard?.category || "",
        blockerVisit: blockerYard?.outboundVisit || "",
        targetMoveTime: targetLoad.moveTime,
        targetPlanner: targetLoad.planner,
        targetPow: targetLoad.pow,
        targetQueue: targetLoad.queue,
      });
      affectedTargets.add(targetLoad.unit);
      removeUnitFromStack(blocker.unit, activeLocations, stacks);
    });
    removeUnitFromStack(targetLoad.unit, activeLocations, stacks);
  });

  return {
    count: rows.length,
    uniqueBlockers: new Set(rows.map(row => row.blockerUnit)).size,
    affectedTargets: affectedTargets.size,
    plannedLater: rows.filter(row => row.blockerStatus === "later-wi").length,
    external: rows.filter(row => row.blockerStatus === "external").length,
    rows,
  };
}

function removeUnitFromStack(unit, locations, stacks) {
  const location = locations.get(unit);
  if (!location) return;
  const tierUnits = stacks.get(location.stack)?.get(location.tier);
  if (tierUnits) {
    const index = tierUnits.indexOf(unit);
    if (index >= 0) tierUnits.splice(index, 1);
  }
  locations.delete(unit);
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0)) / 86400000);
}

export function buildAnalysis({ yardRecords, wiRecords, terminal, planningDate, shortSteaming, sourceFiles }) {
  const yard = analyzeYard(yardRecords);
  const nvv = crossCheckNvv(yardRecords, wiRecords);
  const rehandles = calculateRehandles(yardRecords, wiRecords);
  const snapshotAgeDays = daysBetween(yard.snapshotLatest, planningDate);

  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    terminal,
    planningDate,
    shortSteaming: Boolean(shortSteaming),
    sourceFiles: sourceFiles || {},
    yard,
    nvv,
    rehandles,
    quality: {
      snapshotAgeDays,
      missingFromYard: nvv.notInYard,
      wrongOrMissingNvv: nvv.wrong + nvv.missing,
      positionMismatch: nvv.positionMismatch,
      missingNvvFcl: yard.missingNvvFcl,
      duplicateYardUnits: yard.duplicateCount,
      nonStackPositions: yard.nonStackPositions,
    },
  };
}

export function compactHistoryRecord(analysis) {
  return {
    ...analysis,
    yard: { ...analysis.yard },
    nvv: { ...analysis.nvv },
    rehandles: { ...analysis.rehandles },
  };
}
