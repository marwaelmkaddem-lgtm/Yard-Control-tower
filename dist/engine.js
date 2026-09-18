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
  outboundCarrierName: ["outbound carrier name", "vessel name", "carrier name"],
  kind: ["kind", "move kind"],
  unit: ["container no.", "container no", "container number", "conatiner number", "unit nbr", "unit no"],
  length: ["len", "length", "size"],
  moveStage: ["move stage", "stage"],
  currentPosition: ["current position", "yard position", "position"],
  outboundPosition: ["outbound position", "vessel position", "planned position"],
  queue: ["queue"],
  sequence: ["sequence", "seq"],
  moveTime: ["move time", "planned move time"],
  pow: ["p.o.w.", "pow", "point of work", "pow name"],
  planner: ["planner"],
  weight: ["wt tns", "weight", "weight tns", "unit weight (kg)"],
  pod: ["pod", "port of discharge", "unit pod"],
  freightKind: ["sts", "status", "freight kind"],
  category: ["cat", "category"],
  lineOp: ["line", "line op", "line operator"],
  typeIso: ["type iso", "iso", "iso type", "equipment type"],
  specialStow: ["special stow", "unit is special stow?", "special handling", "handling instruction", "special instructions"],
};

export function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[._/\\-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

export function isPlannerPerformanceOnly(rawRows) {
  const headers = new Set(Object.keys(rawRows?.[0] || {}).map(normalizeHeader));
  const hasContainer = headers.has("container number") || headers.has("conatiner number");
  return headers.has("carrier")
    && headers.has("carrier name")
    && headers.has("move kind")
    && hasContainer
    && headers.has("move to")
    && headers.has("move from")
    && !headers.has("outbound carrier");
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

function normalizeMoveKind(value) {
  const kind = cleanText(value).toUpperCase();
  if (["DISCHARGE", "DISCH", "DISCHARGING"].includes(kind)) return "DSCH";
  if (["LOAD", "LOADING"].includes(kind)) return "LOAD";
  return kind;
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
    const kind = normalizeMoveKind(readAlias(lookup, WI_ALIASES.kind));
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
      typeIso: cleanText(readAlias(lookup, WI_ALIASES.typeIso)).toUpperCase(),
      specialStow: cleanText(readAlias(lookup, WI_ALIASES.specialStow)).toUpperCase(),
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
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some(value => cleanText(value))) rows.push(row);
      row = []; cell = "";
    } else cell += char;
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
    if (text.startsWith(prefix)) { text = text.slice(prefix.length); break; }
  }
  return text;
}

