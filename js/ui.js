// UI building blocks: modals, toasts, confirms, schema-driven form fields and tables.
import { esc, money, fmtDate, today } from "./util.js";
import { icon } from "./icons.js";
import { store } from "./store.js";
import { list } from "./schema.js";

// ---------- toasts ----------
export function toast(msg, type = "ok") {
  let host = document.getElementById("toasts");
  if (!host) { host = document.createElement("div"); host.id = "toasts"; document.body.appendChild(host); }
  const t = document.createElement("div");
  t.className = "toast toast-" + type;
  t.innerHTML = icon(type === "error" ? "alert" : "tick") + `<span>${esc(msg)}</span>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, type === "error" ? 5000 : 2600);
}

// ---------- modals ----------
let modalDepth = 0;
export function openModal({ title, body, actions = [], wide = false, onMount, onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `
    <div class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ""}" data-act="${i}" ${a.type === "submit" ? 'data-submit="1"' : ""}>${a.icon ? icon(a.icon) : ""}${esc(a.label)}</button>`).join("")}</div>` : ""}
    </div>`;
  document.body.appendChild(wrap);
  modalDepth++;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => wrap.classList.add("show"));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove("show");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => {
      wrap.remove();
      modalDepth--;
      if (!modalDepth) document.body.classList.remove("modal-open");
    }, 200);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector("[data-close]").addEventListener("click", close);
  wrap.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const a = actions[+b.dataset.act];
    if (!a.onClick) return close();
    b.disabled = true;
    try {
      const keepOpen = await a.onClick({ el: wrap, close });
      if (keepOpen !== true) close();
    } finally { b.disabled = false; }
  }));
  const ctx = { el: wrap, close };
  if (onMount) onMount(ctx);
  const first = wrap.querySelector(".modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body select, .modal-body textarea");
  if (first && window.matchMedia("(min-width: 760px)").matches) setTimeout(() => first.focus(), 60);
  return ctx;
}

export function confirmDialog(message, { title = "Are you sure?", okLabel = "Yes", danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: "Cancel", cls: "btn-ghost", onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, cls: danger ? "btn-danger" : "btn-primary", onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------- form fields ----------
function optionList(f) {
  let opts = f.options || (f.list ? list(f.list) : []);
  return opts.map((o) => (typeof o === "object" ? o : { v: o, l: o }));
}

export function refOptions(f, current) {
  let rows = store.all(f.ref);
  if (f.refFilter) rows = rows.filter((r) => f.refFilter(r) || r.id === current);
  if (f.ref === "products" || f.ref === "employees") rows = rows.filter((r) => r.active !== false || r.id === current);
  rows.sort(f.refSort || ((a, b) => refLabel(f, a).localeCompare(refLabel(f, b))));
  return rows.map((r) => ({ v: r.id, l: refLabel(f, r) }));
}

export function refLabel(f, r) {
  if (!r) return "";
  if (f.refLabel) return f.refLabel(r);
  return r.name || r.code || r.number || r.title || r.id;
}

export function fieldHtml(f, value, rec = {}) {
  const id = "f_" + f.k;
  const req = f.required ? "required" : "";
  const hidden = f.showIf && !f.showIf(rec) ? "hidden" : "";
  let input = "";
  if (value === undefined || value === null) value = "";
  switch (f.type) {
    case "heading":
      return `<h4 class="form-section ${hidden}" data-k="${f.k}">${esc(f.label)}</h4>`;
    case "static":
      input = `<div class="static-value">${esc(f.fmt ? f.fmt(value, rec) : value)}</div>`;
      break;
    case "lines":
      input = `<textarea id="${id}" name="${f.k}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(Array.isArray(value) ? value.join("\n") : value)}</textarea>`;
      break;
    case "images": {
      const urls = Array.isArray(value) ? value : [];
      input = `<div class="img-field" data-images="${f.k}">
        <input type="hidden" name="${f.k}" value="${esc(JSON.stringify(urls))}">
        <div class="img-list">${urls.map((u, i) => `<figure class="img-thumb"><img src="${esc(u)}" alt="" loading="lazy"><button type="button" class="icon-btn" data-img-del="${i}" aria-label="Remove photo">${icon("x")}</button>${i ? `<button type="button" class="img-main" data-img-first="${i}">Make main</button>` : `<span class="img-main on">Main</span>`}</figure>`).join("")}</div>
        <div class="img-actions">
          <label class="btn btn-ghost">${icon("upload")}Upload photo<input type="file" accept="image/*" multiple hidden data-img-file></label>
          <button type="button" class="btn btn-link" data-img-url>Paste a picture link</button>
        </div>
        <small class="muted" data-img-msg></small>
      </div>`;
      break;
    }
    case "textarea":
      input = `<textarea id="${id}" name="${f.k}" rows="${f.rows || 2}" placeholder="${esc(f.placeholder || "")}">${esc(value)}</textarea>`;
      break;
    case "select": {
      const opts = optionList(f);
      const has = opts.some((o) => String(o.v) === String(value));
      input = `<select id="${id}" name="${f.k}" ${req}>${f.required ? "" : '<option value="">—</option>'}${!has && value !== "" ? `<option selected>${esc(value)}</option>` : ""}${opts.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(value) ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select>`;
      break;
    }
    case "ref":
    case "docref": {
      const opts = f.type === "ref" ? refOptions(f, value) : (f.docOptions ? f.docOptions(rec) : []);
      input = `<select id="${id}" name="${f.k}" ${req}><option value="">${f.required ? "Select…" : "—"}</option>${opts.map((o) => `<option value="${esc(o.v)}" ${o.v === value ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select>`;
      break;
    }
    case "checkbox":
      return `<label class="check field ${hidden}" data-k="${f.k}"><input type="checkbox" name="${f.k}" ${(value === "" ? !!f.default : !!value) ? "checked" : ""}> <span>${esc(f.label)}</span></label>`;
    case "money":
    case "number":
      input = `<input id="${id}" name="${f.k}" type="number" inputmode="decimal" step="${f.step || (f.type === "money" ? "0.01" : "any")}" value="${esc(value)}" placeholder="${esc(f.placeholder || "")}" ${req}>`;
      break;
    case "date":
      input = `<input id="${id}" name="${f.k}" type="date" value="${esc(value)}" ${req}>`;
      break;
    default:
      input = `<input id="${id}" name="${f.k}" type="${f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}" value="${esc(value)}" placeholder="${esc(f.placeholder || "")}" ${req} autocomplete="off">`;
  }
  return `<div class="field ${f.half ? "half" : ""} ${hidden}" data-k="${f.k}"><label for="${id}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ""}</label>${input}</div>`;
}

export function defaultsFor(fields) {
  const r = {};
  for (const f of fields) {
    if (f.default === undefined) continue;
    r[f.k] = typeof f.default === "function" ? f.default() : f.default;
  }
  return r;
}

export function readFields(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.k}"]`);
    if (!el) continue;
    if (f.type === "checkbox") out[f.k] = el.checked;
    else if (f.type === "images") { try { out[f.k] = JSON.parse(el.value || "[]"); } catch (e) { out[f.k] = []; } }
    else if (f.type === "lines") out[f.k] = el.value.split("\n").map((x) => x.trim()).filter(Boolean);
    else if (f.type === "number" || f.type === "money") out[f.k] = el.value === "" ? "" : Number(el.value);
    else out[f.k] = el.value.trim();
  }
  return out;
}

