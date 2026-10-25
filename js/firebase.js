// Firebase is the ERP's database, shared with ovalfarm.in:
//   - Auth: staff sign in with Google; website customers get logins (createWebsiteAccount).
//   - Firestore: every ERP list lives here. Listeners copy it into the in-memory store
//     (js/store.js) and store writes come back here, so all screens stay synchronous.
//   - Storage: product photos.
// The SDK loads from Google's CDN. Firestore keeps a cache on the device, so the app opens and
// saves offline and catches up when the connection is back.
import { store } from "./store.js";
import { session, can } from "./session.js";
import { catalogChanges } from "./catalog.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const cfg = window.OVAL_CONFIG || {};

// Every Firestore collection the ERP keeps in memory.
export const COLLECTIONS = [
  "settings", "staff", "products", "catalog", "customers", "customerInvites", "orders",
  "batches", "harvests", "productions", "adjustments", "sales", "purchases", "suppliers",
  "expenses", "payments", "employees", "attendance", "tasks",
];
const TIME_FIELDS = new Set(["createdAt", "updatedAt"]);

// status: idle | saving | offline | error
export const fbState = { status: "idle", pending: 0, error: "", loaded: false };
const listeners = new Set();
export function onFirebase(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } } }

export function configured() {
  const c = cfg.FIREBASE;
  return !!(c && c.apiKey && c.projectId);
}

let sdk = null;
let app = null, auth = null, db = null, storage = null;
const unsubs = [];

async function loadSdk() {
  if (sdk) return sdk;
  const [appMod, authMod, fsMod, stMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
    import(SDK + "firebase-storage.js"),
  ]);
  sdk = { ...appMod, ...authMod, ...fsMod, ...stMod };
  return sdk;
}

export async function init() {
  if (app) return;
  const s = await loadSdk();
  app = s.initializeApp(cfg.FIREBASE);
  auth = s.getAuth(app);
  const settings = { ignoreUndefinedProperties: true };
  try {
    db = s.initializeFirestore(app, { ...settings, localCache: s.persistentLocalCache({ tabManager: s.persistentMultipleTabManager() }) });
  } catch (e) {
    db = s.initializeFirestore(app, settings);
  }
  storage = s.getStorage(app);
  // Local testing against the Firebase emulators (tests/). Never set in production.
  const em = cfg.FIREBASE_EMULATORS;
  if (em) {
    s.connectAuthEmulator(auth, em.auth, { disableWarnings: true });
    s.connectFirestoreEmulator(db, em.host, em.firestorePort);
    if (em.storagePort) s.connectStorageEmulator(storage, em.host, em.storagePort);
  }
}

