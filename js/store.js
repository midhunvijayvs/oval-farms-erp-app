// In-memory database the whole app reads from synchronously.
// Signed in, it mirrors Firestore: listeners fill it (applyRemote) and every put/remove is
// shown at once and written to Firestore by the backend (js/firebase.js), which also keeps
// working offline. In demo mode there is no backend and the data is cached in IndexedDB.
import { kvGet, kvSet } from "./idb.js";
import { uid, nowISO } from "./util.js";

const emptyDb = () => ({ schema: 2, collections: {} });

let db = emptyDb();
let namespace = null;
let user = { email: "", name: "" };
let backend = null;
let revision = 0;
const listeners = new Set();
let saveTimer = null;

function emit(meta) {
  revision++;
  for (const fn of listeners) {
    try { fn(meta); } catch (e) { console.error(e); }
  }
}

function persistSoon() {
  if (backend) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvSet("db:" + namespace, db), 250);
}

export const store = {
  // backend: { write(collection, id, patch, isNew), remove(collection, id) } or null for demo.
  async open(ns, currentUser, withBackend = null) {
    namespace = ns;
    user = currentUser;
    backend = withBackend;
    db = backend ? emptyDb() : (await kvGet("db:" + ns)) || emptyDb();
    if (!db.collections) db = emptyDb();
    emit({ type: "open" });
  },

  get namespace() { return namespace; },
  get user() { return user; },
  get revision() { return revision; },
  get online() { return !!backend; },

  snapshot() { return db; },

  col(name) {
    if (!db.collections[name]) db.collections[name] = {};
    return db.collections[name];
  },

  all(name) {
    return Object.values(this.col(name)).filter((r) => !r.deleted);
  },

  get(name, id) {
    if (!id) return null;
    const r = this.col(name)[id];
    return r && !r.deleted ? r : null;
  },

  // Saves a whole record or a patch ({ id, field: value }). Returns the full record.
  put(name, rec) {
    const c = this.col(name);
    const ts = nowISO();
    const existing = rec.id ? c[rec.id] : null;
    const isNew = !existing;
    const out = { ...(existing || {}), ...rec };
    if (!out.id) out.id = uid();
    const patch = { ...rec };
    delete patch.id;
    if (isNew) { out.createdAt = ts; out.createdBy = user.email; patch.createdAt = ts; patch.createdBy = user.email; }
    out.updatedAt = ts; out.updatedBy = user.email;
    patch.updatedAt = ts; patch.updatedBy = user.email;
    delete out.deleted;
    c[out.id] = out;
    if (backend) backend.write(name, out.id, isNew ? { ...out, id: undefined } : patch, isNew);
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
    delete c[id];
    if (backend) backend.remove(name, id);
    persistSoon();
    emit({ type: "local", collection: name, id });
  },

  // Firestore listener results for one collection: changes = [{ id, data | null }].
  applyRemote(name, changes) {
    const c = this.col(name);
    for (const ch of changes) {
      if (ch.data) c[ch.id] = { ...ch.data, id: ch.id };
      else delete c[ch.id];
    }
    emit({ type: "remote", collection: name });
  },

  settings() {
    return this.get("settings", "business") || {};
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async flush() {
    if (backend) return;
    clearTimeout(saveTimer);
    await kvSet("db:" + namespace, db);
  },
};
