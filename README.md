# JS Boundary Explorer

A small workspace for inspecting observed dependencies between JavaScript modules and functions. The source is public; the [deployed explorer](https://js-boundary-explorer.santana-santiago.chatgpt.site) remains owner-only.

Import a JSON file or paste JSON in the app. The graph stays in the current browser tab; the app does not upload or persist it. Use **Sample format** in the app to download a complete example.

## What it shows

- Directed module relationships derived from individual observations, with function-level drilldown.
- Filters for relation kind, cross-module edges, search, and one-hop focus.
- Source file, line, excerpt, and optional note for each observation behind an edge.
- Explicit forbidden-direction boundary rules, marked on edges with source-backed matches.
- Separate investigation cues for domain-to-UI dependencies, two-way module dependencies, and broad outgoing fan-out.

These cues identify places to read code. A sparse or tidy graph is not evidence of cohesive responsibilities, runtime behavior, or a safe refactor. Imported data is supplied by you; this prototype does not parse a repository.

## Input

```json
{
  "name": "Small example",
  "modules": [
    { "id": "ui", "path": "ui/compose.ts", "layer": "UI" },
    { "id": "send", "path": "domain/send.ts", "layer": "Domain" }
  ],
  "functions": [
    { "id": "submit", "module": "ui", "name": "submit", "line": 12 },
    { "id": "sendMessage", "module": "send", "name": "sendMessage", "line": 8 }
  ],
  "relations": [
    {
      "id": "call-1",
      "from": "submit",
      "to": "sendMessage",
      "kind": "calls",
      "source": { "file": "ui/compose.ts", "line": 14, "excerpt": "await sendMessage(draft)" }
    }
  ],
  "rules": [
    { "id": "domain-no-ui", "description": "Domain should not depend on UI",
      "deny": { "from": { "layer": "Domain" }, "to": { "layer": "UI" } } }
  ]
}
```

Entity IDs must be unique. Relation IDs must be unique, and endpoints must name a module or function. Kinds are `imports`, `calls`, `reads`, `writes`, and `references`. Modules need `id`, `path`, and `layer`; functions need `id`, `module`, `name`, and a positive `line`. Relations need `id`, `from`, `to`, `kind`, and `source` with `file`, positive `line`, and `excerpt`. Optional `summary` and `note` fields add context. `rules` declare forbidden directions; each `deny.from` and `deny.to` must select a module ID, a layer, or both. Optional `kinds` limits the rule to particular relation kinds. A function endpoint inherits its module and layer. The checker reports every observed match, with its relation ID and source evidence. The current UI accepts up to 30 modules, 150 functions, and 400 observations.

## Collaborate with an agent

The repository includes a portable [agent skill](skills/author-boundary-graphs/SKILL.md) and a zero-dependency checker. Ask an agent to inspect a bounded slice of a JS/TS repository, author the graph from code, and encode boundary rules you want reviewed. The agent should name the slice, exclusions, uncertain edges, and every source location behind a finding. Import its JSON in the explorer to follow those observations at module and function level.

```sh
node tools/check-boundaries.mjs path/to/graph.json --root path/to/source-repo
node tools/check-boundaries.mjs path/to/graph.json --root path/to/source-repo --json
```

The checker exits 0 for valid data without observed matches, 1 for observed rule matches, and 2 for invalid data or source excerpts that no longer match their recorded lines. Omit `--root` only when the source is unavailable; evidence is then unverified. Zero matches never proves complete coverage. The same skill can be invoked as `$author-boundary-graphs` when installed in ChatGPT; the repository copy works for other agents.

## Run locally

Requires Node.js 22.13 or newer. From the repository root:

```sh
corepack pnpm install
corepack pnpm dev
```

Run `corepack pnpm build` to check the production build. The site is built with React, Vinext, and the Sites starter. `.openai/hosting.json` identifies the existing private Site; pushing this GitHub repository alone does not deploy it.
