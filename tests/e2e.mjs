// End-to-end: two users share one (fake) Google Drive folder.
// Run: python -m http.server 8765 &  then  node tests/e2e.mjs  (needs: npm i -g playwright)
import { chromium } from "playwright";
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8765/index.html";
const files = {}; let nextId = 1;
const users = { tokA: { email: "owner@ovalfarms.in", name: "Oval Owner" }, tokB: { email: "staff@gmail.com", name: "Staff Person" } };
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

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function newUser(token, vp = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await ctx.route("https://www.googleapis.com/**", handle);
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
check(JSON.parse(dataFile().content).collections.users["owner@ovalfarms.in"].role === "admin", "first user registered as admin");

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

log("errors A:", JSON.stringify(A.errors), "errors B:", JSON.stringify(B.errors));
log(fail ? `${fail} FAILED` : "ALL PASSED");
await browser.close();
process.exit(fail ? 1 : 0);
