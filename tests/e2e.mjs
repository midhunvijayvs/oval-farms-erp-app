// End-to-end: two users share one (fake) Google Drive folder.
// Run: python -m http.server 8765 &  then  node tests/e2e.mjs  (needs: npm i -g playwright)
// With Firebase (online orders): npm i firebase@12.19.0, then
//   FIREBASE_E2E=1 firebase emulators:exec --only auth,firestore --project demo-oval "node tests/e2e.mjs"
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const FB = process.env.FIREBASE_E2E === "1";
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8765/index.html";
const files = {}; let nextId = 1;
const OWNER = FB ? "ovaleggfarm@gmail.com" : "owner@ovalfarms.in"; // Firestore rules make ovaleggfarm the owner
const users = { tokA: { email: OWNER, name: "Oval Owner" }, tokB: { email: "staff@gmail.com", name: "Staff Person" } };
const log = (...a) => console.log(...a);
let fail = 0;
const check = (cond, msg) => { log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fail++; };

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const tok = (req.headers()["authorization"] || "").replace("Bearer ", "");
  const json = (o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
  if (!users[tok]) return json({ error: { message: "unauth" } }, 401);
  if (url.pathname === "/oauth2/v3/userinfo") return json(users[tok]);
  const m = url.pathname.match(/^\/(upload\/)?drive\/v3\/files\/?([^/]*)$/);
  if (!m) return json({ error: { message: "nope " + url.pathname } }, 404);
  const id = m[2];
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, version: String(f.version), modifiedTime: new Date().toISOString(), capabilities: { canEdit: true, canAddChildren: true }, lastModifyingUser: { displayName: f.by } });
  if (req.method() === "GET" && !id) {
    const q = url.searchParams.get("q");
    const [, parent, name] = q.match(/'([^']+)' in parents and name='([^']+)'/);
    return json({ files: Object.values(files).filter((f) => f.parents.includes(parent) && f.name === name).map(meta) });
  }
  if (req.method() === "GET") {
    const f = files[id];
    if (!f) return json({ error: { message: "File not found" } }, 404);
    if (url.searchParams.get("alt") === "media") return route.fulfill({ status: 200, contentType: "application/json", body: f.content });
    return json(meta(f));
  }
  if (req.method() === "POST" && !m[1]) {
    const body = JSON.parse(req.postData());
    const f = { id: "fld" + nextId++, name: body.name, mimeType: body.mimeType, parents: [], version: 1, content: "", by: users[tok].name };
    files[f.id] = f; return json(meta(f));
  }
  // multipart upload
  const raw = req.postData();
  const parts = raw.split(/--ovalerp[a-z0-9]+/).filter((p) => p.includes("Content-Type"));
  const md = JSON.parse(parts[0].split("\r\n\r\n")[1].trim());
  const content = parts[1].split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
  if (req.method() === "POST") {
    const f = { id: "file" + nextId++, name: md.name, mimeType: md.mimeType, parents: md.parents, version: 1, content, by: users[tok].name };
    files[f.id] = f; return json(meta(f));
  }
  const f = files[id]; f.content = content; f.version++; f.by = users[tok].name; return json(meta(f));
}

const fakeGis = (token) => `
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: "${token}", expires_in: 3600 }), 20) }),
    hasGrantedAllScopes: () => true, revoke: (t, cb) => cb && cb() } } };`;

