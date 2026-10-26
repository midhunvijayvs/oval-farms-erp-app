// What ovalfarm.in sees of a product. Products themselves (with cost prices and notes) are staff-only,
// so the ERP keeps a public copy of each published product in the Firestore "catalog" collection,
// including whether it is in stock. js/firebase.js writes the copies whenever something changes.
import { store } from "./store.js";
import * as calc from "./calc.js";
import { packsOf } from "./packs.js";

export const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const text = (v) => (v === undefined || v === null || v === "" ? null : String(v));
const number = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));

// in_stock | low | out. Products that don't track stock are always in stock. A pack is out of stock
// when less than one pack's worth is left (20 kg left: loose is in stock, a 25 kg bag is not).
export function websiteStock(p, size = 1) {
  if (p.trackStock === false) return "in_stock";
  const available = calc.availableOf(p.id);
  if (available <= 0 || available < size) return "out";
  if (p.reorderLevel !== "" && p.reorderLevel != null && available <= Number(p.reorderLevel)) return "low";
  return "in_stock";
}

// The website entry for a product, or for one of its pack sizes (each pack shows as its own product).
// product_id / pack_id / pack_size tell the website what to put on the order; packs of one product
// share product_id, so the product page can offer the other sizes.
export function catalogEntry(p, k = null, i = 0) {
  const stock = websiteStock(p, k ? Number(k.size) : 1);
  const slug = text(p.slug) || slugify(p.name);
  return {
    sku: text(k ? k.sku : p.sku),
    slug: k ? `${slug}-${slugify(k.name)}` : slug,
    name: k ? `${p.name} – ${k.name}` : String(p.name || ""),
    category: slugify(p.webCategory) || "other",
    category_name: text(p.webCategory) || "Other",
    short_description: text(p.shortDescription),
    description: text(p.description),
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    price: number(k ? k.price : p.salePrice),
    mrp: number(k ? k.mrp : p.mrp),
    currency: "INR",
    net_quantity: k ? number(k.size) : number(p.netQuantity),
    unit: k ? text(p.unit) : text(p.netUnit) || text(p.unit),
    is_featured: !!p.featured,
    badge: text(p.badge),
    highlights: Array.isArray(p.highlights) ? p.highlights.filter(Boolean) : [],
    how_to_use: text(p.howToUse),
    storage: text(p.storageInfo),
    shelf_life: text(p.shelfLifeText),
    // Packs follow their product, in the order they're listed on it
    display_order: (number(p.displayOrder) ?? 9999) + (k ? i / 100 : 0),
    stock_status: stock,
    in_stock: stock !== "out",
    product_id: p.id || null,
    pack_id: k ? k.id : null,
    pack_name: k ? k.name : null,
    pack_size: k ? Number(k.size) : 1,
    weight_kg: number(weightOf(p, k ? Number(k.size) : 1)),
  };
}

// How much one of these weighs, in kg: packs sold by weight know it, anything else uses the
// product's "Weight of one unit (kg)". 0 means the delivery charge per kg costs nothing for it.
export function weightOf(p, size = 1) {
  const unit = String(p.unit || "").toLowerCase();
  const per = unit === "kg" ? 1 : unit === "g" ? 0.001 : Number(p.weightKg) || 0;
  return Math.round(per * (Number(size) || 1) * 1000) / 1000;
}

export const isListed = (p) => p.published === true && p.active !== false;

// The catalog as it should be: id -> entry, for every published product (or each of its published packs).
export function desiredCatalog() {
  const out = new Map();
  for (const p of store.all("products")) {
    if (!isListed(p)) continue;
    const packs = packsOf(p);
    if (!packs.length) out.set(p.id, catalogEntry(p));
    else packs.forEach((k, i) => { if (k.published !== false) out.set(`${p.id}--${k.id}`, catalogEntry(p, k, i)); });
  }
  return out;
}

const KEYS = Object.keys(catalogEntry({ id: "x" }));
const same = (a, b) => KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

// Writes needed to bring the catalog in line: [{ id, data }] (data null = remove).
export function catalogChanges() {
  const want = desiredCatalog();
  const have = new Map(store.all("catalog").map((c) => [c.id, c]));
  const changes = [];
  for (const [id, entry] of want) if (!have.has(id) || !same(entry, have.get(id))) changes.push({ id, data: entry });
  for (const id of have.keys()) if (!want.has(id)) changes.push({ id, data: null });
  return changes;
}
