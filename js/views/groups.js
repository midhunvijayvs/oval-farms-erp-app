// Product groups: a named set of products always ordered together in a fixed ratio, e.g.
// "All items to make a bed" = 1 kg pellet + 1 packet spawn + 1 PP cover. On an order a group is
// picked like a product; its quantity multiplies every item and the group is opened up into
// ordinary item lines, so stock, invoices and reports never see the group itself.
import { store } from "../store.js";
import { can } from "../session.js";
import { esc, num, money, round2 } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast, confirmDialog } from "../ui.js";
import { sellables, keyOf, splitKey } from "../packs.js";
import { comboHtml, bindCombo } from "../combo.js";

export const GROUP_PREFIX = "group:";
export const groupsAll = () => store.all("productGroups").sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
export const productImage = (p) => (p && Array.isArray(p.images) && p.images[0]) || "";

// Every product (or pack) a group can hold, as search-dropdown options.
function itemOptions() {
  const products = store.all("products").filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  return sellables(products).map((c) => ({ value: c.key, label: c.name, sub: c.product.category || "", img: productImage(c.product), choice: c }));
}

// The group's items as order lines for `times` groups. Lines whose product was deleted are skipped.
export function expandGroup(g, times) {
  const out = [];
  for (const it of g.items || []) {
    const p = store.get("products", it.productId);
    if (!p) continue;
    const c = sellables([p]).find((x) => x.key === keyOf(it.productId, it.packId));
    if (!c) continue;
    out.push({
      productId: p.id, packId: c.pack ? c.pack.id : null, size: c.size, name: c.name,
      unit: c.pack ? c.pack.name : p.unit || "", price: c.price === "" || c.price == null ? "" : Number(c.price),
      qty: round2((Number(it.qty) || 0) * times),
    });
  }
  return out;
}

// "1 kg Mush Pellet + 1 Spawn + 1 PP cover"
export function groupSummary(g) {
  return (g.items || []).map((it) => {
    const p = store.get("products", it.productId);
    const c = p && sellables([p]).find((x) => x.key === keyOf(it.productId, it.packId));
    return `${num(it.qty)} × ${c ? c.name : "(deleted product)"}`;
  }).join(" + ");
}

// Price of one group at today's prices.
export const groupPrice = (g) => round2(expandGroup(g, 1).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));

// ---------- list of groups (Products & Materials → Product groups) ----------
export function openGroups() {
  const write = can("write");
  openModal({
    title: "Product groups",
    wide: true,
    body: `<p class="muted small">A group is a set of products customers order together, like everything needed for one mushroom bed. On a new order, pick the group and enter how many: each product is added with its quantity multiplied.</p><div data-groups></div>`,
    actions: write ? [{ label: "Close", cls: "btn-ghost" }, { label: "New group", cls: "btn-primary", icon: "plus", onClick: () => { openGroupForm(null); return true; } }] : [{ label: "Close", cls: "btn-ghost" }],
    onMount: ({ el, close }) => {
      const box = el.querySelector("[data-groups]");
      const draw = () => {
        const gs = groupsAll();
        box.innerHTML = gs.length ? `<ul class="group-list">${gs.map((g) => `<li class="${write ? "clickable" : ""}" data-gid="${esc(g.id)}">
            <span class="img-ph">${icon("layers")}</span>
            <div class="grow"><b>${esc(g.name)}</b><small class="muted block">${esc(groupSummary(g))}</small></div>
            <span class="r">${money(groupPrice(g))}</span>
          </li>`).join("")}</ul>` : `<p class="muted">No groups yet.${write ? " Click New group to make one." : ""}</p>`;
        if (write) box.querySelectorAll("[data-gid]").forEach((li) => li.addEventListener("click", () => openGroupForm(store.get("productGroups", li.dataset.gid))));
      };
      draw();
      const off = store.on(() => { if (!el.isConnected) return off(); draw(); });
    },
  });
}

