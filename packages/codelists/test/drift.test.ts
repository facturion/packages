import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateAll } from "../src/generate.js";

// Re-run the generator (in memory) and compare to the committed artifacts.
// Fails when someone edits a YAML without running `npm run generate`.
test("committed generated artifacts match a fresh regeneration", () => {
  for (const [path, expected] of Object.entries(generateAll())) {
    let committed = "";
    try {
      committed = readFileSync(path, "utf8");
    } catch {
      assert.fail(`missing generated file ${path} — run \`npm run generate\``);
    }
    assert.equal(committed, expected, `out of sync: ${path} — run \`npm run generate\``);
  }
});
