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
          nvvExceptions: nvv ? nvv.wrong + nvv.missing + nvv.notInYard : null,
          potentialRehandles: rehandles?.count ?? null,
        };
      },
    },
    {
      name: "open_control_tower_view",
      title: "Open a control tower view",
      description: "Navigate to Planner moves, NVV, Rehandles, Yard inventory, History or Rules.",
      inputSchema: {
        type: "object",
        properties: { view: { type: "string", enum: ["planner", "nvv", "rehandles", "yard", "history", "rules"] } },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const view = input?.view;
        if (!["planner", "nvv", "rehandles", "yard", "history", "rules"].includes(view)) throw new Error("Unsupported view.");
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
    elements.sourceStatus.textContent = "Planner moves need only the Work Lists. Add Yard Inventory when it is available to enable NVV and rehandle control.";
  } else if (state.yardFile) {
    elements.sourceStatus.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length === 1 ? "" : "s"} ready. Yard control will be included.`;
  } else {
    elements.sourceStatus.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length === 1 ? "" : "s"} ready. Planner moves can run without Yard Inventory.`;
  }
}

async function runAnalysis() {
  if (!elements.terminalSelect.value || !state.preparedVessels.length) return;
  setLoading(true);
  elements.sourceStatus.textContent = state.yardFile
    ? "Calculating planner moves, yard NVV and rehandle exposure…"
    : "Calculating planner and vessel moves…";
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
      ? `${formatNumber(analysis.planner.totalMoves)} planner moves and ${formatNumber(analysis.yard.total)} yard units processed.`
      : `${formatNumber(analysis.planner.totalMoves)} planner moves processed. Yard control was skipped.`;
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
  elements.batchMeta.textContent = `Planning date ${formatDate(analysis.planningDate)} · ${analysis.yardAvailable ? "Yard control included" : "Planner moves only"} · Run ${formatDateTime(analysis.createdAt)}`;
  renderPlannerWorkspace(analysis);

  if (analysis.yardAvailable) {
    elements.nvvEmpty.hidden = true;
    elements.nvvContent.hidden = false;
    elements.rehandleEmpty.hidden = true;
    elements.rehandleContent.hidden = false;
    elements.yardEmpty.hidden = true;
    elements.yardContent.hidden = false;
    populateVesselFilter(elements.nvvVesselFilter, analysis.vessels);
    populateVesselFilter(elements.rehandleVesselFilter, analysis.vessels);
    elements.nvvTabCount.textContent = formatNumber(nvvExceptions(analysis.nvv));
    elements.rehandleTabCount.textContent = formatNumber(analysis.rehandles.count);
    renderNvvWorkspace();
    renderRehandleWorkspace();
    renderYardWorkspace(analysis);
  } else {
    elements.nvvEmpty.hidden = false;
    elements.nvvContent.hidden = true;
    elements.rehandleEmpty.hidden = false;
    elements.rehandleContent.hidden = true;
    elements.yardEmpty.hidden = false;
    elements.yardContent.hidden = true;
    elements.nvvTabCount.textContent = "—";
    elements.rehandleTabCount.textContent = "—";
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
    ? `${state.analysis.vessels.length} vessels combined · Yard snapshot ${state.analysis.sourceFiles.yard || "uploaded"}`
    : vesselLabel(state.analysis.vessels.find(vessel => vessel.id === elements.nvvVesselFilter.value));
  elements.nvvKpis.innerHTML = renderKpiCards([
    { label: "Planned loads", value: summary.totalLoads, note: `${formatNumber(summary.found)} found in yard`, tone: "neutral" },
    { label: "Matched NVV", value: summary.matched, note: formatPercent(summary.matchRate), tone: "success" },
    { label: "Wrong NVV", value: summary.wrong, note: "Different outbound visit", tone: summary.wrong ? "danger" : "success" },
    { label: "Missing NVV", value: summary.missing, note: "Blank yard outbound visit", tone: summary.missing ? "warning" : "success" },
    { label: "Not in yard", value: summary.notInYard, note: formatPercent(1 - summary.coverageRate), tone: summary.notInYard ? "warning" : "success" },
  ]);
  elements.nvvScore.textContent = formatPercent(summary.matchRate);
  const distribution = [
    { label: "Matched", value: summary.matched, tone: "success" },
    { label: "Wrong NVV", value: summary.wrong, tone: "danger" },
    { label: "Missing NVV", value: summary.missing, tone: "warning" },
    { label: "Not in yard", value: summary.notInYard, tone: "neutral" },
  ];
  elements.nvvDistribution.innerHTML = distribution.map(item => `<div class="status-segment ${item.tone}"><strong>${formatNumber(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`).join("");
  renderNvvTable();
}

function renderNvvTable() {
  if (!state.analysis?.nvv) return;
  const vesselId = elements.nvvVesselFilter.value || "all";
  const query = elements.nvvSearch.value.trim().toUpperCase();
  const filter = elements.nvvFilter.value;
  const rows = state.analysis.nvv.rows.filter(row => {
    const matchesVessel = vesselId === "all" || row.vesselId === vesselId;
    const matchesQuery = !query || [row.unit, row.expectedVisit, row.actualVisit, row.vesselName, row.vesselVisit, row.yardPosition, row.wiPosition]
      .some(value => cleanText(value).toUpperCase().includes(query));
    const matchesFilter = filter === "all" || (filter === "exceptions" ? row.status !== "match" : row.status === filter);
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
      <td>${valueOrDash(row.expectedVisit)}</td>
      <td>${valueOrDash(row.actualVisit)}</td>
      <td>${valueOrDash(row.lineOp)}</td>
      <td>${valueOrDash(row.category)}</td>
      <td>${valueOrDash(row.yardPosition, row.positionStatus === "mismatch")}</td>
      <td>${valueOrDash(row.wiPosition, row.positionStatus === "mismatch")}</td>
    </tr>
  `).join("") || emptyRow(10, "No NVV rows match the current filters.");
  renderPagination(elements.nvvPagination, page, next => { state.nvvPage = next; renderNvvTable(); });
}

function renderRehandleWorkspace() {
  if (!state.analysis?.rehandles) return;
  const summary = selectedVesselSummary("rehandles");
  elements.rehandleMeta.textContent = elements.rehandleVesselFilter.value === "all"
    ? `${state.analysis.vessels.length} vessels simulated separately`
    : vesselLabel(state.analysis.vessels.find(vessel => vessel.id === elements.rehandleVesselFilter.value));
  elements.rehandleKpis.innerHTML = renderKpiCards([
    { label: "Potential rehandles", value: summary.count, note: `${formatNumber(summary.uniqueBlockers)} unique blockers`, tone: summary.count ? "warning" : "success" },
    { label: "Affected targets", value: summary.affectedTargets, note: "Planned load units", tone: summary.affectedTargets ? "warning" : "success" },
    { label: "Not planned on WI", value: summary.external, note: "External blockers", tone: summary.external ? "danger" : "success" },
    { label: "Planned later", value: summary.plannedLater, note: "Later in vessel sequence", tone: summary.plannedLater ? "warning" : "success" },
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
    const matchesFilter = filter === "all" || row.blockerStatus === filter || (filter === "later" && row.blockerStatus === "later-wi");
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
      <td>${statusBadge(row.blockerStatus)}</td>
      <td>${valueOrDash(row.targetMoveTime)}</td>
      <td>${valueOrDash(row.targetPlanner)}</td>
      <td>${valueOrDash(row.targetPow)}</td>
    </tr>
  `).join("") || emptyRow(10, "No rehandles match the current filters.");
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
    { title: "Wrong or missing NVV", value: quality.wrongOrMissingNvv, note: "Found loads needing NVV review", tone: quality.wrongOrMissingNvv ? "danger" : "" },
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
      "Expected NVV": row.expectedVisit,
      "Yard NVV": row.actualVisit,
      Line: row.lineOp,
      Category: row.category,
      "Yard Position": row.yardPosition,
      "WI Position": row.wiPosition,
      "Position Check": row.positionStatus,
    }));
  downloadCsv(rows, `${safeName(state.analysis.terminal)}-${state.analysis.planningDate}-yard-nvv.csv`);
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
      "Blocker Status": statusText(row.blockerStatus),
      "Blocker Line": row.blockerLine,
      "Blocker Category": row.blockerCategory,
      "Blocker NVV": row.blockerVisit,
      "Target Move Time": row.targetMoveTime,
      Planner: row.targetPlanner,
      "P.O.W.": row.targetPow,
    }));
  downloadCsv(rows, `${safeName(state.analysis.terminal)}-${state.analysis.planningDate}-potential-rehandles.csv`);
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

