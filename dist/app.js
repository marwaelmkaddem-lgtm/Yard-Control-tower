import {
  buildBatchAnalysis,
  cleanText,
  compactHistoryRecord,
  normalizeHeader,
  normalizeWiRows,
  normalizeYardRows,
  parseDelimitedText,
  vesselIdentity,
} from "./engine.js";

const TERMINALS = ["MAMED", "MAPTM", "OMSLL", "SCCT", "HRRJK", "NGAPP", "BHKBS", "LRMLW", "DKAAR", "ITVAD", "JOAQJ", "NGONN", "SEGOT"];
const PAGE_SIZE = 50;
const state = {
  yardFile: null,
  wiFiles: [],
  preparedVessels: [],
  analysis: null,
  preparingFiles: false,
  loading: false,
  nvvPage: 1,
  rehandlePage: 1,
  historyRecords: [],
};

const elements = Object.fromEntries([
  "themeToggle", "themeLabel", "terminalSelect", "planningDate", "wiFile", "yardFile", "wiDrop", "yardDrop",
  "wiFileName", "yardFileName", "wiState", "yardState", "sourceStatus", "setupStatus", "runButton", "resetButton",
  "vesselSetup", "vesselSetupCount", "vesselSetupList", "plannerEmpty", "plannerContent", "batchTitle", "batchMeta",
  "plannerKpis", "plannerMovesChart", "plannerMoveKindChart", "plannerFreightChart", "plannerLengthChart",
  "vesselCardGrid", "plannerTableBody", "exportPlannerButton", "printButton", "nvvTabCount", "rehandleTabCount",
  "nvvEmpty", "nvvContent", "nvvMeta", "nvvVesselFilter", "nvvKpis", "nvvScore", "nvvDistribution",
  "nvvSearch", "nvvFilter", "nvvTableBody", "nvvPagination", "exportNvvButton", "rehandleEmpty",
  "rehandleContent", "rehandleMeta", "rehandleVesselFilter", "rehandleKpis", "rehandleSearch", "rehandleFilter",
  "rehandleTableBody", "rehandlePagination", "exportRehandleButton", "yardEmpty", "yardContent", "yardMeta",
  "yardKpis", "dwellChart", "blockChart", "categoryChart", "lineChart", "outboundChart", "qualityGrid",
  "historySummary", "historyTableBody", "historyEmpty", "clearHistoryButton", "toast",
  "analyticsMeta", "analyticsPlanner", "analyticsTerminal", "analyticsFrom", "analyticsTo", "analyticsEmpty",
  "analyticsContent", "analyticsKpis", "analyticsMovesTrend", "analyticsShareTrend", "analyticsMoveMix",
  "analyticsSizeMix", "analyticsTableBody",
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
  updateRunState();
  renderHistory();
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const reportError = error => console.warn("WebMCP registration failed", error);
  const tools = [
    {
      name: "read_current_control_batch",
      title: "Read current vessel and yard batch",
      description: "Return the visible batch, planner, vessel, NVV and rehandle summary.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        if (!state.analysis) throw new Error("No analysis is currently open.");
        const { terminal, planningDate, yardAvailable, vessels, planner, nvv, rehandles } = state.analysis;
        return {
          terminal,
          planningDate,
          yardAvailable,
          vessels: vessels.map(vessel => ({
            name: vessel.name,
            visit: vessel.visit,
            shortSteaming: vessel.shortSteaming,
            totalMoves: vessel.totalMoves,
          })),
          plannerMoves: planner.totalMoves,
          plannerCount: planner.plannerCount,
          nvvExceptions: nvv?.exceptionCount ?? null,
          potentialRehandles: rehandles?.count ?? null,
        };
      },
    },
    {
      name: "open_control_tower_view",
      title: "Open a control tower view",
      description: "Navigate to Planner moves, Planner analytics, NVV, Rehandles, Yard inventory, History or Rules.",
      inputSchema: {
        type: "object",
        properties: { view: { type: "string", enum: ["planner", "analytics", "nvv", "rehandles", "yard", "history", "rules"] } },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const view = input?.view;
        if (!["planner", "analytics", "nvv", "rehandles", "yard", "history", "rules"].includes(view)) throw new Error("Unsupported view.");
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
  elements.terminalSelect.addEventListener("change", () => {
    localStorage.setItem("yard-control-terminal", elements.terminalSelect.value);
    updateRunState();
  });
  elements.wiFile.addEventListener("change", event => { void prepareWorkLists(event.target.files); });
  elements.yardFile.addEventListener("change", event => setYardFile(event.target.files?.[0]));
  configureDropZone(elements.wiDrop, true, files => { void prepareWorkLists(files); });
  configureDropZone(elements.yardDrop, false, files => setYardFile(files?.[0]));
  elements.vesselSetupList.addEventListener("click", handleShortSteamingChange);
  elements.runButton.addEventListener("click", runAnalysis);
  elements.resetButton.addEventListener("click", resetCurrent);
  elements.printButton.addEventListener("click", () => window.print());
  elements.exportPlannerButton.addEventListener("click", exportPlanner);
  elements.exportNvvButton.addEventListener("click", exportNvv);
  elements.exportRehandleButton.addEventListener("click", exportRehandles);
  elements.nvvSearch.addEventListener("input", () => { state.nvvPage = 1; renderNvvTable(); });
  elements.nvvFilter.addEventListener("change", () => { state.nvvPage = 1; renderNvvTable(); });
  elements.nvvVesselFilter.addEventListener("change", () => { state.nvvPage = 1; renderNvvWorkspace(); });
  elements.rehandleSearch.addEventListener("input", () => { state.rehandlePage = 1; renderRehandleTable(); });
  elements.rehandleFilter.addEventListener("change", () => { state.rehandlePage = 1; renderRehandleTable(); });
  elements.rehandleVesselFilter.addEventListener("change", () => { state.rehandlePage = 1; renderRehandleWorkspace(); });
  [elements.analyticsPlanner, elements.analyticsTerminal, elements.analyticsFrom, elements.analyticsTo]
    .forEach(element => element.addEventListener("change", renderPlannerAnalytics));
  elements.clearHistoryButton.addEventListener("click", clearHistory);
  elements.historyTableBody.addEventListener("click", handleHistoryAction);
  document.querySelectorAll(".tab-button").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  elements.themeToggle?.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  if (elements.themeLabel) elements.themeLabel.textContent = dark ? "Light" : "Dark";
  const symbol = elements.themeToggle?.querySelector(".theme-symbol");
  if (symbol) symbol.textContent = dark ? "☾" : "☼";
}

function configureDropZone(zone, multiple, onFiles) {
  ["dragenter", "dragover"].forEach(eventName => zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(eventName => zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.remove("dragover");
  }));
  zone.addEventListener("drop", event => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    onFiles(multiple ? files : [files[0]]);
  });
}

async function prepareWorkLists(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  state.preparingFiles = true;
  state.analysis = null;
  state.wiFiles = files;
  elements.wiDrop.classList.add("ready");
  elements.wiFileName.textContent = `Reading ${files.length} file${files.length === 1 ? "" : "s"}…`;
  elements.wiState.textContent = "Reading";
  updateRunState();

  const previousSelection = new Map(state.preparedVessels.map(vessel => [vessel.fileName, vessel.shortSteaming]));
  try {
    const prepared = await Promise.all(files.map(async (file, index) => {
      const raw = await readWiFile(file);
      const wiRecords = normalizeWiRows(raw.rows);
      const moves = wiRecords.filter(record => record.unit && ["LOAD", "DSCH"].includes(record.kind));
      if (!moves.length) throw new Error(`${file.name}: no valid LOAD or DSCH rows were found.`);
      const identity = vesselIdentity(moves, fileStem(file.name));
      return {
        id: `vessel-${index + 1}`,
        fileName: file.name,
        fileSize: file.size,
        sheetName: raw.sheetName || "",
        wiRecords,
        name: identity.name,
        visit: identity.visit,
        multipleVisits: identity.multipleVisits,
        totalMoves: moves.length,
        loads: moves.filter(record => record.kind === "LOAD").length,
        discharges: moves.filter(record => record.kind === "DSCH").length,
        shortSteaming: previousSelection.get(file.name) || false,
      };
    }));
    state.preparedVessels = prepared;
    elements.wiFileName.textContent = `${files.length} Work List${files.length === 1 ? "" : "s"} selected`;
    elements.wiState.textContent = `${files.length} ready`;
    renderVesselSetup();
    showToast(`${files.length} vessel${files.length === 1 ? "" : "s"} detected.`);
  } catch (error) {
    console.error(error);
    state.preparedVessels = [];
    elements.wiDrop.classList.remove("ready");
    elements.wiFileName.textContent = "TXT, CSV, TSV, XLS or XLSX · multiple files";
    elements.wiState.textContent = "Check files";
    elements.vesselSetup.hidden = true;
    elements.sourceStatus.textContent = error.message || "The Work Lists could not be read.";
    showToast(error.message || "The Work Lists could not be read.");
  } finally {
    state.preparingFiles = false;
    updateRunState();
  }
}

function setYardFile(file) {
  if (!file) return;
  state.yardFile = file;
  state.analysis = null;
  elements.yardDrop.classList.add("ready");
  elements.yardFileName.textContent = file.name;
  elements.yardState.textContent = formatBytes(file.size);
  updateRunState();
}

function renderVesselSetup() {
  elements.vesselSetup.hidden = !state.preparedVessels.length;
  elements.vesselSetupCount.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length === 1 ? "" : "s"}`;
  elements.vesselSetupList.innerHTML = state.preparedVessels.map((vessel, index) => `
    <article class="vessel-setup-row">
      <div class="vessel-identity">
        <span class="vessel-index">${index + 1}</span>
        <span><strong>${escapeHtml(vessel.name)}</strong><small>${escapeHtml(vessel.visit)} · ${formatNumber(vessel.totalMoves)} moves${vessel.multipleVisits ? " · check: multiple visits found" : ""}</small></span>
      </div>
      <div class="ss-control" role="group" aria-label="Short steaming for ${escapeHtml(vessel.name)}">
        <span>Short steaming</span>
        <div class="segmented-control" data-vessel-id="${vessel.id}">
          <button type="button" data-short-steaming="false" aria-pressed="${String(!vessel.shortSteaming)}" class="${vessel.shortSteaming ? "" : "active"}">No</button>
          <button type="button" data-short-steaming="true" aria-pressed="${String(vessel.shortSteaming)}" class="${vessel.shortSteaming ? "active" : ""}">Yes</button>
        </div>
      </div>
    </article>
  `).join("");
}

function handleShortSteamingChange(event) {
  const button = event.target.closest("button[data-short-steaming]");
  if (!button) return;
  const control = button.closest("[data-vessel-id]");
  const vessel = state.preparedVessels.find(item => item.id === control?.dataset.vesselId);
  if (!vessel) return;
  vessel.shortSteaming = button.dataset.shortSteaming === "true";
  renderVesselSetup();
  if (state.analysis) elements.sourceStatus.textContent = "Short-steaming selection changed. Analyze again to save the updated batch.";
}

function updateRunState() {
  const terminalReady = Boolean(elements.terminalSelect.value);
  const workListsReady = state.preparedVessels.length > 0;
  const ready = terminalReady && workListsReady && !state.preparingFiles;
  elements.runButton.disabled = state.loading || !ready;

  if (state.preparingFiles) {
    elements.setupStatus.textContent = "Reading Work Lists";
    return;
  }
  if (!terminalReady) elements.setupStatus.textContent = "Select terminal";
  else if (!workListsReady) elements.setupStatus.textContent = "Add Work Lists";
  else elements.setupStatus.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length === 1 ? "" : "s"} ready`;

  if (!workListsReady) {
    elements.sourceStatus.textContent = "Work Lists calculate planner moves, NVV and potential rehandles. Yard Inventory is optional.";
  } else if (state.yardFile) {
    elements.sourceStatus.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length === 1 ? "" : "s"} ready. WI controls and the optional yard view will be included.`;
  } else {
    elements.sourceStatus.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length === 1 ? "" : "s"} ready. Planner, NVV and rehandle controls can run without Yard Inventory.`;
  }
}

