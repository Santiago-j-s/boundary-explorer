export type Module = { id: string; path: string; layer: string; summary?: string };
export type FunctionNode = { id: string; module: string; name: string; line: number; summary?: string };
export type Relation = { id: string; from: string; to: string; kind: "imports" | "calls" | "reads" | "writes" | "references"; source: { file: string; line: number; excerpt: string }; note?: string };
export type Selector = { module?: string; layer?: string };
export type BoundaryRule = { id: string; description: string; deny: { from: Selector; to: Selector; kinds?: Relation["kind"][] } };
export type Graph = { name: string; modules: Module[]; functions: FunctionNode[]; relations: Relation[]; rules?: BoundaryRule[] };
export type ModuleLink = { from: string; to: string; relations: Relation[] };

export const kinds: Relation["kind"][] = ["imports", "calls", "reads", "writes", "references"];

export function moduleOf(graph: Graph, id: string) {
  return graph.modules.some(m => m.id === id) ? id : graph.functions.find(f => f.id === id)?.module;
}

export function moduleLinks(graph: Graph): ModuleLink[] {
  const links = new Map<string, ModuleLink>();
  for (const relation of graph.relations) {
    const from = moduleOf(graph, relation.from), to = moduleOf(graph, relation.to);
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    if (!links.has(key)) links.set(key, { from, to, relations: [] });
    links.get(key)!.relations.push(relation);
  }
  return [...links.values()];
}

export function parseGraph(input: string): Graph {
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error("Invalid JSON. Check commas and quotation marks."); }
  if (!value || typeof value !== "object") throw new Error("Expected a graph object.");
  const g = value as Partial<Graph>;
  if (typeof g.name !== "string" || !Array.isArray(g.modules) || !Array.isArray(g.functions) || !Array.isArray(g.relations))
    throw new Error("Expected name, modules, functions, and relations arrays.");
  if (!g.modules.length || g.modules.length > 30 || g.functions.length > 150 || g.relations.length > 400)
    throw new Error("This prototype accepts 1–30 modules, up to 150 functions, and up to 400 relations.");
  const ids = new Set<string>();
  for (const [i, m] of g.modules.entries()) {
    if (!m || typeof m.id !== "string" || !m.id || typeof m.path !== "string" || !m.path || typeof m.layer !== "string" || !m.layer) throw new Error(`modules[${i}] needs id, path, and layer strings.`);
    if (ids.has(m.id)) throw new Error(`Duplicate entity id: ${m.id}`);
    ids.add(m.id);
  }
  const modules = new Set(g.modules.map(m => m.id));
  for (const [i, f] of g.functions.entries()) {
    if (!f || typeof f.id !== "string" || !f.id || typeof f.name !== "string" || !f.name || !modules.has(f.module) || !Number.isInteger(f.line) || f.line < 1)
      throw new Error(`functions[${i}] needs a unique id, name, valid module id, and positive line.`);
    if (ids.has(f.id)) throw new Error(`Duplicate entity id: ${f.id}`);
    ids.add(f.id);
  }
  const relationIds = new Set<string>();
  for (const [i, r] of g.relations.entries()) {
    if (!r || typeof r.id !== "string" || !r.id || relationIds.has(r.id) || !ids.has(r.from) || !ids.has(r.to) || !kinds.includes(r.kind) || !r.source || typeof r.source.file !== "string" || !r.source.file || !Number.isInteger(r.source.line) || r.source.line < 1 || typeof r.source.excerpt !== "string" || !r.source.excerpt.trim())
      throw new Error(`relations[${i}] needs a unique id, known endpoints, kind, and source { file, line, excerpt }.`);
    relationIds.add(r.id);
  }
  if (g.rules !== undefined && !Array.isArray(g.rules)) throw new Error("rules must be an array when provided.");
  const ruleIds = new Set<string>();
  for (const [i, rule] of (g.rules || []).entries()) {
    const validSelector = (selector: Selector | undefined) => selector && typeof selector === "object" && !Array.isArray(selector)
      && (selector.module !== undefined || selector.layer !== undefined)
      && (selector.module === undefined || (typeof selector.module === "string" && modules.has(selector.module)))
      && (selector.layer === undefined || (typeof selector.layer === "string" && !!selector.layer.trim()));
    if (!rule || typeof rule.id !== "string" || !rule.id || ruleIds.has(rule.id) || typeof rule.description !== "string" || !rule.description
      || !rule.deny || !validSelector(rule.deny.from) || !validSelector(rule.deny.to)
      || (rule.deny.kinds !== undefined && (!Array.isArray(rule.deny.kinds) || !rule.deny.kinds.length || rule.deny.kinds.some(kind => !kinds.includes(kind)))))
      throw new Error(`rules[${i}] needs a unique id, description, and deny { from, to, optional kinds }. Selectors need a known module id or layer.`);
    ruleIds.add(rule.id);
  }
  return g as Graph;
}

export type RuleFinding = { rule: BoundaryRule; relations: Relation[] };
export function ruleFindings(graph: Graph): RuleFinding[] {
  const byId = new Map(graph.modules.map(m => [m.id, m]));
  const matches = (id: string, selector: Selector) => {
    const m = byId.get(moduleOf(graph, id) || "");
    return !!m && (selector.module === undefined || m.id === selector.module) && (selector.layer === undefined || m.layer === selector.layer);
  };
  return (graph.rules || []).map(rule => ({ rule, relations: graph.relations.filter(r =>
    matches(r.from, rule.deny.from) && matches(r.to, rule.deny.to) && (!rule.deny.kinds || rule.deny.kinds.includes(r.kind))) }));
}

export type Candidate = { key: string; title: string; detail: string; moduleId: string; relationIds: string[]; level: "strong" | "review" };
export function candidates(graph: Graph): Candidate[] {
  const links = moduleLinks(graph);
  const byId = new Map(graph.modules.map(m => [m.id, m]));
  const result: Candidate[] = [];
  for (const l of links) {
    const from = byId.get(l.from)!, to = byId.get(l.to)!;
    if (from.layer.toLowerCase() === "domain" && to.layer.toLowerCase() === "ui") {
      result.push({ key: `direction:${l.from}:${l.to}`, title: "Domain → UI dependency", detail: `${from.path} reaches into ${to.path}. Inspect the call sites before moving behavior.`, moduleId: l.from, relationIds: l.relations.map(r => r.id), level: "strong" });
    }
  }
  const seen = new Set<string>();
  for (const l of links) {
    const reverse = links.find(other => other.from === l.to && other.to === l.from);
    const key = [l.from, l.to].sort().join("|");
    if (!reverse || seen.has(key)) continue;
    seen.add(key);
    result.push({ key: `cycle:${key}`, title: "Two-way module dependency", detail: `${byId.get(l.from)!.path} and ${byId.get(l.to)!.path} depend on each other. Trace both directions.`, moduleId: l.from, relationIds: [...l.relations, ...reverse.relations].map(r => r.id), level: "strong" });
  }
  for (const m of graph.modules) {
    const outgoing = links.filter(l => l.from === m.id);
    if (outgoing.length >= 3) result.push({ key: `fanout:${m.id}`, title: "Wide outgoing boundary", detail: `${m.path} reaches ${outgoing.length} other modules. Check whether those dependencies belong to one responsibility.`, moduleId: m.id, relationIds: outgoing.flatMap(l => l.relations.map(r => r.id)), level: "review" });
  }
  return result.slice(0, 8);
}
