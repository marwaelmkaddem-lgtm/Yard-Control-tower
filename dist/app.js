import {
  buildAnalysis,
  cleanText,
  compactHistoryRecord,
  normalizeHeader,
  normalizeWiRows,
  normalizeYardRows,
  parseDelimitedText,
} from "./engine.js";

const TERMINALS = ["MAMED", "MAPTM", "OMSLL", "SCCT", "HRRJK", "NGAPP", "BHKBS", "LRMLW", "DKAAR", "ITVAD", "JOAQJ", "NGONN", "SEGOT"];
const PAGE_SIZE = 50;
const state = {
  yardFile: null,
  wiFile: null,
  analysis: null,
  nvvPage: 1,
  rehandlePage: 1,
};

const elements = Object.fromEntries([
  "themeToggle", "terminalSelect", "planningDate", "yardFile", "wiFile", "yardDrop", "wiDrop",
  "yardFileName", "wiFileName", "yardState", "wiState", "sourceStatus", "runButton", "resetButton",
  "emptyState", "results", "resultVessel", "resultTerminal", "resultSS", "resultMeta", "noticeStack",
  "kpiGrid", "nvvScore", "nvvDistribution", "dwellChart", "blockChart", "categoryChart", "lineChart",
  "loadTypeChart", "loadSizeChart", "focusGrid", "nvvTabCount",
  "rehandleTabCount", "nvvSearch", "nvvFilter", "nvvTableBody", "nvvPagination", "rehandleSearch",
  "rehandleFilter", "rehandleTableBody", "rehandlePagination", "qualityGrid", "historyTableBody",
  "historyEmpty", "clearHistoryButton", "exportNvvButton", "exportRehandleButton", "printButton", "toast",
].map(id => [id, document.getElementById(id)]));

initialize();

function initialize() {
  elements.planningDate.value = new Date().toISOString().slice(0, 10);
  const savedTerminal = localStorage.getItem("yard-control-terminal");
  if (TERMINALS.includes(savedTerminal)) elements.terminalSelect.value = savedTerminal;
  const savedTheme = localStorage.getItem("yard-control-theme");
  const systemDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemDark ? "dark" : "light"));
  bindEvents();
  registerWebMcp();
  renderHistory();
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const reportError = error => console.warn("WebMCP registration failed", error);
  const tools = [
    {
      name: "read_current_yard_analysis",
      title: "Read current Yard Control analysis",
      description: "Return the visible vessel, NVV, rehandle, and data-quality summary after the user has run or loaded an analysis.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        if (!state.analysis) throw new Error("No Yard Control analysis is currently open.");
        const { terminal, planningDate, shortSteaming, nvv, rehandles, quality } = state.analysis;
        return {
          terminal,
          planningDate,
          shortSteaming,
          vessel: nvv.vessel,
          plannedLoads: nvv.totalLoads,
          foundInYard: nvv.found,
          matchedNvv: nvv.matched,
          wrongNvv: nvv.wrong,
          missingNvv: nvv.missing,
          notInYard: nvv.notInYard,
          potentialRehandles: rehandles.count,
          affectedTargets: rehandles.affectedTargets,
          quality,
        };
      },
    },
    {
      name: "open_yard_control_view",
      title: "Open a Yard Control view",
      description: "Navigate the visible Yard Control workspace to Overview, NVV Control, Rehandles, Data Quality, History, or Rules.",
      inputSchema: {
        type: "object",
        properties: { view: { type: "string", enum: ["overview", "nvv", "rehandles", "quality", "history", "rules"] } },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const view = input?.view;
        if (!["overview", "nvv", "rehandles", "quality", "history", "rules"].includes(view)) throw new Error("Unsupported Yard Control view.");
        if (view !== "history" && view !== "rules" && !state.analysis) throw new Error("Run or load an analysis before opening this view.");
        activateTab(view);
        return { openedView: view };
      },
    },
  ];
  tools.forEach(tool => {
    try { void Promise.resolve(context.registerTool(tool)).catch(reportError); }
    catch (error) { reportError(error); }
  });
}