async function runAnalysis() {
  if (!elements.terminalSelect.value || !state.preparedVessels.length) return;
  setLoading(true);
  elements.sourceStatus.textContent = state.yardFile
    ? "Calculating WI planner, NVV and rehandle controls plus the yard view…"
    : "Calculating WI planner, NVV and potential rehandle controls…";
  try {
    await nextFrame();
    let yardRecords = [];
    let yardRaw = null;
    if (state.yardFile) {
      yardRaw = await readYardFile(state.yardFile);
      yardRecords = normalizeYardRows(yardRaw.rows);
      if (!yardRecords.length) throw new Error("No yard containers were found. Check the selected Yard Inventory file.");
    }

    const analysis = buildBatchAnalysis({
      vessels: state.preparedVessels,
      yardRecords,
      terminal: elements.terminalSelect.value,
      planningDate: elements.planningDate.value,
      sourceFiles: {
        wi: state.preparedVessels.map(vessel => ({ name: vessel.fileName, sheetName: vessel.sheetName })),
        yard: state.yardFile?.name || null,
        yardSheet: yardRaw?.sheetName || null,
      },
    });
    state.analysis = analysis;
    state.nvvPage = 1;
    state.rehandlePage = 1;
    renderAnalysis(analysis);
    try {
      await saveHistory(compactHistoryRecord(analysis));
      await renderHistory();
      showToast("Batch analyzed and saved in local history.");
    } catch (historyError) {
      console.warn(historyError);
      showToast("Batch analyzed. Local history could not be saved on this device.");
    }
    elements.sourceStatus.textContent = analysis.yardAvailable
      ? `${formatNumber(analysis.planner.totalMoves)} WI moves and ${formatNumber(analysis.yard.total)} optional yard units processed.`
      : `${formatNumber(analysis.planner.totalMoves)} WI moves processed, including NVV and potential rehandles.`;
  } catch (error) {
    console.error(error);
    elements.sourceStatus.textContent = error.message || "The batch could not be analyzed.";
    showToast(error.message || "The batch could not be analyzed.");
  } finally {
    setLoading(false);
  }
}