function resetCurrent() {
  state.yardFile = null;
  state.wiFiles = [];
  state.preparedVessels = [];
  state.analysis = null;
  elements.wiFile.value = "";
  elements.yardFile.value = "";
  [elements.wiDrop, elements.yardDrop].forEach(zone => zone.classList.remove("ready", "dragover"));
  elements.wiFileName.textContent = "TXT, CSV, TSV, XLS or XLSX · multiple files";
  elements.yardFileName.textContent = "Optional · enables NVV and rehandles";
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
          <td>${record.yardAvailable && record.nvv ? formatNumber(nvvExceptions(record.nvv)) : '<span class="muted-cell">No yard</span>'}</td>
          <td>${record.yardAvailable && record.rehandles ? formatNumber(record.rehandles.count) : '<span class="muted-cell">No yard</span>'}</td>
          <td><button class="text-button" type="button" data-history-action="view" data-history-id="${escapeHtml(record.id)}">View</button> <button class="text-button danger-text" type="button" data-history-action="delete" data-history-id="${escapeHtml(record.id)}">Delete</button></td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    console.warn(error);
    elements.historySummary.innerHTML = "";
    elements.historyEmpty.hidden = false;
    elements.historyEmpty.textContent = "History is unavailable in this browser.";
  }
}

function upgradeLegacyRecord(record) {
  if (record?.version === 2 && Array.isArray(record.vessels) && record.planner) return record;
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
