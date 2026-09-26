# JS Boundary Explorer

A small, private workspace for inspecting observed dependencies between JavaScript modules and functions. The [deployed explorer](https://js-boundary-explorer.santana-santiago.chatgpt.site) is owner-only.

Import a JSON file or paste JSON in the app. The graph stays in the current browser tab; the app does not upload or persist it. Use **Sample format** in the app to download a complete example.

## What it shows

- Directed module relationships derived from individual observations, with function-level drilldown.
- Filters for relation kind, cross-module edges, search, and one-hop focus.
- Source file, line, excerpt, and optional note for each observation behind an edge.
- Simple investigation cues for domain-to-UI dependencies, two-way module dependencies, and broad outgoing fan-out.

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
  ]
}
```

Entity IDs must be unique. Relation IDs must be unique, and endpoints must name a module or function. Kinds are `imports`, `calls`, `reads`, `writes`, and `references`. Modules need `id`, `path`, and `layer`; functions need `id`, `module`, `name`, and a positive `line`. Relations need `id`, `from`, `to`, `kind`, and `source` with `file`, positive `line`, and `excerpt`. Optional `summary` and `note` fields add context. The current UI accepts up to 30 modules, 150 functions, and 400 observations.

## Run locally

Requires Node.js 22.13 or newer. From the repository root:

```sh
corepack pnpm install
corepack pnpm dev
```

Run `corepack pnpm build` to check the production build. The site is built with React, Vinext, and the Sites starter. `.openai/hosting.json` identifies the existing private Site; pushing this GitHub repository alone does not deploy it.