async function readWiFile(file) {
  if (/\.(xlsx?|xls)$/i.test(file.name)) return readWorkbookRows(file, "wi");
  const text = await file.text();
  return { rows: parseDelimitedText(text, detectDelimiter(text)), sheetName: "" };
}

async function readYardFile(file) {
  return readWorkbookRows(file, "yard");
}

async function readWorkbookRows(file, kind) {
  if (!globalThis.XLSX) throw new Error("The spreadsheet reader did not load. Refresh the page and try again.");
  const buffer = await file.arrayBuffer();
  const workbook = globalThis.XLSX.read(buffer, { type: "array", cellDates: false });
  const scorer = kind === "yard" ? scoreYardHeader : scoreWiHeader;
  const minimum = kind === "yard" ? 3 : 2;
  let best = null;
  const sheetNames = [...workbook.SheetNames].sort((a, b) => {
    if (kind !== "yard") return 0;
    return Number(normalizeHeader(b) === "source data") - Number(normalizeHeader(a) === "source data");
  });
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = globalThis.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const headerIndex = findHeader(matrix, scorer, minimum);
    if (headerIndex < 0) continue;
    const score = scorer(matrix[headerIndex]) + (kind === "yard" && normalizeHeader(sheetName) === "source data" ? 10 : 0);
    if (!best || score > best.score) best = { sheetName, matrix, headerIndex, score };
  }
  if (!best) {
    throw new Error(kind === "yard"
      ? "No Yard Inventory sheet was recognized. Required columns include Unit Nbr, O/B Actual Visit and Position."
      : `${file.name}: no Work List sheet with Kind and Container No. columns was recognized.`);
  }
  const headers = best.matrix[best.headerIndex].map(cleanText);
  const rows = best.matrix.slice(best.headerIndex + 1)
    .filter(row => row.some(value => cleanText(value)))
    .map(row => Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? ""])));
  return { rows, sheetName: best.sheetName };
}

