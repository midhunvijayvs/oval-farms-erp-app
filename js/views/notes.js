// Notes: quick-reference business information (recipes, instructions for farm workers, growing
// steps, useful contacts, research figures, sales routes…). Admins and Managers only: other roles
// can't open or even read them (firestore.rules). Each note can be sent to WhatsApp as text.
import { store } from "../store.js";
import { can } from "../session.js";
import { list } from "../schema.js";
import { esc, fmtDate } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast, confirmDialog, pageHead, emptyState, chip } from "../ui.js";
import { navigate } from "../router.js";

const st = { q: "", cat: "" };
const toMs = (v) => (v ? Date.parse(v) || 0 : 0);
const order = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || toMs(b.updatedAt) - toMs(a.updatedAt);
const all = () => store.all("notes").sort(order);

// Plain text with phone numbers and web links clickable.
function richText(text) {
  return esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(:])((?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})(?=$|[\s),.])/gm, (m, pre, ph) => `${pre}<a href="tel:${ph.replace(/[^\d+]/g, "")}">${ph}</a>`);
}

export const shareText = (n) => `*${n.title || "Note"}*\n\n${n.body || ""}`.trim();

export function shareNote(n) {
  window.open("https://wa.me/?text=" + encodeURIComponent(shareText(n)), "_blank", "noopener");
}

async function copyNote(n) {
  try { await navigator.clipboard.writeText(shareText(n)); toast("Note copied"); }
  catch (e) { toast("Couldn't copy here. Select the text and copy it.", "error"); }
}

export const notesView = {
  title: "Notes",
  render(root) {
    const notes = all();
    const cats = [...new Set([...list("noteCategories"), ...notes.map((n) => n.category).filter(Boolean)])];
    let rows = st.cat ? notes.filter((n) => n.category === st.cat) : notes;
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((n) => [n.title, n.category, n.body].join(" ").toLowerCase().includes(q));
    }
    const count = (c) => notes.filter((n) => n.category === c).length;
    root.innerHTML = `
      ${pageHead("Notes", "Recipes, instructions, contacts, research and routes for quick reference. Only Admins and Managers can see these.", `<button class="btn btn-primary new-btn" data-new>${icon("plus")}New note</button>`)}
      <div class="tabs list-tabs" role="tablist">
        <button class="tab ${!st.cat ? "on" : ""}" data-cat="">All <span class="tab-count">${notes.length}</span></button>
        ${cats.map((c) => `<button class="tab ${st.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)} <span class="tab-count">${count(c)}</span></button>`).join("")}
      </div>
      <div class="toolbar"><div class="search">${icon("search")}<input type="search" placeholder="Search notes…" value="${esc(st.q)}" data-q></div></div>
      ${rows.length ? `<div class="notes-grid">${rows.map((n) => `
        <article class="card note-card clickable" data-id="${esc(n.id)}">
          <div class="note-top">${n.pinned ? `<span class="note-pin" title="Pinned">★</span>` : ""}<h3>${esc(n.title || "Untitled")}</h3></div>
          <p class="note-preview">${esc(String(n.body || "").slice(0, 260))}</p>
          <div class="note-foot">${n.category ? chip(n.category, "info") : ""}<small class="muted">${n.updatedAt ? "Updated " + fmtDate(String(n.updatedAt).slice(0, 10)) : ""}</small>
            <button class="icon-btn note-wa" data-wa="${esc(n.id)}" title="Send to WhatsApp" aria-label="Send to WhatsApp">${icon("whatsapp")}</button></div>
        </article>`).join("")}</div>`
        : `<div class="card">${emptyState(notes.length ? "No notes match." : "No notes yet. Write down a recipe, instructions for the farm team, useful phone numbers or research results.", notes.length ? "" : `<button class="btn btn-primary" data-new>${icon("plus")}Write the first note</button>`)}</div>`}
      <button class="fab" data-new aria-label="New note">${icon("plus")}</button>`;

    const rr = () => this.render(root);
    root.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { st.cat = b.dataset.cat; rr(); }));
    const qi = root.querySelector("[data-q]");
    qi.addEventListener("input", (e) => { st.q = e.target.value; const p = e.target.selectionStart; rr(); const i = root.querySelector("[data-q]"); i.focus(); i.setSelectionRange(p, p); });
    root.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openNote(null, { category: st.cat }, (n) => navigate("#/notes/" + n.id))));
    root.querySelectorAll("[data-wa]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); shareNote(store.get("notes", b.dataset.wa)); }));
    root.querySelectorAll(".note-card").forEach((c) => c.addEventListener("click", () => navigate("#/notes/" + c.dataset.id)));
  },
};

export const noteView = {
  title: "Note",
  render(root, params) {
    const n = store.get("notes", params.id);
    if (!n) { root.innerHTML = emptyState("This note was not found. It may have been deleted.") + `<p class="center"><a class="btn" href="#/notes">Back to notes</a></p>`; return; }
    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/notes">${icon("back")}Notes</a>
        <h1>${n.pinned ? '<span class="note-pin">★</span> ' : ""}${esc(n.title || "Untitled")}</h1>
        <p class="muted">${n.category ? esc(n.category) + " · " : ""}${n.updatedAt ? "updated " + fmtDate(String(n.updatedAt).slice(0, 10)) : ""}${n.updatedBy ? " by " + esc(n.updatedBy) : ""}</p></div>
        <div class="page-actions">
          <button class="btn btn-primary" data-wa>${icon("whatsapp")}Send to WhatsApp</button>
          <button class="btn btn-ghost" data-copy>${icon("file")}Copy</button>
          <button class="btn btn-ghost" data-edit>${icon("edit")}Edit</button>
          ${can("delete") ? `<button class="btn btn-ghost btn-danger-text" data-del>${icon("trash")}Delete</button>` : ""}
        </div></div>
      <div class="card note-body">${richText(n.body || "") || '<span class="muted">Nothing written yet.</span>'}</div>`;
    root.querySelector("[data-wa]").addEventListener("click", () => shareNote(n));
    root.querySelector("[data-copy]").addEventListener("click", () => copyNote(n));
    root.querySelector("[data-edit]").addEventListener("click", () => openNote(n));
    const del = root.querySelector("[data-del]");
    if (del) del.addEventListener("click", async () => {
      if (!(await confirmDialog(`Delete the note "${n.title || "Untitled"}"?`, { okLabel: "Delete", danger: true }))) return;
      store.remove("notes", n.id);
      toast("Note deleted");
      navigate("#/notes", true);
    });
  },
};

