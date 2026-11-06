// Activity log (Admins only): sign-ups, sign-ins and every change made in the ERP and on
// ovalfarm.in, with who did it and from where. Looking at data isn't logged.
import { session } from "../session.js";
import { esc, today, addDays, monthStart, fmtDate, toCSV, downloadFile } from "../util.js";
import { icon } from "../icons.js";
import { pageHead, emptyState, chip } from "../ui.js";
import { queryLogs } from "../firebase.js";
import { demoEntries } from "../activity.js";

const st = { from: today(), to: today(), app: "", q: "" };
let cache = { key: "", rows: [], error: "" };

const WHAT = {
  orders: "Order", sales: "Invoice", purchases: "Purchase bill", expenses: "Expense", payments: "Payment",
  customers: "Customer", suppliers: "Supplier", products: "Product", staff: "Team member", settings: "Settings",
  batches: "Grow batch", harvests: "Harvest", productions: "Processing run", adjustments: "Stock adjustment",
  employees: "Employee", attendance: "Attendance", tasks: "Task", delivery: "Delivery charges", productGroups: "Product group",
  investments: "Investment", notes: "Note", customerInvites: "Customer login invite", account: "Account",
};
const whatLabel = (w) => WHAT[w] || w || "";
const tone = (a) => (/^Deleted|refused|failed/i.test(a) ? "danger" : /^Created|Signed up|Placed/i.test(a) ? "ok" : /^Signed (in|out)/i.test(a) ? "info" : "muted");
const time = (v) => {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" });
};

async function load(force) {
  const key = st.from + "|" + st.to;
  if (!force && cache.key === key) return;
  cache = { key, rows: [], error: "", loading: true };
  try {
    if (session.mode === "demo") {
      const a = new Date(st.from + "T00:00:00"), b = new Date(addDays(st.to, 1) + "T00:00:00");
      cache.rows = demoEntries().filter((e) => { const t = new Date(e.at); return t >= a && t < b; });
    } else cache.rows = await queryLogs(st.from, st.to);
  } catch (e) {
    cache.error = e.code === "permission-denied" ? "Only Admins can read the activity log." : e.code === "failed-precondition" ? "The log needs the new database rules published first (Firebase console → Firestore → Rules)." : e.message || String(e);
  }
  cache.loading = false;
}

