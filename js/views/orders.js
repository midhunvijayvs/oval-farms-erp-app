// Orders: one list for orders placed on ovalfarm.in (channel "online") and orders taken by phone,
// WhatsApp or at the counter and entered here ("offline"). Every invoice is made from an order.
import { store } from "../store.js";
import { can } from "../session.js";
import { list } from "../schema.js";
import { esc, money, num, toDateStr, round2 } from "../util.js";
import { icon } from "../icons.js";
import { toast, pageHead, chip, emptyState, stat, confirmDialog } from "../ui.js";
import { navigate } from "../router.js";
import { openForm } from "./crud.js";
import * as calc from "../calc.js";
import { sellables, findPack, keyOf, splitKey, packsOf } from "../packs.js";
import { mapOf, mapLink, customerAddress } from "./customers.js";

export const ORDER_STATUSES = [
  { k: "placed", label: "New", tone: "warn" },
  { k: "confirmed", label: "Confirmed", tone: "info" },
  { k: "packed", label: "Packed", tone: "info" },
  { k: "out_for_delivery", label: "Out for delivery", tone: "info" },
  { k: "delivered", label: "Delivered", tone: "ok" },
  { k: "cancelled", label: "Cancelled", tone: "muted" },
];
export const statusInfo = (k) => ORDER_STATUSES.find((s) => s.k === k) || { k, label: k || "Unknown", tone: "muted" };
const OPEN = ["placed", "confirmed", "packed", "out_for_delivery"];
const NEXT = { placed: "confirmed", confirmed: "packed", packed: "out_for_delivery", out_for_delivery: "delivered" };
const NEXT_LABEL = { placed: "Confirm order", confirmed: "Mark packed", packed: "Out for delivery", out_for_delivery: "Mark delivered" };
const PAYMENTS = [{ v: "cod", l: "Cash / UPI on delivery" }, { v: "paid", l: "Paid already" }, { v: "credit", l: "On credit (invoice)" }];
const TABS = [{ k: "open", label: "Open" }, { k: "all", label: "All" }, ...ORDER_STATUSES];