const FB_CONFIG = { apiKey: "fake-key", authDomain: "demo-oval.firebaseapp.com", projectId: "demo-oval", appId: "1:1:web:1" };
const SDK_DIR = FB ? createRequire(process.cwd() + "/").resolve("firebase/package.json").replace(/package\.json$/, "") : "";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function newUser(token, vp = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await ctx.route("https://www.googleapis.com/**", handle);
  // Use the fake Drive's folder rather than the real one in config.js.
  await ctx.route("**/config.js", async (r) => {
    let body = (await (await r.fetch()).text()).replace(/DEFAULT_FOLDER_ID: "[^"]*"/, 'DEFAULT_FOLDER_ID: ""');
    if (FB) body += `\nwindow.OVAL_CONFIG.FIREBASE = ${JSON.stringify(FB_CONFIG)};\nwindow.OVAL_CONFIG.FIREBASE_EMULATORS = { auth: "http://127.0.0.1:9099", host: "127.0.0.1", firestorePort: 8080 };`;
    r.fulfill({ status: 200, contentType: "text/javascript", body });
  });
  // Serve the Firebase SDK from node_modules instead of Google's CDN.
  if (FB) await ctx.route("https://www.gstatic.com/firebasejs/**", (r) => {
    const file = new URL(r.request().url()).pathname.split("/").pop();
    r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(SDK_DIR + "/" + file) });
  });
  await ctx.addInitScript(fakeGis(token));
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts/.test(m.text())) page.errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  return page;
}

// ---- Owner creates the folder ----
const A = await newUser("tokA");
await A.goto(BASE);
await A.click("[data-signin]", { timeout: 8000 });
await A.waitForSelector("[data-create]");
await A.click("[data-create]");
await A.waitForSelector(".shell");
await A.waitForTimeout(2500);
const folderId = Object.values(files).find((f) => f.mimeType.includes("folder")).id;
const dataFile = () => Object.values(files).find((f) => f.name === "oval-farms-erp-data.json");
check(!!dataFile(), "data file created in the shared folder");
check(JSON.parse(dataFile().content).collections.users[OWNER].role === "admin", "first user registered as admin");

// Owner adds an item via the form
await A.goto(BASE + "#/items?new=1");
await A.waitForSelector(".modal [name=name]");
await A.fill(".modal [name=name]", "Oyster Mushroom (Fresh)");
await A.selectOption(".modal [name=category]", "Fresh Mushroom");
await A.selectOption(".modal [name=unit]", "kg");
await A.fill(".modal [name=salePrice]", "280");
await A.fill(".modal [name=openingStock]", "10");
await A.click(".modal .btn-primary");
await A.waitForTimeout(2500);
check(JSON.stringify(JSON.parse(dataFile().content).collections.items).includes("Oyster Mushroom"), "owner's new item reached Drive");

// Owner fills business profile
await A.goto(BASE + "#/settings");
await A.fill("[data-biz] [name=name]", "Oval Farms");
await A.fill("[data-biz] [name=gstin]", "32ABCDE1234F1Z5");
await A.click("[data-savebiz]");

// ---- Staff joins with invite link ----
const B = await newUser("tokB", { width: 390, height: 844 });
await B.goto(BASE + "?folder=" + folderId);
await B.click("[data-signin]", { timeout: 8000 });
await B.waitForSelector(".shell");
await B.waitForTimeout(2500);
await B.goto(BASE + "#/stock");
await B.waitForTimeout(400);
check((await B.textContent("#view")).includes("Oyster Mushroom"), "staff sees owner's item after joining");
check((await B.textContent("#meRole")).includes("Staff"), "second user joins as Staff");
check(!(await B.textContent("#nav")).includes("Expenses"), "staff can't see Expenses");

// Staff creates an invoice through the editor
await B.goto(BASE + "#/sales/new");
await B.waitForSelector(".line [data-f=itemId]");
const itemId = await B.$eval(".line [data-f=itemId] option:nth-child(2)", (o) => o.value);
await B.selectOption(".line [data-f=itemId]", itemId);
await B.waitForTimeout(100);
await B.fill(".line [data-f=qty]", "4");
await B.press(".line [data-f=qty]", "Tab");
await B.waitForTimeout(100);
await B.screenshot({ path: OUT + "/e2e-staff-invoice-edit.png", fullPage: true });
await B.click("[data-save]");
await B.waitForSelector(".paper");
check((await B.textContent(".paper")).includes("1,120.00"), "invoice total = 4 kg × ₹280 = ₹1,120");
await B.screenshot({ path: OUT + "/e2e-staff-invoice.png", fullPage: true });
await B.waitForTimeout(2500);

