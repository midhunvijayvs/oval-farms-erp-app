// Online orders and customers from ovalfarm.in, stored in Firebase (see js/firebase.js).
import { store } from "../store.js";
import { can } from "../session.js";
import { fb, ORDER_STATUSES, statusInfo, updateOrder, listenCustomers, configured, retry } from "../firebase.js";
import { esc, money, num, toDateStr } from "../util.js";
import { icon } from "../icons.js";
import { toast, pageHead, chip, emptyState, stat, confirmDialog } from "../ui.js";
import { navigate } from "../router.js";

const st = { q: "", status: "open" };
const OPEN = ["placed", "confirmed", "packed", "out_for_delivery"];
const NEXT = { placed: "confirmed", confirmed: "packed", packed: "out_for_delivery", out_for_delivery: "delivered" };
const NEXT_LABEL = { placed: "Confirm order", confirmed: "Mark packed", packed: "Out for delivery", out_for_delivery: "Mark delivered" };

export const orderNo = (o) => "W-" + String(o.id).slice(0, 6).toUpperCase();
const when = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};
const statusChip = (k) => { const s = statusInfo(k); return chip(s.label, s.tone); };
const addressText = (a) => (!a ? "" : typeof a === "string" ? a : [a.name, a.line1, a.line2, a.landmark, a.city, a.district, a.state, a.pincode].filter(Boolean).join(", "));
const phoneDigits = (p) => String(p || "").replace(/\D/g, "").slice(-10);

// Shown instead of the page while Firebase isn't usable.
function gate(root) {
  if (fb.state === "ready" || fb.state === "demo") return false;
  let msg;
  if (fb.state === "off" || !configured()) msg = `<b>Online orders aren't switched on yet.</b><p class="muted">They come from the ovalfarm.in shop through Firebase. Once Firebase is set up and its config is added to <code>config.js</code>, website orders show up here live.</p>`;
  else if (fb.state === "connecting") msg = `<div class="loader"></div><p class="muted">Connecting to online orders…</p>`;
  else if (fb.state === "denied") msg = `<b>You can't see online orders yet.</b><p class="muted">Your account isn't on the Oval Farms team in Firebase. Ask the admin to open the ERP once: that copies the Team list (Settings → Team) across.</p>`;
  else msg = `<b>Couldn't load online orders.</b><p class="muted">${esc(fb.error || "Check your internet connection.")}</p>`;
  const again = fb.state === "denied" || fb.state === "error";
  root.innerHTML = `${pageHead("Online Orders")}<div class="card info-card">${icon("cart")}<div>${msg}${again ? `<button class="btn btn-ghost" data-retry>${icon("refresh")}Try again</button>` : ""}</div></div>`;
  const rb = root.querySelector("[data-retry]");
  if (rb) rb.addEventListener("click", retry);
  return true;
}

