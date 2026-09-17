import {
  buildPlanningAnalysis,
  buildYardSnapshot,
  cleanText,
  compactHistoryRecord,
  normalizeHeader,
  normalizeWiRows,
  normalizeYardRows,
  parseDelimitedText,
  restorePlannerMoves,
  summarizeNvvRows,
} from "./engine.js";

const TERMINALS = ["MAMED","MAPTM","OMSLL","SCCT","HRRJK","NGAPP","BHKBS","LRMLW","DKAAR","ITVAD","JOAQJ","NGONN","SEGOT"];
const PAGE_SIZE = 50;
const state = {
  wiFiles: [], preparedVessels: [], yardFile: null, currentPlanning: null, currentYard: null,
  historyRecords: [], loadingPlanning: false, loadingYard: false,
  nvvPage: 1, rehandlePage: 1, yardPage: 1, yardView: "overview",
  globalFilters: { terminal: "all", planner: "all", vessel: "all" },
};

const ids = [
  "themeToggle","themeIcon","themeLabel","globalTerminal","globalPlanner","globalVessel","clearGlobalFilters",
  "terminalSelect","planningDate","wiFile","wiDrop","wiFileName","wiState","runPlanningButton","planningStatus","planningSetupStatus","vesselSetup","vesselSetupCount","vesselSetupList",
  "yardTerminalSelect","yardDate","yardFile","yardDrop","yardFileName","yardState","runYardButton","yardStatus","yardSetupStatus",
  "overviewEmpty","overviewContent","overviewTitle","overviewMeta","overviewScope","overviewNvv","overviewRehandles","overviewYard","attentionList","executiveReportButton","detailedReportButton",
  "plannerEmpty","plannerContent","plannerMeta","plannerKpis","plannerMovesChart","plannerMoveMix","plannerSizeMix","plannerTableBody","exportPlannerButton","analyticsFrom","analyticsTo","analyticsMovesTrend","analyticsShareTrend","analyticsTableBody",
  "nvvEmpty","nvvContent","nvvMeta","nvvSsBanner","nvvKpis","nvvVesselRanking","nvvScore","nvvDistribution","nvvLineChart","nvvSearch","nvvStatusFilter","nvvTableBody","nvvPagination","nvvTabCount","exportNvvButton","nvvReportButton",
  "rehandleEmpty","rehandleContent","rehandleMeta","rehandleKpis","rehandleConfidenceChart","crossPowSummary","rehandleSearch","rehandleStatusFilter","rehandleTableBody","rehandlePagination","rehandleTabCount","exportRehandleButton",
  "yardEmpty","yardContent","yardMeta","yardReportButton","yardSubtabs","yardKpis","dwellChart","lineChart","categoryChart","agingChart","lineAgingChart","blockTableBody","outboundTableBody","yardAttentionList","yardSearch","yardDwellFilter","yardTableBody","yardPagination",
  "historySummary","exportHistoryButton","importHistoryFile","compareA","compareB","compareButton","compareResult","clearHistoryButton","historyTableBody","historyEmpty",
  "printReport","toast",
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

initialize();

async function initialize() {
  const today = new Date().toISOString().slice(0,10);
  el.planningDate.value = today; el.yardDate.value = today;
  const savedTheme = localStorage.getItem("planning-excellence-theme");
  const systemDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemDark ? "dark" : "light"));
  const savedTerminal = localStorage.getItem("planning-excellence-terminal");
  if (TERMINALS.includes(savedTerminal)) { el.terminalSelect.value = savedTerminal; el.yardTerminalSelect.value = savedTerminal; }
  bindEvents();
  updateRunStates();
  await renderHistory();
  renderAll();
}

function bindEvents() {
  el.themeToggle.addEventListener("click", () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; applyTheme(next); localStorage.setItem("planning-excellence-theme", next); });
  el.terminalSelect.addEventListener("change", () => { localStorage.setItem("planning-excellence-terminal", el.terminalSelect.value); if (!el.yardTerminalSelect.value) el.yardTerminalSelect.value = el.terminalSelect.value; updateRunStates(); });
  el.yardTerminalSelect.addEventListener("change", updateRunStates);
  el.planningDate.addEventListener("change", updateRunStates); el.yardDate.addEventListener("change", updateRunStates);
  el.wiFile.addEventListener("change", event => void prepareWorkLists(event.target.files));
  el.yardFile.addEventListener("change", event => setYardFile(event.target.files?.[0]));
  configureDropZone(el.wiDrop, true, files => void prepareWorkLists(files));
  configureDropZone(el.yardDrop, false, files => setYardFile(files?.[0]));
  el.vesselSetupList.addEventListener("click", handleShortSteamingChange);
  el.runPlanningButton.addEventListener("click", runPlanningAnalysis);
  el.runYardButton.addEventListener("click", runYardAnalysis);
  document.querySelectorAll(".tab-button").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  [el.globalTerminal, el.globalPlanner, el.globalVessel].forEach(control => control.addEventListener("change", handleGlobalFilterChange));
  el.clearGlobalFilters.addEventListener("click", () => { state.globalFilters = { terminal:"all", planner:"all", vessel:"all" }; renderGlobalFilters(); renderAll(); });
  [el.nvvSearch, el.nvvStatusFilter].forEach(control => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => { state.nvvPage = 1; renderNvv(); }));
  [el.rehandleSearch, el.rehandleStatusFilter].forEach(control => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => { state.rehandlePage = 1; renderRehandles(); }));
  [el.yardSearch, el.yardDwellFilter].forEach(control => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => { state.yardPage = 1; renderYardContainerExplorer(); }));
  [el.analyticsFrom, el.analyticsTo].forEach(control => control.addEventListener("change", renderPlannerAnalytics));
  el.yardSubtabs.addEventListener("click", event => { const button = event.target.closest("[data-yard-view]"); if (!button) return; state.yardView = button.dataset.yardView; renderYardSubview(); });
  el.exportPlannerButton.addEventListener("click", exportPlanner);
  el.exportNvvButton.addEventListener("click", exportNvv);
  el.exportRehandleButton.addEventListener("click", exportRehandles);
  el.executiveReportButton.addEventListener("click", () => printReport("executive"));
  el.detailedReportButton.addEventListener("click", () => printReport("detailed"));
  el.nvvReportButton.addEventListener("click", () => printReport("nvv"));
  el.yardReportButton.addEventListener("click", () => printReport("yard"));
  el.exportHistoryButton.addEventListener("click", exportHistory);
  el.importHistoryFile.addEventListener("change", event => void importHistory(event.target.files?.[0]));
  el.compareButton.addEventListener("click", renderComparison);
  el.historyTableBody.addEventListener("click", handleHistoryAction);
  el.clearHistoryButton.addEventListener("click", clearHistory);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  el.themeIcon.textContent = dark ? "☾" : "☼"; el.themeLabel.textContent = dark ? "Light" : "Dark";
}

function configureDropZone(zone, multiple, onFiles) {
  ["dragenter","dragover"].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add("dragover"); }));
  ["dragleave","drop"].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove("dragover"); }));
  zone.addEventListener("drop", event => { const files = event.dataTransfer?.files; if (!files?.length) return; onFiles(multiple ? files : [files[0]]); });
}

async function prepareWorkLists(fileList) {
  const files = [...(fileList || [])]; if (!files.length) return;
  state.wiFiles = files; el.wiDrop.classList.add("ready"); el.wiFileName.textContent = `Reading ${files.length} file${files.length === 1 ? "" : "s"}…`; el.wiState.textContent = "Reading"; updateRunStates();
  const prior = new Map(state.preparedVessels.map(v => [v.fileName, v.shortSteaming]));
  try {
    const prepared = await Promise.all(files.map(async (file,index) => {
      const raw = await readWiFile(file); const wiRecords = normalizeWiRows(raw.rows); const moves = wiRecords.filter(r => r.unit && ["LOAD","DSCH"].includes(r.kind));
      if (!moves.length) throw new Error(`${file.name}: no valid LOAD or DSCH rows found.`);
      const identity = vesselIdentityLocal(moves, fileStem(file.name));
      return { id:`vessel-${index+1}`, fileName:file.name, fileSize:file.size, sheetName:raw.sheetName || "", wiRecords, name:identity.name, visit:identity.visit, multipleVisits:identity.multipleVisits, totalMoves:moves.length, loads:moves.filter(r=>r.kind==="LOAD").length, discharges:moves.filter(r=>r.kind==="DSCH").length, shortSteaming:prior.get(file.name) || false };
    }));
    state.preparedVessels = prepared; el.wiFileName.textContent = `${prepared.length} Work List${prepared.length===1?"":"s"} selected`; el.wiState.textContent = `${prepared.length} ready`; renderVesselSetup(); showToast(`${prepared.length} vessel${prepared.length===1?"":"s"} detected.`);
  } catch (error) {
    console.error(error); state.preparedVessels = []; el.wiDrop.classList.remove("ready"); el.wiState.textContent = "Check files"; el.planningStatus.textContent = error.message || "Work Lists could not be read."; el.vesselSetup.hidden = true;
  }
  updateRunStates();
}

