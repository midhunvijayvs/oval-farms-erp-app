// Search-as-you-type dropdown: type a few letters and pick from the matching list.
// Used for the customer and the products on an order. Options: { value, label, sub, img, ic }.
import { esc } from "./util.js";
import { icon } from "./icons.js";

const thumbHtml = (o) => (o && o.img ? `<img src="${esc(o.img)}" alt="" loading="lazy">` : `<span class="combo-ph">${icon((o && o.ic) || "box")}</span>`);

// The field. `selected` is the chosen option (or null).
export function comboHtml({ attr = "", selected = null, placeholder = "Type to search…", thumbs = false, disabled = false } = {}) {
  return `<div class="combo ${thumbs ? "combo-thumbs" : ""}" ${attr}>
    ${thumbs ? `<span class="combo-sel">${selected ? thumbHtml(selected) : ""}</span>` : ""}
    <input type="text" class="combo-input" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" value="${esc(selected ? selected.label : "")}" ${disabled ? "disabled" : ""} role="combobox" aria-expanded="false">
    <span class="combo-caret">${icon("chevronDown")}</span>
    <div class="combo-list" role="listbox" hidden></div>
  </div>`;
}

// Best matches first: names starting with the text, then any word starting with it, then anywhere.
export function rank(options, q) {
  q = q.trim().toLowerCase();
  if (!q) return options;
  const scored = [];
  for (const o of options) {
    const label = String(o.label || "").toLowerCase();
    const all = label + " " + String(o.sub || "").toLowerCase();
    const s = label.startsWith(q) ? 0 : all.split(/[\s·–(),/-]+/).some((w) => w.startsWith(q)) ? 1 : all.includes(q) ? 2 : -1;
    if (s >= 0) scored.push([s, o]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

// options: array, or a function returning one. onPick(option) runs when a row is chosen.
export function bindCombo(wrap, { options, onPick, thumbs = false, empty = "No matches", limit = 60 }) {
  const input = wrap.querySelector(".combo-input");
  const box = wrap.querySelector(".combo-list");
  const all = () => (typeof options === "function" ? options() : options);
  const original = input.value;
  let shown = [], active = 0;

  const draw = () => {
    shown = rank(all(), input.value === original ? "" : input.value).slice(0, limit);
    active = Math.min(active, Math.max(0, shown.length - 1));
    box.innerHTML = shown.length ? shown.map((o, i) => `<div class="combo-opt ${i === active ? "on" : ""} ${o.group ? "combo-group" : ""}" role="option" data-i="${i}">
        ${thumbs ? thumbHtml(o) : ""}<span class="combo-txt"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>
      </div>`).join("") : `<div class="combo-none">${esc(empty)}</div>`;
  };
  const open = () => { draw(); box.hidden = false; input.setAttribute("aria-expanded", "true"); };
  const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const pick = (o) => { close(); input.value = o.label; onPick(o); };
  const moveTo = (i) => {
    active = Math.max(0, Math.min(shown.length - 1, i));
    box.querySelectorAll(".combo-opt").forEach((el, j) => el.classList.toggle("on", j === active));
    const el = box.querySelector(".combo-opt.on");
    if (el) el.scrollIntoView({ block: "nearest" });
  };

  input.addEventListener("focus", () => { input.select(); active = 0; open(); });
  input.addEventListener("click", () => { if (box.hidden) open(); });
  input.addEventListener("input", () => { active = 0; open(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (box.hidden) open(); else moveTo(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveTo(active - 1); }
    else if (e.key === "Enter") { if (!box.hidden && shown[active]) { e.preventDefault(); pick(shown[active]); } }
    else if (e.key === "Escape") { if (!box.hidden) { e.stopPropagation(); close(); input.value = original; } }
  });
  // Leaving without choosing puts the current choice back.
  input.addEventListener("blur", () => setTimeout(() => { close(); if (document.activeElement !== input) input.value = original; }, 150));
  // mousedown keeps the focus in the input, so blur doesn't close the list first
  box.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const el = e.target.closest(".combo-opt");
    if (el) pick(shown[+el.dataset.i]);
  });
  wrap.querySelector(".combo-caret").addEventListener("mousedown", (e) => { e.preventDefault(); if (box.hidden) input.focus(); else close(); });
}
