// One-time import of the 2026 "Production and Sales" sheet (data in js/import2026-data.js).
// Admin only. Pick which product each sheet item is (or let it create one), check the preview,
// then Import. Every record it writes carries importTag "sheet-2026", so "Undo the import"
// removes exactly those records again.
import { store } from "../store.js";
import { can } from "../session.js";
import { list } from "../schema.js";
import { esc, money, num, uid, addDays, round2, sum, fmtDate } from "../util.js";
import { icon } from "../icons.js";
import { pageHead, toast, confirmDialog, emptyState } from "../ui.js";
import * as calc from "../calc.js";
import { packsOf } from "../packs.js";
import { withoutLog, logActivity } from "../activity.js";
import { fbState, onFirebase } from "../firebase.js";
import * as D from "../import2026-data.js";

const TAG = D.IMPORT_TAG;
const r3 = (n) => Math.round(n * 1000) / 1000;
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The sheet's items. base: the unit the sheet counts it in.
export const ITEMS = {
  fresh:    { label: "Fresh white oyster mushroom", base: "kg", match: (p) => p.category === "Fresh Mushroom" && /oyster/i.test(p.name) && !/grey|milky|pink/i.test(p.name), create: { name: "White Oyster Mushroom (Fresh)", category: "Fresh Mushroom", unit: "kg", shelfLifeDays: 3 } },
  dried:    { label: "Dried oyster mushroom", base: "kg", match: (p) => /dried|dry/i.test(p.name) && !/powder/i.test(p.name), create: { name: "Dried White Oyster Mushroom", category: "Value-Added Product", unit: "kg" } },
  pickle:   { label: "Mushroom pickle", base: "kg", match: (p) => /pickle/i.test(p.name) && p.category !== "Raw Material", create: { name: "Oyster Mushroom Pickle", category: "Value-Added Product", unit: "kg" } },
  bed:      { label: "Oyster grow bed (beds made)", base: "bed", match: (p) => p.category === "Grow Bed" && /oyster/i.test(p.name), create: { name: "Oyster grow bed", category: "Grow Bed", unit: "bed" } },
  pellet:   { label: "Mush pellet", base: "kg", match: (p) => /pellet/i.test(p.name), create: { name: "Mush Pellet", category: "Raw Material", unit: "kg" } },
  spawn:    { label: "Spawn (HU white oyster)", base: "kg", match: (p) => /spawn/i.test(p.name) && !/milky/i.test(p.name), create: { name: "Oyster Spawn", category: "Raw Material", unit: "kg" } },
  ppcover:  { label: "PP cover (grow bag)", base: "pcs", match: (p) => /\bpp\b|grow bag|pp cover/i.test(p.name), create: { name: "PP Cover", category: "Packaging", unit: "pcs" } },
  rubber:   { label: "Rubber band", base: "pcs", match: (p) => /rubber/i.test(p.name), create: { name: "Rubber Band", category: "Consumable", unit: "pcs" } },
  boxSmall: { label: "PVC box, small", base: "pcs", match: (p) => /pvc|box/i.test(p.name) && /small/i.test(p.name), create: { name: "PVC Box - Small", category: "Packaging", unit: "pcs" } },
  boxLarge: { label: "PVC box, large", base: "pcs", match: (p) => /pvc|box/i.test(p.name) && /large|big/i.test(p.name), create: { name: "PVC Box - Large", category: "Packaging", unit: "pcs" } },
  label:    { label: "Sticker label", base: "pcs", match: (p) => /label|sticker/i.test(p.name), create: { name: "Sticker Label", category: "Packaging", unit: "pcs" } },
  film:     { label: "Cling film (antifog)", base: "cm", match: (p) => /cling|film/i.test(p.name), create: { name: "Cling Film (Antifog)", category: "Packaging", unit: "cm" } },
};

// How many base units one unit of stock is, when the unit says so.
function guessFactor(base, unit) {
  const u = String(unit || "").toLowerCase();
  if (base === "kg") return u === "kg" ? 1 : u === "g" ? 0.001 : null;
  if (base === "cm") return u === "cm" ? 1 : u === "m" ? 100 : null;
  if (base === "bed") return ["bed", "beds", "pcs", "nos"].includes(u) ? 1 : null;
  if (base === "pcs") return ["pcs", "nos", "pc", "piece", "pieces"].includes(u) ? 1 : null;
  return null;
}

