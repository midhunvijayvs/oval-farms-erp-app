// Small shared helpers: ids, dates, formatting, escaping.

// Random 20-character id, the same shape Firestore uses, so short numbers made from the first
// characters (like order numbers) don't repeat.
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function uid(prefix = "") {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ID_CHARS[b % ID_CHARS.length];
  return prefix + out;
}

export function nowISO() {
  return new Date().toISOString();
}

function pad(n) { return String(n).padStart(2, "0"); }

export function toDateStr(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function today() {
  return toDateStr(new Date());
}

export function addDays(dateStr, n) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

export function monthStart(dateStr = today()) {
  return dateStr.slice(0, 8) + "01";
}

export function monthEnd(dateStr = today()) {
  const d = new Date(dateStr.slice(0, 8) + "01T00:00:00");
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toDateStr(d);
}

// Indian financial year (April to March) containing the date.
export function fyStart(dateStr = today()) {
  const y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7);
  return (m >= 4 ? y : y - 1) + "-04-01";
}

export function inRange(date, from, to) {
  if (!date) return false;
  return (!from || date >= from) && (!to || date <= to);
}

const moneyFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function money(n, symbol = "₹") {
  n = Number(n) || 0;
  return (n < 0 ? "-" : "") + symbol + moneyFmt.format(Math.abs(n));
}

export function moneyShort(n, symbol = "₹") {
  n = Number(n) || 0;
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e7) return s + symbol + (a / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return s + symbol + (a / 1e5).toFixed(2) + " L";
  if (a >= 1e3) return s + symbol + (a / 1e3).toFixed(1) + "k";
  return s + symbol + a.toFixed(0);
}

export function num(n) {
  return numFmt.format(Number(n) || 0);
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(s) {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
}

export function fmtDateShort(s) {
  if (!s) return "";
  const [, m, d] = s.slice(0, 10).split("-");
  return `${+d} ${MONTHS[+m - 1]}`;
}

export function relTime(iso) {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return fmtDate(iso);
}

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function sum(arr, fn = (x) => x) {
  return arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
}

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function downloadFile(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function toCSV(headers, rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}