function findHeader(matrix, scorer, minimum) {
  const max = Math.min(matrix.length, 30);
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < max; index += 1) {
    const score = scorer(matrix[index]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestScore >= minimum ? bestIndex : -1;
}

function scoreYardHeader(row = []) {
  const headers = row.map(normalizeHeader);
  const groups = [
    ["unit nbr", "unit no", "container no"],
    ["o b actual visit", "ob actual visit", "outbound visit", "nvv"],
    ["position", "yard position", "current position"],
    ["frght kind", "freight kind", "sts"],
    ["category", "cat"],
  ];
  return groups.reduce((score, aliases) => score + Number(aliases.some(alias => headers.includes(normalizeHeader(alias)))), 0);
}

function scoreWiHeader(row = []) {
  const headers = row.map(normalizeHeader);
  const groups = [
    ["kind", "move kind"],
    ["container no", "container number", "unit nbr"],
    ["planner"],
    ["outbound carrier", "outbound visit"],
  ];
  return groups.reduce((score, aliases) => score + Number(aliases.some(alias => headers.includes(normalizeHeader(alias)))), 0);
}

function detectDelimiter(text) {
  const firstLine = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const candidates = ["\t", ",", ";"].map(delimiter => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0].count ? candidates[0].delimiter : "\t";
}

function setLoading(loading) {
  state.loading = loading;
  elements.runButton.classList.toggle("loading", loading);
  elements.runButton.querySelector(".button-label").textContent = loading ? "Analyzing…" : "Analyze & save batch";
  updateRunState();
}

function renderAnalysis(analysis) {
  elements.plannerEmpty.hidden = true;
  elements.plannerContent.hidden = false;
  elements.batchTitle.textContent = `${analysis.vessels.length} vessel${analysis.vessels.length === 1 ? "" : "s"} · ${analysis.terminal}`;
  elements.batchMeta.textContent = `Planning date ${formatDate(analysis.planningDate)} · WI controls${analysis.yardAvailable ? " + optional yard view" : ""} · Run ${formatDateTime(analysis.createdAt)}`;
  renderPlannerWorkspace(analysis);

  elements.nvvEmpty.hidden = true;
  elements.nvvContent.hidden = false;
  elements.rehandleEmpty.hidden = true;
  elements.rehandleContent.hidden = false;
  populateVesselFilter(elements.nvvVesselFilter, analysis.vessels);
  populateVesselFilter(elements.rehandleVesselFilter, analysis.vessels);
  elements.nvvTabCount.textContent = formatNumber(nvvExceptions(analysis.nvv));
  elements.rehandleTabCount.textContent = formatNumber(analysis.rehandles?.count || 0);
  renderNvvWorkspace();
  renderRehandleWorkspace();

  if (analysis.yardAvailable) {
    elements.yardEmpty.hidden = true;
    elements.yardContent.hidden = false;
    renderYardWorkspace(analysis);
  } else {
    elements.yardEmpty.hidden = false;
    elements.yardContent.hidden = true;
  }
  activateTab("planner");
  document.querySelector(".workspace-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPlannerWorkspace(analysis) {
  const planner = analysis.planner;
  elements.plannerKpis.innerHTML = renderKpiCards([
    { label: "Total moves", value: planner.totalMoves, note: `${formatNumber(analysis.vessels.length)} vessels`, tone: "neutral" },
    { label: "Load moves", value: planner.totalLoads, note: formatPercent(planner.totalMoves ? planner.totalLoads / planner.totalMoves : 0), tone: "teal" },
    { label: "Discharge moves", value: planner.totalDischarges, note: formatPercent(planner.totalMoves ? planner.totalDischarges / planner.totalMoves : 0), tone: "blue" },
    { label: "Planners", value: planner.plannerCount, note: "WI Planner field", tone: "neutral" },
    { label: "Network moves", value: planner.networkMoves, note: "SS excluded", tone: "success" },
    { label: "Short steaming moves", value: planner.shortSteamingMoves, note: "Selected per vessel", tone: planner.shortSteamingMoves ? "warning" : "neutral" },
  ]);
  renderBarList(elements.plannerMovesChart, planner.planners.map(row => ({ label: row.planner, value: row.totalMoves })), 14);
  renderBarList(elements.plannerMoveKindChart, planner.byMoveKind);
  renderBarList(elements.plannerFreightChart, planner.byFreightKind);
  renderBarList(elements.plannerLengthChart, planner.byLength);
  elements.vesselCardGrid.innerHTML = planner.vesselRows.map(vessel => `
    <article class="vessel-card">
      <div class="vessel-card-top">
        <span class="status-badge ${vessel.shortSteaming ? "warning" : "neutral"}">${vessel.shortSteaming ? "Short steaming" : "Network"}</span>
        <span>${formatNumber(vessel.totalMoves)} moves</span>
      </div>
      <h3>${escapeHtml(vessel.name)}</h3>
      <p>${escapeHtml(vessel.visit)}</p>
      <div class="vessel-metrics">
        <span><strong>${formatNumber(vessel.loads)}</strong>Load</span>
        <span><strong>${formatNumber(vessel.discharges)}</strong>Discharge</span>
        <span><strong>${formatNumber(vessel.planners.length)}</strong>Planners</span>
      </div>
      <small>${escapeHtml(vessel.fileName)}</small>
    </article>
  `).join("");
  elements.plannerTableBody.innerHTML = planner.planners.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.planner)}</strong></td>
      <td>${formatNumber(row.totalMoves)}</td>
      <td>${formatPercent(row.share)}</td>
      <td>${formatNumber(row.loads)}</td>
      <td>${formatNumber(row.discharges)}</td>
      <td>${formatNumber(row.full)}</td>
      <td>${formatNumber(row.empty)}</td>
      <td>${formatNumber(row.size20)}</td>
      <td>${formatNumber(row.size40)}</td>
      <td>${formatNumber(row.size45)}</td>
      <td>${formatNumber(row.vesselCount)}</td>
    </tr>
  `).join("") || emptyRow(11, "No planner rows were found.");
}

function renderNvvWorkspace() {
  if (!state.analysis?.nvv) return;
  const summary = selectedVesselSummary("nvv");
  elements.nvvMeta.textContent = elements.nvvVesselFilter.value === "all"
    ? `${state.analysis.vessels.length} vessels combined · WI discharge rows · Yard Inventory not required`
    : vesselLabel(state.analysis.vessels.find(vessel => vessel.id === elements.nvvVesselFilter.value));
  elements.nvvKpis.innerHTML = renderKpiCards([
    { label: "FCL evaluated", value: summary.eligibleFcl, note: `${formatNumber(summary.totalDischarges)} discharge rows`, tone: "neutral" },
    { label: "Valid NVV", value: summary.valid, note: formatPercent(summary.accuracyRate), tone: "success" },
    { label: "Missing NVV", value: summary.missingNvv, note: "Transhipment next vessel", tone: summary.missingNvv ? "danger" : "success" },
    { label: "Classification issues", value: summary.classificationIssues, note: "POD, category or outbound", tone: summary.classificationIssues ? "warning" : "success" },
    { label: "Excluded", value: summary.excludedEmpty + summary.excludedRestow, note: `${formatNumber(summary.excludedEmpty)} MTY · ${formatNumber(summary.excludedRestow)} restow`, tone: "neutral" },
  ]);
  elements.nvvScore.textContent = formatPercent(summary.accuracyRate);
  const distribution = [
    { label: "Valid import", value: summary.validImport, tone: "success" },
    { label: "Valid transhipment", value: summary.validTransship, tone: "success" },
    { label: "Valid HLC ITT", value: summary.validItt, tone: "neutral" },
    { label: "Exceptions", value: summary.exceptionCount, tone: summary.exceptionCount ? "danger" : "success" },
  ];
  elements.nvvDistribution.innerHTML = distribution.map(item => `<div class="status-segment ${item.tone}"><strong>${formatNumber(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`).join("");
  renderNvvTable();
}

function renderNvvTable() {
  if (!state.analysis?.nvv) return;
  const vesselId = elements.nvvVesselFilter.value || "all";
  const query = elements.nvvSearch.value.trim().toUpperCase();
  const filter = elements.nvvFilter.value;
  const validStatuses = new Set(["valid-import", "valid-transship", "valid-itt"]);
  const excludedStatuses = new Set(["excluded-empty", "excluded-restow"]);
  const rows = state.analysis.nvv.rows.filter(row => {
    const matchesVessel = vesselId === "all" || row.vesselId === vesselId;
    const matchesQuery = !query || [row.unit, row.pod, row.outboundCarrier, row.lineOp, row.category, row.planner, row.vesselName, row.vesselVisit]
      .some(value => cleanText(value).toUpperCase().includes(query));
    const matchesFilter = filter === "all"
      || (filter === "exceptions" && !validStatuses.has(row.status) && !excludedStatuses.has(row.status))
      || (filter === "valid" && validStatuses.has(row.status))
      || (filter === "excluded" && excludedStatuses.has(row.status))
      || row.status === filter;
    return matchesVessel && matchesQuery && matchesFilter;
  });
  const page = paginate(rows, state.nvvPage);
  state.nvvPage = page.current;
  elements.nvvTableBody.innerHTML = page.rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.vesselName)}</strong><small class="table-subline">${escapeHtml(row.vesselVisit)}</small></td>
      <td><span class="status-badge ${row.shortSteaming ? "warning" : "neutral"}">${row.shortSteaming ? "SS" : "Network"}</span></td>
      <td><strong>${escapeHtml(row.unit)}</strong></td>
      <td>${statusBadge(row.status)}</td>
      <td>${valueOrDash(row.freightKind)}</td>
      <td>${valueOrDash(row.lineOp)}</td>
      <td>${valueOrDash(row.pod)}</td>
      <td>${valueOrDash(row.category)}</td>
      <td>${valueOrDash(row.outboundCarrier)}</td>
      <td>${valueOrDash(row.planner)}</td>
      <td class="explanation-cell">${escapeHtml(row.explanation)}</td>
    </tr>
  `).join("") || emptyRow(11, "No NVV rows match the current filters.");
  renderPagination(elements.nvvPagination, page, next => { state.nvvPage = next; renderNvvTable(); });
}

function renderRehandleWorkspace() {
  if (!state.analysis?.rehandles) return;
  const summary = selectedVesselSummary("rehandles");
  elements.rehandleMeta.textContent = elements.rehandleVesselFilter.value === "all"
    ? `${state.analysis.vessels.length} vessels evaluated separately from WI current position and load order · not confirmed moves`
    : vesselLabel(state.analysis.vessels.find(vessel => vessel.id === elements.rehandleVesselFilter.value));
  elements.rehandleKpis.innerHTML = renderKpiCards([
    { label: "Potential rehandles", value: summary.count, note: "WI-derived indicator", tone: summary.count ? "warning" : "success" },
    { label: "Affected targets", value: summary.affectedTargets, note: "Planned load units", tone: summary.affectedTargets ? "warning" : "success" },
    { label: "Probable", value: summary.probable, note: "Stronger WI sequence evidence", tone: summary.probable ? "danger" : "success" },
    { label: "Possible", value: summary.possible, note: "Review planning constraints", tone: summary.possible ? "warning" : "success" },
  ]);
  renderRehandleTable();
}

function renderRehandleTable() {
  if (!state.analysis?.rehandles) return;
  const vesselId = elements.rehandleVesselFilter.value || "all";
  const query = elements.rehandleSearch.value.trim().toUpperCase();
  const filter = elements.rehandleFilter.value;
  const rows = state.analysis.rehandles.rows.filter(row => {
    const matchesVessel = vesselId === "all" || row.vesselId === vesselId;
    const matchesQuery = !query || [row.targetUnit, row.blockerUnit, row.stack, row.targetPlanner, row.targetPow, row.vesselName, row.vesselVisit]
      .some(value => cleanText(value).toUpperCase().includes(query));
    const matchesFilter = filter === "all" || row.confidence === filter;
    return matchesVessel && matchesQuery && matchesFilter;
  });
  const page = paginate(rows, state.rehandlePage);
  state.rehandlePage = page.current;
  elements.rehandleTableBody.innerHTML = page.rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.vesselName)}</strong><small class="table-subline">${escapeHtml(row.vesselVisit)}</small></td>
      <td><span class="status-badge ${row.shortSteaming ? "warning" : "neutral"}">${row.shortSteaming ? "SS" : "Network"}</span></td>
      <td><strong>${escapeHtml(row.targetUnit)}</strong></td>
      <td>${escapeHtml(row.blockerUnit)}</td>
      <td>${escapeHtml(row.stack)}</td>
      <td>${row.blockerTier} above ${row.targetTier}</td>
      <td>${statusBadge(row.confidence)}</td>
      <td>${valueOrDash(row.targetMoveTime)}<small class="table-subline">${escapeHtml(row.blockerMoveTime || "Blocker time unavailable")}</small></td>
      <td>${valueOrDash(row.targetPlanner)}</td>
      <td>${valueOrDash(row.targetPow)}</td>
      <td class="explanation-cell">${escapeHtml(row.explanation)}</td>
    </tr>
  `).join("") || emptyRow(11, "No potential rehandles match the current filters.");
  renderPagination(elements.rehandlePagination, page, next => { state.rehandlePage = next; renderRehandleTable(); });
}

function renderYardWorkspace(analysis) {
  const yard = analysis.yard;
  elements.yardMeta.textContent = `${analysis.sourceFiles.yard || "Uploaded yard file"} · Sheet ${analysis.sourceFiles.yardSheet || "detected automatically"} · Latest movement ${yard.snapshotLatest ? formatDateTime(yard.snapshotLatest) : "unavailable"}`;
  elements.yardKpis.innerHTML = renderKpiCards([
    { label: "Total units", value: yard.total, note: `${formatNumber(yard.uniqueUnits)} unique`, tone: "neutral" },
    { label: "FCL", value: yard.fcl, note: formatPercent(yard.total ? yard.fcl / yard.total : 0), tone: "teal" },
    { label: "MTY", value: yard.empty, note: formatPercent(yard.total ? yard.empty / yard.total : 0), tone: "blue" },
    { label: "Median dwell", value: `${formatNumber(yard.medianDwell)} d`, note: `Average ${formatNumber(yard.averageDwell)} d`, tone: "neutral" },
    { label: "15+ day units", value: yard.aged15, note: `${formatNumber(yard.aged31)} at 31+ days`, tone: yard.aged15 ? "warning" : "success" },
    { label: "FCL missing NVV", value: yard.missingNvvFcl, note: "MTY excluded", tone: yard.missingNvvFcl ? "danger" : "success" },
  ]);
  renderBarList(elements.dwellChart, yard.dwellBuckets.filter(item => item.value > 0));
  renderBarList(elements.blockChart, yard.blocks.slice(0, 10));
  renderBarList(elements.categoryChart, yard.categories);
  renderBarList(elements.lineChart, yard.lines);
  renderBarList(elements.outboundChart, (yard.outboundVisits || []).slice(0, 12), 12);
  const quality = analysis.quality;
  elements.qualityGrid.innerHTML = [
    { title: "Snapshot age", value: quality.snapshotAgeDays === null ? "n.a." : `${Math.abs(quality.snapshotAgeDays)} d`, note: "Difference from planning date", tone: quality.snapshotAgeDays !== null && Math.abs(quality.snapshotAgeDays) > 1 ? "danger" : "" },
    { title: "Load units absent", value: quality.missingFromYard, note: "Planned LOAD units not in snapshot", tone: quality.missingFromYard ? "warning" : "" },
    { title: "Yard visit mismatch", value: quality.wrongOrMissingYardNvv ?? quality.wrongOrMissingNvv, note: "Optional WI load vs yard outbound check", tone: (quality.wrongOrMissingYardNvv ?? quality.wrongOrMissingNvv) ? "danger" : "" },
    { title: "Position mismatches", value: quality.positionMismatch, note: "WI position differs from yard", tone: quality.positionMismatch ? "warning" : "" },
    { title: "Duplicate yard units", value: quality.duplicateYardUnits, note: "Repeated container numbers", tone: quality.duplicateYardUnits ? "danger" : "" },
    { title: "Non-stack positions", value: quality.nonStackPositions, note: "No usable final tier", tone: quality.nonStackPositions ? "warning" : "" },
  ].map(item => `
    <article class="quality-card">
      <div class="quality-marker ${item.tone}"></div>
      <strong>${typeof item.value === "number" ? formatNumber(item.value) : escapeHtml(item.value)}</strong>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.note)}</p>
    </article>
  `).join("");
}

function selectedVesselSummary(type) {
  const filter = type === "nvv" ? elements.nvvVesselFilter : elements.rehandleVesselFilter;
  if (!filter.value || filter.value === "all") return state.analysis[type];
  return state.analysis.vessels.find(vessel => vessel.id === filter.value)?.[type] || state.analysis[type];
}

function populateVesselFilter(select, vessels) {
  const current = select.value;
  select.innerHTML = `<option value="all">All vessels combined</option>${vessels.map(vessel => `<option value="${vessel.id}">${escapeHtml(vessel.name)} · ${escapeHtml(vessel.visit)}${vessel.shortSteaming ? " · SS" : ""}</option>`).join("")}`;
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function renderKpiCards(cards) {
  return cards.map(card => `
    <article class="kpi-card ${card.tone || "neutral"}">
      <span class="kpi-label">${escapeHtml(card.label)}</span>
      <strong class="kpi-value">${typeof card.value === "number" ? formatNumber(card.value) : escapeHtml(card.value)}</strong>
      <span class="kpi-note">${escapeHtml(card.note || "")}</span>
    </article>
  `).join("");
}

function renderBarList(container, items = [], limit = 10) {
  const visible = items.slice(0, limit);
  const max = Math.max(1, ...visible.map(item => item.value));
  container.innerHTML = visible.map(item => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(1, (item.value / max) * 100)}%"></span></span>
      <span class="bar-value">${formatNumber(item.value)}</span>
    </div>
  `).join("") || '<p class="muted-cell">No data available.</p>';
}