// Mapping state for this screen: key -> { productId | "new", factor }
const state = { map: null, running: false, progress: "" };

function initialMap() {
  const products = store.all("products").filter((p) => p.active !== false);
  const map = {};
  for (const [key, it] of Object.entries(ITEMS)) {
    const p = products.find(it.match);
    map[key] = p ? { productId: p.id, factor: guessFactor(it.base, p.unit) } : { productId: "new", factor: 1 };
  }
  return map;
}

export const importedRecords = () => {
  const out = [];
  for (const col of UNDO_ORDER) for (const r of store.all(col)) if (r.importTag === TAG) out.push({ col, rec: r });
  return out;
};
const UNDO_ORDER = ["payments", "sales", "expenses", "harvests", "productions", "adjustments", "purchases", "batches", "customers", "suppliers", "products"];

// ---------------- the plan: every record the import writes ----------------
// Returns { records: [{ col, rec }], problems: [], summary }
export function buildPlan(map) {
  const problems = [];
  const records = [];
  const add = (col, rec) => { const r = { id: uid(), ...rec, importTag: TAG }; records.push({ col, rec: r }); return r; };
  const note = "Imported from the Production and Sales 2026 sheet.";

  // Products
  const prod = {};
  const factor = {};
  for (const [key, it] of Object.entries(ITEMS)) {
    const m = map[key] || {};
    if (m.productId === "new") {
      const cost = costPerBase(key);
      const p = add("products", { ...it.create, gstRate: "0", active: true, published: false, sku: "", salePrice: "", costPrice: cost ? r6(cost) : "", reorderLevel: "", openingStock: "", notes: "Added by the 2026 sheet import." });
      prod[key] = p; factor[key] = 1;
    } else {
      const p = store.get("products", m.productId);
      if (!p) { problems.push(`Pick a product for "${it.label}".`); continue; }
      prod[key] = p;
      const f = Number(m.factor);
      if (!(f > 0)) problems.push(`Say how many ${it.base} one ${p.unit || "unit"} of "${p.name}" is.`);
      factor[key] = f > 0 ? f : 1;
    }
  }
  if (prod.fresh && Math.abs(factor.fresh * calc.kgToStockUnit(prod.fresh) - 1) > 1e-9) problems.push(`The fresh mushroom product must be stocked in kg or g, because harvests are recorded in kg. "${prod.fresh.name}" is stocked in ${prod.fresh.unit || "another unit"}.`);
  const q = (key, base) => r3(base / (factor[key] || 1));   // base units -> the product's stock units
  const P = (key) => (prod[key] ? prod[key].id : "");

  // Customers and suppliers: reuse one with the same name, else create it.
  const customers = store.all("customers");
  const findCustomer = (name) => customers.find((c) => norm(c.name) === norm(name)) || null;
  const shops = findCustomer(D.SHOPS_CUSTOMER) || add("customers", { name: D.SHOPS_CUSTOMER, type: "Small Shop", channel: "offline", uid: null, accountStatus: "none", phone: "", email: "", notes: "All shop sales before shop-wise records started (until 8 Nov 2026). " + note });
  const suku = customers.find((c) => norm(c.name).includes(norm(D.MATERIAL_SALE.customer))) || add("customers", { name: D.MATERIAL_SALE.customer, type: "Farmer", channel: "offline", uid: null, accountStatus: "none", phone: "", email: "", addrCity: D.MATERIAL_SALE.place, notes: note });
  const suppliers = store.all("suppliers");
  const supplierIds = {};
  const supplier = (name) => {
    if (supplierIds[name]) return supplierIds[name];
    const first = norm(name).split(" ")[0];
    const s = suppliers.find((x) => norm(x.name) === norm(name)) || suppliers.find((x) => norm(x.name).split(" ")[0] === first);
    supplierIds[name] = s ? s.id : add("suppliers", { name, supplies: "", phone: "", notes: note }).id;
    return supplierIds[name];
  };

  // Document numbers like INV-2607-001, after any already used that month.
  const numbers = {};
  const nextNo = (col, prefix, date) => {
    const base = `${prefix}-${date.slice(2, 4)}${date.slice(5, 7)}-`;
    if (numbers[base] == null) {
      let max = 0;
      for (const d of Object.values(store.col(col))) if (String(d.number || "").startsWith(base)) max = Math.max(max, parseInt(d.number.slice(base.length), 10) || 0);
      numbers[base] = max;
    }
    numbers[base] += 1;
    return base + String(numbers[base]).padStart(3, "0");
  };
  const invPrefix = store.settings().invoicePrefix || "INV";

  // Purchases (sorted by date so bill numbers run in order)
  const purchases = [...D.PURCHASES].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of purchases) {
    const lines = b.lines.map((l) => {
      if (!l.item) return { description: l.description, qty: l.qty, rate: r6(l.price / l.qty), gstRate: "0" };
      const p = prod[l.item];
      const bag = l.bags && p && packsOf(p).find((k) => Math.abs(Number(k.size) * factor[l.item] - l.qty / l.bags) < 1e-6);
      if (bag) return { itemId: P(l.item), packId: bag.id, packName: bag.name, size: Number(bag.size), qty: l.bags, rate: r6(l.price / l.bags), gstRate: "0" };
      const qty = q(l.item, l.qty);
      return { itemId: P(l.item), qty, rate: r6(l.price / qty), gstRate: "0" };
    });
    const doc = add("purchases", { number: nextNo("purchases", "PUR", b.date), date: b.date, supplierId: supplier(b.supplier), status: "Received", lines, shipping: b.extra || "", notes: [b.note, note].filter(Boolean).join(" ") });
    add("payments", { date: b.date, direction: "out", supplierId: doc.supplierId, refId: doc.id, amount: calc.docTotals(doc).total, mode: "UPI", reference: "", notes: note });
  }

  // Opening stock and the spawn correction
  for (const a of D.ADJUSTMENTS) add("adjustments", { date: a.date, itemId: P(a.item), qty: q(a.item, a.qty), reason: a.reason, notes: a.notes + ". " + note });

  // Freight
  for (const [date, amount] of D.FREIGHT) add("expenses", { date, category: "Transport & Fuel", amount, mode: "Cash", payee: "Alappy parcel", notes: "Alappy parcel freight. " + note });

  // Grow batches: dated the day bed-making finished (when all the materials had been used)
  const batches = D.BATCHES.map((b) => {
    const fruiting = addDays(b.start, D.FRUITING_AFTER_DAYS);
    return { ...b, fruiting, rec: add("batches", {
      code: `B-2026-${b.no}`, mushroomType: "Oyster (Pleurotus)", outputItemId: P("fresh"),
      startDate: b.end, expectedHarvestDate: fruiting, room: "", status: "Harvesting",
      substrateKg: b.beds * D.PER_BED.pellet, cost: "",
      notes: `Bed making ${fmtDate(b.start)} to ${fmtDate(b.end)}. Strain ${D.STRAIN} (white oyster). Spawn: 520 g packets, one for 3 beds. ${note}`,
      inputs: ["pellet", "ppcover", "rubber", "spawn"].map((k) => ({ itemId: P(k), qty: q(k, b.beds * D.PER_BED[k]) })),
      bedItemId: P("bed"), bags: b.beds, contaminations: [], contaminatedBags: 0,
    }) };
  });

  // Per day: packets sold, fresh grams dried, fresh kg pickled
  const days = new Map();
  const day = (d) => { if (!days.has(d)) days.set(d, { packets: 0, driedG: 0, pickleKg: 0 }); return days.get(d); };
  for (const [d, packets, driedG] of D.DAYS) { day(d).packets += packets; day(d).driedG += driedG; }
  for (const d of D.PICKLE.harvestDays) day(d).pickleKg += D.PICKLE.freshKg / D.PICKLE.harvestDays.length;
  const dates = [...days.keys()].sort();

  // Harvests: what was sold, dried and pickled that day, shared by beds across the fruiting batches
  const harvestByBatch = batches.map(() => 0);
  for (const d of dates) {
    const x = days.get(d);
    const kg = r3(x.packets * D.PACKET.kg + x.driedG / 1000 + x.pickleKg);
    if (!(kg > 0)) continue;
    let live = batches.map((b, i) => i).filter((i) => d >= batches[i].fruiting);
    if (!live.length) live = [0];
    const beds = sum(live, (i) => batches[i].beds);
    let left = kg;
    live.forEach((i, n) => {
      const part = n === live.length - 1 ? r3(left) : r3((kg * batches[i].beds) / beds);
      left = r3(left - part);
      harvestByBatch[i] += part;
      if (part > 0) add("harvests", { date: d, batchId: batches[i].rec.id, qty: part, grade: "A", flush: "", notes: "Worked out from the day's sales, drying and pickling. " + note });
    });
  }

  // Packing runs (net zero for fresh mushroom), small boxes first until they run out
  const smallIn = (d) => sum(D.PURCHASES.filter((b) => b.date <= d), (b) => sum(b.lines.filter((l) => l.item === "boxSmall"), (l) => l.qty));
  let smallUsed = 0;
  for (const d of dates) {
    const n = days.get(d).packets;
    if (!n) continue;
    const small = Math.max(0, Math.min(n, smallIn(d) - smallUsed));
    smallUsed += small;
    const large = n - small;
    const kg = r3(n * D.PACKET.kg);
    const inputs = [{ itemId: P("fresh"), qty: q("fresh", kg) }];
    if (small) inputs.push({ itemId: P("boxSmall"), qty: q("boxSmall", small) });
    if (large) inputs.push({ itemId: P("boxLarge"), qty: q("boxLarge", large) });
    inputs.push({ itemId: P("label"), qty: q("label", n) }, { itemId: P("film"), qty: q("film", n * D.PACKET.filmCm) });
    add("productions", { lotNo: "PK-" + d.slice(2).replace(/-/g, ""), date: d, outputItemId: P("fresh"), outputQty: q("fresh", kg), inputs, otherCost: "", expiryDate: "", notes: `Packing ${n} packets of 150 g. ${note}` });
  }

  // Drying runs and the pickle batch
  for (const d of dates) {
    const g = days.get(d).driedG;
    if (!g) continue;
    add("productions", { lotNo: "DR-" + d.slice(2).replace(/-/g, ""), date: d, outputItemId: P("dried"), outputQty: q("dried", (g / 1000) * D.DRY_YIELD), inputs: [{ itemId: P("fresh"), qty: q("fresh", g / 1000) }], otherCost: "", expiryDate: "", notes: `Dried ${num(g)} g fresh, kept 10 % of the weight. ${note}` });
  }
  add("productions", { lotNo: "PKL-" + D.PICKLE.date.slice(2).replace(/-/g, ""), date: D.PICKLE.date, outputItemId: P("pickle"), outputQty: q("pickle", D.PICKLE.outKg), inputs: [{ itemId: P("fresh"), qty: q("fresh", D.PICKLE.freshKg) }], otherCost: "", expiryDate: "", notes: `First pickle batch: 7.5 kg fresh mushroom made 5.5 kg pickle. ${note}` });

  // Sales to the shops: one invoice per sheet row at Rs 75 a packet, paid in cash, plus Rs 5 transport
  // and Rs 15 commission per packet as expenses.
  const fresh = prod.fresh;
  const pack150 = fresh && packsOf(fresh).find((k) => Math.abs(Number(k.size) * (factor.fresh || 1) - D.PACKET.kg) < 1e-6);
  const rows = [...D.DAYS].sort((a, b) => a[0].localeCompare(b[0]));
  let packets = 0;
  for (const [d, n] of rows) {
    if (!n) continue;
    packets += n;
    const line = { itemId: P("fresh"), ...(pack150 ? { packId: pack150.id, packName: pack150.name } : { packName: "150 g packet" }), size: r6(D.PACKET.kg / (factor.fresh || 1)), qty: n, rate: D.PACKET.price, gstRate: "0" };
    const inv = add("sales", { number: nextNo("sales", invPrefix, d), date: d, dueDate: d, customerId: shops.id, status: "Delivered", lines: [line], shipping: "", notes: `${n} packets of 150 g sold through shops at Rs ${D.PACKET.price}. ${note}` });
    add("payments", { date: d, direction: "in", customerId: shops.id, refId: inv.id, amount: calc.docTotals(inv).total, mode: "Cash", reference: "", notes: note });
    add("expenses", { date: d, category: "Transport & Fuel", amount: n * D.PACKET.transport, mode: "Cash", payee: D.SHOPS_CUSTOMER, notes: `Transport to shops for ${inv.number}: ${n} packets × Rs ${D.PACKET.transport}. ${note}` });
    add("expenses", { date: d, category: "Sales Commission", amount: n * D.PACKET.commission, mode: "Cash", payee: D.SHOPS_CUSTOMER, notes: `Shop commission for ${inv.number}: ${n} packets × Rs ${D.PACKET.commission}. ${note}` });
  }

  // Material sold to Sukumaran at the saved prices
  const ms = D.MATERIAL_SALE;
  const msLines = ms.lines.map((l) => {
    const p = prod[l.item];
    if (!p) return null;
    const f = factor[l.item] || 1;
    const gst = Number(p.gstRate) || 0;
    const exGst = (v) => r6(gst ? Number(v) / (1 + gst / 100) : Number(v));
    const packs = packsOf(p);
    let out;
    if (l.item === "pellet") {
      const bag = packs.find((k) => Math.abs(Number(k.size) * f - 25) < 1e-6);
      out = bag ? { packId: bag.id, packName: bag.name, size: Number(bag.size), qty: 1, rate: exGst(bag.price) } : { qty: q(l.item, l.qty), rate: exGst(p.salePrice || 0) };
    } else if (l.item === "spawn") {
      const pk = packs.find((k) => Math.abs(Number(k.size) * f - 0.52) < 1e-6) || packs.find((k) => Math.abs(Number(k.size) * f - 0.6) < 1e-6);
      out = pk ? { packName: "520 g packet", size: r6(0.52 / f), qty: 8, rate: exGst(pk.price) } : { qty: q(l.item, l.qty), rate: exGst(p.salePrice || 0) };
    } else {
      const one = packs.find((k) => Math.abs(Number(k.size) * f - 1) < 1e-6);
      out = one ? { packId: one.id, packName: one.name, size: Number(one.size), qty: q(l.item, l.qty), rate: exGst(one.price) } : { qty: q(l.item, l.qty), rate: exGst(p.salePrice || 0) };
    }
    if (!(out.rate > 0)) problems.push(`"${p.name}" has no selling price saved, so it would go on Sukumaran's invoice at Rs 0. Add its price in Products & Materials first.`);
    return { itemId: p.id, ...out, gstRate: String(gst) };
  }).filter(Boolean);
  const msInv = add("sales", { number: nextNo("sales", invPrefix, ms.date), date: ms.date, dueDate: ms.date, customerId: suku.id, status: "Delivered", lines: msLines, shipping: "", notes: `${ms.lines.map((l) => l.label).join(", ")}. ${note}` });
  add("payments", { date: ms.date, direction: "in", customerId: suku.id, refId: msInv.id, amount: calc.docTotals(msInv).total, mode: "Cash", reference: "", notes: note });

  // Totals for the preview
  const by = (col) => records.filter((r) => r.col === col).map((r) => r.rec);
  const shopSales = by("sales").filter((s) => s.customerId === shops.id);
  const closing = {};
  for (const key of Object.keys(ITEMS)) closing[key] = 0;
  const id2key = new Map(Object.keys(ITEMS).filter((k) => prod[k]).map((k) => [prod[k].id, k]));
  const move = (itemId, qty) => { const k = id2key.get(itemId); if (k) closing[k] = r3(closing[k] + qty * (factor[k] || 1)); };
  for (const { col, rec } of records) {
    if (col === "purchases") for (const l of rec.lines) if (l.itemId) move(l.itemId, l.qty * (l.size || 1));
    if (col === "sales") for (const l of rec.lines) if (l.itemId) move(l.itemId, -l.qty * (l.size || 1));
    if (col === "adjustments") move(rec.itemId, rec.qty);
    if (col === "productions") { for (const i of rec.inputs) move(i.itemId, -i.qty); move(rec.outputItemId, rec.outputQty); }
    if (col === "batches") { for (const i of rec.inputs) move(i.itemId, -i.qty); move(rec.bedItemId, rec.bags); }
  }
  for (const { col, rec } of records) if (col === "harvests") move(P("fresh"), q("fresh", rec.qty));

  const summary = {
    counts: Object.fromEntries(UNDO_ORDER.map((c) => [c, by(c).length])),
    total: records.length,
    packets,
    shopSales: sum(shopSales, (s) => calc.docTotals(s).total),
    materialSale: calc.docTotals(msInv).total,
    transport: sum(by("expenses").filter((e) => e.category === "Transport & Fuel" && e.payee !== "Alappy parcel"), (e) => e.amount),
    commission: sum(by("expenses").filter((e) => e.category === "Sales Commission"), (e) => e.amount),
    freight: sum(D.FREIGHT, (f) => f[1]),
    purchases: sum(by("purchases"), (p) => calc.docTotals(p).total),
    harvestKg: r3(sum(harvestByBatch)),
    harvestByBatch: batches.map((b, i) => ({ code: b.rec.code, beds: b.beds, kg: r3(harvestByBatch[i]) })),
    closing,
    newCustomers: by("customers").map((c) => c.name),
    newSuppliers: by("suppliers").map((s) => s.name),
    newProducts: by("products").map((p) => p.name),
    shopsName: shops.name, sukuName: suku.name, msInv,
  };
  return { records, problems, summary, prod, factor };
}

