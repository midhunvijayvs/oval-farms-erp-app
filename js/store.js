// In-memory database with IndexedDB cache. Every write stamps the record with who/when
// so the Drive sync (sync.js) can merge edits from several users record by record.
import { emptyDb } from "./merge.js";
import { kvGet, kvSet } from "./idb.js";
import { uid, nowISO } from "./util.js";

let db = emptyDb();
let namespace = null;
let user = { email: "", name: "" };
let revision = 0;
const listeners = new Set();
let saveTimer = null;

function cacheKey() { return "db:" + namespace; }

function emit(meta) {
  revision++;
  for (const fn of listeners) {
    try { fn(meta); } catch (e) { console.error(e); }
  }
}

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvSet(cacheKey(), db), 250);
}

export const store = {
  async open(ns, currentUser) {
    namespace = ns;
    user = currentUser;
    db = (await kvGet(cacheKey())) || emptyDb();
    if (!db.collections) db = emptyDb();
    emit({ type: "open" });
  },

  get namespace() { return namespace; },
  get user() { return user; },
  get revision() { return revision; },

  snapshot() { return db; },

  // Replace the whole db (after a merge with Drive). Does not count as a local edit.
  // Replace the whole db. After a Drive merge this is not a local edit (nothing to upload);
  // after restoring a backup it is (asLocal=true), so the sync pushes it to Drive.
  replace(next, asLocal = false) {
    db = next;
    persistSoon();
    emit({ type: asLocal ? "local" : "remote" });
  },

  col(name) {
    if (!db.collections[name]) db.collections[name] = {};
    return db.collections[name];
  },

  all(name) {
    return Object.values(this.col(name)).filter((r) => !r.deleted);
  },

  get(name, id) {
    const r = this.col(name)[id];
    return r && !r.deleted ? r : null;
  },

  put(name, rec) {
    const c = this.col(name);
    const ts = nowISO();
    const existing = rec.id ? c[rec.id] : null;
    const out = { ...(existing || {}), ...rec };
    if (!out.id) out.id = uid();
    if (!existing) { out.createdAt = ts; out.createdBy = user.email; }
    out.updatedAt = ts;
    out.updatedBy = user.email;
    delete out.deleted;
    c[out.id] = out;
    persistSoon();
    emit({ type: "local", collection: name, id: out.id });
    return out;
  },

  putMany(name, recs) {
    return recs.map((r) => this.put(name, r));
  },

  remove(name, id) {
    const c = this.col(name);
    if (!c[id]) return;
    c[id] = { id, deleted: true, updatedAt: nowISO(), updatedBy: user.email };
    persistSoon();
    emit({ type: "local", collection: name, id });
  },

  settings() {
    return this.get("settings", "business") || {};
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async flush() {
    clearTimeout(saveTimer);
    await kvSet(cacheKey(), db);
  },
};
