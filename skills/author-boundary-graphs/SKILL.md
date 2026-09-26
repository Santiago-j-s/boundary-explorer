---
name: author-boundary-graphs
description: Author and review source-backed JSON module/function graphs for JS Boundary Explorer. Use when an agent is asked to map a JavaScript or TypeScript code slice, formulate explicit dependency boundary rules, check observed violations, or collaborate with a user on refactoring candidates.
---

# Author boundary graphs

Build a small, reviewable graph for a chosen code slice. The graph is an index into evidence, not a claim that a design is good. Use `scripts/check-boundaries.mjs` to validate the JSON and report rule matches.

## Workflow

1. Establish the repository root, the bounded slice (up to 30 modules), and the user's intended boundaries. If rules are unstated, draft them as proposals and ask the user to revise the intent while continuing source inspection. Distinguish explicit rules from your assumptions.
2. Read the relevant source and tests. Use code search to follow imports, calls, reads, writes, and references. Record the file and line for each observed relation. Avoid treating text matches or a tidy graph as proof of runtime behavior. Do not infer a call from a name alone.
3. Author JSON with `name`, `modules`, `functions`, `relations`, and optional `rules`. Keep IDs stable. Every relation needs a source `{file,line,excerpt}`; use repository-relative paths and exact text from that line. A module endpoint is allowed when the function cannot be resolved. Include only facts observed in the chosen slice, noting external and dynamic dependencies separately in the handoff.
4. Express each boundary rule as a forbidden direction with `deny.from` and `deny.to`, using `module` IDs or exact `layer` names. Optionally restrict with `kinds`. A match is a review finding, not an automatic refactor. Do not silently change the user's rule to make matches disappear.
5. Run `node scripts/check-boundaries.mjs graph.json --root /path/to/repository --json` from this skill directory (or use the project's `tools/check-boundaries.mjs`). Exit 0 means valid and no observed matches, 1 means observed rule matches, 2 means malformed JSON or stale source evidence. Repair stale references; discuss actual matches with the user. Recheck after every change.
6. Give the user the JSON file and a concise review: scope and omissions, rules, matched source locations, uncertain edges, and what code to read next. Ask them to confirm the rule intent and missing behavior. Load the file in the explorer with **Import JSON**; its graph and rule marks remain in the current tab. If an agent has access to the explorer's optional tools, `load_boundary_graph` and `inspect_boundary_rules` can load and read findings; tool availability varies by client.

## Format

```json
{
  "name": "Checkout slice",
  "modules": [
    { "id": "ui", "path": "ui/checkout.ts", "layer": "UI" },
    { "id": "domain", "path": "domain/checkout.ts", "layer": "Domain" }
  ],
  "functions": [
    { "id": "submit", "module": "ui", "name": "submit", "line": 12 },
    { "id": "placeOrder", "module": "domain", "name": "placeOrder", "line": 8 }
  ],
  "relations": [
    { "id": "call-1", "from": "submit", "to": "placeOrder", "kind": "calls",
      "source": { "file": "ui/checkout.ts", "line": 14, "excerpt": "await placeOrder(cart)" } }
  ],
  "rules": [
    { "id": "domain-no-ui", "description": "Domain should not reach into UI",
      "deny": { "from": { "layer": "Domain" }, "to": { "layer": "UI" } } }
  ]
}
```

Kinds: `imports`, `calls`, `reads`, `writes`, `references`. A selector must specify at least one of `module` or `layer`; both means both must match. Rule IDs must be unique, and module selectors must reference modules in this graph. Omit `kinds` to cover all kinds. Function endpoints inherit their owning module's layer. The explorer accepts up to 30 modules, 150 functions, and 400 relations.

Zero matches means only that the *supplied observations* contain no matches. This checker verifies cited lines when `--root` is given; it does not extract dependencies, prove complete coverage, or enforce rules in the build. Name omitted paths and dynamic behavior in the review.
