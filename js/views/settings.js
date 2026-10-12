// Settings: business profile, team & roles, dropdown lists, data/sync, appearance.
import { store } from "../store.js";
import { DEFAULT_LISTS, list } from "../schema.js";
import { can, session, ROLES, currentRole } from "../session.js";
import { syncState, syncNow } from "../sync.js";
import { mergeDb } from "../merge.js";
import { esc, fmtDate, relTime, today, downloadFile } from "../util.js";
import { icon } from "../icons.js";
import { pageHead, toast, confirmDialog } from "../ui.js";

const st = { tab: "business" };
const LIST_LABELS = {
  itemCategories: "Item categories", units: "Units", mushroomTypes: "Mushroom types", substrates: "Substrates",
  rooms: "Rooms / sheds", customerTypes: "Customer types", expenseCategories: "Expense categories",
  paymentModes: "Payment modes", adjustmentReasons: "Stock adjustment reasons", employeeRoles: "Employee roles",
};
const BIZ = [
  { k: "name", l: "Business name", ph: "Oval Farms" },
  { k: "phone", l: "Phone", half: true },
  { k: "email", l: "Email", half: true },
  { k: "address", l: "Address", area: true },
  { k: "gstin", l: "GSTIN", half: true },
  { k: "fssai", l: "FSSAI licence no.", half: true },
  { k: "invoicePrefix", l: "Invoice number prefix", half: true, ph: "INV" },
  { k: "upi", l: "UPI ID (shown on invoices)", half: true, ph: "ovalfarms@upi" },
  { k: "bank", l: "Bank details (shown on invoices)", area: true, ph: "A/c name, A/c no., IFSC, Branch" },
  { k: "terms", l: "Invoice terms", area: true, ph: "Goods once sold will not be taken back. Fresh mushrooms: keep refrigerated." },
];

export function getTheme() { try { return localStorage.getItem("ovalerp_theme") || "system"; } catch (e) { return "system"; } }
export function applyTheme(t = getTheme()) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

function tabBusiness() {
  const s = store.settings();
  const ro = !can("delete");
  return `<div class="card"><form class="form-grid" data-biz ${ro ? "inert" : ""}>
    ${BIZ.map((f) => `<div class="field ${f.half ? "half" : ""}"><label>${f.l}</label>${f.area ? `<textarea name="${f.k}" rows="2" placeholder="${esc(f.ph || "")}">${esc(s[f.k] || "")}</textarea>` : `<input name="${f.k}" value="${esc(s[f.k] || "")}" placeholder="${esc(f.ph || "")}">`}</div>`).join("")}
  </form>${ro ? `<p class="muted small">Only admins and managers can change the business profile.</p>` : `<div class="form-actions"><button class="btn btn-primary" data-savebiz>${icon("tick")}Save profile</button></div>`}</div>`;
}

