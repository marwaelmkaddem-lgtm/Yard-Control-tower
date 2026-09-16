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
  typeIso: ["type iso", "iso", "iso type", "equipment type"],
  specialStow: ["special stow", "special handling", "handling instruction", "special instructions"],
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
    outboundVisits: countBy(records, record => record.outboundVisit),
    dwellBuckets: dwellOrder.map(label => ({ label, value: dwellCounts.get(label) || 0 })),
  };
}

export function vesselIdentity(records, fallbackName = "Unknown vessel") {
  const visits = countBy(records, record => record.outboundCarrier).filter(item => item.label !== "Unspecified");
  const names = countBy(records, record => record.outboundCarrierName).filter(item => item.label !== "Unspecified");
  return {
    visit: visits[0]?.label || "Unknown visit",
    name: names[0]?.label || fallbackName || "Unknown vessel",
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

function normalizedCategory(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z]/g, "");
}

function isImportCategory(value) {
  return normalizedCategory(value) === "IMPORT";
}

function isTransshipCategory(value) {
  return /TRANSSHIP/.test(normalizedCategory(value));
}

function isRestowCategory(value) {
  return /RESTOW/.test(normalizedCategory(value));
}

function isGenericOutbound(value) {
  const normalized = cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ["GEN", "GENCARRIER", "GENTRUCK", "TRUCK", "ROAD"].includes(normalized);
}

