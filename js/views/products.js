// Products & Materials: extra behaviour for the generic list/form (views/crud.js), and the
// "Website order" screen that sets the order products are shown in on ovalfarm.in.
import { store } from "../store.js";
import { schemas } from "../schema.js";
import { can } from "../session.js";
import { esc, num, uid } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast } from "../ui.js";
import * as calc from "../calc.js";
import { isListed, websiteStock } from "../catalog.js";

// Website details stay saved while a product is unpublished, so publishing again restores them.
for (const f of schemas.products.fields) if (f.showIf) f.keepWhenHidden = true;

const WEB_LABEL = { in_stock: "On website", low: "Low stock", out: "Out of stock" };
const nextOrder = () => Math.max(0, ...store.all("products").map((p) => Number(p.displayOrder) || 0)) + 10;

export const productHooks = {
  decorate: (r) => ({
    ...r,
    _stock: `${num(calc.stockOf(r.id))} ${r.unit || ""}`,
    _web: isListed(r) ? WEB_LABEL[websiteStock(r)] : "Not listed",
  }),
  // New products get their id up front so photos can be uploaded before the first save.
  defaults: () => ({ id: uid(), displayOrder: nextOrder() }),
  beforeSave: (rec) => {
    if (rec.published && !rec.webCategory) { toast("Choose a website category", "error"); return null; }
    if (rec.published && (rec.displayOrder === "" || rec.displayOrder == null)) rec.displayOrder = nextOrder();
    return rec;
  },
  listActions: () => `<button class="btn btn-ghost" data-weborder>${icon("layers")}Website order</button>`,
  listMount: (root) => {
    const b = root.querySelector("[data-weborder]");
    if (b) b.addEventListener("click", openWebsiteOrder);
  },
};

// Published products in their website order. Drag rows (computer) or use the arrows (phone).
export function openWebsiteOrder() {
  let rows = store.all("products").filter(isListed)
    .sort((a, b) => (Number(a.displayOrder) || 9999) - (Number(b.displayOrder) || 9999) || a.name.localeCompare(b.name))
    .map((p) => p.id);
  const ro = !can("write");
  const html = () => rows.length ? `<ol class="order-list">${rows.map((id, i) => {
    const p = store.get("products", id);
    const img = Array.isArray(p.images) && p.images[0];
    return `<li draggable="${!ro}" data-id="${esc(id)}">
      <span class="drag">${icon("menu")}</span>
      ${img ? `<img src="${esc(img)}" alt="">` : `<span class="img-ph">${icon("box")}</span>`}
      <div class="grow"><b>${i + 1}. ${esc(p.name)}</b><small class="muted block">${esc(p.webCategory || "")}${p.featured ? " · on the home page" : ""}</small></div>
      ${ro ? "" : `<button type="button" class="icon-btn" data-up="${i}" ${i ? "" : "disabled"} aria-label="Move up">${icon("chevronUp")}</button>
      <button type="button" class="icon-btn" data-down="${i}" ${i < rows.length - 1 ? "" : "disabled"} aria-label="Move down">${icon("chevronDown")}</button>`}
    </li>`;
  }).join("")}</ol>` : `<p class="muted">No products are shown on the website yet. Open a product and tick "Show on ovalfarm.in".</p>`;

  openModal({
    title: "Order on ovalfarm.in",
    body: `<p class="muted small">This is the order customers see by default. They can still sort by price or name themselves.</p><div data-list>${html()}</div>`,
    actions: ro || !rows.length ? [{ label: "Close", cls: "btn-ghost" }] : [
      { label: "Cancel", cls: "btn-ghost" },
      { label: "Save order", cls: "btn-primary", icon: "tick", onClick: () => {
        rows.forEach((id, i) => {
          const want = (i + 1) * 10;
          if (Number(store.get("products", id).displayOrder) !== want) store.put("products", { id, displayOrder: want });
        });
        toast("Website order saved");
      } },
    ],
    onMount: ({ el }) => {
      const box = el.querySelector("[data-list]");
      const redraw = () => { box.innerHTML = html(); };
      const move = (from, to) => { const [x] = rows.splice(from, 1); rows.splice(to, 0, x); redraw(); };
      box.addEventListener("click", (e) => {
        const up = e.target.closest("[data-up]"), down = e.target.closest("[data-down]");
        if (up) move(+up.dataset.up, +up.dataset.up - 1);
        if (down) move(+down.dataset.down, +down.dataset.down + 1);
      });
      let dragId = null;
      box.addEventListener("dragstart", (e) => { const li = e.target.closest("li"); if (li) { dragId = li.dataset.id; li.classList.add("dragging"); } });
      box.addEventListener("dragend", () => { dragId = null; redraw(); });
      box.addEventListener("dragover", (e) => {
        e.preventDefault();
        const li = e.target.closest("li");
        if (!li || !dragId || li.dataset.id === dragId) return;
        const from = rows.indexOf(dragId), to = rows.indexOf(li.dataset.id);
        rows.splice(from, 1); rows.splice(to, 0, dragId);
        const moving = box.querySelector(`li[data-id="${CSS.escape(dragId)}"]`);
        li.parentNode.insertBefore(moving, from < to ? li.nextSibling : li);
      });
    },
  });
}
