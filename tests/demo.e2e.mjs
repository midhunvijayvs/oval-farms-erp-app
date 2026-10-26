// End-to-end in demo mode (sample data in the browser, no Firebase needed):
// orders with status tabs, a new phone order, invoice from an order, products with website
// details and display order, customers with website logins.
// Run: python3 -m http.server 8765 &  then  node tests/demo.e2e.mjs [screenshot-dir]  (needs: npm i playwright)
import { chromium } from "playwright";
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8765/index.html";
let fail = 0;
const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fail++; };
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("https://ovalfarm.in/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|favicon/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  const tag = vp.width < 500 ? "phone" : "desktop";
  const view = () => page.textContent("#view");

  await page.goto(BASE);
  await page.click("[data-demo]", { timeout: 8000 });
  await page.waitForSelector(".shell");

  // Menu
  const nav = await page.textContent("#nav");
  check(nav.includes("Orders") && !nav.includes("Online Orders") && !nav.includes("Website Customers") && nav.includes("Products & Materials"), `${tag}: menu says Orders, no separate website customers`);

  // Orders list with tabs
  await page.goto(BASE + "#/orders");
  await page.waitForSelector("tr[data-id]");
  let text = await view();
  const openRows = (await page.$$("tr[data-id]")).length;
  check(text.includes("Anjali Menon") && text.includes("Hotel Green Leaf"), `${tag}: Open tab shows open orders`);
  check(text.includes("Online") && text.includes("Offline"), `${tag}: channel column`);
  check((await page.textContent('[data-badge="orders"]')) === "1", `${tag}: nav badge shows 1 new order`);
  await page.click('[data-tab="all"]');
  text = await view();
  check((await page.$$("tr[data-id]")).length > openRows && text.includes("INV-"), `${tag}: All tab adds delivered, invoiced orders`);
  await page.click('[data-tab="placed"]');
  check((await page.$$("tr[data-id]")).length === 1, `${tag}: New tab shows the one new order`);
  await page.click('[data-tab="open"]');
  await page.screenshot({ path: `${OUT}/orders-${tag}.png`, fullPage: true });

  // New phone order for a walk-in customer
  await page.goto(BASE + "#/orders/new");
  await page.waitForSelector("[data-save]");
  await page.selectOption('.line [data-f="productId"]', { label: "Mushroom Soup Premix 25 g" });
  await page.fill('.line [data-f="qty"]', "4");
  await page.press('.line [data-f="qty"]', "Tab");
  await page.waitForTimeout(150);
  check((await page.textContent(".totals .grand")).includes("240.00"), `${tag}: order total 4 × ₹60`);
  await page.screenshot({ path: `${OUT}/order-new-${tag}.png`, fullPage: true });
  await page.click("[data-save]");
  await page.waitForSelector(".page-head h1");
  const h1 = await page.textContent(".page-head h1");
  check(/OF-[A-Z0-9]{6}/.test(h1) && h1.includes("Offline") && h1.includes("Confirmed"), `${tag}: phone order saved as offline (${h1.trim()})`);

  // Invoice from that order
  await page.click('a[href^="#/sales/new?order="]');
  await page.waitForSelector("[data-order]");
  check((await page.$eval("[data-order]", (s) => s.options[s.selectedIndex].textContent)).startsWith("OF-"), `${tag}: invoice has the order selected`);
  check((await page.$eval(".line [data-f=qty]", (i) => i.value)) === "4", `${tag}: quantity carried to invoice`);
  await page.click("[data-save]");
  await page.waitForSelector(".paper");
  check((await page.textContent(".paper")).includes("240.00"), `${tag}: invoice total matches the order (GST-inclusive price)`);
  await page.click('.page-actions a[href^="#/orders/"]');
  await page.waitForSelector(".page-head h1");
  check((await view()).includes("INV-"), `${tag}: order links to its invoice`);

  // Invoices need an order
  await page.goto(BASE + "#/sales/new");
  await page.waitForSelector("[data-order]");
  await page.selectOption(".line [data-f=itemId]", { index: 1 });
  await page.click("[data-save]");
  await page.waitForTimeout(200);
  check((await page.textContent("#toasts")).includes("Choose the order"), `${tag}: invoice without an order is refused`);
  await page.selectOption("[data-order]", { index: 1 });
  await page.waitForTimeout(150);
  check((await page.$eval('[data-h="customerId"]', (s) => s.options[s.selectedIndex].textContent)) !== "Walk-in customer", `${tag}: choosing the order fills the customer`);

  // Products: website details and order
  await page.goto(BASE + "#/products");
  await page.waitForSelector("tr[data-id]");
  text = await view();
  check(text.includes("On website") && text.includes("Not listed"), `${tag}: website column on products`);
  await page.click("[data-weborder]");
  await page.waitForSelector(".order-list li");
  const first = await page.textContent(".order-list li:first-child b");
  await page.click(".order-list li:nth-child(2) [data-up]");
  const newFirst = await page.textContent(".order-list li:first-child b");
  check(first !== newFirst, `${tag}: arrows reorder website products`);
  await page.screenshot({ path: `${OUT}/website-order-${tag}.png` });
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  await page.click("[data-new]:visible");
  await page.waitForSelector(".modal [name=name]");
  check(await page.$eval('.modal [data-k="webCategory"]', (e) => e.classList.contains("hidden")), `${tag}: website fields hidden until published`);
  await page.fill(".modal [name=name]", "Mushroom Pickle 250 g");
  await page.selectOption(".modal [name=category]", "Value-Added Product");
  await page.selectOption(".modal [name=unit]", "jar");
  await page.fill(".modal [name=salePrice]", "150");
  await page.check(".modal [name=published]");
  await page.waitForTimeout(100);
  check(!(await page.$eval('.modal [data-k="webCategory"]', (e) => e.classList.contains("hidden"))), `${tag}: website fields show when published`);
  await page.selectOption(".modal [name=webCategory]", "Ready to cook");
  await page.setInputFiles(".modal [data-img-file]", { name: "pickle.png", mimeType: "image/png", buffer: PIXEL });
  await page.waitForSelector(".modal .img-thumb img");
  await page.screenshot({ path: `${OUT}/product-form-${tag}.png`, fullPage: true });
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  check((await view()).includes("Mushroom Pickle 250 g"), `${tag}: product with photo saved`);

  // Customers: one list, online/offline, website logins
  await page.goto(BASE + "#/customers");
  await page.waitForSelector("tr[data-id]");
  text = await view();
  check(text.includes("Anjali Menon") && text.includes("FreshMart") && text.includes("Registered") && text.includes("Invited"), `${tag}: online and offline customers in one list with login status`);
  await page.screenshot({ path: `${OUT}/customers-${tag}.png`, fullPage: true });
  await page.click("[data-new]:visible");
  await page.waitForSelector(".modal [name=name]");
  await page.fill(".modal [name=name]", "Meera Das");
  await page.fill(".modal [name=phone]", "9847012345");
  await page.fill(".modal [name=email]", "Meera@Example.com");
  await page.click(".modal-foot .btn-primary");
  await page.waitForSelector(".cred", { timeout: 5000 }).catch(async () => { console.log("toasts:", await page.textContent("#toasts").catch(() => "")); await page.screenshot({ path: `${OUT}/fail-${tag}.png` }); });
  const cred = await page.textContent(".cred");
  check(cred.includes("meera@example.com") && /[A-Z][a-z]+-\d{4}/.test(cred), `${tag}: login created with a temporary password`);
  await page.screenshot({ path: `${OUT}/customer-login-${tag}.png` });
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  const row = await page.$$eval("tr[data-id]", (trs) => trs.map((t) => t.textContent).find((x) => x.includes("Meera Das")) || "");
  check(row.includes("Offline") && row.includes("Invited"), `${tag}: new customer is offline and invited (${row})`);

  // Type tabs on customers, category tabs on products
  await page.click('[data-ftab="type"][data-v="Wholesale"]');
  check((await page.$$eval("tr[data-id]", (t) => t.map((x) => x.textContent))).every((x) => x.includes("Wholesale")), `${tag}: customer Type tab filters the list`);
  await page.click('[data-ftab="type"][data-v=""]');
  await page.goto(BASE + "#/products");
  await page.waitForSelector('[data-ftab="category"]');
  await page.click('[data-ftab="category"][data-v="Raw Material"]');
  const cats = await page.$$eval("tr[data-id]", (t) => t.map((x) => x.textContent));
  check(cats.length > 0 && cats.every((x) => x.includes("Raw Material")), `${tag}: product category tab filters the list`);
  check(!(await page.$("select[data-filter]")), `${tag}: no category dropdown on products`);
  await page.screenshot({ path: `${OUT}/product-tabs-${tag}.png` });
  await page.click('[data-ftab="category"][data-v=""]');

  // Pack sizes: one stock in kg, sold loose and as 25 kg bags
  await page.goto(BASE + "#/products");
  await page.waitForSelector("tr[data-id]");
  const pelletRow = async () => page.$$eval("tr[data-id]", (t) => t.map((x) => x.textContent).find((x) => x.includes("Mush Pellet")) || "");
  check((await pelletRow()).includes("120 kg"), `${tag}: Mush Pellet starts with 120 kg`);
  await page.click('tr[data-id]:has-text("Mush Pellet")');
  await page.waitForSelector(".modal .pack-row");
  check((await page.$$(".modal .pack-row")).length === 2, `${tag}: product form lists its 2 pack sizes`);
  await page.screenshot({ path: `${OUT}/packs-form-${tag}.png`, fullPage: true });
  await page.click(".modal [data-close]");
  await page.waitForSelector(".modal-wrap.show", { state: "detached" });
  await page.goto(BASE + "#/orders/new");
  await page.waitForSelector("[data-save]");
  await page.selectOption('.line[data-i="0"] [data-f="productId"]', { label: "Mush Pellet – Bag (25 kg)" });
  await page.fill('.line[data-i="0"] [data-f="qty"]', "2");
  await page.press('.line[data-i="0"] [data-f="qty"]', "Tab");
  await page.click("[data-addline]");
  await page.selectOption('.line[data-i="1"] [data-f="productId"]', { label: "Mush Pellet – Loose (1 kg)" });
  await page.fill('.line[data-i="1"] [data-f="qty"]', "10");
  await page.press('.line[data-i="1"] [data-f="qty"]', "Tab");
  await page.waitForTimeout(150);
  check((await page.textContent(".totals .grand")).includes("2,090.00"), `${tag}: 2 bags × ₹850 + 10 kg × ₹39`);
  await page.click("[data-save]");
  await page.waitForSelector('a[href^="#/sales/new?order="]');
  await page.goto(BASE + "#/products");
  await page.waitForSelector("tr[data-id]");
  check((await pelletRow()).includes("120 kg"), `${tag}: order alone doesn't change stock`);
  await page.goBack();
  await page.waitForSelector('a[href^="#/sales/new?order="]');
  await page.click('a[href^="#/sales/new?order="]');
  await page.waitForSelector("[data-order]");
  await page.click("[data-save]");
  await page.waitForSelector(".paper");
  const paper = await page.textContent(".paper");
  check(paper.includes("Mush Pellet – Bag (25 kg)") && paper.includes("Mush Pellet – Loose (1 kg)") && paper.includes("2,090.00"), `${tag}: invoice names each pack size`);
  await page.goto(BASE + "#/products");
  await page.waitForSelector("tr[data-id]");
  check((await pelletRow()).includes("60 kg"), `${tag}: invoice takes 2 × 25 + 10 = 60 kg off one stock (${(await pelletRow()).replace(/\s+/g, " ")})`);

  // Stock shows what's on order
  await page.goto(BASE + "#/stock");
  await page.waitForSelector("tr[data-id]");
  check((await page.textContent("thead")).includes("On order"), `${tag}: stock shows quantities on order`);

  check(!errors.length, `${tag}: no console errors ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
