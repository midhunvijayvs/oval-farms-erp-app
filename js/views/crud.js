// Generic list + form screens driven by schema.js.
import { store } from "../store.js";
import { schemas, list } from "../schema.js";
import { can } from "../session.js";
import { esc, money, num, sum, today, addDays, inRange, monthStart, toCSV, downloadFile, fmtDate } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast, confirmDialog, fieldHtml, defaultsFor, readFields, validate, table, pageHead, refLabel, chip } from "../ui.js";
import * as calc from "../calc.js";
import { productHooks } from "./products.js";
import { customerHooks } from "./customers.js";
import { uploadProductImage } from "../firebase.js";

const state = {};

// Per-collection behaviour that the schema alone can't express.
const hooks = {
  products: productHooks,
  customers: customerHooks,
  suppliers: { decorate: (r) => ({ ...r, _balance: calc.supplierBalance(r.id) }) },
  batches: {
    decorate: (r) => ({ ...r, _harvested: calc.harvestedKg(r.id), _be: calc.biologicalEfficiency(r) }),
    defaults: () => ({ code: calc.nextNumber("batches", "B"), expectedHarvestDate: addDays(today(), 21) }),
    formExtra: (r) => {
      if (!r.id) return "";
      const hs = store.all("harvests").filter((h) => h.batchId === r.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const kg = sum(hs, (h) => h.qty);
      const be = calc.biologicalEfficiency(r);
      return `<div class="form-extra">
        <div class="mini-stats"><div><b>${kg.toFixed(2)} kg</b><span>harvested</span></div><div><b>${hs.length}</b><span>pickings</span></div><div><b>${be == null ? "–" : be.toFixed(0) + "%"}</b><span>bio. efficiency</span></div></div>
        ${hs.length ? `<div class="mini-list">${hs.slice(0, 8).map((h) => `<div><span>${fmtDate(h.date)}</span><span>${Number(h.qty).toFixed(2)} kg · ${esc(h.grade || "")}</span></div>`).join("")}</div>` : ""}
      </div>`;
    },
  },
  harvests: {
    defaults: () => {
      const active = store.all("batches").filter((b) => b.status === "Harvesting" || b.status === "Fruiting");
      return active.length === 1 ? { batchId: active[0].id } : {};
    },
    afterSave: (rec) => {
      const b = store.get("batches", rec.batchId);
      if (b && (b.status === "Fruiting" || b.status === "Incubation" || b.status === "Spawning")) store.put("batches", { id: b.id, status: "Harvesting" });
    },
  },
  payments: {
    decorate: (r) => {
      const p = r.direction === "out" ? store.get("suppliers", r.supplierId) : store.get("customers", r.customerId);
      return { ...r, _party: p ? p.name : "" };
    },
  },
  tasks: {
    afterSave: (rec, prev) => {
      if (rec.status !== "Done" || !prev || prev.status === "Done" || !rec.repeat || rec.repeat === "No") return;
      const step = { Daily: 1, Weekly: 7, Monthly: 30 }[rec.repeat] || 0;
      const { id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = rec;
      store.put("tasks", { ...rest, status: "Open", dueDate: addDays(rec.dueDate || today(), step) });
      toast("Next " + rec.repeat.toLowerCase() + " task created");
    },
  },
};

// Payment form: list the open invoices/bills of the chosen party.
schemas.payments.fields.find((f) => f.k === "refId").docOptions = (r) => {
  if (r.direction === "out") {
    return store.all("purchases").filter((p) => calc.purchaseCounts(p) && (!r.supplierId || p.supplierId === r.supplierId) && (calc.docBalance(p) > 0 || p.id === r.refId))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map((p) => ({ v: p.id, l: `${p.number} · ${fmtDate(p.date)} · due ${money(calc.docBalance(p))}` }));
  }
  return store.all("sales").filter((s) => calc.saleCounts(s) && (!r.customerId || s.customerId === r.customerId) && (calc.docBalance(s) > 0 || s.id === r.refId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((s) => ({ v: s.id, l: `${s.number} · ${fmtDate(s.date)} · due ${money(calc.docBalance(s))}` }));
};

export function hooksAfterTask(rec, prev) { hooks.tasks.afterSave(rec, prev); }

export function openForm(key, rec = null, { presets = {}, onSaved } = {}) {
  const sc = schemas[key];
  const h = hooks[key] || {};
  const isNew = !rec;
  const prev = rec ? { ...rec } : null;
  let data = rec ? { ...rec } : { ...defaultsFor(sc.fields), ...(h.defaults ? h.defaults() : {}), ...presets };
  const readOnly = !can("write");
  const body = () => `<form class="form-grid" novalidate ${readOnly ? 'inert' : ""}>${sc.fields.map((f) => fieldHtml(f, data[f.k], data)).join("")}</form>${h.formExtra ? h.formExtra(data) : ""}`;
  const actions = [];
  if (!isNew && can("delete")) actions.push({ label: "Delete", cls: "btn-ghost btn-danger-text", icon: "trash", onClick: async ({ close }) => {
    if (await confirmDialog(`Delete this ${sc.singular.toLowerCase()}? This removes it for everyone.`, { danger: true, okLabel: "Delete" })) {
      store.remove(key, rec.id);
      toast(sc.singular + " deleted");
      return false;
    }
    return true;
  } });
  actions.push({ label: readOnly ? "Close" : "Cancel", cls: "btn-ghost" });
  if (!readOnly) actions.push({ label: isNew ? "Save" : "Save changes", cls: "btn-primary", icon: "tick", onClick: async ({ el }) => {
    const form = el.querySelector("form");
    const vals = readFields(form, sc.fields);
    let merged = { ...data, ...vals };
    // Hidden fields are cleared, except ones marked keepWhenHidden (website details of an unpublished product).
    for (const f of sc.fields) if (f.showIf && !f.showIf(merged) && !f.keepWhenHidden && !f.virtual) merged[f.k] = "";
    if (!validate(form, sc.fields, merged)) return true;
    const extra = {};
    for (const f of sc.fields) if (f.virtual) { extra[f.k] = merged[f.k]; delete merged[f.k]; }
    if (h.beforeSave) {
      merged = await h.beforeSave(merged, { isNew, extra, prev });
      if (!merged) return true;
    }
    const saved = store.put(key, merged);
    if (h.afterSave) h.afterSave(saved, prev, extra);
    toast(sc.singular + (isNew ? " added" : " saved"));
    if (onSaved) onSaved(saved);
    return false;
  } });

  openModal({
    title: (isNew ? "New " : readOnly ? "" : "Edit ") + sc.singular.toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    body: body(),
    actions,
    onMount: ({ el, close }) => {
      const form = el.querySelector("form");
      form.addEventListener("submit", (e) => e.preventDefault());
      for (const f of sc.fields) if (f.type === "images") bindImages(form, f, data.id || "new");
      if (h.formMount) h.formMount({ el, rec: data, close });
      form.addEventListener("change", (e) => {
        e.target.classList && e.target.classList.remove("invalid");
        const vals = { ...data, ...readFields(form, sc.fields) };
        for (const f of sc.fields) {
          const wrap = form.querySelector(`[data-k="${f.k}"]`) || (f.type === "images" ? form.querySelector(`[data-images="${f.k}"]`)?.closest(".field") : null);
          if (f.showIf && wrap) wrap.classList.toggle("hidden", !f.showIf(vals));
          if (f.type === "docref" && e.target.name !== f.k && wrap) {
            wrap.outerHTML = fieldHtml(f, vals[f.k], vals);
          }
        }
        // Payments: pre-fill the amount with what is still due on the chosen invoice/bill.
        if (key === "payments" && e.target.name === "refId" && e.target.value) {
          const doc = store.get(vals.direction === "out" ? "purchases" : "sales", e.target.value);
          const amt = form.querySelector('[name="amount"]');
          if (doc && amt && !amt.value) amt.value = calc.docBalance(doc);
        }
      });
    },
  });
}

export function listView(key, opts = {}) {
  return {
    title: schemas[key].title,
    render(root) {
      const sc = schemas[key];
      const h = hooks[key] || {};
      const st = state[key] || (state[key] = { q: "", f: {}, from: "", to: "" });
      let rows = store.all(key);
      if (h.decorate) rows = rows.map(h.decorate);
      if (st.q) {
        const q = st.q.toLowerCase();
        rows = rows.filter((r) => (sc.search || []).some((k) => String(r[k] || "").toLowerCase().includes(q)) || (r._party || "").toLowerCase().includes(q));
      }
      if (sc.dateKey && (st.from || st.to)) rows = rows.filter((r) => inRange(r[sc.dateKey], st.from, st.to));
      // Filters: { k, list | options, tabs } — tabs show as a tab bar with counts, the rest as dropdowns
      const filters = (sc.filters || []).map((f) => ({ ...f, options: (f.options || list(f.list)).map((o) => (typeof o === "object" ? o : { v: o, l: o })) }));
      const keep = (r, skip) => filters.every((f) => f === skip || !st.f[f.k] || String(r[f.k]) === st.f[f.k]);
      const tabs = filters.filter((f) => f.tabs).map((f) => {
        const base = rows.filter((r) => keep(r, f));
        const count = (v) => base.filter((r) => String(r[f.k]) === String(v)).length;
        return `<div class="tabs list-tabs" role="tablist">${[{ v: "", l: "All" }, ...f.options].map((o) => {
          const on = String(o.v) === (st.f[f.k] || "");
          return `<button class="tab ${on ? "on" : ""}" role="tab" aria-selected="${on}" data-ftab="${esc(f.k)}" data-v="${esc(o.v)}">${esc(o.l)} <span class="tab-count">${o.v === "" ? base.length : count(o.v)}</span></button>`;
        }).join("")}</div>`;
      }).join("");
      rows = rows.filter((r) => keep(r));
      rows.sort(sc.sort);

      const totalHtml = sc.total ? `<div class="list-total">Total <b>${money(sum(rows, (r) => r[sc.total]))}</b> · ${rows.length} entries</div>` : `<div class="list-total muted">${rows.length} ${rows.length === 1 ? "entry" : "entries"}</div>`;

      root.innerHTML = `
        ${pageHead(sc.title, opts.subtitle || "", `
          ${h.listActions ? h.listActions() : ""}
          <button class="btn btn-ghost hide-sm" data-export>${icon("download")}Export</button>
          ${can("write") ? `<button class="btn btn-primary new-btn" data-new>${icon("plus")}New ${esc(sc.singular.toLowerCase())}</button>` : ""}`)}
        ${opts.banner ? opts.banner() : ""}${h.banner ? h.banner() : ""}
        ${tabs}
        <div class="toolbar">
          <div class="search">${icon("search")}<input type="search" placeholder="Search ${esc(sc.title.toLowerCase())}…" value="${esc(st.q)}" data-q></div>
          ${filters.filter((f) => !f.tabs).map((f) => `<select data-filter="${esc(f.k)}"><option value="">${esc(f.allLabel || "All")}</option>${f.options.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === (st.f[f.k] || "") ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select>`).join("")}
          ${sc.dateKey ? `<div class="range"><input type="date" value="${esc(st.from)}" data-from aria-label="From"><span>–</span><input type="date" value="${esc(st.to)}" data-to aria-label="To"></div>
            <div class="seg"><button data-preset="month" class="${st.from === monthStart() && st.to === "" ? "on" : ""}">This month</button><button data-preset="all" class="${!st.from && !st.to ? "on" : ""}">All</button></div>` : ""}
        </div>
        <div class="card card-flush">${table(sc.columns, rows, { rowAttr: (r) => `data-id="${r.id}" class="clickable"`, empty: `No ${sc.title.toLowerCase()} yet.` })}</div>
        ${totalHtml}
        ${can("write") ? `<button class="fab" data-new aria-label="New ${esc(sc.singular)}">${icon("plus")}</button>` : ""}`;

      const rerender = () => this.render(root);
      root.querySelector("[data-q]").addEventListener("input", (e) => {
        st.q = e.target.value;
        const pos = e.target.selectionStart;
        rerender();
        const inp = root.querySelector("[data-q]"); inp.focus(); inp.setSelectionRange(pos, pos);
      });
      root.querySelectorAll("[data-filter]").forEach((sel) => sel.addEventListener("change", () => { st.f[sel.dataset.filter] = sel.value; rerender(); }));
      root.querySelectorAll("[data-ftab]").forEach((b) => b.addEventListener("click", () => { st.f[b.dataset.ftab] = b.dataset.v; rerender(); }));
      root.querySelectorAll(".list-tabs .tab.on").forEach((t) => t.scrollIntoView({ block: "nearest", inline: "nearest" }));
      const fr = root.querySelector("[data-from]"), to = root.querySelector("[data-to]");
      if (fr) fr.addEventListener("change", (e) => { st.from = e.target.value; rerender(); });
      if (to) to.addEventListener("change", (e) => { st.to = e.target.value; rerender(); });
      root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
        if (b.dataset.preset === "month") { st.from = monthStart(); st.to = ""; } else { st.from = ""; st.to = ""; }
        rerender();
      }));
      root.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openForm(key)));
      if (h.listMount) h.listMount(root, rerender);
      root.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openForm(key, store.get(key, tr.dataset.id))));
      root.querySelector("[data-export]").addEventListener("click", () => {
        const cols = sc.fields.filter((x) => x.type !== "textarea" || x.k === "notes");
        const csv = toCSV(cols.map((c) => c.label), rows.map((r) => cols.map((c) => {
          if (c.type === "ref") return refLabel(c, store.get(c.ref, r[c.k]));
          return r[c.k];
        })));
        downloadFile(`${key}-${today()}.csv`, csv, "text/csv");
      });
    },
  };
}