function bindEvents() {
  elements.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("yard-control-theme", next);
  });
  elements.terminalSelect.addEventListener("change", () => localStorage.setItem("yard-control-terminal", elements.terminalSelect.value));
  elements.yardFile.addEventListener("change", event => setSourceFile("yard", event.target.files?.[0]));
  elements.wiFile.addEventListener("change", event => setSourceFile("wi", event.target.files?.[0]));
  configureDropZone(elements.yardDrop, "yard");
  configureDropZone(elements.wiDrop, "wi");
  elements.runButton.addEventListener("click", runAnalysis);
  elements.resetButton.addEventListener("click", resetCurrent);
  elements.printButton.addEventListener("click", () => window.print());
  elements.exportNvvButton.addEventListener("click", exportNvv);
  elements.exportRehandleButton.addEventListener("click", exportRehandles);
  elements.nvvSearch.addEventListener("input", () => { state.nvvPage = 1; renderNvvTable(); });
  elements.nvvFilter.addEventListener("change", () => { state.nvvPage = 1; renderNvvTable(); });
  elements.rehandleSearch.addEventListener("input", () => { state.rehandlePage = 1; renderRehandleTable(); });
  elements.rehandleFilter.addEventListener("change", () => { state.rehandlePage = 1; renderRehandleTable(); });
  elements.clearHistoryButton.addEventListener("click", clearHistory);
  elements.historyTableBody.addEventListener("click", handleHistoryAction);
  document.querySelectorAll(".tab-button").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.themeToggle?.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function configureDropZone(zone, type) {
  ["dragenter", "dragover"].forEach(eventName => zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(eventName => zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.remove("dragover");
  }));
  zone.addEventListener("drop", event => setSourceFile(type, event.dataTransfer?.files?.[0]));
}

function setSourceFile(type, file) {
  if (!file) return;
  const isYard = type === "yard";
  state[isYard ? "yardFile" : "wiFile"] = file;
  const zone = isYard ? elements.yardDrop : elements.wiDrop;
  const name = isYard ? elements.yardFileName : elements.wiFileName;
  const label = isYard ? elements.yardState : elements.wiState;
  zone.classList.add("ready");
  name.textContent = file.name;
  label.textContent = formatBytes(file.size);
  updateRunState();
}

function updateRunState() {
  const ready = Boolean(state.yardFile && state.wiFile);
  elements.runButton.disabled = !ready;
  if (ready) elements.sourceStatus.textContent = "Sources ready. Run the cross-check when the planning date and vessel type are correct.";
  else if (state.yardFile || state.wiFile) elements.sourceStatus.textContent = `Add the ${state.yardFile ? "Vessel Work List" : "yard inventory"} to continue.`;
  else elements.sourceStatus.textContent = "Select both source files to begin.";
}

async function runAnalysis() {
  if (!state.yardFile || !state.wiFile) return;
  setLoading(true);
  elements.sourceStatus.textContent = "Reading the yard population and planned vessel sequence…";
  try {
    await nextFrame();
    const [yardRaw, wiText] = await Promise.all([readYardFile(state.yardFile), state.wiFile.text()]);
    const yardRecords = normalizeYardRows(yardRaw.rows);
    const wiRaw = parseDelimitedText(wiText, wiText.includes("\t") ? "\t" : ",");
    const wiRecords = normalizeWiRows(wiRaw);
    if (!yardRecords.length) throw new Error("No yard containers were found. Check that the selected sheet contains Unit Nbr and Position columns.");
    if (!wiRecords.some(record => record.kind === "LOAD")) throw new Error("No LOAD rows were found in the Vessel Work List.");

    const analysis = buildAnalysis({
      yardRecords,
      wiRecords,
      terminal: elements.terminalSelect.value,
      planningDate: elements.planningDate.value,
      shortSteaming: document.querySelector('input[name="shortSteaming"]:checked')?.value === "yes",
      sourceFiles: { yard: state.yardFile.name, wi: state.wiFile.name, yardSheet: yardRaw.sheetName },
    });
    state.analysis = analysis;
    state.nvvPage = 1;
    state.rehandlePage = 1;
    renderAnalysis(analysis);
    try {
      await saveHistory(compactHistoryRecord(analysis));
      await renderHistory();
      showToast("Analysis completed and saved in local history.");
    } catch (historyError) {
      console.warn(historyError);
      showToast("Analysis completed. Local history could not be saved on this device.");
    }
    elements.sourceStatus.textContent = `${formatNumber(analysis.yard.total)} yard units and ${formatNumber(analysis.nvv.totalLoads)} planned loads processed.`;
  } catch (error) {
    console.error(error);
    elements.sourceStatus.textContent = error.message || "The files could not be analyzed.";
    showToast(error.message || "The files could not be analyzed.");
  } finally {
    setLoading(false);
  }
}

