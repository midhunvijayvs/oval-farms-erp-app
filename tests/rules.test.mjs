// Firestore security rules tests, run against the local emulator.
// Run: npm i -g firebase-tools && npm i @firebase/rules-unit-testing firebase
//      firebase emulators:exec --only firestore --project demo-oval "node tests/rules.test.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-oval",
  firestore: { rules: readFileSync(new URL("../firebase/firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

let fail = 0;
async function t(name, p) {
  try { await p; console.log("PASS " + name); } catch (e) { fail++; console.log("FAIL " + name + "\n   " + e.message); }
}

const owner = env.authenticatedContext("owner", { email: "ovaleggfarm@gmail.com", email_verified: true }).firestore();
const manager = env.authenticatedContext("mgr", { email: "manager@gmail.com", email_verified: true }).firestore();
const worker = env.authenticatedContext("wrk", { email: "worker@gmail.com", email_verified: true }).firestore();
const viewer = env.authenticatedContext("vw", { email: "viewer@gmail.com", email_verified: true }).firestore();
const fakeOwner = env.authenticatedContext("x", { email: "ovaleggfarm@gmail.com", email_verified: false }).firestore();
const alice = env.authenticatedContext("alice", { email: "alice@example.com", email_verified: false }).firestore();
const bob = env.authenticatedContext("bob", { phone_number: "+919999999999" }).firestore();
const carol = env.authenticatedContext("carol", { email: "carol@example.com", email_verified: true }).firestore();
const mallory = env.authenticatedContext("mallory", { email: "mallory@example.com", email_verified: false }).firestore();
const anon = env.unauthenticatedContext().firestore();

const ts = { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
const online = (uid, extra = {}) => ({ name: "Alice", phone: "+91 98765 43210", phoneE164: "+919876543210", email: "alice@example.com", addresses: [], channel: "online", uid, accountStatus: "active", lastLoginAt: serverTimestamp(), ...ts, ...extra });
const order = (uid, customerId, extra = {}) => ({
  customerUid: uid, customerId, customer: { name: "Alice", phone: "+91 98765 43210", email: "alice@example.com" },
  address: { line1: "12 MG Road", city: "Kochi", pincode: "682001" },
  items: [{ productId: "mushroom-soup-premix", name: "Soup premix", qty: 2, unit: "pack", price: 60 }],
  itemCount: 2, subtotal: 120, deliveryCharge: 0, total: 120, payment: "cod", note: "",
  status: "placed", channel: "online", source: "Website", ...ts, ...extra,
});

// Team
await t("owner can add staff", setDoc(doc(owner, "staff/manager@gmail.com"), { email: "manager@gmail.com", name: "M", role: "manager" }));
await t("owner can add worker", setDoc(doc(owner, "staff/worker@gmail.com"), { email: "worker@gmail.com", name: "W", role: "staff" }));
await t("owner can add viewer", setDoc(doc(owner, "staff/viewer@gmail.com"), { email: "viewer@gmail.com", name: "V", role: "viewer" }));
await t("unverified owner email is not owner", assertFails(setDoc(doc(fakeOwner, "staff/x@gmail.com"), { email: "x@gmail.com", role: "admin" })));
await t("manager cannot change roles", assertFails(updateDoc(doc(manager, "staff/manager@gmail.com"), { role: "admin" })));
await t("staff update their own last-seen day", assertSucceeds(updateDoc(doc(worker, "staff/worker@gmail.com"), { lastSeen: "2026-10-25", name: "Worker", updatedAt: serverTimestamp(), updatedBy: "worker@gmail.com" })));
await t("customer cannot read staff", assertFails(getDoc(doc(alice, "staff/manager@gmail.com"))));
await t("bad role rejected", assertFails(setDoc(doc(owner, "staff/z@gmail.com"), { email: "z@gmail.com", role: "boss" })));
await t("stranger can check their own (missing) staff record", assertSucceeds(getDoc(doc(carol, "staff/carol@example.com"))));

// Products and the public catalog
await t("staff add a product", assertSucceeds(setDoc(doc(worker, "products/p1"), { name: "Soup", costPrice: 20, salePrice: 60, published: true })));
await t("viewer cannot add a product", assertFails(setDoc(doc(viewer, "products/p2"), { name: "X" })));
await t("customers cannot read products (cost prices)", assertFails(getDoc(doc(alice, "products/p1"))));
await t("anyone can't list products", assertFails(getDocs(collection(anon, "products"))));
await t("staff write the catalog", assertSucceeds(setDoc(doc(worker, "catalog/p1"), { name: "Soup", price: 60, display_order: 10, stock_status: "in_stock" })));
await t("anyone reads the catalog", assertSucceeds(getDocs(collection(anon, "catalog"))));
await t("customers cannot write the catalog", assertFails(setDoc(doc(alice, "catalog/p1"), { name: "Free soup", price: 0 })));
await t("staff cannot delete products", assertFails(deleteDoc(doc(worker, "products/p1"))));

// Customers: website sign-up
await t("customer creates own profile", assertSucceeds(setDoc(doc(alice, "customers/alice"), online("alice"))));
await t("customer cannot create profile under another id", assertFails(setDoc(doc(alice, "customers/zzz"), online("alice"))));
await t("customer cannot claim to be offline", assertFails(setDoc(doc(mallory, "customers/mallory"), online("mallory", { channel: "offline", email: "mallory@example.com" }))));
await t("customer cannot add unknown fields", assertFails(setDoc(doc(mallory, "customers/mallory"), online("mallory", { creditDays: 999 }))));
await t("customer finds own profile by uid", assertSucceeds(getDocs(query(collection(alice, "customers"), where("uid", "==", "alice")))));
await t("customer updates own name", assertSucceeds(updateDoc(doc(alice, "customers/alice"), { name: "Alice K", updatedAt: serverTimestamp() })));
await t("customer cannot change channel", assertFails(updateDoc(doc(alice, "customers/alice"), { channel: "offline", updatedAt: serverTimestamp() })));
await t("customer cannot change uid", assertFails(updateDoc(doc(alice, "customers/alice"), { uid: "bob", updatedAt: serverTimestamp() })));
await t("other customer cannot read profile", assertFails(getDoc(doc(bob, "customers/alice"))));
await t("anonymous cannot read profile", assertFails(getDoc(doc(anon, "customers/alice"))));
await t("viewer staff can read customers", assertSucceeds(getDocs(collection(viewer, "customers"))));

// Customers added in the ERP, then claimed on the website
await t("staff add an offline customer (phone only)", assertSucceeds(setDoc(doc(worker, "customers/c-bob"), { name: "Bob", phone: "99999 99999", phoneE164: "+919999999999", channel: "offline", uid: null, accountStatus: "none", ...ts })));
await t("staff add an offline customer (email)", assertSucceeds(setDoc(doc(worker, "customers/c-carol"), { name: "Carol", email: "carol@example.com", channel: "offline", uid: null, accountStatus: "none", ...ts })));
await t("staff add a customer with a login made in the ERP", assertSucceeds(setDoc(doc(worker, "customers/c-dan"), { name: "Dan", email: "dan@example.com", channel: "offline", uid: "dan", accountStatus: "invited", ...ts })));
await t("staff keep the temporary password", assertSucceeds(setDoc(doc(worker, "customerInvites/c-dan"), { email: "dan@example.com", tempPassword: "Mango-1234" })));
await t("customers cannot read temporary passwords", assertFails(getDoc(doc(alice, "customerInvites/c-dan"))));
await t("phone sign-in finds their ERP record", assertSucceeds(getDocs(query(collection(bob, "customers"), where("uid", "==", null), where("phoneE164", "==", "+919999999999")))));
await t("phone sign-in cannot search other numbers", assertFails(getDocs(query(collection(bob, "customers"), where("uid", "==", null), where("phoneE164", "==", "+911111111111")))));
await t("phone sign-in claims their ERP record", assertSucceeds(updateDoc(doc(bob, "customers/c-bob"), { uid: "bob", accountStatus: "active", lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() })));
await t("claimed record can't be claimed again", assertFails(updateDoc(doc(carol, "customers/c-bob"), { uid: "carol", accountStatus: "active", updatedAt: serverTimestamp() })));
await t("verified email finds their ERP record", assertSucceeds(getDocs(query(collection(carol, "customers"), where("uid", "==", null), where("email", "==", "carol@example.com")))));
await t("unverified email cannot claim", assertFails(getDocs(query(collection(mallory, "customers"), where("uid", "==", null), where("email", "==", "carol@example.com")))));
await t("claim cannot change other fields", assertFails(updateDoc(doc(carol, "customers/c-carol"), { uid: "carol", accountStatus: "active", name: "Hacked", updatedAt: serverTimestamp() })));
await t("verified email claims their ERP record", assertSucceeds(updateDoc(doc(carol, "customers/c-carol"), { uid: "carol", accountStatus: "active", lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() })));
const dan = env.authenticatedContext("dan", { email: "dan@example.com", email_verified: false }).firestore();
await t("ERP-made login reads its record", assertSucceeds(getDocs(query(collection(dan, "customers"), where("uid", "==", "dan")))));
await t("ERP-made login marks itself active", assertSucceeds(updateDoc(doc(dan, "customers/c-dan"), { accountStatus: "active", lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() })));
await t("customer cannot set themselves back to invited", assertFails(updateDoc(doc(dan, "customers/c-dan"), { accountStatus: "invited", updatedAt: serverTimestamp() })));

// Orders
await t("customer places order", assertSucceeds(setDoc(doc(alice, "orders/o1"), order("alice", "alice"))));
await t("customer places order on their claimed ERP record", assertSucceeds(setDoc(doc(bob, "orders/o2"), order("bob", "c-bob"))));
await t("cannot order on someone else's customer record", assertFails(setDoc(doc(alice, "orders/o3"), order("alice", "c-bob"))));
await t("cannot place order for someone else", assertFails(setDoc(doc(alice, "orders/o3"), order("bob", "c-bob"))));
await t("website orders are online", assertFails(setDoc(doc(alice, "orders/o4"), order("alice", "alice", { channel: "offline" }))));
await t("cannot place order already confirmed", assertFails(setDoc(doc(alice, "orders/o4"), order("alice", "alice", { status: "confirmed" }))));
await t("cannot place empty order", assertFails(setDoc(doc(alice, "orders/o5"), order("alice", "alice", { items: [] }))));
await t("cannot add unknown order fields", assertFails(setDoc(doc(alice, "orders/o6"), order("alice", "alice", { discount: 100 }))));
await t("anonymous cannot order", assertFails(setDoc(doc(anon, "orders/o7"), order("alice", "alice"))));
await t("staff add a phone order", assertSucceeds(setDoc(doc(worker, "orders/o8"), { channel: "offline", source: "Phone call", customerId: "c-carol", customerUid: "carol", customer: { name: "Carol" }, items: [{ productId: "p1", qty: 1, price: 60 }], total: 60, status: "confirmed", ...ts })));
await t("staff cannot fake a website order", assertFails(setDoc(doc(worker, "orders/o9"), { channel: "online", customerUid: "x", customerId: "x", items: [{ qty: 1 }], total: 1, status: "placed", ...ts })));
await t("customer sees the phone order made for them", assertSucceeds(getDoc(doc(carol, "orders/o8"))));
await t("customer lists own orders", assertSucceeds(getDocs(query(collection(alice, "orders"), where("customerUid", "==", "alice")))));
await t("customer cannot list all orders", assertFails(getDocs(collection(alice, "orders"))));
await t("customer cannot read other's order", assertFails(getDoc(doc(alice, "orders/o2"))));
await t("customer cannot confirm own order", assertFails(updateDoc(doc(alice, "orders/o1"), { status: "confirmed", updatedAt: serverTimestamp() })));
await t("customer cannot change total", assertFails(updateDoc(doc(alice, "orders/o1"), { total: 1, updatedAt: serverTimestamp() })));
await t("viewer cannot update order", assertFails(updateDoc(doc(viewer, "orders/o1"), { status: "confirmed" })));
await t("manager lists all orders", assertSucceeds(getDocs(collection(manager, "orders"))));
await t("staff confirm and invoice an order", assertSucceeds(updateDoc(doc(worker, "orders/o1"), { status: "confirmed", invoiceId: "inv1", invoiceNumber: "INV-1", updatedAt: serverTimestamp(), updatedBy: "worker@gmail.com" })));
await t("staff cannot change where an order came from", assertFails(updateDoc(doc(worker, "orders/o1"), { channel: "offline" })));
await t("manager cannot reassign order owner", assertFails(updateDoc(doc(manager, "orders/o1"), { customerUid: "bob" })));
await t("customer cannot cancel confirmed order", assertFails(updateDoc(doc(alice, "orders/o1"), { status: "cancelled", updatedAt: serverTimestamp() })));
await t("customer cancels unconfirmed order", assertSucceeds(updateDoc(doc(bob, "orders/o2"), { status: "cancelled", updatedAt: serverTimestamp() })));
await t("manager cannot delete order", assertFails(deleteDoc(doc(manager, "orders/o1"))));
await t("owner can delete order", assertSucceeds(deleteDoc(doc(owner, "orders/o1"))));

// ERP-only records
await t("staff write an invoice", assertSucceeds(setDoc(doc(worker, "sales/s1"), { number: "INV-1", orderId: "o8", lines: [] })));
await t("viewer reads invoices", assertSucceeds(getDocs(collection(viewer, "sales"))));
await t("viewer cannot write invoices", assertFails(setDoc(doc(viewer, "sales/s2"), { number: "INV-2" })));
await t("staff cannot delete invoices", assertFails(deleteDoc(doc(worker, "sales/s1"))));
await t("manager deletes invoices", assertSucceeds(deleteDoc(doc(manager, "sales/s1"))));
await t("customers cannot read ERP records", assertFails(getDocs(collection(carol, "sales"))));
await t("staff cannot change business settings", assertFails(setDoc(doc(worker, "settings/business"), { name: "X" })));
await t("manager changes business settings", assertSucceeds(setDoc(doc(manager, "settings/business"), { name: "Oval Farms" })));
await t("staff read settings", assertSucceeds(getDoc(doc(worker, "settings/business"))));
await t("other collections closed", assertFails(getDoc(doc(owner, "secrets/x"))));

await env.cleanup();
console.log(fail ? `\n${fail} FAILED` : "\nAll rules tests passed");
process.exit(fail ? 1 : 0);
