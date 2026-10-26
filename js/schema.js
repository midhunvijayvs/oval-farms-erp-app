// Collection definitions. The generic list/form views (views/crud.js) are driven entirely by
// these, so adding a field or a whole new master list is usually a change here only.
import { store } from "./store.js";
import { today } from "./util.js";

const hasPacks = (r) => Array.isArray(r.packs) && r.packs.length > 0;

// Editable dropdown lists (Settings > Lists). Defaults suit a mushroom + value-added foods unit.
export const DEFAULT_LISTS = {
  itemCategories: ["Fresh Mushroom", "Value-Added Product", "Raw Material", "Packaging", "Consumable"],
  units: ["kg", "g", "pcs", "pack", "jar", "bag", "box", "L", "ml"],
  mushroomTypes: ["Oyster (Pleurotus)", "Milky (Calocybe)", "Button (Agaricus)", "Shiitake", "Other"],
  substrates: ["Paddy straw", "Wheat straw", "Sawdust", "Compost", "Mixed"],
  rooms: ["Room 1", "Room 2", "Incubation Room", "Fruiting Room"],
  customerTypes: ["Retail", "Wholesale", "Distributor", "Restaurant / Hotel", "Supermarket", "Online", "Small Shop", "Farmer", "Walking Seller"],
  expenseCategories: ["Electricity", "Water", "Rent", "Salaries & Wages", "Transport & Fuel", "Repairs & Maintenance", "Marketing", "Packaging & Labels", "Licences & Fees", "Telephone & Internet", "Office", "Miscellaneous"],
  paymentModes: ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"],
  adjustmentReasons: ["Wastage / Spoilage", "Damaged", "Stock count correction", "Free sample", "Own use", "Opening stock"],
  employeeRoles: ["Farm Worker", "Production", "Packing", "Sales", "Delivery", "Supervisor", "Accounts", "Manager"],
  websiteCategories: ["Fresh mushrooms", "Dried & powders", "Ready to cook", "Grow your own"],
  orderSources: ["Phone call", "WhatsApp", "Walk-in", "Email", "Other"],
};

export function list(name) {
  const s = store.settings();
  const v = s.lists && s.lists[name];
  return Array.isArray(v) && v.length ? v : DEFAULT_LISTS[name] || [];
}

export const GST_RATES = ["0", "5", "12", "18", "28"];

export const BATCH_STATUSES = ["Spawning", "Incubation", "Fruiting", "Harvesting", "Completed", "Contaminated / Discarded"];
export const ACTIVE_BATCH = ["Spawning", "Incubation", "Fruiting", "Harvesting"];

