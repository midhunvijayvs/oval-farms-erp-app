// Investments: money put into Oval Farms by partners, family, banks and others, in many parts
// over time. Each investor is a team member with an investor ID (OFI-001…). Admins record and
// edit; Viewers and Investors look. An investment stores only the investor ID, never a name or
// email, and Investors can't read the team list, so to an investor everyone else is just an ID.
import { store } from "../store.js";
import { session, can, isInvestor, userKey, ROLES } from "../session.js";
import { list } from "../schema.js";
import { esc, money, fmtDate, today, fyStart, round2, sum, toCSV, downloadFile } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast, confirmDialog, pageHead, emptyState, stat } from "../ui.js";
import { navigate } from "../router.js";
import { comboHtml, bindCombo } from "../combo.js";

const st = { tab: "investors", q: "" };
const byDate = (a, b) => (b.date || "").localeCompare(a.date || "") || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
const all = () => store.all("investments").sort(byDate);
const member = (email) => store.get("staff", email);
const memberByNo = (no) => (no ? store.all("staff").find((s) => s.investorNo === no) : null);
// The signed-in person's own investor ID, if they have one.
const myNo = () => (member(userKey(session.user && session.user.email)) || {}).investorNo || "";
// Another investor, seen by an investor: only the ID shows.
const hidden = (no) => isInvestor() && no !== myNo();
export function investorName(no) {
  if (hidden(no)) return "Investor " + no;
  const m = memberByNo(no);
  return (m && (m.name || m.email)) || no;
}
const receivedLabel = (mode) => (String(mode || "").toLowerCase() === "cash" ? "Received by (person)" : "Received in (bank account)");

// Next investor ID: OFI-001, OFI-002…
export function nextInvestorNo() {
  const nos = [...store.all("staff").map((s) => s.investorNo), ...store.all("investments").map((i) => i.investorNo)];
  const n = Math.max(0, ...nos.map((x) => parseInt(String(x || "").replace(/\D/g, ""), 10) || 0));
  return "OFI-" + String(n + 1).padStart(3, "0");
}

// One row per investor ID: everyone with an investment, plus Investor-role members with none yet.
function investors() {
  const m = new Map();
  for (const s of store.all("staff")) if (s.role === "investor" && s.investorNo) m.set(s.investorNo, { no: s.investorNo, items: [] });
  for (const i of all()) {
    if (!m.has(i.investorNo)) m.set(i.investorNo, { no: i.investorNo, items: [] });
    m.get(i.investorNo).items.push(i);
  }
  return [...m.values()].map((r) => {
    const mem = hidden(r.no) ? null : memberByNo(r.no);
    return { ...r, name: investorName(r.no), email: mem ? mem.email || mem.id : "", mine: isInvestor() && r.no === myNo(), total: round2(sum(r.items, (i) => i.amount)), last: r.items[0] ? r.items[0].date : "" };
  }).sort((a, b) => b.total - a.total || a.no.localeCompare(b.no));
}