function tabTeam() {
  const users = store.all("users").sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const admin = can("admin");
  return `
    <div class="card info-card">${icon("shield")}<div>
      <b>Who can use the app?</b>
      <p class="muted">Anyone the Oval Farms data folder is shared with (as <b>Editor</b>) in Google Drive. Share the folder, then send them the invite link from the <a href="#/settings" data-tab-link="data">Data & sync</a> tab. They appear here after their first sign-in. To remove someone, un-share the folder in Google Drive.</p>
      <p class="muted">The first person to sign in becomes Admin. New people join as Staff.</p>
    </div></div>
    <div class="card card-flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Last active</th></tr></thead><tbody>
      ${users.length ? users.map((u) => `<tr><td class="primary" data-label="Person"><div class="person">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc((u.name || u.email)[0])}</span>`}<div><b>${esc(u.name || "")}</b><small class="muted">${esc(u.email)}</small></div></div></td>
        <td data-label="Role">${admin && u.email !== (session.user && session.user.email) ? `<select data-role="${u.id}">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${r.label}</option>`).join("")}</select>` : esc((ROLES[u.role] || ROLES.staff).label)}</td>
        <td data-label="Last active">${fmtDate(u.lastSeen)}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">Team members appear here after they sign in.</td></tr>`}
    </tbody></table></div></div>
    <div class="card"><h3>What each role can do</h3>
      <ul class="role-list">
        <li><b>Admin</b> · everything, including changing roles.</li>
        <li><b>Manager</b> · everything except changing roles.</li>
        <li><b>Staff</b> · production, harvests, stock, sales and attendance. Cannot see expenses, payments list or reports, and cannot delete.</li>
        <li><b>Viewer</b> · can look at everything, cannot change anything.</li>
      </ul>
      <p class="muted small">Roles control what the app shows. The Drive folder sharing is what actually grants access to the data.</p>
    </div>`;
}

function tabLists() {
  const ro = !can("delete");
  return `<p class="muted">One option per line. These feed the dropdowns across the app.</p>
    <div class="lists-grid" ${ro ? "inert" : ""}>${Object.keys(DEFAULT_LISTS).map((k) => `<div class="card"><label class="field"><span class="lbl">${LIST_LABELS[k] || k}</span><textarea rows="6" data-list="${k}">${esc(list(k).join("\n"))}</textarea></label></div>`).join("")}</div>
    ${ro ? "" : `<div class="form-actions"><button class="btn btn-ghost" data-resetlists>Restore defaults</button><button class="btn btn-primary" data-savelists>${icon("tick")}Save lists</button></div>`}`;
}

function tabData() {
  const demo = session.mode === "demo";
  const invite = syncState.folderId ? `${location.origin}${location.pathname}?folder=${syncState.folderId}` : "";
  return `
    <div class="card">
      <div class="card-head"><h3>${icon(demo ? "cloudOff" : "cloud")} ${demo ? "Demo mode" : "Shared Google Drive data"}</h3></div>
      ${demo ? `<p class="muted">You're exploring with sample data stored only in this browser. Sign in with Google to use the real, shared Oval Farms data.</p>
        <div class="form-actions"><button class="btn btn-primary" data-signout>${icon("logout")}Leave demo and sign in</button></div>` : `
        <div class="kv-row"><span>Signed in as</span><b>${esc(session.user ? session.user.email : "")}</b></div>
        <div class="kv-row"><span>Your role</span><b>${esc(ROLES[currentRole()].label)}</b></div>
        <div class="kv-row"><span>Data folder</span><a href="https://drive.google.com/drive/folders/${esc(syncState.folderId)}" target="_blank" rel="noopener">${icon("folder")} Open in Google Drive</a></div>
        <div class="kv-row"><span>Last synced</span><b>${syncState.lastSync ? relTime(syncState.lastSync) : "not yet"}${syncState.lastEditor ? ` · last change by ${esc(syncState.lastEditor)}` : ""}</b></div>
        ${syncState.error ? `<p class="text-danger small">${esc(syncState.error)}</p>` : ""}
        <div class="field"><label>Invite link for team members</label><div class="with-btn"><input readonly value="${esc(invite)}" data-invite><button class="btn btn-ghost" data-copy>${icon("link")}Copy</button></div>
          <small class="muted">Share the Drive folder with the person first, then send them this link.</small></div>
        <div class="form-actions"><button class="btn btn-ghost" data-sync>${icon("refresh")}Sync now</button><button class="btn btn-ghost" data-switch>${icon("folder")}Use a different folder</button><button class="btn btn-ghost btn-danger-text" data-signout>${icon("logout")}Sign out</button></div>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>Backup</h3></div>
      <p class="muted">Download a full copy of the data as a JSON file. Restoring merges the backup into the current data (newer edits win).</p>
      <div class="form-actions">
        <button class="btn btn-ghost" data-backup>${icon("download")}Download backup</button>
        ${can("admin") ? `<label class="btn btn-ghost">${icon("upload")}Restore from backup<input type="file" accept="application/json,.json" data-restore hidden></label>` : ""}
      </div>
    </div>`;
}

function tabAppearance() {
  const t = getTheme();
  return `<div class="card">
      <div class="card-head"><h3>Theme</h3></div>
      <div class="seg">${[["system", "Automatic"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button data-theme="${k}" class="${t === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Install the app</h3></div>
      <p class="muted">Oval Farms ERP works as an app on phones and computers. On Android/Chrome tap <b>Install</b> below or use the browser menu → <i>Install app</i>. On iPhone open in Safari → Share → <i>Add to Home Screen</i>.</p>
      <div class="form-actions"><button class="btn btn-primary" data-install ${session.installPrompt ? "" : "disabled"}>${icon("install")}Install Oval Farms ERP</button></div>
    </div>
    <p class="muted small center">Oval Farms ERP · version ${esc(window.OVAL_VERSION || "")}</p>`;
}

