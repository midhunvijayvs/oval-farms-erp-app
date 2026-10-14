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
const viewer = env.authenticatedContext("vw", { email: "viewer@gmail.com", email_verified: true }).firestore();
const fakeOwner = env.authenticatedContext("x", { email: "ovaleggfarm@gmail.com", email_verified: false }).firestore();
const alice = env.authenticatedContext("alice", { email: "alice@example.com", email_verified: false }).firestore();
const bob = env.authenticatedContext("bob", { phone_number: "+919999999999" }).firestore();
const anon = env.unauthenticatedContext().firestore();

const order = (uid, extra = {}) => ({
  customerUid: uid, customer: { name: "Alice", phone: "+91 98765 43210", email: "alice@example.com" },
  address: { line1: "12 MG Road", city: "Kochi", pincode: "682001" },
  items: [{ productId: "5", name: "Soup premix", qty: 2, unit: "pack", price: 60 }],
  itemCount: 2, subtotal: 120, deliveryCharge: 0, total: 120, payment: "cod", note: "",
  status: "placed", source: "website", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});
const customer = (extra = {}) => ({ name: "Alice", phone: "+91 98765 43210", email: "alice@example.com", addresses: [], source: "website", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });

// Staff list
await t("owner can add staff", setDoc(doc(owner, "staff/manager@gmail.com"), { email: "manager@gmail.com", name: "M", role: "manager" }));
await t("owner can add viewer", setDoc(doc(owner, "staff/viewer@gmail.com"), { email: "viewer@gmail.com", name: "V", role: "viewer" }));
await t("unverified owner email is not owner", assertFails(setDoc(doc(fakeOwner, "staff/x@gmail.com"), { email: "x@gmail.com", role: "admin" })));
await t("manager cannot change staff", assertFails(setDoc(doc(manager, "staff/manager@gmail.com"), { email: "manager@gmail.com", role: "admin" })));
await t("customer cannot read staff", assertFails(getDoc(doc(alice, "staff/manager@gmail.com"))));
await t("staff can read own staff doc", assertSucceeds(getDoc(doc(viewer, "staff/viewer@gmail.com"))));
await t("bad role rejected", assertFails(setDoc(doc(owner, "staff/z@gmail.com"), { email: "z@gmail.com", role: "boss" })));

// Customers
await t("customer creates own profile", assertSucceeds(setDoc(doc(alice, "customers/alice"), customer())));
await t("customer cannot create someone else's profile", assertFails(setDoc(doc(alice, "customers/bob"), customer())));
await t("customer cannot add unknown fields", assertFails(setDoc(doc(bob, "customers/bob"), customer({ creditLimit: 99999 }))));
await t("customer updates own name", assertSucceeds(updateDoc(doc(alice, "customers/alice"), { name: "Alice K", updatedAt: serverTimestamp() })));
await t("customer cannot change source", assertFails(updateDoc(doc(alice, "customers/alice"), { source: "erp", updatedAt: serverTimestamp() })));
await t("other customer cannot read profile", assertFails(getDoc(doc(bob, "customers/alice"))));
await t("anonymous cannot read profile", assertFails(getDoc(doc(anon, "customers/alice"))));
await t("viewer staff can read customers", assertSucceeds(getDocs(collection(viewer, "customers"))));

// Orders
await t("customer places order", assertSucceeds(setDoc(doc(alice, "orders/o1"), order("alice"))));
await t("phone-only customer places order", assertSucceeds(setDoc(doc(bob, "orders/o2"), order("bob"))));
await t("cannot place order for someone else", assertFails(setDoc(doc(alice, "orders/o3"), order("bob"))));
await t("cannot place order already confirmed", assertFails(setDoc(doc(alice, "orders/o4"), order("alice", { status: "confirmed" }))));
await t("cannot place empty order", assertFails(setDoc(doc(alice, "orders/o5"), order("alice", { items: [] }))));
await t("cannot add unknown order fields", assertFails(setDoc(doc(alice, "orders/o6"), order("alice", { discount: 100 }))));
await t("anonymous cannot order", assertFails(setDoc(doc(anon, "orders/o7"), order("alice"))));
await t("customer lists own orders", assertSucceeds(getDocs(query(collection(alice, "orders"), where("customerUid", "==", "alice")))));
await t("customer cannot list all orders", assertFails(getDocs(collection(alice, "orders"))));
await t("customer cannot read other's order", assertFails(getDoc(doc(alice, "orders/o2"))));
await t("customer cannot confirm own order", assertFails(updateDoc(doc(alice, "orders/o1"), { status: "confirmed", updatedAt: serverTimestamp() })));
await t("customer cannot change total", assertFails(updateDoc(doc(alice, "orders/o1"), { total: 1, updatedAt: serverTimestamp() })));
await t("viewer cannot update order", assertFails(updateDoc(doc(viewer, "orders/o1"), { status: "confirmed" })));
await t("manager lists all orders", assertSucceeds(getDocs(collection(manager, "orders"))));
await t("manager confirms order", assertSucceeds(updateDoc(doc(manager, "orders/o1"), { status: "confirmed", updatedAt: serverTimestamp(), updatedBy: "manager@gmail.com" })));
await t("manager cannot reassign order owner", assertFails(updateDoc(doc(manager, "orders/o1"), { customerUid: "bob" })));
await t("customer cannot cancel confirmed order", assertFails(updateDoc(doc(alice, "orders/o1"), { status: "cancelled", updatedAt: serverTimestamp() })));
await t("customer cancels unconfirmed order", assertSucceeds(updateDoc(doc(bob, "orders/o2"), { status: "cancelled", updatedAt: serverTimestamp() })));
await t("manager cannot delete order", assertFails(deleteDoc(doc(manager, "orders/o1"))));
await t("owner can delete order", assertSucceeds(deleteDoc(doc(owner, "orders/o1"))));
await t("other collections closed", assertFails(getDoc(doc(owner, "secrets/x"))));

await env.cleanup();
console.log(fail ? `\n${fail} FAILED` : "\nAll rules tests passed");
process.exit(fail ? 1 : 0);
