// What ovalfarm.in sees of a product. Products themselves (with cost prices and notes) are staff-only,
// so the ERP keeps a public copy of each published product in the Firestore "catalog" collection,
// including whether it is in stock. js/firebase.js writes the copies whenever something changes.
import { store } from "./store.js";
import * as calc from "./calc.js";

export const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const text = (v) => (v === undefined || v === null || v === "" ? null : String(v));
const number = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));

// in_stock | low | out. Products that don't track stock are always in stock.
export function websiteStock(p) {
  if (p.trackStock === false) return "in_stock";
  const available = calc.availableOf(p.id);
  if (available <= 0) return "out";
  if (p.reorderLevel !== "" && p.reorderLevel != null && available <= Number(p.reorderLevel)) return "low";
  return "in_stock";
}

export function catalogEntry(p) {
  const stock = websiteStock(p);
  return {
    sku: text(p.sku),
    slug: text(p.slug) || slugify(p.name),
    name: String(p.name || ""),
    category: slugify(p.webCategory) || "other",
    category_name: text(p.webCategory) || "Other",
    short_description: text(p.shortDescription),
    description: text(p.description),
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    price: number(p.salePrice),
    mrp: number(p.mrp),
    currency: "INR",
    net_quantity: number(p.netQuantity),
    unit: text(p.netUnit) || text(p.unit),
    is_featured: !!p.featured,
    badge: text(p.badge),
    highlights: Array.isArray(p.highlights) ? p.highlights.filter(Boolean) : [],
    how_to_use: text(p.howToUse),
    storage: text(p.storageInfo),
    shelf_life: text(p.shelfLifeText),
    display_order: number(p.displayOrder) ?? 9999,
    stock_status: stock,
    in_stock: stock !== "out",
  };
}

export const isListed = (p) => p.published === true && p.active !== false;

// The catalog as it should be: id -> entry, for every published product.
export function desiredCatalog() {
  const out = new Map();
  for (const p of store.all("products")) if (isListed(p)) out.set(p.id, catalogEntry(p));
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
