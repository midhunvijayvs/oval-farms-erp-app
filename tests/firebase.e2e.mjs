// End-to-end against the Firebase emulators: the ERP in a browser and the website (ovalfarm.in) as a
// second Firebase client in this script, sharing one database.
//  - the owner signs in; the website products are added and copied to the public catalog
//  - a customer added in the ERP gets a website login, signs in with the temporary password and orders
//  - a customer who signs up on the website shows in the same customers list
//  - unpublishing a product takes it off the catalog
// Run: python3 -m http.server 8765 &  then
//   firebase emulators:exec --only auth,firestore --project demo-oval "node tests/firebase.e2e.mjs"
// Needs: npm i playwright firebase@12.19.0  (and firebase-tools for the emulators)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, collection, getDocs, query, where, orderBy, addDoc, setDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";

const BASE = "http://localhost:8765/index.html";
const FB_CONFIG = { apiKey: "fake-key", authDomain: "demo-oval.firebaseapp.com", projectId: "demo-oval", appId: "1:1:web:1" };
const SDK_DIR = createRequire(process.cwd() + "/").resolve("firebase/package.json").replace(/package\.json$/, "");
let fail = 0;
const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fail++; };
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { const v = await fn().catch(() => null); if (v || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 250)); } };

// The website's side, as src/customer/firebase.js sets it up
const site = initializeApp(FB_CONFIG, "site");
const siteAuth = getAuth(site);
connectAuthEmulator(siteAuth, "http://127.0.0.1:9099", { disableWarnings: true });
const siteDb = getFirestore(site);
connectFirestoreEmulator(siteDb, "127.0.0.1", 8080);
const catalog = async () => (await getDocs(query(collection(siteDb, "catalog"), orderBy("display_order")))).docs.map((d) => ({ id: d.id, ...d.data() }));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
await ctx.route("https://ovalfarm.in/**", (r) => r.fulfill({ status: 404, body: "" }));
await ctx.route("**/config.js", async (r) => {
  let body = await (await r.fetch()).text();
  body += `\nwindow.OVAL_CONFIG.FIREBASE = ${JSON.stringify(FB_CONFIG)};\nwindow.OVAL_CONFIG.FIREBASE_EMULATORS = { auth: "http://127.0.0.1:9099", host: "127.0.0.1", firestorePort: 8080, signInAs: "ovaleggfarm@gmail.com" };`;
  r.fulfill({ status: 200, contentType: "text/javascript", body });
});
// Serve the Firebase SDK from node_modules instead of Google's CDN
await ctx.route("https://www.gstatic.com/firebasejs/**", (r) => {
  const file = new URL(r.request().url()).pathname.split("/").pop();
  r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(SDK_DIR + "/" + file) });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/fonts|favicon|ovalfarm\.in|404/.test(m.text())) errors.push(m.text()); });
page.on("dialog", (d) => d.accept());

// ---- Owner signs in; website products are added and published ----
await page.goto(BASE);
await page.click("[data-signin]", { timeout: 10000 });
await page.waitForSelector(".shell", { timeout: 15000 });
await page.goto(BASE + "#/products");
await page.waitForSelector("tr[data-id]");
check((await page.textContent("#view")).includes("Mushroom Soup Premix"), "website products added to Products & Materials");
let cat = await waitFor(async () => { const c = await catalog(); return c.length === 7 ? c : null; });
check(cat && cat.length === 7, `public catalog has the 7 website products (${cat ? cat.length : 0})`);
check(cat && cat[0].id === "white-oyster-mushrooms" && cat[4].price === 60 && cat.every((p) => p.in_stock === true), "catalog keeps the display order, prices and stock");
check(cat && !("costPrice" in cat[0]) && !("purchasePrice" in cat[0]), "catalog has no cost prices");

