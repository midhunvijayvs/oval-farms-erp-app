// Sales invoices and purchase bills: list, full-page editor with line items, printable view.
import { store } from "../store.js";
import { SALE_STATUSES, PURCHASE_STATUSES } from "../schema.js";
import { can } from "../session.js";
import { esc, money, num, sum, today, addDays, fmtDate, inRange, monthStart, round2, toCSV, downloadFile } from "../util.js";
import { icon } from "../icons.js";
import { toast, confirmDialog, pageHead, chip, emptyState, stat } from "../ui.js";
import * as calc from "../calc.js";
import { openForm } from "./crud.js";
import { navigate } from "../router.js";
import { orderNo, addressText } from "./orders.js";
import { sellables, findPack, sellName, keyOf, splitKey } from "../packs.js";

// "Mush pellet – Bag (25 kg)" for a line sold by pack, else the product name
export function lineName(l, product) {
  if (!product) return l.description || "Item";
  const k = findPack(product, l.packId);
  return k ? sellName(product, k) : l.packName ? `${product.name} – ${l.packName}` : product.name;
}

export const DOCS = {
  sales: {
    col: "sales", partyCol: "customers", partyKey: "customerId", partyLabel: "Customer",
    title: "Sales Invoices", singular: "Invoice", route: "sales", statuses: SALE_STATUSES, defaultStatus: "Confirmed",
    priceKey: "salePrice", counts: calc.saleCounts, dir: "in", prefix: () => store.settings().invoicePrefix || "INV",
  },
  purchases: {
    col: "purchases", partyCol: "suppliers", partyKey: "supplierId", partyLabel: "Supplier",
    title: "Purchases", singular: "Purchase bill", route: "purchases", statuses: PURCHASE_STATUSES, defaultStatus: "Received",
    priceKey: "costPrice", counts: calc.purchaseCounts, dir: "out", prefix: () => "PUR",
  },
};

const listState = { sales: { q: "", status: "", pay: "", from: "", to: "" }, purchases: { q: "", status: "", pay: "", from: "", to: "" } };

