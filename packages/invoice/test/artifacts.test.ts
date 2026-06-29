import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildArtifacts, GEN_DIR } from "../src/generate.js";

test("committed generated artifacts match a fresh regeneration", async () => {
  const { schemaTs, typesTs } = await buildArtifacts();
  assert.equal(
    readFileSync(join(GEN_DIR, "schema.ts"), "utf8"),
    schemaTs,
    "generated/schema.ts is stale — run `npm run generate`",
  );
  assert.equal(
    readFileSync(join(GEN_DIR, "invoice-types.ts"), "utf8"),
    typesTs,
    "generated/invoice-types.ts is stale — run `npm run generate`",
  );
});