function statusBadge(status) {
  const mapping = {
    match: ["Matched", "success"],
    wrong: ["Wrong NVV", "danger"],
    missing: ["Missing NVV", "warning"],
    "not-yard": ["Not in yard", "neutral"],
    external: ["Not on WI", "warning"],
    "later-wi": ["Planned later", "neutral"],
    "valid-import": ["Valid import", "success"],
    "valid-transship": ["Valid transhipment", "success"],
    "valid-itt": ["Valid HLC ITT", "success"],
    "missing-nvv": ["Missing NVV", "danger"],
    "category-mismatch": ["Category mismatch", "warning"],
    "outbound-mismatch": ["Outbound mismatch", "warning"],
    "missing-pod": ["Missing POD", "danger"],
    "excluded-empty": ["Excluded MTY", "neutral"],
    "excluded-restow": ["Excluded restow", "neutral"],
    probable: ["Probable", "warning"],
    possible: ["Possible", "neutral"],
  };
  const [label, tone] = mapping[status] || [status, "neutral"];
  return `<span class="status-badge ${tone}">${escapeHtml(label)}</span>`;
}

function valueOrDash(value, warn = false) {
  return value ? `<span class="${warn ? "status-badge warning" : ""}">${escapeHtml(value)}</span>` : '<span class="muted-cell">—</span>';
}

