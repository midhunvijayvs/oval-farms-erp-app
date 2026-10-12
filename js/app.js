// App entry: splash -> sign-in -> data folder -> shell with navigation and routes.
import { store } from "./store.js";
import * as drive from "./drive.js";
import { startDrive, startDemo, stop as stopSync, onSync, syncNow, syncState } from "./sync.js";
import { session, can, registerUser, ROLES, currentRole, userKey } from "./session.js";
import { schemas } from "./schema.js";
import { icon } from "./icons.js";
import { esc, relTime } from "./util.js";
import { toast } from "./ui.js";
import { route, startRouter, render as renderRoute, navigate } from "./router.js";
import { listView, openForm } from "./views/crud.js";
import { dashboardView } from "./views/dashboard.js";
import { docList, docEditor, docView } from "./views/docs.js";
import { productionList, productionEditor } from "./views/production.js";
import { stockView } from "./views/stock.js";
import { attendanceView } from "./views/attendance.js";
import { reportsView } from "./views/reports.js";
import { settingsView, applyTheme } from "./views/settings.js";
import { seedDemo } from "./seed.js";

window.OVAL_VERSION = "1.0.2";
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
    { href: "#/items", label: "Products & Materials", ic: "box" },
    { href: "#/adjustments", label: "Adjustments", ic: "sliders" },
  ] },
  { section: "Sales", items: [
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
  { href: "#/sales", label: "Sales", ic: "file" },
  { href: "#/harvests", label: "Harvest", ic: "basket" },
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
  crud("batches"); crud("harvests"); crud("items"); crud("adjustments"); crud("customers");
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
    <p class="auth-foot">Your data stays in the Oval Farms Google Drive.</p>
  </div>`;
}

function showLogin(message = "") {
  const hint = LS.get("ovalerp_hint");
  authScreen(`
    <p class="muted">Production, stock, sales and accounts for Oval Farms, shared by the whole team.</p>
    ${message ? `<p class="auth-msg">${esc(message)}</p>` : ""}
    <button class="btn btn-google" data-signin>${googleG()}<span>${hint ? "Continue as " + esc(hint) : "Sign in with Google"}</span></button>
    ${hint ? `<button class="btn btn-link" data-other>Use a different Google account</button>` : ""}
    <div class="auth-or"><span>or</span></div>
    <button class="btn btn-ghost" data-demo>${icon("sprout")}Explore with sample data</button>
  `);
  app.querySelector("[data-signin]").addEventListener("click", () => signIn(hint || ""));
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
    await drive.requestToken({ interactive: true, hint });
    await afterToken();
  } catch (e) {
    showLogin(e.message === "Superseded" ? "" : e.message);
  }
}

async function afterToken() {
  const info = await drive.userInfo();
  session.user = { email: info.email, name: info.name || info.email, picture: info.picture || "" };
  session.mode = "drive";
  LS.set("ovalerp_hint", info.email);
  LS.set("ovalerp_mode", "drive");
  const folder = cfg.DEFAULT_FOLDER_ID || LS.get("ovalerp_folder");
  if (folder) await connectFolder(folder);
  else showFolderSetup();
}

function showFolderSetup(error = "") {
  authScreen(`
    <p class="muted">Signed in as <b>${esc(session.user.email)}</b></p>
    ${error ? `<p class="auth-msg">${esc(error)}</p>` : ""}
    <div class="field left"><label for="folderLink">Oval Farms data folder link</label>
      <input id="folderLink" placeholder="https://drive.google.com/drive/folders/…" autocomplete="off"></div>
    <button class="btn btn-primary btn-block" data-connect>${icon("folder")}Connect to shared data</button>
    <p class="small muted left">Ask the Oval Farms admin for the folder link (or the invite link). The folder must be shared with ${esc(session.user.email)}.</p>
    <div class="auth-or"><span>first time setup</span></div>
    <button class="btn btn-ghost btn-block" data-create>${icon("plus")}Create the Oval Farms ERP folder in this Drive</button>
    <p class="small muted left">Do this once, signed in with the Oval Farms Google account. You become the Admin and can then share the folder with your team.</p>
    <button class="btn btn-link" data-signout>Sign out</button>
  `);
  const inp = app.querySelector("#folderLink");
  app.querySelector("[data-connect]").addEventListener("click", () => {
    const id = drive.parseFolderId(inp.value);
    if (!id) { inp.classList.add("invalid"); return toast("Paste the Google Drive folder link", "error"); }
    connectFolder(id);
  });
  app.querySelector("[data-create]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const f = await drive.createFolder("Oval Farms ERP");
      toast("Folder created in your Google Drive");
      await connectFolder(f.id);
    } catch (err) { showFolderSetup(err.message); }
  });
  app.querySelector("[data-signout]").addEventListener("click", signOut);
}

async function connectFolder(folderId) {
  authScreen(`<div class="loader"></div><p class="muted">Opening Oval Farms data…</p>`);
  try {
    const f = await drive.getFile(folderId);
    if (f.mimeType !== "application/vnd.google-apps.folder") return showFolderSetup("That link is a file, not a folder. Paste the link of the Oval Farms ERP folder.");
    if (f.capabilities && f.capabilities.canAddChildren === false) toast("You have view-only access to this folder. Ask the admin for Editor access to make changes.", "error");
  } catch (e) {
    if (e instanceof drive.AuthError) return showLogin(e.message);
    if (e.status === 404 || e.status === 403) {
      LS.del("ovalerp_folder");
      return showFolderSetup(`This Google account (${session.user.email}) can't open that folder. Ask the Oval Farms admin to share it with you as Editor.`);
    }
    // Network trouble: carry on with what's cached on this device.
  }
  LS.set("ovalerp_folder", folderId);
  await store.open(folderId, session.user);
  mountShell();
  startDrive(folderId).then(() => { if (syncState.status === "idle") registerUser(); });
}