export function analyzeWiNvv(wiRecords, terminal = "MAMED") {
  const terminalCode = cleanText(terminal).toUpperCase();
  const discharges = (wiRecords || []).filter(record => record.kind === "DSCH" && record.unit);
  const rows = discharges.map(record => {
    const pod = cleanText(record.pod).toUpperCase();
    const outboundCarrier = cleanText(record.outboundCarrier).toUpperCase();
    const lineOp = cleanText(record.lineOp).toUpperCase();
    const genericOutbound = isGenericOutbound(outboundCarrier);
    const categoryImport = isImportCategory(record.category);
    const categoryTransship = isTransshipCategory(record.category);
    let status;
    let explanation;

    if (isEmpty(record)) {
      status = "excluded-empty";
      explanation = "Empty/MTY discharge is excluded from the missing-NVV KPI.";
    } else if (isRestowCategory(record.category)) {
      status = "excluded-restow";
      explanation = "Restow is excluded from import and transhipment NVV control.";
    } else if (!pod) {
      status = "missing-pod";
      explanation = "POD is blank, so the WI cannot classify the discharge as import or transhipment.";
    } else if (lineOp === "HLC" && categoryTransship && genericOutbound) {
      status = "valid-itt";
      explanation = "Valid HLC ITT: Transship category with GEN/Truck outbound routing.";
    } else if (pod === terminalCode) {
      if (!categoryImport) {
        status = "category-mismatch";
        explanation = `POD ${pod} is local to ${terminalCode}, so Category should be Import.`;
      } else if (!genericOutbound) {
        status = "outbound-mismatch";
        explanation = "Import discharge should use GEN/Truck as the outbound carrier.";
      } else {
        status = "valid-import";
        explanation = `Valid import: POD ${terminalCode}, Import category and GEN/Truck outbound routing.`;
      }
    } else if (!categoryTransship) {
      status = "category-mismatch";
      explanation = `POD ${pod} is not ${terminalCode}, so Category should be Transship.`;
    } else if (!outboundCarrier || genericOutbound) {
      status = "missing-nvv";
      explanation = "Transhipment discharge needs a specific next-vessel visit in Outbound Carrier.";
    } else {
      status = "valid-transship";
      explanation = "Valid transhipment: non-local POD, Transship category and a specific next-vessel visit.";
    }

    return {
      unit: record.unit,
      status,
      lineOp,
      freightKind: record.freightKind,
      category: record.category,
      pod,
      outboundCarrier,
      planner: record.planner,
      pow: record.pow,
      moveTime: record.moveTime,
      queue: record.queue,
      sequence: record.sequence,
      explanation,
    };
  });

  const validStatuses = new Set(["valid-import", "valid-transship", "valid-itt"]);
  const excludedStatuses = new Set(["excluded-empty", "excluded-restow"]);
  const valid = rows.filter(row => validStatuses.has(row.status)).length;
  const eligibleFcl = rows.filter(row => !excludedStatuses.has(row.status)).length;
  const categoryMismatch = rows.filter(row => row.status === "category-mismatch").length;
  const outboundMismatch = rows.filter(row => row.status === "outbound-mismatch").length;
  const missingPod = rows.filter(row => row.status === "missing-pod").length;
  const missingNvv = rows.filter(row => row.status === "missing-nvv").length;

  return {
    mode: "wi",
    totalDischarges: discharges.length,
    eligibleFcl,
    excludedEmpty: rows.filter(row => row.status === "excluded-empty").length,
    excludedRestow: rows.filter(row => row.status === "excluded-restow").length,
    valid,
    validImport: rows.filter(row => row.status === "valid-import").length,
    validTransship: rows.filter(row => row.status === "valid-transship").length,
    validItt: rows.filter(row => row.status === "valid-itt").length,
    missingNvv,
    categoryMismatch,
    outboundMismatch,
    missingPod,
    classificationIssues: categoryMismatch + outboundMismatch + missingPod,
    exceptionCount: missingNvv + categoryMismatch + outboundMismatch + missingPod,
    accuracyRate: eligibleFcl ? valid / eligibleFcl : 0,
    byLine: countBy(rows.filter(row => !validStatuses.has(row.status) && !excludedStatuses.has(row.status)), row => row.lineOp),
    rows,
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
  const text = [record.typeIso, record.specialStow, record.category, record.moveStage]
    .map(cleanText)
    .join(" ")
    .toUpperCase();
  return /DG|HAZ|REEFER|OOG|OUT OF GAUGE|SPECIAL/.test(text);
}

function rehandleConfidence(target, blocker) {
  const targetTime = parseMoveTime(target.moveTime);
  const blockerTime = parseMoveTime(blocker.moveTime);
  const timedLater = targetTime < Number.MAX_SAFE_INTEGER && blockerTime < Number.MAX_SAFE_INTEGER && blockerTime > targetTime;
  const sequencedLater = Boolean(target.sequence && blocker.sequence && blocker.sequence > target.sequence);
  const samePow = Boolean(target.pow && blocker.pow && cleanText(target.pow).toUpperCase() === cleanText(blocker.pow).toUpperCase());
  const samePod = Boolean(target.pod && blocker.pod && cleanText(target.pod).toUpperCase() === cleanText(blocker.pod).toUpperCase());
  const compatibleWeight = Number.isFinite(target.weight) && Number.isFinite(blocker.weight) && Math.abs(target.weight - blocker.weight) <= 6;
  const constrained = hasSpecialPlanningConstraint(target) || hasSpecialPlanningConstraint(blocker);
  return !constrained && (timedLater || sequencedLater) && (samePow || samePod || compatibleWeight) ? "probable" : "possible";
}

export function calculateWiRehandles(wiRecords) {
  const loads = (wiRecords || []).filter(record => record.kind === "LOAD" && record.unit && !isRestowCategory(record.category));
  const loadByUnit = new Map(loads.map(load => [load.unit, load]));
  const stacks = new Map();
  const activeLocations = new Map();

  loads.forEach(record => {
    const position = parsePosition(record.currentPosition);
    if (!position.usable || activeLocations.has(record.unit)) return;
    if (!stacks.has(position.stack)) stacks.set(position.stack, new Map());
    const tiers = stacks.get(position.stack);
    if (!tiers.has(position.tier)) tiers.set(position.tier, []);
    tiers.get(position.tier).push(record.unit);
    activeLocations.set(record.unit, { stack: position.stack, tier: position.tier });
  });

  const positionedLoads = activeLocations.size;
  const orderedLoads = [...loads].sort(compareLoadOrder);
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
      if (!blockerLoad || compareLoadOrder(blockerLoad, targetLoad) <= 0) return;
      const confidence = rehandleConfidence(targetLoad, blockerLoad);
      rows.push({
        targetUnit: targetLoad.unit,
        blockerUnit: blocker.unit,
        stack: location.stack,
        targetTier: location.tier,
        blockerTier: blocker.tier,
        blockerStatus: "later-wi",
        confidence,
        source: "WI",
        blockerLine: blockerLoad.lineOp,
        blockerCategory: blockerLoad.category,
        blockerVisit: blockerLoad.outboundCarrier,
        blockerMoveTime: blockerLoad.moveTime,
        blockerPow: blockerLoad.pow,
        targetMoveTime: targetLoad.moveTime,
        targetPlanner: targetLoad.planner,
        targetPow: targetLoad.pow,
        targetQueue: targetLoad.queue,
        explanation: `${blocker.unit} is at tier ${blocker.tier}, above ${targetLoad.unit} at tier ${location.tier}, and is planned later in the WI.`,
      });
      affectedTargets.add(targetLoad.unit);
      removeUnitFromStack(blocker.unit, activeLocations, stacks);
    });
    removeUnitFromStack(targetLoad.unit, activeLocations, stacks);
  });

  return {
    mode: "wi",
    count: rows.length,
    uniqueBlockers: new Set(rows.map(row => row.blockerUnit)).size,
    affectedTargets: affectedTargets.size,
    plannedLater: rows.length,
    external: 0,
    probable: rows.filter(row => row.confidence === "probable").length,
    possible: rows.filter(row => row.confidence === "possible").length,
    positionedLoads,
    rows,
  };
}