const TABS = [
  { k: "business", l: "Business", fn: tabBusiness },
  { k: "team", l: "Team", fn: tabTeam },
  { k: "lists", l: "Lists", fn: tabLists },
  { k: "data", l: "Data & sync", fn: tabData },
  { k: "appearance", l: "App", fn: tabAppearance },
];

export const settingsView = {
  title: "Settings",
  render(root, params) {
    if (params && params.query && params.query.tab) { st.tab = params.query.tab; params.query.tab = ""; }
    const tab = TABS.find((t) => t.k === st.tab) || TABS[0];
    root.innerHTML = `${pageHead("Settings")}
      <div class="tabs">${TABS.map((t) => `<button class="tab ${t.k === tab.k ? "on" : ""}" data-tab="${t.k}">${t.l}</button>`).join("")}</div>
      <div class="settings-body">${tab.fn()}</div>`;
    const rr = () => this.render(root);
    const q = (s) => root.querySelector(s);
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { st.tab = b.dataset.tab; rr(); }));
    root.querySelectorAll("[data-tab-link]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); st.tab = a.dataset.tabLink; rr(); }));

    if (q("[data-savebiz]")) q("[data-savebiz]").addEventListener("click", () => {
      const vals = {};
      q("[data-biz]").querySelectorAll("[name]").forEach((el) => { vals[el.name] = el.value.trim(); });
      store.put("settings", { ...store.settings(), ...vals, id: "business" });
      toast("Business profile saved");
    });
    root.querySelectorAll("[data-role]").forEach((sel) => sel.addEventListener("change", () => {
      store.put("users", { id: sel.dataset.role, role: sel.value });
      toast("Role updated");
    }));
    if (q("[data-savelists]")) q("[data-savelists]").addEventListener("click", () => {
      const lists = {};
      root.querySelectorAll("[data-list]").forEach((ta) => { lists[ta.dataset.list] = ta.value.split("\n").map((x) => x.trim()).filter(Boolean); });
      store.put("settings", { ...store.settings(), id: "business", lists });
      toast("Lists saved");
    });
    if (q("[data-resetlists]")) q("[data-resetlists]").addEventListener("click", async () => {
      if (!(await confirmDialog("Restore all dropdown lists to the defaults?"))) return;
      store.put("settings", { ...store.settings(), id: "business", lists: {} });
      rr();
    });
    if (q("[data-copy]")) q("[data-copy]").addEventListener("click", async () => {
      const v = q("[data-invite]").value;
      try { await navigator.clipboard.writeText(v); toast("Invite link copied"); } catch (e) { q("[data-invite]").select(); }
    });
    if (q("[data-sync]")) q("[data-sync]").addEventListener("click", async () => { await syncNow(); rr(); toast(syncState.status === "idle" ? "Synced" : syncState.error || "Sync problem", syncState.status === "idle" ? "ok" : "error"); });
    if (q("[data-switch]")) q("[data-switch]").addEventListener("click", async () => {
      if (await confirmDialog("Switch to a different Drive folder? You'll be asked for the new folder link.")) session.actions.switchFolder();
    });
    root.querySelectorAll("[data-signout]").forEach((b) => b.addEventListener("click", () => session.actions.signOut()));
    if (q("[data-backup]")) q("[data-backup]").addEventListener("click", () => {
      downloadFile(`oval-farms-erp-backup-${today()}.json`, JSON.stringify(store.snapshot()), "application/json");
    });
    if (q("[data-restore]")) q("[data-restore]").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || !data.collections) throw new Error("Not an Oval Farms ERP backup file");
        if (!(await confirmDialog(`Merge "${file.name}" into the current data? Newer edits win for each record.`, { okLabel: "Merge backup" }))) return;
        store.replace(mergeDb(store.snapshot(), data).merged, true);
        toast("Backup merged");
      } catch (err) { toast(err.message, "error"); }
    });
    root.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => {
      try { localStorage.setItem("ovalerp_theme", b.dataset.theme); } catch (e) { /* ignore */ }
      applyTheme(b.dataset.theme); rr();
    }));
    if (q("[data-install]")) q("[data-install]").addEventListener("click", async () => {
      if (!session.installPrompt) return;
      session.installPrompt.prompt();
      await session.installPrompt.userChoice;
      session.installPrompt = null; rr();
    });
  },
};