async function enterDemo() {
  session.mode = "demo";
  session.user = { email: "demo@ovalfarms.local", name: "Demo User", picture: "" };
  LS.set("ovalerp_mode", "demo");
  await store.open("demo", session.user);
  if (!store.all("items").length) seedDemo();
  await startDemo();
  mountShell();
}

async function signOut() {
  await store.flush();
  stopSync();
  drive.signOut();
  LS.del("ovalerp_mode");
  session.user = null;
  location.hash = "";
  location.reload();
}

function switchFolder() {
  stopSync();
  LS.del("ovalerp_folder");
  showFolderSetup();
}

session.actions = { signOut, switchFolder };

// ---------------- shell ----------------
let shellMounted = false;

function navHtml() {
  return NAV.filter((g) => !g.perm || can(g.perm)).map((g) => `
    ${g.section ? `<div class="nav-section">${g.section}</div>` : ""}
    ${g.items.map((i) => `<a href="${i.href}" class="nav-link" data-nav="${i.href}">${icon(i.ic)}<span>${i.label}</span></a>`).join("")}`).join("");
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
  store.on(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      // Role or permissions may have changed after a sync.
      const role = currentRole();
      if (role !== lastRole) {
        lastRole = role;
        document.getElementById("nav").innerHTML = navHtml();
        document.getElementById("meRole").textContent = ROLES[role].label;
      }
      renderRoute(true);
    });
  });
  onSync(drawPill);
}

function drawPill(s) {
  const pill = document.getElementById("syncPill");
  if (!pill) return;
  let cls = "ok", ic = "cloud", text = "Synced";
  if (s.mode === "demo") { cls = "muted"; ic = "sprout"; text = "Demo data"; }
  else if (s.status === "syncing") { cls = "busy"; ic = "refresh"; text = "Syncing…"; }
  else if (s.status === "offline") { cls = "warn"; ic = "cloudOff"; text = "Offline"; }
  else if (s.status === "error") { cls = "danger"; ic = "alert"; text = "Sync problem"; }
  else if (s.status === "auth") { cls = "danger"; ic = "refresh"; text = "Reconnect"; }
  pill.className = "sync-pill " + cls;
  pill.innerHTML = icon(ic) + `<span>${text}</span>`;
  pill.title = s.mode === "demo" ? "Demo mode: data is stored only in this browser" :
    s.status === "offline" ? "You're offline. Changes are saved on this device and will sync when you're back online." :
    s.error ? s.error : s.lastSync ? "Last synced " + relTime(s.lastSync) : "";
}

async function onPillClick() {
  if (syncState.mode === "demo") return navigate("#/settings?tab=data");
  if (syncState.status === "auth") {
    try { await drive.requestToken({ interactive: true, hint: LS.get("ovalerp_hint") || "" }); await syncNow(); toast("Reconnected"); }
    catch (e) { toast(e.message, "error"); }
    return;
  }
  if (syncState.status === "error") toast(syncState.error || "Sync problem", "error");
  await syncNow();
  if (syncState.status === "idle") registerUser();
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

  const params = new URLSearchParams(location.search);
  const invite = params.get("folder");
  if (invite) {
    LS.set("ovalerp_folder", drive.parseFolderId(invite) || invite);
    if (LS.get("ovalerp_mode") === "demo") LS.del("ovalerp_mode");
    history.replaceState(null, "", location.pathname + location.hash);
  }

  const minSplash = sleep(1500);
  const mode = LS.get("ovalerp_mode");
  if (mode === "demo") {
    await minSplash;
    await enterDemo();
    hideSplash();
    return;
  }
  if (mode === "drive" && LS.get("ovalerp_hint")) {
    // Try to restore the session quietly; fall back to the sign-in button.
    const quiet = Promise.race([
      drive.requestToken({ interactive: false, hint: LS.get("ovalerp_hint") }),
      sleep(7000).then(() => { throw new Error("timeout"); }),
    ]);
    try {
      await quiet;
      await minSplash;
      hideSplash();
      await afterToken();
      return;
    } catch (e) { /* show login */ }
  }
  await minSplash;
  showLogin(invite ? "You've been invited to Oval Farms ERP. Sign in with the Google account the folder was shared with." : "");
  hideSplash();
}

window.addEventListener("pagehide", () => { store.flush(); });
boot();

// Expose for debugging in the browser console.
window.__oval = { store, syncState, schemas, userKey };