export function calculateRehandles(yardRecords, wiRecords) {
  return calculateWiRehandles(wiRecords);
}

function lengthBand(value) {
  const text = cleanText(value).replace(/[^0-9]/g, "");
  if (text === "20") return "20 ft";
  if (text === "40") return "40 ft";
  if (text === "45") return "45 ft";
  return "Other";
}

function mergeCounts(collections) {
  const merged = new Map();
  collections.flat().forEach(item => merged.set(item.label, (merged.get(item.label) || 0) + item.value));
  return [...merged.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function analyzePlannerMoves(vessels) {
  const vesselRows = (vessels || []).map((vessel, index) => {
    const moves = (vessel.wiRecords || []).filter(record => record.unit && ["LOAD", "DSCH"].includes(record.kind));
    const identity = vesselIdentity(
      moves,
      cleanText(vessel.fallbackName || vessel.fileName).replace(/\.[^.]+$/, "") || `Vessel ${index + 1}`,
    );
    return {
      id: vessel.id || `vessel-${index + 1}`,
      fileName: vessel.fileName || "Work List",
      name: identity.name,
      visit: identity.visit,
      multipleVisits: identity.multipleVisits,
      shortSteaming: Boolean(vessel.shortSteaming),
      totalMoves: moves.length,
      loads: moves.filter(record => record.kind === "LOAD").length,
      discharges: moves.filter(record => record.kind === "DSCH").length,
      planners: countBy(moves, record => record.planner || "Unassigned"),
      plannerBreakdown: summarizePlannerMoves(moves),
      moves,
    };
  });

  const moves = vesselRows.flatMap(vessel => vessel.moves.map(record => ({ ...record, vesselId: vessel.id })));
  const plannerMap = new Map();
  moves.forEach(record => {
    const planner = record.planner || "Unassigned";
    if (!plannerMap.has(planner)) {
      plannerMap.set(planner, {
        planner,
        totalMoves: 0,
        loads: 0,
        discharges: 0,
        full: 0,
        empty: 0,
        size20: 0,
        size40: 0,
        size45: 0,
        otherSize: 0,
        vesselIds: new Set(),
      });
    }
    const row = plannerMap.get(planner);
    row.totalMoves += 1;
    row.loads += Number(record.kind === "LOAD");
    row.discharges += Number(record.kind === "DSCH");
    row.empty += Number(isEmpty(record));
    row.full += Number(!isEmpty(record));
    const size = lengthBand(record.length);
    if (size === "20 ft") row.size20 += 1;
    else if (size === "40 ft") row.size40 += 1;
    else if (size === "45 ft") row.size45 += 1;
    else row.otherSize += 1;
    row.vesselIds.add(record.vesselId);
  });

  const planners = [...plannerMap.values()]
    .map(row => ({
      ...row,
      vesselCount: row.vesselIds.size,
      vesselIds: undefined,
      share: moves.length ? row.totalMoves / moves.length : 0,
    }))
    .sort((a, b) => b.totalMoves - a.totalMoves || a.planner.localeCompare(b.planner));

  return {
    totalMoves: moves.length,
    totalLoads: moves.filter(record => record.kind === "LOAD").length,
    totalDischarges: moves.filter(record => record.kind === "DSCH").length,
    plannerCount: planners.length,
    networkMoves: vesselRows.filter(vessel => !vessel.shortSteaming).reduce((sum, vessel) => sum + vessel.totalMoves, 0),
    shortSteamingMoves: vesselRows.filter(vessel => vessel.shortSteaming).reduce((sum, vessel) => sum + vessel.totalMoves, 0),
    planners,
    vesselRows: vesselRows.map(({ moves: ignored, ...vessel }) => vessel),
    byMoveKind: countBy(moves, record => record.kind),
    byFreightKind: countBy(moves, record => record.freightKind),
    byLength: countBy(moves, record => lengthBand(record.length)),
  };
}

function summarizePlannerMoves(moves) {
  const plannerMap = new Map();
  (moves || []).forEach(record => {
    const planner = record.planner || "Unassigned";
    if (!plannerMap.has(planner)) {
      plannerMap.set(planner, {
        planner,
        totalMoves: 0,
        loads: 0,
        discharges: 0,
        full: 0,
        empty: 0,
        size20: 0,
        size40: 0,
        size45: 0,
        otherSize: 0,
      });
    }
    const row = plannerMap.get(planner);
    row.totalMoves += 1;
    row.loads += Number(record.kind === "LOAD");
    row.discharges += Number(record.kind === "DSCH");
    row.empty += Number(isEmpty(record));
    row.full += Number(!isEmpty(record));
    const size = lengthBand(record.length);
    if (size === "20 ft") row.size20 += 1;
    else if (size === "40 ft") row.size40 += 1;
    else if (size === "45 ft") row.size45 += 1;
    else row.otherSize += 1;
  });
  return [...plannerMap.values()]
    .map(row => ({ ...row, share: moves.length ? row.totalMoves / moves.length : 0 }))
    .sort((a, b) => b.totalMoves - a.totalMoves || a.planner.localeCompare(b.planner));
}

function aggregateNvv(vessels) {
  const summaries = vessels.map(vessel => vessel.nvv).filter(Boolean);
  const rows = vessels.flatMap(vessel => (vessel.nvv?.rows || []).map(row => ({
    ...row,
    vesselId: vessel.id,
    vesselName: vessel.name,
    vesselVisit: vessel.visit,
    shortSteaming: vessel.shortSteaming,
  })));
  const eligibleFcl = summaries.reduce((sum, item) => sum + item.eligibleFcl, 0);
  const valid = summaries.reduce((sum, item) => sum + item.valid, 0);
  return {
    mode: "wi",
    totalDischarges: summaries.reduce((sum, item) => sum + item.totalDischarges, 0),
    eligibleFcl,
    excludedEmpty: summaries.reduce((sum, item) => sum + item.excludedEmpty, 0),
    excludedRestow: summaries.reduce((sum, item) => sum + item.excludedRestow, 0),
    valid,
    validImport: summaries.reduce((sum, item) => sum + item.validImport, 0),
    validTransship: summaries.reduce((sum, item) => sum + item.validTransship, 0),
    validItt: summaries.reduce((sum, item) => sum + item.validItt, 0),
    missingNvv: summaries.reduce((sum, item) => sum + item.missingNvv, 0),
    categoryMismatch: summaries.reduce((sum, item) => sum + item.categoryMismatch, 0),
    outboundMismatch: summaries.reduce((sum, item) => sum + item.outboundMismatch, 0),
    missingPod: summaries.reduce((sum, item) => sum + item.missingPod, 0),
    classificationIssues: summaries.reduce((sum, item) => sum + item.classificationIssues, 0),
    exceptionCount: summaries.reduce((sum, item) => sum + item.exceptionCount, 0),
    accuracyRate: eligibleFcl ? valid / eligibleFcl : 0,
    byLine: mergeCounts(summaries.map(item => item.byLine)),
    rows,
  };
}

function aggregateYardConnections(vessels) {
  const summaries = vessels.map(vessel => vessel.yardConnection).filter(Boolean);
  const rows = vessels.flatMap(vessel => (vessel.yardConnection?.rows || []).map(row => ({
    ...row,
    vesselId: vessel.id,
    vesselName: vessel.name,
    vesselVisit: vessel.visit,
    shortSteaming: vessel.shortSteaming,
  })));
  const totalLoads = summaries.reduce((sum, item) => sum + item.totalLoads, 0);
  const found = summaries.reduce((sum, item) => sum + item.found, 0);
  const matched = summaries.reduce((sum, item) => sum + item.matched, 0);
  return {
    totalMoves: summaries.reduce((sum, item) => sum + item.totalMoves, 0),
    totalLoads,
    totalDischarges: summaries.reduce((sum, item) => sum + item.totalDischarges, 0),
    found,
    matched,
    wrong: summaries.reduce((sum, item) => sum + item.wrong, 0),
    missing: summaries.reduce((sum, item) => sum + item.missing, 0),
    notInYard: summaries.reduce((sum, item) => sum + item.notInYard, 0),
    positionMismatch: summaries.reduce((sum, item) => sum + item.positionMismatch, 0),
    matchRate: found ? matched / found : 0,
    coverageRate: totalLoads ? found / totalLoads : 0,
    rows,
  };
}

function aggregateRehandles(vessels) {
  const summaries = vessels.map(vessel => vessel.rehandles).filter(Boolean);
  const rows = vessels.flatMap(vessel => (vessel.rehandles?.rows || []).map(row => ({
    ...row,
    vesselId: vessel.id,
    vesselName: vessel.name,
    vesselVisit: vessel.visit,
    shortSteaming: vessel.shortSteaming,
  })));
  return {
    mode: "wi",
    count: summaries.reduce((sum, item) => sum + item.count, 0),
    uniqueBlockers: new Set(rows.map(row => `${row.vesselId}:${row.blockerUnit}`)).size,
    affectedTargets: new Set(rows.map(row => `${row.vesselId}:${row.targetUnit}`)).size,
    plannedLater: summaries.reduce((sum, item) => sum + item.plannedLater, 0),
    external: summaries.reduce((sum, item) => sum + item.external, 0),
    probable: summaries.reduce((sum, item) => sum + item.probable, 0),
    possible: summaries.reduce((sum, item) => sum + item.possible, 0),
    positionedLoads: summaries.reduce((sum, item) => sum + item.positionedLoads, 0),
    rows,
  };
}

export function buildBatchAnalysis({ vessels, yardRecords, terminal, planningDate, sourceFiles }) {
  const inputVessels = (vessels || []).filter(vessel => Array.isArray(vessel.wiRecords));
  const yardAvailable = Array.isArray(yardRecords) && yardRecords.length > 0;
  const planner = analyzePlannerMoves(inputVessels);
  const vesselResults = inputVessels.map((vessel, index) => {
    const plannerVessel = planner.vesselRows.find(item => item.id === (vessel.id || `vessel-${index + 1}`));
    const nvv = analyzeWiNvv(vessel.wiRecords, terminal);
    const rehandles = calculateWiRehandles(vessel.wiRecords);
    const yardConnection = yardAvailable ? crossCheckNvv(yardRecords, vessel.wiRecords) : null;
    return {
      ...plannerVessel,
      nvv,
      rehandles,
      yardConnection,
    };
  });
  const yard = yardAvailable ? analyzeYard(yardRecords) : null;
  const nvv = aggregateNvv(vesselResults);
  const rehandles = aggregateRehandles(vesselResults);
  const yardConnection = yardAvailable ? aggregateYardConnections(vesselResults) : null;
  const snapshotAgeDays = yardAvailable ? daysBetween(yard.snapshotLatest, planningDate) : null;

  return {
    version: 3,
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    terminal,
    planningDate,
    yardAvailable,
    sourceFiles: sourceFiles || {},
    vessels: vesselResults,
    planner,
    yard,
    nvv,
    rehandles,
    yardConnection,
    quality: yardAvailable ? {
      snapshotAgeDays,
      missingFromYard: yardConnection.notInYard,
      wrongOrMissingYardNvv: yardConnection.wrong + yardConnection.missing,
      wrongOrMissingNvv: yardConnection.wrong + yardConnection.missing,
      positionMismatch: yardConnection.positionMismatch,
      missingNvvFcl: yard.missingNvvFcl,
      duplicateYardUnits: yard.duplicateCount,
      nonStackPositions: yard.nonStackPositions,
    } : null,
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
  const analysis = buildBatchAnalysis({
    vessels: [{ id: "vessel-1", fileName: sourceFiles?.wi || "Work List", wiRecords, shortSteaming }],
    yardRecords: yardRecords || [],
    terminal,
    planningDate,
    sourceFiles,
  });
  return { ...analysis, shortSteaming: Boolean(shortSteaming) };
}

export function compactHistoryRecord(analysis) {
  return JSON.parse(JSON.stringify(analysis));
}