function emptyRow(columns, message) {
  return `<tr><td colspan="${columns}" class="muted-cell empty-cell">${escapeHtml(message)}</td></tr>`;
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
  if (tab === "history") void renderHistory();
  if (tab === "analytics") renderPlannerAnalytics();
}

function exportPlanner() {
  if (!state.analysis) return;
  const rows = state.analysis.planner.planners.map(row => ({
    Planner: row.planner,
    "Total Moves": row.totalMoves,
    "Share %": (row.share * 100).toFixed(1),
    Load: row.loads,
    Discharge: row.discharges,
    FCL: row.full,
    MTY: row.empty,
    "20 ft": row.size20,
    "40 ft": row.size40,
    "45 ft": row.size45,
    Vessels: row.vesselCount,
  }));
  downloadCsv(rows, `${safeName(state.analysis.terminal)}-${state.analysis.planningDate}-planner-moves.csv`);
}

function exportNvv() {
  if (!state.analysis?.nvv) return;
  const vesselId = elements.nvvVesselFilter.value || "all";
  const rows = state.analysis.nvv.rows
    .filter(row => vesselId === "all" || row.vesselId === vesselId)
    .map(row => ({
      Vessel: row.vesselName,
      Visit: row.vesselVisit,
      Type: row.shortSteaming ? "Short steaming" : "Network",
      Container: row.unit,
      Status: statusText(row.status),
      Freight: row.freightKind,
      Line: row.lineOp,
      POD: row.pod,
      Category: row.category,
      "Outbound Carrier / NVV": row.outboundCarrier,
      Planner: row.planner,
      "P.O.W.": row.pow,
      Explanation: row.explanation,
    }));
  downloadCsv(rows, `${safeName(state.analysis.terminal)}-${state.analysis.planningDate}-wi-nvv.csv`);
}

function exportRehandles() {
  if (!state.analysis?.rehandles) return;
  const vesselId = elements.rehandleVesselFilter.value || "all";
  const rows = state.analysis.rehandles.rows
    .filter(row => vesselId === "all" || row.vesselId === vesselId)
    .map(row => ({
      Vessel: row.vesselName,
      Visit: row.vesselVisit,
      Type: row.shortSteaming ? "Short steaming" : "Network",
      "Target Load": row.targetUnit,
      Blocker: row.blockerUnit,
      Stack: row.stack,
      "Target Tier": row.targetTier,
      "Blocker Tier": row.blockerTier,
      Confidence: statusText(row.confidence),
      Source: row.source,
      "Blocker Line": row.blockerLine,
      "Blocker Category": row.blockerCategory,
      "Blocker NVV": row.blockerVisit,
      "Target Move Time": row.targetMoveTime,
      "Blocker Move Time": row.blockerMoveTime,
      Planner: row.targetPlanner,
      "P.O.W.": row.targetPow,
      Evidence: row.explanation,
    }));
  downloadCsv(rows, `${safeName(state.analysis.terminal)}-${state.analysis.planningDate}-potential-rehandles.csv`);
}

function statusText(status) {
  return ({
    match: "Matched",
    wrong: "Wrong NVV",
    missing: "Missing NVV",
    "not-yard": "Not in yard",
    "valid-import": "Valid import",
    "valid-transship": "Valid transhipment",
    "valid-itt": "Valid HLC ITT",
    "missing-nvv": "Missing NVV",
    "category-mismatch": "Category mismatch",
    "outbound-mismatch": "Outbound mismatch",
    "missing-pod": "Missing POD",
    "excluded-empty": "Excluded MTY",
    "excluded-restow": "Excluded restow",
    probable: "Probable",
    possible: "Possible",
  })[status] || status;
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

function resetCurrent() {
  state.yardFile = null;
  state.wiFiles = [];
  state.preparedVessels = [];
  state.analysis = null;
  elements.wiFile.value = "";
  elements.yardFile.value = "";
  [elements.wiDrop, elements.yardDrop].forEach(zone => zone.classList.remove("ready", "dragover"));
  elements.wiFileName.textContent = "TXT, CSV, TSV, XLS or XLSX · multiple files";
  elements.yardFileName.textContent = "Optional · adds yard inventory cross-checks";
  elements.wiState.textContent = "Required";
  elements.yardState.textContent = "Optional";
  elements.vesselSetup.hidden = true;
  elements.plannerEmpty.hidden = false;
  elements.plannerContent.hidden = true;
  elements.nvvEmpty.hidden = false;
  elements.nvvContent.hidden = true;
  elements.rehandleEmpty.hidden = false;
  elements.rehandleContent.hidden = true;
  elements.yardEmpty.hidden = false;
  elements.yardContent.hidden = true;
  elements.nvvTabCount.textContent = "—";
  elements.rehandleTabCount.textContent = "—";
  elements.nvvSearch.value = "";
  elements.nvvFilter.value = "exceptions";
  elements.rehandleSearch.value = "";
  elements.rehandleFilter.value = "all";
  activateTab("planner");
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
    const rawRecords = await getHistory();
    const records = rawRecords.map(upgradeLegacyRecord);
    state.historyRecords = records;
    const vesselCount = records.reduce((sum, record) => sum + record.vessels.length, 0);
    const networkCount = records.reduce((sum, record) => sum + record.vessels.filter(vessel => !vessel.shortSteaming).length, 0);
    const shortSteamingCount = records.reduce((sum, record) => sum + record.vessels.filter(vessel => vessel.shortSteaming).length, 0);
    const plannerMoves = records.reduce((sum, record) => sum + (record.planner?.totalMoves || 0), 0);
    elements.historySummary.innerHTML = renderKpiCards([
      { label: "Saved batches", value: records.length, note: "This browser", tone: "neutral" },
      { label: "Vessels", value: vesselCount, note: `${formatNumber(networkCount)} network`, tone: "teal" },
      { label: "Short steaming", value: shortSteamingCount, note: "Selected per vessel", tone: shortSteamingCount ? "warning" : "neutral" },
      { label: "Planner moves", value: plannerMoves, note: "Across saved batches", tone: "blue" },
    ]);
    elements.historyEmpty.hidden = records.length > 0;
    elements.historyTableBody.innerHTML = records.map(record => {
      const network = record.vessels.filter(vessel => !vessel.shortSteaming).length;
      const shortSteaming = record.vessels.length - network;
      const vesselNames = record.vessels.slice(0, 2).map(vessel => vessel.name).join(", ");
      const more = record.vessels.length > 2 ? ` +${record.vessels.length - 2}` : "";
      return `
        <tr>
          <td>${escapeHtml(formatDate(record.planningDate))}</td>
          <td><strong>${escapeHtml(record.terminal)}</strong></td>
          <td>${escapeHtml(vesselNames || "Unknown vessel")}${escapeHtml(more)}<small class="table-subline">${formatNumber(record.vessels.length)} vessel${record.vessels.length === 1 ? "" : "s"}</small></td>
          <td>${formatNumber(network)} / ${formatNumber(shortSteaming)}</td>
          <td>${formatNumber(record.planner?.totalMoves || 0)}</td>
          <td>${record.nvv ? formatNumber(nvvExceptions(record.nvv)) : '<span class="muted-cell">Legacy</span>'}</td>
          <td>${record.rehandles ? formatNumber(record.rehandles.count) : '<span class="muted-cell">Legacy</span>'}</td>
          <td><button class="text-button" type="button" data-history-action="view" data-history-id="${escapeHtml(record.id)}">View</button> <button class="text-button danger-text" type="button" data-history-action="delete" data-history-id="${escapeHtml(record.id)}">Delete</button></td>
        </tr>
      `;
    }).join("");
    populateAnalyticsFilters(records);
    renderPlannerAnalytics();
  } catch (error) {
    console.warn(error);
    state.historyRecords = [];
    elements.historySummary.innerHTML = "";
    elements.historyEmpty.hidden = false;
    elements.historyEmpty.textContent = "History is unavailable in this browser.";
    elements.analyticsEmpty.hidden = false;
    elements.analyticsContent.hidden = true;
  }
}