// Average cost per base unit from the sheet's bills, for products the import creates.
function costPerBase(key) {
  const lines = D.PURCHASES.flatMap((b) => b.lines.filter((l) => l.item === key));
  const qty = sum(lines, (l) => l.qty);
  return qty ? sum(lines, (l) => l.price) / qty : 0;
}

// ---------------- writing and undoing ----------------
async function runImport(plan, onProgress) {
  // The new expense category and any missing units in the dropdown lists
  const s = store.settings();
  const lists = { ...(s.lists || {}) };
  const cats = list("expenseCategories");
  let touched = false;
  if (!cats.includes("Sales Commission")) { lists.expenseCategories = [...cats, "Sales Commission"]; touched = true; }
  if (Array.isArray(lists.units) && lists.units.length) {
    const need = plan.records.filter((r) => r.col === "products").map((r) => r.rec.unit).filter((u) => !lists.units.includes(u));
    if (need.length) { lists.units = [...lists.units, ...new Set(need)]; touched = true; }
  }
  if (touched) store.put("settings", { ...s, id: "business", lists });

  const recs = plan.records;
  for (let i = 0; i < recs.length; i++) {
    withoutLog(() => store.put(recs[i].col, recs[i].rec));
    if (i % 40 === 39) { onProgress(`Writing ${i + 1} of ${recs.length}…`); await new Promise((r) => setTimeout(r, 0)); }
  }
  logActivity("Imported", { what: "import", label: "Production and Sales 2026 sheet", note: `${recs.length} records added, tagged ${TAG}` });
  await waitSaved(onProgress);
}

