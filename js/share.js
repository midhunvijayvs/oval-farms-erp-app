// Pictures for WhatsApp: draws a simple, always-light sheet (title, text, tables, totals) on a
// canvas, saves it as a JPG and hands it to WhatsApp.
// WhatsApp has no way for a web page to attach a picture to a chat by itself, so:
//  - on a phone, the share sheet opens with the JPG; tap WhatsApp, then the chat;
//  - on a computer, the JPG is downloaded and copied, and WhatsApp opens (in the chat with the
//    customer when there is a number); paste it with Ctrl+V.

const W = 1080, PAD = 56;
const FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const C = { ink: "#12141c", ink2: "#3c4250", muted: "#6b7280", brand: "#1f9a0c", brandInk: "#0f4f05", soft: "#e9f6e4", line: "#e3e8de", zebra: "#f8faf6", danger: "#c0392b", bg: "#ffffff" };

function painter(ctx, dry) {
  const p = {
    W, PAD, y: PAD, inner: W - PAD * 2,
    font(size, weight = 400) { ctx.font = `${weight} ${size}px ${FONT}`; },
    wrap(text, width) {
      const out = [];
      for (const para of String(text ?? "").split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
          const t = line ? line + " " + word : word;
          if (ctx.measureText(t).width <= width || !line) line = t;
          else { out.push(line); line = word; }
        }
        out.push(line);
      }
      return out;
    },
    // A paragraph at the cursor. Returns its height.
    text(str, { size = 26, weight = 400, color = C.ink, x = PAD, width = p.inner, align = "left", lh = 1.35, move = true } = {}) {
      p.font(size, weight);
      const lines = p.wrap(str, width);
      const h = lines.length * size * lh;
      if (!dry) {
        ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.textAlign = align;
        const ax = align === "right" ? x + width : align === "center" ? x + width / 2 : x;
        lines.forEach((l, i) => ctx.fillText(l, ax, p.y + i * size * lh));
        ctx.textAlign = "left";
      }
      if (move) p.y += h;
      return h;
    },
    space(n) { p.y += n; },
    rule(color = C.line, wgt = 2) { if (!dry) { ctx.fillStyle = color; ctx.fillRect(PAD, p.y, p.inner, wgt); } p.y += wgt; },
    rect(x, y, w, h, color) { if (!dry) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); } },
    image(img, x, y, w, h) { if (!dry && img) ctx.drawImage(img, x, y, w, h); },
    // cols: [{ label, w (share of the width), align }]; rows: arrays of strings; foot: one row, bold
    table(cols, rows, { foot = null, size = 24 } = {}) {
      const total = cols.reduce((t, c) => t + c.w, 0);
      const xs = []; let x = PAD;
      for (const c of cols) { const w = (c.w / total) * p.inner; xs.push({ x, w }); x += w; }
      const cellPad = 12;
      const row = (cells, { bg, weight = 400, color = C.ink, sz = size } = {}) => {
        p.font(sz, weight);
        const wrapped = cells.map((v, i) => p.wrap(v, xs[i].w - cellPad * 2));
        const h = Math.max(...wrapped.map((l) => l.length)) * sz * 1.3 + cellPad * 2;
        if (bg) p.rect(PAD, p.y, p.inner, h, bg);
        if (!dry) {
          ctx.fillStyle = color; ctx.textBaseline = "top";
          wrapped.forEach((lines, i) => {
            const c = cols[i], { x: cx, w } = xs[i];
            ctx.textAlign = c.align === "right" ? "right" : "left";
            const ax = c.align === "right" ? cx + w - cellPad : cx + cellPad;
            lines.forEach((l, j) => ctx.fillText(l, ax, p.y + cellPad + j * sz * 1.3));
          });
          ctx.textAlign = "left";
        }
        p.y += h;
      };
      row(cols.map((c) => c.label), { bg: C.soft, weight: 700, color: C.brandInk, sz: size - 2 });
      rows.forEach((r, i) => row(r, { bg: i % 2 ? C.zebra : null }));
      if (foot) { p.rule(C.ink2, 3); row(foot, { weight: 700 }); }
      p.rule();
    },
    // "Label ........ value" lines, right-aligned, for totals
    kv(label, value, { size = 26, weight = 400, color = C.ink, width = 520 } = {}) {
      const x = W - PAD - width;
      p.text(label, { size, weight, color, x, width, move: false });
      p.text(value, { size, weight, color, x, width, align: "right" });
      p.space(6);
    },
  };
  return p;
}

const logoCache = {};
export function loadImage(src) {
  if (!logoCache[src]) logoCache[src] = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return logoCache[src];
}

// draw(p) lays the sheet out; it runs once to measure and once to paint. Returns the canvas.
export async function drawSheet(draw) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
  const m = document.createElement("canvas").getContext("2d");
  const dryP = painter(m, true);
  await draw(dryP);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.ceil(dryP.y + PAD);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await draw(painter(ctx, false));
  return canvas;
}

// Logo, business name and a title on the right, used at the top of every sheet.
export async function sheetHeader(p, biz, title, sideLines = []) {
  const logo = await loadImage("assets/logo-farm.png");
  const top = p.y;
  p.image(logo, PAD, top, 96, 96);
  const tx = PAD + (logo ? 116 : 0), tw = 520;
  p.text(biz.name || "Oval Farms", { size: 38, weight: 800, color: C.brandInk, x: tx, width: tw });
  for (const l of [biz.address, [biz.phone && "Ph: " + biz.phone, biz.email].filter(Boolean).join(" · "), biz.gstin && "GSTIN: " + biz.gstin].filter(Boolean)) p.text(l, { size: 21, color: C.muted, x: tx, width: tw, lh: 1.3 });
  const leftEnd = Math.max(p.y, top + 96);
  p.y = top;
  const rx = W - PAD - 380;
  p.text(title, { size: 40, weight: 800, x: rx, width: 380, align: "right" });
  for (const l of sideLines) p.text(l, { size: 23, color: C.ink2, x: rx, width: 380, align: "right" });
  p.y = Math.max(p.y, leftEnd) + 26;
  p.rule(C.brand, 4);
  p.space(26);
}

const isPhone = () => window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 1024px)").matches;
const waNumber = (phone) => { const d = String(phone || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };

// Sends the picture to WhatsApp. phone: the chat to open on a computer (optional).
// Returns what happened: "shared" | "cancelled" | "pasted" | "downloaded".
export async function sendToWhatsApp(canvas, { filename, text = "", phone = "" }) {
  const jpg = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  const file = new File([jpg], filename, { type: "image/jpeg" });
  // Phones: the share sheet (pick WhatsApp, then the chat). Also on a computer when there is no
  // one chat to open and the system offers sharing.
  if ((isPhone() || !phone) && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(jpg);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  let copied = false;
  try {
    // Clipboards take PNG, not JPG
    const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    copied = true;
  } catch (e) { /* not allowed here; the downloaded file is still there */ }
  const n = waNumber(phone);
  window.open(n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return copied ? "pasted" : "downloaded";
}

export const SENT_MESSAGE = {
  shared: "Sent to WhatsApp",
  cancelled: "",
  pasted: "Picture saved and copied. Paste it in the WhatsApp chat with Ctrl+V",
  downloaded: "Picture saved to Downloads. Attach it in the WhatsApp chat",
};
