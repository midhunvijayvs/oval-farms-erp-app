// Data from Midhun's "Production and Sales 2026" sheet, for the one-time import (views/import2026.js).
// Typed in by hand from the sheet with the corrections Midhun confirmed on 2026-11-08:
// 4 May / 4 Jun -> 4 Jul, 21 Jun -> 21 Jul, the second 30 Aug -> 30 Sep, 2027 freight dates -> 2026.
// Left out on purpose: purchases before the three 2026 batches (except the boxes and labels still
// left from them), the rows marked "already recorded" / "No record", and the Jan-Feb freight.

// Daily sales: [date, packets of 150 g sold, grams of fresh mushroom dried that day]
export const DAYS = [
  ["2026-07-03", 2, 0], ["2026-07-04", 10, 0], ["2026-07-05", 20, 0], ["2026-07-06", 16, 0],
  ["2026-07-07", 25, 0], ["2026-07-08", 8, 0], ["2026-07-09", 3, 0], ["2026-07-10", 0, 0],
  ["2026-07-11", 5, 0], ["2026-07-12", 14, 0], ["2026-07-13", 6, 0], ["2026-07-14", 22, 0],
  ["2026-07-15", 41, 0], ["2026-07-16", 21, 0], ["2026-07-17", 20, 0], ["2026-07-18", 1, 0],
  ["2026-07-19", 0, 0], ["2026-07-20", 6, 0], ["2026-07-21", 9, 0], ["2026-07-22", 5, 0],
  ["2026-07-23", 14, 0], ["2026-07-24", 7, 0], ["2026-07-25", 7, 0], ["2026-07-26", 6, 0],
  ["2026-07-27", 8, 0], ["2026-07-28", 17, 0], ["2026-07-29", 13, 0], ["2026-07-30", 8, 0],
  ["2026-07-31", 18, 0], ["2026-08-01", 9, 0], ["2026-08-02", 11, 0], ["2026-08-03", 4, 0],
  ["2026-08-04", 13, 0], ["2026-08-05", 15, 0], ["2026-08-06", 25, 0], ["2026-08-07", 18, 0],
  ["2026-08-08", 18, 0], ["2026-08-09", 14, 0], ["2026-08-09", 9, 0], ["2026-08-10", 8, 0],
  ["2026-08-11", 18, 0], ["2026-08-12", 24, 0], ["2026-08-13", 21, 0], ["2026-08-14", 19, 0],
  ["2026-08-15", 21, 0], ["2026-08-16", 20, 0], ["2026-08-17", 10, 0], ["2026-08-18", 28, 0],
  ["2026-08-19", 32, 0], ["2026-08-20", 13, 0], ["2026-08-21", 12, 0], ["2026-08-22", 16, 0],
  ["2026-08-23", 6, 0], ["2026-08-24", 25, 0], ["2026-08-25", 5, 0], ["2026-08-27", 10, 0],
  ["2026-08-29", 10, 0], ["2026-08-30", 22, 0], ["2026-08-31", 7, 0], ["2026-09-01", 25, 0],
  ["2026-09-02", 3, 0], ["2026-09-03", 13, 0], ["2026-09-03", 18, 0], ["2026-09-04", 10, 0],
  ["2026-09-05", 21, 0], ["2026-09-06", 14, 0], ["2026-09-07", 24, 0], ["2026-09-08", 9, 0],
  ["2026-09-09", 8, 0], ["2026-09-10", 7, 0], ["2026-09-11", 8, 0], ["2026-09-12", 8, 0],
  ["2026-09-13", 17, 0], ["2026-09-14", 21, 0], ["2026-09-15", 20, 0], ["2026-09-16", 34, 0],
  ["2026-09-17", 14, 3263], ["2026-09-18", 5, 3994], ["2026-09-19", 10, 0], ["2026-09-20", 17, 0],
  ["2026-09-21", 24, 0], ["2026-09-22", 10, 1500], ["2026-09-23", 13, 3000], ["2026-09-24", 16, 0],
  ["2026-09-25", 16, 0], ["2026-09-26", 15, 0], ["2026-09-27", 15, 200], ["2026-09-28", 14, 0],
  ["2026-09-29", 25, 0], ["2026-09-30", 23, 850], ["2026-10-01", 13, 0], ["2026-10-02", 18, 0],
  ["2026-10-03", 18, 730], ["2026-10-04", 24, 0], ["2026-10-05", 16, 0], ["2026-10-06", 20, 0],
  ["2026-10-07", 13, 2431], ["2026-10-08", 25, 1225], ["2026-10-09", 25, 0], ["2026-10-10", 12, 0],
  ["2026-10-11", 15, 0], ["2026-10-12", 14, 0], ["2026-10-13", 14, 3190], ["2026-10-14", 16, 0],
  ["2026-10-15", 14, 0], ["2026-10-16", 18, 0], ["2026-10-17", 17, 0], ["2026-10-18", 23, 1000],
  ["2026-10-19", 16, 0], ["2026-10-20", 18, 0], ["2026-10-21", 19, 0], ["2026-10-22", 16, 0],
  ["2026-10-23", 12, 0], ["2026-10-24", 20, 1885], ["2026-10-25", 16, 0], ["2026-10-26", 10, 0],
  ["2026-10-27", 7, 0], ["2026-10-28", 10, 0], ["2026-10-29", 9, 3045], ["2026-10-30", 10, 0],
  ["2026-10-31", 5, 0], ["2026-11-01", 12, 0], ["2026-11-02", 9, 0], ["2026-11-03", 10, 0],
  ["2026-11-04", 11, 0], ["2026-11-05", 12, 1950], ["2026-11-06", 17, 0], ["2026-11-07", 12, 0],
  ["2026-11-08", 16, 1350],
];