export const schemas = {
  // One product list for the ERP and ovalfarm.in. Published products are copied to the website
  // (js/catalog.js); materials and packaging simply stay unpublished.
  products: {
    title: "Products & Materials", singular: "Product", icon: "box",
    fields: [
      { k: "name", label: "Name", type: "text", required: true, placeholder: "e.g. White Oyster Mushrooms 200 g" },
      { k: "sku", label: "Code / SKU", type: "text", half: true },
      { k: "category", label: "Category", type: "select", list: "itemCategories", half: true, required: true },
      { k: "unit", label: "Stock unit", type: "select", list: "units", half: true, required: true },
      { k: "hsn", label: "HSN code", type: "text", half: true },
      { k: "salePrice", label: "Selling price (per unit, incl. GST)", type: "money", half: true },
      { k: "costPrice", label: "Cost price (per unit)", type: "money", half: true },
      { k: "gstRate", label: "GST %", type: "select", options: GST_RATES, half: true, default: "0" },
      { k: "reorderLevel", label: "Low stock alert at", type: "number", half: true },
      { k: "openingStock", label: "Opening stock", type: "number", half: true },
      { k: "shelfLifeDays", label: "Shelf life (days)", type: "number", half: true },
      { k: "weightKg", label: "Weight of one unit (kg), for delivery charges", type: "number", half: true, placeholder: "e.g. 0.2", showIf: (r) => !["kg", "g"].includes(r.unit) },
      { k: "active", label: "Active", type: "checkbox", default: true },
      { k: "notes", label: "Notes (staff only)", type: "textarea" },
      { k: "_packs", label: "Pack sizes", type: "heading" },
      { k: "packs", label: "Sell from the same stock in different sizes, e.g. Loose (1 kg) and Bag (25 kg). Each pack has its own price (including GST) and shows as its own product on ovalfarm.in. Leave empty to sell it as it is, by the stock unit at the selling price.", type: "packs" },
      { k: "_web", label: "On the website (ovalfarm.in)", type: "heading" },
      { k: "published", label: "Show on ovalfarm.in", type: "checkbox", default: false },
      { k: "webCategory", label: "Website category", type: "select", list: "websiteCategories", half: true, showIf: (r) => r.published },
      { k: "featured", label: "Feature on the home page", type: "checkbox", half: true, showIf: (r) => r.published },
      { k: "images", label: "Photos (the first one is the main photo)", type: "images", showIf: (r) => r.published },
      { k: "shortDescription", label: "Short description (shown on cards)", type: "text", showIf: (r) => r.published },
      { k: "description", label: "Full description", type: "textarea", rows: 4, showIf: (r) => r.published },
      { k: "mrp", label: "MRP (shown struck through when higher than the price)", type: "money", half: true, showIf: (r) => r.published && !hasPacks(r) },
      { k: "badge", label: "Badge on the photo", type: "text", half: true, placeholder: "e.g. New, Fresh", showIf: (r) => r.published },
      { k: "netQuantity", label: "Net quantity on the label", type: "number", half: true, placeholder: "e.g. 25", showIf: (r) => r.published && !hasPacks(r) },
      { k: "netUnit", label: "Net quantity unit", type: "select", options: ["g", "kg", "ml", "l", "nos", "pack", "bed"], half: true, showIf: (r) => r.published && !hasPacks(r) },
      { k: "highlights", label: "Highlights (one per line)", type: "lines", showIf: (r) => r.published },
      { k: "howToUse", label: "How to use (one step per line)", type: "textarea", rows: 3, showIf: (r) => r.published },
      { k: "storageInfo", label: "Storage", type: "text", showIf: (r) => r.published },
      { k: "shelfLifeText", label: "Shelf life (as shown to customers)", type: "text", placeholder: "e.g. Best within 3 days", showIf: (r) => r.published },
      { k: "trackStock", label: "Show \"out of stock\" on the website when ERP stock runs out", type: "checkbox", default: true, showIf: (r) => r.published },
      { k: "slug", label: "Web name (optional)", type: "text", half: true, placeholder: "made from the name", showIf: (r) => r.published },
      { k: "displayOrder", label: "Position on the website", type: "number", half: true, placeholder: "lower shows first", showIf: (r) => r.published },
    ],
    columns: [
      { k: "name", label: "Name", primary: true },
      { k: "category", label: "Category" },
      { k: "_price", label: "Price", align: "right" },
      { k: "_stock", label: "Stock", align: "right" },
      { k: "_web", label: "Website", type: "status" },
    ],
    search: ["name", "sku", "category", "hsn", "webCategory"],
    sort: (a, b) => a.name.localeCompare(b.name),
    filters: [{ k: "category", list: "itemCategories", tabs: true }],
  },

  customers: {
    title: "Customers", singular: "Customer", icon: "users",
    fields: [
      { k: "name", label: "Name", type: "text", required: true },
      { k: "type", label: "Type", type: "select", list: "customerTypes", half: true },
      { k: "channel", label: "Added", type: "static", half: true, fmt: (v) => (v === "online" ? "Online (signed up on ovalfarm.in)" : "Offline (added in the ERP)") },
      { k: "phone", label: "Phone", type: "tel", half: true },
      { k: "email", label: "Email", type: "email", half: true },
      { k: "_createLogin", label: "Create an ovalfarm.in login for them (needs an email)", type: "checkbox", default: true, virtual: true, showIf: (r) => !r.id },
      { k: "_sendEmail", label: "Email them a link to set their password", type: "checkbox", default: true, virtual: true, showIf: (r) => !r.id && r._createLogin },
      { k: "gstin", label: "GSTIN", type: "text", half: true },
      { k: "creditDays", label: "Credit period (days)", type: "number", half: true },
      { k: "_addr", label: "Delivery address", type: "heading" },
      { k: "addrLine1", label: "House name / number and street", type: "text" },
      { k: "addrLine2", label: "Area or locality", type: "text", half: true },
      { k: "addrLandmark", label: "Landmark", type: "text", half: true },
      { k: "addrCity", label: "Town / city", type: "text", half: true },
      { k: "addrPincode", label: "PIN code", type: "text", half: true, placeholder: "6 digits" },
      { k: "mapUrl", label: "Google Maps location", type: "text", placeholder: "https://maps.google.com/…  (the customer can add this on ovalfarm.in)" },
      { k: "address", label: "Other address notes (staff only)", type: "textarea" },
      { k: "notes", label: "Notes (staff only)", type: "textarea" },
    ],
    columns: [
      { k: "name", label: "Name", primary: true },
      { k: "type", label: "Type" },
      { k: "phone", label: "Phone" },
      { k: "_address", label: "Address", fmt: (v) => (v.length > 60 ? v.slice(0, 57) + "…" : v) },
      { k: "channel", label: "Added", type: "status", fmt: (v) => (v === "online" ? "Online" : "Offline") },
      { k: "_login", label: "Website login", type: "status" },
      { k: "_balance", label: "Outstanding", type: "money", align: "right" },
    ],
    search: ["name", "phone", "email", "gstin", "type", "_address"],
    sort: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
    filters: [{ k: "type", list: "customerTypes", tabs: true }, { k: "channel", allLabel: "Online and offline", options: [{ v: "online", l: "Online" }, { v: "offline", l: "Offline" }] }],
  },

  suppliers: {
    title: "Suppliers", singular: "Supplier", icon: "truck",
    fields: [
      { k: "name", label: "Name", type: "text", required: true },
      { k: "supplies", label: "Supplies", type: "text", placeholder: "e.g. Spawn, straw, jars" },
      { k: "phone", label: "Phone", type: "tel", half: true },
      { k: "email", label: "Email", type: "email", half: true },
      { k: "gstin", label: "GSTIN", type: "text", half: true },
      { k: "address", label: "Address", type: "textarea" },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "name", label: "Name", primary: true },
      { k: "supplies", label: "Supplies" },
      { k: "phone", label: "Phone" },
      { k: "_balance", label: "Payable", type: "money", align: "right" },
    ],
    search: ["name", "phone", "supplies", "gstin"],
    sort: (a, b) => a.name.localeCompare(b.name),
  },

  batches: {
    title: "Grow Batches", singular: "Grow Batch", icon: "sprout",
    fields: [
      { k: "code", label: "Batch code", type: "text", required: true, half: true, auto: "batchCode" },
      { k: "mushroomType", label: "Mushroom", type: "select", list: "mushroomTypes", half: true, required: true },
      { k: "outputItemId", label: "Harvest goes to stock item", type: "ref", ref: "products", refFilter: (i) => i.category === "Fresh Mushroom" || !i.category, required: true },
      { k: "startDate", label: "Spawning date", type: "date", half: true, default: today },
      { k: "expectedHarvestDate", label: "Expected first harvest", type: "date", half: true },
      { k: "room", label: "Room / Shed", type: "select", list: "rooms", half: true },
      { k: "status", label: "Status", type: "select", options: BATCH_STATUSES, half: true, default: "Spawning" },
      { k: "bags", label: "No. of bags / beds", type: "number", half: true },
      { k: "substrate", label: "Substrate", type: "select", list: "substrates", half: true },
      { k: "substrateKg", label: "Dry substrate (kg)", type: "number", half: true },
      { k: "spawnKg", label: "Spawn used (kg)", type: "number", half: true },
      { k: "contaminatedBags", label: "Contaminated bags", type: "number", half: true },
      { k: "cost", label: "Batch cost (optional)", type: "money", half: true },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "code", label: "Batch", primary: true },
      { k: "mushroomType", label: "Mushroom" },
      { k: "startDate", label: "Spawned", type: "date" },
      { k: "status", label: "Status", type: "status" },
      { k: "_harvested", label: "Harvested", fmt: (v) => (v || 0).toFixed(2) + " kg", align: "right" },
      { k: "_be", label: "B.E.", fmt: (v) => (v == null ? "–" : v.toFixed(0) + "%"), align: "right", hint: "Biological efficiency: fresh yield ÷ dry substrate" },
    ],
    search: ["code", "mushroomType", "room", "status"],
    sort: (a, b) => (b.startDate || "").localeCompare(a.startDate || ""),
    filters: [{ k: "status", options: BATCH_STATUSES }],
  },

  harvests: {
    title: "Harvests", singular: "Harvest", icon: "basket",
    fields: [
      { k: "date", label: "Date", type: "date", half: true, default: today, required: true },
      { k: "batchId", label: "Batch", type: "ref", ref: "batches", half: true, required: true, refLabel: (b) => b.code + " · " + (b.mushroomType || ""), refSort: (a, b) => (b.startDate || "").localeCompare(a.startDate || "") },
      { k: "qty", label: "Quantity (kg)", type: "number", half: true, required: true, step: "0.001" },
      { k: "grade", label: "Grade", type: "select", options: ["A", "B", "C"], half: true, default: "A" },
      { k: "flush", label: "Flush no.", type: "number", half: true },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "date", label: "Date", type: "date", primary: true },
      { k: "batchId", label: "Batch", type: "ref", ref: "batches", refLabel: (b) => b.code },
      { k: "qty", label: "Qty (kg)", fmt: (v) => Number(v || 0).toFixed(2), align: "right" },
      { k: "grade", label: "Grade" },
    ],
    search: ["notes", "grade"],
    sort: (a, b) => (b.date || "").localeCompare(a.date || ""),
    dateKey: "date",
  },

  adjustments: {
    title: "Stock Adjustments", singular: "Stock Adjustment", icon: "sliders",
    fields: [
      { k: "date", label: "Date", type: "date", half: true, default: today, required: true },
      { k: "itemId", label: "Item", type: "ref", ref: "products", half: true, required: true },
      { k: "qty", label: "Quantity change (use minus for reduction)", type: "number", required: true, step: "0.001", placeholder: "-2.5" },
      { k: "reason", label: "Reason", type: "select", list: "adjustmentReasons", required: true },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "date", label: "Date", type: "date", primary: true },
      { k: "itemId", label: "Item", type: "ref", ref: "products" },
      { k: "qty", label: "Change", fmt: (v) => (v > 0 ? "+" : "") + v, align: "right" },
      { k: "reason", label: "Reason" },
    ],
    search: ["reason", "notes"],
    sort: (a, b) => (b.date || "").localeCompare(a.date || ""),
    dateKey: "date",
  },

  expenses: {
    title: "Expenses", singular: "Expense", icon: "receipt",
    fields: [
      { k: "date", label: "Date", type: "date", half: true, default: today, required: true },
      { k: "category", label: "Category", type: "select", list: "expenseCategories", half: true, required: true },
      { k: "amount", label: "Amount", type: "money", half: true, required: true },
      { k: "mode", label: "Paid by", type: "select", list: "paymentModes", half: true, default: "Cash" },
      { k: "payee", label: "Paid to", type: "text" },
      { k: "notes", label: "Description", type: "textarea" },
    ],
    columns: [
      { k: "date", label: "Date", type: "date", primary: true },
      { k: "category", label: "Category" },
      { k: "payee", label: "Paid to" },
      { k: "mode", label: "Mode" },
      { k: "amount", label: "Amount", type: "money", align: "right" },
    ],
    search: ["category", "payee", "notes"],
    sort: (a, b) => (b.date || "").localeCompare(a.date || ""),
    filters: [{ k: "category", list: "expenseCategories" }],
    dateKey: "date",
    total: "amount",
  },

  payments: {
    title: "Payments", singular: "Payment", icon: "wallet",
    fields: [
      { k: "date", label: "Date", type: "date", half: true, default: today, required: true },
      { k: "direction", label: "Type", type: "select", options: [{ v: "in", l: "Received from customer" }, { v: "out", l: "Paid to supplier" }], half: true, required: true, default: "in" },
      { k: "customerId", label: "Customer", type: "ref", ref: "customers", showIf: (r) => r.direction !== "out" },
      { k: "supplierId", label: "Supplier", type: "ref", ref: "suppliers", showIf: (r) => r.direction === "out" },
      { k: "refId", label: "Against invoice / bill", type: "docref", half: false },
      { k: "amount", label: "Amount", type: "money", half: true, required: true },
      { k: "mode", label: "Mode", type: "select", list: "paymentModes", half: true, default: "UPI" },
      { k: "reference", label: "Reference / UTR no.", type: "text" },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "date", label: "Date", type: "date", primary: true },
      { k: "direction", label: "Type", fmt: (v) => (v === "out" ? "Paid out" : "Received"), type: "status" },
      { k: "_party", label: "Party" },
      { k: "mode", label: "Mode" },
      { k: "amount", label: "Amount", type: "money", align: "right" },
    ],
    search: ["reference", "notes", "mode"],
    sort: (a, b) => (b.date || "").localeCompare(a.date || ""),
    filters: [{ k: "direction", options: [{ v: "in", l: "Received" }, { v: "out", l: "Paid out" }] }],
    dateKey: "date",
  },

  employees: {
    title: "Employees", singular: "Employee", icon: "id",
    fields: [
      { k: "name", label: "Name", type: "text", required: true },
      { k: "role", label: "Role", type: "select", list: "employeeRoles", half: true },
      { k: "phone", label: "Phone", type: "tel", half: true },
      { k: "joinDate", label: "Joining date", type: "date", half: true },
      { k: "wageType", label: "Pay type", type: "select", options: ["Daily", "Monthly"], half: true, default: "Daily" },
      { k: "wageRate", label: "Wage / salary", type: "money", half: true },
      { k: "active", label: "Currently working", type: "checkbox", default: true },
      { k: "address", label: "Address", type: "textarea" },
      { k: "notes", label: "Notes (ID proof, bank a/c…)", type: "textarea" },
    ],
    columns: [
      { k: "name", label: "Name", primary: true },
      { k: "role", label: "Role" },
      { k: "phone", label: "Phone" },
      { k: "wageRate", label: "Pay", fmt: (v, r) => (v ? "₹" + v + (r.wageType === "Monthly" ? "/month" : "/day") : ""), align: "right" },
      { k: "active", label: "Status", fmt: (v) => (v === false ? "Left" : "Active"), type: "status" },
    ],
    search: ["name", "role", "phone"],
    sort: (a, b) => a.name.localeCompare(b.name),
  },

  tasks: {
    title: "Tasks", singular: "Task", icon: "check",
    fields: [
      { k: "title", label: "Task", type: "text", required: true, placeholder: "e.g. Mist fruiting room, clean incubation racks" },
      { k: "dueDate", label: "Due", type: "date", half: true, default: today },
      { k: "priority", label: "Priority", type: "select", options: ["High", "Normal", "Low"], half: true, default: "Normal" },
      { k: "assignee", label: "Assigned to", type: "text", half: true, placeholder: "Name" },
      { k: "status", label: "Status", type: "select", options: ["Open", "Done"], half: true, default: "Open" },
      { k: "repeat", label: "Repeats", type: "select", options: ["No", "Daily", "Weekly", "Monthly"], half: true, default: "No" },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "title", label: "Task", primary: true },
      { k: "dueDate", label: "Due", type: "date" },
      { k: "assignee", label: "Assigned to" },
      { k: "priority", label: "Priority", type: "status" },
      { k: "status", label: "Status", type: "status" },
    ],
    search: ["title", "assignee", "notes"],
    sort: (a, b) => (a.status === b.status ? (a.dueDate || "").localeCompare(b.dueDate || "") : a.status === "Open" ? -1 : 1),
    filters: [{ k: "status", options: ["Open", "Done"] }],
  },
};

export const SALE_STATUSES = ["Draft", "Confirmed", "Delivered", "Cancelled"];
export const PURCHASE_STATUSES = ["Ordered", "Received", "Cancelled"];
