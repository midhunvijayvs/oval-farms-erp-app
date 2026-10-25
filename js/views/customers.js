// Customers: one list for people who signed up on ovalfarm.in (channel "online") and people added
// in the ERP ("offline"). Customers added here can be given an ovalfarm.in login straight away:
// email + temporary password, plus Firebase's free "set your password" email. Google sign-in with
// the same email lands on the same account.
import { store } from "../store.js";
import { session, can } from "../session.js";
import { esc, fmtDate } from "../util.js";
import { icon } from "../icons.js";
import { openModal, toast, chip } from "../ui.js";
import * as calc from "../calc.js";
import { createWebsiteAccount, sendSetupEmail, tempPassword } from "../firebase.js";

const cfg = window.OVAL_CONFIG || {};
const SHOP = () => cfg.SHOP_URL || "https://ovalfarm.in";
const LOGIN_LABEL = { invited: "Invited", active: "Registered" };
export const loginStatus = (c) => LOGIN_LABEL[c.accountStatus] || "No login";
const normEmail = (e) => String(e || "").trim().toLowerCase();

// "+91 98470 11223", "09847011223", "9847011223" -> "+919847011223" (matches Firebase phone sign-in)
export function phoneE164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 11 && d[0] === "0") return "+91" + d.slice(1);
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return d ? "+" + d : "";
}

// Makes the login and returns the fields to save on the customer. Throws with a plain message.
async function makeLogin(email) {
  if (session.mode === "demo") return { uid: "demo-" + Date.now(), password: tempPassword() };
  try { return await createWebsiteAccount(email); }
  catch (e) {
    if (e.code === "auth/email-already-in-use") throw new Error("This email already has an ovalfarm.in login. The customer was saved without a new login; when they sign in with Google using this email, it links to this record.");
    if (e.code === "auth/invalid-email") throw new Error("That email address isn't valid.");
    if (e.code === "auth/operation-not-allowed") throw new Error("Email and password sign-in is switched off in Firebase (Authentication > Sign-in method).");
    throw new Error("Couldn't create the login: " + (e.message || e));
  }
}

async function sendEmail(email) {
  if (session.mode === "demo") return true;
  try { await sendSetupEmail(email); return true; }
  catch (e) { toast("The set-password email couldn't be sent: " + (e.message || e), "error"); return false; }
}

function waText(c, password) {
  return [
    `Hi ${c.name || ""}, welcome to Oval Farms!`,
    `You can now order from us online at ${SHOP()}.`,
    `Sign in at ${SHOP()}/account/login with`,
    `Email: ${c.email}`,
    `Temporary password: ${password}`,
    `Or tap "Continue with Google" using the same email.`,
    `To choose your own password, tap "Forgot password" on the sign-in page.`,
  ].join("\n");
}

function waLink(c, password) {
  const d = String(c.phone || "").replace(/\D/g, "");
  const ph = d.length === 10 ? "91" + d : d;
  return `https://wa.me/${ph}?text=${encodeURIComponent(waText(c, password))}`;
}

function showCredentials(c, password, emailed) {
  openModal({
    title: "ovalfarm.in login created",
    body: `<p>${esc(c.name)} can now sign in on ovalfarm.in and order online.</p>
      <div class="cred"><div><span>Email</span><b>${esc(c.email)}</b></div><div><span>Temporary password</span><b data-pw>${esc(password)}</b></div></div>
      <p class="muted small">${emailed ? "We've emailed them a link to set their own password. " : ""}You can also send these details on WhatsApp. The password stays visible on the customer until they first sign in.</p>`,
    actions: [
      { label: "Copy", cls: "btn-ghost", icon: "link", onClick: async () => { try { await navigator.clipboard.writeText(waText(c, password)); toast("Copied"); } catch (e) { /* ignore */ } return true; } },
      ...(c.phone ? [{ label: "WhatsApp", cls: "btn-ghost", icon: "whatsapp", onClick: () => { window.open(waLink(c, password), "_blank"); return true; } }] : []),
      { label: "Done", cls: "btn-primary" },
    ],
  });
}