// The 7.5 kg of fresh mushroom made into pickle on 30 Aug (5.5 kg of pickle), harvested over 26-30 Aug.
export const PICKLE = { date: "2026-08-30", freshKg: 7.5, outKg: 5.5, harvestDays: ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"] };

// Drying keeps 10 % of the fresh weight.
export const DRY_YIELD = 0.1;

// Packing one 150 g packet uses 150 g fresh mushroom, 1 PVC box, 1 sticker label and 33 cm of cling film.
export const PACKET = { kg: 0.15, price: 75, transport: 5, commission: 15, filmCm: 33 };

// Grow batches. Bed-making start/end; each starts fruiting 20 days after bed-making starts.
// Every bed takes 1 kg pellet, 1 PP cover, 1 rubber band and a third of a 520 g spawn packet.
export const BATCHES = [
  { no: 1, beds: 150, start: "2026-06-06", end: "2026-06-29" },
  { no: 2, beds: 150, start: "2026-07-10", end: "2026-07-20" },
  { no: 3, beds: 250, start: "2026-08-06", end: "2026-08-20" },
];
export const PER_BED = { pellet: 1, ppcover: 1, rubber: 1, spawn: 0.52 / 3 };
export const FRUITING_AFTER_DAYS = 20;
export const STRAIN = "HU xy";

// Purchase bills. qty is in the sheet item's base unit (kg, pcs or cm); price is the bill amount.
// extra: other charges on the same bill (handling, freight), added as shipping.
export const PURCHASES = [
  // Left over from purchases before the 2026 batches, kept at cost as opening stock.
  { date: "2026-01-11", supplier: "Swathi Blister Forms alua", lines: [{ item: "boxSmall", qty: 240, price: 720 }], note: "Opening stock: 240 of the 500 small boxes bought on 11 Jan 2026 were still left." },
  { date: "2026-01-17", supplier: "PrintEasy Perambra", lines: [{ item: "label", qty: 73, price: 262.8 }], note: "Opening stock: the labels used for 3-7 Jul, from the 200 bought on 17 Jan 2026 at Rs 3.60." },
  { date: "2026-05-25", supplier: "Joshmatic", lines: [{ item: "pellet", qty: 125, price: 3100, bags: 5 }], note: "For batch 1" },
  { date: "2026-06-19", supplier: "Joshmatic", lines: [{ item: "pellet", qty: 50, price: 1300, bags: 2 }], note: "For batches 1 and 2" },
  { date: "2026-07-03", supplier: "Joshmatic", lines: [{ item: "pellet", qty: 250, price: 6000, bags: 10 }], note: "For batch 2" },
  { date: "2026-08-04", supplier: "Joshmatic", lines: [{ item: "pellet", qty: 250, price: 6000, bags: 10 }], note: "For batch 3" },
  { date: "2026-06-08", supplier: "Monsoon Mushroom", lines: [{ item: "ppcover", qty: 76, price: 250 }], extra: 150, note: "For batch 1. Freight Rs 150 (DTDC) added as shipping." },
  { date: "2026-07-03", supplier: "Monsoon Mushroom", lines: [{ item: "ppcover", qty: 304, price: 1000 }], note: "For batch 2" },
  { date: "2026-08-17", supplier: "Monsoon Mushroom", lines: [{ item: "ppcover", qty: 304, price: 1000 }], note: "For batch 3" },
  { date: "2026-06-01", supplier: "Maga Mushrroms", lines: [{ item: "spawn", qty: 26, price: 3000, packets: 50 }], extra: 100, note: "For batch 1: 50 packets of 520 g. Handling charge Rs 100 added as shipping." },
  { date: "2026-07-06", supplier: "Maga Mushrroms", lines: [{ item: "spawn", qty: 26, price: 3000, packets: 50 }], extra: 100, note: "For batch 2: 50 packets of 520 g. Handling charge Rs 100 added as shipping." },
  { date: "2026-08-03", supplier: "Maga Mushrroms", lines: [{ item: "spawn", qty: 52, price: 6000, packets: 100 }, { description: "Cardboard box", qty: 2, price: 160 }], extra: 100, note: "For batch 3: 100 packets of 520 g. Handling charge Rs 100 added as shipping." },
  { date: "2026-07-23", supplier: "Swathi Blister Forms alua", lines: [{ item: "boxSmall", qty: 1000, price: 3500 }] },
  { date: "2026-09-28", supplier: "Swathi Blister Forms alua", lines: [{ item: "boxLarge", qty: 500, price: 2180 }] },
  { date: "2026-10-23", supplier: "Swathi Blister Forms alua", lines: [{ item: "boxLarge", qty: 1000, price: 4360 }] },
  { date: "2026-07-08", supplier: "PrintEasy Perambra", lines: [{ item: "label", qty: 250, price: 840 }] },
  { date: "2026-07-23", supplier: "Vikas VK Printing", lines: [{ item: "label", qty: 2000, price: 1500 }] },
  { date: "2026-07-30", supplier: "Sarga Offset perambra", lines: [{ item: "label", qty: 86, price: 240 }], note: "Count worked out at about Rs 2.80 a label" },
  { date: "2026-08-05", supplier: "Sarga Offset perambra", lines: [{ item: "label", qty: 107, price: 300 }], note: "Count worked out at about Rs 2.80 a label" },
  { date: "2026-08-12", supplier: "Sarga Offset perambra", lines: [{ item: "label", qty: 89, price: 250 }], note: "Count worked out at about Rs 2.80 a label" },
  { date: "2026-08-18", supplier: "Sarga Offset perambra", lines: [{ item: "label", qty: 107, price: 300 }], note: "Count worked out at about Rs 2.80 a label" },
  { date: "2026-08-15", supplier: "Nanoth Packing shop perambra", lines: [{ item: "film", qty: 15000, price: 300 }], note: "Cling film (antifog) 150 m roll" },
  { date: "2026-09-04", supplier: "Nanoth Packing shop perambra", lines: [{ item: "film", qty: 15000, price: 320 }], note: "Cling film (antifog) 150 m roll" },
  { date: "2026-09-28", supplier: "Nanoth Packing shop perambra", lines: [{ item: "film", qty: 15000, price: 320 }], note: "Cling film (antifog) 150 m roll" },
  { date: "2026-10-13", supplier: "Nanoth Packing shop perambra", lines: [{ item: "film", qty: 10000, price: 100 }], note: "Cling film (antifog) 33 m roll, 10000 cm as in the sheet" },
  { date: "2026-10-22", supplier: "Nanoth Packing shop perambra", lines: [{ item: "film", qty: 30000, price: 600 }], note: "Cling film (antifog) 2 x 150 m rolls" },
  { date: "2026-07-15", supplier: "Generic Stationary Shop Perambra", lines: [{ item: "rubber", qty: 200, price: 100 }] },
];

// "alappy parcel freight" from the sheet (the three Jan-Feb ones are left out).
export const FREIGHT = [
  ["2026-05-29", 1500], ["2026-06-24", 650], ["2026-07-04", 2660], ["2026-07-07", 260], ["2026-07-29", 270],
  ["2026-08-09", 2610], ["2026-08-20", 260], ["2026-10-01", 260], ["2026-10-27", 250],
];

// Opening stock with no bill, and the spawn count correction.
export const ADJUSTMENTS = [
  { date: "2026-06-01", item: "rubber", qty: 350, reason: "Opening stock", notes: "Rubber bands already in hand before the 2026 batches" },
  { date: "2026-06-01", item: "film", qty: 18500, reason: "Opening stock", notes: "Cling film already in hand before the 2026 batches" },
  // Spawn: 104 kg bought, 95.333 kg used in beds, 4.16 kg sold, 1.8 kg actually left on 8 Nov 2026.
  { date: "2026-11-08", item: "spawn", qty: -(104 - 0.52 / 3 * 550 - 4.16 - 1.8), reason: "Wastage / Spoilage", notes: "Spawn wasted in 2026, so stock matches the 1.8 kg in hand" },
];

// Material sold to a farmer, at the prices saved in Products & Materials. qty in base units.
export const MATERIAL_SALE = {
  date: "2026-08-19", customer: "Sukumaran", place: "Mullankunnu",
  lines: [{ item: "pellet", qty: 25, label: "1 bag (25 kg)" }, { item: "spawn", qty: 4.16, label: "8 packets of 520 g" }, { item: "ppcover", qty: 25, label: "25 PP covers" }],
};

export const SHOPS_CUSTOMER = "combined shops in perambra and balusseri area in preseeding time in 2026.";
export const IMPORT_TAG = "sheet-2026";