// Owner sees it (poll via Sync now)
await A.goto(BASE + "#/stock");
await A.click("#syncPill");
await A.waitForTimeout(1500);
const stockText = await A.textContent("#view");
check(stockText.includes("6") && /Oyster Mushroom \(Fresh\)[\s\S]*6/.test(stockText), "owner's stock dropped 10 → 6 after staff's sale");

// Owner records payment from invoice
await A.goto(BASE + "#/sales");
await A.waitForTimeout(300);
await A.click("tr[data-id]");
await A.waitForSelector("[data-pay]");
await A.click("[data-pay]");
await A.waitForSelector(".modal [name=amount]");
check((await A.inputValue(".modal [name=amount]")) === "1120", "payment amount pre-filled with balance");
await A.click(".modal .btn-primary");
await A.waitForTimeout(500);
check((await A.textContent(".page-head")).includes("Paid"), "invoice shows Paid after payment");

// Concurrent edits: both edit different records before syncing
await A.goto(BASE + "#/customers?new=1");
await A.fill(".modal [name=name]", "Hotel Green Leaf");
await A.click(".modal .btn-primary");
await B.goto(BASE + "#/customers?new=1");
await B.fill(".modal [name=name]", "FreshMart");
await B.click(".modal .btn-primary");
await A.waitForTimeout(3000);
await A.click("#syncPill"); await A.waitForTimeout(1500);
await B.click("#syncPill"); await B.waitForTimeout(1500);
const custs = Object.values(JSON.parse(dataFile().content).collections.customers).map((c) => c.name).sort();
check(JSON.stringify(custs) === JSON.stringify(["FreshMart", "Hotel Green Leaf"]), "both users' simultaneous customers kept: " + custs.join(", "));

// Owner promotes staff to manager
await A.goto(BASE + "#/settings");
await A.click("[data-tab=team]");
await A.selectOption("[data-role='staff@gmail.com']", "manager");
await A.waitForTimeout(2500);
await B.click("#syncPill"); await B.waitForTimeout(1500);
check((await B.textContent("#meRole")).includes("Manager"), "role change reached the staff user");

// Production run
await A.goto(BASE + "#/items?new=1");
await A.fill(".modal [name=name]", "Dried Oyster 100 g");
await A.selectOption(".modal [name=category]", "Value-Added Product");
await A.selectOption(".modal [name=unit]", "pack");
await A.fill(".modal [name=shelfLifeDays]", "180");
await A.click(".modal .btn-primary");
await A.goto(BASE + "#/production/new");
await A.waitForSelector("[data-h=outputItemId]");
const dried = await A.$eval("[data-h=outputItemId]", (s) => [...s.options].find((o) => o.text.includes("Dried")).value);
await A.selectOption("[data-h=outputItemId]", dried);
await A.fill("[data-h=outputQty]", "5");
await A.press("[data-h=outputQty]", "Tab");
await A.selectOption(".line [data-f=itemId]", itemId);
await A.fill(".line [data-f=qty]", "2");
await A.press(".line [data-f=qty]", "Tab");
check((await A.inputValue("[data-h=expiryDate]")) !== "", "expiry auto-filled from shelf life");
await A.click("[data-save]");
await A.waitForTimeout(300);
await A.goto(BASE + "#/stock");
await A.waitForTimeout(300);
const st2 = await A.textContent("#view");
check(/Dried Oyster 100 g[\s\S]*?5/.test(st2), "production added 5 packs");
await A.screenshot({ path: OUT + "/e2e-owner-stock.png", fullPage: true });