async function readYardFile(file) {
  if (!globalThis.XLSX) throw new Error("The Excel reader did not load. Check the connection and refresh the page.");
  const buffer = await file.arrayBuffer();
  const workbook = globalThis.XLSX.read(buffer, { type: "array", cellDates: false });
  let best = null;
  const orderedSheets = [...workbook.SheetNames].sort((a, b) => Number(normalizeHeader(b) === "source data") - Number(normalizeHeader(a) === "source data"));
  for (const sheetName of orderedSheets) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = globalThis.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const headerIndex = findYardHeader(matrix);
    if (headerIndex < 0) continue;
    const score = scoreYardHeader(matrix[headerIndex]) + (normalizeHeader(sheetName) === "source data" ? 10 : 0);
    if (!best || score > best.score) best = { sheetName, matrix, headerIndex, score };
    if (score >= 15) break;
  }
  if (!best) throw new Error("No yard inventory sheet was recognized. Required columns include Unit Nbr, O/B Actual Visit and Position.");
  const headers = best.matrix[best.headerIndex].map(cleanText);
  const rows = best.matrix.slice(best.headerIndex + 1)
    .filter(row => row.some(value => cleanText(value)))
    .map(row => Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? ""])));
  return { rows, sheetName: best.sheetName };
}

function findYardHeader(matrix) {
  const max = Math.min(matrix.length, 30);
  for (let index = 0; index < max; index += 1) {
    if (scoreYardHeader(matrix[index]) >= 3) return index;
  }
  return -1;
}

function scoreYardHeader(row = []) {
  const headers = row.map(normalizeHeader);
  const groups = [
    ["unit nbr", "unit no", "container no", "container no."],
    ["o b actual visit", "ob actual visit", "outbound visit", "nvv"],
    ["position", "yard position", "current position"],
    ["frght kind", "freight kind", "sts"],
    ["category", "cat"],
  ];
  return groups.reduce((score, aliases) => score + (aliases.some(alias => headers.includes(normalizeHeader(alias))) ? 1 : 0), 0);
}

function setLoading(loading) {
  elements.runButton.classList.toggle("loading", loading);
  elements.runButton.disabled = loading || !(state.yardFile && state.wiFile);
  elements.runButton.querySelector(".button-label").textContent = loading ? "Analyzing…" : "Run Yard Control";
}

