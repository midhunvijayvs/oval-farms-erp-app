// Business reports for any date range, each exportable as CSV.
import { store } from "../store.js";
import { esc, money, num, sum, today, addDays, fmtDate, inRange, monthStart, monthEnd, fyStart, round2, toCSV, downloadFile, groupBy } from "../util.js";
import { icon } from "../icons.js";
import { pageHead, emptyState, stat } from "../ui.js";
import * as calc from "../calc.js";
import { sizeOf } from "../packs.js";
import { monthSummary } from "./attendance.js";

const TABS = [
  { k: "pl", l: "Profit & Loss" },
  { k: "sales", l: "Sales" },
  { k: "production", l: "Production" },
  { k: "gst", l: "GST" },
  { k: "stock", l: "Stock value" },
  { k: "dues", l: "Dues" },
  { k: "wages", l: "Wages" },
];

function prevMonth() {
  const d = addDays(monthStart(), -1);
  return { from: monthStart(d), to: monthEnd(d) };
}

const PRESETS = {
  month: () => ({ from: monthStart(), to: today() }),
  last: prevMonth,
  fy: () => ({ from: fyStart(), to: today() }),
  lastfy: () => { const s = fyStart(); const y = +s.slice(0, 4) - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; },
  all: () => ({ from: "", to: "" }),
};

const st = { tab: "pl", preset: "month", ...PRESETS.month() };
let exportRows = null;

