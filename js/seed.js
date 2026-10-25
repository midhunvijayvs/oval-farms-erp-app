// Sample data for demo mode, dated relative to today so the dashboard looks alive.
import { store } from "./store.js";
import { today, addDays } from "./util.js";

export function seedDemo() {
  const d = (n) => addDays(today(), n);
  const put = (c, r) => store.put(c, r);
  const ym = today().slice(2, 4) + today().slice(5, 7);

  put("settings", { id: "business", name: "Oval Farms", address: "Oval Farmtech, Kerala, India", phone: "+91 98765 43210", email: "hello@ovalfarms.in", gstin: "32ABCDE1234F1Z5", fssai: "11223344556677", invoicePrefix: "INV", upi: "ovalfarms@upi", bank: "Oval Farms · A/c 123456789012 · IFSC SBIN0000123", terms: "Fresh mushrooms: keep refrigerated (2–4 °C) and use within 3 days." });

  const web = (webCategory, img, shortDescription, displayOrder, extra = {}) => ({
    published: true, trackStock: true, webCategory, images: ["https://ovalfarm.in/images/" + img], shortDescription, displayOrder, ...extra,
  });
  const I = {};
  const items = [
    ["oyster", { name: "Oyster Mushroom (Fresh)", category: "Fresh Mushroom", unit: "kg", salePrice: 280, costPrice: 120, gstRate: "0", hsn: "0709", reorderLevel: 5, shelfLifeDays: 3, ...web("Fresh mushrooms", "home/sec-2-1.jpg", "Fresh white oyster mushrooms, harvested and packed the same day.", 10, { badge: "Fresh", featured: true, netQuantity: 1, netUnit: "kg" }) }],
    ["milky", { name: "Milky Mushroom (Fresh)", category: "Fresh Mushroom", unit: "kg", salePrice: 320, costPrice: 140, gstRate: "0", hsn: "0709", reorderLevel: 5, shelfLifeDays: 4, ...web("Fresh mushrooms", "home/sec-2-2.jpg", "Firm, meaty milky mushrooms for curries and roasts.", 20, { netQuantity: 1, netUnit: "kg" }) }],
    ["dried", { name: "Dried Oyster Mushroom 100 g", category: "Value-Added Product", unit: "pack", salePrice: 250, costPrice: 0, gstRate: "5", hsn: "0712", reorderLevel: 20, shelfLifeDays: 270, ...web("Dried & powders", "home/sec-2-7.webp", "Shade-dried mushrooms that keep for months.", 40, { netQuantity: 100, netUnit: "g" }) }],
    ["pickle", { name: "Mushroom Pickle 200 g", category: "Value-Added Product", unit: "jar", salePrice: 180, costPrice: 0, gstRate: "12", hsn: "2001", reorderLevel: 24, shelfLifeDays: 180 }],
    ["powder", { name: "Mushroom Powder 100 g", category: "Value-Added Product", unit: "pack", salePrice: 299, costPrice: 0, gstRate: "5", hsn: "0712", reorderLevel: 15, shelfLifeDays: 365, ...web("Dried & powders", "home/sec-2-8.jpg", "A pinch a day for taste and nutrition.", 50, { netQuantity: 100, netUnit: "g" }) }],
    ["soup", { name: "Mushroom Soup Premix 25 g", category: "Value-Added Product", unit: "pack", salePrice: 60, mrp: 60, costPrice: 0, gstRate: "12", hsn: "2104", reorderLevel: 30, shelfLifeDays: 240, openingStock: 120, ...web("Ready to cook", "shop/soup-premix.jpg", "Rich, creamy mushroom soup, ready in 3 minutes.", 30, { badge: "New", featured: true, netQuantity: 25, netUnit: "g" }) }],
    ["spawn", { name: "Oyster Spawn", category: "Raw Material", unit: "kg", costPrice: 90, gstRate: "0", reorderLevel: 10, openingStock: 25 }],
    ["mspawn", { name: "Milky Spawn", category: "Raw Material", unit: "kg", costPrice: 110, gstRate: "0", reorderLevel: 8, openingStock: 12 }],
    ["straw", { name: "Paddy Straw", category: "Raw Material", unit: "kg", costPrice: 8, gstRate: "0", reorderLevel: 100, openingStock: 400 }],
    ["oil", { name: "Gingelly Oil", category: "Raw Material", unit: "L", costPrice: 260, gstRate: "5", reorderLevel: 5, openingStock: 12 }],
    ["spice", { name: "Pickle Spice Mix", category: "Raw Material", unit: "kg", costPrice: 380, gstRate: "5", reorderLevel: 2, openingStock: 6 }],
    ["bags", { name: "PP Grow Bags (16x24)", category: "Packaging", unit: "pcs", costPrice: 3, gstRate: "18", reorderLevel: 200, openingStock: 600 }],
    ["jars", { name: "Glass Jar 200 g", category: "Packaging", unit: "pcs", costPrice: 14, gstRate: "18", reorderLevel: 50, openingStock: 140 }],
    ["pouch", { name: "Zip Pouch 100 g", category: "Packaging", unit: "pcs", costPrice: 4, gstRate: "18", reorderLevel: 100, openingStock: 350 }],
  ];
  for (const [k, v] of items) I[k] = put("products", { active: true, ...v }).id;

  const C = {};
  for (const [k, v] of [
    ["fresh", { name: "FreshMart Supermarket", type: "Supermarket", phone: "9847000001", address: "MG Road, Kochi", gstin: "32AAACF1234K1Z2", creditDays: 15 }],
    ["hotel", { name: "Hotel Green Leaf", type: "Restaurant / Hotel", phone: "9847000002", address: "Thrissur", creditDays: 7 }],
    ["veg", { name: "Anand Vegetables", type: "Wholesale", phone: "9847000003", address: "Ernakulam Market" }],
    ["organic", { name: "Organic Basket", type: "Retail", phone: "9847000004", email: "orders@organicbasket.example", creditDays: 30, uid: "demo-uid-organic", accountStatus: "invited", invitedAt: new Date().toISOString() }],
    ["anjali", { name: "Anjali Menon", type: "Retail", phone: "+91 98470 11223", email: "anjali@example.com", channel: "online", uid: "demo-uid-anjali", accountStatus: "active", lastLoginAt: new Date().toISOString(), addresses: [{ line1: "House 12, Temple Road", city: "Kochi", pincode: "682001" }] }],
    ["rahul", { name: "Rahul Nair", type: "Retail", phone: "+91 94460 22334", email: "rahul@example.com", channel: "online", uid: "demo-uid-rahul", accountStatus: "active", addresses: [{ line1: "Rose Villa, Round North", city: "Thrissur", pincode: "680001" }] }],
  ]) C[k] = put("customers", { channel: "offline", uid: null, accountStatus: "none", ...v }).id;
  put("customerInvites", { id: C.organic, email: "orders@organicbasket.example", tempPassword: "Mango-4821" });

  const S = {};
  for (const [k, v] of [
    ["spawnlab", { name: "Kerala Spawn Lab", supplies: "Oyster & milky spawn", phone: "9846000011" }],
    ["agro", { name: "Agro Straw Traders", supplies: "Paddy straw", phone: "9846000012" }],
    ["pack", { name: "PackWell Industries", supplies: "Jars, pouches, labels", phone: "9846000013", gstin: "32AAAPW5678M1Z9" }],
  ]) S[k] = put("suppliers", v).id;

  const B = {};
  for (const [k, v] of [
    ["b1", { code: `B-${ym}-001`, mushroomType: "Oyster (Pleurotus)", outputItemId: I.oyster, startDate: d(-40), expectedHarvestDate: d(-20), room: "Fruiting Room", status: "Completed", bags: 120, substrate: "Paddy straw", substrateKg: 240, spawnKg: 12, contaminatedBags: 4 }],
    ["b2", { code: `B-${ym}-002`, mushroomType: "Oyster (Pleurotus)", outputItemId: I.oyster, startDate: d(-28), expectedHarvestDate: d(-8), room: "Room 1", status: "Harvesting", bags: 150, substrate: "Paddy straw", substrateKg: 300, spawnKg: 15, contaminatedBags: 6 }],
    ["b3", { code: `B-${ym}-003`, mushroomType: "Milky (Calocybe)", outputItemId: I.milky, startDate: d(-30), expectedHarvestDate: d(-2), room: "Room 2", status: "Harvesting", bags: 80, substrate: "Paddy straw", substrateKg: 160, spawnKg: 8, contaminatedBags: 2 }],
    ["b4", { code: `B-${ym}-004`, mushroomType: "Oyster (Pleurotus)", outputItemId: I.oyster, startDate: d(-12), expectedHarvestDate: d(5), room: "Incubation Room", status: "Incubation", bags: 140, substrate: "Paddy straw", substrateKg: 280, spawnKg: 14 }],
    ["b5", { code: `B-${ym}-005`, mushroomType: "Milky (Calocybe)", outputItemId: I.milky, startDate: d(-3), expectedHarvestDate: d(25), room: "Incubation Room", status: "Spawning", bags: 90, substrate: "Paddy straw", substrateKg: 180, spawnKg: 9 }],
  ]) B[k] = put("batches", v).id;

  const harv = [
    ["b1", -20, 38], ["b1", -17, 42], ["b1", -13, 35], ["b1", -9, 26], ["b1", -6, 14],
    ["b2", -8, 44], ["b2", -6, 51], ["b2", -4, 47], ["b2", -2, 39], ["b2", 0, 33],
    ["b3", -2, 18], ["b3", -1, 21], ["b3", 0, 16],
  ];
  harv.forEach(([b, n, q], i) => put("harvests", { date: d(n), batchId: B[b], qty: q, grade: i % 4 === 3 ? "B" : "A", flush: 1 + (i % 3) }));

  put("productions", { date: d(-15), lotNo: `LOT-${ym}-001`, outputItemId: I.dried, outputQty: 60, expiryDate: d(255), inputs: [{ itemId: I.oyster, qty: 60 }, { itemId: I.pouch, qty: 60 }], otherCost: 900 });
  put("productions", { date: d(-10), lotNo: `LOT-${ym}-002`, outputItemId: I.pickle, outputQty: 80, expiryDate: d(170), inputs: [{ itemId: I.oyster, qty: 18 }, { itemId: I.oil, qty: 5 }, { itemId: I.spice, qty: 2 }, { itemId: I.jars, qty: 80 }], otherCost: 1200 });
  put("productions", { date: d(-5), lotNo: `LOT-${ym}-003`, outputItemId: I.powder, outputQty: 25, expiryDate: d(20), inputs: [{ itemId: I.oyster, qty: 25 }, { itemId: I.pouch, qty: 25 }], otherCost: 600 });

  const inv = (n, cust, status, lines, day) => put("sales", {
    number: `INV-${ym}-${String(n).padStart(3, "0")}`, date: d(day), customerId: C[cust], status,
    lines: lines.map(([it, qty, rate, gst]) => ({ itemId: I[it], qty, rate, gstRate: String(gst) })),
  });
  const sales = [
    [1, "fresh", "Delivered", [["oyster", 25, 260, 0], ["dried", 20, 230, 5]], true, { day: -13 }],
    [2, "hotel", "Delivered", [["oyster", 12, 280, 0]], true, { day: -12 }],
    [3, "veg", "Delivered", [["oyster", 30, 240, 0]], 4000, { day: -9 }],
    [4, "organic", "Delivered", [["pickle", 24, 170, 12], ["dried", 10, 240, 5]], false, { day: -7 }],
    [5, "fresh", "Delivered", [["oyster", 28, 260, 0], ["milky", 10, 300, 0], ["pickle", 12, 170, 12]], true, { day: -5 }],
    [6, "hotel", "Delivered", [["milky", 8, 320, 0], ["oyster", 10, 280, 0]], false, { day: -3 }],
    [7, "veg", "Confirmed", [["oyster", 35, 240, 0], ["milky", 12, 300, 0]], false, { day: -1 }],
    [8, "fresh", "Confirmed", [["oyster", 20, 260, 0], ["powder", 6, 280, 5]], false, { day: 0 }],
  ];
  for (const [n, c, stt, lines, paid, extra] of sales) {
    const s = inv(n, c, stt, lines, extra.day);
    // Every invoice comes from an order.
    const cust = store.get("customers", s.customerId);
    const items = s.lines.map((l) => { const it = store.get("products", l.itemId); return { productId: l.itemId, name: it.name, qty: l.qty, unit: it.unit, price: Math.round(l.rate * (1 + Number(l.gstRate) / 100) * 100) / 100 }; });
    const sub = items.reduce((t, i) => t + i.qty * i.price, 0);
    const o = put("orders", {
      channel: "offline", source: n % 3 ? "Phone call" : "WhatsApp", status: stt === "Delivered" ? "delivered" : "confirmed", payment: "credit",
      customerId: s.customerId, customerUid: null, customer: { name: cust.name, phone: cust.phone }, address: { line1: cust.address || "" },
      items, itemCount: items.reduce((t, i) => t + i.qty, 0), subtotal: sub, deliveryCharge: 0, total: Math.round(sub), invoiceId: s.id, invoiceNumber: s.number,
    });
    store.col("orders")[o.id].createdAt = s.date + "T09:30:00.000Z";
    put("sales", { id: s.id, orderId: o.id });
    if (paid) {
      const { total } = totals(s);
      put("payments", { date: s.date, direction: "in", customerId: s.customerId, refId: s.id, amount: paid === true ? total : paid, mode: n % 2 ? "UPI" : "Cash" });
    }
  }

  const bill = (n, sup, day, lines, paid) => {
    const p = put("purchases", { number: `PUR-${ym}-${String(n).padStart(3, "0")}`, supplierRef: "SB/" + (100 + n), date: d(day), supplierId: S[sup], status: "Received", lines: lines.map(([it, qty, rate, gst]) => ({ itemId: I[it], qty, rate, gstRate: String(gst) })) });
    if (paid) put("payments", { date: d(day), direction: "out", supplierId: S[sup], refId: p.id, amount: totals(p).total, mode: "Bank Transfer" });
  };
  bill(1, "spawnlab", -14, [["spawn", 20, 90, 0], ["mspawn", 10, 110, 0]], true);
  bill(2, "agro", -12, [["straw", 500, 8, 0]], true);
  bill(3, "pack", -6, [["jars", 200, 14, 18], ["pouch", 300, 4, 18]], false);

  for (const [day, cat, amt, payee] of [[-25, "Rent", 12000, "Landlord"], [-20, "Electricity", 3400, "KSEB"], [-10, "Transport & Fuel", 1800, "Diesel"], [-4, "Salaries & Wages", 18000, "Monthly wages"], [-2, "Packaging & Labels", 1500, "Label print"], [-1, "Telephone & Internet", 799, "Broadband"]]) {
    put("expenses", { date: d(day), category: cat, amount: amt, payee, mode: amt > 5000 ? "Bank Transfer" : "Cash" });
  }

  const emps = [
    put("employees", { name: "Ramesh K", role: "Farm Worker", phone: "9000000001", wageType: "Daily", wageRate: 750, active: true, joinDate: d(-300) }),
    put("employees", { name: "Sindhu P", role: "Packing", phone: "9000000002", wageType: "Daily", wageRate: 650, active: true, joinDate: d(-200) }),
    put("employees", { name: "Anil Kumar", role: "Supervisor", phone: "9000000003", wageType: "Monthly", wageRate: 22000, active: true, joinDate: d(-500) }),
  ];
  for (let n = -6; n <= -1; n++) emps.forEach((e, i) => put("attendance", { id: `att-${d(n)}-${e.id}`, date: d(n), employeeId: e.id, status: (n + i) % 5 === 0 ? "Absent" : (n + i) % 7 === 0 ? "Half day" : "Present" }));

  put("adjustments", { date: d(-3), itemId: I.oyster, qty: -4, reason: "Wastage / Spoilage", notes: "Over-ripe" });

  // Open orders: two from the website and one taken on WhatsApp.
  const H = 3600e3;
  const order = (id, hoursAgo, cust, rec) => {
    const c = store.get("customers", C[cust]);
    const items = rec.items.map(([it, qty]) => { const p = store.get("products", I[it]); return { productId: p.id, name: p.name, qty, unit: p.unit, price: p.salePrice }; });
    const subtotal = items.reduce((t, i) => t + i.qty * i.price, 0);
    const delivery = rec.channel === "online" && subtotal < 500 ? 40 : 0;
    put("orders", {
      id, customerId: c.id, customerUid: c.uid || null, customer: { name: c.name, phone: c.phone, ...(c.email ? { email: c.email } : {}) },
      address: (c.addresses && c.addresses[0]) || { line1: c.address || "" }, items, itemCount: items.reduce((t, i) => t + i.qty, 0),
      subtotal, deliveryCharge: delivery, total: subtotal + delivery, payment: "cod", note: rec.note || "", ...rec, items,
    });
    store.col("orders")[id].createdAt = new Date(Date.now() - hoursAgo * H).toISOString();
  };
  order("DEMO7Q2KXA", 1, "anjali", { channel: "online", source: "Website", status: "placed", items: [["soup", 3]], note: "Please call before delivery" });
  order("DEMO5M8PQB", 5, "rahul", { channel: "online", source: "Website", status: "confirmed", items: [["oyster", 2], ["soup", 1]] });
  order("DEMO3H6TWC", 26, "hotel", { channel: "offline", source: "WhatsApp", status: "confirmed", payment: "credit", items: [["milky", 6], ["oyster", 8]] });

  for (const [title, due, pr, who, rep] of [["Mist fruiting rooms (morning & evening)", d(0), "High", "Ramesh K", "Daily"], ["Pasteurise straw for the next batch", d(1), "Normal", "Ramesh K", "No"], ["Collect payment from Hotel Green Leaf", d(-1), "High", "Anil Kumar", "No"], ["Renew FSSAI licence", d(20), "Normal", "", "No"]]) {
    put("tasks", { title, dueDate: due, priority: pr, assignee: who, status: "Open", repeat: rep });
  }
}

function totals(doc) {
  let sub = 0, tax = 0;
  for (const l of doc.lines) { const t = l.qty * l.rate; sub += t; tax += (t * Number(l.gstRate || 0)) / 100; }
  return { total: Math.round(sub + tax) };
}
