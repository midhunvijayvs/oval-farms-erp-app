// Collection definitions. The generic list/form views (views/crud.js) are driven entirely by
// these, so adding a field or a whole new master list is usually a change here only.
import { store } from "./store.js";
import { today } from "./util.js";

// Editable dropdown lists (Settings > Lists). Defaults suit a mushroom + value-added foods unit.
export const DEFAULT_LISTS = {
  itemCategories: ["Fresh Mushroom", "Value-Added Product", "Raw Material", "Packaging", "Consumable"],
  units: ["kg", "g", "pcs", "pack", "jar", "bag", "box", "L", "ml"],
  mushroomTypes: ["Oyster (Pleurotus)", "Milky (Calocybe)", "Button (Agaricus)", "Shiitake", "Other"],
  substrates: ["Paddy straw", "Wheat straw", "Sawdust", "Compost", "Mixed"],
  rooms: ["Room 1", "Room 2", "Incubation Room", "Fruiting Room"],
  customerTypes: ["Retail", "Wholesale", "Distributor", "Restaurant / Hotel", "Supermarket", "Online"],
  expenseCategories: ["Electricity", "Water", "Rent", "Salaries & Wages", "Transport & Fuel", "Repairs & Maintenance", "Marketing", "Packaging & Labels", "Licences & Fees", "Telephone & Internet", "Office", "Miscellaneous"],
  paymentModes: ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"],
  adjustmentReasons: ["Wastage / Spoilage", "Damaged", "Stock count correction", "Free sample", "Own use", "Opening stock"],
  employeeRoles: ["Farm Worker", "Production", "Packing", "Sales", "Delivery", "Supervisor", "Accounts", "Manager"],
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
  items: {
    title: "Products & Materials", singular: "Item", icon: "box",
    fields: [
      { k: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Oyster Mushroom (Fresh)" },
      { k: "sku", label: "Code / SKU", type: "text", half: true },
      { k: "category", label: "Category", type: "select", list: "itemCategories", half: true, required: true },
      { k: "unit", label: "Unit", type: "select", list: "units", half: true, required: true },
      { k: "hsn", label: "HSN code", type: "text", half: true },
      { k: "salePrice", label: "Selling price (per unit)", type: "money", half: true },
      { k: "costPrice", label: "Cost price (per unit)", type: "money", half: true },
      { k: "gstRate", label: "GST %", type: "select", options: GST_RATES, half: true, default: "0" },
      { k: "reorderLevel", label: "Low stock alert at", type: "number", half: true },
      { k: "openingStock", label: "Opening stock", type: "number", half: true },
      { k: "shelfLifeDays", label: "Shelf life (days)", type: "number", half: true },
      { k: "webProductId", label: "Website product ID", type: "text", half: true, placeholder: "Links ovalfarm.in orders to this item" },
      { k: "active", label: "Active", type: "checkbox", default: true },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "name", label: "Name", primary: true },
      { k: "category", label: "Category" },
      { k: "unit", label: "Unit" },
      { k: "salePrice", label: "Price", type: "money", align: "right" },
      { k: "gstRate", label: "GST", fmt: (v) => (v || 0) + "%", align: "right" },
    ],
    search: ["name", "sku", "category", "hsn"],
    sort: (a, b) => a.name.localeCompare(b.name),
    filters: [{ k: "category", list: "itemCategories" }],
  },

  customers: {
    title: "Customers", singular: "Customer", icon: "users",
    fields: [
      { k: "name", label: "Name", type: "text", required: true },
      { k: "type", label: "Type", type: "select", list: "customerTypes", half: true },
      { k: "phone", label: "Phone", type: "tel", half: true },
      { k: "email", label: "Email", type: "email", half: true },
      { k: "gstin", label: "GSTIN", type: "text", half: true },
      { k: "address", label: "Address", type: "textarea" },
      { k: "creditDays", label: "Credit period (days)", type: "number", half: true },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "name", label: "Name", primary: true },
      { k: "type", label: "Type" },
      { k: "phone", label: "Phone" },
      { k: "_balance", label: "Outstanding", type: "money", align: "right" },
    ],
    search: ["name", "phone", "email", "gstin", "type"],
    sort: (a, b) => a.name.localeCompare(b.name),
    filters: [{ k: "type", list: "customerTypes" }],
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
      { k: "outputItemId", label: "Harvest goes to stock item", type: "ref", ref: "items", refFilter: (i) => i.category === "Fresh Mushroom" || !i.category, required: true },
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
      { k: "itemId", label: "Item", type: "ref", ref: "items", half: true, required: true },
      { k: "qty", label: "Quantity change (use minus for reduction)", type: "number", required: true, step: "0.001", placeholder: "-2.5" },
      { k: "reason", label: "Reason", type: "select", list: "adjustmentReasons", required: true },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [
      { k: "date", label: "Date", type: "date", primary: true },
      { k: "itemId", label: "Item", type: "ref", ref: "items" },
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