function renderAnalysis(analysis) {
  elements.emptyState.hidden = true;
  elements.results.hidden = false;
  const vesselName = analysis.nvv.vessel.name === "Unspecified" ? "Vessel analysis" : analysis.nvv.vessel.name;
  elements.resultVessel.textContent = `${vesselName} · ${analysis.nvv.vessel.visit}`;
  elements.resultTerminal.textContent = analysis.terminal;
  elements.resultSS.textContent = analysis.shortSteaming ? "Short steaming" : "Network vessel";
  elements.resultMeta.textContent = `Planning date ${formatDate(analysis.planningDate)} · Yard sheet ${analysis.sourceFiles.yardSheet || "detected automatically"} · Run ${formatDateTime(analysis.createdAt)}`;
  elements.nvvTabCount.textContent = formatNumber(analysis.nvv.wrong + analysis.nvv.missing + analysis.nvv.notInYard);
  elements.rehandleTabCount.textContent = formatNumber(analysis.rehandles.count);
  renderNotices(analysis);
  renderKpis(analysis);
  renderNvvDistribution(analysis);
  renderBarList(elements.dwellChart, analysis.yard.dwellBuckets.filter(item => item.value > 0));
  renderBarList(elements.blockChart, analysis.yard.blocks.slice(0, 8));
  renderBarList(elements.categoryChart, analysis.yard.categories);
  renderBarList(elements.lineChart, analysis.yard.lines);
  renderBarList(elements.loadTypeChart, analysis.nvv.loadByFreightKind);
  renderBarList(elements.loadSizeChart, analysis.nvv.loadByLength);
  renderFocus(analysis);
  renderNvvTable();
  renderRehandleTable();
  renderQuality(analysis);
  activateTab("overview");
  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderNotices(analysis) {
  const notices = [];
  if (analysis.quality.snapshotAgeDays !== null && Math.abs(analysis.quality.snapshotAgeDays) > 1) {
    const age = analysis.quality.snapshotAgeDays;
    notices.push({ type: Math.abs(age) >= 3 ? "danger" : "warning", html: `<strong>Snapshot timing:</strong> The latest yard movement is ${Math.abs(age)} day${Math.abs(age) === 1 ? "" : "s"} ${age >= 0 ? "before" : "after"} the selected planning date. NVV and rehandle exceptions may reflect later yard changes.` });
  }
  if (analysis.shortSteaming) notices.push({ type: "info", html: "<strong>Short steaming:</strong> This run is marked manually as SS and remains separate from network-vessel history totals." });
  if (!analysis.nvv.found) notices.push({ type: "danger", html: "<strong>No common containers:</strong> None of the planned load units were found in the yard snapshot. Check the vessel cycle and snapshot date." });
  else notices.push({ type: "info", html: "<strong>Planning indicator:</strong> Rehandles use the uploaded snapshot and WI sequence. Validate the final list against the live yard before operations." });
  elements.noticeStack.innerHTML = notices.map(notice => `<div class="notice ${notice.type}">${notice.html}</div>`).join("");
}

function renderKpis(analysis) {
  const exceptions = analysis.nvv.wrong + analysis.nvv.missing;
  const cards = [
    { label: "Yard units", value: analysis.yard.total, note: `${formatNumber(analysis.yard.fcl)} full · ${formatNumber(analysis.yard.empty)} empty`, tone: "neutral" },
    { label: "Planned loads", value: analysis.nvv.totalLoads, note: `${formatNumber(analysis.nvv.found)} found in yard`, tone: "neutral" },
    { label: "NVV exceptions", value: exceptions, note: `${formatNumber(analysis.nvv.wrong)} wrong · ${formatNumber(analysis.nvv.missing)} missing`, tone: exceptions ? "danger" : "success" },
    { label: "Not in snapshot", value: analysis.nvv.notInYard, note: `${formatPercent(1 - analysis.nvv.coverageRate)} of load list`, tone: analysis.nvv.notInYard ? "warning" : "success" },
    { label: "Potential rehandles", value: analysis.rehandles.count, note: `${formatNumber(analysis.rehandles.affectedTargets)} targets affected`, tone: analysis.rehandles.count ? "warning" : "success" },
    { label: "Position changes", value: analysis.nvv.positionMismatch, note: "WI versus yard snapshot", tone: analysis.nvv.positionMismatch ? "warning" : "success" },
  ];
  elements.kpiGrid.innerHTML = cards.map(card => `<article class="kpi-card ${card.tone}"><span class="kpi-label">${escapeHtml(card.label)}</span><strong class="kpi-value">${formatNumber(card.value)}</strong><span class="kpi-note">${escapeHtml(card.note)}</span></article>`).join("");
}

function renderNvvDistribution(analysis) {
  const data = [
    { label: "Matched", value: analysis.nvv.matched, tone: "success" },
    { label: "Wrong NVV", value: analysis.nvv.wrong, tone: "danger" },
    { label: "Missing NVV", value: analysis.nvv.missing, tone: "warning" },
    { label: "Not in yard", value: analysis.nvv.notInYard, tone: "neutral" },
  ];
  elements.nvvScore.textContent = formatPercent(analysis.nvv.matchRate);
  elements.nvvDistribution.innerHTML = data.map(item => `<div class="status-segment ${item.tone}"><strong>${formatNumber(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`).join("");
}

function renderBarList(container, items) {
  const max = Math.max(1, ...items.map(item => item.value));
  container.innerHTML = items.map(item => `<div class="bar-row"><span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(1, (item.value / max) * 100)}%"></span></span><span class="bar-value">${formatNumber(item.value)}</span></div>`).join("") || '<p class="muted-cell">No data available.</p>';
}

function renderFocus(analysis) {
  const age = analysis.quality.snapshotAgeDays;
  const items = [
    { title: "NVV corrections", body: `${formatNumber(analysis.nvv.wrong + analysis.nvv.missing)} planned units need their outbound visit reviewed.`, tone: analysis.nvv.wrong + analysis.nvv.missing ? "danger" : "" },
    { title: "Snapshot coverage", body: `${formatNumber(analysis.nvv.notInYard)} load units are absent from the uploaded yard population.`, tone: analysis.nvv.notInYard ? "warning" : "" },
    { title: "Rehandle exposure", body: `${formatNumber(analysis.rehandles.external)} blockers are not planned on this vessel; ${formatNumber(analysis.rehandles.plannedLater)} are planned later.`, tone: analysis.rehandles.count ? "warning" : "" },
    { title: "Data timing", body: age === null ? "The snapshot date could not be derived from Last Move." : `The latest yard movement is ${Math.abs(age)} day${Math.abs(age) === 1 ? "" : "s"} from the planning date.`, tone: age !== null && Math.abs(age) > 1 ? "danger" : "" },
  ];
  elements.focusGrid.innerHTML = items.map(item => `<div class="focus-item ${item.tone}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></div>`).join("");
}

function renderNvvTable() {
  if (!state.analysis) return;
  const query = elements.nvvSearch.value.trim().toUpperCase();
  const filter = elements.nvvFilter.value;
  const rows = state.analysis.nvv.rows.filter(row => {
    const matchesQuery = !query || [row.unit, row.expectedVisit, row.actualVisit, row.yardPosition, row.wiPosition].some(value => cleanText(value).toUpperCase().includes(query));
    const matchesFilter = filter === "all" || (filter === "exceptions" ? row.status !== "match" : row.status === filter);
    return matchesQuery && matchesFilter;
  });
  const page = paginate(rows, state.nvvPage);
  state.nvvPage = page.current;
  elements.nvvTableBody.innerHTML = page.rows.map(row => `<tr><td><strong>${escapeHtml(row.unit)}</strong></td><td>${statusBadge(row.status)}</td><td>${valueOrDash(row.expectedVisit)}</td><td>${valueOrDash(row.actualVisit)}</td><td>${valueOrDash(row.lineOp)}</td><td>${valueOrDash(row.category)}</td><td>${valueOrDash(row.yardPosition, row.positionStatus === "mismatch")}</td><td>${valueOrDash(row.wiPosition, row.positionStatus === "mismatch")}</td></tr>`).join("") || emptyRow(8, "No units match the current filters.");
  renderPagination(elements.nvvPagination, page, next => { state.nvvPage = next; renderNvvTable(); });
}

function renderRehandleTable() {
  if (!state.analysis) return;
  const query = elements.rehandleSearch.value.trim().toUpperCase();
  const filter = elements.rehandleFilter.value;
  const rows = state.analysis.rehandles.rows.filter(row => {
    const matchesQuery = !query || [row.targetUnit, row.blockerUnit, row.stack, row.targetPlanner, row.targetPow].some(value => cleanText(value).toUpperCase().includes(query));
    const matchesFilter = filter === "all" || row.blockerStatus === filter || (filter === "later" && row.blockerStatus === "later-wi");
    return matchesQuery && matchesFilter;
  });
  const page = paginate(rows, state.rehandlePage);
  state.rehandlePage = page.current;
  elements.rehandleTableBody.innerHTML = page.rows.map(row => `<tr><td><strong>${escapeHtml(row.targetUnit)}</strong></td><td>${escapeHtml(row.blockerUnit)}</td><td>${escapeHtml(row.stack)}</td><td>${row.blockerTier} above ${row.targetTier}</td><td>${statusBadge(row.blockerStatus)}</td><td>${valueOrDash(row.targetMoveTime)}</td><td>${valueOrDash(row.targetPlanner)}</td><td>${valueOrDash(row.targetPow)}</td></tr>`).join("") || emptyRow(8, "No rehandles match the current filters.");
  renderPagination(elements.rehandlePagination, page, next => { state.rehandlePage = next; renderRehandleTable(); });
}

function renderQuality(analysis) {
  const age = analysis.quality.snapshotAgeDays;
  const items = [
    { title: "Snapshot age", value: age === null ? "n.a." : `${Math.abs(age)} d`, note: age === null ? "Latest Last Move could not be parsed." : "Difference from the selected planning date.", tone: age !== null && Math.abs(age) > 1 ? "danger" : "" },
    { title: "Load units absent", value: analysis.quality.missingFromYard, note: "Planned LOAD containers not present in the yard snapshot.", tone: analysis.quality.missingFromYard ? "warning" : "" },
    { title: "Wrong or missing NVV", value: analysis.quality.wrongOrMissingNvv, note: "Found load units whose yard NVV does not match the WI.", tone: analysis.quality.wrongOrMissingNvv ? "danger" : "" },
    { title: "Position mismatches", value: analysis.quality.positionMismatch, note: "Current Position in WI differs from Position in yard data.", tone: analysis.quality.positionMismatch ? "warning" : "" },
    { title: "Duplicate yard units", value: analysis.quality.duplicateYardUnits, note: "Repeated container numbers in the recognized source population.", tone: analysis.quality.duplicateYardUnits ? "danger" : "" },
    { title: "Non-stack positions", value: analysis.quality.nonStackPositions, note: "Special zones or positions without a usable final two-digit tier.", tone: analysis.quality.nonStackPositions ? "warning" : "" },
    { title: "FCL missing yard NVV", value: analysis.quality.missingNvvFcl, note: "Empty and MTY equipment are excluded from this count.", tone: analysis.quality.missingNvvFcl ? "danger" : "" },
    { title: "Yard population", value: analysis.yard.uniqueUnits, note: `${formatNumber(analysis.yard.total)} source rows across ${formatNumber(analysis.yard.blocks.length)} detected blocks or zones.`, tone: "" },
  ];
  elements.qualityGrid.innerHTML = items.map(item => `<article class="quality-card"><div class="quality-marker ${item.tone}"></div><strong>${typeof item.value === "number" ? formatNumber(item.value) : escapeHtml(item.value)}</strong><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.note)}</p></article>`).join("");
}

function statusBadge(status) {
  const mapping = {
    match: ["Matched", "success"],
    wrong: ["Wrong NVV", "danger"],
    missing: ["Missing NVV", "warning"],
    "not-yard": ["Not in yard", "neutral"],
    external: ["Not on WI", "warning"],
    "later-wi": ["Planned later", "neutral"],
  };
  const [label, tone] = mapping[status] || [status, "neutral"];
  return `<span class="status-badge ${tone}">${escapeHtml(label)}</span>`;
}

function valueOrDash(value, warn = false) {
  return value ? `<span class="${warn ? "status-badge warning" : ""}">${escapeHtml(value)}</span>` : '<span class="muted-cell">—</span>';
}

function emptyRow(columns, message) {
  return `<tr><td colspan="${columns}" class="muted-cell" style="text-align:center;padding:28px">${escapeHtml(message)}</td></tr>`;
}

function paginate(rows, requestedPage) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (current - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), total: rows.length, totalPages, current, start };
}