function setYardFile(file) {
  state.yardFile = file || null;
  if (file) { el.yardDrop.classList.add("ready"); el.yardFileName.textContent = file.name; el.yardState.textContent = formatBytes(file.size); }
  else { el.yardDrop.classList.remove("ready"); el.yardFileName.textContent = "XLS, XLSX or CSV"; el.yardState.textContent = "Optional"; }
  updateRunStates();
}

function renderVesselSetup() {
  el.vesselSetup.hidden = !state.preparedVessels.length; el.vesselSetupCount.textContent = `${state.preparedVessels.length} vessel${state.preparedVessels.length===1?"":"s"}`;
  el.vesselSetupList.innerHTML = state.preparedVessels.map((v,index) => `<article class="vessel-setup-row"><div class="vessel-identity"><span class="vessel-index">${index+1}</span><span><strong>${escapeHtml(v.name)}</strong><small>${escapeHtml(v.visit)} · ${formatNumber(v.totalMoves)} moves${v.multipleVisits?" · check multiple visits":""}</small></span></div><div class="ss-control"><span>Short Steaming</span><div class="segmented-control" data-vessel-id="${v.id}"><button data-ss="false" type="button" class="${v.shortSteaming?"":"active"}">No</button><button data-ss="true" type="button" class="${v.shortSteaming?"active":""}">Yes</button></div></div></article>`).join("");
}

function handleShortSteamingChange(event) {
  const button = event.target.closest("button[data-ss]"); if (!button) return;
  const vessel = state.preparedVessels.find(v => v.id === button.closest("[data-vessel-id]")?.dataset.vesselId); if (!vessel) return;
  vessel.shortSteaming = button.dataset.ss === "true"; renderVesselSetup(); el.planningStatus.textContent = "Short Steaming selection changed. Analyze again to save the updated batch.";
}

function updateRunStates() {
  const planningReady = Boolean(el.terminalSelect.value && el.planningDate.value && state.preparedVessels.length && !state.loadingPlanning);
  el.runPlanningButton.disabled = !planningReady; el.planningSetupStatus.textContent = !el.terminalSelect.value ? "Select terminal" : !state.preparedVessels.length ? "Add Work Lists" : `${state.preparedVessels.length} vessel${state.preparedVessels.length===1?"":"s"} ready`;
  const yardReady = Boolean(el.yardTerminalSelect.value && el.yardDate.value && state.yardFile && !state.loadingYard);
  el.runYardButton.disabled = !yardReady; el.yardSetupStatus.textContent = !el.yardTerminalSelect.value ? "Select terminal" : !state.yardFile ? "Add snapshot" : "Ready";
}

async function runPlanningAnalysis() {
  if (el.runPlanningButton.disabled) return; state.loadingPlanning = true; updateRunStates(); el.planningStatus.textContent = "Calculating planner, NVV and POW-based rehandle controls…";
  try {
    await nextFrame();
    const analysis = buildPlanningAnalysis({ vessels:state.preparedVessels, terminal:el.terminalSelect.value, planningDate:el.planningDate.value, sourceFiles:{ wi:state.preparedVessels.map(v=>({name:v.fileName,sheetName:v.sheetName})) } });
    state.currentPlanning = analysis; await saveHistory(compactHistoryRecord(analysis)); await renderHistory(); syncGlobalFilterDefaults(analysis.terminal); renderAll(); activateTab("overview"); el.planningStatus.textContent = `${formatNumber(analysis.planner.totalMoves)} moves processed across ${analysis.vessels.length} vessels.`; showToast("Planning batch analyzed and saved.");
  } catch (error) { console.error(error); el.planningStatus.textContent = error.message || "Planning analysis failed."; showToast(el.planningStatus.textContent); }
  finally { state.loadingPlanning = false; updateRunStates(); }
}

async function runYardAnalysis() {
  if (el.runYardButton.disabled) return; state.loadingYard = true; updateRunStates(); el.yardStatus.textContent = "Reading yard inventory and building terminal-wide intelligence…";
  try {
    await nextFrame(); const raw = await readYardFile(state.yardFile); const records = normalizeYardRows(raw.rows); if (!records.length) throw new Error("No yard containers were recognized.");
    const snapshot = buildYardSnapshot({ yardRecords:records, terminal:el.yardTerminalSelect.value, planningDate:el.yardDate.value, sourceFiles:{ yard:state.yardFile.name, yardSheet:raw.sheetName } });
    state.currentYard = snapshot; await saveHistory(compactHistoryRecord(snapshot)); await renderHistory(); syncGlobalFilterDefaults(snapshot.terminal); renderAll(); activateTab("yard"); el.yardStatus.textContent = `${formatNumber(snapshot.yard.total)} yard units processed.`; showToast("Yard snapshot analyzed and saved.");
  } catch (error) { console.error(error); el.yardStatus.textContent = error.message || "Yard analysis failed."; showToast(el.yardStatus.textContent); }
  finally { state.loadingYard = false; updateRunStates(); }
}

async function readWiFile(file) { if (/\.(xlsx?|xls)$/i.test(file.name)) return readWorkbookRows(file,"wi"); const text=await file.text(); return { rows:parseDelimitedText(text,detectDelimiter(text)), sheetName:"" }; }
async function readYardFile(file) { return readWorkbookRows(file,"yard"); }
async function readWorkbookRows(file,kind) {
  if (!globalThis.XLSX) throw new Error("Spreadsheet reader did not load. Refresh and try again.");
  const workbook = globalThis.XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:false });
  const scorer = kind === "yard" ? scoreYardHeader : scoreWiHeader; const minimum = kind === "yard" ? 3 : 2; let best=null;
  const sheets=[...workbook.SheetNames].sort((a,b)=>kind==="yard"?Number(normalizeHeader(b)==="source data")-Number(normalizeHeader(a)==="source data"):0);
  for (const sheetName of sheets) { const matrix=globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:"",raw:false}); const headerIndex=findHeader(matrix,scorer,minimum); if(headerIndex<0) continue; const score=scorer(matrix[headerIndex])+(kind==="yard"&&normalizeHeader(sheetName)==="source data"?10:0); if(!best||score>best.score) best={sheetName,matrix,headerIndex,score}; }
  if(!best) throw new Error(kind==="yard"?"No Yard Inventory sheet recognized. Required columns include Unit Nbr, Outbound Visit and Position.":`${file.name}: no Work List header recognized.`);
  const headers=best.matrix[best.headerIndex].map(cleanText); const rows=best.matrix.slice(best.headerIndex+1).filter(r=>r.some(v=>cleanText(v))).map(r=>Object.fromEntries(headers.map((h,i)=>[h||`Column ${i+1}`,r[i]??""]))); return {rows,sheetName:best.sheetName};
}
function findHeader(matrix,scorer,minimum){let bestIndex=-1,bestScore=0;for(let i=0;i<Math.min(matrix.length,30);i++){const score=scorer(matrix[i]);if(score>bestScore){bestScore=score;bestIndex=i;}}return bestScore>=minimum?bestIndex:-1;}
function scoreYardHeader(row=[]){const h=row.map(normalizeHeader),groups=[["unit nbr","unit no","container no"],["o b actual visit","ob actual visit","outbound visit","nvv"],["position","yard position","current position"],["frght kind","freight kind","sts"],["category","cat"]];return groups.reduce((s,a)=>s+Number(a.some(x=>h.includes(normalizeHeader(x)))),0);}
function scoreWiHeader(row=[]){const h=row.map(normalizeHeader),groups=[["kind","move kind"],["container no","container number","unit nbr"],["planner"],["outbound carrier","outbound visit"]];return groups.reduce((s,a)=>s+Number(a.some(x=>h.includes(normalizeHeader(x)))),0);}
function detectDelimiter(text){const line=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]||"";const c=["\t",",",";"].map(d=>({d,n:line.split(d).length-1})).sort((a,b)=>b.n-a.n);return c[0].n?c[0].d:"\t";}