export function validate(root, fields, rec) {
  for (const f of fields) {
    if (!f.required) continue;
    if (f.showIf && !f.showIf(rec)) continue;
    const v = rec[f.k];
    if (v === "" || v === undefined || v === null) {
      const el = root.querySelector(`[name="${f.k}"]`);
      if (el) { el.classList.add("invalid"); el.focus(); }
      toast(`${f.label} is required`, "error");
      return false;
    }
  }
  return true;
}

// ---------- display helpers ----------
const STATUS_TONE = {
  Paid: "ok", Delivered: "ok", Completed: "ok", Received: "ok", Done: "ok", Active: "ok", "In stock": "ok", Present: "ok",
  Confirmed: "info", Ordered: "info", Fruiting: "info", Harvesting: "ok", Incubation: "info", Spawning: "info", Open: "info", Normal: "info",
  "Partly paid": "warn", Low: "warn", Draft: "muted", "Half day": "warn", Leave: "muted", High: "danger",
  Unpaid: "danger", Cancelled: "muted", "Out of stock": "danger", "Contaminated / Discarded": "danger", Left: "muted", Absent: "danger",
  Received_: "ok", "Paid out": "warn",
  "On website": "ok", "Low stock": "warn", "Not listed": "muted", Online: "info", Offline: "muted",
  Invited: "warn", Registered: "ok", "No login": "muted",
};

export function chip(text, tone) {
  if (!text) return "";
  return `<span class="chip chip-${tone || STATUS_TONE[text] || "muted"}">${esc(text)}</span>`;
}

export function cellValue(col, r) {
  let v = r[col.k];
  if (col.fmt) return esc(col.fmt(v, r));
  if (col.type === "money") return money(v);
  if (col.type === "date") return esc(fmtDate(v));
  if (col.type === "ref") {
    const ref = store.get(col.ref, v);
    return esc(ref ? (col.refLabel ? col.refLabel(ref) : ref.name || ref.code || ref.number) : "");
  }
  return esc(v);
}

export function table(columns, rows, { rowAttr = () => "", empty = "Nothing here yet." } = {}) {
  if (!rows.length) return emptyState(empty);
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr>${columns.map((c) => `<th class="${c.align === "right" ? "r" : ""}" ${c.hint ? `title="${esc(c.hint)}"` : ""}>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr ${rowAttr(r)}>${columns.map((c) => {
      const raw = cellValue(c, r);
      const val = c.type === "status" ? chip(c.fmt ? c.fmt(r[c.k], r) : r[c.k]) : raw;
      return `<td class="${c.align === "right" ? "r" : ""} ${c.primary ? "primary" : ""}" data-label="${esc(c.label)}">${val}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function emptyState(text, actionHtml = "") {
  return `<div class="empty">${icon("sprout", "empty-ic")}<p>${esc(text)}</p>${actionHtml}</div>`;
}

export function pageHead(title, sub = "", actions = "") {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ""}</div><div class="page-actions">${actions}</div></div>`;
}

export function stat(label, value, { sub = "", tone = "", ic = "", href = "" } = {}) {
  const tag = href ? "a" : "div";
  return `<${tag} class="stat ${tone ? "stat-" + tone : ""}" ${href ? `href="${href}"` : ""}>
    <div class="stat-top"><span class="stat-label">${esc(label)}</span>${ic ? `<span class="stat-ic">${icon(ic)}</span>` : ""}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ""}
  </${tag}>`;
}

export function dateRangeDefault() {
  return { from: today().slice(0, 8) + "01", to: today() };
}
