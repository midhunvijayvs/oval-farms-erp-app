// Single-series column chart in SVG with a hover/tap tooltip.
import { esc } from "../util.js";

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// data: [{ label, value, tip }], fmt: axis value formatter
export function barChart(data, { height = 190, fmt = (v) => v, ariaLabel = "" } = {}) {
  const W = 640, H = height, padL = 46, padR = 8, padT = 10, padB = 26;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = W - padL - padR, ih = H - padT - padB;
  const step = iw / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(28, step - 2 - step * 0.25));
  const y = (v) => padT + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / 7);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(ariaLabel)}">`;
  for (const t of ticks) {
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
    svg += `<text x="${padL - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  data.forEach((d, i) => {
    const cx = padL + step * i + step / 2;
    const x = cx - bw / 2;
    const top = y(d.value), base = padT + ih;
    const hgt = base - top;
    if (d.value > 0) {
      const r = Math.min(4, hgt, bw / 2);
      svg += `<path class="bar" d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z"/>`;
    }
    svg += `<rect class="hit" x="${padL + step * i}" y="${padT}" width="${step}" height="${ih}" data-tip="${esc(d.tip || d.label + ": " + fmt(d.value))}"/>`;
    if (i % every === 0 || i === data.length - 1) svg += `<text x="${cx}" y="${H - 8}" class="axis" text-anchor="middle">${esc(d.label)}</text>`;
  });
  svg += `<line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" class="baseline"/></svg>`;
  return `<div class="chart" data-chart>${svg}<div class="chart-tip" hidden></div></div>`;
}

export function bindCharts(root) {
  root.querySelectorAll("[data-chart]").forEach((wrap) => {
    const tip = wrap.querySelector(".chart-tip");
    const show = (e) => {
      const hit = e.target.closest(".hit");
      if (!hit) return;
      wrap.querySelectorAll(".hit.on").forEach((h) => h.classList.remove("on"));
      hit.classList.add("on");
      tip.textContent = hit.dataset.tip;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect(), hr = hit.getBoundingClientRect();
      const left = Math.min(Math.max(hr.left - wr.left + hr.width / 2, 60), wr.width - 60);
      tip.style.left = left + "px";
    };
    wrap.addEventListener("mousemove", show);
    wrap.addEventListener("click", show);
    wrap.addEventListener("mouseleave", () => { tip.hidden = true; wrap.querySelectorAll(".hit.on").forEach((h) => h.classList.remove("on")); });
  });
}