// ---- Customer added in the ERP gets a website login ----
await page.goto(BASE + "#/customers");
await page.waitForSelector("[data-new]");
await page.click("[data-new]:visible");
await page.waitForSelector(".modal [name=name]");
await page.fill(".modal [name=name]", "Meera Das");
await page.fill(".modal [name=phone]", "9847012345");
await page.fill(".modal [name=email]", "meera@example.com");
await page.click(".modal-foot .btn-primary");
await page.waitForSelector(".cred", { timeout: 10000 });
const password = (await page.textContent(".cred")).match(/[A-Z][a-z]+-\d{4}/)?.[0];
check(!!password, `ERP shows the temporary password (${password})`);
await page.click(".modal-foot .btn-primary");

// ---- She signs in on the website and orders ----
const meera = (await signInWithEmailAndPassword(siteAuth, "meera@example.com", password)).user;
const mine = await getDocs(query(collection(siteDb, "customers"), where("uid", "==", meera.uid)));
check(mine.size === 1 && mine.docs[0].data().channel === "offline", "website finds her ERP customer record by login");
const customerId = mine.docs[0].id;
// First sign-in marks the login as registered (src/customer/CustomerContext.js)
await updateDoc(mine.docs[0].ref, { accountStatus: "active", lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() });
const soup = cat.find((p) => p.id === "mushroom-soup-premix");
const order = await addDoc(collection(siteDb, "orders"), {
  customerUid: meera.uid, customerId, channel: "online", source: "Website",
  customer: { name: "Meera Das", phone: "+91 9847012345", email: "meera@example.com" },
  address: { line1: "Rose Villa", city: "Kozhikode", pincode: "673001" },
  items: [{ productId: soup.id, name: soup.name, qty: 2, unit: "pack", price: soup.price }],
  itemCount: 2, subtotal: 120, deliveryCharge: 0, total: 120, note: "", payment: "cod", status: "placed",
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
await signOut(siteAuth);

await page.goto(BASE + "#/orders");
const row = await waitFor(async () => { const t = await page.textContent("#view"); return t.includes("Meera Das") ? t : null; });
check(!!row && row.includes("Online"), "her website order shows in the ERP orders list as Online");
await page.goto(BASE + "#/orders/" + order.id);
await page.waitForSelector(".page-head h1");
await page.click('a[href^="#/sales/new?order="]');
await page.waitForSelector("[data-order]");
check((await page.$eval(".line [data-f=itemId]", (s) => s.options[s.selectedIndex].textContent)).includes("Mushroom Soup Premix"), "invoice from the website order matches the product");
await page.click("[data-save]");
await page.waitForSelector(".paper");
check((await page.textContent(".paper")).includes("120.00"), "invoice total matches the order");

await page.goto(BASE + "#/customers");
await page.waitForSelector("tr[data-id]");
const meeraRow = await waitFor(async () => (await page.$$eval("tr[data-id]", (trs) => trs.map((t) => t.textContent).find((x) => x.includes("Meera Das") && x.includes("Registered")))) || null);
check(!!meeraRow, "her login shows as registered once she has signed in");

// ---- Someone signs up on the website ----
const anjali = (await createUserWithEmailAndPassword(siteAuth, "anjali@example.com", "secret123")).user;
await setDoc(doc(siteDb, "customers", anjali.uid), {
  name: "Anjali Menon", email: "anjali@example.com", addresses: [], channel: "online", uid: anjali.uid, accountStatus: "active",
  lastLoginAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
await signOut(siteAuth);
const anjaliRow = await waitFor(async () => (await page.$$eval("tr[data-id]", (trs) => trs.map((t) => t.textContent).find((x) => x.includes("Anjali Menon")))) || null);
check(!!anjaliRow && anjaliRow.includes("Online"), "website sign-up shows in the same customers list as Online");

// ---- Admin adds a manager to the team ----
await page.goto(BASE + "#/settings");
await page.click('[data-tab="team"]');
await page.fill("[data-new-email]", "Brother@Gmail.com");
await page.selectOption("[data-new-role]", "manager");
await page.click("[data-add-member]");
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector(".shell", { timeout: 15000 });
await page.goto(BASE + "#/settings");
await page.click('[data-tab="team"]');
const teamRow = await waitFor(async () => (await page.$$eval("tbody tr", (trs) => trs.map((t) => t.textContent).find((x) => x.includes("brother@gmail.com")))) || null);
check(!!teamRow && (await page.$eval('[data-role="brother@gmail.com"]', (s) => s.value)) === "manager", "team member saved as Manager");
await page.click('[data-remove="brother@gmail.com"]');
await page.click(".modal-foot .btn-primary");
await page.waitForTimeout(500);
check(!(await page.textContent("#view")).includes("brother@gmail.com"), "team member removed");

// ---- Unpublishing takes a product off the website ----
await page.goto(BASE + "#/products");
await page.waitForSelector("tr[data-id]");
await page.click('tr[data-id="mushroom-spawn"]');
await page.waitForSelector(".modal [name=published]");
await page.uncheck(".modal [name=published]");
await page.click(".modal-foot .btn-primary");
cat = await waitFor(async () => { const c = await catalog(); return c.length === 6 ? c : null; });
check(cat && !cat.some((p) => p.id === "mushroom-spawn"), "unpublished product leaves the catalog");

// ---- Pack sizes: one product shows as one website product per pack ----
await page.click('tr[data-id="white-oyster-mushrooms"]');
await page.waitForSelector(".modal [data-pack-add]");
for (const [name, size, price] of [["Small", 1, 90], ["Family", 4, 320]]) {
  await page.click(".modal [data-pack-add]");
  const r = page.locator(".modal .pack-row").last();
  await r.locator('[data-pk="name"]').fill(name);
  await r.locator('[data-pk="size"]').fill(String(size));
  await r.locator('[data-pk="price"]').fill(String(price));
}
await page.click(".modal-foot .btn-primary");
cat = await waitFor(async () => { const c = await catalog(); return c.filter((p) => p.product_id === "white-oyster-mushrooms").length === 2 ? c : null; });
const packs = cat ? cat.filter((p) => p.product_id === "white-oyster-mushrooms") : [];
check(packs.length === 2 && !cat.some((p) => p.id === "white-oyster-mushrooms"), "each pack size is its own catalog entry");
const fam = packs.find((p) => p.pack_name === "Family");
check(fam && fam.price === 320 && fam.pack_size === 4 && fam.name.includes("Family"), "pack entry has its own name, price and size");
await signInWithEmailAndPassword(siteAuth, "meera@example.com", password);
const packOrder = await addDoc(collection(siteDb, "orders"), {
  customerUid: meera.uid, customerId, channel: "online", source: "Website",
  customer: { name: "Meera Das", phone: "+91 9847012345", email: "meera@example.com" },
  address: { line1: "Rose Villa", city: "Kozhikode", pincode: "673001" },
  items: [{ productId: fam.product_id, packId: fam.pack_id, size: fam.pack_size, name: fam.name, qty: 1, unit: fam.unit, price: fam.price }],
  itemCount: 1, subtotal: 320, deliveryCharge: 0, total: 320, note: "", payment: "cod", status: "placed",
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
await signOut(siteAuth);
await waitFor(async () => { await page.goto(BASE + "#/orders/" + packOrder.id); await page.waitForSelector(".page-head h1", { timeout: 2000 }); return (await page.textContent("#view")).includes("Family"); });
await page.click('a[href^="#/sales/new?order="]');
await page.waitForSelector("[data-order]");
check((await page.$eval(".line [data-f=itemId]", (s) => s.options[s.selectedIndex].textContent)).includes("Family"), "invoice from a website pack order picks that pack");
await page.click("[data-save]");
await page.waitForSelector(".paper");
check((await page.textContent(".paper")).includes("320.00"), "pack invoice total matches the order");

check(!errors.length, `no console errors ${errors.join(" | ")}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
