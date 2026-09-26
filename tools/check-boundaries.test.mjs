import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEvidence, inspectGraph } from "./check-boundaries.mjs";

const graph = {
  name: "Small slice",
  modules: [{ id: "d", path: "domain/send.ts", layer: "Domain" }, { id: "u", path: "ui/toast.ts", layer: "UI" }],
  functions: [{ id: "send", module: "d", name: "send", line: 1 }, { id: "toast", module: "u", name: "toast", line: 1 }],
  relations: [{ id: "r1", from: "send", to: "toast", kind: "calls", source: { file: "domain/send.ts", line: 2, excerpt: "toast(error)" } }],
  rules: [{ id: "no-ui", description: "No UI calls from domain", deny: { from: { layer: "Domain" }, to: { module: "u" }, kinds: ["calls"] } }],
};

test("finds a forbidden function call through its owning modules", () => {
  assert.deepEqual(inspectGraph(graph).findings[0].relations.map(r => r.id), ["r1"]);
  assert.equal(inspectGraph({ ...graph, rules: [{ ...graph.rules[0], deny: { ...graph.rules[0].deny, kinds: ["imports"] } }] }).findings[0].relations.length, 0);
});

test("rejects rules pointing to missing modules", () => {
  assert.throws(() => inspectGraph({ ...graph, rules: [{ ...graph.rules[0], deny: { from: { module: "missing" }, to: { module: "u" } } }] }), /rules\[0\]/);
});

test("checks cited source lines and catches stale excerpts", async () => {
  const root = await mkdtemp(join(tmpdir(), "boundary-check-"));
  await mkdir(join(root, "domain"));
  await writeFile(join(root, "domain/send.ts"), "function send() {\n  toast(error)\n}\n");
  assert.deepEqual(await checkEvidence(graph, root), []);
  const stale = await checkEvidence({ ...graph, relations: [{ ...graph.relations[0], source: { file: "domain/send.ts", line: 3, excerpt: "toast(error)" } }] }, root);
  assert.equal(stale.length, 1);
});
