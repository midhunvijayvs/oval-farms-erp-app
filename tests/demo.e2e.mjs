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
  await page.addInitScript(() => { window.open = (u) => { window.__opened = u; return null; }; });
  const tag = vp.width < 500 ? "phone" : "desktop";
  const view = () => page.textContent("#view");
  // Search dropdowns (js/combo.js): type, then click the matching row
  const pick = async (sel, type, label) => {
    await page.click(`${sel} .combo-input`);
    await page.fill(`${sel} .combo-input`, type);
    await page.click(`${sel} .combo-opt:has-text("${label}")`);
    await page.waitForTimeout(120);
  };

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

  // Open orders summary
  await page.click("[data-summary]");
  await page.waitForSelector(".summary-tbl tfoot");
  const sumText = await page.textContent(".modal");
  check(sumText.includes("Grand total") && sumText.includes("Profit") && sumText.includes("Oyster Mushroom (Fresh)"), `${tag}: open orders summary lists products and a grand total`);
  await page.screenshot({ path: `${OUT}/orders-summary-${tag}.png` });
  const [sumDl] = await Promise.all([page.waitForEvent("download"), page.click('.modal-foot .btn-primary')]);
  check(/^open-orders-.*\.jpg$/.test(sumDl.suggestedFilename()), `${tag}: summary saved as a JPG (${sumDl.suggestedFilename()})`);
  await sumDl.saveAs(`${OUT}/open-orders-${tag}.jpg`);
  await page.click(".modal [data-close]");
  await page.waitForSelector(".modal-wrap.show", { state: "detached" });

  // New phone order: customer found by typing, no walk-in
  await page.goto(BASE + "#/orders/new");
  await page.waitForSelector("[data-save]");
  await page.click("[data-customer] .combo-input");
  await page.fill("[data-customer] .combo-input", "walk");
  check((await page.textContent("[data-customer] .combo-list")).includes("No customer"), `${tag}: no walk-in customer option`);
  await page.fill("[data-customer] .combo-input", "ho");
  const custOpts = await page.$$eval("[data-customer] .combo-opt b", (b) => b.map((x) => x.textContent));
  check(custOpts[0] === "Hotel Green Leaf", `${tag}: typing "ho" finds Hotel Green Leaf first (${custOpts.join(", ")})`);
  await page.press("[data-customer] .combo-input", "Escape");
  await pick(".line [data-pick]", "soup", "Mushroom Soup Premix 25 g");
  check(!!(await page.$('.line [data-pick] .combo-sel img')), `${tag}: chosen product shows its photo`);
  await page.fill('.line [data-f="qty"]', "4");
  await page.press('.line [data-f="qty"]', "Tab");
  await page.waitForTimeout(150);
  check((await page.textContent(".totals .grand")).includes("240.00"), `${tag}: order total 4 × ₹60`);
  await page.click("[data-save]");
  await page.waitForTimeout(150);
  check((await page.textContent("#toasts")).includes("Choose the customer"), `${tag}: an order needs a customer`);
  await pick("[data-customer]", "hotel", "Hotel Green Leaf");
  check((await page.inputValue('[data-h="phone"]')) === "9847000002", `${tag}: picking the customer fills the phone`);
  await page.click(".line [data-pick] .combo-input");
  await page.fill(".line [data-pick] .combo-input", "");
  await page.screenshot({ path: `${OUT}/order-new-${tag}.png`, fullPage: true });
  check((await page.$$(".line [data-pick] .combo-opt img")).length > 2, `${tag}: product list shows photos`);
  await page.press(".line [data-pick] .combo-input", "Escape");
  await page.click("[data-save]");
  await page.waitForSelector(".page-head h1");
  const h1 = await page.textContent(".page-head h1");
  check(/OF-[A-Z0-9]{6}/.test(h1) && h1.includes("Offline") && h1.includes("Confirmed"), `${tag}: phone order saved as offline (${h1.trim()})`);
  check((await view()).includes("Hotel Green Leaf"), `${tag}: order saved for the chosen customer`);

  // Invoice from that order
  await page.click('a[href^="#/sales/new?order="]');
  await page.waitForSelector("[data-order]");
  check((await page.$eval("[data-order]", (s) => s.options[s.selectedIndex].textContent)).startsWith("OF-"), `${tag}: invoice has the order selected`);
  check((await page.$eval(".line [data-f=qty]", (i) => i.value)) === "4", `${tag}: quantity carried to invoice`);
  await page.click("[data-save]");
  await page.waitForSelector(".paper");
  check((await page.textContent(".paper")).includes("240.00"), `${tag}: invoice total matches the order (GST-inclusive price)`);
  const [invDl] = await Promise.all([page.waitForEvent("download"), page.click("[data-wajpg]")]);
  check(/^INV-.*\.jpg$/.test(invDl.suggestedFilename()), `${tag}: invoice saved as a JPG (${invDl.suggestedFilename()})`);
  await invDl.saveAs(`${OUT}/invoice-${tag}.jpg`);
  await page.waitForFunction(() => /^https:\/\/wa\.me\/\d/.test(window.__opened || ""), null, { timeout: 3000 }).catch(() => {});
  const waUrl = await page.evaluate(() => window.__opened);
  check(String(waUrl).startsWith("https://wa.me/919847000002"), `${tag}: WhatsApp opens the customer's chat (${waUrl})`);
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
  await pick("[data-customer]", "anand", "Anand Vegetables");
  await pick('.line[data-i="0"] [data-pick]', "pellet", "Mush Pellet – Bag (25 kg)");
  await page.fill('.line[data-i="0"] [data-f="qty"]', "2");
  await page.press('.line[data-i="0"] [data-f="qty"]', "Tab");
  await page.click("[data-addline]");
  await pick('.line[data-i="1"] [data-pick]', "mush p", "Mush Pellet – Loose (1 kg)");
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

  // Product groups: the bed kit, picked on an order with quantity 4
  await page.goto(BASE + "#/products");
  await page.waitForSelector("[data-groups]");
  await page.click("[data-groups]");
  await page.waitForSelector(".group-list li");
  check((await page.textContent(".group-list")).includes("All items to make a bed"), `${tag}: products has a group list`);
  await page.click(".modal-foot .btn-primary");
  await page.waitForSelector("[data-gname]");
  await page.fill("[data-gname]", "Two pickles and soup");
  await pick('.group-row[data-r="0"] [data-gitem]', "pickle", "Mushroom Pickle 200 g");
  await page.fill('.group-row[data-r="0"] [data-gqty]', "2");
  await page.click("[data-addrow]");
  await pick('.group-row[data-r="1"] [data-gitem]', "soup", "Mushroom Soup Premix 25 g");
  await page.screenshot({ path: `${OUT}/group-form-${tag}.png` });
  await page.click('.modal-foot .btn-primary:has-text("Save group")');
  await page.waitForTimeout(300);
  check((await page.textContent(".group-list")).includes("Two pickles and soup"), `${tag}: new group saved`);
  await page.screenshot({ path: `${OUT}/groups-${tag}.png` });
  await page.click(".modal [data-close]");
  await page.waitForSelector(".modal-wrap.show", { state: "detached" });
  await page.goto(BASE + "#/orders/new");
  await page.waitForSelector("[data-save]");
  await pick("[data-customer]", "fresh", "FreshMart Supermarket");
  await pick('.line[data-i="0"] [data-pick]', "all items", "All items to make a bed");
  check(!!(await page.$(".line-group")), `${tag}: group line waits for a quantity`);
  await page.fill('.line[data-i="0"] [data-f="qty"]', "4");
  await page.press('.line[data-i="0"] [data-f="qty"]', "Tab");
  await page.waitForTimeout(200);
  const lines = await page.$$eval(".line", (ls) => ls.map((l) => [l.querySelector(".combo-input").value, l.querySelector('[data-f="qty"]').value]));
  check(lines.length === 3 && lines.every((l) => l[1] === "4") && lines.some((l) => l[0].includes("Loose (1 kg)")) && lines.some((l) => l[0] === "Oyster Spawn") && lines.some((l) => l[0].startsWith("PP Grow Bags")), `${tag}: bed kit × 4 opens into 3 products × 4 (${JSON.stringify(lines)})`);
  check((await page.textContent(".totals .grand")).includes("740.00"), `${tag}: kit total 4 × (39 + 140 + 6)`);
  await page.screenshot({ path: `${OUT}/order-group-${tag}.png`, fullPage: true });
  await page.click("[data-save]");
  await page.waitForSelector('a[href^="#/sales/new?order="]');

  // Investments: list by investor, record one, investor history
  await page.goto(BASE + "#/investments");
  await page.waitForSelector("tr[data-inv]");
  text = await view();
  check(text.includes("Ravi Menon") && text.includes("₹2,50,000.00") && text.includes("₹4,25,000.00"), `${tag}: investments by investor with totals`);
  await page.screenshot({ path: `${OUT}/investments-${tag}.png`, fullPage: true });
  await page.click("[data-new]:visible");
  await page.waitForSelector("[data-investor]");
  await pick("[data-investor]", "latha", "Latha Nair");
  await page.fill('.modal [name="amount"]', "25000");
  await page.selectOption('.modal [name="mode"]', "Cash");
  check((await page.textContent(".modal [data-recv-label]")).includes("Received by"), `${tag}: cash asks who received it`);
  await page.fill('.modal [name="receivedIn"]', "Midhun");
  await page.screenshot({ path: `${OUT}/investment-form-${tag}.png` });
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  check((await view()).includes("₹4,50,000.00"), `${tag}: new investment adds to the total`);
  await page.click('tr[data-inv="OFI-002"]');
  await page.waitForSelector('.page-head h1:has-text("Latha Nair")');
  text = await view();
  check(text.includes("Latha Nair") && text.includes("OFI-002") && text.includes("₹2,00,000.00") && (await page.$$("tr[data-edit]")).length === 3, `${tag}: investor history with 3 investments and total`);
  await page.screenshot({ path: `${OUT}/investor-${tag}.png`, fullPage: true });

  // Grow batches: inputs go out of stock, beds come in; contamination and discard take beds out
  const stockOf = (name) => page.evaluate(async (n) => {
    const { store } = await import("./js/store.js"); const calc = await import("./js/calc.js");
    const it = store.all("products").find((p) => p.name === n); return it ? calc.stockOf(it.id) : null;
  }, name);
  await page.goto(BASE + "#/batches");
  await page.waitForSelector("tr[data-id]");
  text = await view();
  check((await page.$$("tr[data-id]")).length === 5 && text.includes("Beds left") && text.includes("Discarded (expired)"), `${tag}: batch list with beds left`);
  const straw0 = await stockOf("Paddy Straw"), spawn0 = await stockOf("Oyster Spawn"), bed0 = await stockOf("Oyster grow bed");
  await page.goto(BASE + "#/batches/new");
  await page.waitForSelector("[data-save]");
  check(!(await view()).includes("Spawn used") && !(await view()).includes("No. of bags") && (await view()).includes("Dry substrate (kg) (to calculate BE%)"), `${tag}: old batch fields replaced`);
  await page.selectOption('[data-h="mushroomType"]', "Oyster (Pleurotus)");
  await page.selectOption('[data-h="outputItemId"]', { label: "Oyster Mushroom (Fresh)" });
  await page.fill('[data-h="substrateKg"]', "100"); await page.press('[data-h="substrateKg"]', "Tab");
  await page.selectOption('.line[data-i="0"] [data-f="itemId"]', { label: "Paddy Straw" });
  await page.fill('.line[data-i="0"] [data-f="qty"]', "100"); await page.press('.line[data-i="0"] [data-f="qty"]', "Tab");
  await page.click("[data-addin]");
  await page.selectOption('.line[data-i="1"] [data-f="itemId"]', { label: "Oyster Spawn" });
  await page.fill('.line[data-i="1"] [data-f="qty"]', "5"); await page.press('.line[data-i="1"] [data-f="qty"]', "Tab");
  await page.selectOption('[data-h="bedItemId"]', { label: "Oyster grow bed" });
  await page.fill('[data-h="bags"]', "50"); await page.press('[data-h="bags"]', "Tab");
  check((await page.textContent(".totals")).includes("1,250.00"), `${tag}: batch cost from inputs (100 × 8 + 5 × 90)`);
  await page.screenshot({ path: `${OUT}/batch-new-${tag}.png`, fullPage: true });
  await page.click("[data-save]");
  await page.waitForSelector("[data-contam]");
  check(await stockOf("Paddy Straw") === straw0 - 100 && await stockOf("Oyster Spawn") === spawn0 - 5 && await stockOf("Oyster grow bed") === bed0 + 50, `${tag}: saving the batch takes inputs out and puts 50 beds in`);
  await page.click("[data-contam]");
  await page.fill('.modal [name="qty"]', "3");
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  check(await stockOf("Oyster grow bed") === bed0 + 47 && (await page.textContent(".batch-stats")).includes("47"), `${tag}: contamination recorded later takes 3 beds out`);
  await page.click("[data-discard]");
  await page.click(".modal-foot .btn-danger");
  await page.waitForTimeout(300);
  text = await view();
  check(await stockOf("Oyster grow bed") === bed0 && text.includes("47 beds discarded") && text.includes("Discarded (expired)"), `${tag}: discarded by expiry takes the 47 beds left out`);
  await page.screenshot({ path: `${OUT}/batch-discarded-${tag}.png`, fullPage: true });
  await page.click("[data-undiscard]");
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  check(await stockOf("Oyster grow bed") === bed0 + 47 && !!(await page.$("[data-discard]")), `${tag}: discard can be undone`);

  // Stock shows what's on order
  await page.goto(BASE + "#/stock");
  await page.waitForSelector("tr[data-id]");
  check((await page.textContent("thead")).includes("On order"), `${tag}: stock shows quantities on order`);

  // Orders: payment badge on each order, and the unpaid deliveries tab
  await page.goto(BASE + "#/orders");
  await page.click('[data-tab="all"]');
  await page.waitForSelector(".orders-tbl .o-pay");
  const pays = await page.$$eval(".orders-tbl .o-pay", (els) => els.map((e) => e.textContent.trim()));
  check(pays.includes("Paid") && pays.includes("Partly paid") && pays.includes("Unpaid"), `${tag}: orders show paid, partly paid and unpaid (${[...new Set(pays)].join(", ")})`);
  await page.screenshot({ path: `${OUT}/orders-payment-${tag}.png`, fullPage: true });
  await page.click('[data-tab="unpaid_delivered"]');
  await page.waitForTimeout(150);
  const unpaid = await page.$$eval(".orders-tbl tbody tr", (rows) => rows.map((r) => [r.querySelector(".o-status").textContent.trim(), r.querySelector(".o-pay").textContent.trim()]));
  check(unpaid.length === 3 && unpaid.every(([s, p]) => s === "Delivered" && p !== "Paid"), `${tag}: unpaid deliveries tab lists the 3 delivered orders not fully paid (${JSON.stringify(unpaid)})`);
  await page.screenshot({ path: `${OUT}/orders-unpaid-${tag}.png`, fullPage: true });
  await page.click('[data-tab="open"]');

  // Expense saved with only a photo of the bill
  await page.goto(BASE + "#/expenses");
  await page.click("[data-new]:visible");
  await page.waitForSelector(".modal .bill-photos");
  check(!!(await page.$('.modal .bill-photos input[capture="environment"]')), `${tag}: expense bill photo button opens the camera`);
  await page.setInputFiles('.modal .bill-photos input[capture="environment"]', { name: "bill.png", mimeType: "image/png", buffer: PIXEL });
  await page.waitForSelector(".modal .bill-photos .img-thumb img");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/expense-photo-${tag}.png` });
  await page.click(".modal-foot .btn-primary");
  await page.waitForTimeout(300);
  check(!(await page.$(".modal")) && (await view()).includes("To fill in"), `${tag}: expense saved with only the bill photo, marked to fill in`);
  await page.screenshot({ path: `${OUT}/expenses-tofill-${tag}.png`, fullPage: true });

  // Purchase bill saved with only a photo
  await page.goto(BASE + "#/purchases/new");
  await page.waitForSelector(".bill-photos");
  await page.setInputFiles('.bill-photos input[capture="environment"]', { name: "bill.png", mimeType: "image/png", buffer: PIXEL });
  await page.waitForSelector(".bill-photos .img-thumb img");
  await page.click("[data-save]");
  await page.waitForSelector(".bill-photo-card");
  text = await view();
  check(text.includes("To fill in") && text.includes("Fill in the details"), `${tag}: purchase bill saved with only the photo`);
  await page.screenshot({ path: `${OUT}/purchase-photo-${tag}.png`, fullPage: true });
  await page.goto(BASE + "#/purchases");
  await page.waitForSelector("tr[data-id]");
  check((await view()).includes("To fill in"), `${tag}: purchase list shows the bill to fill in`);

  // Notes: write one, open it, send to WhatsApp
  await page.goto(BASE + "#/notes");
  await page.waitForSelector(".note-card");
  check((await view()).includes("Hygiene rules for the farm team"), `${tag}: notes list`);
  await page.screenshot({ path: `${OUT}/notes-${tag}.png`, fullPage: true });
  await page.click("[data-new]:visible");
  await page.fill('.modal [name="title"]', "Route for Monday");
  await page.selectOption('.modal [name="category"]', "Sales routes");
  await page.fill('.modal [name="body"]', "Aluva, Kalamassery, Edappally. Driver Suresh 9847012345");
  await page.click(".modal-foot .btn-primary");
  await page.waitForSelector('.page-head h1:has-text("Route for Monday")');
  check(!!(await page.$('.note-body a[href="tel:9847012345"]')), `${tag}: phone number in a note is tappable`);
  await page.click("[data-wa]");
  const wa = await page.evaluate(() => window.__opened || "");
  check(wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes("*Route for Monday*"), `${tag}: note goes to WhatsApp as text`);
  await page.screenshot({ path: `${OUT}/note-${tag}.png`, fullPage: true });

  // Activity log
  await page.goto(BASE + "#/logs");
  await page.waitForSelector(".log-tbl tbody tr");
  text = await view();
  check(text.includes("Signed up") && text.includes("Note") && text.includes("Route for Monday") && text.includes("Expense"), `${tag}: activity log lists today's sign-ups and changes`);
  await page.screenshot({ path: `${OUT}/logs-${tag}.png`, fullPage: true });
  await page.selectOption("[data-app]", "site");
  await page.waitForTimeout(100);
  const apps = await page.$$eval(".log-tbl tbody tr", (rows) => rows.length);
  check(apps === 2, `${tag}: website filter shows the 2 website entries (${apps})`);

  check(!errors.length, `${tag}: no console errors ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