// ---------------- list ----------------
export function docList(kind) {
  const D = DOCS[kind];
  return {
    title: D.title,
    render(root) {
      const st = listState[kind];
      const parties = new Map(store.all(D.partyCol).map((p) => [p.id, p]));
      let rows = store.all(D.col).map((d) => ({ ...d, _t: calc.docTotals(d), _pay: calc.paymentStatus(d), _party: (parties.get(d[D.partyKey]) || {}).name || "" }));
      if (st.q) {
        const q = st.q.toLowerCase();
        rows = rows.filter((r) => (r.number || "").toLowerCase().includes(q) || r._party.toLowerCase().includes(q) || (r.supplierRef || "").toLowerCase().includes(q));
      }
      if (st.status) rows = rows.filter((r) => r.status === st.status);
      if (st.pay) rows = rows.filter((r) => D.counts(r) && r._pay === st.pay);
      if (st.from || st.to) rows = rows.filter((r) => inRange(r.date, st.from, st.to));
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.number || "").localeCompare(a.number || ""));
      const counted = rows.filter(D.counts);
      const total = sum(counted, (r) => r._t.total);
      const paid = sum(counted, (r) => calc.paidAgainst(r.id));

      root.innerHTML = `
        ${pageHead(D.title, "", `<button class="btn btn-ghost hide-sm" data-export>${icon("download")}Export</button>${can("write") ? `<a class="btn btn-primary new-btn" href="#/${D.route}/new">${icon("plus")}New ${D.singular.toLowerCase()}</a>` : ""}`)}
        <div class="stats stats-3">
          ${stat(kind === "sales" ? "Billed" : "Purchased", money(total), { sub: `${counted.length} ${counted.length === 1 ? "document" : "documents"} in view`, ic: kind === "sales" ? "trend" : "bag" })}
          ${stat(kind === "sales" ? "Collected" : "Paid", money(paid), { ic: "wallet", tone: "ok" })}
          ${stat("Outstanding", money(total - paid), { ic: "clock", tone: total - paid > 0.5 ? "warn" : "" })}
        </div>
        <div class="toolbar">
          <div class="search">${icon("search")}<input type="search" placeholder="Search number or ${D.partyLabel.toLowerCase()}…" value="${esc(st.q)}" data-q></div>
          <select data-status><option value="">All statuses</option>${D.statuses.map((s) => `<option ${s === st.status ? "selected" : ""}>${s}</option>`).join("")}</select>
          <select data-pay><option value="">Any payment</option>${["Unpaid", "Partly paid", "Paid"].map((s) => `<option ${s === st.pay ? "selected" : ""}>${s}</option>`).join("")}</select>
          <div class="seg"><button data-preset="month" class="${st.from === monthStart() && !st.to ? "on" : ""}">This month</button><button data-preset="all" class="${!st.from && !st.to ? "on" : ""}">All</button></div>
        </div>
        <div class="card card-flush">
          ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Number</th><th>Date</th><th>${D.partyLabel}</th><th>Status</th><th>Payment</th><th class="r">Total</th></tr></thead><tbody>
            ${rows.map((r) => `<tr class="clickable" data-id="${r.id}">
              <td class="primary" data-label="Number">${esc(r.number)}</td>
              <td data-label="Date">${fmtDate(r.date)}</td>
              <td data-label="${D.partyLabel}">${esc(r._party || "Walk-in")}</td>
              <td data-label="Status">${chip(r.status)}</td>
              <td data-label="Payment">${D.counts(r) ? chip(r._pay) : ""}</td>
              <td class="r" data-label="Total"><b>${money(r._t.total)}</b></td></tr>`).join("")}
          </tbody></table></div>` : emptyState(`No ${D.title.toLowerCase()} yet.`, can("write") ? `<a class="btn btn-primary" href="#/${D.route}/new">${icon("plus")}Create the first one</a>` : "")}
        </div>
        ${can("write") ? `<a class="fab" href="#/${D.route}/new" aria-label="New">${icon("plus")}</a>` : ""}`;

      const rr = () => this.render(root);
      root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
      root.querySelector("[data-status]").addEventListener("change", (e) => { st.status = e.target.value; rr(); });
      root.querySelector("[data-pay]").addEventListener("change", (e) => { st.pay = e.target.value; rr(); });
      root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { st.from = b.dataset.preset === "month" ? monthStart() : ""; st.to = ""; rr(); }));
      root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => navigate(`#/${D.route}/${tr.dataset.id}`)));
      root.querySelector("[data-export]").addEventListener("click", () => {
        const csv = toCSV(["Number", "Date", D.partyLabel, "Status", "Payment", "Taxable", "GST", "Total", "Paid", "Balance"],
          rows.map((r) => [r.number, r.date, r._party, r.status, r._pay, r._t.subtotal, r._t.tax, r._t.total, calc.paidAgainst(r.id), calc.docBalance(r)]));
        downloadFile(`${kind}-${today()}.csv`, csv, "text/csv");
      });
    },
  };
}

