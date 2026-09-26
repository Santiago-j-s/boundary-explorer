"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ChevronRight, Download, FileJson2, Focus, GitBranch, Layers3, Search, Upload, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { sample } from "@/lib/sample";
import { candidates, kinds, moduleLinks, moduleOf, parseGraph, ruleFindings, type FunctionNode, type Graph, type Module, type Relation } from "@/lib/graph";

type Mode = "modules" | "functions";
type Link = { from: string; to: string; relations: Relation[] };
type VisualNode = { id: string; label: string; sub: string; x: number; y: number; layer: string };
const palette: Record<string, string> = { UI: "#b0a4ea", Domain: "#ebbb79", State: "#7dc8bc", Infrastructure: "#8baed5" };
const short = (s: string) => s.split("/").at(-1) || s;
const label = (g: Graph, id: string) => g.functions.find(f => f.id === id)?.name || short(g.modules.find(m => m.id === id)?.path || id);

function layoutModules(modules: Module[]): { nodes: VisualNode[]; height: number } {
  const layers = [...new Set(modules.map(m => m.layer))];
  const height = Math.max(580, 155 + Math.max(...layers.map(l => modules.filter(m => m.layer === l).length)) * 205);
  return { height, nodes: layers.flatMap((layer, col) => modules.filter(m => m.layer === layer).map((m, row) => ({ id: m.id, label: short(m.path), sub: m.path, x: 115 + col * 670 / Math.max(1, layers.length - 1), y: 170 + row * 205, layer }))) };
}

function layoutFunctions(g: Graph, moduleId: string, relations: Relation[]): { nodes: VisualNode[]; links: Link[]; height: number } {
  const own = g.functions.filter(f => f.module === moduleId);
  const local = new Set(own.map(f => f.id));
  const incoming = [...new Set(relations.filter(r => local.has(r.to) && !local.has(r.from)).map(r => r.from))].filter(id => g.functions.some(f => f.id === id)).slice(0, 8);
  const outgoing = [...new Set(relations.filter(r => local.has(r.from) && !local.has(r.to)).map(r => r.to))].filter(id => g.functions.some(f => f.id === id) && !incoming.includes(id)).slice(0, 8);
  const height = Math.max(580, 160 + Math.max(own.length, incoming.length, outgoing.length) * 82);
  const node = (id: string, x: number, y: number): VisualNode => { const f = g.functions.find(f => f.id === id)!; const m = g.modules.find(m => m.id === f.module)!; return { id, label: f.name, sub: `${short(m.path)}:${f.line}`, x, y, layer: m.layer }; };
  const rowY = (i: number, count: number) => 155 + i * 82 + Math.max(0, (height - 155 - count * 82) / 2);
  const nodes = [...incoming.map((id, i) => node(id, 120, rowY(i, incoming.length))), ...own.map((f, i) => node(f.id, 450, rowY(i, own.length))), ...outgoing.map((id, i) => node(id, 780, rowY(i, outgoing.length)))];
  const ids = new Set(nodes.map(n => n.id));
  return { height, nodes, links: relations.filter(r => (local.has(r.from) || local.has(r.to)) && ids.has(r.from) && ids.has(r.to) && g.functions.some(f => f.id === r.from) && g.functions.some(f => f.id === r.to)).map(r => ({ from: r.from, to: r.to, relations: [r] })) };
}

