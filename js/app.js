// App entry: splash -> Google sign-in -> team check -> shell with navigation and routes.
import { store } from "./store.js";
import { googleToken } from "./google.js";
import { session, can, touchStaff, ROLES, currentRole, userKey } from "./session.js";
import { schemas } from "./schema.js";
import { icon } from "./icons.js";
import { esc } from "./util.js";
import { toast } from "./ui.js";
import { route, startRouter, render as renderRoute, navigate, currentPath } from "./router.js";
import * as firebase from "./firebase.js";
import { ordersView, orderDetailView, orderEditor } from "./views/orders.js";
import { listView, openForm } from "./views/crud.js";
import { dashboardView } from "./views/dashboard.js";
import { docList, docEditor, docView } from "./views/docs.js";
import { productionList, productionEditor } from "./views/production.js";
import { stockView } from "./views/stock.js";
import { attendanceView } from "./views/attendance.js";
import { reportsView } from "./views/reports.js";
import { settingsView, applyTheme } from "./views/settings.js";
import { seedDemo } from "./seed.js";
import { seedWebsiteProducts } from "./seed-products.js";

window.OVAL_VERSION = "2.0.5";
const cfg = window.OVAL_CONFIG || {};
const LS = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const app = document.getElementById("app");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- navigation ----------------
const NAV = [
  { items: [{ href: "#/dashboard", label: "Dashboard", ic: "home" }] },
  { section: "Production", items: [
    { href: "#/batches", label: "Grow Batches", ic: "sprout" },
    { href: "#/harvests", label: "Harvests", ic: "basket" },
    { href: "#/production", label: "Processing", ic: "flask" },
  ] },
  { section: "Inventory", items: [
    { href: "#/stock", label: "Stock", ic: "layers" },
    { href: "#/products", label: "Products & Materials", ic: "box" },
    { href: "#/adjustments", label: "Adjustments", ic: "sliders" },
  ] },
  { section: "Sales", items: [
    { href: "#/orders", label: "Orders", ic: "cart", badge: "orders" },
    { href: "#/sales", label: "Invoices", ic: "file" },
    { href: "#/customers", label: "Customers", ic: "users" },
  ] },
  { section: "Purchases", perm: "finance", items: [
    { href: "#/purchases", label: "Purchase Bills", ic: "bag" },
    { href: "#/suppliers", label: "Suppliers", ic: "truck" },
  ] },
  { section: "Finance", perm: "finance", items: [
    { href: "#/expenses", label: "Expenses", ic: "receipt" },
    { href: "#/payments", label: "Payments", ic: "wallet" },
  ] },
  { section: "People", items: [
    { href: "#/attendance", label: "Attendance", ic: "calendar" },
    { href: "#/employees", label: "Employees", ic: "id" },
    { href: "#/tasks", label: "Tasks", ic: "check" },
  ] },
  { section: "Insights", perm: "reports", items: [{ href: "#/reports", label: "Reports", ic: "chart" }] },
  { items: [{ href: "#/settings", label: "Settings", ic: "settings" }] },
];
const BOTTOM = [
  { href: "#/dashboard", label: "Home", ic: "home" },
  { href: "#/orders", label: "Orders", ic: "cart" },
  { href: "#/sales", label: "Invoices", ic: "file" },
  { href: "#/stock", label: "Stock", ic: "layers" },
];

function setupRoutes() {
  const fin = () => can("finance");
  const crud = (key, allow) => {
    const v = listView(key);
    route("/" + key, {
      title: v.title,
      render(root, params) {
        v.render(root);
        if (params.query.new && can("write")) {
          history.replaceState(null, "", "#/" + key);
          openForm(key);
        }
      },
    }, { allow });
  };
  route("/dashboard", dashboardView);
  crud("batches"); crud("harvests"); crud("products"); crud("adjustments"); crud("customers");
  crud("suppliers", fin); crud("expenses", fin); crud("payments", fin);
  crud("employees"); crud("tasks");
  route("/production", productionList);
  route("/production/new", productionEditor);
  route("/production/:id", productionEditor);
  route("/stock", stockView);
  route("/attendance", attendanceView);
  for (const kind of ["sales", "purchases"]) {
    const allow = kind === "purchases" ? fin : undefined;
    route(`/${kind}`, docList(kind), { allow });
    route(`/${kind}/new`, docEditor(kind), { allow });
    route(`/${kind}/:id/edit`, docEditor(kind), { allow });
    route(`/${kind}/:id`, docView(kind), { allow });
  }
  route("/orders", ordersView);
  route("/orders/new", orderEditor);
  route("/orders/:id/edit", orderEditor);
  route("/orders/:id", orderDetailView);
  // Old addresses from before products and customers were merged.
  route("/items", { title: "", render() { navigate("#/products", true); } });
  route("/web-customers", { title: "", render() { navigate("#/customers", true); } });
  route("/reports", reportsView, { allow: () => can("reports") });
  route("/settings", settingsView);
}

