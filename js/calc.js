// Derived business numbers. Stock is never stored: it is computed from opening stock plus
// every harvest, production run, purchase, sale and adjustment, so concurrent edits by
// different users can't make counts drift.
import { store } from "./store.js";
import { round2, sum, today, addDays } from "./util.js";
import { sizeOf } from "./packs.js";

export const SALE_COUNTS = ["Confirmed", "Delivered"];

const memo = new Map();
function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && hit.rev === store.revision) return hit.value;
  const value = fn();
  memo.set(key, { rev: store.revision, value });
  return value;
}

export function lineCalc(l) {
  const qty = Number(l.qty) || 0, rate = Number(l.rate) || 0;
  const disc = Number(l.discount) || 0;
  const taxable = round2(qty * rate * (1 - disc / 100));
  const tax = round2((taxable * (Number(l.gstRate) || 0)) / 100);
  return { taxable, tax, total: round2(taxable + tax) };
}

export function docTotals(doc) {
  const lines = (doc.lines || []).map(lineCalc);
  const subtotal = round2(sum(lines, (l) => l.taxable));
  const tax = round2(sum(lines, (l) => l.tax));
  const shipping = Number(doc.shipping) || 0;
  const raw = subtotal + tax + shipping;
  const total = doc.roundOff === false ? round2(raw) : Math.round(raw);
  return { subtotal, tax, shipping, roundOff: round2(total - raw), total };
}

export function saleCounts(s) { return SALE_COUNTS.includes(s.status); }
export function purchaseCounts(p) { return p.status === "Received"; }