// ---------------- editor ----------------
export function docEditor(kind) {
  const D = DOCS[kind];
  return {
    title: D.singular,
    keepOnRemote: true,
    render(root, params) {
      const existing = params.id ? store.get(D.col, params.id) : null;
      if (params.id && !existing) { root.innerHTML = emptyState("This document was not found. It may have been deleted."); return; }
      if (!can("write")) { navigate(`#/${D.route}` + (params.id ? "/" + params.id : "")); return; }
      const party = store.all(D.partyCol).sort((a, b) => a.name.localeCompare(b.name));
      const items = store.all("products").filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name));
      const isSale = kind === "sales";
      const doc = existing ? JSON.parse(JSON.stringify(existing)) : {
        number: calc.nextNumber(D.col, D.prefix()), date: today(), status: D.defaultStatus, lines: [{ qty: 1 }], shipping: "",
        [D.partyKey]: params.party || "",
      };
      const prevOrderId = existing ? existing.orderId || "" : "";
      // Every sales invoice is made from an order: the order fills in the customer, items and delivery.
      const orderChoices = () => store.all("orders")
        .filter((o) => o.status !== "cancelled" && (!o.invoiceId || (existing && o.invoiceId === existing.id)))
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const applyOrder = (o) => {
        doc.orderId = o.id;
        doc[D.partyKey] = o.customerId || "";
        doc.lines = (o.items || []).map((li) => {
          const it = store.get("products", li.productId);
          const gst = Number(it ? it.gstRate : 0) || 0;
          // Order prices include GST; the invoice shows the price before GST and adds it back.
          const rate = gst ? Math.round((Number(li.price) || 0) / (1 + gst / 100) * 10000) / 10000 : Number(li.price) || 0;
          const k = it ? findPack(it, li.packId) : null;
          const pack = k ? { packId: k.id, packName: k.name, size: Number(li.size) || Number(k.size) } : li.packId ? { packId: li.packId, size: Number(li.size) || 1 } : {};
          return it ? { itemId: it.id, ...pack, qty: Number(li.qty) || 1, rate, gstRate: String(gst) } : { description: li.name || "Item", qty: Number(li.qty) || 1, rate, gstRate: "0" };
        });
        doc.shipping = Number(o.deliveryCharge) || "";
        doc.notes = [`Order ${orderNo(o)}${o.channel === "online" ? " (ovalfarm.in)" : o.source ? " (" + o.source + ")" : ""}`, o.note, addressText(o.address) ? "Deliver to: " + addressText(o.address) : ""].filter(Boolean).join("\n");
        if (doc.lines.some((l) => !l.itemId)) toast("Some order items aren't in Products & Materials. Pick the product on those lines so stock updates.", "error");
      };
      if (!existing && isSale && params.query && params.query.order) {
        const o = store.get("orders", params.query.order);
        if (o && !o.invoiceId) applyOrder(o);
      }
      if (!doc.lines || !doc.lines.length) doc.lines = [{ qty: 1 }];
      const stockNow = calc.stockMap();

      // Each product, or each of its pack sizes, is one choice: value "productId" or "productId|packId"
      const choices = sellables(items);
      const itemOptions = (sel) => `<option value="">Select item…</option>${choices.map((c) => `<option value="${esc(c.key)}" ${c.key === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("")}`;
      const lineRow = (l, idx) => {
        const it = items.find((i) => i.id === l.itemId);
        const k = it ? findPack(it, l.packId) : null;
        const size = Number(l.size) || (k ? Number(k.size) : 1);
        const c = calc.lineCalc(l);
        const avail = it ? stockNow.get(it.id) || 0 : null;
        const warn = kind === "sales" && it && Number(l.qty) * size > avail;
        return `<div class="line" data-i="${idx}">
          <div class="line-item">
            <select data-f="itemId">${itemOptions(keyOf(l.itemId, l.packId))}</select>
            <input data-f="description" placeholder="Description (optional)" value="${esc(l.description || "")}">
            ${it ? `<small class="${warn ? "text-warn" : "muted"}">In stock: ${num(avail)} ${esc(it.unit || "")}${k ? ` (${num(Math.floor(avail / size))} × ${esc(k.name)})` : ""}${warn ? " · not enough stock" : ""}</small>` : ""}
          </div>
          <label class="line-num"><span>Qty${it ? " (" + esc(k ? k.name : it.unit || "") + ")" : ""}</span><input data-f="qty" type="number" inputmode="decimal" step="any" value="${esc(l.qty ?? "")}"></label>
          <label class="line-num"><span>Rate</span><input data-f="rate" type="number" inputmode="decimal" step="0.01" value="${esc(l.rate ?? "")}"></label>
          <label class="line-num sm"><span>Disc %</span><input data-f="discount" type="number" inputmode="decimal" step="any" value="${esc(l.discount ?? "")}"></label>
          <label class="line-num sm"><span>GST %</span><select data-f="gstRate">${["0", "5", "12", "18", "28"].map((g) => `<option ${String(l.gstRate ?? "0") === g ? "selected" : ""}>${g}</option>`).join("")}</select></label>
          <div class="line-amt"><span>Amount</span><b>${money(c.total)}</b></div>
          <button class="icon-btn line-del" data-del="${idx}" aria-label="Remove line">${icon("trash")}</button>
        </div>`;
      };

      const draw = () => {
        const t = calc.docTotals(doc);
        root.innerHTML = `
          <div class="page-head"><div><a class="back" href="#/${D.route}${existing ? "/" + existing.id : ""}">${icon("back")}${existing ? esc(existing.number) : D.title}</a><h1>${existing ? "Edit" : "New"} ${D.singular.toLowerCase()}</h1></div></div>
          <div class="editor">
            <div class="card">
              <div class="form-grid">
                ${isSale ? (() => {
                  const choices = orderChoices();
                  return `<div class="field"><label>Order <span class="req">*</span></label>
                    <select data-order><option value="">${choices.length ? "Choose the order…" : "No orders waiting for an invoice"}</option>${choices.map((o) => `<option value="${esc(o.id)}" ${o.id === doc.orderId ? "selected" : ""}>${esc(orderNo(o))} · ${esc((o.customer && o.customer.name) || "Walk-in")} · ${money(o.total)}</option>`).join("")}</select>
                    <small class="muted">${choices.length ? "" : "Add the order first under Orders → New order, even for walk-in customers. "}Choosing an order fills in the rest.</small></div>`;
                })() : ""}
                <div class="field"><label>${D.partyLabel} ${kind === "purchases" ? '<span class="req">*</span>' : ""}</label>
                  <div class="with-btn"><select data-h="${D.partyKey}"><option value="">${kind === "sales" ? "Walk-in customer" : "Select supplier…"}</option>${party.map((p) => `<option value="${p.id}" ${p.id === doc[D.partyKey] ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
                  <button class="btn btn-ghost" data-addparty title="Add new">${icon("plus")}</button></div></div>
                <div class="field half"><label>${kind === "sales" ? "Invoice no." : "Our ref no."}</label><input data-h="number" value="${esc(doc.number)}"></div>
                <div class="field half"><label>Date</label><input type="date" data-h="date" value="${esc(doc.date)}"></div>
                ${kind === "purchases" ? `<div class="field half"><label>Supplier bill no.</label><input data-h="supplierRef" value="${esc(doc.supplierRef || "")}"></div>` : ""}
                <div class="field half"><label>Due date</label><input type="date" data-h="dueDate" value="${esc(doc.dueDate || "")}"></div>
                <div class="field half"><label>Status</label><select data-h="status">${D.statuses.map((s) => `<option ${s === doc.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
                ${kind === "sales" ? `<label class="check field half"><input type="checkbox" data-h="interState" ${doc.interState ? "checked" : ""}> <span>Inter-state supply (IGST)</span></label>` : ""}
              </div>
            </div>
            <div class="card">
              <div class="card-head"><h3>Items</h3></div>
              <div class="lines">${doc.lines.map(lineRow).join("")}</div>
              <button class="btn btn-ghost" data-addline>${icon("plus")}Add line</button>
            </div>
            <div class="editor-bottom">
              <div class="card">
                <div class="field"><label>Notes</label><textarea data-h="notes" rows="3" placeholder="${kind === "sales" ? "Delivery details, terms…" : "Notes"}">${esc(doc.notes || "")}</textarea></div>
              </div>
              <div class="card totals">
                <div><span>Taxable value</span><b>${money(t.subtotal)}</b></div>
                <div><span>GST</span><b>${money(t.tax)}</b></div>
                <div><span>Delivery / other charges</span><input type="number" step="0.01" data-h="shipping" value="${esc(doc.shipping ?? "")}" placeholder="0"></div>
                <div><span>Round off</span><b>${money(t.roundOff)}</b></div>
                <div class="grand"><span>Total</span><b>${money(t.total)}</b></div>
              </div>
            </div>
            <div class="editor-actions">
              <a class="btn btn-ghost" href="#/${D.route}${existing ? "/" + existing.id : ""}">Cancel</a>
              <button class="btn btn-primary" data-save>${icon("tick")}Save ${D.singular.toLowerCase()}</button>
            </div>
          </div>`;
        bind();
      };

      const readHeader = () => {
        root.querySelectorAll("[data-h]").forEach((el) => {
          const k = el.dataset.h;
          doc[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
        });
      };

      const bind = () => {
        root.querySelectorAll("[data-h]").forEach((el) => el.addEventListener("change", () => { readHeader(); if (el.dataset.h === "shipping" || el.dataset.h === D.partyKey) draw(); }));
        const os = root.querySelector("[data-order]");
        if (os) os.addEventListener("change", () => {
          readHeader();
          const o = store.get("orders", os.value);
          if (o) applyOrder(o); else doc.orderId = "";
          draw();
        });
        root.querySelectorAll(".line").forEach((row) => {
          const i = +row.dataset.i;
          row.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
            readHeader();
            const f = el.dataset.f;
            const l = doc.lines[i];
            if (f === "itemId") {
              const { productId, packId } = splitKey(el.value);
              const it = items.find((x) => x.id === productId);
              const k = it ? findPack(it, packId) : null;
              l.itemId = productId;
              delete l.packId; delete l.packName; delete l.size;
              if (k) Object.assign(l, { packId: k.id, packName: k.name, size: Number(k.size) });
              if (it) {
                // Sales: the pack's own price. Purchases: cost per unit × units in the pack.
                const price = isSale ? (k ? k.price : it.salePrice) : it.costPrice === "" || it.costPrice == null ? "" : Number(it.costPrice) * (k ? Number(k.size) : 1);
                if (price !== undefined && price !== "" && price !== null) l.rate = Number(price);
                l.gstRate = String(it.gstRate || "0");
              }
            } else l[f] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
            draw();
            const again = root.querySelector(`.line[data-i="${i}"] [data-f="${f === "itemId" ? "qty" : f}"]`);
            if (again && f !== "gstRate") again.focus();
          }));
        });
        root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
          readHeader();
          doc.lines.splice(+b.dataset.del, 1);
          if (!doc.lines.length) doc.lines.push({ qty: 1 });
          draw();
        }));
        root.querySelector("[data-addline]").addEventListener("click", () => { readHeader(); doc.lines.push({ qty: 1 }); draw(); });
        root.querySelector("[data-addparty]").addEventListener("click", () => {
          readHeader();
          openForm(D.partyCol, null, { onSaved: (p) => { doc[D.partyKey] = p.id; draw(); } });
        });
        root.querySelector("[data-save]").addEventListener("click", () => {
          readHeader();
          doc.lines = doc.lines.filter((l) => l.itemId || l.description);
          if (!doc.lines.length) { doc.lines = [{ qty: 1 }]; draw(); return toast("Add at least one item", "error"); }
          if (kind === "purchases" && !doc[D.partyKey]) return toast("Choose a supplier", "error");
          if (isSale && !doc.orderId && !(existing && !existing.orderId)) return toast("Choose the order this invoice is for", "error");
          if (doc.lines.some((l) => !(Number(l.qty) > 0))) { draw(); return toast("Each line needs a quantity", "error"); }
          if (kind === "sales" && !doc.dueDate) {
            const c = store.get("customers", doc.customerId);
            if (c && Number(c.creditDays)) doc.dueDate = addDays(doc.date, Number(c.creditDays));
          }
          for (const l of doc.lines) for (const k of ["qty", "rate", "discount"]) if (l[k] !== "" && l[k] != null) l[k] = Number(l[k]);
          const saved = store.put(D.col, doc);
          toast(D.singular + " saved");
          if (isSale) linkOrder(saved, prevOrderId);
          navigate(`#/${D.route}/${saved.id}`, true);
        });
      };
      draw();
    },
  };
}