function Canvas({ nodes, links, height, mode, selectedNode, selectedLink, onNode, onLink, focus, violations }: { nodes: VisualNode[]; links: Link[]; height: number; mode: Mode; selectedNode: string | null; selectedLink: string | null; onNode: (id: string) => void; onLink: (key: string) => void; focus: boolean; violations: Set<string> }) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const keydown = (e: KeyboardEvent<SVGGElement>, cb: () => void) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cb(); } };
  return <div className="graph-scroll"><svg viewBox={`0 0 900 ${height}`} className="graph-svg" role="img" aria-label="Directed dependencies. Select nodes or connections to inspect source evidence.">
    <defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#293a4a" /></pattern><marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="context-stroke" strokeWidth="1.8" /></marker></defs>
    <rect width="900" height={height} fill="url(#dots)" />
    {mode === "modules" ? [...new Set(nodes.map(n => n.layer))].map(layer => { const x = nodes.find(n => n.layer === layer)!.x; return <g key={layer}><text x={x} y="55" textAnchor="middle" className="lane-title">{layer.toUpperCase()}</text><line x1={x} x2={x} y1="75" y2={height - 35} stroke="#223344" strokeDasharray="3 8" /></g>; }) : [[120, "CALLERS"], [450, "SELECTED MODULE"], [780, "CALLEES"]].map(([x, name]) => <text key={name} x={x} y="55" textAnchor="middle" className="lane-title">{name}</text>)}
    {links.map((l, i) => { const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) return null; const backwards = a.x > b.x, same = a.x === b.x; const sx = a.x + (same ? 55 : backwards ? -94 : 94), tx = b.x + (same ? 55 : backwards ? 94 : -94); const bend = Math.max(60, Math.abs(tx - sx) * .45); const path = same ? `M${sx} ${a.y} C${sx + 115 + i % 3 * 15} ${a.y},${tx + 115 + i % 3 * 15} ${b.y},${tx} ${b.y}` : `M${sx} ${a.y} C${sx + (backwards ? -bend : bend)} ${a.y},${tx + (backwards ? bend : -bend)} ${b.y},${tx} ${b.y}`; const key = `${l.from}→${l.to}`; const active = key === selectedLink || (!selectedLink && selectedNode && (l.from === selectedNode || l.to === selectedNode)); const violates = l.relations.some(r => violations.has(r.id)); return <g key={key} role="button" tabIndex={0} aria-label={`${a.label} to ${b.label}, ${l.relations.length} observation${l.relations.length === 1 ? "" : "s"}${violates ? ", matches a boundary rule" : ""}`} onClick={() => onLink(key)} onKeyDown={e => keydown(e, () => onLink(key))} className={`graph-edge ${active ? "active" : ""} ${violates ? "violates" : ""} ${focus && selectedNode && !active ? "dim" : ""}`}><path d={path} className="edge-hit" /><path d={path} className="edge-line" markerEnd="url(#arrow)" />{l.relations.length > 1 && <g transform={`translate(${(sx + tx) / 2},${(a.y + b.y) / 2 - 10})`}><rect x="-12" y="-11" width="24" height="22" rx="8" className="edge-count-bg" /><text textAnchor="middle" dominantBaseline="middle" className="edge-count">{l.relations.length}</text></g>}</g>; })}
    {nodes.map(n => { const connected = links.some(l => (l.from === selectedNode && l.to === n.id) || (l.to === selectedNode && l.from === n.id)); return <g key={n.id} role="button" tabIndex={0} aria-label={`Inspect ${n.label}`} onClick={() => onNode(n.id)} onKeyDown={e => keydown(e, () => onNode(n.id))} className={`graph-node ${selectedNode === n.id ? "selected" : ""} ${focus && selectedNode && selectedNode !== n.id && !connected ? "dim" : ""}`} transform={`translate(${n.x - 94},${n.y - 36})`}><rect width="188" height="72" rx="11" className="node-box" /><rect width="4" height="72" rx="2" fill={palette[n.layer] || "#94aabb"} /><text x="16" y="29" className="node-title">{n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label}</text><text x="16" y="52" className="node-sub">{n.sub.length > 27 ? "…" + n.sub.slice(-26) : n.sub}</text></g>; })}
  </svg></div>;
}

