// Activity log: who signed in, signed up and changed what, in the ERP and on ovalfarm.in.
// Each entry is one document in the Firestore "logs" collection. Anyone signed in can add entries
// about themselves; only Admins can read them; nobody can change or delete them (firestore.rules).
// Looking at data is never logged.
import { session } from "./session.js";

let writer = null;   // set by firebase.js: (entry) => Promise
let demoLog = [];    // demo mode keeps the log in memory

let muted = 0;      // >0 while setting up demo data

export function setLogWriter(fn) { writer = fn; }
export function withoutLog(fn) { muted++; try { return fn(); } finally { muted--; } }

// Public address of this device, from a free lookup service. Reported by the browser itself,
// so it is a good guide, not proof.
let ipPromise = null;
export function publicIp() {
  if (!ipPromise) {
    ipPromise = Promise.race([
      fetch("https://api.ipify.org?format=json").then((r) => r.json()).then((j) => String(j.ip || "")),
      new Promise((r) => setTimeout(() => r(""), 4000)),
    ]).catch(() => "");
  }
  return ipPromise;
}

function device() {
  const ua = navigator.userAgent || "";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" on ");
}

// What a record is called in the log: its number, name or title, else the amount.
export function labelOf(data) {
  if (!data) return "";
  const v = data.number || data.name || data.title || data.code || (data.customer && data.customer.name) || data.category || data.investorNo || "";
  return String(v || (data.amount != null && data.amount !== "" ? "₹" + data.amount : "")).slice(0, 120);
}

const SKIP = new Set(["logs", "catalog"]);
const AUTO_FIELDS = new Set(["createdAt", "updatedAt", "createdBy", "updatedBy", "id"]);

// action: "Signed in", "Created", "Changed", "Deleted"… extra: { what, docId, label, fields, note }
export async function logActivity(action, extra = {}) {
  if (muted || (extra.what && SKIP.has(extra.what))) return;
  const u = session.user || {};
  const entry = {
    app: "erp", action, what: extra.what || "", docId: extra.docId || "", label: extra.label || "",
    fields: extra.fields || [], note: extra.note || "",
    email: u.email || "", name: u.name || "", phone: u.phone || "", role: session.role || "",
    ip: "", device: device(),
  };
  if (session.mode === "demo") { demoLog.unshift({ ...entry, ip: "(demo)", id: String(Date.now()) + Math.random(), at: new Date().toISOString(), uid: "demo" }); return; }
  entry.ip = await publicIp();
  if (writer) await writer(entry);
}

// A write through the store. data: the new values (whole record when new).
export function logWrite(collection, id, data, isNew, before) {
  if (SKIP.has(collection)) return;
  const fields = Object.keys(data || {}).filter((k) => !AUTO_FIELDS.has(k));
  // Keeping your own last-seen day and photo current isn't a change anyone made.
  if (collection === "staff" && !isNew && fields.every((k) => ["lastSeen", "picture", "name"].includes(k)) && id === (session.user && session.user.email)) return;
  logActivity(isNew ? "Created" : "Changed", { what: collection, docId: id, label: labelOf({ ...(before || {}), ...(data || {}) }), fields: isNew ? [] : fields.slice(0, 30) });
}

export function logDelete(collection, id, before) {
  if (SKIP.has(collection)) return;
  logActivity("Deleted", { what: collection, docId: id, label: labelOf(before) });
}

export function demoEntries() { return demoLog; }
export function seedDemoLog(entries) { demoLog = entries; }