function renderPagination(container, page, onChange) {
  container.replaceChildren();
  const label = document.createElement("span");
  const first = page.total ? page.start + 1 : 0;
  const last = Math.min(page.start + PAGE_SIZE, page.total);
  label.textContent = `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(page.total)}`;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "Previous page");
  prev.disabled = page.current <= 1;
  prev.addEventListener("click", () => onChange(page.current - 1));
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Next page");
  next.disabled = page.current >= page.totalPages;
  next.addEventListener("click", () => onChange(page.current + 1));
  container.append(label, prev, next);
}

function activateTab(tab) {
  document.querySelectorAll(".tab-button").forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab));
  if (tab === "history") renderHistory();
}

function exportNvv() {
  if (!state.analysis) return;
  const rows = state.analysis.nvv.rows.map(row => ({
    Container: row.unit,
    Status: statusText(row.status),
    "Expected NVV": row.expectedVisit,
    "Yard NVV": row.actualVisit,
    Line: row.lineOp,
    Category: row.category,
    "Yard Position": row.yardPosition,
    "WI Position": row.wiPosition,
    "Position Check": row.positionStatus,
  }));
  downloadCsv(rows, `${safeName(state.analysis.nvv.vessel.visit)}-yard-nvv.csv`);
}

function exportRehandles() {
  if (!state.analysis) return;
  const rows = state.analysis.rehandles.rows.map(row => ({
    "Target Load": row.targetUnit,
    Blocker: row.blockerUnit,
    Stack: row.stack,
    "Target Tier": row.targetTier,
    "Blocker Tier": row.blockerTier,
    "Blocker Status": statusText(row.blockerStatus),
    "Blocker Line": row.blockerLine,
    "Blocker Category": row.blockerCategory,
    "Blocker NVV": row.blockerVisit,
    "Target Move Time": row.targetMoveTime,
    Planner: row.targetPlanner,
    "P.O.W.": row.targetPow,
  }));
  downloadCsv(rows, `${safeName(state.analysis.nvv.vessel.visit)}-potential-rehandles.csv`);
}

