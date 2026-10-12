import assert from "node:assert/strict";
import { mergeDb } from "../js/merge.js";

const db = (recs) => ({ schema: 1, collections: { items: recs } });

// Newer record wins on each side independently
{
  const local = db({ a: { id: "a", name: "A2", updatedAt: "2026-01-02" }, b: { id: "b", name: "B1", updatedAt: "2026-01-01" } });
  const remote = db({ a: { id: "a", name: "A1", updatedAt: "2026-01-01" }, b: { id: "b", name: "B2", updatedAt: "2026-01-03" } });
  const { merged, localChanged, remoteChanged } = mergeDb(local, remote);
  assert.equal(merged.collections.items.a.name, "A2");
  assert.equal(merged.collections.items.b.name, "B2");
  assert.ok(localChanged && remoteChanged);
}
// Records created by different users are both kept
{
  const { merged } = mergeDb(db({ x: { id: "x", updatedAt: "1" } }), db({ y: { id: "y", updatedAt: "1" } }));
  assert.deepEqual(Object.keys(merged.collections.items).sort(), ["x", "y"]);
}
// Tombstones propagate
{
  const { merged } = mergeDb(
    db({ a: { id: "a", deleted: true, updatedAt: "2026-02-01" } }),
    db({ a: { id: "a", name: "A", updatedAt: "2026-01-01" } })
  );
  assert.equal(merged.collections.items.a.deleted, true);
}
// Identical snapshots report no changes
{
  const s = db({ a: { id: "a", updatedAt: "1" } });
  const r = mergeDb(s, JSON.parse(JSON.stringify(s)));
  assert.equal(r.localChanged, false);
  assert.equal(r.remoteChanged, false);
}
// Empty remote (new file) means local must be pushed
{
  const r = mergeDb(db({ a: { id: "a", updatedAt: "1" } }), null);
  assert.equal(r.remoteChanged, true);
}
console.log("merge tests passed");