export default function Home() {
  const [graph, setGraph] = useState<Graph>(sample);
  const [mode, setMode] = useState<Mode>("modules");
  const [moduleId, setModuleId] = useState("send");
  const [selectedNode, setSelectedNode] = useState<string | null>("send");
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const [crossOnly, setCrossOnly] = useState(false);
  const [allowed, setAllowed] = useState<Relation["kind"][]>([...kinds]);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => graph.relations.filter(r => allowed.includes(r.kind) && (!crossOnly || moduleOf(graph, r.from) !== moduleOf(graph, r.to))), [graph, allowed, crossOnly]);
  const scoped = useMemo(() => ({ ...graph, relations: filtered }), [graph, filtered]);
  const layout = mode === "modules" ? { ...layoutModules(graph.modules), links: moduleLinks(scoped) } : layoutFunctions(graph, moduleId, filtered);
  const matches = new Set(layout.nodes.filter(n => `${n.label} ${n.sub} ${n.layer}`.toLowerCase().includes(query.toLowerCase())).map(n => n.id));
  const neighbors = new Set([selectedNode, ...layout.links.filter(l => l.from === selectedNode || l.to === selectedNode).flatMap(l => [l.from, l.to])]);
  const nodes = layout.nodes.filter(n => (!query || matches.has(n.id)) && (!focus || !selectedNode || neighbors.has(n.id)));
  const ids = new Set(nodes.map(n => n.id));
  const links = layout.links.filter(l => ids.has(l.from) && ids.has(l.to));
  const link = layout.links.find(l => `${l.from}→${l.to}` === selectedLink);
  const module = graph.modules.find(m => m.id === (mode === "functions" ? moduleId : selectedNode));
  const fn = graph.functions.find(f => f.id === selectedNode);
  const entity = (fn || module) as FunctionNode | Module | undefined;
  const entityId = fn?.id || module?.id;
  const observed = entityId ? filtered.filter(r => mode === "modules" ? moduleOf(graph, r.from) === entityId || moduleOf(graph, r.to) === entityId : r.from === entityId || r.to === entityId) : [];
  const suggestions = candidates(graph);
  const findings = ruleFindings(graph);
  const violations = new Set(findings.flatMap(f => f.relations.map(r => r.id)));
  const chooseModule = (id: string) => { setMode("modules"); setModuleId(id); setSelectedNode(id); setSelectedLink(null); setFocus(false); setQuery(""); };
  const chooseNode = (id: string) => { setSelectedNode(id); setSelectedLink(null); if (mode === "modules") setModuleId(id); };
  const showFunctions = (id: string) => { const m = moduleOf(graph, id); if (m) { setMode("functions"); setModuleId(m); setSelectedNode(graph.functions.find(f => f.module === m)?.id || null); setSelectedLink(null); setFocus(false); setQuery(""); } };
  const load = (text: string) => { try { const g = parseGraph(text); setGraph(g); setMode("modules"); setModuleId(g.modules[0].id); setSelectedNode(g.modules[0].id); setSelectedLink(null); setFocus(false); setQuery(""); setAllowed([...kinds]); setCrossOnly(false); setError(""); setImportOpen(false); } catch (e) { setError(e instanceof Error ? e.message : "Could not read graph."); } };
  const readFile = async (file?: File) => { if (!file) return; setBusy(true); try { if (file.size > 1_000_000) throw new Error("Choose a JSON file smaller than 1 MB."); const text = await file.text(); setDraft(text); load(text); } catch (e) { setError(e instanceof Error ? e.message : "Could not read file."); } finally { setBusy(false); } };
  const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "boundary-example.json"; a.click(); URL.revokeObjectURL(url); };
  useEffect(() => {
    type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
    const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: "load_boundary_graph", title: "Load boundary graph", description: "Validate and display a small structured module and function graph in this browser tab.", inputSchema: { type: "object", properties: { graph: { type: "object" } }, required: ["graph"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute(input) {
      const value = input as { graph?: unknown };
      const parsed = parseGraph(JSON.stringify(value?.graph));
      flushSync(() => { setGraph(parsed); setMode("modules"); setModuleId(parsed.modules[0].id); setSelectedNode(parsed.modules[0].id); setSelectedLink(null); setFocus(false); setQuery(""); setAllowed([...kinds]); setCrossOnly(false); });
      return { name: parsed.name, modules: parsed.modules.length, functions: parsed.functions.length, relations: parsed.relations.length };
    } });
    register({ name: "explain_boundary_connection", title: "Explain connection", description: "Show and return the source observations behind a module or function dependency.", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute(input) {
      const { from, to } = input as { from: string; to: string };
      const isModule = graph.modules.some(m => m.id === from) && graph.modules.some(m => m.id === to);
      const found = graph.relations.filter(r => (isModule ? moduleOf(graph, r.from) : r.from) === from && (isModule ? moduleOf(graph, r.to) : r.to) === to);
      if (!found.length) throw new Error("No observed connection between those ids.");
      flushSync(() => { setMode(isModule ? "modules" : "functions"); if (!isModule) setModuleId(moduleOf(graph, from)!); setSelectedNode(null); setSelectedLink(`${from}→${to}`); setFocus(false); setQuery(""); setAllowed([...kinds]); setCrossOnly(false); });
      return { from, to, observations: found };
    } });
    register({ name: "inspect_boundary_rules", title: "Inspect boundary rules", description: "Return each declared boundary rule and its matching source observations for review.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute() {
      return { name: graph.name, findings: ruleFindings(graph) };
    } });
    return () => lifecycle.abort();
  }, [graph]);
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><GitBranch size={19} /></div><div><strong>Boundary explorer</strong><span>Static JS relationships</span></div></div><div className="top-actions"><span className="local-note">Your imported graph stays in this tab</span><button className="button button-outline" onClick={() => { setDraft(""); setError(""); setImportOpen(true); }}><Upload size={16} /> Import JSON</button></div></header>
    <div className="workspace">
      <aside className="left-rail"><div className="rail-section"><div className="section-eyebrow">DATASET</div><h1 title={graph.name}>{graph.name}</h1><p className="quiet">{graph.modules.length} modules · {graph.functions.length} functions · {graph.relations.length} observation{graph.relations.length === 1 ? "" : "s"}</p><div className="dataset-actions"><button onClick={download}><Download size={15} /> Sample format</button>{graph !== sample && <button onClick={() => { setGraph(sample); chooseModule("send"); }}><ArrowLeft size={15} /> Reset sample</button>}</div></div>
        {!!findings.length && <div className="rail-section"><div className="section-eyebrow">DECLARED RULES <span>{violations.size} MATCH{violations.size === 1 ? "" : "ES"}</span></div>{findings.map(f => <div className="rule-item" key={f.rule.id}><strong>{f.rule.description}</strong><small>{f.relations.length} observed match{f.relations.length === 1 ? "" : "es"}</small>{f.relations.slice(0, 4).map(r => <button key={r.id} onClick={() => { const from = moduleOf(graph, r.from)!, to = moduleOf(graph, r.to)!; chooseModule(from); setSelectedNode(null); setSelectedLink(`${from}→${to}`); }}>{r.source.file}:{r.source.line} <ChevronRight size={12} /></button>)}</div>)}<p className="rail-footnote">Matches depend on the supplied observations and deserve code review. Zero matches does not prove compliance.</p></div>}
        <div className="rail-section candidates-section"><div className="section-eyebrow">WORTH INSPECTING <span>{suggestions.length}</span></div>{suggestions.length ? suggestions.map(c => <button key={c.key} className="candidate" onClick={() => { const r = graph.relations.find(r => c.relationIds.includes(r.id)); chooseModule(c.moduleId); if (r) { setSelectedNode(null); setSelectedLink(`${moduleOf(graph, r.from)}→${moduleOf(graph, r.to)}`); } }}><span className={`signal ${c.level}`} /><span><strong>{c.title}</strong><small>{c.detail}</small></span></button>) : <p className="quiet">No simple signals in this dataset. That does not imply clean boundaries.</p>}<p className="rail-footnote">Heuristics suggest places to read. They do not measure design quality.</p></div>
        <div className="rail-section"><div className="section-eyebrow">MODULES</div><nav className="module-list" aria-label="Modules">{graph.modules.map(m => <button key={m.id} className={`module-item ${moduleId === m.id ? "active" : ""}`} onClick={() => chooseModule(m.id)}><span className="module-dot" style={{ background: palette[m.layer] || "#94aabb" }} /><span><strong>{short(m.path)}</strong><small>{m.layer}</small></span><ChevronRight size={15} /></button>)}</nav></div></aside>
      <section className="center-panel" aria-label="Graph exploration"><div className="view-header"><div><div className="section-eyebrow">RELATIONSHIP VIEW</div><h2>{mode === "modules" ? "Module boundaries" : `${short(graph.modules.find(m => m.id === moduleId)?.path || "Functions")} · functions`}</h2></div><Tabs value={mode} onValueChange={v => { setMode(v as Mode); setSelectedLink(null); setSelectedNode(v === "modules" ? moduleId : graph.functions.find(f => f.module === moduleId)?.id || null); setFocus(false); setQuery(""); }}><TabsList className="view-tabs"><TabsTrigger value="modules"><Layers3 size={15} /> Modules</TabsTrigger><TabsTrigger value="functions"><GitBranch size={15} /> Functions</TabsTrigger></TabsList></Tabs></div>
        <div className="controls"><label className="search-box"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={mode === "modules" ? "Find a module" : "Find a function"} aria-label="Filter graph nodes" />{query && <button title="Clear search" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}</label><button className={`chip ${focus ? "on" : ""}`} onClick={() => setFocus(!focus)} disabled={!selectedNode}><Focus size={15} /> {focus ? "Showing neighbors" : "Focus neighbors"}</button><label className="check-chip"><Checkbox checked={crossOnly} onCheckedChange={v => setCrossOnly(v === true)} /> Cross-module only</label></div>
        <div className="kind-filter" aria-label="Relation filters"><span>Relations</span>{kinds.map(k => <label key={k} className={`kind-chip ${allowed.includes(k) ? "on" : ""}`}><Checkbox checked={allowed.includes(k)} onCheckedChange={v => setAllowed(v ? [...allowed, k] : allowed.filter(x => x !== k))} />{k}</label>)}</div>
        <div className="graph-frame">{nodes.length ? <Canvas nodes={nodes} links={links} height={layout.height} selectedNode={selectedNode} selectedLink={selectedLink} onNode={chooseNode} onLink={key => { setSelectedLink(key); setSelectedNode(null); }} mode={mode} focus={focus} violations={violations} /> : <div className="empty-graph">No matching nodes. Clear the search or filters to continue.</div>}</div><div className="graph-caption"><span><b>→</b> Direction follows the observed dependency · <span className="rule-key">Coral</span> marks rule matches</span><span>{links.length} visible connection{links.length === 1 ? "" : "s"}</span></div></section>
      <aside className="inspector" aria-label="Selection details">{link ? <><div className="section-eyebrow">CONNECTION · {link.relations.length} OBSERVATION{link.relations.length === 1 ? "" : "S"}</div><h2>{label(graph, link.from)} <span className="arrow-word">→</span> {label(graph, link.to)}</h2><p className="inspector-lede">These source locations explain the visible connection. Inspect an occurrence in context.</p><div className="evidence-list">{link.relations.map(r => <div className="evidence" key={r.id}><div className="evidence-top"><span className="tag">{r.kind}</span><span>{r.source.file}:{r.source.line}</span></div><code>{r.source.excerpt}</code><p><strong>{label(graph, r.from)}</strong> → <strong>{label(graph, r.to)}</strong></p>{r.note && <p className="observation">{r.note}</p>}{findings.filter(f => f.relations.some(item => item.id === r.id)).map(f => <p className="rule-match" key={f.rule.id}>Rule match: {f.rule.description}</p>)}{mode === "modules" && graph.functions.some(f => f.id === r.from) && <button className="text-action" onClick={() => { showFunctions(r.from); setSelectedLink(`${r.from}→${r.to}`); }}>View function connection <ChevronRight size={14} /></button>}</div>)}</div></> : entity ? <><div className="section-eyebrow">{fn ? "FUNCTION" : "MODULE"} · {module?.layer || graph.modules.find(m => m.id === fn?.module)?.layer}</div><h2>{fn?.name || short(module!.path)}</h2><div className="path-line">{fn ? `${graph.modules.find(m => m.id === fn.module)?.path}:${fn.line}` : module?.path}</div><p className="inspector-lede">{entity.summary || "No description provided. Inspect the observed relationships below."}</p>{module && <button className="button button-accent" onClick={() => showFunctions(module.id)}>Inspect functions <ChevronRight size={16} /></button>}{fn && <button className="text-action" onClick={() => chooseModule(fn.module)}><ArrowLeft size={15} /> Back to module</button>}<div className="inspector-divider" /><div className="section-eyebrow">OBSERVED RELATIONSHIPS <span>{observed.length}</span></div>{observed.length ? <div className="relation-list">{observed.map(r => <button key={r.id} onClick={() => { const from = mode === "modules" ? moduleOf(graph, r.from) : r.from; const to = mode === "modules" ? moduleOf(graph, r.to) : r.to; setSelectedNode(null); setSelectedLink(`${from}→${to}`); setFocus(false); setQuery(""); }}><span className="relation-kind">{r.kind}</span><strong>{label(graph, r.from)} <span>→</span> {label(graph, r.to)}</strong><small>{r.source.file}:{r.source.line}</small></button>)}</div> : <p className="quiet">No relationships match these filters.</p>}</> : <><div className="section-eyebrow">INSPECT</div><h2>Select a module or connection</h2><p className="inspector-lede">Choose an edge for the exact observations and source locations behind it.</p></>}<div className="inspector-note">Static observations can miss dynamic calls, reflection, or runtime ownership. Read code and tests before changing a boundary.</div></aside>
    </div>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="import-dialog"><DialogHeader><DialogTitle>Import a small graph</DialogTitle><DialogDescription>Choose a JSON file or paste its contents. Import runs in your browser tab; this site does not store your graph.</DialogDescription></DialogHeader><label className="file-drop"><FileJson2 size={21} /><span>{busy ? "Reading…" : "Choose a JSON file"}</span><input type="file" accept="application/json,.json" onChange={e => readFile(e.target.files?.[0])} /></label><label className="paste-label" htmlFor="graph-json">Or paste JSON</label><textarea id="graph-json" spellCheck={false} placeholder={'{"name":"My program","modules":[...],"functions":[...],"relations":[...]}' } value={draft} onChange={e => setDraft(e.target.value)} />{error && <p className="import-error" role="alert">{error}</p>}<div className="import-footer"><button className="text-action" onClick={download}><Download size={15} /> Download example format</button><button className="button button-accent" onClick={() => load(draft)} disabled={!draft.trim()}>Load graph</button></div></DialogContent></Dialog>
  </main>;
}