// Same number on the website and in the ERP, e.g. OF-7Q2KX9
export const orderNo = (o) => "OF-" + String(o.id).slice(0, 6).toUpperCase();
export const channelLabel = (o) => (o.channel === "online" ? "Online" : "Offline");
const toMs = (v) => (typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const when = (v) => {
  const ms = toMs(v);
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};
const statusChip = (k) => { const s = statusInfo(k); return chip(s.label, s.tone); };
export const addressText = (a) => (!a ? "" : typeof a === "string" ? a : [a.name, a.line1, a.line2, a.landmark, a.city, a.district, a.state, a.pincode].filter(Boolean).join(", "));
const phoneDigits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const customerName = (o) => (o.customer && o.customer.name) || (o.customerId ? (store.get("customers", o.customerId) || {}).name : "") || "Walk-in customer";
const byNewest = (a, b) => toMs(b.createdAt) - toMs(a.createdAt);

const st = { q: "", tab: "open" };

function matchesTab(o, tab) {
  if (tab === "open") return OPEN.includes(o.status);
  if (tab === "all") return true;
  return o.status === tab;
}

export const ordersView = {
  title: "Orders",
  render(root) {
    const all = store.all("orders").sort(byNewest);
    let rows = all.filter((o) => matchesTab(o, st.tab));
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((o) => orderNo(o).toLowerCase().includes(q) || [customerName(o), o.customer && o.customer.phone, addressText(o.address), o.invoiceNumber].join(" ").toLowerCase().includes(q));
    }
    const todayStr = toDateStr(new Date());
    const todays = all.filter((o) => toMs(o.createdAt) && toDateStr(new Date(toMs(o.createdAt))) === todayStr && o.status !== "cancelled");
    const fresh = all.filter((o) => o.status === "placed");
    const toBill = all.filter((o) => o.status !== "cancelled" && !o.invoiceId);
    const count = (k) => all.filter((o) => matchesTab(o, k)).length;

    root.innerHTML = `
      ${pageHead("Orders", "Website orders and orders taken by phone, WhatsApp or in person", can("write") ? `<a class="btn btn-primary new-btn" href="#/orders/new">${icon("plus")}New order</a>` : "")}
      <div class="stats stats-3">
        ${stat("New, to confirm", String(fresh.length), { ic: "alert", tone: fresh.length ? "warn" : "" })}
        ${stat("Not invoiced yet", String(toBill.length), { ic: "file" })}
        ${stat("Today", money(todays.reduce((t, o) => t + (Number(o.total) || 0), 0)), { sub: `${todays.length} ${todays.length === 1 ? "order" : "orders"}`, ic: "trend", tone: "ok" })}
      </div>
      <div class="tabs order-tabs" role="tablist">${TABS.map((t) => `<button class="tab ${st.tab === t.k ? "on" : ""}" role="tab" aria-selected="${st.tab === t.k}" data-tab="${t.k}">${esc(t.label)} <span class="tab-count">${count(t.k)}</span></button>`).join("")}</div>
      <div class="toolbar">
        <div class="search">${icon("search")}<input type="search" placeholder="Search order no., name, phone, place or invoice…" value="${esc(st.q)}" data-q></div>
      </div>
      <div class="card card-flush">
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Channel</th><th>Status</th><th>Invoice</th><th class="r">Total</th></tr></thead><tbody>
          ${rows.map((o) => `<tr class="clickable" data-id="${esc(o.id)}">
            <td class="primary" data-label="Order">${esc(orderNo(o))}</td>
            <td data-label="Placed">${esc(when(o.createdAt))}</td>
            <td data-label="Customer">${esc(customerName(o))}<small class="muted block">${esc((o.address && o.address.city) || o.source || "")}</small></td>
            <td data-label="Channel">${chip(channelLabel(o))}</td>
            <td data-label="Status">${statusChip(o.status)}</td>
            <td data-label="Invoice">${o.invoiceNumber ? esc(o.invoiceNumber) : o.status === "cancelled" ? "" : `<span class="muted">Not yet</span>`}</td>
            <td class="r" data-label="Total"><b>${money(o.total)}</b></td></tr>`).join("")}
        </tbody></table></div>` : emptyState(st.tab === "open" ? "No open orders right now." : "No orders here.", can("write") && !all.length ? `<a class="btn btn-primary" href="#/orders/new">${icon("plus")}Add the first order</a>` : "")}
      </div>
      ${can("write") ? `<a class="fab" href="#/orders/new" aria-label="New order">${icon("plus")}</a>` : ""}`;

    const rr = () => this.render(root);
    root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { st.tab = b.dataset.tab; rr(); }));
    root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => navigate("#/orders/" + tr.dataset.id)));
  },
};

export const orderDetailView = {
  title: "Order",
  render(root, params) {
    const o = store.get("orders", params.id);
    if (!o) {
      root.innerHTML = emptyState("This order was not found.") + `<p class="center"><a class="btn" href="#/orders">Back to orders</a></p>`;
      return;
    }
    const c = o.customer || {};
    const cust = o.customerId ? store.get("customers", o.customerId) : null;
    const items = Array.isArray(o.items) ? o.items : [];
    const write = can("write");
    const next = o.status !== "cancelled" && NEXT[o.status];
    const invoice = o.invoiceId ? store.get("sales", o.invoiceId) : null;
    const tel = phoneDigits(c.phone);
    const products = new Map(store.all("products").map((p) => [p.id, p]));

    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/orders">${icon("back")}Orders</a><h1>${esc(orderNo(o))} ${statusChip(o.status)} ${chip(channelLabel(o))}</h1><p class="muted">Placed ${esc(when(o.createdAt))}${o.source ? ` · ${esc(o.source)}` : ""}${o.updatedBy ? ` · last updated by ${esc(o.updatedBy)}` : ""}</p></div>
        <div class="page-actions">
          ${write && next ? `<button class="btn btn-primary" data-next>${icon("tick")}${NEXT_LABEL[o.status]}</button>` : ""}
          ${write && !invoice && o.status !== "cancelled" ? `<a class="btn btn-ghost" href="#/sales/new?order=${encodeURIComponent(o.id)}">${icon("file")}Create invoice</a>` : ""}
          ${write && !invoice ? `<a class="btn btn-ghost" href="#/orders/${encodeURIComponent(o.id)}/edit">${icon("edit")}Edit order</a>` : ""}
        </div></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>${icon("users")}Customer</h3>${cust ? `<button class="btn btn-link" data-cust>Open customer</button>` : ""}</div>
          <div class="kv-row"><span>Name</span><b>${esc(customerName(o))}</b></div>
          ${c.phone ? `<div class="kv-row"><span>Phone</span><span><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${tel ? ` · <a href="https://wa.me/91${tel}" target="_blank" rel="noopener">${icon("whatsapp")}WhatsApp</a>` : ""}</span></div>` : ""}
          ${c.email ? `<div class="kv-row"><span>Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ""}
          ${addressText(o.address) ? `<div class="kv-row"><span>Deliver to</span><span class="r">${esc(addressText(o.address))}${mapOf(o.address) ? `<br>${mapLink(mapOf(o.address))}` : ""}</span></div>` : ""}
          ${o.note ? `<div class="kv-row"><span>Customer note</span><span class="r">${esc(o.note)}</span></div>` : ""}
          <div class="kv-row"><span>Payment</span><span>${esc((PAYMENTS.find((p) => p.v === o.payment) || { l: o.payment || "" }).l)}</span></div>
        </div>
        <div class="card"><div class="card-head"><h3>${icon("settings")}Handling</h3></div>
          <div class="field"><label>Status</label><select data-set-status ${write ? "" : "disabled"}>${ORDER_STATUSES.map((s) => `<option value="${s.k}" ${s.k === o.status ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
          <div class="field"><label>Staff note (not shown to the customer)</label><textarea rows="2" data-staff-note ${write ? "" : "disabled"}>${esc(o.staffNote || "")}</textarea></div>
          ${invoice ? `<div class="kv-row"><span>Invoice</span><a href="#/sales/${esc(invoice.id)}">${icon("file")}${esc(invoice.number)}</a></div>`
            : o.status === "cancelled" ? "" : `<p class="small muted">No invoice yet. Create the invoice when the order goes out: stock and accounts update from the invoice.</p>`}
        </div>
      </div>
      <div class="card card-flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
        ${items.map((i) => {
          const p = products.get(i.productId);
          return `<tr><td class="primary" data-label="Item">${esc(i.name || (p && p.name) || "")}${!p ? ` <small class="text-warn">not in Products</small>` : ""}</td><td class="r" data-label="Qty">${num(i.qty)} ${esc(i.unit || "")}</td><td class="r" data-label="Price">${money(i.price)}</td><td class="r" data-label="Amount"><b>${money((Number(i.qty) || 0) * (Number(i.price) || 0))}</b></td></tr>`;
        }).join("")}
      </tbody></table></div>
      <div class="totals order-totals">
        <div><span>Items</span><b>${money(o.subtotal ?? items.reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.price) || 0), 0))}</b></div>
        <div><span>Delivery</span><b>${money(o.deliveryCharge || 0)}</b></div>
        <div class="grand"><span>Total</span><b>${money(o.total)}</b></div>
      </div></div>
      ${o.channel === "online" ? `<p class="small muted">Prices come from the website at the time of the order. Confirm the total with the customer before delivery.</p>` : ""}`;

    const save = (patch, msg) => { store.put("orders", { id: o.id, ...patch }); toast(msg); };
    const nb = root.querySelector("[data-next]");
    if (nb) nb.addEventListener("click", () => save({ status: next }, statusInfo(next).label));
    const sel = root.querySelector("[data-set-status]");
    sel.addEventListener("change", async () => {
      if (sel.value === "cancelled" && !(await confirmDialog(o.channel === "online" ? "Cancel this order? The customer will see it as cancelled." : "Cancel this order?", { okLabel: "Cancel order", danger: true }))) { sel.value = o.status; return; }
      save({ status: sel.value }, "Status: " + statusInfo(sel.value).label);
    });
    const note = root.querySelector("[data-staff-note]");
    note.addEventListener("change", () => save({ staffNote: note.value.slice(0, 1000) }, "Note saved"));
    const cb = root.querySelector("[data-cust]");
    if (cb) cb.addEventListener("click", () => openForm("customers", cust));
  },
};

