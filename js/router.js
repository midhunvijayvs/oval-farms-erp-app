// Hash router: "#/sales/abc123/edit?x=1" -> view.render(container, { id, query }).
const routes = [];
let container = null;
let current = null;
let afterRoute = () => {};

export function route(pattern, view, opts = {}) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ pattern, re, keys, view, ...opts });
}

export function navigate(hash, replace = false) {
  if (replace) { history.replaceState(null, "", hash); render(); }
  else if (location.hash === hash) render();
  else location.hash = hash;
}

function parse() {
  const raw = location.hash.slice(1) || "/dashboard";
  const [path, qs] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(qs || ""));
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = { query };
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { r, params, path };
    }
  }
  return null;
}

export function render(fromData = false) {
  if (!container) return;
  const hit = parse();
  if (!hit) { location.hash = "#/dashboard"; return; }
  if (fromData && current && current.r === hit.r && hit.r.view.keepOnRemote) return;
  if (hit.r.allow && !hit.r.allow()) {
    container.innerHTML = `<div class="empty"><p>You don't have access to this page. Ask an admin to change your role.</p><a class="btn" href="#/dashboard">Go to dashboard</a></div>`;
    afterRoute(hit);
    return;
  }
  const sameRoute = current && current.path === hit.path;
  const scroll = sameRoute ? window.scrollY : 0;
  current = hit;
  try {
    hit.r.view.render(container, hit.params);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="empty"><p>Something went wrong showing this page.</p><pre class="small muted">${String(e && e.message)}</pre></div>`;
  }
  if (sameRoute) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  afterRoute(hit);
}

export function startRouter(el, onRoute) {
  container = el;
  afterRoute = onRoute || afterRoute;
  window.addEventListener("hashchange", () => render());
  render();
}

export function currentPath() { return current ? current.path : ""; }