function populateAnalyticsFilters(records) {
  const cycles = buildPlannerCycles(records);
  const plannerValue = elements.analyticsPlanner.value;
  const terminalValue = elements.analyticsTerminal.value;
  const planners = [...new Set(cycles.map(cycle => cycle.planner))].sort((a, b) => a.localeCompare(b));
  const terminals = [...new Set(cycles.map(cycle => cycle.terminal))].sort((a, b) => a.localeCompare(b));
  elements.analyticsPlanner.innerHTML = `<option value="all">All planners</option>${planners.map(planner => `<option value="${escapeHtml(planner)}">${escapeHtml(planner)}</option>`).join("")}`;
  elements.analyticsTerminal.innerHTML = `<option value="all">All terminals</option>${terminals.map(terminal => `<option value="${escapeHtml(terminal)}">${escapeHtml(terminal)}</option>`).join("")}`;
  if ([...elements.analyticsPlanner.options].some(option => option.value === plannerValue)) elements.analyticsPlanner.value = plannerValue;
  if ([...elements.analyticsTerminal.options].some(option => option.value === terminalValue)) elements.analyticsTerminal.value = terminalValue;
}

function buildPlannerCycles(records) {
  return (records || []).flatMap(record => (record.vessels || []).flatMap(vessel => {
    const breakdown = Array.isArray(vessel.plannerBreakdown) ? vessel.plannerBreakdown : [];
    return breakdown.map(row => ({
      id: `${record.id}:${vessel.id}:${row.planner}`,
      planningDate: record.planningDate || "",
      createdAt: record.createdAt || "",
      terminal: record.terminal || "Unspecified",
      vesselName: vessel.name || "Unknown vessel",
      vesselVisit: vessel.visit || "Unknown visit",
      shortSteaming: Boolean(vessel.shortSteaming),
      planner: row.planner || "Unassigned",
      totalMoves: row.totalMoves || 0,
      loads: row.loads || 0,
      discharges: row.discharges || 0,
      full: row.full || 0,
      empty: row.empty || 0,
      size20: row.size20 || 0,
      size40: row.size40 || 0,
      size45: row.size45 || 0,
      otherSize: row.otherSize || 0,
      share: Number.isFinite(row.share) ? row.share : (vessel.totalMoves ? (row.totalMoves || 0) / vessel.totalMoves : 0),
    }));
  })).sort((a, b) => a.planningDate.localeCompare(b.planningDate) || a.createdAt.localeCompare(b.createdAt) || a.vesselName.localeCompare(b.vesselName));
}

function renderPlannerAnalytics() {
  const allCycles = buildPlannerCycles(state.historyRecords);
  const planner = elements.analyticsPlanner.value || "all";
  const terminal = elements.analyticsTerminal.value || "all";
  const from = elements.analyticsFrom.value;
  const to = elements.analyticsTo.value;
  const cycles = allCycles.filter(cycle =>
    (planner === "all" || cycle.planner === planner)
    && (terminal === "all" || cycle.terminal === terminal)
    && (!from || cycle.planningDate >= from)
    && (!to || cycle.planningDate <= to)
  );

  elements.analyticsEmpty.hidden = cycles.length > 0;
  elements.analyticsContent.hidden = cycles.length === 0;
  if (!cycles.length) return;

  const totalMoves = cycles.reduce((sum, cycle) => sum + cycle.totalMoves, 0);
  const averageMoves = totalMoves / cycles.length;
  const averageShare = cycles.reduce((sum, cycle) => sum + cycle.share, 0) / cycles.length;
  const networkCycles = cycles.filter(cycle => !cycle.shortSteaming).length;
  const shortSteamingCycles = cycles.length - networkCycles;
  const dateCount = new Set(cycles.map(cycle => cycle.planningDate)).size;
  elements.analyticsMeta.textContent = `${planner === "all" ? "All planners" : planner} · ${terminal === "all" ? "All terminals" : terminal} · ${formatNumber(cycles.length)} planner-vessel cycles across ${formatNumber(dateCount)} planning dates`;
  elements.analyticsKpis.innerHTML = renderKpiCards([
    { label: "Planning cycles", value: cycles.length, note: "One planner + one vessel", tone: "neutral" },
    { label: "Moves", value: totalMoves, note: "Across filtered cycles", tone: "teal" },
    { label: "Average moves / cycle", value: averageMoves.toFixed(1), note: "Workload trend", tone: "blue" },
    { label: "Average planner share", value: formatPercent(averageShare), note: "Share of vessel moves", tone: "success" },
    { label: "Network / SS cycles", value: `${networkCycles} / ${shortSteamingCycles}`, note: "Vessel classification", tone: shortSteamingCycles ? "warning" : "neutral" },
  ]);

  renderTrendChart(elements.analyticsMovesTrend, cycles, cycle => cycle.totalMoves, value => formatNumber(value));
  renderTrendChart(elements.analyticsShareTrend, cycles, cycle => cycle.share * 100, value => `${formatNumber(value)}%`, true);
  renderBarList(elements.analyticsMoveMix, [
    { label: "Load", value: cycles.reduce((sum, cycle) => sum + cycle.loads, 0) },
    { label: "Discharge", value: cycles.reduce((sum, cycle) => sum + cycle.discharges, 0) },
  ]);
  renderBarList(elements.analyticsSizeMix, [
    { label: "20 ft", value: cycles.reduce((sum, cycle) => sum + cycle.size20, 0) },
    { label: "40 ft", value: cycles.reduce((sum, cycle) => sum + cycle.size40, 0) },
    { label: "45 ft", value: cycles.reduce((sum, cycle) => sum + cycle.size45, 0) },
    { label: "Other", value: cycles.reduce((sum, cycle) => sum + cycle.otherSize, 0) },
  ]);
  elements.analyticsTableBody.innerHTML = [...cycles].reverse().map(cycle => `
    <tr>
      <td>${escapeHtml(formatDate(cycle.planningDate))}</td>
      <td><strong>${escapeHtml(cycle.planner)}</strong></td>
      <td>${escapeHtml(cycle.terminal)}</td>
      <td>${escapeHtml(cycle.vesselName)}<small class="table-subline">${escapeHtml(cycle.vesselVisit)}</small></td>
      <td><span class="status-badge ${cycle.shortSteaming ? "warning" : "neutral"}">${cycle.shortSteaming ? "SS" : "Network"}</span></td>
      <td>${formatNumber(cycle.totalMoves)}</td>
      <td>${formatPercent(cycle.share)}</td>
      <td>${formatNumber(cycle.loads)}</td>
      <td>${formatNumber(cycle.discharges)}</td>
      <td>${formatNumber(cycle.full)}</td>
      <td>${formatNumber(cycle.empty)}</td>
    </tr>
  `).join("");
}