export function parsePosition(value) {
  const normalized = normalizePosition(value);
  const match = normalized.match(/^(.*?)(\d{2})$/);
  if (!match || !match[1]) return { normalized, stack: "", tier: null, block: deriveBlock(normalized), usable: false };
  const tier = Number.parseInt(match[2], 10);
  return { normalized, stack: match[1], tier, block: deriveBlock(normalized), usable: Number.isFinite(tier) };
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
  const match = text.match(/^([A-Z]{2})(\d{2}):?(\d{2})/);
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

function isReefer(record) { return /R/.test(cleanText(record.typeIso).toUpperCase()); }
function normalizedCategory(value) { return cleanText(value).toUpperCase().replace(/[^A-Z]/g, ""); }
function isImportCategory(value) { return normalizedCategory(value) === "IMPORT"; }
function isTransshipCategory(value) { return /TRANSSHIP/.test(normalizedCategory(value)); }
function isRestowCategory(value) { return /RESTOW/.test(normalizedCategory(value)); }
function normalizedOutbound(value) { return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function isHlcIttOutbound(value) { return ["GEN", "GENCARRIER", "GENTRUCK", "TRUCK", "ROAD"].includes(normalizedOutbound(value)); }
function isImportTruckOutbound(value) { return normalizedOutbound(value) === "GENTRUCK"; }
function isGenericOutbound(value) { return isHlcIttOutbound(value); }

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

function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

function latestDate(records) {
  let latest = null;
  records.forEach(record => {
    const date = parseOperationalDate(record.lastMove);
    if (date && (!latest || date > latest)) latest = date;
  });
  return latest;
}

function summarizeBy(records, keyAccessor) {
  const groups = new Map();
  records.forEach(record => {
    const key = keyAccessor(record) || "Unspecified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups.entries()].map(([label, rows]) => {
    const dwell = rows.map(row => row.dwell).filter(Number.isFinite);
    return {
      label,
      total: rows.length,
      fcl: rows.filter(row => !isEmpty(row)).length,
      empty: rows.filter(isEmpty).length,
      aged15: rows.filter(row => Number.isFinite(row.dwell) && row.dwell >= 15).length,
      aged31: rows.filter(row => Number.isFinite(row.dwell) && row.dwell >= 31).length,
      aged91: rows.filter(row => Number.isFinite(row.dwell) && row.dwell >= 91).length,
      averageDwell: average(dwell),
      medianDwell: median(dwell),
      oldestDwell: dwell.length ? Math.max(...dwell) : null,
    };
  }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function analyzeYard(records) {
  const unique = new Map();
  const duplicateUnits = [];
  const rows = (records || []).map(record => {
    const parsed = parsePosition(record.position);
    return { ...record, block: parsed.block, stack: parsed.stack, tier: parsed.tier, positionUsable: parsed.usable, dwellBucket: dwellBucket(record.dwell) };
  });
  const dwellValues = [];
  let fcl = 0, empty = 0, fclWithoutOutboundVisit = 0, nonStackPositions = 0, reefer = 0, aged15 = 0, aged31 = 0, aged91 = 0;
  rows.forEach(record => {
    if (unique.has(record.unit)) duplicateUnits.push(record.unit); else unique.set(record.unit, record);
    if (isEmpty(record)) empty += 1;
    else { fcl += 1; if (!record.outboundVisit) fclWithoutOutboundVisit += 1; }
    if (!record.positionUsable) nonStackPositions += 1;
    if (isReefer(record)) reefer += 1;
    if (Number.isFinite(record.dwell)) {
      dwellValues.push(record.dwell);
      if (record.dwell >= 15) aged15 += 1;
      if (record.dwell >= 31) aged31 += 1;
      if (record.dwell >= 91) aged91 += 1;
    }
  });
  const dwellOrder = ["0–1", "2–3", "4–7", "8–14", "15–30", "31–60", "61–90", "91+", "Unavailable"];
  const dwellCounts = new Map(countBy(rows, record => record.dwellBucket).map(item => [item.label, item.value]));
  return {
    total: rows.length,
    uniqueUnits: unique.size,
    fcl, empty, reefer, aged15, aged31, aged91,
    fclWithoutOutboundVisit,
    nonStackPositions,
    duplicateCount: duplicateUnits.length,
    duplicateExamples: [...new Set(duplicateUnits)].slice(0, 20),
    averageDwell: average(dwellValues),
    medianDwell: median(dwellValues),
    oldestDwell: dwellValues.length ? Math.max(...dwellValues) : null,
    snapshotLatest: latestDate(rows)?.toISOString() || null,
    categories: countBy(rows, record => record.category),
    lines: countBy(rows, record => record.lineOp),
    blocks: countBy(rows, record => record.block),
    outboundVisits: countBy(rows, record => record.outboundVisit),
    dwellBuckets: dwellOrder.map(label => ({ label, value: dwellCounts.get(label) || 0 })),
    blockStats: summarizeBy(rows, record => record.block),
    outboundStats: summarizeBy(rows, record => record.outboundVisit),
    lineStats: summarizeBy(rows, record => record.lineOp),
    categoryStats: summarizeBy(rows, record => record.category),
    rows,
  };
}

export function vesselIdentity(records, fallbackName = "Unknown vessel") {
  const visits = countBy(records, record => record.outboundCarrier).filter(item => item.label !== "Unspecified");
  const names = countBy(records, record => record.outboundCarrierName).filter(item => item.label !== "Unspecified");
  return { visit: visits[0]?.label || "Unknown visit", name: names[0]?.label || fallbackName || "Unknown vessel", multipleVisits: visits.length > 1 };
}

export function crossCheckNvv(yardRecords, wiRecords) {
  const loads = (wiRecords || []).filter(record => record.kind === "LOAD" && record.unit);
  const yardByUnit = new Map();
  (yardRecords || []).forEach(record => { if (!yardByUnit.has(record.unit)) yardByUnit.set(record.unit, record); });
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
    return { unit: load.unit, status, expectedVisit: expected, actualVisit: actual, lineOp: yard?.lineOp || load.lineOp, category: yard?.category || load.category, yardPosition, wiPosition, positionStatus, moveTime: load.moveTime, planner: load.planner, pow: load.pow, queue: load.queue, sequence: load.sequence, length: load.length, freightKind: load.freightKind };
  });
  const matched = rows.filter(row => row.status === "match").length;
  const found = rows.filter(row => row.status !== "not-yard").length;
  return {
    vessel: vesselIdentity(loads), totalLoads: loads.length, found, matched,
    wrong: rows.filter(row => row.status === "wrong").length,
    missing: rows.filter(row => row.status === "missing").length,
    notInYard: rows.filter(row => row.status === "not-yard").length,
    positionMismatch: rows.filter(row => row.positionStatus === "mismatch").length,
    matchRate: found ? matched / found : 0,
    coverageRate: loads.length ? found / loads.length : 0,
    rows,
  };
}

export function analyzeWiNvv(wiRecords, terminal = "MAMED") {
  const terminalCode = cleanText(terminal).toUpperCase();
  const discharges = (wiRecords || []).filter(record => record.kind === "DSCH" && record.unit);
  const rows = discharges.map(record => {
    const pod = cleanText(record.pod).toUpperCase();
    const outboundCarrier = cleanText(record.outboundCarrier).toUpperCase();
    const lineOp = cleanText(record.lineOp).toUpperCase();
    const categoryImport = isImportCategory(record.category);
    const categoryTransship = isTransshipCategory(record.category);
    let status, explanation;
    if (isEmpty(record)) {
      status = "excluded-empty"; explanation = "Empty/MTY discharge is excluded from the missing-NVV KPI.";
    } else if (isRestowCategory(record.category)) {
      status = "excluded-restow"; explanation = "Restow is excluded from import and transhipment NVV control.";
    } else if (!pod) {
      status = "missing-pod"; explanation = "POD is blank, so the WI cannot classify the discharge as import or transhipment.";
    } else if (lineOp === "HLC" && categoryTransship && isHlcIttOutbound(outboundCarrier)) {
      status = "valid-itt"; explanation = "Valid HLC ITT: Transship category with GEN/Truck outbound routing; local POD is allowed.";
    } else if (pod === terminalCode) {
      if (!categoryImport) { status = "category-mismatch"; explanation = `POD ${pod} is local to ${terminalCode}, so Category should be Import.`; }
      else if (!isImportTruckOutbound(outboundCarrier)) { status = "outbound-mismatch"; explanation = "Import discharge requires GEN_TRUCK as the outbound carrier."; }
      else { status = "valid-import"; explanation = `Valid import: POD ${terminalCode}, Import category and GEN_TRUCK outbound routing.`; }
    } else if (!categoryTransship) {
      status = "category-mismatch"; explanation = `POD ${pod} is not ${terminalCode}, so Category should be Transship.`;
    } else if (!outboundCarrier || isGenericOutbound(outboundCarrier)) {
      status = "missing-nvv"; explanation = "Normal transhipment discharge requires a specific next-vessel visit in Outbound Carrier.";
    } else {
      status = "valid-transship"; explanation = "Valid transhipment: non-local POD, Transship category and a specific next-vessel visit.";
    }
    return { unit: record.unit, status, lineOp, freightKind: record.freightKind, category: record.category, pod, outboundCarrier, planner: record.planner, pow: record.pow, moveTime: record.moveTime, queue: record.queue, sequence: record.sequence, explanation };
  });
  return summarizeNvvRows(rows, discharges.length);
}

export function summarizeNvvRows(rows, totalDischarges = rows?.length || 0) {
  const safeRows = rows || [];
  const validStatuses = new Set(["valid-import", "valid-transship", "valid-itt"]);
  const excludedStatuses = new Set(["excluded-empty", "excluded-restow"]);
  const valid = safeRows.filter(row => validStatuses.has(row.status)).length;
  const eligibleFcl = safeRows.filter(row => !excludedStatuses.has(row.status)).length;
  const categoryMismatch = safeRows.filter(row => row.status === "category-mismatch").length;
  const outboundMismatch = safeRows.filter(row => row.status === "outbound-mismatch").length;
  const missingPod = safeRows.filter(row => row.status === "missing-pod").length;
  const missingNvv = safeRows.filter(row => row.status === "missing-nvv").length;
  return {
    mode: "wi", totalDischarges, eligibleFcl,
    excludedEmpty: safeRows.filter(row => row.status === "excluded-empty").length,
    excludedRestow: safeRows.filter(row => row.status === "excluded-restow").length,
    valid,
    validImport: safeRows.filter(row => row.status === "valid-import").length,
    validTransship: safeRows.filter(row => row.status === "valid-transship").length,
    validItt: safeRows.filter(row => row.status === "valid-itt").length,
    missingNvv, categoryMismatch, outboundMismatch, missingPod,
    classificationIssues: categoryMismatch + outboundMismatch + missingPod,
    exceptionCount: missingNvv + categoryMismatch + outboundMismatch + missingPod,
    accuracyRate: eligibleFcl ? valid / eligibleFcl : 0,
    byLine: countBy(safeRows.filter(row => !validStatuses.has(row.status) && !excludedStatuses.has(row.status)), row => row.lineOp),
    rows: safeRows,
  };
}

function compareLoadOrder(a, b) {
  return parseMoveTime(a.moveTime) - parseMoveTime(b.moveTime)
    || cleanText(a.queue).localeCompare(cleanText(b.queue))
    || (a.sequence || 0) - (b.sequence || 0)
    || (a.index || 0) - (b.index || 0);
}

function hasSpecialPlanningConstraint(record) {
  if (/R/.test(cleanText(record.typeIso).toUpperCase())) return true;
  return /DG|HAZ|REEFER|OOG|OUT OF GAUGE|SPECIAL/.test([record.typeIso, record.specialStow, record.category, record.moveStage].map(cleanText).join(" ").toUpperCase());
}

function rehandleConfidence(target, blocker) {
  const targetTime = parseMoveTime(target.moveTime);
  const blockerTime = parseMoveTime(blocker.moveTime);
  const timedLater = targetTime < Number.MAX_SAFE_INTEGER && blockerTime < Number.MAX_SAFE_INTEGER && blockerTime > targetTime;
  const sequencedLater = Boolean(target.sequence && blocker.sequence && blocker.sequence > target.sequence);
  const samePod = Boolean(target.pod && blocker.pod && cleanText(target.pod).toUpperCase() === cleanText(blocker.pod).toUpperCase());
  const compatibleWeight = Number.isFinite(target.weight) && Number.isFinite(blocker.weight) && Math.abs(target.weight - blocker.weight) <= 6;
  const constrained = hasSpecialPlanningConstraint(target) || hasSpecialPlanningConstraint(blocker);
  return !constrained && (timedLater || sequencedLater) && (samePod || compatibleWeight) ? "probable" : "possible";
}

function normalizedPow(record) { return cleanText(record.pow).toUpperCase() || "UNASSIGNED"; }

function stackIndex(loads) {
  const stacks = new Map();
  loads.forEach(record => {
    const position = parsePosition(record.currentPosition);
    if (!position.usable) return;
    if (!stacks.has(position.stack)) stacks.set(position.stack, []);
    stacks.get(position.stack).push({ record, tier: position.tier, stack: position.stack });
  });
  stacks.forEach(items => items.sort((a, b) => a.tier - b.tier));
  return stacks;
}

export function calculateWiRehandles(wiRecords) {
  const loads = (wiRecords || []).filter(record => record.kind === "LOAD" && record.unit && !isRestowCategory(record.category));
  const stacks = stackIndex(loads);
  const groups = new Map();
  loads.forEach(record => {
    const pow = normalizedPow(record);
    if (!groups.has(pow)) groups.set(pow, []);
    groups.get(pow).push(record);
  });
  const rows = [];
  const crossPowRows = [];
  const seenPairs = new Set();
  const seenCross = new Set();
  for (const [pow, powLoads] of groups.entries()) {
    const ordered = [...powLoads].sort(compareLoadOrder);
    const orderIndex = new Map(ordered.map((record, index) => [record.unit, index]));
    ordered.forEach(target => {
      const targetPos = parsePosition(target.currentPosition);
      if (!targetPos.usable) return;
      const above = (stacks.get(targetPos.stack) || []).filter(item => item.tier > targetPos.tier);
      above.forEach(item => {
        const blocker = item.record;
        const blockerPow = normalizedPow(blocker);
        if (blockerPow === pow) {
          if ((orderIndex.get(blocker.unit) ?? -1) <= (orderIndex.get(target.unit) ?? -1)) return;
          const key = `${target.unit}:${blocker.unit}`;
          if (seenPairs.has(key)) return;
          seenPairs.add(key);
          rows.push({
            targetUnit: target.unit, blockerUnit: blocker.unit, stack: targetPos.stack,
            targetTier: targetPos.tier, blockerTier: item.tier, confidence: rehandleConfidence(target, blocker),
            source: "WI", blockerLine: blocker.lineOp, blockerCategory: blocker.category, blockerVisit: blocker.outboundCarrier,
            blockerMoveTime: blocker.moveTime, blockerPow, targetMoveTime: target.moveTime, targetPlanner: target.planner,
            targetPow: pow, targetQueue: target.queue,
            explanation: `${blocker.unit} is above ${target.unit} in stack ${targetPos.stack} and is planned later within the same POW ${pow}.`,
          });
        } else {
          const key = `${target.unit}:${blocker.unit}:${pow}:${blockerPow}`;
          if (seenCross.has(key)) return;
          seenCross.add(key);
          crossPowRows.push({
            targetUnit: target.unit, blockerUnit: blocker.unit, stack: targetPos.stack,
            targetTier: targetPos.tier, blockerTier: item.tier,
            targetPow: pow, blockerPow, targetMoveTime: target.moveTime, blockerMoveTime: blocker.moveTime,
            targetPlanner: target.planner, blockerPlanner: blocker.planner,
            explanation: `${target.unit} and ${blocker.unit} share stack ${targetPos.stack} but belong to different POWs (${pow} / ${blockerPow}); review as cross-POW stack demand, not a confirmed rehandle.`,
          });
        }
      });
    });
  }
  return {
    mode: "wi", count: rows.length,
    uniqueBlockers: new Set(rows.map(row => row.blockerUnit)).size,
    affectedTargets: new Set(rows.map(row => row.targetUnit)).size,
    probable: rows.filter(row => row.confidence === "probable").length,
    possible: rows.filter(row => row.confidence === "possible").length,
    positionedLoads: loads.filter(load => parsePosition(load.currentPosition).usable).length,
    crossPowCount: crossPowRows.length,
    crossPowRows,
    rows,
  };
}

export function calculateRehandles(yardRecords, wiRecords) { return calculateWiRehandles(wiRecords); }

function lengthBand(value) {
  const text = cleanText(value).replace(/[^0-9]/g, "");
  if (text === "20") return "20 ft";
  if (text === "40") return "40 ft";
  if (text === "45") return "45 ft";
  return "Other";
}

export function analyzePlannerMoves(vessels) {
  const vesselRows = (vessels || []).map((vessel, index) => {
    const moves = (vessel.wiRecords || []).filter(record => record.unit && ["LOAD", "DSCH"].includes(record.kind));
    const identity = vesselIdentity(moves, cleanText(vessel.fallbackName || vessel.fileName).replace(/\.[^.]+$/, "") || `Vessel ${index + 1}`);
    return {
      id: vessel.id || `vessel-${index + 1}`, fileName: vessel.fileName || "Work List", name: identity.name, visit: identity.visit,
      multipleVisits: identity.multipleVisits, shortSteaming: Boolean(vessel.shortSteaming), plannerOnly: Boolean(vessel.plannerOnly), totalMoves: moves.length,
      loads: moves.filter(record => record.kind === "LOAD").length, discharges: moves.filter(record => record.kind === "DSCH").length,
      plannerBreakdown: summarizePlannerMoves(moves), moves,
    };
  });
  const moves = vesselRows.flatMap(vessel => vessel.moves.map(record => ({ ...record, vesselId: vessel.id, vesselName: vessel.name, vesselVisit: vessel.visit, shortSteaming: vessel.shortSteaming })));
  const plannerMap = new Map();
  moves.forEach(record => {
    const planner = record.planner || "Unassigned";
    if (!plannerMap.has(planner)) plannerMap.set(planner, { planner, totalMoves: 0, loads: 0, discharges: 0, full: 0, empty: 0, size20: 0, size40: 0, size45: 0, otherSize: 0, vesselIds: new Set() });
    const row = plannerMap.get(planner);
    row.totalMoves += 1; row.loads += Number(record.kind === "LOAD"); row.discharges += Number(record.kind === "DSCH");
    row.empty += Number(isEmpty(record)); row.full += Number(!isEmpty(record));
    const size = lengthBand(record.length); if (size === "20 ft") row.size20 += 1; else if (size === "40 ft") row.size40 += 1; else if (size === "45 ft") row.size45 += 1; else row.otherSize += 1;
    row.vesselIds.add(record.vesselId);
  });
  const planners = [...plannerMap.values()].map(row => ({ ...row, vesselCount: row.vesselIds.size, vesselIds: undefined, share: moves.length ? row.totalMoves / moves.length : 0 })).sort((a, b) => b.totalMoves - a.totalMoves || a.planner.localeCompare(b.planner));
  return {
    totalMoves: moves.length, totalLoads: moves.filter(record => record.kind === "LOAD").length, totalDischarges: moves.filter(record => record.kind === "DSCH").length,
    plannerCount: planners.length, networkMoves: vesselRows.filter(v => !v.shortSteaming).reduce((sum, v) => sum + v.totalMoves, 0), shortSteamingMoves: vesselRows.filter(v => v.shortSteaming).reduce((sum, v) => sum + v.totalMoves, 0),
    planners, vesselRows: vesselRows.map(({ moves: ignored, ...vessel }) => vessel), moves,
    byMoveKind: countBy(moves, record => record.kind), byFreightKind: countBy(moves, record => record.freightKind), byLength: countBy(moves, record => lengthBand(record.length)),
  };
}

function summarizePlannerMoves(moves) {
  const plannerMap = new Map();
  (moves || []).forEach(record => {
    const planner = record.planner || "Unassigned";
    if (!plannerMap.has(planner)) plannerMap.set(planner, { planner, totalMoves: 0, loads: 0, discharges: 0, full: 0, empty: 0, size20: 0, size40: 0, size45: 0, otherSize: 0 });
    const row = plannerMap.get(planner);
    row.totalMoves += 1; row.loads += Number(record.kind === "LOAD"); row.discharges += Number(record.kind === "DSCH"); row.empty += Number(isEmpty(record)); row.full += Number(!isEmpty(record));
    const size = lengthBand(record.length); if (size === "20 ft") row.size20 += 1; else if (size === "40 ft") row.size40 += 1; else if (size === "45 ft") row.size45 += 1; else row.otherSize += 1;
  });
  return [...plannerMap.values()].map(row => ({ ...row, share: moves.length ? row.totalMoves / moves.length : 0 })).sort((a, b) => b.totalMoves - a.totalMoves || a.planner.localeCompare(b.planner));
}

function aggregateNvv(vessels) {
  const plannerOnlyVessels = vessels.filter(vessel => vessel.plannerOnly);
  const eligibleVessels = vessels.filter(vessel => !vessel.shortSteaming && !vessel.plannerOnly);
  const excludedVessels = vessels.filter(vessel => vessel.shortSteaming && !vessel.plannerOnly);
  const eligibleRows = eligibleVessels.flatMap(vessel => (vessel.nvv?.rows || []).map(row => ({ ...row, vesselId: vessel.id, vesselName: vessel.name, vesselVisit: vessel.visit, shortSteaming: false })));
  const allRows = vessels.flatMap(vessel => (vessel.nvv?.rows || []).map(row => ({ ...row, vesselId: vessel.id, vesselName: vessel.name, vesselVisit: vessel.visit, shortSteaming: vessel.shortSteaming })));
  const summary = summarizeNvvRows(eligibleRows, eligibleVessels.reduce((sum, vessel) => sum + (vessel.nvv?.totalDischarges || 0), 0));
  return {
    ...summary,
    rows: allRows,
    eligibleRows,
    eligibleVesselCount: eligibleVessels.length,
    excludedPlannerOnlyVessels: plannerOnlyVessels.length,
    excludedShortSteamingVessels: excludedVessels.length,
    excludedShortSteamingFcl: excludedVessels.reduce((sum, vessel) => sum + (vessel.nvv?.eligibleFcl || 0), 0),
  };
}

function aggregateRehandles(vessels) {
  const rows = vessels.flatMap(vessel => (vessel.rehandles?.rows || []).map(row => ({ ...row, vesselId: vessel.id, vesselName: vessel.name, vesselVisit: vessel.visit, shortSteaming: vessel.shortSteaming })));
  const crossPowRows = vessels.flatMap(vessel => (vessel.rehandles?.crossPowRows || []).map(row => ({ ...row, vesselId: vessel.id, vesselName: vessel.name, vesselVisit: vessel.visit, shortSteaming: vessel.shortSteaming })));
  return { mode: "wi", count: rows.length, uniqueBlockers: new Set(rows.map(row => `${row.vesselId}:${row.blockerUnit}`)).size, affectedTargets: new Set(rows.map(row => `${row.vesselId}:${row.targetUnit}`)).size, probable: rows.filter(r => r.confidence === "probable").length, possible: rows.filter(r => r.confidence === "possible").length, positionedLoads: vessels.reduce((sum, v) => sum + (v.rehandles?.positionedLoads || 0), 0), crossPowCount: crossPowRows.length, crossPowRows, rows };
}

export function buildPlanningAnalysis({ vessels, terminal, planningDate, sourceFiles }) {
  const inputVessels = (vessels || []).filter(vessel => Array.isArray(vessel.wiRecords));
  const planner = analyzePlannerMoves(inputVessels);
  const vesselResults = inputVessels.map((vessel, index) => {
    const plannerVessel = planner.vesselRows.find(item => item.id === (vessel.id || `vessel-${index + 1}`));
    return {
      ...plannerVessel,
      nvv: vessel.plannerOnly ? null : analyzeWiNvv(vessel.wiRecords, terminal),
      rehandles: vessel.plannerOnly ? null : calculateWiRehandles(vessel.wiRecords),
      wiRecords: vessel.wiRecords,
    };
  });
  return {
    version: 4, kind: "planning", id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(), terminal, planningDate, sourceFiles: sourceFiles || {}, vessels: vesselResults,
    planner, nvv: aggregateNvv(vesselResults), rehandles: aggregateRehandles(vesselResults),
  };
}

export function buildYardSnapshot({ yardRecords, terminal, planningDate, sourceFiles }) {
  const yard = analyzeYard(yardRecords || []);
  return {
    version: 4, kind: "yard", id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(), terminal, planningDate, sourceFiles: sourceFiles || {}, yard,
    quality: {
      snapshotAgeDays: daysBetween(yard.snapshotLatest, planningDate),
      fclWithoutOutboundVisit: yard.fclWithoutOutboundVisit,
      duplicateYardUnits: yard.duplicateCount,
      nonStackPositions: yard.nonStackPositions,
    },
  };
}

export function buildBatchAnalysis({ vessels, yardRecords, terminal, planningDate, sourceFiles }) {
  const planning = buildPlanningAnalysis({ vessels, terminal, planningDate, sourceFiles });
  const yardAvailable = Array.isArray(yardRecords) && yardRecords.length > 0;
  const yardSnapshot = yardAvailable ? buildYardSnapshot({ yardRecords, terminal, planningDate, sourceFiles }) : null;
  let yardConnection = null;
  if (yardAvailable) {
    const rows = planning.vessels.filter(vessel => !vessel.plannerOnly).flatMap(vessel => crossCheckNvv(yardRecords, vessel.wiRecords || []).rows.map(row => ({ ...row, vesselId: vessel.id, vesselName: vessel.name, vesselVisit: vessel.visit, shortSteaming: vessel.shortSteaming })));
    const found = rows.filter(r => r.status !== "not-yard").length;
    yardConnection = { rows, totalLoads: rows.length, found, matched: rows.filter(r => r.status === "match").length, wrong: rows.filter(r => r.status === "wrong").length, missing: rows.filter(r => r.status === "missing").length, notInYard: rows.filter(r => r.status === "not-yard").length, positionMismatch: rows.filter(r => r.positionStatus === "mismatch").length, matchRate: found ? rows.filter(r => r.status === "match").length / found : 0, coverageRate: rows.length ? found / rows.length : 0 };
  }
  return { ...planning, kind: "batch", yardAvailable, yard: yardSnapshot?.yard || null, yardQuality: yardSnapshot?.quality || null, yardConnection };
}

export function buildAnalysis({ yardRecords, wiRecords, terminal, planningDate, shortSteaming, sourceFiles }) {
  return buildBatchAnalysis({ vessels: [{ id: "vessel-1", fileName: sourceFiles?.wi || "Work List", wiRecords, shortSteaming }], yardRecords: yardRecords || [], terminal, planningDate, sourceFiles });
}

export function compactHistoryRecord(analysis) {
  const copy = JSON.parse(JSON.stringify(analysis));
  if (copy.kind === "planning" || copy.kind === "batch") {
    (copy.vessels || []).forEach(vessel => { delete vessel.wiRecords; });
  }
  if (copy.kind === "yard" && copy.yard?.rows?.length > 25000) copy.yard.rows = copy.yard.rows.slice(0, 25000);
  return copy;
}

export function restorePlannerMoves(analysis) {
  const savedMoves = analysis?.planner?.moves;
  if (Array.isArray(savedMoves) && (savedMoves.length || !analysis?.planner?.totalMoves)) return savedMoves;

  const vessels = Array.isArray(analysis?.vessels) && analysis.vessels.length
    ? analysis.vessels
    : (analysis?.planner?.vesselRows || []);

  return vessels.flatMap((vessel, vesselIndex) => {
    const breakdown = Array.isArray(vessel.plannerBreakdown) && vessel.plannerBreakdown.length
      ? vessel.plannerBreakdown
      : (vessels.length === 1 ? analysis?.planner?.planners || [] : []);

    return breakdown.flatMap(row => {
      const total = Math.max(0, Number(row.totalMoves) || 0);
      const loads = Math.max(0, Math.min(total, Number(row.loads) || 0));
      const discharges = Math.max(0, Math.min(total - loads, Number(row.discharges) || 0));
      const empty = Math.max(0, Math.min(total, Number(row.empty) || 0));
      const size20 = Math.max(0, Math.min(total, Number(row.size20) || 0));
      const size40 = Math.max(0, Math.min(total - size20, Number(row.size40) || 0));
      const size45 = Math.max(0, Math.min(total - size20 - size40, Number(row.size45) || 0));

      return Array.from({ length: total }, (_, moveIndex) => ({
        unit: `history-${vessel.id || vesselIndex + 1}-${row.planner || "unassigned"}-${moveIndex + 1}`,
        kind: moveIndex < loads ? "LOAD" : moveIndex < loads + discharges ? "DSCH" : "",
        planner: row.planner || "Unassigned",
        freightKind: moveIndex < empty ? "MTY" : "FCL",
        length: moveIndex < size20 ? "20" : moveIndex < size20 + size40 ? "40" : moveIndex < size20 + size40 + size45 ? "45" : "",
        vesselId: vessel.id || `vessel-${vesselIndex + 1}`,
        vesselName: vessel.name || "Unknown vessel",
        vesselVisit: vessel.visit || "Unknown visit",
        shortSteaming: Boolean(vessel.shortSteaming),
        restoredFromSummary: true,
      }));
    });
  });
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA); const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0)) / 86400000);
}