function renderAll() {
  renderGlobalFilters(); renderOverview(); renderPlanner(); renderNvv(); renderRehandles(); renderYard(); renderHistoryTable(); renderPlannerAnalytics();
}

function syncGlobalFilterDefaults(terminal) { if (state.globalFilters.terminal === "all" && terminal) state.globalFilters.terminal = terminal; }
function handleGlobalFilterChange() { state.globalFilters = { terminal:el.globalTerminal.value, planner:el.globalPlanner.value, vessel:el.globalVessel.value }; state.nvvPage=1; state.rehandlePage=1; state.yardPage=1; renderAll(); }
function renderGlobalFilters() {
  const planningRecords = [state.currentPlanning,...state.historyRecords.filter(r=>r.kind==="planning"||r.kind==="batch")].filter(Boolean);
  const terminals=[...new Set([...TERMINALS,...state.historyRecords.map(r=>r.terminal).filter(Boolean)])].sort();
  const planners=[...new Set(planningRecords.flatMap(r=>(r.planner?.planners||[]).map(p=>p.planner)))].sort();
  const vessels=[...new Set(planningRecords.flatMap(r=>(r.vessels||[]).map(v=>v.name)))].sort();
  setSelectOptions(el.globalTerminal,[['all','All terminals'],...terminals.map(v=>[v,v])],state.globalFilters.terminal);
  setSelectOptions(el.globalPlanner,[['all','All planners'],...planners.map(v=>[v,v])],state.globalFilters.planner);
  setSelectOptions(el.globalVessel,[['all','All vessels'],...vessels.map(v=>[v,v])],state.globalFilters.vessel);
  state.globalFilters = { terminal:el.globalTerminal.value, planner:el.globalPlanner.value, vessel:el.globalVessel.value };
}
function setSelectOptions(select,options,value){select.innerHTML=options.map(([v,l])=>`<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");select.value=[...select.options].some(o=>o.value===value)?value:"all";}
function currentPlanningMatchesTerminal(){return state.currentPlanning && (state.globalFilters.terminal==="all"||state.currentPlanning.terminal===state.globalFilters.terminal);}
function currentYardMatchesTerminal(){return state.currentYard && (state.globalFilters.terminal==="all"||state.currentYard.terminal===state.globalFilters.terminal);}
function scopedVessels() { if(!currentPlanningMatchesTerminal()) return []; return (state.currentPlanning.vessels||[]).filter(v=>(state.globalFilters.vessel==="all"||v.name===state.globalFilters.vessel)); }
function scopedMoves(){const vesselIds=new Set(scopedVessels().map(v=>v.id));return (state.currentPlanning?.planner?.moves||[]).filter(m=>vesselIds.has(m.vesselId)&&(state.globalFilters.planner==="all"||(m.planner||"Unassigned")===state.globalFilters.planner));}

function renderOverview() {
  const hasPlanning=currentPlanningMatchesTerminal(), hasYard=currentYardMatchesTerminal(); el.overviewEmpty.hidden=hasPlanning||hasYard; el.overviewContent.hidden=!(hasPlanning||hasYard); if(!(hasPlanning||hasYard)) return;
  const vessels=scopedVessels(), moves=scopedMoves(), planners=new Set(moves.map(m=>m.planner||"Unassigned")); const ss=vessels.filter(v=>v.shortSteaming).length, eligible=vessels.length-ss;
  el.overviewTitle.textContent = state.globalFilters.terminal==="all" ? "Current control tower" : `${state.globalFilters.terminal} control tower`;
  el.overviewMeta.textContent = `Filters: ${filterSummary()} · Planning and Yard remain independent data sources.`;
  el.overviewScope.innerHTML = renderKpis([
    {label:"Vessels",value:vessels.length,note:`${eligible} NVV eligible`,tone:"neutral"},{label:"Short Steaming",value:ss,note:"Excluded from combined NVV",tone:ss?"warning":"neutral"},{label:"Planners",value:planners.size,note:"Filtered WI scope",tone:"teal"},{label:"Moves",value:moves.length,note:"Filtered WI scope",tone:"blue"},{label:"Planning date",value:hasPlanning?shortDate(state.currentPlanning.planningDate):"—",note:hasPlanning?state.currentPlanning.terminal:"No planning batch",tone:"neutral"},{label:"Yard units",value:hasYard?state.currentYard.yard.total:"—",note:hasYard?`${state.currentYard.terminal} snapshot`:"No matching yard",tone:"neutral"}
  ]);
  if(hasPlanning){const nvv=scopedNvvSummary();el.overviewNvv.innerHTML=metricStack([{label:"NVV accuracy",value:formatPercent(nvv.accuracyRate)},{label:"Eligible FCL",value:formatNumber(nvv.eligibleFcl)},{label:"Exceptions",value:formatNumber(nvv.exceptionCount)},{label:"SS FCL excluded",value:formatNumber(scopedSsExcludedFcl())}]);const rh=scopedRehandleRows();el.overviewRehandles.innerHTML=metricStack([{label:"Potential rehandles",value:formatNumber(rh.length)},{label:"Probable",value:formatNumber(rh.filter(r=>r.confidence==="probable").length)},{label:"Possible",value:formatNumber(rh.filter(r=>r.confidence==="possible").length)},{label:"Cross-POW demand",value:formatNumber(scopedCrossPowRows().length)}]);}
  else { el.overviewNvv.innerHTML=emptyMini("No matching planning batch"); el.overviewRehandles.innerHTML=emptyMini("No matching planning batch"); }
  if(hasYard){const y=state.currentYard.yard;el.overviewYard.innerHTML=metricStack([{label:"Population",value:formatNumber(y.total)},{label:"Average dwell",value:`${formatNumber(y.averageDwell)} d`},{label:"15+ days",value:formatNumber(y.aged15)},{label:"31+ days",value:formatNumber(y.aged31)}]);} else el.overviewYard.innerHTML=emptyMini("No matching yard snapshot");
  renderAttention();
}
function renderAttention(){const items=[];if(currentPlanningMatchesTerminal()){const perVessel=scopedVessels().filter(v=>!v.shortSteaming).map(v=>({v,count:v.nvv?.exceptionCount||0})).sort((a,b)=>b.count-a.count);if(perVessel[0]?.count)items.push({tone:"danger",title:`${perVessel[0].v.name}: ${perVessel[0].count} NVV exceptions`,note:`${perVessel[0].v.visit} · highest current eligible vessel`});const prob=scopedRehandleRows().filter(r=>r.confidence==="probable").length;if(prob)items.push({tone:"warning",title:`${prob} probable retrieval rehandles`,note:"Same-POW stack sequence conflicts"});const cross=scopedCrossPowRows().length;if(cross)items.push({tone:"warning",title:`${cross} cross-POW stack interactions`,note:"Separate secondary control; not counted as rehandles"});}
  if(currentYardMatchesTerminal()){const y=state.currentYard.yard;if(y.aged31)items.push({tone:"warning",title:`${formatNumber(y.aged31)} units aged 31+ days`,note:`${formatNumber(y.aged91)} at 91+ days`});const hot=(y.outboundStats||[]).filter(x=>x.label!=="Unspecified").sort((a,b)=>b.aged15-a.aged15)[0];if(hot?.aged15)items.push({tone:"warning",title:`${hot.label}: ${hot.aged15} units aged 15+`,note:`${formatNumber(hot.total)} units · avg dwell ${formatNumber(hot.averageDwell)} d`});}
  if(!items.length)items.push({tone:"success",title:"No priority exception surfaced",note:"Review detailed workspaces for full diagnostics."});el.attentionList.innerHTML=items.map(attentionItem).join("");}

function renderPlanner(){const ready=currentPlanningMatchesTerminal();el.plannerEmpty.hidden=ready;el.plannerContent.hidden=!ready;if(!ready)return;const moves=scopedMoves();const rows=summarizeMovesByPlanner(moves);const vessels=scopedVessels();el.plannerMeta.textContent=`${filterSummary()} · ${vessels.length} vessel${vessels.length===1?"":"s"}`;el.plannerKpis.innerHTML=renderKpis([{label:"Moves",value:moves.length,note:"Filtered scope",tone:"neutral"},{label:"Load",value:moves.filter(m=>m.kind==="LOAD").length,note:"Moves",tone:"teal"},{label:"Discharge",value:moves.filter(m=>m.kind==="DSCH").length,note:"Moves",tone:"blue"},{label:"Planners",value:rows.length,note:"Filtered scope",tone:"neutral"},{label:"Network vessels",value:vessels.filter(v=>!v.shortSteaming).length,note:"NVV eligible",tone:"success"},{label:"SS vessels",value:vessels.filter(v=>v.shortSteaming).length,note:"Manual selection",tone:vessels.some(v=>v.shortSteaming)?"warning":"neutral"}]);renderBarList(el.plannerMovesChart,rows.map(r=>({label:r.planner,value:r.totalMoves})),14);renderBarList(el.plannerMoveMix,[{label:"Load",value:moves.filter(m=>m.kind==="LOAD").length},{label:"Discharge",value:moves.filter(m=>m.kind==="DSCH").length}]);renderBarList(el.plannerSizeMix,sizeMix(moves));el.plannerTableBody.innerHTML=rows.map(r=>`<tr><td><strong>${escapeHtml(r.planner)}</strong></td><td>${r.totalMoves}</td><td>${formatPercent(moves.length?r.totalMoves/moves.length:0)}</td><td>${r.loads}</td><td>${r.discharges}</td><td>${r.full}</td><td>${r.empty}</td><td>${r.size20}</td><td>${r.size40}</td><td>${r.size45}</td><td>${r.vesselCount}</td></tr>`).join("")||emptyRow(11,"No planner rows in this filter.");}
function summarizeMovesByPlanner(moves){const map=new Map();moves.forEach(m=>{const p=m.planner||"Unassigned";if(!map.has(p))map.set(p,{planner:p,totalMoves:0,loads:0,discharges:0,full:0,empty:0,size20:0,size40:0,size45:0,v:new Set()});const r=map.get(p);r.totalMoves++;r.loads+=m.kind==="LOAD";r.discharges+=m.kind==="DSCH";const empty=["EMPTY","MTY","M/T","EMPTIES"].includes((m.freightKind||"").toUpperCase());r.empty+=empty;r.full+=!empty;const s=String(m.length||"").replace(/\D/g,"");if(s==="20")r.size20++;else if(s==="40")r.size40++;else if(s==="45")r.size45++;r.v.add(m.vesselId);});return [...map.values()].map(r=>({...r,vesselCount:r.v.size})).sort((a,b)=>b.totalMoves-a.totalMoves);}
function sizeMix(moves){const c={"20 ft":0,"40 ft":0,"45 ft":0,"Other":0};moves.forEach(m=>{const s=String(m.length||"").replace(/\D/g,"");if(s==="20")c["20 ft"]++;else if(s==="40")c["40 ft"]++;else if(s==="45")c["45 ft"]++;else c.Other++;});return Object.entries(c).map(([label,value])=>({label,value}));}

function scopedNvvRows(includeSsDiagnostic=false){if(!currentPlanningMatchesTerminal())return[];const vesselIds=new Set(scopedVessels().filter(v=>includeSsDiagnostic||!v.shortSteaming).map(v=>v.id));return (state.currentPlanning.nvv?.rows||[]).filter(r=>vesselIds.has(r.vesselId)&&(state.globalFilters.planner==="all"||(r.planner||"Unassigned")===state.globalFilters.planner));}
function scopedNvvSummary(){const rows=scopedNvvRows(false);return summarizeNvvRows(rows,rows.length);}
function scopedSsExcludedFcl(){if(!currentPlanningMatchesTerminal())return 0;const ssIds=new Set(scopedVessels().filter(v=>v.shortSteaming).map(v=>v.id));return (state.currentPlanning.nvv?.rows||[]).filter(r=>ssIds.has(r.vesselId)&&!["excluded-empty","excluded-restow"].includes(r.status)&&(state.globalFilters.planner==="all"||(r.planner||"Unassigned")===state.globalFilters.planner)).length;}
function renderNvv(){const ready=currentPlanningMatchesTerminal();el.nvvEmpty.hidden=ready;el.nvvContent.hidden=!ready;if(!ready){el.nvvTabCount.textContent="—";return;}const selectedName=state.globalFilters.vessel;const selectedVessel=selectedName==="all"?null:state.currentPlanning.vessels.find(v=>v.name===selectedName);const diagnostic=Boolean(selectedVessel?.shortSteaming);const rows=diagnostic?scopedNvvRows(true).filter(r=>r.vesselName===selectedName):scopedNvvRows(false);const summary=summarizeNvvRows(rows,rows.length);el.nvvMeta.textContent=diagnostic?`${selectedVessel.name} · ${selectedVessel.visit} · diagnostic only`:`${filterSummary()} · Short Steaming excluded from combined KPI`;el.nvvSsBanner.hidden=!diagnostic;if(diagnostic)el.nvvSsBanner.textContent="SHORT STEAMING — diagnostic only. This vessel is excluded from the combined NVV KPI numerator and denominator.";el.nvvKpis.innerHTML=renderKpis([{label:"Eligible FCL",value:summary.eligibleFcl,note:diagnostic?"Diagnostic":"Network scope",tone:"neutral"},{label:"Valid NVV",value:summary.valid,note:formatPercent(summary.accuracyRate),tone:"success"},{label:"Missing NVV",value:summary.missingNvv,note:"Specific next vessel",tone:summary.missingNvv?"danger":"success"},{label:"Classification",value:summary.classificationIssues,note:"POD / category / outbound",tone:summary.classificationIssues?"warning":"success"},{label:"SS FCL excluded",value:diagnostic?0:scopedSsExcludedFcl(),note:"Manual SS",tone:"warning"},{label:"Accuracy",value:formatPercent(summary.accuracyRate),note:diagnostic?"Not in network KPI":"Eligible FCL",tone:"blue"}]);el.nvvScore.textContent=formatPercent(summary.accuracyRate);el.nvvDistribution.innerHTML=[['Valid import',summary.validImport,'success'],['Valid transhipment',summary.validTransship,'success'],['Valid HLC ITT',summary.validItt,'neutral'],['Exceptions',summary.exceptionCount,summary.exceptionCount?'danger':'success']].map(([l,v,t])=>`<div class="status-segment ${t}"><strong>${formatNumber(v)}</strong><span>${l}</span></div>`).join("");renderBarList(el.nvvLineChart,summary.byLine||[]);renderNvvRanking();renderNvvTable();el.nvvTabCount.textContent=formatNumber(scopedNvvSummary().exceptionCount);}
function renderNvvRanking(){const vessels=scopedVessels();const max=Math.max(1,...vessels.filter(v=>!v.shortSteaming).map(v=>v.nvv?.exceptionCount||0));el.nvvVesselRanking.innerHTML=vessels.sort((a,b)=>(b.nvv?.exceptionCount||0)-(a.nvv?.exceptionCount||0)).map(v=>{const count=v.nvv?.exceptionCount||0;return `<div class="ranking-row"><button type="button" data-vessel-rank="${escapeHtml(v.name)}">${escapeHtml(v.name)}<small class="table-subline">${escapeHtml(v.visit)}</small></button><span class="rank-track"><span class="rank-fill" style="width:${v.shortSteaming?0:Math.max(1,count/max*100)}%"></span></span><span>${v.shortSteaming?'<span class="status-badge warning">SS excluded</span>':`${formatNumber(count)} exceptions`}</span><span>${v.shortSteaming?"—":formatPercent(v.nvv?.accuracyRate||0)}</span></div>`;}).join("");el.nvvVesselRanking.querySelectorAll("[data-vessel-rank]").forEach(button=>button.addEventListener("click",()=>{state.globalFilters.vessel=button.dataset.vesselRank;renderGlobalFilters();renderAll();}));}
function renderNvvTable(){if(!currentPlanningMatchesTerminal())return;const selected=state.globalFilters.vessel;const selectedVessel=selected==="all"?null:state.currentPlanning.vessels.find(v=>v.name===selected);const diagnostic=Boolean(selectedVessel?.shortSteaming);let rows=(diagnostic?scopedNvvRows(true):scopedNvvRows(false));const q=el.nvvSearch.value.trim().toUpperCase(),filter=el.nvvStatusFilter.value,valid=new Set(["valid-import","valid-transship","valid-itt"]),excluded=new Set(["excluded-empty","excluded-restow"]);rows=rows.filter(r=>{const mq=!q||[r.unit,r.pod,r.outboundCarrier,r.lineOp,r.category,r.planner,r.vesselName,r.vesselVisit].some(v=>cleanText(v).toUpperCase().includes(q));const mf=filter==="all"||(filter==="exceptions"&&!valid.has(r.status)&&!excluded.has(r.status))||(filter==="valid"&&valid.has(r.status))||(filter==="excluded"&&excluded.has(r.status))||r.status===filter;return mq&&mf;});const page=paginate(rows,state.nvvPage);state.nvvPage=page.current;el.nvvTableBody.innerHTML=page.rows.map(r=>`<tr><td><strong>${escapeHtml(r.vesselName)}</strong><small class="table-subline">${escapeHtml(r.vesselVisit)}</small></td><td><span class="status-badge ${r.shortSteaming?'warning':''}">${r.shortSteaming?'SS':'Network'}</span></td><td><strong>${escapeHtml(r.unit)}</strong></td><td>${statusBadge(r.status)}</td><td>${valueOrDash(r.lineOp)}</td><td>${valueOrDash(r.pod)}</td><td>${valueOrDash(r.category)}</td><td>${valueOrDash(r.outboundCarrier)}</td><td>${valueOrDash(r.planner)}</td><td>${valueOrDash(r.pow)}</td><td class="explanation-cell">${escapeHtml(r.explanation)}</td></tr>`).join("")||emptyRow(11,"No NVV rows match the filters.");renderPagination(el.nvvPagination,page,n=>{state.nvvPage=n;renderNvvTable();});}

function scopedRehandleRows(){if(!currentPlanningMatchesTerminal())return[];const ids=new Set(scopedVessels().map(v=>v.id));return (state.currentPlanning.rehandles?.rows||[]).filter(r=>ids.has(r.vesselId)&&(state.globalFilters.planner==="all"||(r.targetPlanner||"Unassigned")===state.globalFilters.planner));}
function scopedCrossPowRows(){if(!currentPlanningMatchesTerminal())return[];const ids=new Set(scopedVessels().map(v=>v.id));return (state.currentPlanning.rehandles?.crossPowRows||[]).filter(r=>ids.has(r.vesselId)&&(state.globalFilters.planner==="all"||(r.targetPlanner||"Unassigned")===state.globalFilters.planner));}
function renderRehandles(){const ready=currentPlanningMatchesTerminal();el.rehandleEmpty.hidden=ready;el.rehandleContent.hidden=!ready;if(!ready){el.rehandleTabCount.textContent="—";return;}const rows=scopedRehandleRows(),cross=scopedCrossPowRows();const probable=rows.filter(r=>r.confidence==="probable").length,possible=rows.length-probable;el.rehandleMeta.textContent=`${filterSummary()} · same-POW retrieval sequence only`;el.rehandleKpis.innerHTML=renderKpis([{label:"Potential",value:rows.length,note:"Same POW",tone:rows.length?"warning":"success"},{label:"Affected targets",value:new Set(rows.map(r=>r.targetUnit)).size,note:"Unique loads",tone:"neutral"},{label:"Probable",value:probable,note:"Stronger evidence",tone:probable?"danger":"success"},{label:"Possible",value:possible,note:"Review constraints",tone:possible?"warning":"success"},{label:"Cross-POW demand",value:cross.length,note:"Not counted as rehandle",tone:cross.length?"blue":"neutral"}]);renderBarList(el.rehandleConfidenceChart,[{label:"Probable",value:probable},{label:"Possible",value:possible}]);el.crossPowSummary.innerHTML=metricStack([{label:"Interactions",value:formatNumber(cross.length)},{label:"Stacks",value:formatNumber(new Set(cross.map(r=>r.stack)).size)},{label:"Targets",value:formatNumber(new Set(cross.map(r=>r.targetUnit)).size)}]);renderRehandleTable();el.rehandleTabCount.textContent=formatNumber(rows.length);}
function renderRehandleTable(){let rows=scopedRehandleRows();const q=el.rehandleSearch.value.trim().toUpperCase(),f=el.rehandleStatusFilter.value;rows=rows.filter(r=>(!q||[r.targetUnit,r.blockerUnit,r.stack,r.targetPlanner,r.targetPow,r.vesselName].some(v=>cleanText(v).toUpperCase().includes(q)))&&(f==="all"||r.confidence===f));const page=paginate(rows,state.rehandlePage);state.rehandlePage=page.current;el.rehandleTableBody.innerHTML=page.rows.map(r=>`<tr><td><strong>${escapeHtml(r.vesselName)}</strong><small class="table-subline">${escapeHtml(r.vesselVisit)}</small></td><td>${escapeHtml(r.targetUnit)}</td><td>${escapeHtml(r.blockerUnit)}</td><td>${escapeHtml(r.stack)}</td><td>${r.blockerTier} above ${r.targetTier}</td><td>${statusBadge(r.confidence)}</td><td>${valueOrDash(r.targetMoveTime)}</td><td>${valueOrDash(r.blockerMoveTime)}</td><td>${valueOrDash(r.targetPlanner)}</td><td>${valueOrDash(r.targetPow)}</td><td class="explanation-cell">${escapeHtml(r.explanation)}</td></tr>`).join("")||emptyRow(11,"No potential rehandles match the filters.");renderPagination(el.rehandlePagination,page,n=>{state.rehandlePage=n;renderRehandleTable();});}

function renderYard(){const ready=currentYardMatchesTerminal();el.yardEmpty.hidden=ready;el.yardContent.hidden=!ready;if(!ready)return;const y=state.currentYard.yard;el.yardMeta.textContent=`${state.currentYard.terminal} · ${state.currentYard.sourceFiles?.yard||"Yard Inventory"} · latest move ${y.snapshotLatest?formatDateTime(y.snapshotLatest):"unavailable"}`;el.yardKpis.innerHTML=renderKpis([{label:"Total units",value:y.total,note:`${formatNumber(y.uniqueUnits)} unique`,tone:"neutral"},{label:"FCL",value:y.fcl,note:formatPercent(y.total?y.fcl/y.total:0),tone:"teal"},{label:"MTY",value:y.empty,note:formatPercent(y.total?y.empty/y.total:0),tone:"blue"},{label:"Avg dwell",value:`${formatNumber(y.averageDwell)} d`,note:`Median ${formatNumber(y.medianDwell)} d`,tone:"neutral"},{label:"15+ days",value:y.aged15,note:`${formatNumber(y.aged31)} at 31+`,tone:y.aged15?"warning":"success"},{label:"FCL no outbound",value:y.fclWithoutOutboundVisit,note:"Yard data completeness",tone:y.fclWithoutOutboundVisit?"danger":"success"}]);renderBarList(el.dwellChart,y.dwellBuckets.filter(x=>x.value));renderBarList(el.lineChart,y.lines);renderBarList(el.categoryChart,y.categories);renderBarList(el.agingChart,y.dwellBuckets.filter(x=>x.value));renderBarList(el.lineAgingChart,(y.lineStats||[]).map(x=>({label:x.label,value:x.aged15})));el.blockTableBody.innerHTML=(y.blockStats||[]).map(x=>`<tr><td><strong>${escapeHtml(x.label)}</strong></td><td>${x.total}</td><td>${x.fcl}</td><td>${x.empty}</td><td>${formatNumber(x.averageDwell)} d</td><td>${x.aged15}</td><td>${x.aged31}</td><td>${x.aged91}</td></tr>`).join("");el.outboundTableBody.innerHTML=(y.outboundStats||[]).filter(x=>x.label!=="Unspecified").map(x=>`<tr><td><strong>${escapeHtml(x.label)}</strong></td><td>${x.total}</td><td>${formatNumber(x.averageDwell)} d</td><td>${formatNumber(x.medianDwell)} d</td><td>${x.aged15}</td><td>${x.aged31}</td><td>${x.aged91}</td></tr>`).join("");renderYardAttention();renderYardSubview();renderYardContainerExplorer();}
function renderYardAttention(){const y=state.currentYard.yard;const items=[];const agedVisits=(y.outboundStats||[]).filter(x=>x.label!=="Unspecified"&&x.aged15>0).sort((a,b)=>b.aged15-a.aged15).slice(0,5);agedVisits.forEach(x=>items.push({tone:x.aged31?"warning":"",title:`${x.label}: ${x.aged15} aged 15+`,note:`${x.total} units · avg dwell ${formatNumber(x.averageDwell)} d · ${x.aged31} aged 31+`}));const blocks=(y.blockStats||[]).filter(x=>x.aged31>0).sort((a,b)=>b.aged31-a.aged31).slice(0,3);blocks.forEach(x=>items.push({tone:"warning",title:`Block ${x.label}: ${x.aged31} aged 31+`,note:`${x.total} units · ${x.aged15} aged 15+`}));if(y.fclWithoutOutboundVisit)items.push({tone:"danger",title:`${y.fclWithoutOutboundVisit} FCL without Outbound Visit`,note:"Yard data-completeness check; not the WI NVV KPI."});el.yardAttentionList.innerHTML=(items.length?items:[{tone:"success",title:"No yard attention item surfaced",note:"Review raw inventory for full detail."}]).map(attentionItem).join("");}
function renderYardSubview(){document.querySelectorAll(".subtab").forEach(b=>b.classList.toggle("active",b.dataset.yardView===state.yardView));document.querySelectorAll(".yard-subview").forEach(v=>v.classList.remove("active"));const target=document.getElementById(`yardView${state.yardView[0].toUpperCase()}${state.yardView.slice(1)}`);target?.classList.add("active");}
function renderYardContainerExplorer(){if(!currentYardMatchesTerminal())return;let rows=state.currentYard.yard.rows||[];const q=el.yardSearch.value.trim().toUpperCase(),d=el.yardDwellFilter.value;rows=rows.filter(r=>(!q||[r.unit,r.lineOp,r.category,r.typeIso,r.pod,r.outboundVisit,r.block,r.position].some(v=>cleanText(v).toUpperCase().includes(q)))&&(d==="all"||(Number.isFinite(r.dwell)&&r.dwell>=Number(d))));const page=paginate(rows,state.yardPage);state.yardPage=page.current;el.yardTableBody.innerHTML=page.rows.map(r=>`<tr><td><strong>${escapeHtml(r.unit)}</strong></td><td>${valueOrDash(r.lineOp)}</td><td>${valueOrDash(r.freightKind)}</td><td>${valueOrDash(r.category)}</td><td>${valueOrDash(r.typeIso)}</td><td>${valueOrDash(r.pod)}</td><td>${valueOrDash(r.outboundVisit)}</td><td>${Number.isFinite(r.dwell)?`${formatNumber(r.dwell)} d`:"—"}</td><td>${valueOrDash(r.block)}</td><td>${valueOrDash(r.position)}</td></tr>`).join("")||emptyRow(10,"No yard rows match the filters.");renderPagination(el.yardPagination,page,n=>{state.yardPage=n;renderYardContainerExplorer();});}

function renderPlannerAnalytics(){const cycles=buildPlannerCycles(state.historyRecords).filter(cycle=>matchesGlobalCycle(cycle)&&(!el.analyticsFrom.value||cycle.planningDate>=el.analyticsFrom.value)&&(!el.analyticsTo.value||cycle.planningDate<=el.analyticsTo.value));renderTrendChart(el.analyticsMovesTrend,cycles,c=>c.totalMoves,v=>formatNumber(v));renderTrendChart(el.analyticsShareTrend,cycles,c=>c.share*100,v=>`${formatNumber(v)}%`,true);el.analyticsTableBody.innerHTML=[...cycles].reverse().slice(0,200).map(c=>`<tr><td>${formatDate(c.planningDate)}</td><td><strong>${escapeHtml(c.planner)}</strong></td><td>${escapeHtml(c.terminal)}</td><td>${escapeHtml(c.vesselName)}<small class="table-subline">${escapeHtml(c.vesselVisit)}</small></td><td><span class="status-badge ${c.shortSteaming?'warning':''}">${c.shortSteaming?'SS':'Network'}</span></td><td>${c.totalMoves}</td><td>${formatPercent(c.share)}</td></tr>`).join("")||emptyRow(7,"No saved planning cycles match the filters.");}
function buildPlannerCycles(records){return records.filter(r=>r.kind==="planning"||r.kind==="batch"||r.planner).flatMap(record=>(record.vessels||[]).flatMap(v=>(v.plannerBreakdown||[]).map(row=>({planningDate:record.planningDate||"",createdAt:record.createdAt||"",terminal:record.terminal||"",vesselName:v.name||"",vesselVisit:v.visit||"",shortSteaming:Boolean(v.shortSteaming),planner:row.planner||"Unassigned",totalMoves:row.totalMoves||0,share:Number.isFinite(row.share)?row.share:(v.totalMoves?(row.totalMoves||0)/v.totalMoves:0)})))).sort((a,b)=>a.planningDate.localeCompare(b.planningDate)||a.createdAt.localeCompare(b.createdAt));}
function matchesGlobalCycle(c){return(state.globalFilters.terminal==="all"||c.terminal===state.globalFilters.terminal)&&(state.globalFilters.planner==="all"||c.planner===state.globalFilters.planner)&&(state.globalFilters.vessel==="all"||c.vesselName===state.globalFilters.vessel);}

function openHistoryDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open("yard-control-tower",2);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("runs"))request.result.createObjectStore("runs",{keyPath:"id"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function withHistoryStore(mode,callback){const db=await openHistoryDb();return new Promise((resolve,reject)=>{const tx=db.transaction("runs",mode),store=tx.objectStore("runs");let result;try{result=callback(store);}catch(e){reject(e);return;}tx.oncomplete=()=>{db.close();resolve(result?.result)};tx.onerror=()=>{db.close();reject(tx.error)};});}
function saveHistory(record){return withHistoryStore("readwrite",store=>store.put(record));}
async function getHistory(){const db=await openHistoryDb();return new Promise((resolve,reject)=>{const tx=db.transaction("runs","readonly"),req=tx.objectStore("runs").getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")));req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function renderHistory(){try{state.historyRecords=(await getHistory()).map(upgradeHistoryRecord);renderGlobalFilters();renderHistoryTable();renderPlannerAnalytics();}catch(e){console.warn(e);state.historyRecords=[];}}
function upgradeHistoryRecord(record){
  let upgraded;
  if(record?.kind) upgraded=record;
  else if(record?.version>=2&&record.planner) upgraded={...record,kind:record.yard?"batch":"planning"};
  else if(record?.yard&&!record.planner) upgraded={...record,kind:"yard"};
  else upgraded={...record,kind:"planning"};
  if((upgraded.kind==="planning"||upgraded.kind==="batch")&&upgraded.planner){
    upgraded={...upgraded,planner:{...upgraded.planner,moves:restorePlannerMoves(upgraded)}};
  }
  return upgraded;
}
function recordMatchesFilters(record){if(state.globalFilters.terminal!=="all"&&record.terminal!==state.globalFilters.terminal)return false;if(record.kind==="yard")return true;const vessels=record.vessels||[];if(state.globalFilters.vessel!=="all"&&!vessels.some(v=>v.name===state.globalFilters.vessel))return false;if(state.globalFilters.planner!=="all"&&!vessels.some(v=>(v.plannerBreakdown||[]).some(p=>p.planner===state.globalFilters.planner)))return false;return true;}
function renderHistoryTable(){const records=state.historyRecords.filter(recordMatchesFilters);const planning=records.filter(r=>r.kind==="planning"||r.kind==="batch"),yards=records.filter(r=>r.kind==="yard"||r.kind==="batch"&&r.yard);el.historySummary.innerHTML=renderKpis([{label:"Saved records",value:records.length,note:"This browser",tone:"neutral"},{label:"Planning",value:planning.length,note:"Batches",tone:"teal"},{label:"Yard",value:yards.length,note:"Snapshots",tone:"blue"},{label:"Vessels",value:planning.reduce((s,r)=>s+(r.vessels?.length||0),0),note:"Saved scope",tone:"neutral"},{label:"SS vessels",value:planning.reduce((s,r)=>s+(r.vessels||[]).filter(v=>v.shortSteaming).length,0),note:"Manual selections",tone:"warning"}]);el.historyEmpty.hidden=records.length>0;el.historyTableBody.innerHTML=records.map(r=>historyRow(r)).join("");const options=records.map(r=>[r.id,`${formatDate(r.planningDate)} · ${r.terminal} · ${r.kind}`]);setSelectOptions(el.compareA,[["","Select record A"],...options],el.compareA.value);setSelectOptions(el.compareB,[["","Select record B"],...options],el.compareB.value);}
function historyRow(r){const planning=r.kind==="planning"||r.kind==="batch";const yard=r.kind==="yard"||(r.kind==="batch"&&r.yard);let scope,headline;if(planning){scope=`${r.vessels?.length||0} vessels`;headline=`${formatNumber(r.planner?.totalMoves||0)} moves · ${formatPercent(r.nvv?.accuracyRate||0)} NVV`;}else if(yard){scope=`${formatNumber(r.yard?.total||0)} units`;headline=`${formatNumber(r.yard?.aged15||0)} aged 15+ · avg ${formatNumber(r.yard?.averageDwell)} d`;}return`<tr><td>${formatDate(r.planningDate)}</td><td><span class="status-badge">${escapeHtml(r.kind||"analysis")}</span></td><td><strong>${escapeHtml(r.terminal||"")}</strong></td><td>${escapeHtml(scope||"")}</td><td>${escapeHtml(headline||"")}</td><td>${formatDateTime(r.createdAt)}</td><td><button class="text-button" data-history-action="view" data-history-id="${r.id}">View</button><button class="text-button danger-text" data-history-action="delete" data-history-id="${r.id}">Delete</button></td></tr>`;}
async function handleHistoryAction(event){
  const b=event.target.closest("button[data-history-action]");if(!b)return;
  const record=state.historyRecords.find(r=>r.id===b.dataset.historyId);if(!record)return;
  if(b.dataset.historyAction==="view"){
    if(record.kind==="yard"){
      state.currentYard=record;
    }else{
      state.currentPlanning=record;
      state.currentYard=record.kind==="batch"&&record.yard
        ? {kind:"yard",terminal:record.terminal,planningDate:record.planningDate,createdAt:record.createdAt,sourceFiles:record.sourceFiles,yard:record.yard,quality:record.yardQuality||{}}
        : null;
    }
    state.globalFilters={terminal:record.terminal||"all",planner:"all",vessel:"all"};
    state.nvvPage=1;state.rehandlePage=1;state.yardPage=1;
    renderAll();
    activateTab(record.kind==="yard"?"yard":"planner");
    showToast(record.kind==="yard"?"Saved yard snapshot loaded.":"Saved planner performance loaded.");
  }else if(confirm("Delete this saved analysis?")){
    await withHistoryStore("readwrite",store=>store.delete(record.id));await renderHistory();renderAll();
  }
}
async function clearHistory(){if(!confirm("Delete all locally saved analyses?"))return;await withHistoryStore("readwrite",store=>store.clear());await renderHistory();renderAll();showToast("History cleared.");}
function exportHistory(){const blob=new Blob([JSON.stringify(state.historyRecords,null,2)],{type:"application/json"});downloadBlob(blob,`planning-excellence-history-${new Date().toISOString().slice(0,10)}.json`);}
async function importHistory(file){if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data))throw new Error("History file must contain an array.");for(const record of data){if(record?.id)await saveHistory(record);}await renderHistory();renderAll();showToast(`${data.length} history records imported.`);}catch(e){showToast(e.message||"History import failed.");}finally{el.importHistoryFile.value="";}}
function renderComparison(){const a=state.historyRecords.find(r=>r.id===el.compareA.value),b=state.historyRecords.find(r=>r.id===el.compareB.value);if(!a||!b){el.compareResult.innerHTML=emptyMini("Select two records.");return;}if((a.kind==="yard")!==(b.kind==="yard")){el.compareResult.innerHTML=emptyMini("Compare records of the same type: planning vs planning or yard vs yard.");return;}const metrics=a.kind==="yard"?[["Units",a.yard?.total,b.yard?.total],["Avg dwell",a.yard?.averageDwell,b.yard?.averageDwell],["15+",a.yard?.aged15,b.yard?.aged15],["31+",a.yard?.aged31,b.yard?.aged31],["91+",a.yard?.aged91,b.yard?.aged91]]:[["Vessels",a.vessels?.length,b.vessels?.length],["Moves",a.planner?.totalMoves,b.planner?.totalMoves],["NVV accuracy",(a.nvv?.accuracyRate||0)*100,(b.nvv?.accuracyRate||0)*100],["NVV exceptions",a.nvv?.exceptionCount,b.nvv?.exceptionCount],["Rehandles",a.rehandles?.count,b.rehandles?.count]];el.compareResult.innerHTML=`<div class="compare-result-grid">${metrics.map(([l,av,bv])=>{const delta=(Number(bv)||0)-(Number(av)||0);return`<div class="compare-metric"><span>${l}</span><strong>${formatNumber(bv)}</strong><small>A ${formatNumber(av)} · Δ ${delta>=0?"+":""}${formatNumber(delta)}</small></div>`;}).join("")}</div>`;}

function printReport(mode){const p=state.currentPlanning,y=state.currentYard;let html=`<div class="report-page"><p>Planning Excellence Center</p><h1>${mode==="yard"?"Yard Intelligence Report":mode==="nvv"?"NVV & Data Accuracy Report":"Executive Control Tower"}</h1><p>${escapeHtml(filterSummary())} · Generated ${formatDateTime(new Date().toISOString())}</p>`;if(p&&mode!=="yard"){const n=scopedNvvSummary();html+=`<div class="report-kpis">${reportKpi("Vessels",scopedVessels().length)}${reportKpi("Moves",scopedMoves().length)}${reportKpi("NVV accuracy",formatPercent(n.accuracyRate))}${reportKpi("NVV exceptions",n.exceptionCount)}${reportKpi("Potential rehandles",scopedRehandleRows().length)}${reportKpi("SS FCL excluded",scopedSsExcludedFcl())}</div>`;}if(y&&mode!=="nvv"){html+=`<h2>Yard snapshot</h2><div class="report-kpis">${reportKpi("Yard units",y.yard.total)}${reportKpi("Average dwell",`${formatNumber(y.yard.averageDwell)} d`)}${reportKpi("15+",y.yard.aged15)}${reportKpi("31+",y.yard.aged31)}</div>`;}html+=`</div>`;if((mode==="detailed"||mode==="nvv")&&p){const rows=scopedNvvRows(state.globalFilters.vessel!=="all"&&scopedVessels()[0]?.shortSteaming).filter(r=>!["valid-import","valid-transship","valid-itt","excluded-empty","excluded-restow"].includes(r.status));html+=`<div class="report-page"><h1>NVV Exceptions</h1><table><thead><tr><th>Vessel</th><th>Container</th><th>Status</th><th>Line</th><th>POD</th><th>Category</th><th>Outbound</th><th>Planner</th><th>Reason</th></tr></thead><tbody>${rows.slice(0,500).map(r=>`<tr><td>${escapeHtml(r.vesselName)}</td><td>${escapeHtml(r.unit)}</td><td>${escapeHtml(statusText(r.status))}</td><td>${escapeHtml(r.lineOp)}</td><td>${escapeHtml(r.pod)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.outboundCarrier)}</td><td>${escapeHtml(r.planner)}</td><td>${escapeHtml(r.explanation)}</td></tr>`).join("")}</tbody></table></div>`;}if((mode==="detailed"||mode==="yard")&&y){html+=`<div class="report-page"><h1>Yard Outbound Attention</h1><table><thead><tr><th>Visit</th><th>Units</th><th>Avg dwell</th><th>15+</th><th>31+</th><th>91+</th></tr></thead><tbody>${(y.yard.outboundStats||[]).filter(x=>x.label!=="Unspecified").slice(0,80).map(x=>`<tr><td>${escapeHtml(x.label)}</td><td>${x.total}</td><td>${formatNumber(x.averageDwell)}</td><td>${x.aged15}</td><td>${x.aged31}</td><td>${x.aged91}</td></tr>`).join("")}</tbody></table></div>`;}el.printReport.innerHTML=html;setTimeout(()=>window.print(),30);}
function reportKpi(label,value){return`<div class="report-kpi"><span>${label}</span><strong>${value}</strong></div>`;}

function exportPlanner(){downloadCsv(summarizeMovesByPlanner(scopedMoves()).map(r=>({Planner:r.planner,Moves:r.totalMoves,Load:r.loads,Discharge:r.discharges,FCL:r.full,MTY:r.empty,Vessels:r.vesselCount})),`planner-${safeName(filterSummary())}.csv`);}
function exportNvv(){downloadCsv(scopedNvvRows(true).map(r=>({Vessel:r.vesselName,Visit:r.vesselVisit,Type:r.shortSteaming?"Short Steaming":"Network",Container:r.unit,Status:statusText(r.status),Line:r.lineOp,POD:r.pod,Category:r.category,Outbound:r.outboundCarrier,Planner:r.planner,POW:r.pow,Reason:r.explanation})),`nvv-${safeName(filterSummary())}.csv`);}
function exportRehandles(){downloadCsv(scopedRehandleRows().map(r=>({Vessel:r.vesselName,Target:r.targetUnit,Blocker:r.blockerUnit,Stack:r.stack,TargetTier:r.targetTier,BlockerTier:r.blockerTier,Confidence:r.confidence,TargetTime:r.targetMoveTime,BlockerTime:r.blockerMoveTime,Planner:r.targetPlanner,POW:r.targetPow,Evidence:r.explanation})),`rehandles-${safeName(filterSummary())}.csv`);}
function downloadCsv(rows,filename){if(!rows.length)return showToast("No rows to export.");const headers=Object.keys(rows[0]),csv=[headers,...rows.map(r=>headers.map(h=>r[h]))].map(row=>row.map(csvCell).join(",")).join("\r\n");downloadBlob(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}),filename);}
function csvCell(value){let text=cleanText(value);if(/^[=+\-@]/.test(text))text=`'${text}`;return`"${text.replace(/"/g,'""')}"`;}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}

function activateTab(tab){document.querySelectorAll(".tab-button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("active",p.dataset.panel===tab));if(tab==="history")renderHistoryTable();}
function renderKpis(cards){return cards.map(c=>`<article class="kpi-card ${c.tone||"neutral"}"><span class="kpi-label">${escapeHtml(c.label)}</span><strong class="kpi-value">${typeof c.value==="number"?formatNumber(c.value):escapeHtml(c.value)}</strong><span class="kpi-note">${escapeHtml(c.note||"")}</span></article>`).join("");}
function renderBarList(container,items=[],limit=12){const visible=items.slice(0,limit),max=Math.max(1,...visible.map(i=>i.value||0));container.innerHTML=visible.map(i=>`<div class="bar-row"><span class="bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(1,(i.value/max)*100)}%"></span></span><span class="bar-value">${formatNumber(i.value)}</span></div>`).join("")||'<p class="muted-cell">No data available.</p>';}
function metricStack(items){return`<div class="metric-stack">${items.map(i=>`<div class="metric-line"><span>${escapeHtml(i.label)}</span><strong>${escapeHtml(i.value)}</strong></div>`).join("")}</div>`;}
function attentionItem(i){return`<div class="attention-item ${i.tone||""}"><span class="attention-marker"></span><div><strong>${escapeHtml(i.title)}</strong><p>${escapeHtml(i.note||"")}</p></div></div>`;}
function emptyMini(text){return`<p class="muted-cell">${escapeHtml(text)}</p>`;}
function statusBadge(status){const map={"valid-import":["Valid import","success"],"valid-transship":["Valid transhipment","success"],"valid-itt":["Valid HLC ITT","success"],"missing-nvv":["Missing NVV","danger"],"category-mismatch":["Category mismatch","warning"],"outbound-mismatch":["Outbound mismatch","warning"],"missing-pod":["Missing POD","danger"],"excluded-empty":["Excluded MTY",""],"excluded-restow":["Excluded restow",""],probable:["Probable","warning"],possible:["Possible",""]};const [l,t]=map[status]||[status,""];return`<span class="status-badge ${t}">${escapeHtml(l)}</span>`;}
function statusText(status){return ({"valid-import":"Valid import","valid-transship":"Valid transhipment","valid-itt":"Valid HLC ITT","missing-nvv":"Missing NVV","category-mismatch":"Category mismatch","outbound-mismatch":"Outbound mismatch","missing-pod":"Missing POD","excluded-empty":"Excluded MTY","excluded-restow":"Excluded restow",probable:"Probable",possible:"Possible"})[status]||status;}
function valueOrDash(v){return v?escapeHtml(v):'<span class="muted-cell">—</span>';}
function emptyRow(cols,msg){return`<tr><td colspan="${cols}" class="muted-cell">${escapeHtml(msg)}</td></tr>`;}
function paginate(rows,page){const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.min(Math.max(1,page),totalPages),start=(current-1)*PAGE_SIZE;return{rows:rows.slice(start,start+PAGE_SIZE),total:rows.length,totalPages,current,start};}
function renderPagination(container,page,onChange){container.replaceChildren();const s=document.createElement("span");s.textContent=`${page.total?page.start+1:0}–${Math.min(page.start+PAGE_SIZE,page.total)} of ${page.total}`;const prev=document.createElement("button"),next=document.createElement("button");prev.textContent="‹";next.textContent="›";prev.disabled=page.current<=1;next.disabled=page.current>=page.totalPages;prev.onclick=()=>onChange(page.current-1);next.onclick=()=>onChange(page.current+1);container.append(s,prev,next);}
function renderTrendChart(container,points,valueAccessor,formatter,percentScale=false){const p=points.slice(-30);if(!p.length){container.innerHTML=emptyMini("No saved cycles match the filters.");return;}const width=760,height=250,left=48,right=18,top=18,bottom=42,pw=width-left-right,ph=height-top-bottom,values=p.map(valueAccessor),observed=Math.max(1,...values),maximum=percentScale?100:Math.ceil(observed/10)*10,x=i=>p.length===1?left+pw/2:left+(i/(p.length-1))*pw,y=v=>top+ph-(Math.max(0,v)/maximum)*ph;const grid=[0,.25,.5,.75,1].map(r=>{const yy=top+ph-r*ph;return`<line class="trend-grid-line" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"></line><text class="trend-axis-label" x="${left-8}" y="${yy+4}" text-anchor="end">${formatter(maximum*r)}</text>`}).join("");const line=p.map((pt,i)=>`${x(i)},${y(valueAccessor(pt))}`).join(" ");const dots=p.map((pt,i)=>`<circle class="trend-dot" cx="${x(i)}" cy="${y(valueAccessor(pt))}" r="4"><title>${escapeHtml(`${formatDate(pt.planningDate)} · ${pt.planner} · ${pt.vesselName}: ${formatter(valueAccessor(pt))}`)}</title></circle>`).join("");container.innerHTML=`<svg class="trend-chart" viewBox="0 0 ${width} ${height}">${grid}<polyline class="trend-line" points="${line}"></polyline>${dots}</svg><p class="trend-note">Latest ${p.length} filtered cycles. Hover points for exact values.</p>`;}
function filterSummary(){return `${state.globalFilters.terminal==="all"?"All terminals":state.globalFilters.terminal} · ${state.globalFilters.planner==="all"?"All planners":state.globalFilters.planner} · ${state.globalFilters.vessel==="all"?"All vessels":state.globalFilters.vessel}`;}
function vesselIdentityLocal(records,fallback){const counts=a=>{const m=new Map();records.forEach(r=>{const v=cleanText(r[a]);if(v)m.set(v,(m.get(v)||0)+1)});return[...m.entries()].sort((x,y)=>y[1]-x[1]);};const visits=counts("outboundCarrier"),names=counts("outboundCarrierName");return{visit:visits[0]?.[0]||"Unknown visit",name:names[0]?.[0]||fallback||"Unknown vessel",multipleVisits:visits.length>1};}
function fileStem(v){return cleanText(v).replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim();}
function safeName(v){return cleanText(v).replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-|-$/g,"")||"control-tower";}
function formatNumber(v){return new Intl.NumberFormat("en-GB",{maximumFractionDigits:1}).format(Number(v)||0);}
function formatPercent(v){return new Intl.NumberFormat("en-GB",{style:"percent",maximumFractionDigits:1}).format(Number(v)||0);}
function formatBytes(b){return b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:`${(b/1024/1024).toFixed(1)} MB`;}
function formatDate(v){if(!v)return"Date unavailable";const d=new Date(String(v).length===10?`${v}T00:00:00`:v);return Number.isNaN(d.getTime())?cleanText(v):new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(d);}
function shortDate(v){if(!v)return"—";const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?cleanText(v):new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short"}).format(d);}
function formatDateTime(v){const d=new Date(v);return Number.isNaN(d.getTime())?"":new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d);}
function escapeHtml(v){return cleanText(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
function nextFrame(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
let toastTimer;function showToast(message){clearTimeout(toastTimer);el.toast.textContent=message;el.toast.classList.add("show");toastTimer=setTimeout(()=>el.toast.classList.remove("show"),3600);}
