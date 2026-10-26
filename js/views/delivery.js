// Delivery → Pincodes & charges. One card per distance range: which pincodes it covers, the order
// value above which delivery is free, the charge per kg below that, and a switch to stop delivering
// to the range. ovalfarm.in reads the same groups, so the shop charges what is set here.
import { store } from "../store.js";
import { can } from "../session.js";
import { esc, money } from "../util.js";
import { icon } from "../icons.js";
import { toast, confirmDialog } from "../ui.js";
import { ZONES, FAR_ZONE, zone, zones, zoneForPincode, parseEntries, countPincodes, isPincode, deliveryQuote, inZone, without } from "../delivery.js";

const save = (id, patch) => store.put("delivery", { id, label: zone(id).label, order: zone(id).order, ...patch });

function zoneCard(z, open) {
  const far = z.id === FAR_ZONE;
  const n = countPincodes(z);
  return `<div class="zone-card ${z.paused ? "paused" : ""}" data-zone="${z.id}">
    <div class="zone-head">
      <div>
        <h3>${esc(z.label)}</h3>
        <p class="muted small">${far ? "Everywhere else in India" : n ? `${n} pincode${n === 1 ? "" : "s"}` : "No pincodes yet"}${z.paused ? " · not delivering" : ""}</p>
      </div>
      <div class="zone-sum">${z.paused ? `<span class="chip chip-warn">Paused</span>` : `<span>${z.perKg ? money(z.perKg) + " / kg" : "No charge"}</span>${z.freeAbove ? `<small class="muted block">Free above ${money(z.freeAbove)}</small>` : ""}`}</div>
    </div>
    <div class="zone-body">
      <div class="zone-fields">
        <label><span>Free delivery above</span><input type="number" step="1" min="0" data-f="freeAbove" value="${esc(z.freeAbove || "")}" placeholder="0 = never free" ${can("write") ? "" : "disabled"}></label>
        <label><span>Charge per kg below that</span><input type="number" step="0.5" min="0" data-f="perKg" value="${esc(z.perKg || "")}" placeholder="0" ${can("write") ? "" : "disabled"}></label>
        <label class="check"><input type="checkbox" data-f="paused" ${z.paused ? "checked" : ""} ${can("write") ? "" : "disabled"}><span>Currently not delivering to this range</span></label>
      </div>
      ${far ? `<p class="muted small">Any pincode that is not in one of the other ranges is charged at this rate.</p>` : `
      ${can("write") ? `<div class="zone-add">
        <input type="text" data-add placeholder="Add pincodes, e.g. 673525, 673101-673104">
        <button class="btn btn-ghost" data-add-go>${icon("plus")}Add</button>
      </div>` : ""}
      <div class="pin-chips">${(z.pincodes || []).map((e) => `<span class="pin-chip">${esc(e)}${can("write") ? `<button data-del="${esc(e)}" aria-label="Remove ${esc(e)}">${icon("x")}</button>` : ""}</span>`).join("") || `<span class="muted small">Add the pincodes you deliver to in this range.</span>`}</div>`}
    </div>
  </div>`;
}

export const deliveryView = {
  title: "Delivery charges",
  render(el) {
    const draw = () => {
      const list = zones();
      el.innerHTML = `
        <div class="page-head"><h1>Pincodes &amp; delivery charges</h1></div>
        <p class="muted">Delivery is free on orders above the amount you set for a range. Below it, the charge is the rate per kg times the weight of the order. ovalfarm.in works out the charge the same way at checkout.</p>
        <div class="card pin-check">
          <label><span>Check a pincode</span><input type="text" inputmode="numeric" maxlength="6" data-check placeholder="e.g. 673525"></label>
          <p class="pin-result muted" data-check-out>Type a 6-digit pincode to see which range it falls in.</p>
        </div>
        <div class="zone-list">${list.map((z) => zoneCard(z)).join("")}</div>`;

      const check = el.querySelector("[data-check]");
      const out = el.querySelector("[data-check-out]");
      check.addEventListener("input", () => {
        const v = check.value.trim();
        if (!isPincode(v)) { out.textContent = "Type a 6-digit pincode to see which range it falls in."; out.className = "pin-result muted"; return; }
        const q = deliveryQuote(v, 1, 0);
        out.innerHTML = `<b>${esc(q.zone.label)}</b> · ${esc(q.paused ? "not delivering at the moment" : q.zone.perKg ? money(q.zone.perKg) + " per kg" : "no delivery charge")}${q.zone.freeAbove ? `, free above ${money(q.zone.freeAbove)}` : ""}`;
        out.className = "pin-result";
      });

      if (!can("write")) return;
      el.querySelectorAll("[data-zone]").forEach((card) => {
        const id = card.dataset.zone;
        card.addEventListener("change", (e) => {
          const f = e.target.dataset.f;
          if (!f) return;
          save(id, { [f]: f === "paused" ? e.target.checked : Number(e.target.value) || 0 });
          draw();
        });
        const add = card.querySelector("[data-add]");
        const addNow = () => {
          const entries = parseEntries(add.value);
          if (!entries.length) return toast("Type a pincode like 673525, or a range like 673101-673104", "error");
          // A pincode belongs to one range only, so take it out of any other range that holds it
          const movedFrom = [];
          for (const other of zones()) {
            if (other.id === id || other.id === FAR_ZONE) continue;
            const left = without(other.pincodes, entries);
            if (left.join() === other.pincodes.join()) continue;
            save(other.id, { pincodes: left });
            movedFrom.push(other.label);
          }
          save(id, { pincodes: [...new Set([...zone(id).pincodes, ...entries])].sort() });
          if (movedFrom.length) toast(`Moved here from ${[...new Set(movedFrom)].join(", ")}`);
          add.value = "";
          draw();
          const again = document.querySelector(`[data-zone="${id}"] [data-add]`);
          if (again) again.focus();
        };
        if (add) {
          add.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addNow(); } });
          card.querySelector("[data-add-go]").addEventListener("click", addNow);
        }
        card.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
          const entry = b.dataset.del;
          if (!(await confirmDialog(`Orders to ${entry} will then be charged at the "Above 500 km" rate.`, { title: "Remove " + entry + "?", okLabel: "Remove", danger: true }))) return;
          save(id, { pincodes: zone(id).pincodes.filter((e) => e !== entry) });
          draw();
        }));
      });
    };
    draw();
  },
};

export { ZONES, zoneForPincode };