// ---------- one group ----------
export function openGroupForm(existing) {
  const g = existing ? JSON.parse(JSON.stringify(existing)) : { name: "", items: [{ productId: "", packId: null, qty: 1 }] };
  if (!g.items || !g.items.length) g.items = [{ productId: "", packId: null, qty: 1 }];
  const options = itemOptions();
  const actions = [{ label: "Cancel", cls: "btn-ghost" }];
  if (existing && can("delete")) actions.push({ label: "Delete", cls: "btn-ghost btn-danger-text", icon: "trash", onClick: async () => {
    if (!(await confirmDialog(`Delete the group "${existing.name}"? Orders already made with it are not changed.`, { okLabel: "Delete", danger: true }))) return true;
    store.remove("productGroups", existing.id);
    toast("Group deleted");
  } });
  actions.push({ label: "Save group", cls: "btn-primary", icon: "tick", onClick: ({ el }) => {
    g.name = el.querySelector("[data-gname]").value.trim();
    const items = g.items.filter((it) => it.productId).map((it) => ({ productId: it.productId, packId: it.packId || null, qty: Number(it.qty) || 0 }));
    if (!g.name) { toast("Give the group a name", "error"); return true; }
    if (!items.length) { toast("Add at least one product", "error"); return true; }
    if (items.some((it) => !(it.qty > 0))) { toast("Each product needs a quantity", "error"); return true; }
    const keys = items.map((it) => keyOf(it.productId, it.packId));
    if (new Set(keys).size !== keys.length) { toast("A product is in the group twice", "error"); return true; }
    store.put("productGroups", { ...(existing ? { id: existing.id } : {}), name: g.name.slice(0, 120), items });
    toast(existing ? "Group saved" : "Group added");
  } });

  openModal({
    title: existing ? "Edit group" : "New product group",
    body: `<div class="field"><label>Group name</label><input data-gname value="${esc(g.name)}" placeholder="e.g. All items to make a bed" maxlength="120"></div>
      <div class="field"><label>Products in one group</label><div data-rows class="group-rows"></div></div>
      <button type="button" class="btn btn-ghost" data-addrow>${icon("plus")}Add product</button>`,
    actions,
    onMount: ({ el }) => {
      const rows = el.querySelector("[data-rows]");
      const draw = () => {
        rows.innerHTML = g.items.map((it, i) => {
          const sel = options.find((o) => o.value === keyOf(it.productId, it.packId)) || null;
          return `<div class="group-row" data-r="${i}">
            ${comboHtml({ attr: "data-gitem", selected: sel, thumbs: true, placeholder: "Type a product name…" })}
            <label class="line-num"><span>Qty</span><input type="number" inputmode="decimal" step="any" min="0" data-gqty value="${esc(it.qty ?? "")}"></label>
            <button type="button" class="icon-btn line-del" data-gdel aria-label="Remove">${icon("trash")}</button>
          </div>`;
        }).join("");
        rows.querySelectorAll(".group-row").forEach((row) => {
          const it = g.items[+row.dataset.r];
          bindCombo(row.querySelector("[data-gitem]"), { options, thumbs: true, onPick: (o) => { Object.assign(it, splitKey(o.value)); it.packId = it.packId || null; draw(); const q = rows.querySelector(`[data-r="${row.dataset.r}"] [data-gqty]`); q.focus(); q.select(); } });
          row.querySelector("[data-gqty]").addEventListener("input", (e) => { it.qty = e.target.value === "" ? "" : Number(e.target.value); });
          row.querySelector("[data-gdel]").addEventListener("click", () => { g.items.splice(+row.dataset.r, 1); if (!g.items.length) g.items.push({ productId: "", packId: null, qty: 1 }); draw(); });
        });
      };
      draw();
      el.querySelector("[data-addrow]").addEventListener("click", () => { g.items.push({ productId: "", packId: null, qty: 1 }); draw(); const ins = rows.querySelectorAll(".combo-input"); ins[ins.length - 1].focus(); });
    },
  });
}
