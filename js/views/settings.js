// Settings: business profile, team & roles, dropdown lists, data/sync, appearance.
import { store } from "../store.js";
import { DEFAULT_LISTS, list } from "../schema.js";
import { can, session, ROLES, currentRole, userKey } from "../session.js";
import { fbState } from "../firebase.js";
import { esc, fmtDate, today, downloadFile } from "../util.js";
import { icon } from "../icons.js";
import { pageHead, toast, confirmDialog } from "../ui.js";

const st = { tab: "business" };
const LIST_LABELS = {
  itemCategories: "Item categories", units: "Units", mushroomTypes: "Mushroom types", substrates: "Substrates",
  rooms: "Rooms / sheds", customerTypes: "Customer types", expenseCategories: "Expense categories",
  paymentModes: "Payment modes", adjustmentReasons: "Stock adjustment reasons", employeeRoles: "Employee roles",
  websiteCategories: "Website categories (ovalfarm.in shop)", orderSources: "How orders come in",
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
  const users = store.all("staff").sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const admin = can("admin");
  const me = userKey(session.user && session.user.email);
  return `
    <div class="card info-card">${icon("shield")}<div>
      <b>Who can use the app?</b>
      <p class="muted">Only the Google accounts listed here. ${admin ? "Add a team member's Gmail address below, then send them the app link: " : "Ask an admin to add people. App link: "}<b>${esc(location.origin + location.pathname)}</b></p>
      <p class="muted">The Oval Farms account (ovaleggfarm@gmail.com) is always an Admin.</p>
    </div></div>
    ${admin ? `<div class="card"><div class="form-grid">
      <div class="field half"><label>Google account email</label><input type="email" data-new-email placeholder="name@gmail.com" autocomplete="off"></div>
      <div class="field half"><label>Role</label><select data-new-role>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === "staff" ? "selected" : ""}>${r.label}</option>`).join("")}</select></div>
    </div><div class="form-actions"><button class="btn btn-primary" data-add-member>${icon("plus")}Add to team</button></div></div>` : ""}
    <div class="card card-flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Last active</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>
      ${users.length ? users.map((u) => `<tr><td class="primary" data-label="Person"><div class="person">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc((u.name || u.email)[0])}</span>`}<div><b>${esc(u.name || "")}</b><small class="muted">${esc(u.email)}</small></div></div></td>
        <td data-label="Role">${admin && u.id !== me ? `<select data-role="${esc(u.id)}">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${r.label}</option>`).join("")}</select>` : esc((ROLES[u.role] || ROLES.staff).label)}</td>
        <td data-label="Last active">${u.lastSeen ? fmtDate(u.lastSeen) : `<span class="muted">not signed in yet</span>`}</td>
        ${admin ? `<td>${u.id !== me ? `<button class="btn btn-link btn-danger-text" data-remove="${esc(u.id)}">Remove</button>` : ""}</td>` : ""}</tr>`).join("") : `<tr><td colspan="4" class="muted">No team members yet.</td></tr>`}
    </tbody></table></div></div>
    <div class="card"><h3>What each role can do</h3>
      <ul class="role-list">
        <li><b>Admin</b> · everything, including the team list.</li>
        <li><b>Manager</b> · everything except the team list.</li>
        <li><b>Staff</b> · production, harvests, stock, orders, sales and attendance. Cannot see expenses, payments list or reports, and cannot delete.</li>
        <li><b>Viewer</b> · can look at everything, cannot change anything.</li>
      </ul>
      <p class="muted small">The database's security rules enforce these roles too.</p>
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
  const state = { idle: "Everything is saved", saving: "Saving changes…", offline: "Offline: changes are kept on this device until you're back online", error: fbState.error || "Problem saving" }[fbState.status] || "";
  return `
    <div class="card">
      <div class="card-head"><h3>${icon(demo ? "cloudOff" : "cloud")} ${demo ? "Demo mode" : "Shared database"}</h3></div>
      ${demo ? `<p class="muted">You're exploring with sample data stored only in this browser. Sign in with Google to use the real, shared Oval Farms data.</p>
        <div class="form-actions"><button class="btn btn-primary" data-signout>${icon("logout")}Leave demo and sign in</button></div>` : `
        <div class="kv-row"><span>Signed in as</span><b>${esc(session.user ? session.user.email : "")}</b></div>
        <div class="kv-row"><span>Your role</span><b>${esc(ROLES[currentRole()].label)}</b></div>
        <div class="kv-row"><span>Status</span><b>${esc(state)}</b></div>
        <p class="muted small">Data is kept in Firebase (project ${esc((window.OVAL_CONFIG && window.OVAL_CONFIG.FIREBASE && window.OVAL_CONFIG.FIREBASE.projectId) || "")}), shared with ovalfarm.in, and cached on this device so the app works offline.</p>
        <div class="form-actions"><button class="btn btn-ghost btn-danger-text" data-signout>${icon("logout")}Sign out</button></div>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>Backup</h3></div>
      <p class="muted">Download a full copy of the data as a JSON file. Restoring adds records from the backup that are missing or older here.</p>
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
  { k: "data", l: "Data", fn: tabData },
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
    if (q("[data-add-member]")) q("[data-add-member]").addEventListener("click", () => {
      const email = userKey(q("[data-new-email]").value.trim());
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("Enter their Google account email", "error"); q("[data-new-email]").focus(); return; }
      if (store.get("staff", email)) { toast(`${email} is already on the team`, "error"); return; }
      store.put("staff", { id: email, email, role: q("[data-new-role]").value });
      toast(`${email} added. Send them the app link.`);
      rr();
    });
    root.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog(`Remove ${b.dataset.remove} from the team? They can no longer open the app.`, { okLabel: "Remove" }))) return;
      store.remove("staff", b.dataset.remove);
      toast("Removed from the team");
      rr();
    }));
    root.querySelectorAll("[data-role]").forEach((sel) => sel.addEventListener("change", () => {
      store.put("staff", { id: sel.dataset.role, role: sel.value });
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
        if (!(await confirmDialog(`Restore "${file.name}"? Records missing here, or older here than in the backup, are written back.`, { okLabel: "Restore" }))) return;
        let n = 0;
        for (const [name, recs] of Object.entries(data.collections)) {
          if (name === "catalog") continue;
          for (const r of Object.values(recs || {})) {
            if (!r || !r.id || r.deleted) continue;
            const cur = store.get(name, r.id);
            if (cur && String(cur.updatedAt || "") >= String(r.updatedAt || "")) continue;
            const { createdAt, updatedAt, createdBy, updatedBy, ...rest } = r;
            store.put(name, rest); n++;
          }
        }
        toast(n ? `${n} records restored` : "Nothing to restore: everything here is up to date");
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
