import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "dist/index.html");
const html = await readFile(htmlPath, "utf8");

test("all relative page assets exist", async () => {
  const references = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)[^" ]*"/g)].map(match => match[1]);
  assert.ok(references.length >= 2);
  await Promise.all(references.map(reference => access(resolve(root, "dist", reference))));
});

test("every navigation tab has a matching panel", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  const panels = new Set([...html.matchAll(/data-panel="([^"]+)"/g)].map(match => match[1]));
  tabs.forEach(tab => assert.ok(panels.has(tab), `Missing panel for ${tab}`));
});

test("the source inputs are explicitly labelled", () => {
  assert.match(html, /for="yardFile"/);
  assert.match(html, /for="wiFile"/);
});

test("work lists support batch upload while yard inventory stays optional", () => {
  assert.match(html, /id="wiFile"[^>]*multiple/);
  assert.match(html, /id="yardFile"[^>]*>/);
  assert.doesNotMatch(html, /id="yardFile"[^>]*required/);
  assert.match(html, /Optional · adds yard inventory cross-checks/);
  assert.match(html, /Work Lists calculate planner moves, NVV and potential rehandles/);
});

test("planner, analytics, NVV, rehandles, yard, and history have separate workspaces", () => {
  for (const workspace of ["planner", "analytics", "nvv", "rehandles", "yard", "history"]) {
    assert.match(html, new RegExp(`data-panel="${workspace}"`));
  }
});

test("planner analytics includes cycle filters, trend graphs, and detail table", () => {
  for (const id of ["analyticsPlanner", "analyticsTerminal", "analyticsFrom", "analyticsTo", "analyticsMovesTrend", "analyticsShareTrend", "analyticsTableBody"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