// ---------------- screens ----------------
function hideSplash() {
  const s = document.getElementById("splash");
  if (!s) return;
  s.classList.add("hide");
  setTimeout(() => s.remove(), 600);
}

function authScreen(inner) {
  app.innerHTML = `<div class="auth">
    <div class="auth-card">
      <img src="assets/logo.png" alt="Oval Farmtech" class="auth-logo">
      <h1>Oval Farms ERP</h1>
      ${inner}
    </div>
    <p class="auth-foot">Your data is kept in the Oval Farms Firebase database, shared with ovalfarm.in.</p>
  </div>`;
}

function showLogin(message = "") {
  const hint = LS.get("ovalerp_hint");
  authScreen(`
    <p class="muted">Production, stock, orders, sales and accounts for Oval Farms, shared by the whole team.</p>
    ${message ? `<p class="auth-msg">${esc(message)}</p>` : ""}
    ${firebase.configured() ? `<button class="btn btn-google" data-signin>${googleG()}<span>${hint ? "Continue as " + esc(hint) : "Sign in with Google"}</span></button>
    ${hint ? `<button class="btn btn-link" data-other>Use a different Google account</button>` : ""}` : `<p class="auth-msg">Firebase isn't set up in config.js yet.</p>`}
    <div class="auth-or"><span>or</span></div>
    <button class="btn btn-ghost" data-demo>${icon("sprout")}Explore with sample data</button>
  `);
  const si = app.querySelector("[data-signin]");
  if (si) si.addEventListener("click", () => signIn(hint || ""));
  const other = app.querySelector("[data-other]");
  if (other) other.addEventListener("click", () => { LS.del("ovalerp_hint"); signIn(""); });
  app.querySelector("[data-demo]").addEventListener("click", enterDemo);
}

function googleG() {
  return `<svg viewBox="0 0 48 48" class="g-logo" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>`;
}

async function signIn(hint) {
  const btn = app.querySelector("[data-signin]");
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "Opening Google…"; }
  try {
    await firebase.init();
    const token = cfg.FIREBASE_EMULATORS ? (cfg.FIREBASE_EMULATORS.signInAs || prompt("Test email")) : await googleToken(hint);
    const user = await firebase.signInWithGoogleToken(token);
    await afterSignIn(user);
  } catch (e) {
    showLogin(e.message === "Superseded" ? "" : e.message);
  }
}

async function afterSignIn(user) {
  session.user = { email: userKey(user.email), name: user.displayName || user.email, picture: user.photoURL || "" };
  session.mode = "firebase";
  LS.set("ovalerp_hint", session.user.email);
  LS.set("ovalerp_mode", "firebase");
  authScreen(`<div class="loader"></div><p class="muted">Opening Oval Farms data…</p>`);
  let me;
  try { me = await firebase.staffRecord(session.user.email); }
  catch (e) { return showLogin("Couldn't reach the database: " + e.message); }
  if (!me) return showNoAccess();
  session.role = me.role;
  await store.open("firebase", session.user, firebase.backend);
  await firebase.startSync();
  touchStaff();
  if (can("admin") && !store.all("products").length) {
    const n = seedWebsiteProducts();
    if (n) toast(`Added the ${n} products from ovalfarm.in to Products & Materials`);
  }
  mountShell();
}

function showNoAccess() {
  authScreen(`
    <p class="muted">Signed in as <b>${esc(session.user.email)}</b></p>
    <p class="auth-msg">This Google account isn't on the Oval Farms team yet.</p>
    <p class="small muted left">Ask the Oval Farms admin to add <b>${esc(session.user.email)}</b> under Settings → Team, then tap Try again.</p>
    <button class="btn btn-primary btn-block" data-retry>${icon("refresh")}Try again</button>
    <button class="btn btn-link" data-signout>Use a different Google account</button>
  `);
  app.querySelector("[data-retry]").addEventListener("click", async () => {
    const u = await firebase.currentUser();
    if (u) afterSignIn(u); else showLogin();
  });
  app.querySelector("[data-signout]").addEventListener("click", signOut);
}

async function enterDemo() {
  session.mode = "demo";
  session.user = { email: "demo@ovalfarms.local", name: "Demo User", picture: "" };
  LS.set("ovalerp_mode", "demo");
  await store.open("demo", session.user);
  if (!store.all("products").length) seedDemo();
  mountShell();
}

async function signOut() {
  await store.flush();
  if (session.mode === "firebase") await firebase.signOut();
  LS.del("ovalerp_mode");
  session.user = null;
  location.hash = "";
  location.reload();
}

session.actions = { signOut };

// ---------------- shell ----------------
let shellMounted = false;

function navHtml() {
  return NAV.filter((g) => !g.perm || can(g.perm)).map((g) => `
    ${g.section ? `<div class="nav-section">${g.section}</div>` : ""}
    ${g.items.map((i) => `<a href="${i.href}" class="nav-link" data-nav="${i.href}">${icon(i.ic)}<span>${i.label}</span>${i.badge ? `<b class="nav-badge" data-badge="${i.badge}" hidden></b>` : ""}</a>`).join("")}`).join("");
}

function mountShell() {
  shellMounted = true;
  const u = session.user || {};
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img src="assets/icon-192.png" alt=""><div><b>Oval Farms</b><span>ERP</span></div></div>
        <nav class="nav" id="nav">${navHtml()}</nav>
        <div class="sidebar-foot">
          <button class="install-btn" id="installBtn" hidden>${icon("install")}<span>Install app</span></button>
          <a class="me" href="#/settings?tab=data">
            ${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc((u.name || "?")[0])}</span>`}
            <div><b>${esc(u.name || "")}</b><small id="meRole">${session.mode === "demo" ? "Demo mode" : esc(ROLES[currentRole()].label)}</small></div>
          </a>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn only-sm" id="menuBtn" aria-label="Menu">${icon("menu")}</button>
          <div class="top-title" id="topTitle"></div>
          <button class="sync-pill" id="syncPill"></button>
        </header>
        <main class="content" id="view"></main>
      </div>
      <nav class="bottom-nav">
        ${BOTTOM.map((b) => `<a href="${b.href}" data-nav="${b.href}">${icon(b.ic)}<span>${b.label}</span></a>`).join("")}
        <button id="moreBtn">${icon("grid")}<span>More</span></button>
      </nav>
    </div>`;

  const sidebar = document.getElementById("sidebar");
  const openNav = (open) => { sidebar.classList.toggle("open", open); document.getElementById("scrim").classList.toggle("show", open); };
  document.getElementById("menuBtn").addEventListener("click", () => openNav(true));
  document.getElementById("moreBtn").addEventListener("click", () => openNav(true));
  document.getElementById("scrim").addEventListener("click", () => openNav(false));
  sidebar.addEventListener("click", (e) => { if (e.target.closest("a")) openNav(false); });
  document.getElementById("syncPill").addEventListener("click", onPillClick);
  const ib = document.getElementById("installBtn");
  ib.hidden = !session.installPrompt;
  ib.addEventListener("click", async () => {
    if (!session.installPrompt) return;
    session.installPrompt.prompt();
    await session.installPrompt.userChoice;
    session.installPrompt = null; ib.hidden = true;
  });

  startRouter(document.getElementById("view"), (hit) => {
    const path = "#" + hit.path;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const href = a.dataset.nav;
      a.classList.toggle("active", path === href || path.startsWith(href + "/"));
    });
    const title = hit.r.view.title || "";
    document.getElementById("topTitle").textContent = title;
    document.title = (title ? title + " · " : "") + "Oval Farms ERP";
  });

  let lastRole = currentRole();
  let pending = 0;
  let stale = false;
  const typing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest("#view") && a.matches("input, textarea, select")); };
  // Changes from other people wait while someone is typing on the page, then the page redraws.
  document.getElementById("view").addEventListener("focusout", () => setTimeout(() => { if (stale && !typing()) { stale = false; renderRoute(true); } }, 0));
  store.on((meta) => {
    if (meta && meta.type === "remote" && typing()) { stale = true; return; }
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      // Role or permissions may have changed after a sync.
      const role = currentRole();
      if (role !== lastRole) {
        lastRole = role;
        document.getElementById("nav").innerHTML = navHtml();
        document.getElementById("meRole").textContent = ROLES[role].label;
        drawBadges();
      }
      renderRoute(true);
    });
  });
  firebase.onFirebase(onFirebaseChange);
  watchOrders();
  drawBadges();
  drawPill();
}

// New orders from the website: badge on the menu and a message for whoever has the ERP open.
let knownOrders = null;
function watchOrders() {
  knownOrders = new Set(store.all("orders").map((o) => o.id));
  store.on((meta) => {
    if (!meta || meta.collection !== "orders") return;
    drawBadges();
    if (meta.type !== "remote") { for (const o of store.all("orders")) knownOrders.add(o.id); return; }
    const fresh = store.all("orders").filter((o) => !knownOrders.has(o.id));
    for (const o of fresh) knownOrders.add(o.id);
    for (const o of fresh.filter((x) => x.channel === "online" && x.status === "placed").slice(0, 3)) toast(`New online order from ${(o.customer && o.customer.name) || "a customer"}`);
  });
}

function drawBadges() {
  const n = store.all("orders").filter((o) => o.status === "placed").length;
  document.querySelectorAll('[data-badge="orders"]').forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); });
}

function onFirebaseChange(what) {
  if (what.type === "error") toast(what.message, "error");
  drawPill();
}

function drawPill() {
  const pill = document.getElementById("syncPill");
  if (!pill) return;
  const s = firebase.fbState;
  let cls = "ok", ic = "cloud", text = "Saved";
  if (session.mode === "demo") { cls = "muted"; ic = "sprout"; text = "Demo data"; }
  else if (s.status === "offline") { cls = "warn"; ic = "cloudOff"; text = "Offline"; }
  else if (s.status === "saving") { cls = "busy"; ic = "refresh"; text = "Saving…"; }
  else if (s.status === "error") { cls = "danger"; ic = "alert"; text = "Problem"; }
  pill.className = "sync-pill " + cls;
  pill.innerHTML = icon(ic) + `<span>${text}</span>`;
  pill.title = session.mode === "demo" ? "Demo mode: data is stored only in this browser" :
    s.status === "offline" ? "You're offline. Changes are kept on this device and saved when you're back online." :
    s.status === "saving" ? "Saving your changes…" : s.error || "Everything is saved";
}

function onPillClick() {
  if (session.mode === "demo") return navigate("#/settings?tab=data");
  const s = firebase.fbState;
  toast(s.status === "offline" ? "You're offline. Changes will save when you're back online." : s.status === "saving" ? "Saving…" : s.error || "Everything is saved", s.error ? "error" : "ok");
}

// ---------------- boot ----------------
async function boot() {
  applyTheme();
  setupRoutes();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    session.installPrompt = e;
    const ib = document.getElementById("installBtn");
    if (ib) ib.hidden = false;
  });

  const minSplash = sleep(1500);
  const mode = LS.get("ovalerp_mode");
  if (mode === "demo") {
    await minSplash;
    await enterDemo();
    hideSplash();
    return;
  }
  if (mode === "firebase" && firebase.configured()) {
    // Firebase remembers who signed in on this device.
    try {
      await firebase.init();
      const user = await Promise.race([firebase.currentUser(), sleep(8000).then(() => null)]);
      if (user) {
        await minSplash;
        hideSplash();
        await afterSignIn(user);
        return;
      }
    } catch (e) { console.warn("Restoring the session failed", e); }
  }
  await minSplash;
  showLogin();
  hideSplash();
}

window.addEventListener("pagehide", () => { store.flush(); });
boot();

// Expose for debugging in the browser console.
window.__oval = { store, schemas, userKey, firebase };
