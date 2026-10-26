// Pack sizes: one product (one stock count) sold in different sizes, e.g. Mush pellet sold
// loose by the kg and as 25 kg bags. Each pack says how much of the product's stock it uses
// (size, in the product's unit) and has its own price. Orders and invoice lines remember the
// pack and its size, so stock goes down by qty × size.
// A product without packs is sold as it is: one unit of stock at its sale price.
import { store } from "./store.js";
import { num } from "./util.js";

export const packsOf = (p) => (p && Array.isArray(p.packs) ? p.packs.filter((k) => k && k.id && k.name && Number(k.size) > 0) : []);

export const findPack = (p, packId) => (packId ? packsOf(p).find((k) => k.id === packId) || null : null);

// "Bag (25 kg)"
export const packLabel = (p, k) => `${k.name} (${num(k.size)} ${(p && p.unit) || ""})`.replace(" )", ")");

// "Mush pellet – Bag (25 kg)", or just "Mush pellet"
export const sellName = (p, k) => (k ? `${p.name} – ${packLabel(p, k)}` : p.name);

// How much stock one of these uses. Lines keep the size they were sold at; older lines without it
// fall back to the pack as it is now.
export function sizeOf(line, productKey = "itemId") {
  if (Number(line.size) > 0) return Number(line.size);
  const k = findPack(store.get("products", line[productKey]), line.packId);
  return k ? Number(k.size) : 1;
}

// Everything that can go on an order or invoice line: [{ key, product, pack, name, size, price, mrp }]
// key is "productId" or "productId|packId" (the value of the line's product select).
export function sellables(products) {
  const out = [];
  for (const p of products) {
    const packs = packsOf(p);
    if (!packs.length) out.push({ key: p.id, product: p, pack: null, name: p.name, size: 1, price: p.salePrice, mrp: p.mrp });
    else for (const k of packs) out.push({ key: `${p.id}|${k.id}`, product: p, pack: k, name: sellName(p, k), size: Number(k.size), price: k.price, mrp: k.mrp });
  }
  return out;
}

export const keyOf = (productId, packId) => (productId ? (packId ? `${productId}|${packId}` : productId) : "");
export const splitKey = (key) => { const [productId = "", packId = ""] = String(key || "").split("|"); return { productId, packId }; };