async function undoImport(onProgress) {
  const recs = importedRecords();
  // Keep a customer, supplier or product that other (not imported) records now use.
  const others = [];
  for (const col of ["sales", "purchases", "payments", "orders", "productions", "batches", "adjustments", "productGroups"]) for (const r of store.all(col)) if (r.importTag !== TAG) others.push(JSON.stringify(r));
  const used = (id) => others.some((j) => j.includes(`"${id}"`));
  let kept = 0, n = 0;
  for (const { col, rec } of recs) {
    if (["customers", "suppliers", "products"].includes(col) && used(rec.id)) { kept++; continue; }
    withoutLog(() => store.remove(col, rec.id));
    if (++n % 40 === 0) { onProgress(`Removing ${n} of ${recs.length}…`); await new Promise((r) => setTimeout(r, 0)); }
  }
  logActivity("Undid import", { what: "import", label: "Production and Sales 2026 sheet", note: `${n} records removed${kept ? `, ${kept} kept because other records use them` : ""}` });
  await waitSaved(onProgress);
  return { removed: n, kept };
}

function waitSaved(onProgress) {
  return new Promise((resolve) => {
    const check = () => {
      if (!fbState.pending) { off(); resolve(); return true; }
      onProgress(fbState.status === "offline" ? `Offline: ${fbState.pending} changes are waiting on this device and will be saved when you're back online.` : `Saving to the database… ${fbState.pending} left`);
      return false;
    };
    const off = onFirebase(() => check());
    if (!check()) setTimeout(function again() { if (!check()) setTimeout(again, 500); }, 500);
  });
}

