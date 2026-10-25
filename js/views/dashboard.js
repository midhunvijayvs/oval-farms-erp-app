// Home screen: today's numbers, alerts and the last two weeks of sales and harvest.
import { store } from "../store.js";
import { ACTIVE_BATCH } from "../schema.js";
import { can, session } from "../session.js";
import { esc, money, moneyShort, num, sum, today, addDays, fmtDate, fmtDateShort, monthStart, daysBetween } from "../util.js";
import { icon } from "../icons.js";
import { stat, chip, pageHead } from "../ui.js";
import * as calc from "../calc.js";
import { barChart, bindCharts } from "./charts.js";
import { hooksAfterTask } from "./crud.js";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const dashboardView = {
  title: "Dashboard",
  render(root) {
    const t = today(), ms = monthStart();
    const sales = store.all("sales").filter(calc.saleCounts);
    const monthSales = sales.filter((s) => s.date >= ms);
    const todaySales = sales.filter((s) => s.date === t);
    const monthSalesTotal = sum(monthSales, (s) => calc.docTotals(s).total);
    const monthExp = sum(store.all("expenses").filter((e) => e.date >= ms), (e) => e.amount);
    const monthPurch = sum(store.all("purchases").filter((p) => calc.purchaseCounts(p) && p.date >= ms), (p) => calc.docTotals(p).total);
    const monthHarvest = sum(store.all("harvests").filter((h) => h.date >= ms), (h) => h.qty);
    const activeBatches = store.all("batches").filter((b) => ACTIVE_BATCH.includes(b.status));
    const low = calc.lowStockItems();
    const expiring = calc.expiringLots(30);
    const upcoming = activeBatches.filter((b) => b.expectedHarvestDate && b.expectedHarvestDate <= addDays(t, 7) && b.status !== "Harvesting")
      .sort((a, b) => a.expectedHarvestDate.localeCompare(b.expectedHarvestDate));
    const tasks = store.all("tasks").filter((x) => x.status !== "Done" && (!x.dueDate || x.dueDate <= addDays(t, 2))).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    const overdueInv = sales.filter((s) => s.dueDate && s.dueDate < t && calc.docBalance(s) > 0.5);
    const recent = store.all("sales").sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 6);
    const customers = new Map(store.all("customers").map((c) => [c.id, c]));
    const items = new Map(store.all("products").map((i) => [i.id, i]));

    // 14-day series
    const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
    const salesByDay = new Map(days.map((d) => [d, 0]));
    for (const s of sales) if (salesByDay.has(s.date)) salesByDay.set(s.date, salesByDay.get(s.date) + calc.docTotals(s).total);
    const harvByDay = new Map(days.map((d) => [d, 0]));
    for (const h of store.all("harvests")) if (harvByDay.has(h.date)) harvByDay.set(h.date, harvByDay.get(h.date) + (Number(h.qty) || 0));

    const first = (session.user && session.user.name ? session.user.name.split(" ")[0] : "");
    const alerts = [];
    if (low.length) alerts.push(`<a href="#/stock" class="alert-row warn">${icon("alert")}<span><b>${low.length}</b> item${low.length > 1 ? "s" : ""} low or out of stock: ${esc(low.slice(0, 3).map((i) => i.name).join(", "))}${low.length > 3 ? "…" : ""}</span>${icon("chevronRight")}</a>`);
    if (overdueInv.length) alerts.push(`<a href="#/sales" class="alert-row danger">${icon("clock")}<span><b>${overdueInv.length}</b> overdue invoice${overdueInv.length > 1 ? "s" : ""} · ${money(sum(overdueInv, calc.docBalance))} to collect</span>${icon("chevronRight")}</a>`);
    if (expiring.length) alerts.push(`<a href="#/production" class="alert-row warn">${icon("clock")}<span><b>${expiring.length}</b> product lot${expiring.length > 1 ? "s" : ""} expiring within 30 days</span>${icon("chevronRight")}</a>`);

    root.innerHTML = `
      <div class="hero">
        <div>
          <p class="hero-kicker">${fmtDate(t)}</p>
          <h1>${greeting()}${first ? ", " + esc(first) : ""}</h1>
          <p class="muted">Here's how Oval Farms is doing this month.</p>
        </div>
        ${can("write") ? `<div class="quick">
          <a href="#/sales/new" class="quick-btn">${icon("file")}<span>New invoice</span></a>
          <a href="#/harvests?new=1" class="quick-btn">${icon("basket")}<span>Log harvest</span></a>
          <a href="#/production/new" class="quick-btn">${icon("flask")}<span>Production</span></a>
          ${can("finance") ? `<a href="#/expenses?new=1" class="quick-btn">${icon("receipt")}<span>Add expense</span></a>` : `<a href="#/attendance" class="quick-btn">${icon("calendar")}<span>Attendance</span></a>`}
        </div>` : ""}
      </div>
      ${alerts.length ? `<div class="alerts">${alerts.join("")}</div>` : ""}
      <div class="stats">
        ${stat("Sales this month", money(monthSalesTotal), { sub: `Today ${money(sum(todaySales, (s) => calc.docTotals(s).total))} · ${monthSales.length} invoices`, ic: "trend", href: "#/sales" })}
        ${can("finance") ? stat("To collect", money(calc.totalReceivables()), { sub: "Outstanding from customers", ic: "wallet", tone: overdueInv.length ? "warn" : "", href: "#/customers" }) : ""}
        ${can("finance") ? stat("Spent this month", money(monthExp + monthPurch), { sub: `Purchases ${moneyShort(monthPurch)} · Expenses ${moneyShort(monthExp)}`, ic: "receipt", href: "#/expenses" }) : ""}
        ${stat("Harvest this month", num(monthHarvest) + " kg", { sub: `${activeBatches.length} active grow batch${activeBatches.length === 1 ? "" : "es"}`, ic: "basket", href: "#/harvests" })}
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Sales · last 14 days</h3><span class="muted small">${money(sum([...salesByDay.values()]))}</span></div>
          ${barChart(days.map((d) => ({ label: fmtDateShort(d), value: salesByDay.get(d), tip: `${fmtDate(d)} · ${money(salesByDay.get(d))}` })), { fmt: (v) => moneyShort(v), ariaLabel: "Daily sales for the last 14 days" })}
        </div>
        <div class="card">
          <div class="card-head"><h3>Harvest · last 14 days</h3><span class="muted small">${num(sum([...harvByDay.values()]))} kg</span></div>
          ${barChart(days.map((d) => ({ label: fmtDateShort(d), value: harvByDay.get(d), tip: `${fmtDate(d)} · ${num(harvByDay.get(d))} kg` })), { fmt: (v) => num(v) + " kg", ariaLabel: "Daily harvest for the last 14 days" })}
        </div>
      </div>
      <div class="grid-3">
        <div class="card">
          <div class="card-head"><h3>Grow rooms</h3><a href="#/batches" class="link">All batches</a></div>
          ${activeBatches.length ? `<div class="mini-list">${activeBatches.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "")).slice(0, 6).map((b) => {
            const age = b.startDate ? daysBetween(b.startDate, t) : 0;
            return `<a href="#/batches"><span><b>${esc(b.code)}</b> · ${esc((b.mushroomType || "").split(" (")[0])}<br><small class="muted">Day ${age}${b.room ? " · " + esc(b.room) : ""} · ${num(calc.harvestedKg(b.id))} kg</small></span>${chip(b.status)}</a>`;
          }).join("")}</div>` : `<p class="muted">No active batches. <a href="#/batches?new=1">Start one</a>.</p>`}
          ${upcoming.length ? `<p class="small muted">Harvest expected soon: ${upcoming.map((b) => `<b>${esc(b.code)}</b> (${fmtDateShort(b.expectedHarvestDate)})`).join(", ")}</p>` : ""}
        </div>
        <div class="card">
          <div class="card-head"><h3>Recent invoices</h3><a href="#/sales" class="link">View all</a></div>
          ${recent.length ? `<div class="mini-list">${recent.map((s) => `<a href="#/sales/${s.id}"><span><b>${esc(s.number)}</b><br><small class="muted">${esc((customers.get(s.customerId) || {}).name || "Walk-in")} · ${fmtDateShort(s.date)}</small></span><span class="r"><b>${money(calc.docTotals(s).total)}</b><br>${calc.saleCounts(s) ? chip(calc.paymentStatus(s)) : chip(s.status)}</span></a>`).join("")}</div>` : `<p class="muted">No invoices yet.</p>`}
        </div>
        <div class="card">
          <div class="card-head"><h3>Tasks due</h3><a href="#/tasks" class="link">All tasks</a></div>
          ${tasks.length ? `<div class="mini-list">${tasks.slice(0, 6).map((x) => `<div class="task-row"><label class="check"><input type="checkbox" data-task="${x.id}" ${can("write") ? "" : "disabled"}><span>${esc(x.title)}</span></label><small class="${x.dueDate && x.dueDate < t ? "text-danger" : "muted"}">${x.dueDate ? fmtDateShort(x.dueDate) : ""}</small></div>`).join("")}</div>` : `<p class="muted">Nothing due. Nice!</p>`}
          ${expiring.length ? `<div class="card-sub"><h4>Expiring soon</h4>${expiring.slice(0, 4).map((p) => `<div class="kv-row"><span>${esc((items.get(p.outputItemId) || {}).name || "")} · ${esc(p.lotNo)}</span><b class="${p.expiryDate < t ? "text-danger" : "text-warn"}">${fmtDateShort(p.expiryDate)}</b></div>`).join("")}</div>` : ""}
        </div>
      </div>`;

    bindCharts(root);
    root.querySelectorAll("[data-task]").forEach((cb) => cb.addEventListener("change", () => {
      const task = store.get("tasks", cb.dataset.task);
      const saved = store.put("tasks", { id: task.id, status: "Done" });
      hooksAfterTask(saved, task);
    }));
  },
};