export const ordersView = {
  title: "Online Orders",
  render(root) {
    if (gate(root)) return;
    const all = fb.orders;
    let rows = all;
    if (st.status === "open") rows = rows.filter((o) => OPEN.includes(o.status));
    else if (st.status) rows = rows.filter((o) => o.status === st.status);
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((o) => orderNo(o).toLowerCase().includes(q) || [o.customer && o.customer.name, o.customer && o.customer.phone, addressText(o.address)].join(" ").toLowerCase().includes(q));
    }
    const todayStr = toDateStr(new Date());
    const todays = all.filter((o) => o.createdAt && toDateStr(new Date(o.createdAt)) === todayStr && o.status !== "cancelled");
    const fresh = all.filter((o) => o.status === "placed");
    const pending = all.filter((o) => ["confirmed", "packed", "out_for_delivery"].includes(o.status));

    root.innerHTML = `
      ${pageHead("Online Orders", fb.state === "demo" ? "Sample orders (demo mode)" : "Orders placed on ovalfarm.in, updated live")}
      <div class="stats stats-3">
        ${stat("New, to confirm", String(fresh.length), { ic: "alert", tone: fresh.length ? "warn" : "" })}
        ${stat("In progress", String(pending.length), { ic: "truck" })}
        ${stat("Today", money(todays.reduce((t, o) => t + (Number(o.total) || 0), 0)), { sub: `${todays.length} ${todays.length === 1 ? "order" : "orders"}`, ic: "trend", tone: "ok" })}
      </div>
      <div class="toolbar">
        <div class="search">${icon("search")}<input type="search" placeholder="Search order no., name, phone or place…" value="${esc(st.q)}" data-q></div>
        <select data-status>
          <option value="open" ${st.status === "open" ? "selected" : ""}>Open orders</option>
          <option value="" ${st.status === "" ? "selected" : ""}>All orders</option>
          ${ORDER_STATUSES.map((s) => `<option value="${s.k}" ${st.status === s.k ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
      <div class="card card-flush">
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
          ${rows.map((o) => `<tr class="clickable" data-id="${esc(o.id)}">
            <td class="primary" data-label="Order">${esc(orderNo(o))}</td>
            <td data-label="Placed">${esc(when(o.createdAt))}</td>
            <td data-label="Customer">${esc((o.customer && o.customer.name) || "")}<small class="muted block">${esc((o.address && o.address.city) || "")}</small></td>
            <td data-label="Status">${statusChip(o.status)}</td>
            <td class="r" data-label="Total"><b>${money(o.total)}</b></td></tr>`).join("")}
        </tbody></table></div>` : emptyState(fb.ordersLoaded ? (st.status === "open" ? "No open orders right now." : "No orders match.") : "Loading orders…")}
      </div>`;

    const rr = () => this.render(root);
    root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelector("[data-status]").addEventListener("change", (e) => { st.status = e.target.value; rr(); });
    root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => navigate("#/orders/" + tr.dataset.id)));
  },
};