// Keeps order.invoiceId in step with the invoice that bills it.
function linkOrder(invoice, previousOrderId) {
  const nowId = invoice ? invoice.orderId || "" : "";
  if (previousOrderId && previousOrderId !== nowId) {
    const old = store.get("orders", previousOrderId);
    if (old && old.invoiceId) store.put("orders", { id: old.id, invoiceId: "", invoiceNumber: "" });
  }
  if (!nowId) return;
  const o = store.get("orders", nowId);
  if (!o) return;
  if (o.invoiceId !== invoice.id || o.invoiceNumber !== invoice.number || o.status === "placed") {
    store.put("orders", { id: o.id, invoiceId: invoice.id, invoiceNumber: invoice.number, ...(o.status === "placed" ? { status: "confirmed" } : {}) });
  }
}

// ---------------- view / print ----------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words99(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""); }
function words999(n) { return (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? words99(n % 100) : ""); }
export function amountInWords(amount) {
  let n = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - n) * 100);
  if (n === 0 && !paise) return "Zero Rupees Only";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(words999(crore) + " Crore");
  if (lakh) parts.push(words99(lakh) + " Lakh");
  if (thousand) parts.push(words99(thousand) + " Thousand");
  if (n) parts.push(words999(n));
  return "Rupees " + parts.join(" ") + (paise ? " and " + words99(paise) + " Paise" : "") + " Only";
}