// ---------------- screen ----------------
const fmtQty = (n, base) => `${num(r3(n))} ${base}`;
const COL_LABEL = { sales: "Sales invoices", payments: "Payments", expenses: "Expenses", harvests: "Harvests", productions: "Processing runs (packing, drying, pickle)", adjustments: "Stock adjustments", purchases: "Purchase bills", batches: "Grow batches", customers: "New customers", suppliers: "New suppliers", products: "New products" };

export const import2026View = {
  title: "Import 2026 sheet",
  keepOnRemote: true,
  render(root) {
    if (!can("admin")) { root.innerHTML = emptyState("Only an Admin can import data."); return; }
    const done = importedRecords();
    if (state.running) { root.innerHTML = `${pageHead("Import 2026 sheet")}<div class="card"><p><b>${esc(state.progress || "Working…")}</b></p><p class="muted">Keep this page open until it says it's finished.</p></div>`; return; }

    if (done.length) {
      const when = done.map((d) => d.rec.createdAt || "").filter(Boolean).sort()[0] || "";
      const counts = UNDO_ORDER.map((c) => [c, done.filter((d) => d.col === c).length]).filter(([, n]) => n);
      root.innerHTML = `
        ${pageHead("Import 2026 sheet", "The 2026 sheet is already in the ERP.")}
        <div class="card">
          <p>Imported${when ? " on " + esc(fmtDate(when.slice(0, 10))) : ""}: <b>${num(done.length)} records</b>.</p>
          <div class="table-wrap"><table class="tbl"><tbody>${counts.map(([c, n]) => `<tr><td>${esc(COL_LABEL[c] || c)}</td><td class="r">${num(n)}</td></tr>`).join("")}</tbody></table></div>
          ${state.progress ? `<p class="muted">${esc(state.progress)}</p>` : ""}
          <div class="form-actions"><a class="btn btn-ghost" href="#/stock">${icon("layers")}See stock</a><button class="btn btn-ghost btn-danger-text" data-undo>${icon("trash")}Undo the import</button></div>
          <p class="muted small">Undo removes every record the import added. Customers, suppliers and products it created stay if other records use them now.</p>
        </div>`;
      root.querySelector("[data-undo]").addEventListener("click", async () => {
        if (!(await confirmDialog(`Remove all ${done.length} records the 2026 import added? Records you added yourself are not touched.`, { danger: true, okLabel: "Undo the import" }))) return;
        state.running = true; state.progress = "Removing…"; this.render(root);
        const res = await undoImport((m) => { state.progress = m; const b = root.querySelector(".card b"); if (b) b.textContent = m; });
        state.running = false; state.progress = ""; state.map = null;
        toast(`Import undone: ${res.removed} records removed`);
        this.render(root);
      });
      return;
    }

    if (!state.map) state.map = initialMap();
    const products = store.all("products").sort((a, b) => a.name.localeCompare(b.name));
    const plan = buildPlan(state.map);
    const S = plan.summary;
    const productRow = ([key, it]) => {
      const m = state.map[key];
      const p = m.productId !== "new" ? store.get("products", m.productId) : null;
      const needF = p && guessFactor(it.base, p.unit) !== 1;
      return `<tr data-key="${key}">
        <td data-label="Sheet item"><b>${esc(it.label)}</b><small class="muted block">counted in ${esc(it.base)}</small></td>
        <td data-label="Product in the ERP"><select data-prod><option value="new" ${m.productId === "new" ? "selected" : ""}>➕ Create "${esc(it.create.name)}" (${esc(it.create.unit)})</option>${products.map((x) => `<option value="${esc(x.id)}" ${x.id === m.productId ? "selected" : ""}>${esc(x.name)} (${esc(x.unit || "")})</option>`).join("")}</select>
          ${needF ? `<label class="small block">1 ${esc(p.unit || "unit")} = <input data-factor type="number" step="any" min="0" style="width:90px" value="${esc(m.factor ?? "")}"> ${esc(it.base)}</label>` : ""}</td>
        <td class="r" data-label="Stock after import">${fmtQty(S.closing[key] || 0, it.base)}${p && Number(m.factor) > 0 && Number(m.factor) !== 1 ? `<small class="muted block">${num(r3((S.closing[key] || 0) / Number(m.factor)))} ${esc(p.unit || "")}</small>` : ""}</td></tr>`;
    };
    const line = (label, value) => `<div class="kv-row"><span>${label}</span><b>${value}</b></div>`;
    root.innerHTML = `
      ${pageHead("Import 2026 sheet", "Adds the 2026 production and sales from Midhun's sheet: sales, harvests, packing, drying, the pickle batch, grow batches 1-3, purchases and expenses. Nothing is saved until you press Import.")}
      <div class="card">
        <div class="card-head"><h3>1. Which product is each sheet item?</h3></div>
        <p class="muted small">The import picked the closest match from Products & Materials. Change any that are wrong, or let it create the product.</p>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Sheet item</th><th>Product in the ERP</th><th class="r">Stock after import</th></tr></thead>
          <tbody>${Object.entries(ITEMS).map(productRow).join("")}</tbody></table></div>
        <p class="muted small">"Stock after import" counts only what this import adds. Anything already recorded for the product is added on top.</p>
      </div>
      ${plan.problems.length ? `<div class="alerts">${plan.problems.map((p) => `<div class="alert-row danger">${icon("alert")}<span>${esc(p)}</span></div>`).join("")}</div>` : ""}
      <div class="card">
        <div class="card-head"><h3>2. What will be added</h3></div>
        ${line("Sales to the shops", `${num(S.packets)} packets · ${money(S.shopSales)} (cash)`)}
        ${line("Customer for those sales", esc(S.shopsName))}
        ${line("Transport to shops (₹5 a packet)", money(S.transport))}
        ${line("Sales commission (₹15 a packet)", money(S.commission))}
        ${line("Sukumaran's material invoice", `${money(S.materialSale)} (cash)`)}
        ${line("Purchase bills", `${num(S.counts.purchases)} bills · ${money(S.purchases)} (UPI)`)}
        ${line("Alappy parcel freight", money(S.freight))}
        ${line("Harvests", `${num(S.harvestKg)} kg · ${S.harvestByBatch.map((b) => `${esc(b.code)}: ${num(b.kg)} kg (${(b.kg / b.beds).toFixed(2)} kg/bed)`).join(" · ")}`)}
        ${S.newProducts.length ? line("New products", esc(S.newProducts.join(", "))) : ""}
        ${S.newSuppliers.length ? line("New suppliers", esc(S.newSuppliers.join(", "))) : ""}
        ${S.newCustomers.length ? line("New customers", esc(S.newCustomers.join(", "))) : ""}
        <div class="table-wrap" style="margin-top:12px"><table class="tbl"><tbody>${UNDO_ORDER.filter((c) => S.counts[c]).map((c) => `<tr><td>${esc(COL_LABEL[c])}</td><td class="r">${num(S.counts[c])}</td></tr>`).join("")}
          <tr><td><b>Total records</b></td><td class="r"><b>${num(S.total)}</b></td></tr></tbody></table></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-import ${plan.problems.length ? "disabled" : ""}>${icon("upload")}Import ${num(S.total)} records</button>
      </div>`;

    root.querySelectorAll("tr[data-key]").forEach((tr) => {
      const key = tr.dataset.key;
      tr.querySelector("[data-prod]").addEventListener("change", (e) => {
        const v = e.target.value;
        const p = v !== "new" ? store.get("products", v) : null;
        state.map[key] = { productId: v, factor: p ? guessFactor(ITEMS[key].base, p.unit) : 1 };
        this.render(root);
      });
      const f = tr.querySelector("[data-factor]");
      if (f) f.addEventListener("change", () => { state.map[key].factor = f.value === "" ? null : Number(f.value); this.render(root); });
    });
    const btn = root.querySelector("[data-import]");
    btn.addEventListener("click", async () => {
      const fresh = buildPlan(state.map);
      if (fresh.problems.length) { this.render(root); return; }
      if (!(await confirmDialog(`Add ${fresh.records.length} records from the 2026 sheet? You can undo it afterwards from this page.`, { okLabel: "Import" }))) return;
      state.running = true; state.progress = "Starting…"; this.render(root);
      try {
        await runImport(fresh, (m) => { state.progress = m; const b = root.querySelector(".card b"); if (b) b.textContent = m; });
        state.progress = "";
        toast(`Imported ${fresh.records.length} records`);
      } catch (e) {
        console.error(e);
        toast("Import stopped: " + (e.message || e), "error");
      }
      state.running = false;
      this.render(root);
    });
  },
};