export const logsView = {
  title: "Activity log",
  keepOnRemote: true,
  async render(root) {
    const draw = () => {
      let rows = cache.rows;
      if (st.app) rows = rows.filter((r) => (r.app || "erp") === st.app);
      if (st.q) {
        const q = st.q.toLowerCase();
        rows = rows.filter((r) => [r.name, r.email, r.phone, r.action, whatLabel(r.what), r.label, r.ip, r.note, (r.fields || []).join(" ")].join(" ").toLowerCase().includes(q));
      }
      const preset = st.from === today() && st.to === today() ? "today" : st.from === addDays(today(), -6) && st.to === today() ? "week" : st.from === monthStart() && st.to === today() ? "month" : "";
      root.innerHTML = `
        ${pageHead("Activity log", "Sign-ups, sign-ins and every change in the ERP and on ovalfarm.in. Only Admins can see this.", `<button class="btn btn-ghost" data-export ${rows.length ? "" : "disabled"}>${icon("download")}Export</button>`)}
        <div class="toolbar log-toolbar">
          <div class="seg"><button data-preset="today" class="${preset === "today" ? "on" : ""}">Today</button><button data-preset="week" class="${preset === "week" ? "on" : ""}">7 days</button><button data-preset="month" class="${preset === "month" ? "on" : ""}">This month</button></div>
          <label class="date-range"><span>From</span><input type="date" data-from value="${esc(st.from)}" max="${today()}"></label>
          <label class="date-range"><span>To</span><input type="date" data-to value="${esc(st.to)}" max="${today()}"></label>
          <select data-app><option value="">ERP and website</option><option value="erp" ${st.app === "erp" ? "selected" : ""}>ERP only</option><option value="site" ${st.app === "site" ? "selected" : ""}>Website only</option></select>
          <div class="search">${icon("search")}<input type="search" placeholder="Search person, action, record, IP…" value="${esc(st.q)}" data-q></div>
        </div>
        <div class="card card-flush">
          ${cache.loading ? `<div class="empty"><div class="loader"></div><p class="muted">Loading the log…</p></div>`
            : cache.error ? emptyState(cache.error)
            : rows.length ? `<div class="table-wrap"><table class="tbl log-tbl"><thead><tr><th>When</th><th>Who</th><th>What happened</th><th>Where from</th></tr></thead><tbody>
              ${rows.map((r) => `<tr>
                <td class="primary l-when" data-label="When">${esc(time(r.at))}</td>
                <td class="l-who" data-label="Who"><b>${esc(r.name || r.email || "Unknown")}</b>${r.role ? ` <small class="muted">${esc(r.role)}</small>` : ""}
                  <small class="muted block">${[r.email, r.phone].filter(Boolean).map(esc).join(" · ")}</small>${r.uid ? `<small class="muted block mono">ID ${esc(r.uid)}</small>` : ""}</td>
                <td class="l-what" data-label="What happened">${chip(r.action || "", tone(r.action || ""))} ${chip(r.app === "site" ? "Website" : "ERP", r.app === "site" ? "info" : "muted")}
                  <span class="block">${esc(whatLabel(r.what))}${r.label ? ` <b>${esc(r.label)}</b>` : ""}</span>
                  ${(r.fields || []).length ? `<small class="muted block">Changed: ${esc(r.fields.join(", "))}</small>` : ""}${r.note ? `<small class="muted block">${esc(r.note)}</small>` : ""}</td>
                <td class="l-where" data-label="Where from">${esc(r.ip || "IP unknown")}<small class="muted block">${esc(r.device || "")}</small></td></tr>`).join("")}
              </tbody></table></div>`
            : emptyState(cache.rows.length ? "Nothing matches the filter." : `Nothing logged ${st.from === st.to ? "on " + fmtDate(st.from) : "between " + fmtDate(st.from) + " and " + fmtDate(st.to)}.`)}
        </div>
        ${rows.length >= 3000 ? `<p class="small muted">Showing the latest 3,000 entries. Pick a shorter period to see the rest.</p>` : ""}`;

      const reload = async () => { await load(); draw(); };
      root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
        st.to = today();
        st.from = b.dataset.preset === "today" ? today() : b.dataset.preset === "week" ? addDays(today(), -6) : monthStart();
        draw(); reload();
      }));
      root.querySelector("[data-from]").addEventListener("change", (e) => { st.from = e.target.value || today(); if (st.to < st.from) st.to = st.from; draw(); reload(); });
      root.querySelector("[data-to]").addEventListener("change", (e) => { st.to = e.target.value || today(); if (st.to < st.from) st.from = st.to; draw(); reload(); });
      root.querySelector("[data-app]").addEventListener("change", (e) => { st.app = e.target.value; draw(); });
      root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; draw(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
      root.querySelector("[data-export]").addEventListener("click", () => {
        const csv = toCSV(["Time", "App", "Action", "Record type", "Record", "Fields changed", "Note", "Name", "Email", "Phone", "User ID", "Role", "IP address", "Device"],
          rows.map((r) => [new Date(r.at).toISOString(), r.app === "site" ? "Website" : "ERP", r.action, whatLabel(r.what), r.label, (r.fields || []).join("; "), r.note, r.name, r.email, r.phone, r.uid, r.role, r.ip, r.device]));
        downloadFile(`activity-log-${st.from}-to-${st.to}.csv`, csv, "text/csv");
      });
    };
    if (cache.key !== st.from + "|" + st.to) { cache.loading = true; draw(); }
    await load(true);
    draw();
  },
};