function renderTrendChart(container, sourcePoints, valueAccessor, formatter, percentScale = false) {
  const points = sourcePoints.slice(-30);
  const width = 760;
  const height = 250;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.map(valueAccessor);
  const observedMax = Math.max(1, ...values);
  const maximum = percentScale ? 100 : Math.ceil(observedMax / 10) * 10;
  const xAt = index => points.length === 1 ? left + plotWidth / 2 : left + (index / (points.length - 1)) * plotWidth;
  const yAt = value => top + plotHeight - (Math.max(0, value) / maximum) * plotHeight;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const y = top + plotHeight - ratio * plotHeight;
    return `<line class="trend-grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text class="trend-axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(formatter(maximum * ratio))}</text>`;
  }).join("");
  const polyline = points.map((point, index) => `${xAt(index)},${yAt(valueAccessor(point))}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const xLabels = labelIndexes.map(index => `<text class="trend-axis-label" x="${xAt(index)}" y="${height - 13}" text-anchor="middle">${escapeHtml(shortDate(points[index].planningDate))}</text>`).join("");
  const dots = points.map((point, index) => `
    <circle class="trend-dot" cx="${xAt(index)}" cy="${yAt(valueAccessor(point))}" r="4">
      <title>${escapeHtml(`${formatDate(point.planningDate)} · ${point.planner} · ${point.vesselName}: ${formatter(valueAccessor(point))}`)}</title>
    </circle>
  `).join("");
  container.innerHTML = `
    <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Planning-cycle trend; exact values are listed in the table below">
      ${grid}
      <polyline class="trend-line" points="${polyline}"></polyline>
      ${dots}
      ${xLabels}
    </svg>
    <p class="trend-note">Showing the latest ${formatNumber(points.length)} filtered cycles. Hover a point for planner, vessel and exact value.</p>
  `;
}

function shortDate(value) {
  if (!value) return "n.a.";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? cleanText(value) : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

function upgradeLegacyRecord(record) {
  if (record?.version >= 2 && Array.isArray(record.vessels) && record.planner) {
    return {
      ...record,
      vessels: record.vessels.map(vessel => ({
        ...vessel,
        plannerBreakdown: Array.isArray(vessel.plannerBreakdown)
          ? vessel.plannerBreakdown
          : (vessel.planners || []).map(row => ({
            planner: row.label || "Unassigned",
            totalMoves: row.value || 0,
            loads: 0,
            discharges: 0,
            full: 0,
            empty: 0,
            size20: 0,
            size40: 0,
            size45: 0,
            otherSize: 0,
            share: vessel.totalMoves ? (row.value || 0) / vessel.totalMoves : 0,
          })),
      })),
    };
  }
  const identity = record?.nvv?.vessel || { name: "Legacy vessel", visit: "Unknown visit" };
  const totalMoves = record?.nvv?.totalMoves || 0;
  const legacyId = "legacy-vessel";
  const shortSteaming = Boolean(record?.shortSteaming);
  const decorateRows = rows => (rows || []).map(row => ({
    ...row,
    vesselId: legacyId,
    vesselName: identity.name || "Legacy vessel",
    vesselVisit: identity.visit || "Unknown visit",
    shortSteaming,
  }));
  const legacyNvv = record?.nvv ? { ...record.nvv, rows: decorateRows(record.nvv.rows) } : null;
  const legacyRehandles = record?.rehandles ? { ...record.rehandles, rows: decorateRows(record.rehandles.rows) } : null;
  const vessel = {
    id: legacyId,
    fileName: record?.sourceFiles?.wi || "Earlier Work List",
    name: identity.name || "Legacy vessel",
    visit: identity.visit || "Unknown visit",
    shortSteaming,
    totalMoves,
    loads: record?.nvv?.totalLoads || 0,
    discharges: record?.nvv?.totalDischarges || 0,
    planners: [],
    nvv: legacyNvv,
    rehandles: legacyRehandles,
  };
  return {
    ...record,
    version: 2,
    yardAvailable: Boolean(record?.yard),
    vessels: [vessel],
    nvv: legacyNvv,
    rehandles: legacyRehandles,
    planner: {
      totalMoves,
      totalLoads: vessel.loads,
      totalDischarges: vessel.discharges,
      plannerCount: 0,
      networkMoves: vessel.shortSteaming ? 0 : totalMoves,
      shortSteamingMoves: vessel.shortSteaming ? totalMoves : 0,
      planners: [],
      vesselRows: [vessel],
      byMoveKind: [],
      byFreightKind: record?.nvv?.loadByFreightKind || [],
      byLength: record?.nvv?.loadByLength || [],
    },
  };
}

async function handleHistoryAction(event) {
  const button = event.target.closest("button[data-history-action]");
  if (!button) return;
  const records = await getHistory();
  const rawRecord = records.find(item => item.id === button.dataset.historyId);
  if (!rawRecord) return;
  if (button.dataset.historyAction === "view") {
    const record = upgradeLegacyRecord(rawRecord);
    state.analysis = record;
    state.nvvPage = 1;
    state.rehandlePage = 1;
    renderAnalysis(record);
    showToast("Saved analysis loaded.");
  } else if (confirm("Delete this saved analysis?")) {
    await withHistoryStore("readwrite", store => store.delete(rawRecord.id));
    await renderHistory();
    showToast("Saved analysis deleted.");
  }
}

async function clearHistory() {
  if (!confirm("Delete all locally saved analyses?")) return;
  await withHistoryStore("readwrite", store => store.clear());
  await renderHistory();
  showToast("Local analysis history cleared.");
}

function nvvExceptions(nvv) {
  if (Number.isFinite(nvv?.exceptionCount)) return nvv.exceptionCount;
  return (nvv?.wrong || 0) + (nvv?.missing || 0) + (nvv?.notInYard || 0);
}

function vesselLabel(vessel) {
  if (!vessel) return "Selected vessel";
  return `${vessel.name} · ${vessel.visit} · ${vessel.shortSteaming ? "Short steaming" : "Network"}`;
}

function fileStem(value) {
  return cleanText(value).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function safeName(value) {
  return cleanText(value).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "control-tower";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? cleanText(value) : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

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
