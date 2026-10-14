// End-to-end: Online Orders pages in demo mode (sample orders, no Firebase needed).
// Run: python -m http.server 8765 &  then  node tests/orders.e2e.mjs  (needs: npm i -g playwright)
import { chromium } from "playwright";
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8765/index.html";
let fail = 0;
const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fail++; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  const tag = vp.width < 500 ? "phone" : "desktop";

  await page.goto(BASE);
  await page.click("[data-demo]", { timeout: 8000 });
  await page.waitForSelector(".shell");
  await page.goto(BASE + "#/orders");
  await page.waitForSelector("tr[data-id]");
  const text = await page.textContent("#view");
  check(text.includes("Anjali Menon") && text.includes("Rahul Nair") && !text.includes("Fathima"), `${tag}: open orders listed, delivered one hidden`);
  check((await page.textContent('[data-badge="orders"]')) === "1", `${tag}: nav badge shows 1 new order`);
  await page.screenshot({ path: `${OUT}/orders-list-${tag}.png`, fullPage: true });

  await page.click("tr[data-id='DEMO7Q2K']");
  await page.waitForSelector("[data-next]");
  await page.screenshot({ path: `${OUT}/order-detail-${tag}.png`, fullPage: true });
  await page.click("[data-next]");
  await page.waitForTimeout(300);
  check((await page.textContent(".page-head h1")).includes("Confirmed"), `${tag}: order confirmed`);
  check(await page.$eval('[data-badge="orders"]', (b) => b.hidden), `${tag}: badge cleared once nothing is new`);

  await page.click("[data-invoice]");
  await page.waitForSelector(".line [data-f=itemId]");
  const cust = await page.$eval('[data-h="customerId"]', (s) => s.options[s.selectedIndex].textContent);
  check(cust === "Anjali Menon", `${tag}: invoice customer added from the order (${cust})`);
  check((await page.$eval(".line [data-f=description]", (i) => i.value)) === "Mushroom Soup Premix" || (await page.$eval(".line [data-f=itemId]", (s) => s.value)) !== "", `${tag}: order item carried to invoice`);
  check((await page.$eval(".line [data-f=qty]", (i) => i.value)) === "3", `${tag}: quantity carried`);
  await page.click("[data-save]");
  await page.waitForSelector(".paper");
  check((await page.textContent(".paper")).includes("180.00"), `${tag}: invoice total 3 × ₹60 + delivery`);
  await page.goto(BASE + "#/orders/DEMO7Q2K");
  await page.waitForTimeout(300);
  check((await page.textContent("#view")).includes("INV-"), `${tag}: order links to its invoice`);

  await page.goto(BASE + "#/web-customers");
  await page.waitForTimeout(300);
  const wc = await page.textContent("#view");
  check(wc.includes("Fathima S") && wc.includes("In ERP"), `${tag}: website customers listed, ERP link shown`);
  await page.screenshot({ path: `${OUT}/web-customers-${tag}.png`, fullPage: true });
  check(!errors.length, `${tag}: no console errors ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
