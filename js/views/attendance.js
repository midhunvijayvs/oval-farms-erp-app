// Daily attendance (one record per employee per day, so two people marking at once never clash)
// plus a monthly summary with estimated wages.
import { store } from "../store.js";
import { can } from "../session.js";
import { esc, money, today, addDays, fmtDate, monthStart, monthEnd, daysBetween } from "../util.js";
import { icon } from "../icons.js";
import { pageHead, emptyState, toast } from "../ui.js";

const MARKS = [
  { v: "Present", s: "P", tone: "ok" },
  { v: "Half day", s: "H", tone: "warn" },
  { v: "Absent", s: "A", tone: "danger" },
  { v: "Leave", s: "L", tone: "muted" },
];
const st = { date: "" };

export function attId(date, empId) { return `att-${date}-${empId}`; }

export function monthSummary(emp, from, to) {
  const recs = store.all("attendance").filter((a) => a.employeeId === emp.id && a.date >= from && a.date <= to);
  const present = recs.filter((a) => a.status === "Present").length;
  const half = recs.filter((a) => a.status === "Half day").length;
  const absent = recs.filter((a) => a.status === "Absent").length;
  const leave = recs.filter((a) => a.status === "Leave").length;
  const days = present + half / 2;
  let wage = 0;
  const rate = Number(emp.wageRate) || 0;
  if (emp.wageType === "Monthly") {
    const span = daysBetween(from, to) + 1;
    wage = absent ? rate - (rate / span) * (absent + half / 2) : rate;
  } else wage = rate * days;
  return { present, half, absent, leave, days, wage: Math.max(0, Math.round(wage)) };
}

export const attendanceView = {
  title: "Attendance",
  render(root) {
    if (!st.date) st.date = today();
    const emps = store.all("employees").filter((e) => e.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const marks = new Map(store.all("attendance").filter((a) => a.date === st.date).map((a) => [a.employeeId, a.status]));
    const from = monthStart(st.date), to = monthEnd(st.date) < today() ? monthEnd(st.date) : st.date;
    const ro = !can("write");

    root.innerHTML = `
      ${pageHead("Attendance", "Tap a status for each person. Changes save and sync automatically.", `<a class="btn btn-ghost" href="#/employees">${icon("id")}Employees</a>`)}
      <div class="toolbar">
        <div class="date-nav">
          <button class="icon-btn" data-step="-1" aria-label="Previous day">${icon("back")}</button>
          <input type="date" value="${st.date}" data-date>
          <button class="icon-btn flip" data-step="1" aria-label="Next day">${icon("back")}</button>
        </div>
        <span class="muted">${fmtDate(st.date)}${st.date === today() ? " · Today" : ""}</span>
        ${!ro && emps.length ? `<button class="btn btn-ghost" data-allp>${icon("tick")}Mark everyone present</button>` : ""}
      </div>
      ${emps.length ? `<div class="card card-flush"><div class="att-list">
        ${emps.map((e) => `<div class="att-row"><div class="att-name"><span class="avatar">${esc(e.name[0] || "?")}</span><div><b>${esc(e.name)}</b><small class="muted">${esc(e.role || "")}</small></div></div>
          <div class="att-marks" data-emp="${e.id}">${MARKS.map((m) => `<button class="att-btn tone-${m.tone} ${marks.get(e.id) === m.v ? "on" : ""}" data-mark="${m.v}" title="${m.v}" ${ro ? "disabled" : ""}>${m.s}<span>${m.v}</span></button>`).join("")}</div></div>`).join("")}
      </div></div>
      <h2 class="section-title">This month so far</h2>
      <div class="card card-flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Employee</th><th class="r">Present</th><th class="r">Half days</th><th class="r">Absent</th><th class="r">Leave</th><th class="r">Est. wages</th></tr></thead><tbody>
        ${emps.map((e) => { const s = monthSummary(e, from, to); return `<tr><td class="primary" data-label="Employee">${esc(e.name)}</td><td class="r" data-label="Present">${s.present}</td><td class="r" data-label="Half days">${s.half}</td><td class="r" data-label="Absent">${s.absent}</td><td class="r" data-label="Leave">${s.leave}</td><td class="r" data-label="Est. wages"><b>${money(s.wage)}</b></td></tr>`; }).join("")}
      </tbody></table></div></div>
      <p class="muted small">Estimated wages: daily-rated staff are paid per day present (half days count as ½); monthly salaries are reduced pro-rata for absences. Record the actual payout under Expenses → Salaries & Wages.</p>`
      : emptyState("Add your employees first, then mark attendance here every day.", can("write") ? `<a class="btn btn-primary" href="#/employees">${icon("plus")}Add employees</a>` : "")}`;

    const rr = () => this.render(root);
    root.querySelector("[data-date]").addEventListener("change", (e) => { st.date = e.target.value || today(); rr(); });
    root.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => { st.date = addDays(st.date, +b.dataset.step); rr(); }));
    root.querySelectorAll("[data-mark]").forEach((b) => b.addEventListener("click", () => {
      const emp = b.closest("[data-emp]").dataset.emp;
      const id = attId(st.date, emp);
      if (marks.get(emp) === b.dataset.mark) store.remove("attendance", id);
      else store.put("attendance", { id, date: st.date, employeeId: emp, status: b.dataset.mark });
    }));
    const allp = root.querySelector("[data-allp]");
    if (allp) allp.addEventListener("click", () => {
      for (const e of emps) if (!marks.get(e.id)) store.put("attendance", { id: attId(st.date, e.id), date: st.date, employeeId: e.id, status: "Present" });
      toast("Marked present");
    });
  },
};