function tableHtml(headers, rows, { rightFrom = 1, foot = null } = {}) {
  exportRows = { headers, rows: rows.map((r) => r.map((c) => (typeof c === "object" && c !== null ? c.csv : c))) };
  if (!rows.length) return emptyState("No data for this period.");
  const cell = (c, i, tag = "td") => {
    const v = typeof c === "object" && c !== null ? c.html : esc(c);
    return `<${tag} class="${i >= rightFrom ? "r" : ""}" data-label="${esc(headers[i])}">${v}</${tag}>`;
  };
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${headers.map((h, i) => `<th class="${i >= rightFrom ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => cell(c, i)).join("")}</tr>`).join("")}</tbody>
    ${foot ? `<tfoot><tr>${foot.map((c, i) => cell(c, i, "td")).join("")}</tr></tfoot>` : ""}</table></div>`;
}

const m = (n) => ({ html: money(n), csv: round2(n) });

function pl() {
  const { from, to } = st;
  const sales = store.all("sales").filter((s) => calc.saleCounts(s) && inRange(s.date, from, to));
  const purch = store.all("purchases").filter((p) => calc.purchaseCounts(p) && inRange(p.date, from, to));
  const exp = store.all("expenses").filter((e) => inRange(e.date, from, to));
  const pays = store.all("payments").filter((p) => inRange(p.date, from, to));
  const revenue = sum(sales, (s) => calc.docTotals(s).subtotal + (Number(s.shipping) || 0));
  const purchases = sum(purch, (p) => calc.docTotals(p).subtotal + (Number(p.shipping) || 0));
  const expenses = sum(exp, (e) => e.amount);
  const net = revenue - purchases - expenses;
  const byCat = [...groupBy(exp, (e) => e.category || "Other")].map(([k, v]) => [k, sum(v, (e) => e.amount)]).sort((a, b) => b[1] - a[1]);
  const cashIn = sum(pays.filter((p) => p.direction !== "out"), (p) => p.amount);
  const cashOut = sum(pays.filter((p) => p.direction === "out"), (p) => p.amount) + expenses;
  const rows = [
    ["Sales (excluding GST)", m(revenue)],
    ["Less: Purchases (excluding GST)", m(-purchases)],
    ...byCat.map(([k, v]) => ["Less: " + k, m(-v)]),
  ];
  return `
    <div class="stats">
      ${stat("Sales", money(revenue), { ic: "trend" })}
      ${stat("Purchases", money(purchases), { ic: "bag" })}
      ${stat("Expenses", money(expenses), { ic: "receipt" })}
      ${stat(net >= 0 ? "Profit" : "Loss", money(net), { ic: "chart", tone: net >= 0 ? "ok" : "danger" })}
    </div>
    <div class="card card-flush">${tableHtml(["Particulars", "Amount"], rows, { foot: [{ html: "<b>Net profit</b>", csv: "Net profit" }, { html: `<b>${money(net)}</b>`, csv: round2(net) }] })}</div>
    <p class="muted small">Simple cash-style view: purchases are counted when the bill is received (not when stock is used). Cash received ${money(cashIn)} · cash paid out ${money(cashOut)} in this period.</p>`;
}

function salesReport() {
  const { from, to } = st;
  const sales = store.all("sales").filter((s) => calc.saleCounts(s) && inRange(s.date, from, to));
  const items = new Map(store.all("products").map((i) => [i.id, i]));
  const customers = new Map(store.all("customers").map((c) => [c.id, c]));
  const byItem = new Map(), byCust = new Map();
  for (const s of sales) {
    const t = calc.docTotals(s);
    const c = byCust.get(s.customerId || "") || { n: 0, total: 0 };
    c.n++; c.total += t.total; byCust.set(s.customerId || "", c);
    for (const l of s.lines || []) {
      const lc = calc.lineCalc(l);
      const k = l.itemId || l.description || "Other";
      const e = byItem.get(k) || { qty: 0, taxable: 0, total: 0 };
      // In the product's stock unit: 2 bags of 25 kg count as 50 kg
      e.qty += (Number(l.qty) || 0) * (l.itemId ? sizeOf(l) : 1); e.taxable += lc.taxable; e.total += lc.total; byItem.set(k, e);
    }
  }
  const itemRows = [...byItem].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => {
    const it = items.get(k);
    return [it ? it.name : k, { html: num(v.qty) + " " + esc(it ? it.unit || "" : ""), csv: v.qty }, m(v.taxable), m(v.total)];
  });
  const custRows = [...byCust].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [(customers.get(k) || {}).name || "Walk-in", v.n, m(v.total)]);
  const itemTable = tableHtml(["Product", "Qty sold", "Taxable", "Total"], itemRows);
  const itemExport = exportRows;
  const custTable = tableHtml(["Customer", "Invoices", "Total"], custRows);
  exportRows = itemExport;
  return `<h2 class="section-title">By product</h2><div class="card card-flush">${itemTable}</div>
    <h2 class="section-title">By customer</h2><div class="card card-flush">${custTable}</div>`;
}

function productionReport() {
  const { from, to } = st;
  const batches = store.all("batches").filter((b) => inRange(b.startDate, from, to) || store.all("harvests").some((h) => h.batchId === b.id && inRange(h.date, from, to)));
  const bRows = batches.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "")).map((b) => {
    const kg = calc.harvestedKg(b.id), be = calc.biologicalEfficiency(b);
    const cont = Number(b.bags) ? (Number(b.contaminatedBags) || 0) / Number(b.bags) * 100 : null;
    return [b.code, b.mushroomType || "", { html: fmtDate(b.startDate), csv: b.startDate }, b.status, num(b.substrateKg || 0), { html: num(kg) + " kg", csv: kg }, { html: be == null ? "–" : be.toFixed(0) + "%", csv: be == null ? "" : be.toFixed(1) }, { html: cont == null ? "–" : cont.toFixed(0) + "%", csv: cont == null ? "" : cont.toFixed(1) }];
  });
  const harvest = sum(store.all("harvests").filter((h) => inRange(h.date, from, to)), (h) => h.qty);
  const runs = store.all("productions").filter((p) => inRange(p.date, from, to));
  const items = new Map(store.all("products").map((i) => [i.id, i]));
  const rRows = runs.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((r) => {
    const it = items.get(r.outputItemId) || {}; const c = calc.productionCost(r);
    return [r.lotNo, { html: fmtDate(r.date), csv: r.date }, it.name || "", { html: num(r.outputQty) + " " + esc(it.unit || ""), csv: r.outputQty }, m(c.total), m(c.perUnit)];
  });
  const runTable = tableHtml(["Lot", "Date", "Product", "Output", "Total cost", "Cost / unit"], rRows);
  const batchTable = tableHtml(["Batch", "Mushroom", "Spawned", "Status", "Substrate (kg)", "Harvested", "B.E.", "Contamination"], bRows, { rightFrom: 4 });
  return `<div class="stats stats-3">
      ${stat("Fresh harvest", num(harvest) + " kg", { ic: "basket" })}
      ${stat("Batches", String(batches.length), { ic: "sprout" })}
      ${stat("Processing runs", String(runs.length), { ic: "flask" })}
    </div>
    <h2 class="section-title">Grow batches and yield</h2><div class="card card-flush">${batchTable}</div>
    <p class="muted small">B.E. (biological efficiency) = fresh mushrooms harvested ÷ dry substrate weight × 100. Oyster typically gives 60–100%.</p>
    <h2 class="section-title">Processing runs</h2><div class="card card-flush">${runTable}</div>`;
}

function gstReport() {
  const { from, to } = st;
  const collect = (docs) => {
    const byRate = new Map();
    for (const d of docs) for (const l of d.lines || []) {
      const c = calc.lineCalc(l); const r = Number(l.gstRate) || 0;
      const e = byRate.get(r) || { taxable: 0, tax: 0 }; e.taxable += c.taxable; e.tax += c.tax; byRate.set(r, e);
    }
    return byRate;
  };
  const out = collect(store.all("sales").filter((s) => calc.saleCounts(s) && inRange(s.date, from, to)));
  const inp = collect(store.all("purchases").filter((p) => calc.purchaseCounts(p) && inRange(p.date, from, to)));
  const rates = [...new Set([...out.keys(), ...inp.keys()])].sort((a, b) => a - b);
  const rows = rates.map((r) => {
    const o = out.get(r) || { taxable: 0, tax: 0 }, i = inp.get(r) || { taxable: 0, tax: 0 };
    return [r + "%", m(o.taxable), m(o.tax), m(i.taxable), m(i.tax)];
  });
  const outTax = sum([...out.values()], (v) => v.tax), inTax = sum([...inp.values()], (v) => v.tax);
  return `<div class="stats stats-3">
      ${stat("Output GST (on sales)", money(outTax), { ic: "trend" })}
      ${stat("Input GST (on purchases)", money(inTax), { ic: "bag" })}
      ${stat("Net GST payable", money(outTax - inTax), { ic: "receipt", tone: outTax - inTax > 0 ? "warn" : "ok" })}
    </div>
    <div class="card card-flush">${tableHtml(["GST rate", "Sales taxable", "Output GST", "Purchase taxable", "Input GST"], rows)}</div>
    <p class="muted small">A planning summary only. Confirm figures with your accountant before filing GSTR-1 / GSTR-3B.</p>`;
}

function stockReport() {
  const items = store.all("products").filter((i) => i.active !== false).sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  const rows = items.map((i) => {
    const q = calc.stockOf(i.id);
    return [i.name, i.category || "", { html: num(q) + " " + esc(i.unit || ""), csv: q }, m(i.costPrice || 0), m(Math.max(0, q) * (Number(i.costPrice) || 0)), m(Math.max(0, q) * (Number(i.salePrice) || 0))];
  });
  const total = sum(items, (i) => Math.max(0, calc.stockOf(i.id)) * (Number(i.costPrice) || 0));
  return `<p class="muted">Stock as of today (date range does not apply).</p>
    <div class="card card-flush">${tableHtml(["Item", "Category", "In stock", "Cost price", "Value at cost", "Value at sale price"], rows, { rightFrom: 2, foot: ["Total", "", "", "", { html: `<b>${money(total)}</b>`, csv: total }, ""] })}</div>`;
}

function duesReport() {
  const cust = store.all("customers").map((c) => ({ c, b: calc.customerBalance(c.id) })).filter((x) => Math.abs(x.b) > 0.5).sort((a, b) => b.b - a.b);
  const sup = store.all("suppliers").map((s) => ({ s, b: calc.supplierBalance(s.id) })).filter((x) => Math.abs(x.b) > 0.5).sort((a, b) => b.b - a.b);
  const t = today();
  const age = (cid) => {
    const open = store.all("sales").filter((s) => s.customerId === cid && calc.saleCounts(s) && calc.docBalance(s) > 0.5);
    const oldest = open.map((s) => s.date).sort()[0];
    return oldest ? Math.max(0, Math.round((new Date(t) - new Date(oldest)) / 86400000)) + " days" : "–";
  };
  const supTable = tableHtml(["Supplier", "Phone", "We owe"], sup.map((x) => [x.s.name, x.s.phone || "", m(x.b)]), { rightFrom: 2 });
  const custTable = tableHtml(["Customer", "Phone", "Oldest unpaid", "Outstanding"], cust.map((x) => [x.c.name, x.c.phone || "", age(x.c.id), m(x.b)]), { rightFrom: 2 });
  return `<div class="stats stats-3">
      ${stat("Customers owe us", money(calc.totalReceivables()), { ic: "wallet" })}
      ${stat("We owe suppliers", money(calc.totalPayables()), { ic: "truck" })}
    </div>
    <h2 class="section-title">Receivables</h2><div class="card card-flush">${custTable}</div>
    <h2 class="section-title">Payables</h2><div class="card card-flush">${supTable}</div>`;
}

function wagesReport() {
  const from = st.from || monthStart(), to = st.to || today();
  const emps = store.all("employees").sort((a, b) => a.name.localeCompare(b.name));
  const rows = emps.map((e) => { const s = monthSummary(e, from, to); return [e.name, e.wageType || "", s.present, s.half, s.absent, m(s.wage)]; });
  const paid = sum(store.all("expenses").filter((x) => x.category === "Salaries & Wages" && inRange(x.date, from, to)), (x) => x.amount);
  return `<div class="stats stats-3">
      ${stat("Estimated wages", money(sum(emps, (e) => monthSummary(e, from, to).wage)), { ic: "id" })}
      ${stat("Wages paid (expenses)", money(paid), { ic: "receipt" })}
    </div>
    <div class="card card-flush">${tableHtml(["Employee", "Pay type", "Present", "Half days", "Absent", "Est. wages"], rows, { rightFrom: 2 })}</div>`;
}

const RENDER = { pl, sales: salesReport, production: productionReport, gst: gstReport, stock: stockReport, dues: duesReport, wages: wagesReport };

export const reportsView = {
  title: "Reports",
  render(root) {
    exportRows = null;
    const body = RENDER[st.tab]();
    root.innerHTML = `
      ${pageHead("Reports", "", `<button class="btn btn-ghost" data-export>${icon("download")}Export CSV</button><button class="btn btn-ghost hide-sm" data-print>${icon("printer")}Print</button>`)}
      <div class="tabs">${TABS.map((t) => `<button class="tab ${t.k === st.tab ? "on" : ""}" data-tab="${t.k}">${t.l}</button>`).join("")}</div>
      <div class="toolbar">
        <div class="seg">${[["month", "This month"], ["last", "Last month"], ["fy", "This FY"], ["lastfy", "Last FY"], ["all", "All time"]].map(([k, l]) => `<button data-preset="${k}" class="${st.preset === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="range"><input type="date" value="${esc(st.from)}" data-from aria-label="From"><span>–</span><input type="date" value="${esc(st.to)}" data-to aria-label="To"></div>
      </div>
      <div class="print-area report">${body}</div>`;
    const rr = () => this.render(root);
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { st.tab = b.dataset.tab; rr(); }));
    root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { st.preset = b.dataset.preset; Object.assign(st, PRESETS[st.preset]()); rr(); }));
    root.querySelector("[data-from]").addEventListener("change", (e) => { st.from = e.target.value; st.preset = ""; rr(); });
    root.querySelector("[data-to]").addEventListener("change", (e) => { st.to = e.target.value; st.preset = ""; rr(); });
    root.querySelector("[data-print]").addEventListener("click", () => window.print());
    root.querySelector("[data-export]").addEventListener("click", () => {
      if (!exportRows) return;
      downloadFile(`report-${st.tab}-${st.from || "all"}-${st.to || today()}.csv`, toCSV(exportRows.headers, exportRows.rows), "text/csv");
    });
  },
};
