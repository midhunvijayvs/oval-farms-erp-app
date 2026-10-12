// Record-level merge of two database snapshots.
// Every record carries updatedAt (ISO string); the newest version of each record wins,
// deletions are kept as tombstones ({deleted:true}) so they propagate between users.

export function emptyDb() {
  return { schema: 1, collections: {} };
}

function newer(a, b) {
  // true when record a should win over record b
  if (!b) return true;
  if (!a) return false;
  const ta = a.updatedAt || "", tb = b.updatedAt || "";
  if (ta !== tb) return ta > tb;
  return (a.updatedBy || "") > (b.updatedBy || "");
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Returns { merged, localChanged, remoteChanged }:
//   localChanged  - merged differs from local (remote brought something new)
//   remoteChanged - merged differs from remote (local has something remote lacks)
export function mergeDb(local, remote) {
  local = local || emptyDb();
  remote = remote || emptyDb();
  const merged = emptyDb();
  let localChanged = false, remoteChanged = false;
  const names = new Set([
    ...Object.keys(local.collections || {}),
    ...Object.keys(remote.collections || {}),
  ]);
  for (const name of names) {
    const L = (local.collections || {})[name] || {};
    const R = (remote.collections || {})[name] || {};
    const out = {};
    const ids = new Set([...Object.keys(L), ...Object.keys(R)]);
    for (const id of ids) {
      const l = L[id], r = R[id];
      if (l && r && same(l, r)) { out[id] = l; continue; }
      if (newer(l, r)) { out[id] = l; remoteChanged = true; }
      else { out[id] = r; localChanged = true; }
    }
    merged.collections[name] = out;
  }
  return { merged, localChanged, remoteChanged };
}
