// Live stock position for every item, with a per-item movement ledger.
import { store } from "../store.js";
import { list } from "../schema.js";
import { can } from "../session.js";
import { esc, money, num, sum, fmtDate, today, toCSV, downloadFile } from "../util.js";
import { icon } from "../icons.js";
import { openModal, pageHead, chip, emptyState, stat } from "../ui.js";
import * as calc from "../calc.js";
import { openForm } from "./crud.js";

const st = { q: "", cat: "", only: "" };

function ledger(item) {
  const mv = calc.movements().filter((m) => m.itemId === item.id);
  const stockNow = calc.stockOf(item.id);
  openModal({
    title: item.name,
    wide: true,
    body: `
      <div class="mini-stats">
        <div><b>${num(stockNow)} ${esc(item.unit || "")}</b><span>in stock</span></div>
        <div><b>${money(stockNow * (Number(item.costPrice) || 0))}</b><span>value at cost</span></div>
        <div><b>${item.reorderLevel !== "" && item.reorderLevel != null ? num(item.reorderLevel) : "–"}</b><span>alert level</span></div>
      </div>
      ${mv.length ? `<div class="table-wrap"><table class="tbl tbl-compact"><thead><tr><th>Date</th><th>Movement</th><th>Ref</th><th class="r">Qty</th></tr></thead><tbody>
        ${mv.slice(0, 200).map((m) => `<tr><td data-label="Date">${fmtDate(m.date)}</td><td data-label="Movement">${esc(m.type)}</td><td data-label="Ref">${m.link ? `<a href="${m.link}" data-close-link>${esc(m.ref || "")}</a>` : esc(m.ref || "")}</td><td class="r ${m.qty < 0 ? "text-danger" : "text-ok"}" data-label="Qty">${m.qty > 0 ? "+" : ""}${num(m.qty)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">No stock movements yet.</p>`}`,
    actions: [
      ...(can("write") ? [
        { label: "Edit item", cls: "btn-ghost", icon: "edit", onClick: () => { openForm("items", item); } },
        { label: "Adjust stock", cls: "btn-primary", icon: "sliders", onClick: () => { openForm("adjustments", null, { presets: { itemId: item.id } }); } },
      ] : [{ label: "Close", cls: "btn-ghost" }]),
    ],
    onMount: ({ el, close }) => el.querySelectorAll("[data-close-link]").forEach((a) => a.addEventListener("click", close)),
  });
}

export const stockView = {
  title: "Stock",
  render(root) {
    const all = store.all("items").filter((i) => i.active !== false);
    let rows = all.map((i) => ({ ...i, _qty: calc.stockOf(i.id), _status: calc.stockStatus(i) }));
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.sku || "").toLowerCase().includes(q)); }
    if (st.cat) rows = rows.filter((r) => r.category === st.cat);
    if (st.only) rows = rows.filter((r) => r._status !== "In stock");
    rows.sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
    const value = sum(all, (i) => Math.max(0, calc.stockOf(i.id)) * (Number(i.costPrice) || 0));
    const saleValue = sum(all, (i) => Math.max(0, calc.stockOf(i.id)) * (Number(i.salePrice) || 0));
    const low = all.filter((i) => calc.stockStatus(i) !== "In stock");

    root.innerHTML = `
      ${pageHead("Stock", "Calculated live from harvests, production, purchases, sales and adjustments.", `
        <button class="btn btn-ghost hide-sm" data-export>${icon("download")}Export</button>
        ${can("write") ? `<button class="btn btn-ghost" data-adjust>${icon("sliders")}Adjust stock</button><button class="btn btn-primary" data-new>${icon("plus")}New item</button>` : ""}`)}
      <div class="stats stats-3">
        ${stat("Stock value (at cost)", money(value), { ic: "layers" })}
        ${stat("Stock value (at selling price)", money(saleValue), { ic: "trend" })}
        ${stat("Low or out of stock", String(low.length), { ic: "alert", tone: low.length ? "warn" : "ok" })}
      </div>
      <div class="toolbar">
        <div class="search">${icon("search")}<input type="search" placeholder="Search items…" value="${esc(st.q)}" data-q></div>
        <select data-cat><option value="">All categories</option>${list("itemCategories").map((c) => `<option ${c === st.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <div class="seg"><button data-only="" class="${!st.only ? "on" : ""}">All</button><button data-only="low" class="${st.only ? "on" : ""}">Needs attention</button></div>
      </div>
      <div class="card card-flush">
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Category</th><th class="r">In stock</th><th class="r">Alert at</th><th class="r">Value</th><th>Status</th></tr></thead><tbody>
          ${rows.map((r) => `<tr class="clickable" data-id="${r.id}"><td class="primary" data-label="Item">${esc(r.name)}</td><td data-label="Category">${esc(r.category || "")}</td>
            <td class="r" data-label="In stock"><b>${num(r._qty)}</b> ${esc(r.unit || "")}</td><td class="r" data-label="Alert at">${r.reorderLevel !== "" && r.reorderLevel != null ? num(r.reorderLevel) : "–"}</td>
            <td class="r" data-label="Value">${money(Math.max(0, r._qty) * (Number(r.costPrice) || 0))}</td><td data-label="Status">${chip(r._status)}</td></tr>`).join("")}
        </tbody></table></div>` : emptyState(all.length ? "No items match." : "Add your products, fresh mushrooms, raw materials and packaging to start tracking stock.", can("write") && !all.length ? `<button class="btn btn-primary" data-new>${icon("plus")}Add first item</button>` : "")}
      </div>`;

    const rr = () => this.render(root);
    root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelector("[data-cat]").addEventListener("change", (e) => { st.cat = e.target.value; rr(); });
    root.querySelectorAll("[data-only]").forEach((b) => b.addEventListener("click", () => { st.only = b.dataset.only; rr(); }));
    root.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openForm("items")));
    const adj = root.querySelector("[data-adjust]");
    if (adj) adj.addEventListener("click", () => openForm("adjustments"));
    root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => ledger(store.get("items", tr.dataset.id))));
    root.querySelector("[data-export]").addEventListener("click", () => {
      downloadFile(`stock-${today()}.csv`, toCSV(["Item", "SKU", "Category", "Unit", "In stock", "Cost price", "Value at cost", "Status"],
        rows.map((r) => [r.name, r.sku, r.category, r.unit, r._qty, r.costPrice, Math.max(0, r._qty) * (Number(r.costPrice) || 0), r._status])), "text/csv");
    });
  },
};