// Gives an existing customer a login. Used by the form's login panel.
async function addLogin(c) {
  const email = normEmail(c.email);
  if (!email) return toast("Add the customer's email first", "error");
  const other = store.all("customers").find((x) => x.id !== c.id && normEmail(x.email) === email);
  if (other) return toast(`${other.name} already uses this email`, "error");
  try {
    const { uid, password } = await makeLogin(email);
    store.put("customers", { id: c.id, uid, accountStatus: "invited", invitedAt: new Date().toISOString() });
    store.put("customerInvites", { id: c.id, email, tempPassword: password });
    const emailed = await sendEmail(email);
    showCredentials(store.get("customers", c.id), password, emailed);
  } catch (e) { toast(e.message, "error"); }
}

function loginPanel(c) {
  const inv = store.get("customerInvites", c.id);
  const status = loginStatus(c);
  let body;
  if (c.accountStatus === "active") body = `<p class="muted small">Signs in on ovalfarm.in${c.lastLoginAt ? ` · last signed in ${esc(fmtDate(c.lastLoginAt))}` : ""}. Their website orders appear under Orders.</p>`;
  else if (c.accountStatus === "invited") body = `<p class="muted small">Login created ${esc(fmtDate(c.invitedAt))}. Waiting for their first sign-in.</p>
      ${inv ? `<div class="cred"><div><span>Email</span><b>${esc(inv.email)}</b></div><div><span>Temporary password</span><b>${esc(inv.tempPassword)}</b></div></div>` : ""}
      ${can("write") ? `<div class="form-actions left">${inv && c.phone ? `<button class="btn btn-ghost" data-login-wa>${icon("whatsapp")}Send on WhatsApp</button>` : ""}<button class="btn btn-ghost" data-login-email>${icon("upload")}Email set-password link</button></div>` : ""}`;
  else body = `<p class="muted small">No ovalfarm.in login yet.${c.email ? "" : " Add an email to create one."}</p>
      ${can("write") && c.email ? `<div class="form-actions left"><button class="btn btn-ghost" data-login-create>${icon("key")}Create ovalfarm.in login</button></div>` : ""}`;
  return `<div class="form-extra login-panel"><div class="card-head"><h3>${icon("link")}Website login ${chip(status)}</h3></div>${body}</div>`;
}

export const customerHooks = {
  decorate: (r) => ({ ...r, _balance: calc.customerBalance(r.id), _login: loginStatus(r) }),
  defaults: () => ({ channel: "offline" }),
  formExtra: (r) => (r.id && store.get("customers", r.id) ? loginPanel(r) : ""),
  formMount: ({ el, rec, close }) => {
    const c = rec.id && store.get("customers", rec.id);
    if (!c) return;
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.addEventListener("click", fn); };
    on("[data-login-create]", async (e) => { e.target.disabled = true; close(); await addLogin(c); });
    on("[data-login-wa]", () => { const inv = store.get("customerInvites", c.id); if (inv) window.open(waLink(c, inv.tempPassword), "_blank"); });
    on("[data-login-email]", async (e) => { e.target.disabled = true; if (await sendEmail(normEmail(c.email))) toast("Set-password email sent to " + c.email); e.target.disabled = false; });
  },
  beforeSave: async (rec, { isNew, extra }) => {
    rec.email = normEmail(rec.email);
    rec.phoneE164 = phoneE164(rec.phone);
    if (rec.email) {
      const other = store.all("customers").find((x) => x.id !== rec.id && normEmail(x.email) === rec.email);
      if (other) { toast(`${other.name} already uses this email`, "error"); return null; }
    }
    if (!isNew) return rec;
    rec.channel = "offline";
    rec.uid = null;
    rec.accountStatus = "none";
    if (extra._createLogin && rec.email) {
      try {
        const { uid, password } = await makeLogin(rec.email);
        Object.assign(rec, { uid, accountStatus: "invited", invitedAt: new Date().toISOString() });
        extra._password = password;
      } catch (e) { toast(e.message, "error"); }
    } else if (extra._createLogin) toast("Saved without a website login: add an email to create one.");
    return rec;
  },
  afterSave: async (saved, prev, extra = {}) => {
    if (!extra._password) return;
    store.put("customerInvites", { id: saved.id, email: saved.email, tempPassword: extra._password });
    const emailed = extra._sendEmail ? await sendEmail(saved.email) : false;
    showCredentials(saved, extra._password, emailed);
  },
};
