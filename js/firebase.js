// Firebase (Firestore + Auth) for data shared with the public website: online orders and website customers.
// The rest of the ERP still lives in the Google Drive file; modules move here one at a time.
// The SDK loads from Google's CDN only when firebase is configured in config.js.
import * as drive from "./drive.js";
import { session, userKey } from "./session.js";
import { store } from "./store.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const cfg = window.OVAL_CONFIG || {};

export const ORDER_STATUSES = [
  { k: "placed", label: "New", tone: "warn" },
  { k: "confirmed", label: "Confirmed", tone: "info" },
  { k: "packed", label: "Packed", tone: "info" },
  { k: "out_for_delivery", label: "Out for delivery", tone: "info" },
  { k: "delivered", label: "Delivered", tone: "ok" },
  { k: "cancelled", label: "Cancelled", tone: "muted" },
];
export const statusInfo = (k) => ORDER_STATUSES.find((s) => s.k === k) || { k, label: k || "Unknown", tone: "muted" };

// state: off (not configured) | connecting | ready | denied (signed in but not on the team) | error | demo
export const fb = { state: "off", error: "", orders: [], ordersLoaded: false, customers: [], customersLoaded: false };
const listeners = new Set();
export function onFirebase(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } } }

export function configured() {
  const c = cfg.FIREBASE;
  return !!(c && c.apiKey && c.projectId);
}

let sdk = null;
let app = null, auth = null, db = null;
let unsubOrders = null, unsubCustomers = null;

async function loadSdk() {
  if (sdk) return sdk;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
  ]);
  sdk = { ...appMod, ...authMod, ...fsMod };
  return sdk;
}

const toMillis = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const fromSnap = (d) => {
  const x = d.data();
  return { ...x, id: d.id, createdAt: toMillis(x.createdAt), updatedAt: toMillis(x.updatedAt) };
};

function friendly(e) {
  const code = (e && e.code) || "";
  if (code === "permission-denied" || code === "firestore/permission-denied") return "denied";
  return (e && e.message) || String(e);
}

// Sign in to Firebase with the Google account already used for the ERP, then start listening for orders.
export async function connect() {
  if (session.mode === "demo") return startDemo();
  if (!configured()) { fb.state = "off"; emit("state"); return; }
  if (fb.state === "connecting" || fb.state === "ready") return;
  fb.state = "connecting"; fb.error = ""; emit("state");
  try {
    const s = await loadSdk();
    if (!app) {
      app = s.initializeApp(cfg.FIREBASE);
      auth = s.getAuth(app);
      try {
        db = s.initializeFirestore(app, { localCache: s.persistentLocalCache({ tabManager: s.persistentMultipleTabManager() }) });
      } catch (e) {
        db = s.getFirestore(app);
      }
      // Local testing against the Firebase emulators (tests/e2e.mjs). Never set in production.
      if (cfg.FIREBASE_EMULATORS) {
        s.connectAuthEmulator(auth, cfg.FIREBASE_EMULATORS.auth, { disableWarnings: true });
        s.connectFirestoreEmulator(db, cfg.FIREBASE_EMULATORS.host, cfg.FIREBASE_EMULATORS.firestorePort);
      }
    }
    const want = String(session.user && session.user.email || "").toLowerCase();
    if (!auth.currentUser || String(auth.currentUser.email || "").toLowerCase() !== want) {
      const cred = cfg.FIREBASE_EMULATORS
        ? s.GoogleAuthProvider.credential(JSON.stringify({ sub: want, email: want, email_verified: true }))
        : s.GoogleAuthProvider.credential(null, await drive.freshToken());
      await s.signInWithCredential(auth, cred);
    }
    fb.state = "ready"; emit("state");
    listenOrders();
    mirrorTeam();
  } catch (e) {
    console.warn("Firebase connect failed", e);
    fb.state = "error"; fb.error = (e && e.message) || String(e); emit("state");
  }
}

// After an admin adds someone to the team, they can try again without reloading.
export function retry() {
  if (fb.state !== "denied" && fb.state !== "error") return;
  if (!auth || !auth.currentUser) { fb.state = "off"; return connect(); }
  fb.state = "ready"; fb.error = ""; emit("state");
  listenOrders();
}

export async function disconnect() {
  if (unsubOrders) unsubOrders(); if (unsubCustomers) unsubCustomers();
  unsubOrders = unsubCustomers = null;
  if (auth) { try { await sdk.signOut(auth); } catch (e) { /* ignore */ } }
  fb.state = "off"; fb.orders = []; fb.customers = []; fb.ordersLoaded = fb.customersLoaded = false;
}

function listenOrders() {
  if (unsubOrders) return;
  const s = sdk;
  const q = s.query(s.collection(db, "orders"), s.orderBy("createdAt", "desc"), s.limit(500));
  let first = true;
  unsubOrders = s.onSnapshot(q, (snap) => {
    const before = new Set(fb.orders.map((o) => o.id));
    fb.orders = snap.docs.map(fromSnap);
    fb.ordersLoaded = true;
    const fresh = first ? [] : fb.orders.filter((o) => !before.has(o.id) && o.status === "placed");
    first = false;
    emit({ type: "orders", fresh });
  }, (e) => {
    unsubOrders = null;
    const m = friendly(e);
    if (m === "denied") fb.state = "denied"; else { fb.state = "error"; fb.error = m; }
    emit("state");
  });
}