// ---------- list (Admin, Viewer, Investor) ----------
export const investmentsView = {
  title: "Investments",
  render(root) {
    const admin = can("admin");
    const inv = isInvestor();
    const rows = all();
    const invs = investors();
    const total = round2(sum(rows, (i) => i.amount));
    const fy = round2(sum(rows.filter((i) => (i.date || "") >= fyStart()), (i) => i.amount));
    const mineTotal = inv ? round2(sum(rows.filter((i) => i.investorNo === myNo()), (i) => i.amount)) : 0;
    let shown = rows;
    if (st.q) {
      const q = st.q.toLowerCase();
      shown = rows.filter((i) => [investorName(i.investorNo), i.investorNo, i.mode, i.receivedIn, ...(hidden(i.investorNo) ? [] : [i.reference, i.notes, (memberByNo(i.investorNo) || {}).email])].join(" ").toLowerCase().includes(q));
    }
    root.innerHTML = `
      ${pageHead("Investments", inv ? "Money invested in Oval Farms. Other investors show only by their ID." : "Money invested in Oval Farms, by investor", `<button class="btn btn-ghost hide-sm" data-export>${icon("download")}Export</button>` + (admin ? `<button class="btn btn-primary new-btn" data-new>${icon("plus")}New investment</button>` : ""))}
      <div class="stats stats-3">
        ${stat("Total invested", money(total), { ic: "trend", tone: "ok" })}
        ${stat("Investors", String(invs.filter((r) => r.items.length).length), { ic: "users" })}
        ${inv ? stat("You have invested", money(mineTotal), { sub: total ? Math.round((mineTotal / total) * 1000) / 10 + "% of the total" : "", ic: "wallet" })
          : stat("This financial year", money(fy), { sub: "from " + fmtDate(fyStart()), ic: "calendar" })}
      </div>
      <div class="tabs list-tabs" role="tablist">
        <button class="tab ${st.tab === "investors" ? "on" : ""}" data-tab="investors">By investor <span class="tab-count">${invs.length}</span></button>
        <button class="tab ${st.tab === "all" ? "on" : ""}" data-tab="all">All investments <span class="tab-count">${rows.length}</span></button>
      </div>
      ${st.tab === "investors" ? `
        <div class="card card-flush">${invs.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Investor</th><th>ID</th><th class="r">Investments</th><th>Last</th><th class="r">Total</th></tr></thead><tbody>
          ${invs.map((r) => `<tr class="clickable" data-inv="${esc(r.no)}"><td class="primary" data-label="Investor">${esc(r.name)}${r.mine ? ' <span class="chip chip-ok">You</span>' : ""}${r.email ? `<small class="muted block">${esc(r.email)}</small>` : ""}</td>
            <td data-label="ID">${esc(r.no)}</td><td class="r" data-label="Investments">${r.items.length}</td>
            <td data-label="Last">${r.last ? fmtDate(r.last) : '<span class="muted">none yet</span>'}</td><td class="r" data-label="Total"><b>${money(r.total)}</b></td></tr>`).join("")}
        </tbody><tfoot><tr><td class="primary hide-sm">Total</td><td class="hide-sm"></td><td class="r" data-label="Investments">${rows.length}</td><td class="hide-sm"></td><td class="r" data-label="Total"><b>${money(total)}</b></td></tr></tfoot></table></div>`
          : emptyState("No investors yet. Add the investor under Settings → Team (role Investor), then record their investment here.", admin ? `<button class="btn btn-primary" data-new>${icon("plus")}Record an investment</button>` : "")}</div>`
      : `
        <div class="toolbar"><div class="search">${icon("search")}<input type="search" placeholder="Search investor, ID, mode, account…" value="${esc(st.q)}" data-q></div></div>
        <div class="card card-flush">${historyTable(shown, { withInvestor: true, edit: admin })}</div>`}
      ${admin ? `<button class="fab" data-new aria-label="New investment">${icon("plus")}</button>` : ""}`;

    const rr = () => this.render(root);
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { st.tab = b.dataset.tab; rr(); }));
    const qi = root.querySelector("[data-q]");
    if (qi) qi.addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openInvestment(null)));
    root.querySelectorAll("[data-inv]").forEach((tr) => tr.addEventListener("click", () => navigate("#/investments/investor/" + encodeURIComponent(tr.dataset.inv))));
    bindHistory(root);
    const ex = root.querySelector("[data-export]");
    if (ex) ex.addEventListener("click", () => {
      const head = ["Date", "Investor ID", "Investor", ...(inv ? [] : ["Email"]), "Amount", "Mode", "Received in / by", "Reference", "Notes"];
      const csv = toCSV(head, rows.map((i) => {
        const h = hidden(i.investorNo);
        return [i.date, i.investorNo, investorName(i.investorNo), ...(inv ? [] : [(memberByNo(i.investorNo) || {}).email || ""]), i.amount, i.mode, i.receivedIn, h ? "" : i.reference, h ? "" : i.notes];
      }));
      downloadFile(`investments-${today()}.csv`, csv, "text/csv");
    });
  },
};

function historyTable(rows, { withInvestor = false, edit = false } = {}) {
  if (!rows.length) return emptyState("No investments here yet.");
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th>${withInvestor ? "<th>Investor</th>" : ""}<th>Mode</th><th>Received in / by</th><th>Reference</th><th class="r">Amount</th></tr></thead><tbody>
    ${rows.map((i) => {
      const h = hidden(i.investorNo);
      return `<tr class="${edit ? "clickable" : ""}" ${edit ? `data-edit="${esc(i.id)}"` : ""}>
      <td class="primary" data-label="Date">${fmtDate(i.date)}</td>
      ${withInvestor ? `<td data-label="Investor">${h ? esc(investorName(i.investorNo)) : `${esc(investorName(i.investorNo))} <small class="muted">${esc(i.investorNo)}</small>`}</td>` : ""}
      <td data-label="Mode">${esc(i.mode || "")}</td><td data-label="Received in / by">${esc(i.receivedIn || "")}</td>
      <td data-label="Reference">${h ? '<span class="muted">–</span>' : `${esc(i.reference || "")}${i.notes ? `<small class="muted block">${esc(i.notes)}</small>` : ""}`}</td>
      <td class="r" data-label="Amount"><b>${money(i.amount)}</b></td></tr>`;
    }).join("")}
  </tbody><tfoot><tr><td class="primary hide-sm">Total</td>${withInvestor ? '<td class="hide-sm"></td>' : ""}<td class="hide-sm"></td><td class="hide-sm"></td><td class="hide-sm"></td><td class="r" data-label="Total"><b>${money(sum(rows, (i) => i.amount))}</b></td></tr></tfoot></table></div>`;
}

function bindHistory(root) {
  root.querySelectorAll("[data-edit]").forEach((tr) => tr.addEventListener("click", () => openInvestment(store.get("investments", tr.dataset.edit))));
}

// One investor's history and total. mine: the signed-in investor looking at their own.
function investorPage(root, no, { mine = false } = {}) {
  const items = all().filter((i) => i.investorNo === no);
  const h = hidden(no);
  const m = h ? null : memberByNo(no);
  const own = isInvestor() && no && no === myNo();
  const name = investorName(no) || (session.user && session.user.name) || "";
  const total = round2(sum(items, (i) => i.amount));
  const grand = round2(sum(all(), (i) => i.amount));
  const admin = can("admin");
  const sub = h ? "Name and contact are private to Oval Farms" : [m && m.investorNo && "Investor ID " + m.investorNo, m && (m.email || m.id)].filter(Boolean).join(" · ");
  root.innerHTML = `
    <div class="page-head"><div><a class="back" href="#/investments">${icon("back")}Investments</a>
      <h1>${mine ? "My investments" : esc(name)}</h1>
      <p class="muted">${mine && name ? `${esc(name)} · ` : ""}${esc(sub)}</p></div>
      <div class="page-actions">
        ${admin && no ? `<button class="btn btn-primary" data-new>${icon("plus")}Add investment</button>` : ""}
      </div></div>
    <div class="stats stats-3">
      ${stat(own ? "You have invested" : "Total invested", money(total), { sub: grand ? Math.round((total / grand) * 1000) / 10 + "% of all investment" : "", ic: "trend", tone: "ok" })}
      ${stat("Investments", String(items.length), { ic: "file" })}
      ${stat("First investment", items.length ? fmtDate(items[items.length - 1].date) : "–", { sub: items.length ? "Latest " + fmtDate(items[0].date) : "", ic: "calendar" })}
    </div>
    <div class="card card-flush">${mine && !no ? emptyState("You don't have an investor ID yet. It's given with your first investment.") : historyTable(items, { edit: admin })}</div>
    ${own ? `<p class="small muted">If something here looks wrong, please tell Oval Farms.</p>` : ""}`;
  const nb = root.querySelector("[data-new]");
  if (nb) nb.addEventListener("click", () => openInvestment(null, { investorNo: no }));
  bindHistory(root);
}

export const investorView = {
  title: "Investor",
  render(root, params) { investorPage(root, params.id); },
};

export const myInvestmentsView = {
  title: "My investments",
  render(root) { investorPage(root, myNo(), { mine: true }); },
};

// ---------- record / edit ----------
export function openInvestment(existing, presets = {}) {
  if (!can("admin")) return;
  const r = existing ? { ...existing } : { date: today(), mode: list("paymentModes").includes("Bank Transfer") ? "Bank Transfer" : list("paymentModes")[0], amount: "", receivedIn: "", reference: "", notes: "", investorNo: "", ...presets };
  const team = store.all("staff").sort((a, b) => (a.role === "investor" ? 0 : 1) - (b.role === "investor" ? 0 : 1) || String(a.name || a.email).localeCompare(String(b.name || b.email)));
  const options = team.map((s) => ({ value: s.id, label: s.name || s.email || s.id, sub: [s.investorNo, s.email || s.id, (ROLES[s.role] || {}).label].filter(Boolean).join(" · ") }));
  let memberId = (memberByNo(r.investorNo) || {}).id || "";
  const selected = memberId ? options.find((o) => o.value === memberId) : r.investorNo ? { label: r.investorNo } : null;
  const accounts = [...new Set(all().map((i) => i.receivedIn).filter(Boolean))];
  const actions = [{ label: "Cancel", cls: "btn-ghost" }];
  if (existing) actions.push({ label: "Delete", cls: "btn-ghost btn-danger-text", icon: "trash", onClick: async () => {
    if (!(await confirmDialog(`Delete this investment of ${money(existing.amount)} from ${investorName(existing.investorNo)}?`, { okLabel: "Delete", danger: true }))) return true;
    store.remove("investments", existing.id);
    toast("Investment deleted");
  } });
  actions.push({ label: "Save", cls: "btn-primary", icon: "tick", onClick: ({ el }) => {
    const v = (k) => el.querySelector(`[name="${k}"]`).value.trim();
    const amount = Number(v("amount"));
    const m = member(memberId);
    if (!m && !r.investorNo) { toast("Choose the investor", "error"); return true; }
    if (!v("date")) { toast("Enter the date", "error"); return true; }
    if (!(amount > 0)) { toast("Enter the amount", "error"); return true; }
    let no = m ? m.investorNo : r.investorNo;
    if (m && !no) { no = nextInvestorNo(); store.put("staff", { id: m.id, investorNo: no }); }
    store.put("investments", {
      ...(existing ? { id: existing.id } : {}),
      investorNo: no,
      date: v("date"), amount: round2(amount), mode: v("mode"),
      receivedIn: v("receivedIn").slice(0, 200), reference: v("reference").slice(0, 120), notes: v("notes").slice(0, 1000),
    });
    toast(existing ? "Investment saved" : `${money(amount)} from ${(m && m.name) || no} recorded`);
  } });

  openModal({
    title: existing ? "Edit investment" : "New investment",
    body: `<div class="form-grid">
      <div class="field"><label>Investor (team member)</label>${comboHtml({ attr: "data-investor", selected, placeholder: "Type the investor's name or email…" })}
        <small class="muted">Not in the list? Add them under Settings → Team with the Investor role first.</small></div>
      <div class="field half"><label>Date received</label><input type="date" name="date" value="${esc(r.date || "")}"></div>
      <div class="field half"><label>Amount (₹)</label><input type="number" inputmode="decimal" step="0.01" min="0" name="amount" value="${esc(r.amount ?? "")}"></div>
      <div class="field half"><label>Mode of payment</label><select name="mode">${[...new Set([...list("paymentModes"), r.mode].filter(Boolean))].map((x) => `<option ${x === r.mode ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
      <div class="field half"><label data-recv-label>${receivedLabel(r.mode)}</label><input name="receivedIn" list="inv-accounts" value="${esc(r.receivedIn || "")}" placeholder="e.g. SBI current a/c ••0123, or a person's name"><datalist id="inv-accounts">${accounts.map((a) => `<option value="${esc(a)}">`).join("")}</datalist></div>
      <div class="field"><label>Reference (UTR, cheque no.)</label><input name="reference" value="${esc(r.reference || "")}"></div>
      <div class="field"><label>Notes</label><textarea name="notes" rows="2">${esc(r.notes || "")}</textarea>
        <small class="muted">Other investors see the date, amount, mode and received in/by, never the investor's name, reference or notes. These are still stored with the investment, so don't put the investor's name or phone in the reference or notes.</small></div>
    </div>`,
    actions,
    onMount: ({ el }) => {
      bindCombo(el.querySelector("[data-investor]"), { options, empty: "No team member with that name. Add them in Settings → Team.", onPick: (o) => { memberId = o.value; } });
      const mode = el.querySelector('[name="mode"]');
      mode.addEventListener("change", () => { el.querySelector("[data-recv-label]").textContent = receivedLabel(mode.value); });
    },
  });
}