export function openNote(existing, presets = {}, onSaved) {
  const r = existing ? { ...existing } : { title: "", category: presets.category || "", body: "", pinned: false };
  const cats = [...new Set([...list("noteCategories"), r.category].filter(Boolean))];
  openModal({
    title: existing ? "Edit note" : "New note",
    wide: true,
    body: `<div class="form-grid">
      <div class="field"><label>Title <span class="req">*</span></label><input name="title" value="${esc(r.title)}" placeholder="e.g. Mushroom pickle recipe, Hygiene rules, Taxi drivers"></div>
      <div class="field half"><label>Category</label><select name="category"><option value="">—</option>${cats.map((c) => `<option ${c === r.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <label class="check field half"><input type="checkbox" name="pinned" ${r.pinned ? "checked" : ""}> <span>Pin to the top</span></label>
      <div class="field"><label>Note</label><textarea name="body" rows="14" placeholder="Write it the way you'd send it on WhatsApp. Phone numbers and links become tappable.">${esc(r.body)}</textarea></div>
    </div>`,
    actions: [
      { label: "Cancel", cls: "btn-ghost" },
      { label: "Save", cls: "btn-primary", icon: "tick", onClick: ({ el }) => {
        const v = (k) => el.querySelector(`[name="${k}"]`);
        const title = v("title").value.trim().slice(0, 150);
        if (!title) { v("title").classList.add("invalid"); v("title").focus(); toast("Give the note a title", "error"); return true; }
        const saved = store.put("notes", { ...(existing ? { id: existing.id } : {}), title, category: v("category").value, pinned: v("pinned").checked, body: v("body").value.slice(0, 20000) });
        toast(existing ? "Note saved" : "Note added");
        if (onSaved) onSaved(saved);
      } },
    ],
    onMount: ({ el }) => { if (!existing) el.querySelector('[name="title"]').focus(); },
  });
}
