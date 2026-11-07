// Grow batches. Creating a batch takes the materials used (substrate, spawn, bags…) out of stock
// and puts the beds made into stock. Contaminated beds are recorded later, when they're found,
// and go out of stock that day; "Discarded by expiry" takes out the beds still left.
// Harvests from the batch go into the fresh mushroom item, as before.
import { store } from "../store.js";
import { can } from "../session.js";
import { list, BATCH_STATUSES } from "../schema.js";
import { esc, money, num, sum, today, addDays, fmtDate, uid } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast, confirmDialog, pageHead, chip, emptyState, stat } from "../ui.js";
import * as calc from "../calc.js";
import { navigate } from "../router.js";

export const DISCARDED = "Discarded (expired)";
const st = { q: "", status: "" };
const plural = (u) => (/^(bed|bag)$/i.test(u) ? u + "s" : u);
const byStart = (a, b) => (b.startDate || "").localeCompare(a.startDate || "");

export const batchList = {
  title: "Grow Batches",
  render(root, params = {}) {
    if (params.query && params.query.new && can("write")) { navigate("#/batches/new", true); return; }
    const items = new Map(store.all("products").map((i) => [i.id, i]));
    const all = store.all("batches").sort(byStart);
    let rows = st.status ? all.filter((b) => b.status === st.status) : all;
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((b) => [b.code, b.mushroomType, b.room, b.status, (items.get(b.bedItemId) || {}).name].join(" ").toLowerCase().includes(q));
    }
    const statuses = BATCH_STATUSES.filter((s) => all.some((b) => b.status === s));
    root.innerHTML = `
      ${pageHead("Grow Batches", "Materials used go out of stock and the beds made come in. Harvests add fresh mushroom.", can("write") ? `<a class="btn btn-primary new-btn" href="#/batches/new">${icon("plus")}New grow batch</a>` : "")}
      <div class="tabs list-tabs" role="tablist">
        <button class="tab ${!st.status ? "on" : ""}" data-st="">All <span class="tab-count">${all.length}</span></button>
        ${statuses.map((s) => `<button class="tab ${st.status === s ? "on" : ""}" data-st="${esc(s)}">${esc(s)} <span class="tab-count">${all.filter((b) => b.status === s).length}</span></button>`).join("")}
      </div>
      <div class="toolbar"><div class="search">${icon("search")}<input type="search" placeholder="Search batch, mushroom, room…" value="${esc(st.q)}" data-q></div></div>
      <div class="card card-flush">
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Batch</th><th>Mushroom</th><th>Spawned</th><th>Status</th><th class="r">Beds left</th><th class="r">Harvested</th><th class="r" title="Biological efficiency: fresh yield ÷ dry substrate">B.E.</th></tr></thead><tbody>
          ${rows.map((b) => {
            const be = calc.biologicalEfficiency(b);
            const bed = items.get(b.bedItemId);
            return `<tr class="clickable" data-id="${esc(b.id)}"><td class="primary" data-label="Batch">${esc(b.code)}</td>
              <td data-label="Mushroom">${esc(b.mushroomType || "")}${b.room ? `<small class="muted block">${esc(b.room)}</small>` : ""}</td>
              <td data-label="Spawned">${fmtDate(b.startDate)}</td><td data-label="Status">${chip(b.status || "")}</td>
              <td class="r" data-label="Beds left">${b.bags ? `${num(calc.bedsLeft(b))} <small class="muted">of ${num(b.bags)}${bed && bed.unit ? " " + esc(plural(bed.unit)) : ""}</small>` : "–"}</td>
              <td class="r" data-label="Harvested">${calc.harvestedKg(b.id).toFixed(2)} kg</td>
              <td class="r" data-label="B.E.">${be == null ? "–" : be.toFixed(0) + "%"}</td></tr>`;
          }).join("")}</tbody></table></div>`
          : emptyState(all.length ? "No batches match." : "No grow batches yet. Start one when you fill the beds: pick the materials used and the beds made, and stock updates by itself.", !all.length && can("write") ? `<a class="btn btn-primary" href="#/batches/new">${icon("plus")}New grow batch</a>` : "")}
      </div>
      ${can("write") ? `<a class="fab" href="#/batches/new" aria-label="New grow batch">${icon("plus")}</a>` : ""}`;
    const rr = () => this.render(root);
    root.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", () => { st.status = b.dataset.st; rr(); }));
    root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => navigate("#/batches/" + tr.dataset.id)));
  },
};

export const batchEditor = {
  title: "Grow batch",
  keepOnRemote: true,
  render(root, params) {
    const isNew = !params.id || params.id === "new";
    const existing = isNew ? null : store.get("batches", params.id);
    if (!isNew && !existing) { root.innerHTML = emptyState("This grow batch was not found. It may have been deleted.") + `<p class="center"><a class="btn" href="#/batches">Back to grow batches</a></p>`; return; }
    if (isNew && !can("write")) { navigate("#/batches", true); return; }
    const readOnly = !can("write");
    const items = store.all("products").filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const freshItems = items.filter((i) => i.category === "Fresh Mushroom" || !i.category);
    const b = existing ? JSON.parse(JSON.stringify(existing))
      : { code: calc.nextNumber("batches", "B"), startDate: today(), expectedHarvestDate: addDays(today(), 21), status: "Spawning", inputs: [{}], bags: "", substrateKg: "", cost: "" };
    if (!b.inputs || !b.inputs.length) b.inputs = [{}];
    const stock = calc.stockMap();
    const opt = (arr, sel, ph) => `<option value="">${ph}</option>${arr.map((i) => `<option value="${esc(i.id)}" ${i.id === sel ? "selected" : ""}>${esc(i.name)}</option>`).join("")}`;
    const sel = (name, options, value) => `<select data-h="${name}"><option value="">—</option>${[...new Set([...options, value].filter(Boolean))].map((x) => `<option ${x === value ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;

    const draw = () => {
      const bed = items.find((i) => i.id === b.bedItemId) || store.get("products", b.bedItemId);
      const unit = bed && bed.unit ? plural(bed.unit) : "beds";
      const material = calc.batchMaterialCost(b);
      const saved = existing ? store.get("batches", existing.id) || b : null;
      root.innerHTML = `
        <div class="page-head"><div><a class="back" href="#/batches">${icon("back")}Grow Batches</a>
          <h1>${existing ? esc(existing.code) : "New grow batch"} ${saved ? chip(saved.status || "") : ""}</h1>
          ${saved ? `<p class="muted">${esc(saved.mushroomType || "")}${saved.room ? " · " + esc(saved.room) : ""} · spawned ${fmtDate(saved.startDate)}</p>` : ""}</div>
          <div class="page-actions">${existing && can("delete") ? `<button class="btn btn-ghost btn-danger-text" data-del>${icon("trash")}Delete</button>` : ""}</div></div>
        ${saved ? bedsPanel(saved, bed, unit) : ""}
        <div class="editor" ${readOnly ? "inert" : ""}>
          <div class="card"><div class="form-grid">
            <div class="field half"><label>Batch code <span class="req">*</span></label><input data-h="code" value="${esc(b.code || "")}"></div>
            <div class="field half"><label>Mushroom <span class="req">*</span></label>${sel("mushroomType", list("mushroomTypes"), b.mushroomType)}</div>
            <div class="field"><label>Harvest goes to stock item <span class="req">*</span></label><select data-h="outputItemId">${opt(freshItems, b.outputItemId, "Select the fresh mushroom item…")}</select></div>
            <div class="field half"><label>Spawning date</label><input type="date" data-h="startDate" value="${esc(b.startDate || "")}"></div>
            <div class="field half"><label>Expected first harvest</label><input type="date" data-h="expectedHarvestDate" value="${esc(b.expectedHarvestDate || "")}"></div>
            <div class="field half"><label>Room / Shed</label>${sel("room", list("rooms"), b.room)}</div>
            <div class="field half"><label>Status</label><select data-h="status">${[...new Set([...BATCH_STATUSES, b.status].filter(Boolean))].map((x) => `<option ${x === b.status ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
            <div class="field half"><label>Dry substrate (kg) (to calculate BE%)</label><input type="number" step="any" inputmode="decimal" data-h="substrateKg" value="${esc(b.substrateKg ?? "")}"></div>
          </div></div>

          <div class="card">
            <div class="card-head"><h3>Inputs used</h3><span class="muted small">Substrate, spawn, grow bags… taken out of stock</span></div>
            <div class="lines">${b.inputs.map((inp, i) => {
              const it = items.find((x) => x.id === inp.itemId);
              const avail = it ? stock.get(it.id) || 0 : null;
              return `<div class="line line-simple" data-i="${i}">
                <div class="line-item"><select data-f="itemId">${opt(items, inp.itemId, "Select material…")}</select>
                  ${it ? `<small class="${!existing && Number(inp.qty) > avail ? "text-warn" : "muted"}">In stock: ${num(avail)} ${esc(it.unit || "")}${!existing && Number(inp.qty) > avail ? " · not enough" : ""}</small>` : ""}</div>
                <label class="line-num"><span>Qty${it ? " (" + esc(it.unit || "") + ")" : ""}</span><input type="number" step="any" inputmode="decimal" data-f="qty" value="${esc(inp.qty ?? "")}"></label>
                <div class="line-amt"><span>Cost</span><b>${money((Number(inp.qty) || 0) * (Number(it && it.costPrice) || 0))}</b></div>
                <button class="icon-btn line-del" data-delin="${i}" aria-label="Remove">${icon("trash")}</button></div>`;
            }).join("")}</div>
            <button class="btn btn-ghost" data-addin>${icon("plus")}Add input</button>
          </div>

          <div class="card">
            <div class="card-head"><h3>Output</h3><span class="muted small">The beds or bags made, added to stock</span></div>
            <div class="form-grid">
              <div class="field half"><label>Stock item <span class="req">*</span></label><select data-h="bedItemId">${opt(items.filter((i) => i.id !== b.outputItemId), b.bedItemId, "Select item, e.g. Oyster grow bed…")}</select>
                <small class="muted">Not in the list? Add it under Products & Materials, for example "Oyster grow bed" with unit "bed".</small></div>
              <div class="field half"><label>Quantity made${bed ? " (" + esc(unit) + ")" : ""} <span class="req">*</span></label><input type="number" step="1" min="0" inputmode="numeric" data-h="bags" value="${esc(b.bags ?? "")}"></div>
            </div>
          </div>

          <div class="editor-bottom">
            <div class="card">
              <div class="field"><label>Batch cost</label><input type="number" step="0.01" data-h="cost" value="${esc(b.cost ?? "")}" placeholder="${material ? "Leave empty to use " + money(material) : "Optional"}">
                <small class="muted">Empty: worked out from the inputs' cost prices.</small></div>
              <div class="field"><label>Notes</label><textarea rows="3" data-h="notes">${esc(b.notes || "")}</textarea></div>
            </div>
            <div class="card totals">
              <div><span>Material cost</span><b>${money(material)}</b></div>
              <div class="grand"><span>Batch cost</span><b>${money(calc.batchCost(b))}</b></div>
              <div><span>Cost per ${esc(bed && bed.unit ? bed.unit : "bed")}</span><b>${Number(b.bags) ? money(calc.batchCost(b) / Number(b.bags)) : "–"}</b></div>
            </div>
          </div>
          ${readOnly ? "" : `<div class="editor-actions"><a class="btn btn-ghost" href="#/batches">Cancel</a><button class="btn btn-primary" data-save>${icon("tick")}${existing ? "Save changes" : "Save grow batch"}</button></div>`}
        </div>`;
      bind(saved, bed, unit);
    };

    const readHeader = () => root.querySelectorAll("[data-h]").forEach((el) => { b[el.dataset.h] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value; });

    const bind = (saved, bed, unit) => {
      root.querySelectorAll("[data-h]").forEach((el) => el.addEventListener("change", () => {
        readHeader();
        if (el.dataset.h === "startDate" && !existing && b.startDate) b.expectedHarvestDate = addDays(b.startDate, 21);
        draw();
      }));
      root.querySelectorAll(".line").forEach((row) => row.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
        readHeader();
        b.inputs[+row.dataset.i][el.dataset.f] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
        draw();
        if (el.dataset.f === "itemId") { const q = root.querySelector(`.line[data-i="${row.dataset.i}"] [data-f="qty"]`); if (q) q.focus(); }
      })));
      root.querySelectorAll("[data-delin]").forEach((x) => x.addEventListener("click", () => { readHeader(); b.inputs.splice(+x.dataset.delin, 1); if (!b.inputs.length) b.inputs.push({}); draw(); }));
      const add = root.querySelector("[data-addin]");
      if (add) add.addEventListener("click", () => { readHeader(); b.inputs.push({}); draw(); });

      const save = root.querySelector("[data-save]");
      if (save) save.addEventListener("click", () => {
        readHeader();
        if (!String(b.code || "").trim()) return toast("Enter the batch code", "error");
        if (!b.mushroomType) return toast("Choose the mushroom", "error");
        if (!b.outputItemId) return toast("Choose where the harvest goes", "error");
        if (!b.bedItemId) return toast("Choose the output stock item", "error");
        if (!(Number(b.bags) > 0)) return toast("Enter how many beds were made", "error");
        const cur = existing ? store.get("batches", existing.id) || {} : {};
        const used = calc.contaminatedBeds(cur) + (cur.discarded ? Number(cur.discarded.qty) || 0 : 0);
        if (Number(b.bags) < used) return toast(`${num(used)} beds are already recorded as contaminated or discarded`, "error");
        const rec = {
          ...(existing ? { id: existing.id } : {}),
          code: String(b.code).trim(), mushroomType: b.mushroomType, outputItemId: b.outputItemId,
          startDate: b.startDate, expectedHarvestDate: b.expectedHarvestDate, room: b.room || "", status: b.status || "Spawning",
          substrateKg: b.substrateKg, cost: b.cost, notes: b.notes || "",
          inputs: b.inputs.filter((i) => i.itemId && Number(i.qty) > 0).map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
          bedItemId: b.bedItemId, bags: Number(b.bags),
          ...(existing ? {} : { contaminations: [], contaminatedBags: 0 }),
        };
        const out = store.put("batches", rec);
        toast(existing ? "Grow batch saved · stock updated" : "Grow batch saved · materials taken out, beds added to stock");
        navigate(existing ? "#/batches" : "#/batches/" + out.id, true);
      });

      const del = root.querySelector("[data-del]");
      if (del) del.addEventListener("click", async () => {
        const hs = store.all("harvests").filter((h) => h.batchId === existing.id).length;
        if (!(await confirmDialog(`Delete grow batch ${existing.code}? Its stock movements will be reversed.${hs ? ` Its ${hs} harvest record${hs === 1 ? "" : "s"} will stay but lose their batch.` : ""}`, { danger: true, okLabel: "Delete" }))) return;
        store.remove("batches", existing.id);
        toast("Grow batch deleted");
        navigate("#/batches", true);
      });

      if (!saved || readOnly) return;
      const redraw = () => { readHeader(); const fresh = store.get("batches", saved.id); if (fresh) { b.status = fresh.status; } draw(); };
      const cBtn = root.querySelector("[data-contam]");
      if (cBtn) cBtn.addEventListener("click", () => recordContamination(saved, unit, redraw));
      root.querySelectorAll("[data-uncontam]").forEach((x) => x.addEventListener("click", async () => {
        const c = (saved.contaminations || []).find((y) => y.id === x.dataset.uncontam);
        if (!c || !(await confirmDialog(`Remove the record of ${num(c.qty)} contaminated ${unit} on ${fmtDate(c.date)}? They go back into stock.`, { okLabel: "Remove", danger: true }))) return;
        const list2 = (saved.contaminations || []).filter((y) => y.id !== c.id);
        store.put("batches", { id: saved.id, contaminations: list2, contaminatedBags: sum(list2, (y) => Number(y.qty) || 0) });
        toast("Contamination record removed");
        redraw();
      }));
      const dBtn = root.querySelector("[data-discard]");
      if (dBtn) dBtn.addEventListener("click", () => discardBatch(saved, unit, redraw));
      const uBtn = root.querySelector("[data-undiscard]");
      if (uBtn) uBtn.addEventListener("click", async () => {
        if (!(await confirmDialog(`Undo the discard? ${num(saved.discarded.qty)} ${unit} go back into stock.`, { okLabel: "Undo discard" }))) return;
        store.put("batches", { id: saved.id, discarded: null, status: saved.discarded.prevStatus || "Completed" });
        toast("Discard undone");
        redraw();
      });
    };
    draw();
  },
};