// ---------------- new / edit order ----------------
function blankLine() { return { productId: "", qty: 1, price: "" }; }

export const orderEditor = {
  title: "Order",
  keepOnRemote: true,
  render(root, params) {
    const existing = params.id ? store.get("orders", params.id) : null;
    if (params.id && !existing) { root.innerHTML = emptyState("This order was not found."); return; }
    if (!can("write") || (existing && existing.invoiceId)) { navigate("#/orders" + (params.id ? "/" + params.id : ""), true); return; }
    const products = store.all("products").filter((p) => p.active !== false && (p.salePrice !== "" && p.salePrice != null || p.published || packsOf(p).length)).sort((a, b) => a.name.localeCompare(b.name));
    // Each product, or each of its pack sizes, is one choice: value "productId" or "productId|packId"
    const choices = sellables(products);
    const o = existing ? JSON.parse(JSON.stringify(existing)) : {
      channel: "offline", source: list("orderSources")[0] || "Phone call", status: "confirmed", payment: "cod",
      customerId: params.query && params.query.customer || "", items: [blankLine()], deliveryCharge: "", note: "", staffNote: "",
    };
    if (!o.items || !o.items.length) o.items = [blankLine()];
    const online = o.channel === "online";
    let addressTouched = !!existing;

    const lineRow = (l, i) => {
      const p = products.find((x) => x.id === l.productId) || store.get("products", l.productId);
      const k = p ? findPack(p, l.packId) : null;
      const size = Number(l.size) || (k ? Number(k.size) : 1);
      const key = keyOf(l.productId, l.packId);
      // What this order already holds back counts as available while editing it
      const held = existing ? (existing.items || []).filter((x) => x.productId === (p && p.id)).reduce((t, x) => t + (Number(x.qty) || 0) * (Number(x.size) || 1), 0) : 0;
      const avail = p ? calc.availableOf(p.id) + held : null;
      return `<div class="line line-simple" data-i="${i}">
        <div class="line-item"><select data-f="productId"><option value="">Select product…</option>${choices.map((c) => `<option value="${esc(c.key)}" ${c.key === key ? "selected" : ""}>${esc(c.name)}</option>`).join("")}${p && !choices.some((c) => c.key === key) ? `<option value="${esc(key)}" selected>${esc(l.name || p.name)}</option>` : ""}</select>
          ${p ? `<small class="${Number(l.qty) * size > avail ? "text-warn" : "muted"}">Available: ${num(avail)} ${esc(p.unit || "")}${k ? ` (${num(Math.floor(avail / size))} × ${esc(k.name)})` : ""}</small>` : l.name ? `<small class="text-warn">${esc(l.name)} (not in Products)</small>` : ""}</div>
        <label class="line-num"><span>Qty${p ? " (" + esc(k ? k.name : p.unit || "") + ")" : ""}</span><input data-f="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(l.qty ?? "")}"></label>
        <label class="line-num"><span>Price</span><input data-f="price" type="number" inputmode="decimal" step="0.01" value="${esc(l.price ?? "")}"></label>
        <button class="icon-btn line-del" data-del="${i}" aria-label="Remove line">${icon("trash")}</button>
      </div>`;
    };

    const totals = () => {
      const subtotal = round2(o.items.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
      return { subtotal, total: round2(subtotal + (Number(o.deliveryCharge) || 0)) };
    };

    const draw = () => {
      const t = totals();
      const customers = store.all("customers").sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      root.innerHTML = `
        <div class="page-head"><div><a class="back" href="#/orders${existing ? "/" + esc(existing.id) : ""}">${icon("back")}${existing ? esc(orderNo(existing)) : "Orders"}</a><h1>${existing ? "Edit order" : "New order"}</h1>${online ? `<p class="muted">Placed on ovalfarm.in</p>` : ""}</div></div>
        <div class="editor">
          <div class="card"><div class="form-grid">
            <div class="field"><label>Customer</label>
              <div class="with-btn"><select data-h="customerId" ${online ? "disabled" : ""}><option value="">Walk-in customer</option>${customers.map((c) => `<option value="${esc(c.id)}" ${c.id === o.customerId ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}</select>
              ${online ? "" : `<button class="btn btn-ghost" data-addcust title="New customer">${icon("plus")}</button>`}</div></div>
            ${online ? "" : `<div class="field half"><label>Order came by</label><select data-h="source">${list("orderSources").map((s) => `<option ${s === o.source ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`}
            <div class="field half"><label>Status</label><select data-h="status">${ORDER_STATUSES.map((s) => `<option value="${s.k}" ${s.k === o.status ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
            <div class="field half"><label>Payment</label><select data-h="payment">${PAYMENTS.map((p) => `<option value="${p.v}" ${p.v === o.payment ? "selected" : ""}>${p.l}</option>`).join("")}</select></div>
            <div class="field half"><label>Contact phone</label><input data-h="phone" value="${esc((o.customer && o.customer.phone) || "")}"></div>
            <div class="field"><label>Deliver to (leave empty for pick-up)</label><textarea data-h="address" rows="2">${esc(o.addressText ?? addressText(o.address))}</textarea></div>
          </div></div>
          <div class="card"><div class="card-head"><h3>Items</h3></div>
            <div class="lines">${o.items.map(lineRow).join("")}</div>
            <button class="btn btn-ghost" data-addline>${icon("plus")}Add item</button>
          </div>
          <div class="editor-bottom">
            <div class="card">
              <div class="field"><label>Customer note</label><textarea data-h="note" rows="2" placeholder="Delivery time, special requests…">${esc(o.note || "")}</textarea></div>
              <div class="field"><label>Staff note (not shown to the customer)</label><textarea data-h="staffNote" rows="2">${esc(o.staffNote || "")}</textarea></div>
            </div>
            <div class="card totals">
              <div><span>Items</span><b>${money(t.subtotal)}</b></div>
              <div><span>Delivery charge</span><input type="number" step="0.01" data-h="deliveryCharge" value="${esc(o.deliveryCharge ?? "")}" placeholder="0"></div>
              <div class="grand"><span>Total</span><b>${money(t.total)}</b></div>
            </div>
          </div>
          <div class="editor-actions">
            <a class="btn btn-ghost" href="#/orders${existing ? "/" + esc(existing.id) : ""}">Cancel</a>
            <button class="btn btn-primary" data-save>${icon("tick")}Save order</button>
          </div>
        </div>`;
      bind();
    };

    const readHeader = () => {
      root.querySelectorAll("[data-h]").forEach((el) => {
        if (el.disabled) return;
        const k = el.dataset.h;
        const v = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
        if (k === "phone") o.customer = { ...(o.customer || {}), phone: v.trim() };
        else if (k === "address") o.addressText = v;
        else o[k] = v;
      });
    };

    const fillFromCustomer = () => {
      const c = store.get("customers", o.customerId);
      o.customer = c ? { name: c.name || "", phone: c.phone || "", email: c.email || "" } : { name: "", phone: (o.customer && o.customer.phone) || "" };
      if (!addressTouched) {
        const a = c ? (customerAddress(c) || c.address || (Array.isArray(c.addresses) && c.addresses[0]) || "") : "";
        o.address = a ? (typeof a === "string" ? { line1: a } : a) : null;
        o.addressText = addressText(o.address);
      }
    };

    const bind = () => {
      root.querySelectorAll("[data-h]").forEach((el) => el.addEventListener("change", () => {
        if (el.dataset.h === "address") addressTouched = true;
        readHeader();
        if (el.dataset.h === "customerId") { fillFromCustomer(); draw(); }
        if (el.dataset.h === "deliveryCharge") draw();
      }));
      root.querySelectorAll(".line").forEach((row) => {
        const i = +row.dataset.i;
        row.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
          readHeader();
          const l = o.items[i];
          const f = el.dataset.f;
          if (f === "productId") {
            const c = choices.find((x) => x.key === el.value);
            const { productId, packId } = splitKey(el.value);
            Object.assign(l, { productId, packId: packId || null, size: c ? c.size : 1 });
            if (c) { l.price = c.price === "" || c.price == null ? "" : Number(c.price); l.name = c.name; l.unit = c.pack ? c.pack.name : c.product.unit || ""; }
          } else l[f] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
          draw();
          const again = root.querySelector(`.line[data-i="${i}"] [data-f="${f === "productId" ? "qty" : f}"]`);
          if (again) again.focus();
        }));
      });
      root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
        readHeader();
        o.items.splice(+b.dataset.del, 1);
        if (!o.items.length) o.items.push(blankLine());
        draw();
      }));
      root.querySelector("[data-addline]").addEventListener("click", () => { readHeader(); o.items.push(blankLine()); draw(); });
      const ac = root.querySelector("[data-addcust]");
      if (ac) ac.addEventListener("click", () => { readHeader(); openForm("customers", null, { onSaved: (c) => { o.customerId = c.id; fillFromCustomer(); draw(); } }); });
      root.querySelector("[data-save]").addEventListener("click", () => {
        readHeader();
        const items = o.items.filter((l) => l.productId || l.name).map((l) => {
          const p = store.get("products", l.productId);
          const c = choices.find((x) => x.key === keyOf(l.productId, l.packId));
          return {
            productId: l.productId || "", packId: l.packId || null, size: Number(l.size) || (c ? c.size : 1),
            name: (c && c.name) || l.name || (p && p.name) || "", qty: Number(l.qty) || 0,
            unit: (c && c.pack ? c.pack.name : p && p.unit) || l.unit || "", price: Number(l.price) || 0,
          };
        });
        if (!items.length) return toast("Add at least one item", "error");
        if (items.some((l) => !(l.qty > 0))) return toast("Each item needs a quantity", "error");
        if (!online) fillFromCustomerKeepPhone();
        if (o.addressText !== undefined) {
          const txt = o.addressText.trim();
          o.address = !txt ? null : o.address && typeof o.address === "object" && addressText(o.address) === txt ? o.address : { line1: txt };
        }
        const t = { subtotal: round2(items.reduce((s, l) => s + l.qty * l.price, 0)) };
        const deliveryCharge = Number(o.deliveryCharge) || 0;
        const c = store.get("customers", o.customerId);
        const rec = {
          ...(existing ? { id: existing.id } : { channel: "offline" }),
          customerId: o.customerId || "",
          customerUid: online ? existing.customerUid : (c && c.uid) || null,
          customer: o.customer,
          address: o.address || null,
          items, itemCount: items.reduce((s, l) => s + l.qty, 0),
          subtotal: t.subtotal, deliveryCharge, total: round2(t.subtotal + deliveryCharge),
          note: String(o.note || "").slice(0, 500), staffNote: String(o.staffNote || "").slice(0, 1000),
          payment: o.payment, status: o.status,
          ...(online ? {} : { source: o.source }),
        };
        const saved = store.put("orders", rec);
        toast(existing ? "Order saved" : "Order " + orderNo(saved) + " added");
        navigate("#/orders/" + saved.id, true);
      });
    };

    // The phone typed on the order wins over the customer's saved phone.
    const fillFromCustomerKeepPhone = () => {
      const phone = o.customer && o.customer.phone;
      const c = store.get("customers", o.customerId);
      o.customer = { name: c ? c.name || "" : "Walk-in customer", phone: phone || (c && c.phone) || "", ...(c && c.email ? { email: c.email } : {}) };
    };

    if (!existing && o.customerId) fillFromCustomer();
    draw();
  },
};