export const orderDetailView = {
  title: "Online Order",
  render(root, params) {
    if (gate(root)) return;
    const o = fb.orders.find((x) => x.id === params.id);
    if (!o) {
      root.innerHTML = emptyState(fb.ordersLoaded ? "This order was not found." : "Loading order…") + `<p class="center"><a class="btn" href="#/orders">Back to online orders</a></p>`;
      return;
    }
    const c = o.customer || {};
    const items = Array.isArray(o.items) ? o.items : [];
    const write = can("write") && o.status !== "cancelled";
    const next = NEXT[o.status];
    const invoice = o.invoiceId ? store.get("sales", o.invoiceId) : null;
    const tel = phoneDigits(c.phone);

    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/orders">${icon("back")}Online Orders</a><h1>${esc(orderNo(o))} ${statusChip(o.status)}</h1><p class="muted">Placed ${esc(when(o.createdAt))}${o.updatedBy ? ` · last updated by ${esc(o.updatedBy)}` : ""}</p></div>
        <div class="page-actions">
          ${write && next ? `<button class="btn btn-primary" data-next>${icon("tick")}${NEXT_LABEL[o.status]}</button>` : ""}
        </div></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>${icon("users")}Customer</h3></div>
          <div class="kv-row"><span>Name</span><b>${esc(c.name || "")}</b></div>
          ${c.phone ? `<div class="kv-row"><span>Phone</span><span><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${tel ? ` · <a href="https://wa.me/91${tel}" target="_blank" rel="noopener">${icon("whatsapp")}WhatsApp</a>` : ""}</span></div>` : ""}
          ${c.email ? `<div class="kv-row"><span>Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ""}
          <div class="kv-row"><span>Deliver to</span><span class="r">${esc(addressText(o.address))}</span></div>
          ${o.note ? `<div class="kv-row"><span>Customer note</span><span class="r">${esc(o.note)}</span></div>` : ""}
          <div class="kv-row"><span>Payment</span><span>${esc(o.payment === "cod" ? "Cash / UPI on delivery" : o.payment || "")}</span></div>
        </div>
        <div class="card"><div class="card-head"><h3>${icon("settings")}Handling</h3></div>
          <div class="field"><label>Status</label><select data-set-status ${write || (can("write") && o.status === "cancelled") ? "" : "disabled"}>${ORDER_STATUSES.map((s) => `<option value="${s.k}" ${s.k === o.status ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
          <div class="field"><label>Staff note (not shown to the customer)</label><textarea rows="2" data-staff-note ${can("write") ? "" : "disabled"}>${esc(o.staffNote || "")}</textarea></div>
          ${invoice ? `<div class="kv-row"><span>Invoice</span><a href="#/sales/${esc(invoice.id)}">${icon("file")}${esc(invoice.number)}</a></div>`
            : can("write") ? `<button class="btn btn-ghost" data-invoice>${icon("file")}Create invoice from this order</button><p class="small muted">Adds the customer to Customers if they're new and opens a sales invoice with these items, so stock and accounts update.</p>` : ""}
        </div>
      </div>
      <div class="card card-flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td class="primary" data-label="Item">${esc(i.name || i.productId || "")}</td><td class="r" data-label="Qty">${num(i.qty)} ${esc(i.unit || "")}</td><td class="r" data-label="Price">${money(i.price)}</td><td class="r" data-label="Amount"><b>${money((Number(i.qty) || 0) * (Number(i.price) || 0))}</b></td></tr>`).join("")}
      </tbody></table></div>
      <div class="totals order-totals">
        <div><span>Items</span><b>${money(o.subtotal ?? items.reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.price) || 0), 0))}</b></div>
        <div><span>Delivery</span><b>${money(o.deliveryCharge || 0)}</b></div>
        <div class="grand"><span>Total</span><b>${money(o.total)}</b></div>
      </div></div>
      <p class="small muted">Prices come from the website and aren't checked by the ERP. Confirm the total with the customer before delivery.</p>`;

    const save = async (patch, msg) => {
      try { await updateOrder(o.id, patch); toast(msg); }
      catch (e) { toast(e.code === "permission-denied" ? "You don't have permission to change orders." : e.message, "error"); }
    };
    const nb = root.querySelector("[data-next]");
    if (nb) nb.addEventListener("click", () => save({ status: next }, statusInfo(next).label));
    const sel = root.querySelector("[data-set-status]");
    sel.addEventListener("change", async () => {
      if (sel.value === "cancelled" && !(await confirmDialog("Cancel this order? The customer will see it as cancelled.", { okLabel: "Cancel order", danger: true }))) { sel.value = o.status; return; }
      save({ status: sel.value }, "Status: " + statusInfo(sel.value).label);
    });
    const note = root.querySelector("[data-staff-note]");
    note.addEventListener("change", () => save({ staffNote: note.value.slice(0, 1000) }, "Note saved"));
    const ib = root.querySelector("[data-invoice]");
    if (ib) ib.addEventListener("click", () => startInvoice(o));
  },
};

// ---------------- order -> sales invoice ----------------
let pendingDraft = null;
// The invoice editor may draw more than once, so the draft stays until the invoice is saved.
export function takeOrderDraft(orderId) {
  return pendingDraft && pendingDraft.orderId === orderId ? JSON.parse(JSON.stringify(pendingDraft)) : null;
}
export function clearOrderDraft() { pendingDraft = null; }

function findOrAddCustomer(o) {
  const c = o.customer || {};
  const tel = phoneDigits(c.phone);
  const email = String(c.email || "").toLowerCase();
  const all = store.all("customers");
  const hit = all.find((x) => x.webUid && x.webUid === o.customerUid)
    || (tel && all.find((x) => phoneDigits(x.phone) === tel))
    || (email && all.find((x) => String(x.email || "").toLowerCase() === email));
  if (hit) {
    if (!hit.webUid) store.put("customers", { id: hit.id, webUid: o.customerUid });
    return hit;
  }
  return store.put("customers", {
    name: c.name || "Website customer", type: "Online", phone: c.phone || "", email: c.email || "",
    address: addressText(o.address), webUid: o.customerUid, notes: "Joined through ovalfarm.in",
  });
}