export function docView(kind) {
  const D = DOCS[kind];
  return {
    title: D.singular,
    render(root, params) {
      const doc = store.get(D.col, params.id);
      if (!doc) { root.innerHTML = emptyState("This document was not found. It may have been deleted.") + `<p class="center"><a class="btn" href="#/${D.route}">Back to list</a></p>`; return; }
      const biz = store.settings();
      const party = store.get(D.partyCol, doc[D.partyKey]);
      const t = calc.docTotals(doc);
      const paid = calc.paidAgainst(doc.id);
      const balance = round2(t.total - paid);
      const pays = store.all("payments").filter((p) => p.refId === doc.id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const items = new Map(store.all("products").map((i) => [i.id, i]));
      const taxByRate = new Map();
      for (const l of doc.lines || []) {
        const c = calc.lineCalc(l);
        const r = Number(l.gstRate) || 0;
        const e = taxByRate.get(r) || { taxable: 0, tax: 0 };
        e.taxable += c.taxable; e.tax += c.tax;
        taxByRate.set(r, e);
      }
      const isSale = kind === "sales";
      const split = isSale && !doc.interState;

      root.innerHTML = `
        <div class="page-head no-print">
          <div><a class="back" href="#/${D.route}">${icon("back")}${D.title}</a><h1>${esc(doc.number)} ${chip(doc.status)} ${D.counts(doc) ? chip(calc.paymentStatus(doc)) : ""}</h1></div>
          <div class="page-actions">
            ${can("write") && D.counts(doc) && balance > 0 ? `<button class="btn btn-primary" data-pay>${icon("wallet")}${isSale ? "Record payment" : "Record payment made"}</button>` : ""}
            ${can("write") ? `<a class="btn btn-ghost" href="#/${D.route}/${doc.id}/edit">${icon("edit")}Edit</a>` : ""}
            <button class="btn btn-ghost" data-print>${icon("printer")}Print / PDF</button>
            ${isSale ? `<button class="btn btn-ghost" data-wa>${icon("whatsapp")}WhatsApp</button>` : ""}
            ${can("write") && isSale && doc.status === "Confirmed" ? `<button class="btn btn-ghost" data-delivered>${icon("truck")}Mark delivered</button>` : ""}
            ${isSale && doc.orderId && store.get("orders", doc.orderId) ? `<a class="btn btn-ghost" href="#/orders/${esc(doc.orderId)}">${icon("cart")}${esc(orderNo(store.get("orders", doc.orderId)))}</a>` : ""}
            ${can("write") && !isSale ? `<button class="btn btn-ghost" data-dup>${icon("file")}Duplicate</button>` : ""}
            ${can("delete") ? `<button class="btn btn-ghost btn-danger-text" data-del>${icon("trash")}Delete</button>` : ""}
          </div>
        </div>
        <div class="doc-layout">
          <article class="paper print-area">
            <header class="paper-head">
              <div class="paper-brand">
                <img src="assets/logo-farm.png" alt="" class="paper-logo">
                <div>
                  <h2>${esc(biz.name || "Oval Farms")}</h2>
                  <p>${esc(biz.address || "").replace(/\n/g, "<br>")}</p>
                  <p>${[biz.phone && "Ph: " + esc(biz.phone), biz.email && esc(biz.email)].filter(Boolean).join(" · ")}</p>
                  <p>${[biz.gstin && "GSTIN: " + esc(biz.gstin), biz.fssai && "FSSAI Lic: " + esc(biz.fssai)].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <div class="paper-title">
                <h1>${isSale ? (biz.gstin ? "Tax Invoice" : "Invoice") : "Purchase Bill"}</h1>
                <table class="kv">
                  <tr><td>No.</td><td><b>${esc(doc.number)}</b></td></tr>
                  <tr><td>Date</td><td>${fmtDate(doc.date)}</td></tr>
                  ${doc.dueDate ? `<tr><td>Due</td><td>${fmtDate(doc.dueDate)}</td></tr>` : ""}
                  ${doc.supplierRef ? `<tr><td>Supplier bill</td><td>${esc(doc.supplierRef)}</td></tr>` : ""}
                </table>
              </div>
            </header>
            <section class="paper-party">
              <span class="label">${isSale ? "Bill to" : "Supplier"}</span>
              <b>${esc(party ? party.name : "Walk-in customer")}</b>
              ${party && party.address ? `<p>${esc(party.address).replace(/\n/g, "<br>")}</p>` : ""}
              ${party && party.phone ? `<p>Ph: ${esc(party.phone)}</p>` : ""}
              ${party && party.gstin ? `<p>GSTIN: ${esc(party.gstin)}</p>` : ""}
            </section>
            <table class="paper-lines">
              <thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">Amount</th></tr></thead>
              <tbody>${(doc.lines || []).map((l, i) => {
                const it = items.get(l.itemId) || {};
                const c = calc.lineCalc(l);
                return `<tr><td>${i + 1}</td><td><b>${esc(lineName(l, items.get(l.itemId)))}</b>${it.name && l.description ? `<br><small>${esc(l.description)}</small>` : ""}${l.discount ? `<br><small>Discount ${l.discount}%</small>` : ""}</td><td>${esc(it.hsn || "")}</td>
                  <td class="r">${num(l.qty)} ${esc(l.packId ? "" : it.unit || "")}</td><td class="r">${money(l.rate)}</td><td class="r">${money(c.taxable)}</td><td class="r">${l.gstRate || 0}%</td><td class="r">${money(c.total)}</td></tr>`;
              }).join("")}</tbody>
            </table>
            <div class="paper-foot">
              <div class="paper-notes">
                <p class="words"><span class="label">Amount in words</span>${amountInWords(t.total)}</p>
                ${t.tax ? `<table class="taxsum"><thead><tr><th>GST rate</th><th class="r">Taxable</th>${split ? '<th class="r">CGST</th><th class="r">SGST</th>' : '<th class="r">IGST</th>'}</tr></thead><tbody>
                  ${[...taxByRate].filter(([, v]) => v.tax).map(([r, v]) => `<tr><td>${r}%</td><td class="r">${money(v.taxable)}</td>${split ? `<td class="r">${money(v.tax / 2)}</td><td class="r">${money(v.tax / 2)}</td>` : `<td class="r">${money(v.tax)}</td>`}</tr>`).join("")}
                </tbody></table>` : ""}
                ${doc.notes ? `<p><span class="label">Notes</span>${esc(doc.notes)}</p>` : ""}
                ${isSale && (biz.bank || biz.upi) ? `<p><span class="label">Payment details</span>${biz.bank ? esc(biz.bank).replace(/\n/g, "<br>") : ""}${biz.upi ? `<br>UPI: <b>${esc(biz.upi)}</b>` : ""}</p>` : ""}
                ${isSale && biz.terms ? `<p class="terms"><span class="label">Terms</span>${esc(biz.terms)}</p>` : ""}
              </div>
              <div class="paper-totals">
                <div><span>Taxable value</span><span>${money(t.subtotal)}</span></div>
                ${split && t.tax ? `<div><span>CGST</span><span>${money(t.tax / 2)}</span></div><div><span>SGST</span><span>${money(t.tax / 2)}</span></div>` : t.tax ? `<div><span>${isSale ? "IGST" : "GST"}</span><span>${money(t.tax)}</span></div>` : ""}
                ${t.shipping ? `<div><span>Delivery / other</span><span>${money(t.shipping)}</span></div>` : ""}
                ${t.roundOff ? `<div><span>Round off</span><span>${money(t.roundOff)}</span></div>` : ""}
                <div class="grand"><span>Total</span><span>${money(t.total)}</span></div>
                ${paid ? `<div><span>Paid</span><span>${money(paid)}</span></div><div class="due"><span>Balance due</span><span>${money(balance)}</span></div>` : ""}
              </div>
            </div>
            ${isSale ? `<div class="paper-sign"><span>For ${esc(biz.name || "Oval Farms")}</span><span class="sigline">Authorised signatory</span></div>` : ""}
            <p class="paper-thanks">${isSale ? "Thank you for your business!" : ""}</p>
          </article>
          <aside class="doc-side no-print">
            <div class="card">
              <div class="card-head"><h3>Payments</h3></div>
              ${pays.length ? `<div class="mini-list">${pays.map((p) => `<div class="clickable" data-payid="${p.id}"><span>${fmtDate(p.date)} · ${esc(p.mode || "")}</span><b>${money(p.amount)}</b></div>`).join("")}</div>` : `<p class="muted">No payments recorded yet.</p>`}
              <div class="mini-stats"><div><b>${money(paid)}</b><span>paid</span></div><div><b>${money(balance)}</b><span>balance</span></div></div>
            </div>
            <div class="card muted small">
              Created ${fmtDate(doc.createdAt)} by ${esc(doc.createdBy || "—")}<br>Last edited ${fmtDate(doc.updatedAt)} by ${esc(doc.updatedBy || "—")}
            </div>
          </aside>
        </div>`;

      const q = (s) => root.querySelector(s);
      if (q("[data-print]")) q("[data-print]").addEventListener("click", () => window.print());
      if (q("[data-pay]")) q("[data-pay]").addEventListener("click", () => openForm("payments", null, {
        presets: { direction: D.dir, [D.partyKey]: doc[D.partyKey] || "", refId: doc.id, amount: balance, mode: "UPI" },
      }));
      root.querySelectorAll("[data-payid]").forEach((el) => el.addEventListener("click", () => openForm("payments", store.get("payments", el.dataset.payid))));
      if (q("[data-delivered]")) q("[data-delivered]").addEventListener("click", () => { store.put(D.col, { id: doc.id, status: "Delivered" }); toast("Marked as delivered"); });
      if (q("[data-dup]")) q("[data-dup]").addEventListener("click", () => {
        const { id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = doc;
        const copy = store.put(D.col, { ...rest, number: calc.nextNumber(D.col, D.prefix()), date: today(), dueDate: "", status: kind === "sales" ? "Draft" : "Ordered" });
        toast("Copy created as " + copy.number);
        navigate(`#/${D.route}/${copy.id}/edit`);
      });
      if (q("[data-del]")) q("[data-del]").addEventListener("click", async () => {
        if (!(await confirmDialog(`Delete ${doc.number}? Stock and balances will be recalculated for everyone.`, { danger: true, okLabel: "Delete" }))) return;
        store.remove(D.col, doc.id);
        if (isSale) linkOrder(null, doc.orderId);
        toast(D.singular + " deleted");
        navigate("#/" + D.route, true);
      });
      if (q("[data-wa]")) q("[data-wa]").addEventListener("click", () => {
        const lines = (doc.lines || []).map((l) => `• ${lineName(l, items.get(l.itemId))} × ${num(l.qty)} = ${money(calc.lineCalc(l).total)}`);
        const text = [`*${biz.name || "Oval Farms"}*`, `Invoice ${doc.number} · ${fmtDate(doc.date)}`, ...lines, `*Total: ${money(t.total)}*`, balance > 0 && paid ? `Balance due: ${money(balance)}` : "", biz.upi ? `Pay by UPI: ${biz.upi}` : "", "Thank you!"].filter(Boolean).join("\n");
        const phone = party && party.phone ? party.phone.replace(/\D/g, "") : "";
        const ph = phone.length === 10 ? "91" + phone : phone;
        window.open(`https://wa.me/${ph}?text=${encodeURIComponent(text)}`, "_blank");
      });
    },
  };
}
