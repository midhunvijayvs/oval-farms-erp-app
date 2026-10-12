// Processing runs: turn fresh mushrooms and raw materials into value-added products
// (dried mushroom, pickle, powder, soup mix…). Consumes inputs from stock, adds output lot.
import { store } from "../store.js";
import { can } from "../session.js";
import { esc, money, num, sum, today, addDays, fmtDate, inRange, monthStart, daysBetween } from "../util.js";
import { icon } from "../icons.js";
import { toast, confirmDialog, pageHead, chip, emptyState, stat } from "../ui.js";
import * as calc from "../calc.js";
import { navigate } from "../router.js";

const st = { q: "", from: "", to: "" };

export const productionList = {
  title: "Processing",
  render(root) {
    const items = new Map(store.all("items").map((i) => [i.id, i]));
    let rows = store.all("productions");
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((r) => (r.lotNo || "").toLowerCase().includes(q) || ((items.get(r.outputItemId) || {}).name || "").toLowerCase().includes(q));
    }
    if (st.from) rows = rows.filter((r) => inRange(r.date, st.from, st.to));
    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const monthRuns = store.all("productions").filter((r) => r.date >= monthStart());
    const expiring = calc.expiringLots(30);

    root.innerHTML = `
      ${pageHead("Processing", "Value-added production runs: inputs used, output lot, cost and expiry.", can("write") ? `<a class="btn btn-primary new-btn" href="#/production/new">${icon("plus")}New production run</a>` : "")}
      <div class="stats stats-3">
        ${stat("Runs this month", String(monthRuns.length), { ic: "flask" })}
        ${stat("Value produced this month", money(sum(monthRuns, (r) => (Number(r.outputQty) || 0) * (Number((items.get(r.outputItemId) || {}).salePrice) || 0))), { ic: "trend", sub: "at selling price" })}
        ${stat("Lots expiring in 30 days", String(expiring.length), { ic: "clock", tone: expiring.length ? "warn" : "" })}
      </div>
      <div class="toolbar">
        <div class="search">${icon("search")}<input type="search" placeholder="Search lot or product…" value="${esc(st.q)}" data-q></div>
        <div class="seg"><button data-preset="month" class="${st.from ? "on" : ""}">This month</button><button data-preset="all" class="${!st.from ? "on" : ""}">All</button></div>
      </div>
      <div class="card card-flush">
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Lot</th><th>Date</th><th>Product</th><th class="r">Output</th><th class="r">Cost / unit</th><th>Expiry</th></tr></thead><tbody>
          ${rows.map((r) => {
            const it = items.get(r.outputItemId) || {};
            const c = calc.productionCost(r);
            const left = r.expiryDate ? daysBetween(today(), r.expiryDate) : null;
            return `<tr class="clickable" data-id="${r.id}"><td class="primary" data-label="Lot">${esc(r.lotNo)}</td><td data-label="Date">${fmtDate(r.date)}</td>
              <td data-label="Product">${esc(it.name || "")}</td><td class="r" data-label="Output">${num(r.outputQty)} ${esc(it.unit || "")}</td>
              <td class="r" data-label="Cost / unit">${c.perUnit ? money(c.perUnit) : "–"}</td>
              <td data-label="Expiry">${r.expiryDate ? fmtDate(r.expiryDate) + " " + (left < 0 ? chip("Expired", "danger") : left <= 30 ? chip(left + " days", "warn") : "") : ""}</td></tr>`;
          }).join("")}</tbody></table></div>` : emptyState("No production runs yet. Record one each time you make a batch of pickle, dried mushroom, powder and so on.", can("write") ? `<a class="btn btn-primary" href="#/production/new">${icon("plus")}New production run</a>` : "")}
      </div>
      ${can("write") ? `<a class="fab" href="#/production/new" aria-label="New">${icon("plus")}</a>` : ""}`;
    root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; this.render(root); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { st.from = b.dataset.preset === "month" ? monthStart() : ""; st.to = ""; this.render(root); }));
    root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => navigate("#/production/" + tr.dataset.id)));
  },
};

export const productionEditor = {
  title: "Production run",
  keepOnRemote: true,
  render(root, params) {
    const existing = params.id && params.id !== "new" ? store.get("productions", params.id) : null;
    if (params.id && params.id !== "new" && !existing) { root.innerHTML = emptyState("This production run was not found."); return; }
    const readOnly = !can("write");
    const items = store.all("items").filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const outputs = items.filter((i) => i.category !== "Raw Material" && i.category !== "Packaging" && i.category !== "Consumable");
    const run = existing ? JSON.parse(JSON.stringify(existing)) : { date: today(), lotNo: calc.nextNumber("productions", "LOT"), inputs: [{}], outputQty: "", otherCost: "" };
    if (!run.inputs || !run.inputs.length) run.inputs = [{}];
    const stock = calc.stockMap();

    const opt = (list, sel, ph) => `<option value="">${ph}</option>${list.map((i) => `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>${esc(i.name)}</option>`).join("")}`;

    const draw = () => {
      const c = calc.productionCost(run);
      const out = items.find((i) => i.id === run.outputItemId);
      root.innerHTML = `
        <div class="page-head"><div><a class="back" href="#/production">${icon("back")}Processing</a><h1>${existing ? esc(existing.lotNo) : "New production run"}</h1></div>
          <div class="page-actions">${existing && can("delete") ? `<button class="btn btn-ghost btn-danger-text" data-del>${icon("trash")}Delete</button>` : ""}</div></div>
        <div class="editor" ${readOnly ? "inert" : ""}>
          <div class="card"><div class="form-grid">
            <div class="field half"><label>Lot / batch no.</label><input data-h="lotNo" value="${esc(run.lotNo || "")}"></div>
            <div class="field half"><label>Production date</label><input type="date" data-h="date" value="${esc(run.date || "")}"></div>
            <div class="field"><label>Product made <span class="req">*</span></label><select data-h="outputItemId">${opt(outputs, run.outputItemId, "Select product…")}</select></div>
            <div class="field half"><label>Quantity produced${out ? " (" + esc(out.unit || "") + ")" : ""} <span class="req">*</span></label><input type="number" step="any" inputmode="decimal" data-h="outputQty" value="${esc(run.outputQty ?? "")}"></div>
            <div class="field half"><label>Best before / expiry</label><input type="date" data-h="expiryDate" value="${esc(run.expiryDate || "")}"></div>
          </div></div>
          <div class="card">
            <div class="card-head"><h3>Inputs used</h3><span class="muted small">Fresh mushroom, ingredients, packaging…</span></div>
            <div class="lines">${run.inputs.map((inp, i) => {
              const it = items.find((x) => x.id === inp.itemId);
              const avail = it ? stock.get(it.id) || 0 : null;
              return `<div class="line line-simple" data-i="${i}">
                <div class="line-item"><select data-f="itemId">${opt(items, inp.itemId, "Select item…")}</select>
                  ${it ? `<small class="${Number(inp.qty) > avail ? "text-warn" : "muted"}">In stock: ${num(avail)} ${esc(it.unit || "")}</small>` : ""}</div>
                <label class="line-num"><span>Qty${it ? " (" + esc(it.unit || "") + ")" : ""}</span><input type="number" step="any" inputmode="decimal" data-f="qty" value="${esc(inp.qty ?? "")}"></label>
                <div class="line-amt"><span>Cost</span><b>${money((Number(inp.qty) || 0) * (Number(it && it.costPrice) || 0))}</b></div>
                <button class="icon-btn line-del" data-delin="${i}" aria-label="Remove">${icon("trash")}</button></div>`;
            }).join("")}</div>
            <button class="btn btn-ghost" data-addin>${icon("plus")}Add input</button>
          </div>
          <div class="editor-bottom">
            <div class="card">
              <div class="field"><label>Other costs (labour, gas, electricity)</label><input type="number" step="0.01" data-h="otherCost" value="${esc(run.otherCost ?? "")}"></div>
              <div class="field"><label>Notes</label><textarea rows="3" data-h="notes">${esc(run.notes || "")}</textarea></div>
            </div>
            <div class="card totals">
              <div><span>Material cost</span><b>${money(c.material)}</b></div>
              <div><span>Other costs</span><b>${money(Number(run.otherCost) || 0)}</b></div>
              <div class="grand"><span>Total cost</span><b>${money(c.total)}</b></div>
              <div><span>Cost per ${esc(out ? out.unit || "unit" : "unit")}</span><b>${money(c.perUnit)}</b></div>
              ${out && out.salePrice ? `<div><span>Margin at selling price</span><b>${c.perUnit ? Math.round(((out.salePrice - c.perUnit) / out.salePrice) * 100) + "%" : "–"}</b></div>` : ""}
            </div>
          </div>
          ${readOnly ? "" : `<div class="editor-actions"><a class="btn btn-ghost" href="#/production">Cancel</a><button class="btn btn-primary" data-save>${icon("tick")}Save production run</button></div>`}
        </div>`;
      bind();
    };

    const readHeader = () => root.querySelectorAll("[data-h]").forEach((el) => { run[el.dataset.h] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value; });

    const bind = () => {
      root.querySelectorAll("[data-h]").forEach((el) => el.addEventListener("change", () => {
        readHeader();
        if (el.dataset.h === "outputItemId" || el.dataset.h === "date") {
          const it = items.find((i) => i.id === run.outputItemId);
          if (it && Number(it.shelfLifeDays) && (!run.expiryDate || el.dataset.h === "date" || !existing)) run.expiryDate = addDays(run.date || today(), Number(it.shelfLifeDays));
        }
        draw();
      }));
      root.querySelectorAll(".line").forEach((row) => row.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
        readHeader();
        run.inputs[+row.dataset.i][el.dataset.f] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
        draw();
        if (el.dataset.f === "itemId") { const q = root.querySelector(`.line[data-i="${row.dataset.i}"] [data-f="qty"]`); if (q) q.focus(); }
      })));
      root.querySelectorAll("[data-delin]").forEach((b) => b.addEventListener("click", () => { readHeader(); run.inputs.splice(+b.dataset.delin, 1); if (!run.inputs.length) run.inputs.push({}); draw(); }));
      const add = root.querySelector("[data-addin]");
      if (add) add.addEventListener("click", () => { readHeader(); run.inputs.push({}); draw(); });
      const save = root.querySelector("[data-save]");
      if (save) save.addEventListener("click", () => {
        readHeader();
        if (!run.outputItemId) return toast("Choose the product made", "error");
        if (!(Number(run.outputQty) > 0)) return toast("Enter the quantity produced", "error");
        run.inputs = run.inputs.filter((i) => i.itemId && Number(i.qty) > 0);
        store.put("productions", run);
        toast("Production run saved · stock updated");
        navigate("#/production", true);
      });
      const del = root.querySelector("[data-del]");
      if (del) del.addEventListener("click", async () => {
        if (!(await confirmDialog("Delete this production run? Its stock movements will be reversed.", { danger: true, okLabel: "Delete" }))) return;
        store.remove("productions", existing.id);
        toast("Production run deleted");
        navigate("#/production", true);
      });
    };
    draw();
  },
};