function startInvoice(o) {
  const cust = findOrAddCustomer(o);
  const items = store.all("items");
  const byName = new Map(items.map((i) => [String(i.name || "").trim().toLowerCase(), i]));
  const lines = (o.items || []).map((li) => {
    const it = items.find((i) => i.webProductId && String(i.webProductId) === String(li.productId)) || byName.get(String(li.name || "").trim().toLowerCase());
    return it
      ? { itemId: it.id, qty: Number(li.qty) || 1, rate: Number(li.price) || 0, gstRate: String(it.gstRate || "0") }
      : { description: li.name || "Item " + li.productId, qty: Number(li.qty) || 1, rate: Number(li.price) || 0, gstRate: "0" };
  });
  pendingDraft = {
    orderId: o.id, customerId: cust.id, lines, shipping: Number(o.deliveryCharge) || "",
    notes: `Online order ${orderNo(o)}${o.note ? " · " + o.note : ""}\nDeliver to: ${addressText(o.address)}`,
  };
  if (lines.some((l) => !l.itemId)) toast("Some website items didn't match a product in Products & Materials. Pick them on the invoice so stock updates.", "error");
  navigate("#/sales/new?order=" + encodeURIComponent(o.id));
}

// ---------------- website customers ----------------
const cst = { q: "" };
export const webCustomersView = {
  title: "Website Customers",
  render(root) {
    if (gate(root)) return;
    listenCustomers();
    const counts = new Map();
    for (const o of fb.orders) if (o.status !== "cancelled") {
      const c = counts.get(o.customerUid) || { n: 0, total: 0, last: 0 };
      c.n++; c.total += Number(o.total) || 0; c.last = Math.max(c.last, o.createdAt || 0);
      counts.set(o.customerUid, c);
    }
    let rows = fb.customers.map((c) => ({ ...c, _o: counts.get(c.id) || { n: 0, total: 0, last: 0 } }));
    if (cst.q) {
      const q = cst.q.toLowerCase();
      rows = rows.filter((c) => [c.name, c.phone, c.email].join(" ").toLowerCase().includes(q));
    }
    const erp = new Set(store.all("customers").map((c) => c.webUid).filter(Boolean));
    root.innerHTML = `
      ${pageHead("Website Customers", "People who signed up on ovalfarm.in")}
      <div class="toolbar"><div class="search">${icon("search")}<input type="search" placeholder="Search name, phone or email…" value="${esc(cst.q)}" data-q></div></div>
      <div class="card card-flush">
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Joined</th><th class="r">Orders</th><th class="r">Spent</th></tr></thead><tbody>
          ${rows.map((c) => `<tr>
            <td class="primary" data-label="Name">${esc(c.name || "")}${erp.has(c.id) ? ` ${chip("In ERP", "ok")}` : ""}</td>
            <td data-label="Phone">${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}</td>
            <td data-label="Email">${esc(c.email || "")}</td>
            <td data-label="Joined">${esc(c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "")}</td>
            <td class="r" data-label="Orders">${c._o.n}</td>
            <td class="r" data-label="Spent">${money(c._o.total)}</td></tr>`).join("")}
        </tbody></table></div>` : emptyState(fb.customersLoaded ? (fb.error === "denied" ? "You don't have access to website customers." : "No website sign-ups yet.") : "Loading customers…")}
      </div>`;
    root.querySelector("[data-q]").addEventListener("input", (e) => { cst.q = e.target.value; const p = e.target.selectionStart; this.render(root); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
  },
};