// Photo list on the product form: upload (resized, to Firebase Storage), paste a link, reorder, remove.
function bindImages(form, f, ownerId) {
  const box = form.querySelector(`[data-images="${f.k}"]`);
  if (!box) return;
  const input = box.querySelector(`input[name="${f.k}"]`);
  const msg = box.querySelector("[data-img-msg]");
  const get = () => { try { return JSON.parse(input.value || "[]"); } catch (e) { return []; } };
  const set = (urls) => {
    input.value = JSON.stringify(urls);
    const html = fieldHtml(f, urls, {});
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    box.querySelector(".img-list").innerHTML = tmp.querySelector(".img-list").innerHTML;
  };
  box.addEventListener("click", (e) => {
    const del = e.target.closest("[data-img-del]");
    const first = e.target.closest("[data-img-first]");
    if (del) { const u = get(); u.splice(+del.dataset.imgDel, 1); set(u); }
    if (first) { const u = get(); const [x] = u.splice(+first.dataset.imgFirst, 1); u.unshift(x); set(u); }
    if (e.target.closest("[data-img-url]")) {
      const url = (prompt("Paste the picture's web address (starting with https://)") || "").trim();
      if (/^https:\/\/\S+$/.test(url)) set([...get(), url]);
      else if (url) toast("That doesn't look like a web address", "error");
    }
  });
  box.querySelector("[data-img-file]").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    for (const file of files) {
      msg.textContent = `Uploading ${file.name}…`;
      try { set([...get(), await uploadProductImage(file, ownerId)]); msg.textContent = ""; }
      catch (err) { msg.textContent = ""; toast(err.message, "error"); break; }
    }
  });
}
