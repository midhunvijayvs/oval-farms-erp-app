// Delivery charges by distance. Pincodes are grouped into ranges around the farm; each group sets
// its own charge per kg and the order value above which delivery is free. Any pincode that is in no
// group counts as the farthest group. ovalfarm.in reads the same groups from the "delivery"
// collection (they are public), so the shop and the ERP always agree on the charge.
import { store } from "./store.js";
import { SEED_PINCODES } from "./seed-delivery.js";

export const FAR_ZONE = "z7";

export const ZONES = [
  { id: "z1", label: "1–8 km", order: 1 },
  { id: "z2", label: "8–25 km", order: 2 },
  { id: "z3", label: "25–50 km", order: 3 },
  { id: "z4", label: "50–100 km", order: 4 },
  { id: "z5", label: "100–300 km", order: 5 },
  { id: "z6", label: "300–500 km", order: 6 },
  { id: FAR_ZONE, label: "Above 500 km", order: 7 },
];

export const zoneLabel = (id) => (ZONES.find((z) => z.id === id) || {}).label || id;

// The group as it is saved, with its defaults filled in. The farthest group holds no pincodes:
// it catches everything the other groups don't.
export function zone(id) {
  const saved = store.get("delivery", id) || {};
  const base = ZONES.find((z) => z.id === id) || { id, label: id, order: 9 };
  return {
    ...base,
    freeAbove: Number(saved.freeAbove) || 0,
    perKg: Number(saved.perKg) || 0,
    paused: saved.paused === true,
    pincodes: id === FAR_ZONE ? [] : (Array.isArray(saved.pincodes) ? saved.pincodes : []),
  };
}

export const zones = () => ZONES.map((z) => zone(z.id));

export const isPincode = (v) => /^\d{6}$/.test(String(v || "").trim());

// "673501-673586" or "673525" -> [from, to]
const span = (entry) => {
  const [a, b = a] = String(entry || "").split("-").map((s) => s.trim());
  return isPincode(a) && isPincode(b) ? [Number(a), Number(b)] : null;
};

export const inZone = (z, pincode) => {
  const n = Number(pincode);
  return (z.pincodes || []).some((e) => { const s = span(e); return s && n >= s[0] && n <= s[1]; });
};

// Which group a pincode belongs to. Unknown pincodes fall in the farthest group.
export function zoneForPincode(pincode) {
  if (!isPincode(pincode)) return null;
  return zones().find((z) => z.id !== FAR_ZONE && inZone(z, pincode)) || zone(FAR_ZONE);
}

// Turns typed text ("673525, 673101-673104") into entries, keeping ranges whole.
export function parseEntries(text) {
  const out = [];
  for (const part of String(text || "").split(/[\s,;\n]+/)) {
    if (!part) continue;
    const s = span(part);
    if (!s) continue;
    out.push(s[0] === s[1] ? String(s[0]).padStart(6, "0") : `${String(s[0]).padStart(6, "0")}-${String(s[1]).padStart(6, "0")}`);
  }
  return out;
}

// The entries with these pincodes taken out, splitting a range when one is removed from its middle.
export function without(entries, remove) {
  const gone = remove.map(span).filter(Boolean);
  const out = [];
  for (const e of entries || []) {
    let parts = [span(e)].filter(Boolean);
    for (const [ra, rb] of gone) {
      const next = [];
      for (const [a, b] of parts) {
        if (rb < a || ra > b) { next.push([a, b]); continue; }
        if (a < ra) next.push([a, ra - 1]);
        if (b > rb) next.push([rb + 1, b]);
      }
      parts = next;
    }
    for (const [a, b] of parts) out.push(a === b ? String(a).padStart(6, "0") : `${String(a).padStart(6, "0")}-${String(b).padStart(6, "0")}`);
  }
  return out;
}

export const countPincodes = (z) => (z.pincodes || []).reduce((n, e) => { const s = span(e); return n + (s ? s[1] - s[0] + 1 : 0); }, 0);

// What delivery costs for an order: { zone, free, paused, charge, reason }.
// Free above the group's minimum order value, otherwise charge per kg of the order's weight.
export function deliveryQuote(pincode, weightKg, orderValue) {
  const z = zoneForPincode(pincode);
  if (!z) return { zone: null, charge: 0, paused: false, free: false, reason: "Enter a 6-digit PIN code to see the delivery charge." };
  if (z.paused) return { zone: z, charge: 0, paused: true, free: false, reason: `We are not delivering to the ${z.label} range at the moment.` };
  if (z.freeAbove > 0 && Number(orderValue) >= z.freeAbove) return { zone: z, charge: 0, paused: false, free: true, reason: `Free delivery on orders of ₹${z.freeAbove} or more.` };
  const charge = Math.round(z.perKg * Math.max(Number(weightKg) || 0, 0));
  return { zone: z, charge, paused: false, free: charge === 0, reason: charge ? `₹${z.perKg} per kg for the ${z.label} range.` : "No delivery charge for this order." };
}

// Adds the groups that aren't saved yet, with the pincodes worked out from the farm's location.
// Returns how many were added.
export function seedDeliveryZones() {
  let n = 0;
  for (const z of ZONES) {
    if (store.get("delivery", z.id)) continue;
    store.put("delivery", {
      id: z.id, label: z.label, order: z.order,
      freeAbove: 0, perKg: 0, paused: false,
      pincodes: SEED_PINCODES[z.id] || [],
    });
    n++;
  }
  return n;
}