// ---- Online orders through Firebase (emulators) ----
if (FB) {
  const req = createRequire(process.cwd() + "/");
  const { initializeApp } = await import(req.resolve("firebase/app"));
  const au = await import(req.resolve("firebase/auth"));
  const fs = await import(req.resolve("firebase/firestore"));
  const capp = initializeApp(FB_CONFIG, "customer");
  const cauth = au.getAuth(capp);
  au.connectAuthEmulator(cauth, "http://127.0.0.1:9099", { disableWarnings: true });
  const cdb = fs.getFirestore(capp);
  fs.connectFirestoreEmulator(cdb, "127.0.0.1", 8080);
  // A customer signs up with email and password on the website and places an order.
  const cred = await au.createUserWithEmailAndPassword(cauth, "asha@example.com", "secret123");
  const uid = cred.user.uid;
  await fs.setDoc(fs.doc(cdb, "customers", uid), { name: "Asha Thomas", phone: "+91 98950 12345", email: "asha@example.com", addresses: [], source: "website", createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
  const ref = await fs.addDoc(fs.collection(cdb, "orders"), {
    customerUid: uid, customer: { name: "Asha Thomas", phone: "+91 98950 12345", email: "asha@example.com" },
    address: { line1: "Rose Villa, Market Road", city: "Kottayam", pincode: "686001" },
    items: [{ productId: "5", name: "Oyster Mushroom (Fresh)", qty: 2, unit: "kg", price: 280 }], itemCount: 2, subtotal: 560, deliveryCharge: 0, total: 560,
    payment: "cod", note: "", status: "placed", source: "website", createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp(),
  });
  // The owner sees it live, and the team list has been copied into Firebase.
  await A.goto(BASE + "#/orders");
  await A.waitForSelector(`tr[data-id="${ref.id}"]`, { timeout: 15000 });
  check((await A.textContent("#view")).includes("Asha Thomas"), "owner sees the website order");
  check((await A.textContent('[data-badge="orders"]')) === "1", "owner's nav badge counts the new order");
  // A second order arrives while the owner is looking: it shows up without a reload.
  const ref2 = await fs.addDoc(fs.collection(cdb, "orders"), { ...(await fs.getDoc(ref)).data(), createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
  await A.waitForSelector(`tr[data-id="${ref2.id}"]`, { timeout: 15000 });
  check(true, "second order appears live");
  await A.screenshot({ path: OUT + "/e2e-online-orders.png", fullPage: true });
  // Staff: copied across by the owner's ERP, so staff can see orders too.
  await A.click("#syncPill");
  await A.waitForTimeout(2500);
  await B.goto(BASE + "#/orders");
  await B.waitForTimeout(1500);
  if (await B.$("[data-retry]")) { await B.click("[data-retry]"); }
  await B.waitForSelector(`tr[data-id="${ref.id}"]`, { timeout: 15000 });
  check(true, "staff sees website orders after the owner's ERP copied the team list");
  await B.goto(BASE + "#/orders/" + ref.id);
  await B.waitForSelector("[data-next]");
  await B.click("[data-next]");
  await B.waitForTimeout(1500);
  check((await fs.getDoc(ref)).data().status === "confirmed", "staff confirmed the order and the customer's copy says confirmed");
  // Staff makes the invoice from the order: the item matches by name.
  await B.click("[data-invoice]");
  await B.waitForSelector(".line [data-f=itemId]");
  check((await B.$eval(".line [data-f=itemId]", (x) => x.value)) !== "", "website item matched to the ERP product");
  await B.click("[data-save]");
  await B.waitForSelector(".paper");
  await B.waitForTimeout(1500);
  check(/^INV/.test((await fs.getDoc(ref)).data().invoiceNumber || ""), "order linked to its invoice in Firebase");
  // The customer can't touch it any more.
  let blocked = false;
  try { await fs.updateDoc(ref, { status: "cancelled", updatedAt: fs.serverTimestamp() }); } catch (e) { blocked = e.code === "permission-denied"; }
  check(blocked, "customer can't cancel an order after it's confirmed");
}

log("errors A:", JSON.stringify(A.errors), "errors B:", JSON.stringify(B.errors));
log(fail ? `${fail} FAILED` : "ALL PASSED");
await browser.close();
process.exit(fail ? 1 : 0);