function statusText(status) {
  return ({ match: "Matched", wrong: "Wrong NVV", missing: "Missing NVV", "not-yard": "Not in yard", external: "Not planned on vessel", "later-wi": "Planned later on WI" })[status] || status;
}

function downloadCsv(rows, filename) {
  if (!rows.length) return showToast("There are no rows to export.");
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map(row => headers.map(header => row[header]))]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvCell(value) {
  let text = cleanText(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function safeName(value) {
  return cleanText(value).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "yard-control";
}

function resetCurrent() {
  state.yardFile = null;
  state.wiFile = null;
  state.analysis = null;
  elements.yardFile.value = "";
  elements.wiFile.value = "";
  [elements.yardDrop, elements.wiDrop].forEach(zone => zone.classList.remove("ready", "dragover"));
  elements.yardFileName.textContent = "Drop the Excel report or choose a file";
  elements.wiFileName.textContent = "Drop the TXT work list or choose a file";
  elements.yardState.textContent = "Required";
  elements.wiState.textContent = "Required";
  elements.results.hidden = true;
  elements.emptyState.hidden = false;
  elements.nvvSearch.value = "";
  elements.nvvFilter.value = "exceptions";
  elements.rehandleSearch.value = "";
  elements.rehandleFilter.value = "all";
  updateRunState();
}

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("yard-control-tower", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("runs")) request.result.createObjectStore("runs", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withHistoryStore(mode, callback) {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("runs", mode);
    const store = transaction.objectStore("runs");
    let result;
    try { result = callback(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => { db.close(); resolve(result?.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

function saveHistory(record) { return withHistoryStore("readwrite", store => store.put(record)); }

async function getHistory() {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("runs", "readonly");
    const request = transaction.objectStore("runs").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function renderHistory() {
  try {
    const records = await getHistory();
    elements.historyEmpty.hidden = records.length > 0;
    elements.historyTableBody.innerHTML = records.map(record => `<tr><td>${escapeHtml(formatDate(record.planningDate))}</td><td><strong>${escapeHtml(record.terminal)}</strong></td><td>${escapeHtml(record.nvv.vessel.name)} · ${escapeHtml(record.nvv.vessel.visit)}</td><td>${record.shortSteaming ? '<span class="status-badge warning">Short steaming</span>' : '<span class="status-badge neutral">Network</span>'}</td><td>${formatNumber(record.nvv.wrong + record.nvv.missing + record.nvv.notInYard)}</td><td>${formatNumber(record.rehandles.count)}</td><td><button class="text-button" type="button" data-history-action="view" data-history-id="${escapeHtml(record.id)}">View</button> <button class="text-button" type="button" data-history-action="delete" data-history-id="${escapeHtml(record.id)}" style="color:var(--danger)">Delete</button></td></tr>`).join("");
  } catch (error) {
    console.warn(error);
    elements.historyEmpty.hidden = false;
    elements.historyEmpty.textContent = "History is unavailable in this browser.";
  }
}

async function handleHistoryAction(event) {
  const button = event.target.closest("button[data-history-action]");
  if (!button) return;
  const records = await getHistory();
  const record = records.find(item => item.id === button.dataset.historyId);
  if (!record) return;
  if (button.dataset.historyAction === "view") {
    state.analysis = record;
    state.nvvPage = 1;
    state.rehandlePage = 1;
    renderAnalysis(record);
    showToast("Saved analysis loaded.");
  } else if (confirm(`Delete the saved analysis for ${record.nvv.vessel.visit}?`)) {
    await withHistoryStore("readwrite", store => store.delete(record.id));
    await renderHistory();
    showToast("Saved analysis deleted.");
  }
}

async function clearHistory() {
  if (!confirm("Delete all locally saved Yard Control analyses?")) return;
  await withHistoryStore("readwrite", store => store.clear());
  await renderHistory();
  showToast("Local analysis history cleared.");
}

function formatNumber(value) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(Number(value) || 0); }
function formatPercent(value) { return new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(Number(value) || 0); }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? cleanText(value) : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
function nextFrame() { return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))); }
function escapeHtml(value) {
  return cleanText(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3600);
}