// Beds made, contaminated, discarded and left, with the buttons to record them.
function bedsPanel(b, bed, unit) {
  const left = calc.bedsLeft(b);
  const be = calc.biologicalEfficiency(b);
  const conts = (b.contaminations || []).slice().sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const hs = store.all("harvests").filter((h) => h.batchId === b.id).sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const w = can("write");
  return `
    <div class="stats stats-4 batch-stats">
      ${stat("Beds left", b.bags ? num(left) : "–", { sub: b.bags ? `of ${num(b.bags)} ${esc(unit)}${bed ? " · " + esc(bed.name) : ""}` : "", ic: "sprout", tone: left ? "ok" : "" })}
      ${stat("Contaminated", num(calc.contaminatedBeds(b)), { sub: b.bags ? Math.round((calc.contaminatedBeds(b) / b.bags) * 100) + "% of the batch" : "", ic: "alert", tone: calc.contaminatedBeds(b) ? "warn" : "" })}
      ${stat("Harvested", calc.harvestedKg(b.id).toFixed(2) + " kg", { sub: hs.length ? `${hs.length} picking${hs.length === 1 ? "" : "s"}` : "none yet", ic: "basket" })}
      ${stat("B.E.", be == null ? "–" : be.toFixed(0) + "%", { sub: be == null ? "enter the dry substrate" : "fresh yield ÷ dry substrate", ic: "trend" })}
    </div>
    <div class="card batch-beds">
      <div class="card-head"><h3>Beds</h3>
        ${w && !b.discarded ? `<div class="batch-acts"><button class="btn btn-ghost" data-contam ${left ? "" : "disabled"}>${icon("alert")}Record contamination</button>
          <button class="btn btn-ghost btn-danger-text" data-discard ${left ? "" : "disabled"}>${icon("trash")}Discarded by expiry</button></div>` : ""}</div>
      ${b.discarded ? `<div class="batch-discarded">${chip(DISCARDED, "muted")} <span>${num(b.discarded.qty)} ${esc(unit)} discarded on ${fmtDate(b.discarded.date)} and taken out of stock.</span>
        ${w ? `<button class="btn btn-ghost" data-undiscard>Undo</button>` : ""}</div>` : ""}
      ${conts.length ? `<div class="mini-list">${conts.map((c) => `<div><span><b>${num(c.qty)} ${esc(unit)}</b> contaminated · ${fmtDate(c.date)}${c.notes ? `<small class="muted block">${esc(c.notes)}</small>` : ""}</span>
          ${w && !b.discarded ? `<button class="icon-btn" data-uncontam="${esc(c.id)}" title="Remove this record" aria-label="Remove this record">${icon("trash")}</button>` : ""}</div>`).join("")}</div>`
        : !b.discarded ? `<p class="muted small">No contamination recorded. When you find contaminated beds, record them here and they're taken out of stock.</p>` : ""}
      ${hs.length ? `<details class="batch-harvests"><summary>Harvests (${hs.length})</summary><div class="mini-list">${hs.map((h) => `<div><span>${fmtDate(h.date)}</span><span>${Number(h.qty).toFixed(2)} kg${h.grade ? " · " + esc(h.grade) : ""}</span></div>`).join("")}</div></details>` : ""}
    </div>`;
}

function recordContamination(b, unit, done) {
  const left = calc.bedsLeft(b);
  openModal({
    title: `Contamination in ${b.code}`,
    body: `<div class="form-grid">
      <div class="field half"><label>Date found</label><input type="date" name="date" value="${today()}" max="${today()}"></div>
      <div class="field half"><label>Contaminated ${esc(unit)} <span class="req">*</span></label><input type="number" name="qty" min="1" max="${left}" step="1" inputmode="numeric"></div>
      <div class="field"><label>Notes</label><input name="notes" placeholder="e.g. green mould, removed from Room 2"></div>
      <p class="small muted field">${num(left)} ${esc(unit)} left in this batch. The ones you enter are taken out of stock.</p>
    </div>`,
    actions: [
      { label: "Cancel", cls: "btn-ghost" },
      { label: "Save", cls: "btn-primary", icon: "tick", onClick: ({ el }) => {
        const v = (k) => el.querySelector(`[name="${k}"]`).value.trim();
        const qty = Number(v("qty"));
        if (!(qty > 0)) { toast("Enter how many were contaminated", "error"); return true; }
        if (qty > left) { toast(`Only ${num(left)} ${unit} are left in this batch`, "error"); return true; }
        const fresh = store.get("batches", b.id) || b;
        const list2 = [...(fresh.contaminations || []), { id: uid(), date: v("date") || today(), qty, notes: v("notes").slice(0, 300) }];
        store.put("batches", { id: b.id, contaminations: list2, contaminatedBags: sum(list2, (c) => Number(c.qty) || 0) });
        toast(`${num(qty)} contaminated ${unit} taken out of stock`);
        done();
      } },
    ],
    onMount: ({ el }) => el.querySelector('[name="qty"]').focus(),
  });
}

function discardBatch(b, unit, done) {
  const left = calc.bedsLeft(b);
  openModal({
    title: `Discard ${b.code}`,
    body: `<p>The <b>${num(left)} ${esc(unit)}</b> left in this batch will be taken out of stock, and the batch marked "${DISCARDED}".</p>
      <div class="form-grid"><div class="field half"><label>Discarded on</label><input type="date" name="date" value="${today()}" max="${today()}"></div></div>`,
    actions: [
      { label: "Cancel", cls: "btn-ghost" },
      { label: "Discard", cls: "btn-danger", icon: "trash", onClick: ({ el }) => {
        const fresh = store.get("batches", b.id) || b;
        store.put("batches", { id: b.id, discarded: { date: el.querySelector('[name="date"]').value || today(), qty: calc.bedsLeft(fresh), prevStatus: fresh.status || "" }, status: DISCARDED });
        toast(`${num(left)} ${unit} discarded and taken out of stock`);
        done();
      } },
    ],
  });
}