// Website customers are only loaded when someone opens that page.
export function listenCustomers() {
  if (fb.state === "demo" || unsubCustomers || fb.state !== "ready") return;
  const s = sdk;
  const q = s.query(s.collection(db, "customers"), s.orderBy("createdAt", "desc"), s.limit(2000));
  unsubCustomers = s.onSnapshot(q, (snap) => {
    fb.customers = snap.docs.map(fromSnap);
    fb.customersLoaded = true;
    emit({ type: "customers" });
  }, (e) => {
    unsubCustomers = null;
    fb.customersLoaded = true;
    fb.error = friendly(e);
    emit({ type: "customers" });
  });
}

export async function updateOrder(id, patch) {
  const by = session.user && session.user.email || "";
  if (fb.state === "demo") {
    const o = fb.orders.find((x) => x.id === id);
    if (o) Object.assign(o, patch, { updatedAt: Date.now(), updatedBy: by });
    emit({ type: "orders", fresh: [] });
    return;
  }
  const s = sdk;
  await s.updateDoc(s.doc(db, "orders", id), { ...patch, updatedAt: s.serverTimestamp(), updatedBy: by });
}

// Firestore rules decide who may see orders. They read the team from staff/{email}, which this keeps
// in step with the ERP's Team list (Settings > Team). Only admins can write it, so for others this quietly does nothing.
let mirrorTimer = null;
export function mirrorTeam() {
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(doMirror, 500);
}

async function doMirror() {
  if (fb.state !== "ready") return;
  const me = store.get("users", userKey(session.user && session.user.email));
  if (!me || me.role !== "admin") return;
  const s = sdk;
  try {
    const snap = await s.getDocs(s.collection(db, "staff"));
    const have = new Map(snap.docs.map((d) => [d.id, d.data()]));
    const batch = s.writeBatch(db);
    let n = 0;
    for (const u of store.all("users")) {
      const email = String(u.email || "").toLowerCase();
      if (!email) continue;
      const role = u.role || "staff";
      const cur = have.get(email);
      if (cur && cur.role === role && cur.name === (u.name || "")) continue;
      batch.set(s.doc(db, "staff", email), { email, name: u.name || "", role, updatedAt: s.serverTimestamp(), updatedBy: session.user.email });
      n++;
    }
    if (n) await batch.commit();
  } catch (e) {
    // Not an admin in Firebase yet (only ovaleggfarm@gmail.com is at first). Nothing to do.
    if (friendly(e) !== "denied") console.warn("Team copy to Firebase failed", e);
  }
}

// ---------------- demo mode ----------------
function startDemo() {
  if (fb.state === "demo") return;
  fb.state = "demo";
  const now = Date.now();
  const H = 3600e3;
  const mk = (id, hoursAgo, name, phone, city, status, items, note = "") => {
    const subtotal = items.reduce((t, i) => t + i.qty * i.price, 0);
    const delivery = subtotal >= 500 ? 0 : 40;
    return {
      id, customerUid: "demo-" + id, status, source: "website", payment: "cod", note,
      customer: { name, phone, email: name.split(" ")[0].toLowerCase() + "@example.com" },
      address: { line1: "House 12, Temple Road", city, pincode: "682001" },
      items, itemCount: items.reduce((t, i) => t + i.qty, 0), subtotal, deliveryCharge: delivery, total: subtotal + delivery,
      createdAt: now - hoursAgo * H, updatedAt: now - hoursAgo * H,
    };
  };
  fb.orders = [
    mk("DEMO7Q2K", 1, "Anjali Menon", "+91 98470 11223", "Kochi", "placed", [{ productId: "5", name: "Mushroom Soup Premix", qty: 3, unit: "pack", price: 60 }], "Please call before delivery"),
    mk("DEMO5M8P", 5, "Rahul Nair", "+91 94460 22334", "Thrissur", "confirmed", [{ productId: "1", name: "Fresh Mushroom 200 g", qty: 2, unit: "pack", price: 80 }, { productId: "5", name: "Mushroom Soup Premix", qty: 1, unit: "pack", price: 60 }]),
    mk("DEMO3H6T", 30, "Fathima S", "+91 90370 33445", "Aluva", "delivered", [{ productId: "5", name: "Mushroom Soup Premix", qty: 10, unit: "pack", price: 60 }]),
  ];
  fb.ordersLoaded = true;
  fb.customers = fb.orders.map((o) => ({ id: o.customerUid, name: o.customer.name, phone: o.customer.phone, email: o.customer.email, createdAt: o.createdAt - 24 * H, source: "website" }));
  fb.customersLoaded = true;
  emit("state");
  emit({ type: "orders", fresh: [] });
}
