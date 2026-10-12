// Keeps the local database and the shared Drive file in step.
// Cycle: check the Drive file's version -> if someone else changed it, download and merge
// record by record -> if this device has anything the file lacks, upload the merged copy.
import { store } from "./store.js";
import { mergeDb } from "./merge.js";
import * as drive from "./drive.js";
import { kvGet, kvSet } from "./idb.js";

const cfg = window.OVAL_CONFIG || {};
const listeners = new Set();

export const syncState = {
  mode: "off",          // off | demo | drive
  status: "idle",       // idle | syncing | error | offline | auth
  lastSync: null,
  error: "",
  folderId: "",
  fileId: "",
  lastEditor: "",
};

let remoteVersion = null;
let localRev = 0;
let pushedRev = 0;
let running = false;
let again = false;
let timer = null;
let debounceTimer = null;
let unsub = null;

function set(patch) {
  Object.assign(syncState, patch);
  for (const fn of listeners) fn(syncState);
}

export function onSync(fn) { listeners.add(fn); fn(syncState); return () => listeners.delete(fn); }

export async function startDemo() {
  stop();
  set({ mode: "demo", status: "idle", error: "" });
}

export async function startDrive(folderId) {
  stop();
  const cached = (await kvGet("file:" + folderId)) || {};
  remoteVersion = cached.version || null;
  set({ mode: "drive", folderId, fileId: cached.fileId || "", status: "idle", error: "" });
  localRev = 1; pushedRev = cached.pending ? 0 : 1;
  unsub = store.on((meta) => {
    if (meta.type !== "local") return;
    localRev++;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(syncNow, 1200);
  });
  const every = Math.max(10, Number(cfg.SYNC_INTERVAL_SECONDS) || 30) * 1000;
  timer = setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, every);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", syncNow);
  await syncNow();
}

function onVisible() { if (document.visibilityState === "visible") syncNow(); }

export function stop() {
  clearInterval(timer); timer = null;
  clearTimeout(debounceTimer);
  if (unsub) unsub(); unsub = null;
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("online", syncNow);
  set({ mode: "off", status: "idle" });
}

async function remember(pending) {
  await kvSet("file:" + syncState.folderId, { fileId: syncState.fileId, version: remoteVersion, pending });
}

export async function syncNow() {
  if (syncState.mode !== "drive") return;
  if (running) { again = true; return; }
  if (!navigator.onLine) { set({ status: "offline" }); return; }
  running = true;
  set({ status: "syncing", error: "" });
  try {
    const name = cfg.DATA_FILE_NAME || "oval-farms-erp-data.json";
    const revAtStart = localRev;
    let fileId = syncState.fileId;
    let meta = null;
    if (fileId) {
      try { meta = await drive.getFile(fileId, "id,version,modifiedTime,trashed,lastModifyingUser(displayName,emailAddress)"); }
      catch (e) { if (e.status === 404) { fileId = ""; } else throw e; }
      if (meta && meta.trashed) { fileId = ""; meta = null; }
    }
    if (!fileId) {
      const found = await drive.findFileInFolder(syncState.folderId, name);
      if (found) { fileId = found.id; meta = await drive.getFile(fileId, "id,version,modifiedTime,lastModifyingUser(displayName,emailAddress)"); }
      remoteVersion = null;
    }

    let needPush = localRev > pushedRev || !fileId;
    if (fileId && meta && meta.version !== remoteVersion) {
      const remote = await drive.download(fileId);
      const { merged, localChanged, remoteChanged } = mergeDb(store.snapshot(), remote);
      if (localChanged) store.replace(merged);
      needPush = remoteChanged;
      remoteVersion = meta.version;
      set({ lastEditor: meta.lastModifyingUser ? (meta.lastModifyingUser.displayName || meta.lastModifyingUser.emailAddress) : "" });
    }

    if (needPush) {
      const res = await drive.upload({ fileId, folderId: syncState.folderId, name, data: store.snapshot() });
      fileId = res.id;
      remoteVersion = res.version;
    }
    pushedRev = revAtStart;
    set({ fileId, status: "idle", lastSync: new Date().toISOString() });
    await remember(localRev > pushedRev);
  } catch (e) {
    console.error("Sync failed", e);
    if (e instanceof drive.AuthError) set({ status: "auth", error: e.message });
    else if (!navigator.onLine) set({ status: "offline" });
    else set({ status: "error", error: e.message || String(e) });
    await remember(true);
  } finally {
    running = false;
    if (again) { again = false; setTimeout(syncNow, 300); }
  }
}

export function hasUnsyncedChanges() {
  return syncState.mode === "drive" && localRev > pushedRev;
}
