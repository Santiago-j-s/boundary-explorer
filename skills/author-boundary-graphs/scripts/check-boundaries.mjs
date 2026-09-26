#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const kinds = new Set(["imports", "calls", "reads", "writes", "references"]);
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && !!value.trim();
const positive = value => Number.isInteger(value) && value > 0;

export function inspectGraph(graph) {
  if (!object(graph) || !nonempty(graph.name) || !Array.isArray(graph.modules) || !Array.isArray(graph.functions) || !Array.isArray(graph.relations))
    fail("Expected name, modules, functions, and relations arrays.");
  if (graph.modules.length < 1 || graph.modules.length > 30 || graph.functions.length > 150 || graph.relations.length > 400)
    fail("Graph exceeds the explorer limit (1–30 modules, 150 functions, 400 relations).");
  const ids = new Set(), modules = new Map(), functions = new Map(), relationIds = new Set();
  graph.modules.forEach((m, i) => {
    if (!object(m) || !nonempty(m.id) || !nonempty(m.path) || !nonempty(m.layer) || ids.has(m.id)) fail(`Invalid or duplicate modules[${i}].`);
    ids.add(m.id); modules.set(m.id, m);
  });
  graph.functions.forEach((f, i) => {
    if (!object(f) || !nonempty(f.id) || ids.has(f.id) || !modules.has(f.module) || !nonempty(f.name) || !positive(f.line)) fail(`Invalid or duplicate functions[${i}].`);
    ids.add(f.id); functions.set(f.id, f);
  });
  graph.relations.forEach((r, i) => {
    if (!object(r) || !nonempty(r.id) || relationIds.has(r.id) || !ids.has(r.from) || !ids.has(r.to) || !kinds.has(r.kind)
      || !object(r.source) || !nonempty(r.source.file) || !positive(r.source.line) || !nonempty(r.source.excerpt))
      fail(`Invalid or duplicate relations[${i}].`);
    relationIds.add(r.id);
  });
  if (graph.rules !== undefined && !Array.isArray(graph.rules)) fail("rules must be an array.");
  const ruleIds = new Set();
  const validSelector = s => object(s) && (s.module !== undefined || s.layer !== undefined)
    && (s.module === undefined || modules.has(s.module)) && (s.layer === undefined || nonempty(s.layer));
  const moduleOf = id => modules.has(id) ? id : functions.get(id)?.module;
  const matches = (id, selector) => {
    const m = modules.get(moduleOf(id));
    return (selector.module === undefined || m.id === selector.module) && (selector.layer === undefined || m.layer === selector.layer);
  };
  const findings = (graph.rules || []).map((rule, i) => {
    if (!object(rule) || !nonempty(rule.id) || ruleIds.has(rule.id) || !nonempty(rule.description) || !object(rule.deny)
      || !validSelector(rule.deny.from) || !validSelector(rule.deny.to)
      || (rule.deny.kinds !== undefined && (!Array.isArray(rule.deny.kinds) || !rule.deny.kinds.length || rule.deny.kinds.some(k => !kinds.has(k)))))
      fail(`Invalid or duplicate rules[${i}].`);
    ruleIds.add(rule.id);
    return { rule: { id: rule.id, description: rule.description }, relations: graph.relations.filter(r =>
      matches(r.from, rule.deny.from) && matches(r.to, rule.deny.to) && (!rule.deny.kinds || rule.deny.kinds.includes(r.kind))) };
  });
  return { findings, modules: graph.modules.length, functions: graph.functions.length, relations: graph.relations.length };
}

export async function checkEvidence(graph, root) {
  const rootPath = await realpath(root);
  const stale = [];
  for (const relation of graph.relations) {
    const file = relation.source.file;
    const target = resolve(rootPath, file);
    if (isAbsolute(file) || relative(rootPath, target) === ".." || relative(rootPath, target).startsWith(`..${sep}`) || target === rootPath) {
      stale.push({ id: relation.id, source: relation.source, reason: "Source path must be relative to the repository root." }); continue;
    }
    try {
      const actual = await realpath(target);
      if (relative(rootPath, actual) === ".." || relative(rootPath, actual).startsWith(`..${sep}`)) throw new Error("Source path leaves the repository root.");
      const line = (await readFile(actual, "utf8")).split(/\r?\n/)[relation.source.line - 1];
      if (line === undefined || !line.includes(relation.source.excerpt.trim()) || !relation.source.excerpt.trim()) throw new Error("Excerpt does not occur at the recorded line.");
    } catch (error) { stale.push({ id: relation.id, source: relation.source, reason: error.message }); }
  }
  return stale;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const rootIndex = args.indexOf("--root");
  const file = args.find(arg => !arg.startsWith("--") && (rootIndex < 0 || arg !== args[rootIndex + 1]));
  if (!file || (rootIndex >= 0 && !args[rootIndex + 1])) fail("Usage: node check-boundaries.mjs graph.json [--root repo-path] [--json]");
  const graph = JSON.parse(await readFile(file, "utf8"));
  const result = inspectGraph(graph);
  const stale = rootIndex < 0 ? [] : await checkEvidence(graph, args[rootIndex + 1]);
  const matches = result.findings.flatMap(f => f.relations.map(r => ({ rule: f.rule.id, description: f.rule.description, relation: r.id, from: r.from, to: r.to, kind: r.kind, source: r.source })));
  const report = { name: graph.name, counts: { modules: result.modules, functions: result.functions, relations: result.relations, rules: result.findings.length, matches: matches.length }, evidence: rootIndex < 0 ? "not checked against source" : stale.length ? "stale" : "checked against source", matches, stale };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${graph.name}: ${result.modules} modules, ${result.functions} functions, ${result.relations} observations, ${result.findings.length} rules`);
    for (const match of matches) console.log(`RULE ${match.rule}: ${match.source.file}:${match.source.line} ${match.from} → ${match.to} (${match.kind}) — ${match.description}`);
    for (const item of stale) console.log(`STALE ${item.id}: ${item.source.file}:${item.source.line} — ${item.reason}`);
    console.log(`${matches.length} rule match(es); evidence ${report.evidence}. Zero matches only covers these supplied observations.`);
  }
  process.exitCode = stale.length ? 2 : matches.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Invalid graph: ${error.message}`); process.exitCode = 2; });
}