// Every stock movement in the system, newest first.
export function movements() {
  return cached("movements", () => {
    const out = [];
    const batches = new Map(store.all("batches").map((b) => [b.id, b]));
    for (const i of store.all("products")) {
      if (Number(i.openingStock)) out.push({ date: i.createdAt ? i.createdAt.slice(0, 10) : "", itemId: i.id, qty: Number(i.openingStock), type: "Opening stock", ref: "" });
    }
    for (const h of store.all("harvests")) {
      const b = batches.get(h.batchId);
      if (!b || !b.outputItemId) continue;
      out.push({ date: h.date, itemId: b.outputItemId, qty: Number(h.qty) || 0, type: "Harvest", ref: b.code, link: "#/harvests" });
    }
    for (const p of store.all("productions")) {
      for (const inp of p.inputs || []) {
        if (inp.itemId) out.push({ date: p.date, itemId: inp.itemId, qty: -(Number(inp.qty) || 0), type: "Used in production", ref: p.lotNo, link: "#/production/" + p.id });
      }
      if (p.outputItemId) out.push({ date: p.date, itemId: p.outputItemId, qty: Number(p.outputQty) || 0, type: "Produced", ref: p.lotNo, link: "#/production/" + p.id });
    }
    for (const s of store.all("sales")) {
      if (!saleCounts(s)) continue;
      for (const l of s.lines || []) if (l.itemId) out.push({ date: s.date, itemId: l.itemId, qty: -(Number(l.qty) || 0) * sizeOf(l), type: "Sold", ref: s.number, link: "#/sales/" + s.id });
    }
    for (const p of store.all("purchases")) {
      if (!purchaseCounts(p)) continue;
      for (const l of p.lines || []) if (l.itemId) out.push({ date: p.date, itemId: l.itemId, qty: (Number(l.qty) || 0) * sizeOf(l), type: "Purchased", ref: p.number, link: "#/purchases/" + p.id });
    }
    for (const a of store.all("adjustments")) {
      out.push({ date: a.date, itemId: a.itemId, qty: Number(a.qty) || 0, type: a.reason || "Adjustment", ref: a.notes || "", link: "#/adjustments" });
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  });
}

export function stockMap() {
  return cached("stock", () => {
    const m = new Map();
    for (const mv of movements()) m.set(mv.itemId, round3((m.get(mv.itemId) || 0) + mv.qty));
    return m;
  });
}

function round3(n) { return Math.round(n * 1000) / 1000; }

export function stockOf(itemId) { return stockMap().get(itemId) || 0; }

// Quantities are in the product's stock unit: a line for 2 bags of 25 kg counts as 50.
// Orders that aren't cancelled and have no invoice yet: their items are promised but not yet out of stock.
export const OPEN_ORDER = (o) => o.status !== "cancelled" && !o.invoiceId;

export function reservedMap() {
  return cached("reserved", () => {
    const m = new Map();
    for (const o of store.all("orders")) {
      if (!OPEN_ORDER(o)) continue;
      for (const li of o.items || []) if (li.productId) m.set(li.productId, round3((m.get(li.productId) || 0) + (Number(li.qty) || 0) * sizeOf(li, "productId")));
    }
    return m;
  });
}

export function reservedOf(itemId) { return reservedMap().get(itemId) || 0; }

// Stock left after open orders: what the website can still sell.
export function availableOf(itemId) { return round3(stockOf(itemId) - reservedOf(itemId)); }

export function stockStatus(item) {
  const q = stockOf(item.id);
  if (q <= 0) return "Out of stock";
  if (item.reorderLevel != null && item.reorderLevel !== "" && q <= Number(item.reorderLevel)) return "Low";
  return "In stock";
}

export function lowStockItems() {
  return store.all("products").filter((i) => i.active !== false && i.reorderLevel !== "" && i.reorderLevel != null && stockOf(i.id) <= Number(i.reorderLevel));
}

export function harvestedKg(batchId) {
  return cached("harvestByBatch", () => {
    const m = new Map();
    for (const h of store.all("harvests")) m.set(h.batchId, (m.get(h.batchId) || 0) + (Number(h.qty) || 0));
    return m;
  }).get(batchId) || 0;
}

export function biologicalEfficiency(batch) {
  const sub = Number(batch.substrateKg);
  if (!sub) return null;
  return (harvestedKg(batch.id) / sub) * 100;
}

function paidMap() {
  return cached("paid", () => {
    const m = new Map();
    for (const p of store.all("payments")) if (p.refId) m.set(p.refId, (m.get(p.refId) || 0) + (Number(p.amount) || 0));
    return m;
  });
}

export function paidAgainst(docId) { return round2(paidMap().get(docId) || 0); }

export function docBalance(doc) { return round2(docTotals(doc).total - paidAgainst(doc.id)); }

export function paymentStatus(doc) {
  const total = docTotals(doc).total, paid = paidAgainst(doc.id);
  if (paid <= 0) return total > 0 ? "Unpaid" : "Paid";
  if (paid + 0.009 < total) return "Partly paid";
  return "Paid";
}

// Customer outstanding = confirmed invoices - all money received from them.
export function customerBalance(customerId) {
  const billed = sum(store.all("sales").filter((s) => s.customerId === customerId && saleCounts(s)), (s) => docTotals(s).total);
  const received = sum(store.all("payments").filter((p) => p.direction !== "out" && p.customerId === customerId), (p) => p.amount);
  return round2(billed - received);
}

export function supplierBalance(supplierId) {
  const billed = sum(store.all("purchases").filter((p) => p.supplierId === supplierId && purchaseCounts(p)), (p) => docTotals(p).total);
  const paid = sum(store.all("payments").filter((p) => p.direction === "out" && p.supplierId === supplierId), (p) => p.amount);
  return round2(billed - paid);
}

export function totalReceivables() {
  return round2(sum(store.all("customers"), (c) => Math.max(0, customerBalance(c.id))));
}

export function totalPayables() {
  return round2(sum(store.all("suppliers"), (s) => Math.max(0, supplierBalance(s.id))));
}

export function productionCost(run) {
  const items = new Map(store.all("products").map((i) => [i.id, i]));
  const material = sum(run.inputs || [], (inp) => (Number(inp.qty) || 0) * (Number((items.get(inp.itemId) || {}).costPrice) || 0));
  const total = material + (Number(run.otherCost) || 0);
  const qty = Number(run.outputQty) || 0;
  return { material: round2(material), total: round2(total), perUnit: qty ? round2(total / qty) : 0 };
}

export function expiringLots(withinDays = 30) {
  const limit = addDays(today(), withinDays);
  return store.all("productions")
    .filter((p) => p.expiryDate && p.expiryDate <= limit)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

// Next document number like INV-2610-007 (prefix, 2-digit year, month, running count).
export function nextNumber(collection, prefix) {
  const ym = today().slice(2, 4) + today().slice(5, 7);
  const base = `${prefix}-${ym}-`;
  let max = 0;
  for (const d of Object.values(store.col(collection))) {
    const n = d.number || d.lotNo || d.code || "";
    if (n.startsWith(base)) max = Math.max(max, parseInt(n.slice(base.length), 10) || 0);
  }
  return base + String(max + 1).padStart(3, "0");
}