// ---------------- sign-in ----------------
// Resolves with the signed-in Firebase user (kept from the last visit) or null.
export function currentUser() {
  return new Promise((resolve) => {
    const off = sdk.onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

// accessToken comes from the Google sign-in button (js/google.js).
export async function signInWithGoogleToken(accessToken) {
  const em = cfg.FIREBASE_EMULATORS;
  const cred = em
    ? sdk.GoogleAuthProvider.credential(JSON.stringify({ sub: accessToken, email: accessToken, email_verified: true, name: accessToken.split("@")[0] }))
    : sdk.GoogleAuthProvider.credential(null, accessToken);
  return (await sdk.signInWithCredential(auth, cred)).user;
}

export async function signOut() {
  stopSync();
  if (auth) { try { await sdk.signOut(auth); } catch (e) { /* ignore */ } }
}

const OWNERS = () => (cfg.OWNER_EMAILS || ["ovaleggfarm@gmail.com"]).map((e) => e.toLowerCase());

// The person's staff record, creating it for the business owner on first sign-in. null = not on the team.
export async function staffRecord(email) {
  const id = String(email || "").toLowerCase();
  const ref = sdk.doc(db, "staff", id);
  let snap;
  try { snap = await sdk.getDoc(ref); }
  catch (e) {
    if (e.code === "permission-denied") return null;
    throw e;
  }
  if (snap.exists()) return { ...snap.data(), id };
  if (!OWNERS().includes(id)) return null;
  const rec = { email: id, name: session.user.name || id, picture: session.user.picture || "", role: "admin", createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp(), createdBy: id, updatedBy: id };
  await sdk.setDoc(ref, rec);
  return { ...rec, id };
}

// ---------------- keeping the store in step ----------------
const toPlain = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = v && typeof v.toDate === "function" ? v.toDate().toISOString() : v;
  return out;
};

function setStatus(patch) {
  Object.assign(fbState, patch);
  if (!navigator.onLine) fbState.status = "offline";
  else if (fbState.error) fbState.status = "error";
  else fbState.status = fbState.pending ? "saving" : "idle";
  emit({ type: "status" });
}

function track(promise, what) {
  setStatus({ pending: fbState.pending + 1 });
  promise.then(() => setStatus({ pending: fbState.pending - 1, error: "" }), (e) => {
    console.error("Firestore write failed", what, e);
    const msg = e.code === "permission-denied" ? "You don't have permission to change this." : e.message || String(e);
    setStatus({ pending: fbState.pending - 1 });
    emit({ type: "error", message: "Not saved: " + msg });
  });
}

export const backend = {
  write(name, id, data, isNew) {
    const out = { ...data };
    delete out.id;
    for (const k of TIME_FIELDS) if (k in out) out[k] = sdk.serverTimestamp();
    const ref = sdk.doc(db, name, id);
    track(isNew ? sdk.setDoc(ref, out) : sdk.updateDoc(ref, out), name + "/" + id);
  },
  remove(name, id) {
    track(sdk.deleteDoc(sdk.doc(db, name, id)), "delete " + name + "/" + id);
  },
};

// Starts a listener per collection. Resolves once every collection has loaded (from the device
// cache or the server), or after a few seconds so a slow connection doesn't block the app.
export function startSync() {
  stopSync();
  let waiting = COLLECTIONS.length;
  const ready = new Promise((resolve) => {
    const done = () => { if (--waiting === 0) resolve(); };
    for (const name of COLLECTIONS) {
      let first = true;
      const off = sdk.onSnapshot(sdk.collection(db, name), (snap) => {
        const changes = snap.docChanges().map((ch) => ({ id: ch.doc.id, data: ch.type === "removed" ? null : toPlain(ch.doc.data({ serverTimestamps: "estimate" })) }));
        if (changes.length || first) store.applyRemote(name, changes);
        if (first) { first = false; done(); }
      }, (e) => {
        console.warn("Listener failed for " + name, e);
        if (first) { first = false; done(); }
      });
      unsubs.push(off);
    }
    setTimeout(resolve, 8000);
  });
  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);
  unsubs.push(() => { window.removeEventListener("online", onNet); window.removeEventListener("offline", onNet); });
  unsubs.push(store.on((meta) => { if (meta.type === "local" || meta.type === "remote") scheduleCatalog(); }));
  return ready.then(() => { fbState.loaded = true; setStatus({}); scheduleCatalog(); });
}

function onNet() { setStatus({}); }

export function stopSync() {
  while (unsubs.length) { try { unsubs.pop()(); } catch (e) { /* ignore */ } }
  clearTimeout(catalogTimer);
}

// ---------------- website catalog ----------------
// Keeps the public "catalog" copy of published products (and their stock) up to date.
// Any team member who can edit does this from their open ERP; the writes are the same whoever does it.
let catalogTimer = null;
function scheduleCatalog() {
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(syncCatalog, 2500);
}

export async function syncCatalog() {
  if (!fbState.loaded || !can("write")) return 0;
  const changes = catalogChanges();
  if (!changes.length) return 0;
  const batch = sdk.writeBatch(db);
  for (const ch of changes.slice(0, 400)) {
    const ref = sdk.doc(db, "catalog", ch.id);
    if (ch.data) batch.set(ref, { ...ch.data, updatedAt: sdk.serverTimestamp() });
    else batch.delete(ref);
  }
  track(batch.commit(), "catalog");
  return changes.length;
}

// ---------------- website logins for customers ----------------
let accountsAuth = null;
async function accounts() {
  if (accountsAuth) return accountsAuth;
  // A second Firebase connection, so creating a customer's login doesn't sign the staff member out.
  const second = sdk.initializeApp(cfg.FIREBASE, "customer-accounts");
  accountsAuth = sdk.initializeAuth(second, { persistence: sdk.inMemoryPersistence });
  if (cfg.FIREBASE_EMULATORS) sdk.connectAuthEmulator(accountsAuth, cfg.FIREBASE_EMULATORS.auth, { disableWarnings: true });
  return accountsAuth;
}

export function tempPassword() {
  const words = ["Mango", "Pepper", "Lotus", "Coconut", "Cardamom", "Monsoon", "Banyan", "Jasmine", "Tamarind", "Ginger"];
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return words[bytes[0] % words.length] + "-" + String(1000 + ((bytes[1] << 8 | bytes[2]) % 9000));
}

// Creates an email + password login on ovalfarm.in. Resolves { uid, password }.
// Rejects with code "auth/email-already-in-use" when the email already has a login.
export async function createWebsiteAccount(email) {
  const a = await accounts();
  const password = tempPassword();
  const cred = await sdk.createUserWithEmailAndPassword(a, email, password);
  const uid = cred.user.uid;
  await sdk.signOut(a);
  return { uid, password };
}

// Firebase's own "set your password" email (free). The link brings them back to the site's login page.
export async function sendSetupEmail(email) {
  const a = await accounts();
  await sdk.sendPasswordResetEmail(a, email, { url: (cfg.SHOP_URL || "https://ovalfarm.in") + "/account/login" });
}

// ---------------- product photos ----------------
function shrink(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that picture"))), "image/jpeg", 0.85);
    };
    img.onerror = () => reject(new Error("That file isn't a picture we can read"));
    img.src = URL.createObjectURL(file);
  });
}

// Resolves with the picture's public web address.
export async function uploadProductImage(file, productId) {
  const blob = await shrink(file);
  if (session.mode === "demo") return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  const ref = sdk.ref(storage, `products/${productId}/${Date.now()}.jpg`);
  try {
    await sdk.uploadBytes(ref, blob, { contentType: "image/jpeg", cacheControl: "public, max-age=31536000" });
  } catch (e) {
    if (/storage\/(unknown|unauthorized|bucket-not-found|project-not-found)/.test(e.code || "")) throw new Error("Photo storage isn't switched on yet (Firebase console > Storage). You can paste a picture link instead.");
    throw e;
  }
  return await sdk.getDownloadURL(ref);
}
